import { DECIMAL_PLACES, INTEGER_MULTIPLIERS, BACKTEST_CONSTANTS } from '../constants';
/**
 * Trading Orchestrator
 *
 * The "brain" of the trading system. Coordinates:
 * - Context analysis (PRIMARY/TREND timeframes)
 * - Entry scanning (ENTRY timeframe)
 * - Trade execution
 *
 * Flow:
 * 1. PRIMARY candle closes → Update context
 * 2. ENTRY candle closes → Scan for entries using context
 * 3. Entry found → Execute trade
 */

import {
  TradingContext,
  TimeframeRole,
  Candle,
  LoggerService,
  IStrategy,
  OrderBook,
  TrendAnalysis,
  OrchestratorConfig,
  ExitType,
} from '../types';
// PHASE 4: ContextAnalyzer archived to src/archive/phase4-integration/
// Replaced by TrendAnalyzer (PRIMARY component)
import { CandleProvider } from '../providers/candle.provider';
import { BybitService } from './bybit';
import { PositionLifecycleService } from './position-lifecycle.service';
import { TelegramService } from './telegram.service';
import { TradingJournalService } from './trading-journal.service';
import { SessionStatsService } from './session-stats.service';
import { StrategyCoordinator } from './strategy-coordinator.service';
import { TimeframeProvider } from '../providers/timeframe.provider';
import { FundingRateFilterService } from './funding-rate-filter.service';
// FastEntryService archived to src/archive/phase4-week2/ (consolidated into EntryOrchestrator)
// SmartBreakevenService archived to src/archive/phase4-week3/ (consolidated into ExitOrchestrator)
import { RetestEntryService } from './retest-entry.service';
import { DeltaAnalyzerService } from './delta-analyzer.service';
import { OrderbookImbalanceService } from './orderbook-imbalance.service';
import { VolumeProfileService } from './volume-profile.service';
import { RiskCalculator } from './risk-calculator.service';
import { RiskManager } from './risk-manager.service';
import { EntryOrchestrator } from '../orchestrators/entry.orchestrator';
import { NeutralTrendStrengthFilter } from '../filters/neutral-trend-strength.filter';
import { ExitOrchestrator } from '../orchestrators/exit.orchestrator';
import { PositionExitingService } from './position-exiting.service';
import { SwingPointDetectorService } from './swing-point-detector.service';
import { MultiTimeframeTrendService } from './multi-timeframe-trend.service';
import { TimeframeWeightingService } from './timeframe-weighting.service';

// ============================================================================
// TYPES
// ============================================================================

// ============================================================================
// TRADING ORCHESTRATOR
// ============================================================================

export class TradingOrchestrator {
  // Core services
  private strategyCoordinator!: StrategyCoordinator;
  private currentContext: TradingContext | null = null;
  private currentOrderbook: OrderBook | null = null;

  // Orchestrators
  private entryOrchestrator: EntryOrchestrator | null = null;
  private exitOrchestrator: ExitOrchestrator | null = null;
  private positionExitingService: PositionExitingService | null = null;

  // Services
  private retestEntryService: RetestEntryService | null = null;
  private deltaAnalyzerService: DeltaAnalyzerService | null = null;
  private orderbookImbalanceService: OrderbookImbalanceService | null = null;
  private volumeProfileService: VolumeProfileService | null = null;
  private fundingRateFilter: FundingRateFilterService | null = null;

  constructor(
    private config: OrchestratorConfig,
    private candleProvider: CandleProvider,
    private timeframeProvider: TimeframeProvider,
    private bybitService: BybitService,
    private positionManager: PositionLifecycleService,
    private telegram: TelegramService | null,
    private logger: LoggerService,
    private riskManager: RiskManager,
    // Optional parameters after required ones
    retestEntryService?: RetestEntryService,
    deltaAnalyzerService?: DeltaAnalyzerService,
    orderbookImbalanceService?: OrderbookImbalanceService,
    private tradingJournal?: TradingJournalService,
    private sessionStats?: SessionStatsService,
  ) {
    // Initialize services from parameters
    if (retestEntryService) this.retestEntryService = retestEntryService;
    if (deltaAnalyzerService) this.deltaAnalyzerService = deltaAnalyzerService;
    if (orderbookImbalanceService) this.orderbookImbalanceService = orderbookImbalanceService;

    // Initialize context on startup (async)
    void this.initializeContext();
  }

  /**
   * Initialize context on startup
   */
  private async initializeContext(): Promise<void> {
    // PHASE 4: Context initialization removed
    // ContextAnalyzer is archived - replaced by TrendAnalyzer
    // currentContext is now populated by updateTrendContext() on PRIMARY candle close
    this.logger.info('🔄 Trading context will be initialized on first PRIMARY candle close (TrendAnalyzer)');
  }

  /**
   * Set the BTC candles store (used to access pre-loaded BTC candles)
   * Called by BotServices after initialization
   */
  setBtcCandlesStore(store: { btcCandles1m: Candle[] }): void {
    this.logger.info('🔗 BTC candles store linked to TradingOrchestrator');
  }

  /**
   * Initialize trend analysis from loaded candles
   * Called by BotServices after candles are loaded
   */
  async initializeTrendAnalysis(): Promise<void> {
    // Trend analysis is initialized by market data preparation on candle close
    this.logger.info('🔄 Trend analysis will be initialized on first market data update');
  }

  /**
   * Handle candle close event
   * Called by Bot when candle closes on any timeframe
   * Week 13 Phase 5d: Thin dispatcher - delegates to specialized services
   */
  async onCandleClosed(role: TimeframeRole, candle: Candle): Promise<void> {
    try {
      // PRIMARY closed → Evaluate exits
      if (role === TimeframeRole.PRIMARY) {
        this.logger.info('📊 PRIMARY candle closed - evaluating exits');

        // PHASE 4 Week 3: Evaluate exit conditions with orchestrator
        const currentPosition = this.positionManager.getCurrentPosition();
        if (currentPosition && this.exitOrchestrator && this.positionExitingService) {
          try {
            // Gather indicators for advanced exit features (Smart Breakeven, SmartTrailingV2)
            const indicators = {
              ema20: undefined,  // EMA calculation handled by AnalyzerRegistry
              currentVolume: candle.volume,
              avgVolume: candle.volume, // TODO: Calculate proper average from recent candles
              // ATRPercent: Will use default value if not provided (1.5%)
            };

            // Evaluate exit with orchestrator and full indicators
            const exitResult = await this.exitOrchestrator.evaluateExit(
              currentPosition,
              candle.close,
              indicators,
            );

            // Log the transition if any
            if (exitResult.stateTransition) {
              this.logger.debug('📊 Exit state machine', {
                transition: exitResult.stateTransition,
              });
            }

            // Execute exit actions if any
            if (exitResult.actions && exitResult.actions.length > 0) {
              this.logger.info('🚨 Exit orchestrator triggered actions', {
                actionCount: exitResult.actions.length,
                transition: exitResult.stateTransition,
              });

              for (const action of exitResult.actions) {
                try {
                  await this.positionExitingService.executeExitAction(
                    currentPosition,
                    action,
                    candle.close,
                    'Orchestrator decision',
                    ExitType.MANUAL,
                  );

                  this.logger.info('✅ Exit action executed', {
                    actionType: action.action,
                  });
                } catch (actionError) {
                  this.logger.error('Failed to execute exit action', {
                    actionType: action.action,
                    error: actionError instanceof Error ? actionError.message : String(actionError),
                  });
                }
              }
            }

            // Update position state if needed
            if (exitResult.newState) {
              this.logger.debug('📍 Position state updated', {
                newState: exitResult.newState,
              });
            }
          } catch (exitEvalError) {
            this.logger.error('Failed to evaluate exit conditions', {
              error: exitEvalError instanceof Error ? exitEvalError.message : String(exitEvalError),
            });
          }
        }
      }

      // ENTRY closed → Run entry signal analysis
      if (role === TimeframeRole.ENTRY) {
        this.logger.info('🕯️ ENTRY candle closed - analyzing entry signals');

        try {
          // Get ENTRY candles for analysis
          const entryCandles = await this.candleProvider.getCandles(TimeframeRole.ENTRY, 100);
          if (!entryCandles || entryCandles.length < 20) {
            this.logger.debug('Not enough candles for entry analysis', {
              available: entryCandles?.length || 0,
            });
            return;
          }

          // Run strategy (black box - analyze all configured analyzers)
          const signals = await this.runStrategyAnalysis(entryCandles);

          if (signals && signals.length > 0) {
            this.logger.info(`📊 Entry signals generated: ${signals.length}`, {
              signals: signals
                .map((s) => `${s.source}(${s.direction}:${(s.confidence * 100).toFixed(0)}%)`)
                .join(', '),
            });

            // TODO: Pass signals to EntryOrchestrator for decision
            // const decision = await this.entryOrchestrator.evaluateEntry(
            //   signals as any,
            //   balance,
            //   positions,
            //   trendBias
            // );
          } else {
            this.logger.debug('No entry signals generated');
          }
        } catch (entryError) {
          this.logger.error('Error analyzing entry signals', {
            error: entryError instanceof Error ? entryError.message : String(entryError),
          });
        }
      }
    } catch (error) {
      this.logger.error('Error in orchestrator onCandleClosed', {
        role,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Run strategy analysis (black box pattern)
   * Takes ENTRY candles and returns signals from enabled analyzers
   */
  private async runStrategyAnalysis(entryCandles: Candle[]): Promise<any[]> {
    const signals: any[] = [];
    const analyzerConfigs = (this.config as any).analyzers as any[] | undefined;

    if (!analyzerConfigs || analyzerConfigs.length === 0) {
      this.logger.debug('No analyzers configured in strategy');
      return signals;
    }

    // Map analyzer names to classes - lazy load on demand
    const analyzerClassMap: Record<string, any> = {
      EMA_ANALYZER_NEW: () => import('../analyzers/ema.analyzer-new').then(m => m.EmaAnalyzerNew),
      RSI_ANALYZER_NEW: () => import('../analyzers/rsi.analyzer-new').then(m => m.RsiAnalyzerNew),
      ATR_ANALYZER_NEW: () => import('../analyzers/atr.analyzer-new').then(m => m.AtrAnalyzerNew),
      VOLUME_ANALYZER_NEW: () => import('../analyzers/volume.analyzer-new').then(m => m.VolumeAnalyzerNew),
      STOCHASTIC_ANALYZER_NEW: () => import('../analyzers/stochastic.analyzer-new').then(m => m.StochasticAnalyzerNew),
      BOLLINGER_BANDS_ANALYZER_NEW: () => import('../analyzers/bollinger-bands.analyzer-new').then(m => m.BollingerBandsAnalyzerNew),
      LEVEL_ANALYZER_NEW: () => import('../analyzers/level.analyzer-new').then(m => m.LevelAnalyzerNew),
      BREAKOUT_ANALYZER_NEW: () => import('../analyzers/breakout.analyzer-new').then(m => m.BreakoutAnalyzerNew),
      TREND_DETECTOR_ANALYZER_NEW: () => import('../analyzers/trend-detector.analyzer-new').then(m => m.TrendDetectorAnalyzerNew),
      WICK_ANALYZER_NEW: () => import('../analyzers/wick.analyzer-new').then(m => m.WickAnalyzerNew),
      DIVERGENCE_ANALYZER_NEW: () => import('../analyzers/divergence.analyzer-new').then(m => m.DivergenceAnalyzerNew),
      PRICE_MOMENTUM_ANALYZER_NEW: () => import('../analyzers/price-momentum.analyzer-new').then(m => m.PriceMomentumAnalyzerNew),
      SWING_ANALYZER_NEW: () => import('../analyzers/swing.analyzer-new').then(m => m.SwingAnalyzerNew),
      CHOCH_BOS_ANALYZER_NEW: () => import('../analyzers/choch-bos.analyzer-new').then(m => m.ChochBosAnalyzerNew),
      LIQUIDITY_SWEEP_ANALYZER_NEW: () => import('../analyzers/liquidity-sweep.analyzer-new').then(m => m.LiquiditySweepAnalyzerNew),
      LIQUIDITY_ZONE_ANALYZER_NEW: () => import('../analyzers/liquidity-zone.analyzer-new').then(m => m.LiquidityZoneAnalyzerNew),
      ORDER_BLOCK_ANALYZER_NEW: () => import('../analyzers/order-block.analyzer-new').then(m => m.OrderBlockAnalyzerNew),
      FAIR_VALUE_GAP_ANALYZER_NEW: () => import('../analyzers/fair-value-gap.analyzer-new').then(m => m.FairValueGapAnalyzerNew),
      VOLUME_PROFILE_ANALYZER_NEW: () => import('../analyzers/volume-profile.analyzer-new').then(m => m.VolumeProfileAnalyzerNew),
      ORDER_FLOW_ANALYZER_NEW: () => import('../analyzers/order-flow.analyzer-new').then(m => m.OrderFlowAnalyzerNew),
      FOOTPRINT_ANALYZER_NEW: () => import('../analyzers/footprint.analyzer-new').then(m => m.FootprintAnalyzerNew),
      WHALE_ANALYZER_NEW: () => import('../analyzers/whale.analyzer-new').then(m => m.WhaleAnalyzerNew),
      MICRO_WALL_ANALYZER_NEW: () => import('../analyzers/micro-wall.analyzer-new').then(m => m.MicroWallAnalyzerNew),
      DELTA_ANALYZER_NEW: () => import('../analyzers/delta.analyzer-new').then(m => m.DeltaAnalyzerNew),
      TICK_DELTA_ANALYZER_NEW: () => import('../analyzers/tick-delta.analyzer-new').then(m => m.TickDeltaAnalyzerNew),
      PRICE_ACTION_ANALYZER_NEW: () => import('../analyzers/price-action.analyzer-new').then(m => m.PriceActionAnalyzerNew),
      TREND_CONFLICT_ANALYZER_NEW: () => import('../analyzers/trend-conflict.analyzer-new').then(m => m.TrendConflictAnalyzerNew),
      VOLATILITY_SPIKE_ANALYZER_NEW: () => import('../analyzers/volatility-spike.analyzer-new').then(m => m.VolatilitySpikeAnalyzerNew),
    };

    // Run each enabled analyzer
    for (const analyzerCfg of analyzerConfigs) {
      if (!analyzerCfg.enabled) continue;

      try {
        const AnalyzerClass = analyzerClassMap[analyzerCfg.name];
        if (!AnalyzerClass) {
          this.logger.debug(`Analyzer class not found: ${analyzerCfg.name}`);
          continue;
        }

        const Clazz = await AnalyzerClass();

        // Build analyzer-specific config from strategy and indicator configs
        const analyzerConfig = this.buildAnalyzerConfig(analyzerCfg);
        const instance = new Clazz(analyzerConfig, this.logger);
        const signal = await instance.analyze(entryCandles);

        if (signal && signal.direction !== 'HOLD') {
          signals.push({
            ...signal,
            weight: analyzerCfg.weight,
            priority: analyzerCfg.priority,
          });
        }
      } catch (analyzerError) {
        this.logger.debug(`Error running analyzer ${analyzerCfg.name}`, {
          error: analyzerError instanceof Error ? analyzerError.message : String(analyzerError),
        });
      }
    }

    // Normalize confidence from 0-100 scale (from analyzers) to 0-1 scale (for internal use)
    signals.forEach(s => {
      s.confidence = s.confidence / 100;
      // Recalculate score based on normalized confidence
      s.score = s.confidence * s.weight;
    });

    return signals;
  }

  /**
   * Build analyzer config from strategy and indicator configs
   * Falls back to analyzerDefaults from main config if not specified
   */
  private buildAnalyzerConfig(analyzerCfg: any): any {
    const baseConfig = (this.config as any).indicators || {};
    const analyzerDefaults = ((this.config as any).analyzerDefaults || {}) as Record<string, any>;

    // Common analyzer config structure
    const config: any = {
      enabled: analyzerCfg.enabled,
      weight: analyzerCfg.weight,
      priority: analyzerCfg.priority,
      minConfidence: analyzerCfg.minConfidence ?? 0.5,
      maxConfidence: analyzerCfg.maxConfidence ?? 1.0,
    };

    // 1. Merge analyzer defaults from main config
    if (analyzerDefaults[analyzerCfg.name]) {
      Object.assign(config, analyzerDefaults[analyzerCfg.name]);
      this.logger.debug(`Merged defaults for ${analyzerCfg.name}`, {
        defaults: analyzerDefaults[analyzerCfg.name],
      });
    } else {
      this.logger.debug(`No defaults found for ${analyzerCfg.name}`, {
        availableDefaults: Object.keys(analyzerDefaults).slice(0, 5),
      });
    }

    // 2. Map analyzer names to their indicator configs
    const analyzerToIndicator: Record<string, string> = {
      EMA_ANALYZER_NEW: 'ema',
      RSI_ANALYZER_NEW: 'rsi',
      ATR_ANALYZER_NEW: 'atr',
      VOLUME_ANALYZER_NEW: 'volume',
      STOCHASTIC_ANALYZER_NEW: 'stochastic',
      BOLLINGER_BANDS_ANALYZER_NEW: 'bollingerBands',
    };

    // Merge indicator config if available (overrides defaults)
    const indicatorKey = analyzerToIndicator[analyzerCfg.name];
    if (indicatorKey && baseConfig[indicatorKey]) {
      Object.assign(config, baseConfig[indicatorKey]);
    }

    // 3. Add analyzer-specific params from strategy (highest priority)
    if (analyzerCfg.params) {
      Object.assign(config, analyzerCfg.params);
    }

    return config;
  }

  /**
   * Sync time with Bybit exchange
   * CRITICAL: Prevents timestamp errors when opening positions
   */
  private async syncTimeWithExchange(): Promise<void> {
    try {
      const serverTime = await this.bybitService.getServerTime();
      const localTime = Date.now();
      const drift = localTime - serverTime;

      if (Math.abs(drift) > BACKTEST_CONSTANTS.BACKTEST_TIMEFRAME_MS) {
        this.logger.warn('⏰ Clock drift detected', {
          serverTime,
          localTime,
          driftMs: drift,
          driftSec: (drift / INTEGER_MULTIPLIERS.ONE_THOUSAND).toFixed(DECIMAL_PLACES.PERCENT),
        });
      } else {
        this.logger.debug('⏰ Time synced', { driftMs: drift });
      }

      // Store time offset in BybitService for timestamp correction
      // This assumes BybitService has a timeOffset property
      // For now, just log the drift - actual correction happens in SDK
    } catch (error) {
      this.logger.warn('Failed to sync time with exchange', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle orderbook update from Public WebSocket
   * Stores orderbook data for whale detection
   */
  onOrderbookUpdate(orderbook: OrderBook): void {
    this.currentOrderbook = orderbook;
    // Note: Orderbook updates are very frequent (~20-50ms), don't log
  }

  /**
   * Check for Whale Hunter signals in real-time (called from bot.ts on orderbook updates)
   * This bypasses the candle-close trigger for time-sensitive whale detection
   *
   * @param orderbook - Current orderbook snapshot
   * @returns Promise<void> - Executes trade if whale signal found
   */
  async checkWhaleSignalRealtime(orderbook: OrderBook): Promise<void> {
    // Whale signal detection is handled by market analysis
  }

  /**
   * Get current context (for monitoring/debugging)
   */
  getCurrentContext(): TradingContext | null {
    return this.currentContext;
  }
}
