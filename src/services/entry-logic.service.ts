/**
 * Entry Logic Service (Week 13 Phase 5d Extract)
 *
 * Extracted from trading-orchestrator.service.ts onCandleClosed method
 * Responsible for the entire ENTRY candle scanning pipeline
 *
 * Responsibilities:
 * - Time synchronization with exchange
 * - Position status checks and BB trailing stop updates
 * - Retest entry detection
 * - Pending confirmation checks
 * - Market data preparation
 * - Flat market detection
 * - Signal collection and weighted voting
 * - Strategy coordinator evaluation
 * - Signal processing
 * - Entry confirmation and trade execution
 */

import {
  LoggerService,
  OrchestratorConfig,
  Candle,
  EntrySignal,
  SignalDirection,
  SignalType,
  TimeframeRole,
  TrendAnalysis,
  StrategyMarketData,
  BollingerBandsIndicator,
} from '../types';
import {
  DECIMAL_PLACES,
  PERCENT_MULTIPLIER,
  INTEGER_MULTIPLIERS,
} from '../constants';
import { PositionManagerService } from './position-manager.service';
import { CandleProvider } from '../providers/candle.provider';
import { MultiTimeframeEMAAnalyzer } from '../analyzers/multi-timeframe-ema.analyzer';
import { RetestEntryService } from './retest-entry.service';
import { MarketDataPreparationService } from './market-data-preparation.service';
import { ExternalAnalysisService } from './external-analysis.service';
import { AnalyzerRegistry } from './analyzer-registry.service';
import { StrategyCoordinator } from './strategy-coordinator.service';
import { SignalProcessingService } from './signal-processing.service';
import { TradeExecutionService } from './trade-execution.service';
import { BybitService } from './bybit';

/**
 * Entry Logic Service
 * Encapsulates all entry scanning and signal processing logic for ENTRY candle
 */
export class EntryLogicService {
  constructor(
    private config: OrchestratorConfig,
    private positionManager: PositionManagerService,
    private bollingerIndicator: BollingerBandsIndicator | undefined,
    private candleProvider: CandleProvider,
    private emaAnalyzer: MultiTimeframeEMAAnalyzer,
    private currentContext: any | null, // TradingContextService - provides getCurrentTrendAnalysis()
    private retestEntryService: RetestEntryService | null,
    private marketDataPreparationService: MarketDataPreparationService,
    private externalAnalysisService: any,
    private analyzerRegistry: AnalyzerRegistry,
    private strategyCoordinator: StrategyCoordinator,
    private signalProcessingService: SignalProcessingService,
    private tradeExecutionService: TradeExecutionService,
    private bybitService: BybitService,
    private logger: LoggerService,
  ) {}

  /**
   * Get current trend analysis dynamically from TradingContextService
   * This ensures we always have the latest trend, not a stale value from initialization
   */
  private getCurrentTrendAnalysis(): TrendAnalysis | null {
    if (!this.currentContext) {
      return null;
    }
    // TradingContextService provides getCurrentTrendAnalysis() method
    return this.currentContext.getCurrentTrendAnalysis?.();
  }

  /**
   * Main entry scanning pipeline for ENTRY candle
   */
  async scanForEntries(candle: Candle): Promise<void> {
    // 🕐 SYNC TIME before analysis (critical for preventing timestamp errors)
    try {
      await this.syncTimeWithExchange();
    } catch (error) {
      this.logger.warn('Time sync failed before analysis, continuing...', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.logger.info('🔍 ENTRY candle closed - scanning for entry');

    // Notify anti-flip service of new candle (for cooldown tracking)
    this.signalProcessingService.onNewCandle();

    // Check if already in position
    const currentPosition = this.positionManager.getCurrentPosition();
    if (currentPosition) {
      await this.handlePositionStatus(candle, currentPosition);
      return;
    }

    // Check pending confirmations
    const confirmedSignal = this.positionManager.checkPendingConfirmations(candle.close);
    if (confirmedSignal) {
      this.logger.info(`✅ Pending ${confirmedSignal.direction} confirmed - executing trade`);
      const entrySignal: EntrySignal = {
        shouldEnter: true,
        direction: confirmedSignal.direction,
        confidence: confirmedSignal.confidence,
        entryPrice: confirmedSignal.price,
        stopLoss: confirmedSignal.stopLoss,
        takeProfits: confirmedSignal.takeProfits,
        reason: confirmedSignal.reason + ' [CONFIRMED]',
        timestamp: confirmedSignal.timestamp,
      };
      // PHASE 6a: Execute with trend context for trend-aware filtering
      await this.executeTradeWithTrend(entrySignal, undefined);
      return;
    }

    // Prepare market data
    let marketData: StrategyMarketData | null = null;
    try {
      marketData = await this.marketDataPreparationService.prepareMarketData();
    } catch (error) {
      this.logger.warn('Failed to prepare market data', {
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (!marketData) {
      this.logger.warn('Failed to prepare market data, skipping entry scan');
      return;
    }

    // Detect flat market and calculate adaptive confidence threshold
    const flatResult = await this.detectFlatMarket();
    const minConfidence = this.calculateAdaptiveConfidenceThreshold(flatResult);

    // Collect signals from analyzers
    const analyzerSignals = await this.analyzerRegistry.collectSignals(marketData);

    // Evaluate strategies
    const strategySignals = await this.strategyCoordinator.evaluateStrategies(marketData);
    if (strategySignals && strategySignals.valid && strategySignals.signal) {
      const executedImmediately = await this.processStrategySignal(strategySignals, marketData);
      if (executedImmediately) {
        return;
      }
    }

    // Process signals through weighted voting
    // Get fresh trend analysis from TradingContextService (not stale from initialization)
    const trendAnalysis = this.getCurrentTrendAnalysis();
    const entrySignal = await this.signalProcessingService.processSignals(
      marketData,
      analyzerSignals,
      trendAnalysis,
      flatResult,
    );

    if (!entrySignal) {
      return; // No valid entry signal generated
    }

    // Handle entry confirmation (PHASE 1.3: pass flatResult for blocking)
    await this.handleEntryConfirmation(entrySignal, marketData, flatResult);
  }

  /**
   * Handle position status when already in position
   */
  private async handlePositionStatus(candle: Candle, currentPosition: any): Promise<void> {

    // Check retest entry
    if (this.retestEntryService && this.config.retestEntry?.enabled) {
      const zone = this.retestEntryService.getRetestZone(currentPosition.symbol);
      if (zone) {
        try {
          const entryCandles = await this.candleProvider.getCandles(TimeframeRole.ENTRY);
          const emaFast = await this.emaAnalyzer.calculate(TimeframeRole.ENTRY);
          const ema20 = emaFast?.fast ?? 0;

          const recentVolumes = entryCandles.slice(-INTEGER_MULTIPLIERS.TWENTY).map(c => c.volume);
          const avgVolume = recentVolumes.reduce((sum, v) => sum + v, 0) / recentVolumes.length;

          // Get senior TF trend (TREND1)
          const trend1Ema = await this.emaAnalyzer.calculate(TimeframeRole.TREND1);
          const seniorTFTrend = trend1Ema
            ? (trend1Ema.fast > trend1Ema.slow ? 'UP' : trend1Ema.fast < trend1Ema.slow ? 'DOWN' : 'NEUTRAL')
            : 'NEUTRAL';

          const retest = this.retestEntryService.checkRetest(
            currentPosition.symbol,
            candle.close,
            candle.volume,
            avgVolume,
            ema20,
            seniorTFTrend as 'UP' | 'DOWN' | 'NEUTRAL',
          );

          if (retest.shouldEnter && zone.originalSignal) {
            this.logger.info('✅ Retest entry triggered - NOT executing (position already open)', {
              symbol: currentPosition.symbol,
              price: candle.close,
              reason: retest.reason,
            });
            this.retestEntryService.clearZone(currentPosition.symbol);
          }
        } catch (error) {
          this.logger.warn('Failed to check retest entry', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    this.logger.info('Already in position, skipping entry scan', {
      positionId: currentPosition.id,
    });
  }

  /**
   * Detect flat market conditions
   */
  private async detectFlatMarket(): Promise<{ isFlat: boolean; confidence: number } | null> {
    if (!this.externalAnalysisService || !this.currentContext) {
      return null;
    }

    try {
      const primaryCandles = await this.candleProvider.getCandles(TimeframeRole.PRIMARY);
      const primaryEma = await this.emaAnalyzer.calculate(TimeframeRole.PRIMARY);

      if (primaryCandles.length > 0 && primaryEma) {
        return this.externalAnalysisService.detectFlatMarket(
          primaryCandles,
          this.currentContext,
          primaryEma.fast,
          primaryEma.slow,
        );
      }
    } catch (error) {
      this.logger.warn('Failed to detect flat market', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return null;
  }

  /**
   * Calculate adaptive confidence threshold based on market type
   */
  private calculateAdaptiveConfidenceThreshold(
    flatResult: { isFlat: boolean; confidence: number } | null,
  ): number {
    const minConfidenceValue = flatResult?.isFlat && this.config.weightMatrix?.minConfidenceFlat
      ? this.config.weightMatrix.minConfidenceFlat
      : this.config.weightMatrix?.minConfidenceToEnter || 50;

    const minConfidence = minConfidenceValue / PERCENT_MULTIPLIER;

    this.logger.info('🎯 Adaptive Confidence Threshold', {
      marketType: flatResult?.isFlat ? 'FLAT' : 'TRENDING',
      flatConfidence: flatResult?.confidence.toFixed(1) + '%',
      minRequired: minConfidenceValue + '%',
      source: flatResult?.isFlat ? 'minConfidenceFlat' : 'minConfidenceToEnter',
    });

    return minConfidence;
  }

  /**
   * Process strategy signal
   * @returns true if executed immediately, false if blocked or declined
   */
  private async processStrategySignal(
    strategySignals: any,
    marketData: StrategyMarketData,
  ): Promise<boolean> {
    this.logger.info('🎯 Strategy Signal Generated', {
      strategy: strategySignals.strategyName,
      direction: strategySignals.signal.direction,
      confidence: (strategySignals.signal.confidence * INTEGER_MULTIPLIERS.ONE_HUNDRED).toFixed(1) + '%',
      reason: strategySignals.reason,
    });

    // Check if strategy signal aligns with trend (get fresh trend analysis)
    const trendContext = this.getCurrentTrendAnalysis();
    if (trendContext) {
      const isRestricted = trendContext.restrictedDirections.includes(
        strategySignals.signal.direction
      );
      if (isRestricted) {
        this.logger.warn('🚫 Strategy signal BLOCKED by trend alignment', {
          signal: strategySignals.signal.direction,
          trend: trendContext.bias,
          reason: `${strategySignals.signal.direction} blocked in ${trendContext.bias} trend`,
        });
        return false; // Continue to weighted voting
      }
    }

    // Strategy signal is trend-aligned or no trend available - execute
    const entrySignal: EntrySignal = {
      shouldEnter: true,
      direction: strategySignals.signal.direction,
      confidence: strategySignals.signal.confidence,
      entryPrice: strategySignals.signal.price,
      stopLoss: strategySignals.signal.stopLoss,
      takeProfits: strategySignals.signal.takeProfits,
      reason: strategySignals.reason || 'Strategy Signal',
      timestamp: strategySignals.signal.timestamp || Date.now(),
      strategyName: strategySignals.strategyName,
    };
    // PHASE 6a: Execute with trend context for trend-aware filtering
    await this.executeTradeWithTrend(entrySignal, marketData);
    return true; // Executed immediately
  }

  /**
   * Handle entry confirmation (pending or immediate execution)
   */
  private async handleEntryConfirmation(
    entrySignal: EntrySignal,
    marketData: StrategyMarketData,
    flatMarketAnalysis?: { isFlat: boolean; confidence: number } | null,
  ): Promise<void> {
    const needsConfirmation = this.positionManager.isConfirmationEnabled(entrySignal.direction);
    const keyLevel = entrySignal.entryPrice;

    if (needsConfirmation) {
      const levelType = entrySignal.direction === SignalDirection.LONG ? 'support' : 'resistance';

      this.logger.info(`⏳ ${entrySignal.direction} signal detected - adding to pending queue for candle confirmation`, {
        direction: entrySignal.direction,
        [`${levelType}Level`]: keyLevel.toFixed(DECIMAL_PLACES.PRICE),
        currentPrice: entrySignal.entryPrice.toFixed(DECIMAL_PLACES.PRICE),
      });

      // Create a signal for pending queue
      const pendingSignal = {
        direction: entrySignal.direction,
        type: SignalType.LEVEL_BASED,
        confidence: entrySignal.confidence,
        price: entrySignal.entryPrice,
        stopLoss: entrySignal.stopLoss,
        takeProfits: entrySignal.takeProfits,
        reason: entrySignal.reason,
        timestamp: entrySignal.timestamp,
        marketData: {
          rsi: marketData.rsi,
          rsiTrend1: marketData.rsiTrend1,
          ema20: marketData.ema.fast,
          ema50: marketData.ema.slow,
          atr: marketData.atr || 1.0,
          volumeRatio: 1.0,
          swingHighsCount: 0,
          swingLowsCount: 0,
          trend: marketData.trend,
          nearestLevel: keyLevel,
        },
      };

      const pendingId = this.positionManager.addPendingSignal(pendingSignal, keyLevel);

      const confirmCondition = entrySignal.direction === SignalDirection.LONG
        ? 'Next 1m candle close above support'
        : 'Next 1m candle close below resistance';

      this.logger.info(`⏳ ${entrySignal.direction} signal added to pending queue`, {
        pendingId,
        direction: entrySignal.direction,
        [`${levelType}Level`]: keyLevel.toFixed(DECIMAL_PLACES.PRICE),
        waitingFor: confirmCondition,
      });

      return;
    }

    // Execute trade immediately (confirmation disabled)
    this.logger.info(`⚡ ${entrySignal.direction} entering immediately (confirmation disabled)`);
    // PHASE 6a: Execute with trend context for trend-aware filtering
    // PHASE 1.3: Include flat market analysis for entry blocking
    await this.executeTradeWithTrend(entrySignal, marketData, flatMarketAnalysis);
  }

  /**
   * Synchronize time with Bybit exchange
   */
  private async syncTimeWithExchange(): Promise<void> {
    try {
      const serverTime = await this.bybitService.getServerTime();
      const localTime = Date.now();
      const drift = localTime - serverTime;

      if (Math.abs(drift) > 5000) {
        this.logger.warn('⚠️ Large time drift detected', {
          drift: `${drift}ms`,
          serverTime,
          localTime,
          recommendation: 'Check system clock',
        });
      }
    } catch (error) {
      this.logger.error('Failed to sync time with exchange', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Helper method to execute trade with current trend context
   * Encapsulates trend-aware entry filtering for cleaner code
   * @param entrySignal - Entry signal to execute
   * @param marketData - Optional market data for session stats
   */
  private async executeTradeWithTrend(
    entrySignal: EntrySignal,
    marketData?: StrategyMarketData | undefined,
    flatMarketAnalysis?: { isFlat: boolean; confidence: number } | null,
  ): Promise<void> {
    const trendAnalysis = this.getCurrentTrendAnalysis();
    await this.tradeExecutionService.executeTrade(
      entrySignal,
      marketData,
      trendAnalysis,
      flatMarketAnalysis,
    );
  }
}
