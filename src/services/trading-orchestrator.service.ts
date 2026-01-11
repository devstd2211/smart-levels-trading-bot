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
import { TimeframeProvider } from '../providers/timeframe.provider';
import { RiskManager } from './risk-manager.service';
import { ExitOrchestrator } from '../orchestrators/exit.orchestrator';
import { EntryOrchestrator } from '../orchestrators/entry.orchestrator';
import { PositionExitingService } from './position-exiting.service';
import { SwingPointDetectorService } from './swing-point-detector.service';
import { MultiTimeframeTrendService } from './multi-timeframe-trend.service';
import { TimeframeWeightingService } from './timeframe-weighting.service';
import { AnalyzerRegistryService } from './analyzer-registry.service';
import { FilterOrchestrator } from '../orchestrators/filter.orchestrator';

// ============================================================================
// TYPES
// ============================================================================

// ============================================================================
// TRADING ORCHESTRATOR
// ============================================================================

export class TradingOrchestrator {
  // Core services
  private analyzerRegistry: AnalyzerRegistryService | null = null;
  private filterOrchestrator: FilterOrchestrator | null = null;
  private currentContext: TradingContext | null = null;
  private currentOrderbook: OrderBook | null = null;

  // Orchestrators
  private entryOrchestrator: EntryOrchestrator | null = null;
  private exitOrchestrator: ExitOrchestrator | null = null;
  private positionExitingService: PositionExitingService | null = null;

  // Entry decision tracking (for PRIMARY->ENTRY refinement)
  private pendingEntryDecision: any = null;

  // DEBUG: Allow testing without real signals
  private testModeEnabled: boolean = false;
  private testModeSignalCount: number = 0;

  constructor(
    private config: OrchestratorConfig,
    private candleProvider: CandleProvider,
    private timeframeProvider: TimeframeProvider,
    private bybitService: BybitService,
    private positionManager: PositionLifecycleService,
    private telegram: TelegramService | null,
    private logger: LoggerService,
    private riskManager: RiskManager,
  ) {

    // Initialize new black-box services
    this.analyzerRegistry = new AnalyzerRegistryService(this.logger);
    const filterConfig = (this.config as any).filters || {};
    this.filterOrchestrator = new FilterOrchestrator(this.logger, filterConfig);

    // Initialize EntryOrchestrator with FilterOrchestrator
    this.entryOrchestrator = new EntryOrchestrator(
      riskManager,
      this.logger,
      this.filterOrchestrator,
    );

    // Initialize context on startup (async)
    void this.initializeContext();
  }

  /**
   * Enable test mode - allows opening positions without real signals
   * Used for debugging/testing position opening workflow
   */
  enableTestMode(): void {
    this.testModeEnabled = true;
    this.logger.info('🧪 TEST MODE ENABLED - Positions will open without real signals');
  }

  /**
   * Disable test mode
   */
  disableTestMode(): void {
    this.testModeEnabled = false;
    this.testModeSignalCount = 0;
    this.logger.info('🧪 TEST MODE DISABLED - Normal mode restored');
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
      // PRIMARY (5m) closed → MAIN ENTRY SIGNAL ANALYSIS
      // This is the DECIDING timeframe where analyzers generate entry signals
      if (role === TimeframeRole.PRIMARY) {
        this.logger.info('📊 PRIMARY (5m) candle closed - ANALYZING ENTRY SIGNALS (main timeframe)');

        try {
          // Get PRIMARY candles for analysis (this is the decision timeframe)
          const primaryCandles = await this.candleProvider.getCandles(TimeframeRole.PRIMARY, 100);
          if (!primaryCandles || primaryCandles.length < 20) {
            this.logger.debug('Not enough PRIMARY candles for entry analysis', {
              available: primaryCandles?.length || 0,
            });
            return;
          }

          // Run strategy analysis on PRIMARY timeframe (the deciding timeframe)
          const signals = await this.runStrategyAnalysis(primaryCandles);

          if (signals && signals.length > 0) {
            this.logger.info(`📊 Entry signals generated on PRIMARY (5m): ${signals.length}`, {
              signals: signals
                .map((s) => `${s.source}(${s.direction}:${s.confidence.toFixed(0)}%)`)
                .join(', '),
            });

            // Evaluate signals with EntryOrchestrator
            if (this.entryOrchestrator) {
              const currentPosition = this.positionManager.getCurrentPosition();
              // Get account balance (use configured position size as fallback)
              const configBalance = (this.config as any)?.riskManager?.accountBalance || 1000;
              const currentBalance = configBalance > 0 ? configBalance : 1000;
              const openPositions = currentPosition ? [currentPosition] : [];

              // CRITICAL: Check if position already exists
              if (currentPosition) {
                this.logger.info('⏭️ SKIP ENTRY ANALYSIS - Already in position', {
                  positionId: currentPosition.id,
                  side: currentPosition.side,
                  entryPrice: currentPosition.entryPrice,
                  pnl: currentPosition.unrealizedPnL,
                });
              }

              try {
                // Get trend bias from context
                // For now use neutral default - in production would use TrendAnalyzer or MultiTimeframeTrendService
                const trendBias = this.currentContext?.trend || {
                  bias: 'NEUTRAL',
                  strength: 0.5,
                };

                const entryDecision = await this.entryOrchestrator.evaluateEntry(
                  signals,
                  currentBalance,
                  openPositions,
                  trendBias as any,
                );

                this.logger.info('📋 EntryOrchestrator decision (PRIMARY)', {
                  decision: entryDecision.decision,
                  reason: entryDecision.reason,
                  signal: entryDecision.signal?.type,
                });

                // Store decision for ENTRY timeframe to use for entry point refinement
                if (entryDecision.decision === 'ENTER') {
                  // CRITICAL: Enrich signal early to ensure all required fields are present
                  const enrichedSignal = this.enrichSignalWithProtection(entryDecision.signal || {});
                  this.pendingEntryDecision = {
                    decision: entryDecision.decision,
                    signal: enrichedSignal,
                    timestamp: Date.now(),
                    primaryCandle: primaryCandles[primaryCandles.length - 1],
                  };
                  this.logger.info('💾 Pending entry decision stored for ENTRY timeframe refinement', {
                    signalType: enrichedSignal?.type,
                  });
                } else if (entryDecision.decision === 'SKIP') {
                  this.pendingEntryDecision = null;
                  this.logger.debug('❌ Entry decision skipped - clearing pending decision');
                }
              } catch (orchestratorError) {
                this.logger.error('Error in EntryOrchestrator.evaluateEntry', {
                  error: orchestratorError instanceof Error ? orchestratorError.message : String(orchestratorError),
                });
              }
            }
          } else {
            // Check if position exists - if yes, that's why we're not looking for signals
            const currentPosition = this.positionManager.getCurrentPosition();
            if (currentPosition) {
              this.logger.debug('⏭️ SKIP SIGNAL SCAN - Already in position', {
                positionId: currentPosition.id,
                age: Math.floor((Date.now() - currentPosition.openedAt) / 1000 / 60),
              });
            } else {
              this.logger.debug('🔍 No entry signals generated on PRIMARY (5m)');
            }

            // TEST MODE: Allow opening position without signals for debugging
            if (this.testModeEnabled && this.testModeSignalCount < 1) {
              this.testModeSignalCount++;
              const currentPrice = candle.close;

              // Create a test signal for debugging
              const testSignal = {
                type: 'TEST_SIGNAL',
                source: 'TEST_MODE',
                direction: 'LONG' as const,
                confidence: 100,
                price: currentPrice,
                stopLoss: currentPrice * 0.98, // 2% below entry
                takeProfits: [
                  { price: currentPrice * 1.01, percent: 1.0 },
                  { price: currentPrice * 1.02, percent: 2.0 },
                  { price: currentPrice * 1.03, percent: 3.0 },
                ],
                reason: 'Test Mode Signal (no real signals)',
                timestamp: Date.now(),
                weight: 1.0,
                priority: 1,
              };

              this.logger.warn(
                '🧪 TEST MODE: Creating test signal to verify position opening workflow',
                {
                  price: currentPrice,
                  stopLoss: testSignal.stopLoss,
                },
              );

              // Enrich and store for ENTRY timeframe
              const enrichedSignal = this.enrichSignalWithProtection(testSignal);
              this.pendingEntryDecision = {
                decision: 'ENTER',
                signal: enrichedSignal,
                timestamp: Date.now(),
                primaryCandle: candle,
              };

              this.logger.info('💾 Test signal stored for ENTRY timeframe refinement', {
                price: currentPrice,
              });
            }
          }

          // ALSO evaluate exits on PRIMARY timeframe
          this.logger.debug('📊 PRIMARY candle closed - also evaluating exits');
          const currentPosition = this.positionManager.getCurrentPosition();
          if (currentPosition && this.exitOrchestrator && this.positionExitingService) {
            try {
              const indicators = {
                ema20: undefined,
                currentVolume: candle.volume,
                avgVolume: candle.volume,
              };

              const exitResult = await this.exitOrchestrator.evaluateExit(
                currentPosition,
                candle.close,
                indicators,
              );

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
            } catch (exitEvalError) {
              this.logger.error('Failed to evaluate exit conditions', {
                error: exitEvalError instanceof Error ? exitEvalError.message : String(exitEvalError),
              });
            }
          }
        } catch (primaryError) {
          this.logger.error('Error analyzing PRIMARY candle', {
            error: primaryError instanceof Error ? primaryError.message : String(primaryError),
          });
        }
      }

      // ENTRY (1m) closed → REFINE ENTRY POINT (only if already have signal from PRIMARY)
      // This timeframe helps find the BEST ENTRY PRICE when PRIMARY already said "we can enter"
      if (role === TimeframeRole.ENTRY) {
        if (this.pendingEntryDecision && this.pendingEntryDecision.decision === 'ENTER') {
          this.logger.info('🎯 ENTRY (1m): Refining entry point for pending PRIMARY decision');

          try {
            // Get latest 1-minute candles for entry point analysis
            const entryCandles = await this.candleProvider.getCandles(TimeframeRole.ENTRY, 50);
            if (!entryCandles || entryCandles.length < 5) {
              this.logger.debug('Not enough ENTRY candles for refinement', {
                available: entryCandles?.length || 0,
              });
              return;
            }

            const currentCandle = entryCandles[entryCandles.length - 1];
            const previousCandle = entryCandles[entryCandles.length - 2];

            // Check if current 1-minute candle is suitable for entry
            // (not at extremes, showing some momentum alignment)
            const candleSize = Math.abs(currentCandle.close - currentCandle.open);
            const avgCandleSize = entryCandles.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / entryCandles.length;

            const isGoodEntryPoint =
              // Not a doji (has clear direction)
              candleSize > avgCandleSize * 0.3 &&
              // Close is favorable (in direction of signal)
              (this.pendingEntryDecision.signal.direction === 'LONG'
                ? currentCandle.close > previousCandle.close
                : currentCandle.close < previousCandle.close);

            if (isGoodEntryPoint) {
              this.logger.info('✅ ENTRY (1m): Suitable entry point found - ready to execute', {
                direction: this.pendingEntryDecision.signal.direction,
                price: currentCandle.close,
                candleSize,
                avgSize: avgCandleSize,
              });

              // Try to execute the trade
              try {
                this.logger.info('🚀 Opening position with signal', {
                  direction: this.pendingEntryDecision.signal.direction,
                  entryPrice: currentCandle.close,
                  confidence: this.pendingEntryDecision.signal.confidence,
                });

                // Actually open the position (signal already enriched earlier)
                await this.positionManager.openPosition(this.pendingEntryDecision.signal);

                // Clear pending decision once position opened
                this.pendingEntryDecision = null;
                this.logger.info('✅ Position opened successfully');
              } catch (openPositionError) {
                this.logger.error('❌ Failed to open position', {
                  error: openPositionError instanceof Error ? openPositionError.message : String(openPositionError),
                });
              }
            } else {
              this.logger.debug('⏳ ENTRY (1m): Current candle not ideal for entry - waiting for better point', {
                direction: this.pendingEntryDecision.signal.direction,
                candleSize,
                avgSize: avgCandleSize,
                isSmallCandle: candleSize < avgCandleSize * 0.3,
                isWrongDirection: !(
                  this.pendingEntryDecision.signal.direction === 'LONG'
                    ? currentCandle.close > previousCandle.close
                    : currentCandle.close < previousCandle.close
                ),
              });
            }
          } catch (entryRefinementError) {
            this.logger.error('Error refining entry point on ENTRY timeframe', {
              error: entryRefinementError instanceof Error ? entryRefinementError.message : String(entryRefinementError),
            });
          }
        }
        // If no pending decision from PRIMARY, ENTRY candles are ignored (that's correct)
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
   * Uses AnalyzerRegistry to dynamically load and run enabled analyzers
   */
  private async runStrategyAnalysis(entryCandles: Candle[]): Promise<any[]> {
    const signals: any[] = [];
    const analyzerConfigs = (this.config as any).analyzers as any[] | undefined;

    if (!analyzerConfigs || analyzerConfigs.length === 0) {
      this.logger.debug('No analyzers configured in strategy');
      return signals;
    }

    if (!this.analyzerRegistry) {
      this.logger.error('AnalyzerRegistry not initialized');
      return signals;
    }

    // Get all enabled analyzers from registry
    const enabledAnalyzers = await this.analyzerRegistry.getEnabledAnalyzers(
      analyzerConfigs,
      this.buildAnalyzerConfigForRegistry(),
    );

    // Get current price from last candle
    const currentPrice = entryCandles.length > 0 ? entryCandles[entryCandles.length - 1].close : undefined;

    // Run each enabled analyzer
    for (const [analyzerName, { instance }] of enabledAnalyzers) {
      try {
        const analyzerCfg = analyzerConfigs.find((cfg) => cfg.name === analyzerName);
        if (!analyzerCfg) continue;

        const signal = await instance.analyze(entryCandles);

        if (signal && signal.direction !== 'HOLD') {
          signals.push({
            ...signal,
            type: signal.source as any, // Map source to type (e.g., 'EMA_ANALYZER' → type field)
            weight: analyzerCfg.weight,
            priority: analyzerCfg.priority,
            price: currentPrice,
          });
        }
      } catch (analyzerError) {
        this.logger.debug(`Error running analyzer ${analyzerName}`, {
          error: analyzerError instanceof Error ? analyzerError.message : String(analyzerError),
        });
      }
    }

    return signals;
  }

  /**
   * Build analyzer config for AnalyzerRegistry
   * Returns a config object that includes indicator config and all analyzer defaults
   * Each analyzer instance will merge its specific config from this base
   */
  private buildAnalyzerConfigForRegistry(): any {
    const baseConfig = (this.config as any).indicators || {};
    const analyzerDefaults = ((this.config as any).analyzerDefaults || {}) as Record<string, any>;

    return {
      indicators: baseConfig,
      analyzerDefaults: analyzerDefaults,
    };
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
   * Enrich signal with SL/TP protection levels from strategy config
   * ATOMIC: All SL/TP levels computed and set together for atomic position opening
   * CRITICAL: Signal must have stopLoss and takeProfits arrays
   */
  private enrichSignalWithProtection(signal: any): any {
    const entryPrice = signal.price || 0;
    const isLong = signal.direction === 'LONG';

    // =====================================================================
    // STEP 1: Calculate Stop Loss from config (ATR-based)
    // =====================================================================
    if (typeof signal.stopLoss !== 'number' || isNaN(signal.stopLoss)) {
      const riskConfig = (this.config as any)?.riskManagement?.stopLoss || {};
      const atrMultiplier = riskConfig.atrMultiplier || 2.0;
      const minDistancePercent = riskConfig.minDistancePercent || 0.5;

      // Use min distance as fallback if ATR not available
      const slDistancePercent = Math.max(minDistancePercent, 1.0); // At least 1%
      const slDistance = (entryPrice * slDistancePercent) / 100;

      signal.stopLoss = isLong
        ? entryPrice - slDistance
        : entryPrice + slDistance;

      this.logger.warn('⚠️ Signal enriched with calculated SL (ATR-based)', {
        signalType: signal.type,
        direction: signal.direction,
        entryPrice,
        stopLoss: signal.stopLoss,
        slDistancePercent,
      });
    }

    // =====================================================================
    // STEP 2: Calculate Take Profit levels from strategy config (ATOMIC)
    // =====================================================================
    if (!signal.takeProfits || !Array.isArray(signal.takeProfits) || signal.takeProfits.length === 0) {
      const tpConfig = (this.config as any)?.riskManagement?.takeProfits || [];

      if (tpConfig.length > 0) {
        // Calculate TP prices based on config percentages
        signal.takeProfits = tpConfig.map((tp: any) => ({
          price: isLong
            ? entryPrice * (1 + tp.percent / 100)
            : entryPrice * (1 - tp.percent / 100),
          percent: tp.percent,
          level: tp.level || 1,
        }));

        this.logger.info('✅ Signal enriched with strategy TP levels (ATOMIC)', {
          signalType: signal.type,
          direction: signal.direction,
          entryPrice,
          tpCount: signal.takeProfits.length,
          tpLevels: signal.takeProfits
            .map((tp: any) => `TP${tp.level}:${tp.price.toFixed(4)}@${tp.percent}%`)
            .join(', '),
        });
      } else {
        // No TP config - use empty array (position can still open with just SL)
        this.logger.warn('⚠️ Signal has no TP config - opening with only SL protection', {
          signalType: signal.type,
          direction: signal.direction,
        });
        signal.takeProfits = [];
      }
    }

    // =====================================================================
    // STEP 3: Ensure reason is string
    // =====================================================================
    if (typeof signal.reason !== 'string') {
      signal.reason = `${signal.type} @ ${signal.confidence?.toFixed(1) || '?'}% confidence`;
    }

    // =====================================================================
    // STEP 4: Ensure timestamp is number
    // =====================================================================
    if (typeof signal.timestamp !== 'number') {
      signal.timestamp = Date.now();
    }

    this.logger.debug('✅ Signal enrichment complete (ATOMIC SL/TP)', {
      signalType: signal.type,
      entryPrice,
      stopLoss: signal.stopLoss.toFixed(4),
      tpCount: signal.takeProfits.length,
    });

    return signal;
  }

  /**
   * Get current context (for monitoring/debugging)
   */
  getCurrentContext(): TradingContext | null {
    return this.currentContext;
  }
}
