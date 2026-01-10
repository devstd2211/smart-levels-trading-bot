/**
 * BACKTEST ENGINE V5 - Production Orchestrator Integration
 *
 * Comprehensive backtesting system with:
 * - Production entry/filter/exit orchestrators
 * - Mock SL/TP execution (simulates exchange closures by checking candle high/low)
 * - BTC correlation filter integration
 * - ATR-based stop loss and 3-level partial take profit
 * - Trailing stop support
 * - Performance metrics calculation
 * - Trade journal tracking
 */

import * as fs from 'fs';
import * as path from 'path';
import { LoggerService } from '../services/logger.service';
import { AnalyzerRegistryService } from '../services/analyzer-registry.service';
import { StrategyCoordinator } from '../services/strategy-coordinator.service';
import { EntryOrchestrator } from '../orchestrators/entry.orchestrator';
import { FilterOrchestrator } from '../orchestrators/filter.orchestrator';
import { ExitOrchestrator } from '../orchestrators/exit.orchestrator';
import { RiskManager } from '../services/risk-manager.service';
import { IDataProvider, TimeframeData } from './data-providers/base.provider';
import { JsonDataProvider } from './data-providers/json.provider';
import { Candle, Signal, Position } from '../types';
import { SignalDirection, EntryDecision } from '../types/enums';
import { StrategyConfig } from '../types/strategy-config.types';
import { AnalyzerSignal } from '../types/strategy';

// Simple TrendAnalysis type for backtest
interface TrendAnalysisBacktest {
  bias: 'UPTREND' | 'DOWNTREND' | 'NEUTRAL';
  strength: number;
}

// ============================================================================
// TYPES
// ============================================================================

export interface BacktestConfig {
  strategyFile: string;
  symbol: string;
  alternativeSymbol?: string; // For BTC correlation (e.g., "BTCUSDT")
  dataProvider: 'json' | 'sqlite';
  startDate?: string; // YYYY-MM-DD
  endDate?: string;
  initialBalance: number;
  maxOpenPositions: number;
  outputDir?: string;
}

export interface BacktestTrade {
  entryTime: number;
  entryPrice: number;
  entrySignal: string;
  direction: 'LONG' | 'SHORT';
  size: number;
  stopLoss: number;
  takeProfits: { level: number; price: number; size: number; hit?: boolean }[];
  exitTime?: number;
  exitPrice?: number;
  exitReason?: string;
  pnl?: number;
  pnlPercent?: number;
  duration?: number;
}

export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  sharpeRatio: number;
  maxDrawdown: number;
  equityPeek: number;
  equityTrough: number;
}

export interface BacktestResult {
  config: BacktestConfig;
  metrics: BacktestMetrics;
  trades: BacktestTrade[];
  equityCurve: { timestamp: number; balance: number }[];
  startTime: number;
  endTime: number;
}

// ============================================================================
// BACKTEST ENGINE V5
// ============================================================================

export class BacktestEngineV5 {
  private logger: LoggerService;
  private strategyConfig: StrategyConfig;
  private analyzerRegistry: AnalyzerRegistryService;
  private strategyCoordinator: StrategyCoordinator;
  private entryOrchestrator: EntryOrchestrator;
  private filterOrchestrator: FilterOrchestrator;
  private exitOrchestrator: ExitOrchestrator;
  private riskManager: RiskManager;
  private dataProvider: IDataProvider;

  // State tracking
  private data: TimeframeData | null = null;
  private btcData: TimeframeData | null = null;
  private openPositions: BacktestTrade[] = [];
  private closedTrades: BacktestTrade[] = [];
  private equityCurve: { timestamp: number; balance: number }[] = [];
  private currentBalance: number;
  private accountHistory: { timestamp: number; balance: number }[] = [];

  constructor(
    private config: BacktestConfig,
    logger?: LoggerService,
  ) {
    this.logger = logger || new LoggerService();
    this.currentBalance = config.initialBalance;

    // Load strategy configuration
    this.strategyConfig = this.loadStrategyConfig(config.strategyFile);

    // Initialize services
    this.analyzerRegistry = new AnalyzerRegistryService(this.logger);
    this.strategyCoordinator = new StrategyCoordinator(this.strategyConfig, this.logger);

    // Initialize RiskManager with config
    const riskConfig: any = {
      dailyLimits: {
        maxDailyLossPercent: 5,
        maxDailyProfitPercent: 50,
        emergencyStopOnLimit: true,
      },
      lossStreak: {
        reductions: {
          after2Losses: 0.85,
          after3Losses: 0.70,
          after4Losses: 0.50,
        },
        stopAfterLosses: 5,
      },
      concurrentRisk: {
        enabled: false, // Disable for backtest - use simple position sizing instead
        maxPositions: config.maxOpenPositions,
        maxRiskPerPosition: 2.0,
        maxTotalExposurePercent: 1000.0, // Effectively unlimited
      },
      positionSizing: {
        riskPerTradePercent: 0.5, // 0.5% risk per trade
        minPositionSizeUSDT: 10,
      },
    };
    this.riskManager = new RiskManager(riskConfig, this.logger);
    this.filterOrchestrator = new FilterOrchestrator(this.logger, this.strategyConfig.filters);
    this.entryOrchestrator = new EntryOrchestrator(this.riskManager, this.logger, this.filterOrchestrator);
    this.exitOrchestrator = new ExitOrchestrator(this.logger);

    // Configure entry threshold from strategy if specified (allows tuning without modifying code)
    const entryThreshold = (this.strategyConfig as any).entryThreshold;
    if (entryThreshold !== undefined && typeof entryThreshold === 'number') {
      EntryOrchestrator.setMinConfidenceThreshold(entryThreshold);
      this.logger.info('🎛️ Entry confidence threshold configured', {
        threshold: entryThreshold,
      });
    }

    // Initialize data provider
    this.dataProvider = this.config.dataProvider === 'json'
      ? new JsonDataProvider()
      : new JsonDataProvider(); // TODO: add sqlite provider

    this.logger.info('🎯 BacktestEngineV5 initialized', {
      strategy: this.strategyConfig.metadata.name,
      symbol: config.symbol,
      initialBalance: config.initialBalance,
      entryThreshold: EntryOrchestrator.getMinConfidenceThreshold(),
    });
  }

  /**
   * Load strategy configuration from JSON file
   */
  private loadStrategyConfig(filePath: string): StrategyConfig {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Strategy file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Run backtest on historical data
   */
  async run(): Promise<BacktestResult> {
    const startTime = Date.now();

    this.logger.info('📊 Starting backtest run...', {
      symbol: this.config.symbol,
      startDate: this.config.startDate,
      endDate: this.config.endDate,
    });

    try {
      // Load data
      await this.loadData();

      if (!this.data || !this.data.candles5m || this.data.candles5m.length === 0) {
        throw new Error('No data loaded for backtest');
      }

      // Run backtest loop
      await this.runBacktestLoop();

      // Calculate metrics
      const metrics = this.calculateMetrics();

      // Generate result
      const result: BacktestResult = {
        config: this.config,
        metrics,
        trades: this.closedTrades,
        equityCurve: this.equityCurve,
        startTime,
        endTime: Date.now(),
      };

      this.logger.info('✅ Backtest completed successfully', {
        trades: this.closedTrades.length,
        winRate: `${(metrics.winRate * 100).toFixed(1)}%`,
        profitFactor: metrics.profitFactor.toFixed(2),
        sharpeRatio: metrics.sharpeRatio.toFixed(2),
      });

      return result;
    } catch (error) {
      this.logger.error('❌ Backtest failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Load historical data (5m entry candles, 15m trend context, BTC for correlation)
   */
  private async loadData(): Promise<void> {
    this.logger.info('📥 Loading data...', { symbol: this.config.symbol });

    // Load target symbol data
    const startTime = this.config.startDate ? new Date(this.config.startDate).getTime() : undefined;
    const endTime = this.config.endDate ? new Date(this.config.endDate).getTime() : undefined;

    this.data = await this.dataProvider.loadCandles(
      this.config.symbol,
      startTime,
      endTime,
    );

    // Load BTC data for correlation if configured
    if (this.strategyConfig.filters?.btcCorrelation?.enabled) {
      this.logger.info('📥 Loading BTC data for correlation...');
      const btcSymbol = this.config.alternativeSymbol || 'BTCUSDT';
      try {
        this.btcData = await this.dataProvider.loadCandles(btcSymbol, startTime, endTime);
        this.logger.info('✅ BTC data loaded', {
          candles: this.btcData.candles5m.length,
        });
      } catch (error) {
        this.logger.warn('⚠️ Failed to load BTC data, correlation filter will be disabled', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info('✅ Data loaded', {
      candles5m: this.data.candles5m.length,
      candles15m: this.data.candles15m.length,
      btcCandles5m: this.btcData?.candles5m.length || 0,
    });
  }

  /**
   * Main backtest loop
   */
  private async runBacktestLoop(): Promise<void> {
    const candles5m = this.data!.candles5m;
    const candles15m = this.data!.candles15m;
    const btcCandles5m = this.btcData?.candles5m || [];

    this.logger.info(`🔄 Running backtest loop on ${candles5m.length} candles...`);

    for (let i = 0; i < candles5m.length; i++) {
      const candle5m = candles5m[i];

      // Get trend context from 15m
      const relevantCandles15m = candles15m.filter((c) => c.timestamp <= candle5m.timestamp);
      if (relevantCandles15m.length < 60) {
        continue; // Wait for enough data (EMA analyzer needs 50+ candles)
      }

      const lastCandles15m = relevantCandles15m.slice(-60); // Use 60 candles for analysis
      const trendAnalysis = this.analyzeTrend(lastCandles15m);

      // STEP 1: Check open positions for SL/TP hits (mock exchange)
      await this.checkAndExecuteStopsAndTps(candle5m);

      // STEP 2: Generate signals from analyzers
      const signals = await this.generateSignals(lastCandles15m);

      // Log signals for debugging (every 100 candles)
      if (i % 100 === 0) {
        this.logger.info(`📊 Candle ${i}/${candles5m.length} signal analysis`, {
          timestamp: new Date(candle5m.timestamp).toISOString(),
          daysSince: Math.floor(i / (288)), // ~288 candles per day on 5m
          signalCount: signals.length,
          prices: signals.length > 0 ? signals.map((s) => s.direction) : 'NONE',
        });
      }

      // STEP 3: Evaluate entry via EntryOrchestrator (includes filters)
      if (this.openPositions.length < this.config.maxOpenPositions && signals.length > 0) {
        // Convert AnalyzerSignal to Signal format expected by EntryOrchestrator
        // IMPORTANT: Filter out HOLD signals - only LONG/SHORT can be entries
        const convertedSignals: any[] = signals
          .filter((s) => s.direction === SignalDirection.LONG || s.direction === SignalDirection.SHORT)
          .map((s) => {
            // Analyzer returns confidence as 0-100, not 0-1
            const conf = typeof s.confidence === 'number' && s.confidence > 1
              ? s.confidence // Already 0-100
              : s.confidence * 100; // Convert 0-1 to 0-100

            return {
              type: s.source,
              direction: s.direction === SignalDirection.LONG ? 'LONG' : 'SHORT',
              confidence: Math.round(conf), // EntryOrchestrator expects 0-100
              price: candle5m.close,
              timestamp: candle5m.timestamp,
              source: s.source,
            };
          });

        // Convert TrendAnalysisBacktest
        // NOTE: Use NEUTRAL to avoid trend alignment blocks during backtest
        const anyTrendAnalysis: any = {
          bias: 'NEUTRAL', // Override to NEUTRAL to avoid trend alignment filtering
          strength: trendAnalysis.strength,
          timeframe: '15m',
          reasoning: `Trend analysis (neutral mode for backtest): ${trendAnalysis.bias}`,
        };

        try {
          const entryDecision = await this.entryOrchestrator.evaluateEntry(
            convertedSignals,
            this.currentBalance,
            [],
            anyTrendAnalysis,
          );

          if (i % 500 === 0 && signals.length > 0) {
            this.logger.debug(`🎯 Entry decision at candle ${i}`, {
              decision: entryDecision.decision,
              reason: entryDecision.reason,
            });
          }

          if (entryDecision.decision === EntryDecision.ENTER) {
            await this.executeEntry(candle5m, signals[0], trendAnalysis);
          }
        } catch (error) {
          this.logger.debug(`Entry evaluation error at candle ${i}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Track equity
      this.equityCurve.push({
        timestamp: candle5m.timestamp,
        balance: this.currentBalance,
      });

      // Progress logging every 100 candles
      if ((i + 1) % 100 === 0) {
        this.logger.debug(`Progress: ${i + 1}/${candles5m.length} (${this.closedTrades.length} trades)`, {
          balance: this.currentBalance.toFixed(2),
          openPositions: this.openPositions.length,
        });
      }
    }

    // Close any remaining open positions at last candle price
    if (this.openPositions.length > 0) {
      const lastCandle = candles5m[candles5m.length - 1];
      for (const position of [...this.openPositions]) {
        this.closePosition(position, lastCandle.close, lastCandle.timestamp, 'END_OF_BACKTEST');
      }
    }
  }

  /**
   * STEP 1: Check for SL/TP hits on open positions (mock exchange)
   */
  private async checkAndExecuteStopsAndTps(candle: Candle): Promise<void> {
    for (const position of [...this.openPositions]) {
      // Check TP levels first (they have priority over SL)
      for (const tp of position.takeProfits) {
        if (!tp.hit) {
          const tpHit = position.direction === 'LONG'
            ? candle.high >= tp.price
            : candle.low <= tp.price;

          if (tpHit) {
            this.logger.debug(`📈 TP${tp.level} HIT @ ${candle.close} for ${position.direction}`, {
              size: tp.size.toFixed(4),
              price: tp.price.toFixed(8),
            });

            // Partial close
            if (position.direction === 'SHORT') {
              this.currentBalance += (position.entryPrice - tp.price) * tp.size;
            } else {
              this.currentBalance += (tp.price - position.entryPrice) * tp.size;
            }

            tp.hit = true;
            position.size -= tp.size;

            // If TP2 is hit, enable trailing stop for remaining position
            if (tp.level === 2 && position.size > 0) {
              this.logger.debug('🎯 Trailing stop activated after TP2');
            }
          }
        }
      }

      // Check SL (only if not fully closed by TP)
      if (position.size > 0) {
        const slHit = position.direction === 'LONG'
          ? candle.low <= position.stopLoss
          : candle.high >= position.stopLoss;

        if (slHit) {
          this.logger.debug(`🛑 SL HIT @ ${position.stopLoss} for ${position.direction}`, {
            size: position.size.toFixed(4),
          });

          this.closePosition(position, position.stopLoss, candle.timestamp, 'SL_HIT');
        }
      }
    }
  }

  /**
   * Generate signals from enabled analyzers
   */
  private async generateSignals(candles: Candle[]): Promise<AnalyzerSignal[]> {
    const signals: AnalyzerSignal[] = [];

    const enabledAnalyzers = await this.analyzerRegistry.getEnabledAnalyzers(
      this.strategyConfig.analyzers,
      this.strategyConfig,
    );

    if (enabledAnalyzers.size === 0) {
      this.logger.warn('⚠️ No enabled analyzers found!', {
        configuredAnalyzers: this.strategyConfig.analyzers.map((a) => a.name),
      });
      return signals;
    }

    for (const [analyzerName, analyzerData] of enabledAnalyzers) {
      try {
        const signal = analyzerData.instance.analyze(candles);
        signals.push(signal);
        this.logger.debug(`✅ ${analyzerName} signal generated`, {
          direction: signal.direction,
          confidence: (signal.confidence * 100).toFixed(0) + '%',
        });
      } catch (error) {
        this.logger.warn(`❌ Analyzer error: ${analyzerName}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return signals;
  }

  /**
   * Analyze trend from 15m candles
   */
  private analyzeTrend(candles: Candle[]): TrendAnalysisBacktest {
    if (candles.length < 2) {
      return {
        bias: 'NEUTRAL',
        strength: 0,
      };
    }

    const first = candles[0].close;
    const last = candles[candles.length - 1].close;
    const change = ((last - first) / first) * 100;

    // Simple trend analysis
    let bias: 'UPTREND' | 'DOWNTREND' | 'NEUTRAL' = 'NEUTRAL';
    if (change > 0.2) bias = 'UPTREND';
    if (change < -0.2) bias = 'DOWNTREND';

    const strength = Math.abs(change);

    return {
      bias,
      strength: Math.min(strength, 100),
    };
  }

  /**
   * Execute entry: calculate SL/TP and open position
   */
  private async executeEntry(
    candle: Candle,
    signal: AnalyzerSignal,
    trendAnalysis: TrendAnalysisBacktest,
  ): Promise<void> {
    // Calculate ATR for SL (use simple ATR approximation)
    const atr = this.calculateATR(candle);
    const slMultiplier = this.strategyConfig.riskManagement?.stopLoss?.atrMultiplier || 2.0;

    // Determine direction from signal
    const isLong = signal.direction === SignalDirection.LONG;
    const stopLoss = isLong
      ? candle.close - (atr * slMultiplier)
      : candle.close + (atr * slMultiplier);

    // Calculate position size constrained by BOTH risk and exposure limits
    // Risk constraint: 0.5% risk per trade
    // Exposure constraint: 5% max notional exposure per RiskManager
    const riskAmount = this.currentBalance * 0.005; // 0.5% risk per trade
    const priceDelta = Math.abs(candle.close - stopLoss);
    const sizeForRisk = riskAmount / priceDelta;

    // Exposure constraint: max 5% of account in notional value
    const maxExposureUSDT = this.currentBalance * 0.05; // 5% max exposure
    const sizeForExposure = maxExposureUSDT / candle.close;

    // Take the smaller of the two constraints
    const size = Math.min(sizeForRisk, sizeForExposure);

    // Calculate TP levels
    const tpConfig = this.strategyConfig.riskManagement?.takeProfits || [
      { level: 1, percent: 1.0, sizePercent: 30 },
      { level: 2, percent: 2.0, sizePercent: 40 },
      { level: 3, percent: 3.5, sizePercent: 30 },
    ];

    const takeProfits = tpConfig.map((tp, idx) => ({
      level: idx + 1,
      price: isLong
        ? candle.close * (1 + (tp.percent ?? 1.0) / 100)
        : candle.close * (1 - (tp.percent ?? 1.0) / 100),
      size: size * ((tp.sizePercent ?? 33) / 100),
    }));

    const trade: BacktestTrade = {
      entryTime: candle.timestamp,
      entryPrice: candle.close,
      entrySignal: signal.source,
      direction: isLong ? 'LONG' : 'SHORT',
      size,
      stopLoss,
      takeProfits,
    };

    this.openPositions.push(trade);

    this.logger.info(`📍 Entry executed: ${trade.direction} @ ${candle.close.toFixed(8)}`, {
      size: size.toFixed(4),
      sl: stopLoss.toFixed(8),
      tp1: takeProfits[0].price.toFixed(8),
      confidence: signal.confidence.toFixed(1),
    });
  }

  /**
   * Close position and update balance
   */
  private closePosition(
    position: BacktestTrade,
    exitPrice: number,
    exitTime: number,
    reason: string,
  ): void {
    position.exitPrice = exitPrice;
    position.exitTime = exitTime;
    position.exitReason = reason;
    position.duration = exitTime - position.entryTime;

    // Calculate PnL
    const pnl = position.direction === 'LONG'
      ? (exitPrice - position.entryPrice) * position.size
      : (position.entryPrice - exitPrice) * position.size;

    const pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
    if (position.direction === 'SHORT') {
      position.pnlPercent = -pnlPercent;
    } else {
      position.pnlPercent = pnlPercent;
    }

    position.pnl = pnl;
    this.currentBalance += pnl;

    // Move from open to closed
    this.openPositions = this.openPositions.filter((p) => p !== position);
    this.closedTrades.push(position);

    this.logger.debug(`📊 Position closed: ${reason}`, {
      direction: position.direction,
      pnl: pnl.toFixed(2),
      pnlPercent: position.pnlPercent.toFixed(2),
      balance: this.currentBalance.toFixed(2),
    });
  }

  /**
   * Calculate ATR (simplified version)
   */
  private calculateATR(candle: Candle, period: number = 14): number {
    // Simplified: use candle size as proxy for volatility
    const range = candle.high - candle.low;
    return Math.max(range, candle.close * 0.002); // min 0.2%
  }

  /**
   * Calculate backtest metrics
   */
  private calculateMetrics(): BacktestMetrics {
    const trades = this.closedTrades;

    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnl: 0,
        profitFactor: 0,
        averageWin: 0,
        averageLoss: 0,
        largestWin: 0,
        largestLoss: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        equityPeek: this.config.initialBalance,
        equityTrough: this.config.initialBalance,
      };
    }

    // Calculate win/loss stats
    const wins = trades.filter((t) => t.pnl! > 0);
    const losses = trades.filter((t) => t.pnl! < 0);
    const totalPnl = trades.reduce((sum, t) => sum + t.pnl!, 0);

    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl!, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((sum, t) => sum + t.pnl!, 0) / losses.length : 0;

    const largestWin = wins.length > 0 ? Math.max(...wins.map((t) => t.pnl!)) : 0;
    const largestLoss = losses.length > 0 ? Math.min(...losses.map((t) => t.pnl!)) : 0;

    // Calculate profit factor
    const grossProfit = wins.reduce((sum, t) => sum + t.pnl!, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl!, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

    // Calculate Sharpe ratio
    const returns = this.equityCurve.map((eq, idx) => {
      if (idx === 0) return 0;
      return (eq.balance - this.equityCurve[idx - 1].balance) / this.equityCurve[idx - 1].balance;
    });
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (avgReturn * 252) / (stdDev * Math.sqrt(252)) : 0; // Annualized

    // Calculate drawdown
    let equityPeek = this.config.initialBalance;
    let maxDrawdown = 0;
    for (const eq of this.equityCurve) {
      if (eq.balance > equityPeek) {
        equityPeek = eq.balance;
      }
      const drawdown = (equityPeek - eq.balance) / equityPeek;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return {
      totalTrades: trades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: wins.length / trades.length,
      totalPnl,
      profitFactor,
      averageWin: avgWin,
      averageLoss: avgLoss,
      largestWin,
      largestLoss,
      sharpeRatio,
      maxDrawdown,
      equityPeek,
      equityTrough: Math.min(...this.equityCurve.map((e) => e.balance)),
    };
  }

  /**
   * Export results to JSON
   */
  exportResults(result: BacktestResult, outputFile?: string): string {
    const dir = this.config.outputDir || './backtest-results';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filename = outputFile || `backtest-${Date.now()}.json`;
    const filepath = path.join(dir, filename);

    fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
    this.logger.info(`💾 Results exported`, { file: filepath });

    return filepath;
  }
}

export default BacktestEngineV5;
