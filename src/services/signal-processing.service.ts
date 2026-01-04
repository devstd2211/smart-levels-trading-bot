/**
 * Signal Processing Service (Week 13 Phase 4a Extract)
 *
 * Extracted from trading-orchestrator.service.ts
 * Responsible for signal collection, filtering, aggregation, and entry decision
 *
 * Responsibilities:
 * - Collect signals from AnalyzerRegistry
 * - Evaluate custom strategies from StrategyCoordinator
 * - Filter signals by trend alignment
 * - Aggregate signals using weighted voting
 * - Apply trend confirmation filtering
 * - Calculate risk and adjust for market conditions
 * - Check entry confirmation requirements
 * - Generate EntrySignal for trade execution
 */

import {
  LoggerService,
  TimeframeRole,
  TrendAnalysis,
  AnalyzerSignal,
  SignalDirection,
  StrategyMarketData,
  Signal,
  TakeProfit,
} from '../types';
import { StrategyCoordinator } from './strategy-coordinator.service';
import { TrendConfirmationService } from './trend-confirmation.service';
import { RiskCalculator, RiskCalculationResult } from './risk-calculator.service';
import { AntiFlipService } from './anti-flip.service';
import {
  DECIMAL_PLACES,
  INTEGER_MULTIPLIERS,
  PERCENT_MULTIPLIER,
  FIXED_EXIT_PERCENTAGES,
} from '../constants';

/**
 * Entry Signal interface
 * Represents a decision to enter a trade
 */
export interface EntrySignal {
  shouldEnter: boolean;
  direction: SignalDirection;
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfits: TakeProfit[];
  reason: string;
  timestamp: number;
  strategyName?: string;
}

/**
 * Aggregated signal result
 */
interface AggregatedSignalResult {
  direction: SignalDirection;
  confidence: number;
  totalScore: number;
  recommendedEntry: boolean;
  signals: AnalyzerSignal[];
  reasoning: string;
}

/**
 * Signal Processing Service
 *
 * Orchestrates the signal processing pipeline:
 * 1. Collect signals from all sources
 * 2. Filter by trend alignment
 * 3. Aggregate using weighted voting
 * 4. Apply confirmation filters
 * 5. Calculate risk/reward
 * 6. Generate entry signal
 */
export class SignalProcessingService {
  private antiFlipService: AntiFlipService;

  constructor(
    private strategyCoordinator: StrategyCoordinator,
    private trendConfirmationService: TrendConfirmationService | null,
    private riskCalculator: RiskCalculator,
    private logger: LoggerService,
    private config?: any, // OrchestratorConfig
  ) {
    // Initialize AntiFlipService with config
    const antiFlipConfig = this.config?.antiFlip || {};
    this.antiFlipService = new AntiFlipService(this.logger, {
      enabled: antiFlipConfig.enabled ?? true,
      cooldownCandles: antiFlipConfig.cooldownCandles ?? 3,
      cooldownMs: antiFlipConfig.cooldownMs ?? 300000,
      requiredConfirmationCandles: antiFlipConfig.requiredConfirmationCandles ?? 2,
      overrideConfidenceThreshold: antiFlipConfig.overrideConfidenceThreshold ?? 85,
      strongReversalRsiThreshold: antiFlipConfig.strongReversalRsiThreshold ?? 25,
    });
  }

  /**
   * Process market data and generate entry signal
   * @param marketData - Current market data with indicators
   * @param analyzerSignals - Signals from analyzer registry
   * @param trendAnalysis - Current trend analysis
   * @param flatResult - Flat market detection result
   * @returns EntrySignal if conditions met, null otherwise
   */
  async processSignals(
    marketData: StrategyMarketData,
    analyzerSignals: AnalyzerSignal[],
    trendAnalysis: TrendAnalysis | null,
    flatResult: { isFlat: boolean; confidence: number } | null,
  ): Promise<EntrySignal | null> {
    try {
      if (analyzerSignals.length === 0) {
        this.logger.warn('⚠️ No analyzer signals collected - all analyzers blocked or returned null');
        return null;
      }

      // CRITICAL PROTECTION: Block all signals until trend is determined
      // This prevents blind trading when trend analysis is not yet available
      if (trendAnalysis === null) {
        this.logger.warn(
          '🚨 BLOCKED: Trend analysis not yet available - no signals generated',
          {
            reason: 'Trend analyzer initializing - waiting for first PRIMARY (5min) candle close',
            signalsCollected: analyzerSignals.length,
            whenReady: '⏳ Will unblock when PRIMARY (5-minute) candle closes and TrendAnalyzer completes',
            estimatedWait: '~5 minutes from bot startup',
            nextCheck: 'On next PRIMARY candle close',
          },
        );
        return null;
      }

      // PHASE 4: Filter analyzer signals by trend alignment BEFORE aggregation
      const trendFilteredSignals = this.filterSignalsByTrend(analyzerSignals, trendAnalysis);

      if (trendFilteredSignals.length === 0) {
        this.logger.warn('⚠️ All analyzer signals filtered out by trend alignment', {
          trend: trendAnalysis?.bias,
          restricted: trendAnalysis?.restrictedDirections,
        });
        return null;
      }

      // Aggregate signals using weighted voting (with trend-filtered signals)
      const aggregatedResult = this.strategyCoordinator.aggregateSignals(trendFilteredSignals);

      // Create detailed analyzer participation list
      const participatingAnalyzers = aggregatedResult.signals.map((signal: any) => ({
        name: signal.source,
        direction: signal.direction,
        confidence: signal.confidence.toFixed(0) + '%',
        weight: signal.weight.toFixed(4),
      }));

      this.logger.info('📊 Weighted Voting Result (with PHASE 4 trend filter)', {
        direction: aggregatedResult.direction,
        trend: trendAnalysis?.bias || 'N/A',
        trendStrength: trendAnalysis
          ? (trendAnalysis.strength * 100).toFixed(1) + '%'
          : 'N/A',
        totalScore: (aggregatedResult.totalScore * INTEGER_MULTIPLIERS.ONE_HUNDRED).toFixed(1) + '%',
        confidence: aggregatedResult.confidence.toFixed(0) + '%',
        signalCount: aggregatedResult.signals.length,
        meetsThresholds: aggregatedResult.recommendedEntry,
        reasoning: aggregatedResult.reasoning,
      });

      // Log detailed analyzer participation
      this.logger.info('📊 Participating Analyzers in Weighted Voting', {
        analyzersCount: participatingAnalyzers.length,
        analyzers: participatingAnalyzers,
      });

      if (!aggregatedResult.recommendedEntry) {
        this.logger.info('❌ Weighted voting result does not meet entry thresholds', {
          minRequiredScore: (this.strategyCoordinator.getMinTotalScore() * INTEGER_MULTIPLIERS.ONE_HUNDRED).toFixed(1) + '%',
          minRequiredConfidence: this.strategyCoordinator.getMinConfidence() + '%',
          actualScore: (aggregatedResult.totalScore * INTEGER_MULTIPLIERS.ONE_HUNDRED).toFixed(1) + '%',
          actualConfidence: aggregatedResult.confidence.toFixed(0) + '%',
        });
        return null;
      }

      // Apply trend confirmation filtering
      let finalConfidence = aggregatedResult.confidence;
      if (this.trendConfirmationService && this.config?.trendConfirmation?.filterMode !== 'DISABLED') {
        const confirmResult = await this.applyTrendConfirmationFilter(
          aggregatedResult.direction,
          finalConfidence,
        );
        if (confirmResult === null) {
          return null; // Critical misalignment blocked
        }
        finalConfidence = confirmResult; // Confidence may be adjusted
      }

      // PHASE 6c: Detect timeframe conflicts and adjust confidence accordingly
      const conflictMultiplier = this.detectTimeframeConflict(trendAnalysis, aggregatedResult.direction);
      if (conflictMultiplier < 1.0) {
        finalConfidence *= conflictMultiplier;
        this.logger.info('📊 Confidence adjusted for timeframe conflict', {
          before: aggregatedResult.confidence.toFixed(1) + '%',
          after: finalConfidence.toFixed(1) + '%',
          multiplier: (conflictMultiplier * 100).toFixed(0) + '%',
        });
      }

      // Anti-Flip Protection: Check if signal direction flip is blocked
      const antiFlipCheck = this.antiFlipService.shouldBlockSignal(
        aggregatedResult.direction,
        finalConfidence,
        marketData.currentPrice,
        marketData.rsi,
        marketData.candles,
      );

      if (antiFlipCheck.blocked) {
        this.logger.warn('🚫 Signal blocked by Anti-Flip protection', {
          direction: aggregatedResult.direction,
          confidence: finalConfidence.toFixed(1) + '%',
          reason: antiFlipCheck.reason,
          cooldownState: this.antiFlipService.getState(),
        });
        return null;
      }

      // Calculate SL/TP using RiskCalculator
      const entryPrice = marketData.currentPrice;
      const atrPercent = marketData.atr || 1.0;

      const levelBasedConfig = this.config?.strategiesConfig?.levelBased;
      if (!levelBasedConfig?.stopLossAtrMultiplier) {
        this.logger.error('❌ stopLossAtrMultiplier not configured in strategies.levelBased');
        return null;
      }
      const slMultiplier = levelBasedConfig.stopLossAtrMultiplier;
      const slMultiplierLong = levelBasedConfig.stopLossAtrMultiplierLong;

      // Take profits from entryConfig (OrchestratorConfig structure)
      const entryConfigTPs = this.config?.entryConfig?.takeProfits;
      if (!entryConfigTPs || entryConfigTPs.length === 0) {
        this.logger.error('❌ No takeProfits configured in entryConfig');
        return null;
      }
      const tpConfigs = entryConfigTPs;

      const referenceLevel = entryPrice;

      const minSlDistancePercent = this.config?.riskManagement?.minStopLossPercent;
      if (!minSlDistancePercent) {
        this.logger.error('❌ minStopLossPercent not configured in riskManagement');
        return null;
      }

      const riskResult: RiskCalculationResult = this.riskCalculator.calculate({
        direction: aggregatedResult.direction,
        entryPrice,
        referenceLevel,
        atrPercent,
        slMultiplier,
        slMultiplierLong,
        minSlDistancePercent,
        takeProfitConfigs: tpConfigs,
        sessionBasedSL: this.config?.sessionBasedSL,
      });

      this.logger.info('💰 Risk Calculation Complete', {
        entryPrice: entryPrice.toFixed(DECIMAL_PLACES.PRICE),
        stopLoss: riskResult.stopLoss.toFixed(DECIMAL_PLACES.PRICE),
        stopLossPercent: riskResult.stopLossPercent.toFixed(DECIMAL_PLACES.PERCENT) + '%',
        tpCount: riskResult.takeProfits.length,
        atr: atrPercent.toFixed(DECIMAL_PLACES.PERCENT) + '%',
      });

      // Adjust TPs based on market conditions
      let finalTakeProfits = this.adjustTakeProfitsForMarketCondition(riskResult.takeProfits, flatResult);

      // Generate entry signal
      const entrySignal: EntrySignal = {
        shouldEnter: true,
        direction: aggregatedResult.direction,
        confidence: finalConfidence,
        entryPrice,
        stopLoss: riskResult.stopLoss,
        takeProfits: finalTakeProfits,
        reason: aggregatedResult.reasoning,
        timestamp: marketData.timestamp,
        strategyName: 'WeightedVoting',
      };

      // Record signal for anti-flip tracking
      this.antiFlipService.recordSignal(aggregatedResult.direction, entryPrice);

      return entrySignal;
    } catch (error) {
      this.logger.error('Error processing signals', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Filter analyzer signals by trend alignment
   * @param signals - Array of analyzer signals
   * @param trendAnalysis - Current trend analysis
   * @returns Filtered signals
   */
  private filterSignalsByTrend(
    signals: AnalyzerSignal[],
    trendAnalysis: TrendAnalysis | null,
  ): AnalyzerSignal[] {
    if (!trendAnalysis) {
      return signals;
    }

    const { restrictedDirections } = trendAnalysis;

    if (restrictedDirections.length === 0) {
      return signals;
    }

    const filtered = signals.filter((signal) => {
      const isRestricted = restrictedDirections.includes(signal.direction as SignalDirection);
      if (isRestricted) {
        this.logger.warn('🚫 Signal BLOCKED by trend alignment', {
          signal: signal.direction,
          trend: trendAnalysis.bias,
          reason: `${signal.direction} blocked in ${trendAnalysis.bias} trend`,
        });
      }
      return !isRestricted;
    });

    if (filtered.length < signals.length) {
      this.logger.info('🔀 Trend Alignment Filtering', {
        total: signals.length,
        filtered: filtered.length,
        blocked: signals.length - filtered.length,
        trend: trendAnalysis.bias,
      });
    }

    return filtered;
  }

  /**
   * Apply trend confirmation filtering to adjust confidence
   * @param direction - Signal direction
   * @param originalConfidence - Original confidence level
   * @returns Adjusted confidence or null if blocked
   */
  private async applyTrendConfirmationFilter(
    direction: SignalDirection,
    originalConfidence: number,
  ): Promise<number | null> {
    if (!this.trendConfirmationService) {
      return originalConfidence;
    }

    try {
      const trendConfirmation = await this.trendConfirmationService.confirmTrend(direction);
      const criticalScore = this.config?.trendConfirmation?.criticalMisalignmentScore ?? 30;
      const warningScore = this.config?.trendConfirmation?.warningMisalignmentScore ?? 60;

      this.logger.info('🔄 Trend Confirmation Analysis', {
        direction,
        alignmentScore: trendConfirmation.alignmentScore,
        reason: trendConfirmation.reason,
      });

      // BLOCK: Critical misalignment
      if (trendConfirmation.alignmentScore < criticalScore) {
        this.logger.error('❌ Signal BLOCKED by TrendConfirmation: Critical misalignment', {
          signal: direction,
          alignmentScore: trendConfirmation.alignmentScore,
          threshold: criticalScore,
          reason: trendConfirmation.reason,
        });
        return null;
      }

      // REDUCE: Warning misalignment
      if (trendConfirmation.alignmentScore < warningScore) {
        const reducedConfidence = Math.round(
          originalConfidence * (trendConfirmation.alignmentScore / INTEGER_MULTIPLIERS.ONE_HUNDRED)
        );

        this.logger.warn('⚠️ Signal confidence reduced by TrendConfirmation: Trend misalignment', {
          signal: direction,
          originalConfidence: originalConfidence.toFixed(0) + '%',
          reducedConfidence: reducedConfidence + '%',
          alignmentScore: trendConfirmation.alignmentScore,
          reason: trendConfirmation.reason,
        });

        // Check if reduced confidence still meets threshold
        if (reducedConfidence < this.strategyCoordinator.getMinConfidence()) {
          this.logger.info('❌ Signal REJECTED after TrendConfirmation reduction: Below confidence threshold', {
            signal: direction,
            reducedConfidence: reducedConfidence + '%',
            minRequired: this.strategyCoordinator.getMinConfidence() + '%',
          });
          return null;
        }

        return reducedConfidence;
      }

      // BOOST: Full alignment
      if (trendConfirmation.isAligned && trendConfirmation.confidenceBoost > 0) {
        const boostedConfidence = Math.min(
          INTEGER_MULTIPLIERS.ONE_HUNDRED,
          Math.round(originalConfidence + trendConfirmation.confidenceBoost),
        );

        this.logger.info('✅ Signal confidence BOOSTED by TrendConfirmation: Excellent trend alignment', {
          signal: direction,
          originalConfidence: originalConfidence.toFixed(0) + '%',
          boostedConfidence: boostedConfidence + '%',
          boost: trendConfirmation.confidenceBoost,
          alignmentScore: trendConfirmation.alignmentScore,
        });

        return boostedConfidence;
      }

      return originalConfidence;
    } catch (error) {
      this.logger.warn('Trend confirmation filtering failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return originalConfidence;
    }
  }

  /**
   * Adjust take profits based on market condition
   * @param takeProfits - Original take profit levels
   * @param flatResult - Flat market detection result
   * @returns Adjusted take profit levels
   */
  private adjustTakeProfitsForMarketCondition(
    takeProfits: TakeProfit[],
    flatResult: { isFlat: boolean; confidence: number } | null,
  ): TakeProfit[] {
    if (!flatResult) {
      return takeProfits;
    }

    if (flatResult.isFlat) {
      // FLAT MARKET: Adjust to single TP (100% close at TP1 price)
      const firstTP = takeProfits[0];
      const adjustedTP: TakeProfit[] = [{
        level: 1,
        price: firstTP.price,
        sizePercent: FIXED_EXIT_PERCENTAGES.FULL, // Close 100% on TP1
        percent: firstTP.percent,
        hit: false,
      }];

      this.logger.info('⚡ FLAT market - adjusted to single TP', {
        confidence: flatResult.confidence.toFixed(1) + '%',
        tpPrice: firstTP.price.toFixed(DECIMAL_PLACES.PRICE),
        tpPercent: firstTP.percent.toFixed(DECIMAL_PLACES.PERCENT) + '%',
      });

      return adjustedTP;
    }

    // TRENDING MARKET: Keep multi-TP strategy
    this.logger.info('📈 TRENDING market - keeping multi-TP strategy', {
      confidence: flatResult.confidence.toFixed(1) + '%',
      tpCount: takeProfits.length,
    });

    return takeProfits;
  }

  /**
   * PHASE 6c: Detect timeframe conflicts and adjust confidence
   * Check if lower timeframes conflict with higher timeframes
   * @param trendAnalysis - Trend analysis from multiple timeframes
   * @param direction - Current signal direction
   * @returns Confidence adjustment multiplier (0.7 = 30% reduction for conflict)
   */
  private detectTimeframeConflict(
    trendAnalysis: TrendAnalysis | null,
    direction: SignalDirection,
  ): number {
    if (!trendAnalysis) {
      return 1.0; // No conflict possible without trend analysis
    }

    // Extract bias from different timeframes
    // Note: TrendAnalysis structure has .bias field at root level
    // For multi-timeframe, we check if single-timeframe trend conflicts with direction

    const bias = trendAnalysis.bias; // BULLISH/BEARISH/NEUTRAL

    // No conflict if trend is neutral
    if (bias === 'NEUTRAL') {
      return 1.0;
    }

    // Check for directional mismatch
    // BULLISH trend + SHORT signal = conflicting (entering short in uptrend)
    // BEARISH trend + LONG signal = conflicting (entering long in downtrend)
    const isConflicting =
      (bias === 'BULLISH' && direction === SignalDirection.SHORT) ||
      (bias === 'BEARISH' && direction === SignalDirection.LONG);

    if (isConflicting) {
      this.logger.warn('⚠️ Timeframe conflict detected', {
        trendBias: bias,
        signalDirection: direction,
        action: 'Reducing confidence by 30%',
        confidence: 'Before adjustment: will be multiplied by 0.7',
      });
      return 0.7; // Reduce confidence by 30%
    }

    // No conflict - signal aligns with trend
    return 1.0;
  }

  /**
   * Notify anti-flip service of new candle (call on each candle close)
   */
  onNewCandle(): void {
    this.antiFlipService.onNewCandle();
  }

  /**
   * Reset anti-flip state (call when position is closed)
   */
  resetAntiFlip(): void {
    this.antiFlipService.reset();
  }

  /**
   * Get anti-flip service state
   */
  getAntiFlipState(): ReturnType<AntiFlipService['getState']> {
    return this.antiFlipService.getState();
  }
}
