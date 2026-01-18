/**
 * BotServices - Dependency Injection Container
 *
 * Centralizes all bot dependencies and their initialization.
 * Replaces scattered initialization logic in bot.ts constructor.
 *
 * Benefits:
 * - Single place to see all dependencies
 * - Clear initialization order
 * - Easy to swap implementations for testing
 * - Easy to add new services
 */

import { Config, LoggerService, Candle } from '../types';
import { IExchange } from '../interfaces/IExchange';
import {
  BybitService,
  PositionLifecycleService,
  WebSocketManagerService,
  PositionMonitorService,
  TradingJournalService,
  TimeService,
  TelegramService,
  SessionStatsService,
  BotEventBus,
  PositionExitingService,
} from './index';
import { BybitServiceAdapter } from './bybit/bybit-service.adapter';
import { IndicatorCacheService } from './indicator-cache.service';
import { IndicatorPreCalculationService } from './indicator-precalculation.service';
import { CalculatorFactory } from '../factories/calculator.factory';
import { RiskManager } from './risk-manager.service';
import { OrderExecutionDetectorService } from './order-execution-detector.service';
import { WebSocketAuthenticationService } from './websocket-authentication.service';
import { EventDeduplicationService } from './event-deduplication.service';
import { WebSocketKeepAliveService } from './websocket-keep-alive.service';
import { ExitTypeDetectorService } from './exit-type-detector.service';
import { PositionPnLCalculatorService } from './position-pnl-calculator.service';
import { PositionSyncService } from './position-sync.service';
import { PositionEventHandler, WebSocketEventHandler } from './handlers';
import { CompoundInterestCalculatorService } from './compound-interest-calculator.service';
import { PublicWebSocketService } from './public-websocket.service';
import { OrderbookManagerService } from './orderbook-manager.service';
import { TradingOrchestrator } from './trading-orchestrator.service';
import { BotMetricsService } from './bot-metrics.service';
import { TimeframeProvider } from '../providers/timeframe.provider';
import { CandleProvider } from '../providers/candle.provider';
import { RetestEntryService } from './retest-entry.service';
import { DeltaAnalyzerService } from './delta-analyzer.service';
import { OrderbookImbalanceService } from './orderbook-imbalance.service';
import { WallTrackerService } from './wall-tracker.service';
import { ConsoleDashboardService } from './console-dashboard.service';
import { INTEGER_MULTIPLIERS } from '../constants';
import { RealityCheckService } from './reality-check.service';

/**
 * Container for all bot services
 * Initialized in dependency order
 */
export class BotServices {
  // Core services
  readonly logger: LoggerService;
  readonly eventBus: BotEventBus;
  readonly metrics: BotMetricsService;
  readonly telegram: TelegramService;
  readonly timeService: TimeService;
  readonly bybitService: IExchange;

  // Data & Providers
  readonly timeframeProvider: TimeframeProvider;
  readonly candleProvider: CandleProvider;
  btcCandles1m: Candle[] = []; // BTC 1-minute candles for correlation analysis

  // Indicator Cache System (Phase 0.2 Integration)
  readonly indicatorCache: IndicatorCacheService;
  readonly indicatorPreCalc: IndicatorPreCalculationService;

  // Analysis & Orchestration
  readonly tradingOrchestrator: TradingOrchestrator;

  // Tracking & Journal
  readonly journal: TradingJournalService;
  readonly sessionStats: SessionStatsService;
  readonly positionManager: PositionLifecycleService;
  readonly positionExitingService: PositionExitingService;
  readonly realityCheck: RealityCheckService;

  // WebSocket & Data
  readonly webSocketManager: WebSocketManagerService;
  readonly publicWebSocket: PublicWebSocketService;
  readonly orderbookManager: OrderbookManagerService;
  readonly positionMonitor: PositionMonitorService;

  // Event Handlers
  readonly positionEventHandler: PositionEventHandler;
  readonly webSocketEventHandler: WebSocketEventHandler;

  // UI & Dashboard
  readonly dashboard: ConsoleDashboardService;

  // Optional services
  readonly compoundInterestCalculator?: CompoundInterestCalculatorService;
  readonly retestEntryService?: RetestEntryService;
  readonly deltaAnalyzerService?: DeltaAnalyzerService;
  readonly orderbookImbalanceService?: OrderbookImbalanceService;
  readonly wallTrackerService?: WallTrackerService;

  constructor(config: Config) {
    // 0. Initialize dashboard FIRST to capture early logs
    // NOW FIXED: Uses non-blocking setImmediate render queue
    const dashboardConfig = (config as any)?.dashboard || {};
    const dashboardEnabled = dashboardConfig.enabled === true; // Only true if explicitly enabled

    this.dashboard = new ConsoleDashboardService({
      enabled: dashboardEnabled,
      updateInterval: dashboardConfig.updateInterval || 1000, // 1 second refresh
      theme: dashboardConfig.theme || 'dark',
    });
    if (dashboardEnabled) {
      console.log('🎨 Console Dashboard ENABLED');
    }

    // 1. Initialize logger
    this.logger = new LoggerService(
      config.logging.level,
      config.logging.logDir,
      true,
    );

    const logFilePath = this.logger.getLogFilePath();
    if (logFilePath) {
      this.logger.info('📝 Log file', { path: logFilePath });
    }

    // Log loaded strategy file
    if ((config as any).meta?.strategy) {
      const strategyFile = (config as any).meta?.strategyFile || `strategies/json/${(config as any).meta.strategy}.strategy.json`;
      this.logger.info('📋 Strategy loaded', {
        strategy: (config as any).meta.strategy,
        file: strategyFile,
        notes: (config as any).meta?.notes,
      });
    }

    // CRITICAL: Disable console output when dashboard is enabled
    // Prevents logs from overwriting blessed UI
    // Only happens if dashboard explicitly enabled in config
    if (dashboardEnabled) {
      this.logger.setConsoleOutputEnabled(false);
      this.logger.info('📊 Console output disabled - logs to file only (dashboard mode active)');
    }

    // Log strategy analyzer information
    if (config.analyzers && config.analyzers.length > 0) {
      const enabledAnalyzers = config.analyzers.filter((a: any) => a.enabled);
      this.logger.info(`📊 Strategy Analyzers loaded: ${enabledAnalyzers.length}/${config.analyzers.length} enabled`, {
        enabled: enabledAnalyzers.length,
        disabled: config.analyzers.length - enabledAnalyzers.length,
        total: config.analyzers.length,
      });

      // Group analyzers by weight
      const byWeight = enabledAnalyzers.reduce(
        (acc: Record<string, string[]>, a: any) => {
          const key = `${(a.weight * 100).toFixed(1)}%`;
          if (!acc[key]) acc[key] = [];
          acc[key].push(a.name);
          return acc;
        },
        {} as Record<string, string[]>,
      );

      // Log weight distribution
      Object.entries(byWeight)
        .sort(([w1], [w2]) => parseFloat(w2) - parseFloat(w1))
        .forEach(([weight, names]) => {
          const nameList = names as string[];
          this.logger.info(`   ${weight}: ${nameList.length} analyzers`);
        });

      // Log top 5 analyzers by weight
      const topAnalyzers = [...enabledAnalyzers]
        .sort((a: any, b: any) => (b.weight || 0) - (a.weight || 0))
        .slice(0, 5);
      if (topAnalyzers.length > 0) {
        this.logger.info(`   Top 5 analyzers:`);
        topAnalyzers.forEach((a: any) => {
          this.logger.info(`     • ${a.name}: ${(a.weight * 100).toFixed(2)}% weight, priority=${a.priority}`);
        });
      }
    }

    // Log indicator configuration
    if (config.indicators) {
      const indicatorNames = Object.keys(config.indicators);
      this.logger.info(`📈 Indicators configured: ${indicatorNames.length}`, {
        indicators: indicatorNames.join(', '),
      });

      // Log specific indicator parameters
      Object.entries(config.indicators).forEach(([name, cfg]) => {
        const details: string[] = [];
        const indCfg = cfg as any;
        if (indCfg.period) details.push(`period=${indCfg.period}`);
        if (indCfg.fastPeriod) details.push(`fast=${indCfg.fastPeriod}, slow=${indCfg.slowPeriod}`);
        if (indCfg.kPeriod) details.push(`k=${indCfg.kPeriod}, d=${indCfg.dPeriod}`);
        if (indCfg.stdDev) details.push(`stdDev=${indCfg.stdDev}`);
        if (details.length > 0) {
          this.logger.info(`   ${name}: ${details.join(', ')}`);
        }
      });
    }

    // 1.5 Initialize event bus (depends on logger)
    this.eventBus = new BotEventBus(this.logger);

    // 1.6 Initialize metrics service (depends on logger)
    this.metrics = new BotMetricsService(this.logger);

    // 2. Initialize core services (no dependencies)
    this.telegram = new TelegramService(
      config.telegram || { enabled: false },
      this.logger,
    );

    this.timeService = new TimeService(
      this.logger,
      config.system.timeSyncIntervalMs,
      config.system.timeSyncMaxFailures,
    );

    // 3. Initialize exchange service with adapter wrapper
    const rawBybitService = new BybitService(config.exchange, this.logger);
    this.bybitService = new BybitServiceAdapter(rawBybitService, this.logger);

    // TimeService now accepts IExchange interface
    this.timeService.setBybitService(this.bybitService);

    // 4. Initialize journal and stats
    this.journal = new TradingJournalService(
      this.logger,
      undefined,
      config.tradeHistory,
      config.compoundInterest?.baseDeposit || INTEGER_MULTIPLIERS.FIFTY,
    );

    this.sessionStats = new SessionStatsService(this.logger);

    // 4.5 Initialize Reality Check Service (tracks broken assumptions in trades)
    this.realityCheck = new RealityCheckService(this.logger);

    // 5. Initialize data providers
    // CandleProvider uses IExchange interface (Phase 2.5 migration complete)
    this.timeframeProvider = new TimeframeProvider(config.timeframes);
    this.candleProvider = new CandleProvider(
      this.timeframeProvider,
      this.bybitService,
      this.logger,
      config.exchange.symbol,
    );

    // 5.5 Initialize Indicator Cache System (Phase 0.2 Integration)
    this.indicatorCache = new IndicatorCacheService();
    this.logger.info('📊 Indicator cache initialized', {
      capacity: this.indicatorCache.getStats().capacity,
    });

    // 5.6 Initialize Pre-calculation Service
    const calculators = CalculatorFactory.createAllCalculators();
    this.indicatorPreCalc = new IndicatorPreCalculationService(
      this.candleProvider,
      this.indicatorCache,
      calculators,
      this.logger,
    );
    this.logger.info('🔄 Pre-calculation service initialized', {
      calculators: calculators.length,
    });

    // 6. Initialize optional services
    if (config.compoundInterest && config.compoundInterest.enabled) {
      this.compoundInterestCalculator = new CompoundInterestCalculatorService(
        config.compoundInterest,
        this.logger,
        async () => {
          if (config.compoundInterest?.useVirtualBalance) {
            return this.journal.getVirtualBalance();
          }
          // IExchange.getBalance() returns AccountBalance, extract walletBalance
          const balance = await this.bybitService.getBalance();
          return balance.walletBalance;
        },
      );
    }

    if (config.retestEntry?.enabled) {
      this.retestEntryService = new RetestEntryService(
        config.retestEntry,
        this.logger,
      );
    }

    if (config.delta?.enabled) {
      this.deltaAnalyzerService = new DeltaAnalyzerService(
        config.delta,
        this.logger,
      );
      this.logger.info('✅ Delta Analyzer initialized', {
        windowMs: config.delta.windowSizeMs,
        threshold: config.delta.minDeltaThreshold,
      });
    }

    if (config.orderbookImbalance?.enabled) {
      this.orderbookImbalanceService = new OrderbookImbalanceService(
        config.orderbookImbalance,
        this.logger,
      );
      this.logger.info('✅ Orderbook Imbalance initialized', {
        minImbalance: config.orderbookImbalance.minImbalancePercent + '%',
        levels: config.orderbookImbalance.levels,
      });
    }

    if (config.wallTracking?.enabled) {
      this.wallTrackerService = new WallTrackerService(
        config.wallTracking,
        this.logger,
      );
      this.logger.info('✅ Wall Tracker initialized (PHASE 4)', {
        minLifetime: config.wallTracking.minLifetimeMs + 'ms',
        spoofingThreshold: config.wallTracking.spoofingThresholdMs + 'ms',
        trackHistory: config.wallTracking.trackHistoryCount,
      });
    }

    // 7.5 Initialize RiskManager with proper RiskManagerConfig structure (PHASE 4)
    const riskManagerConfig = {
      dailyLimits: {
        maxDailyLossPercent: 5.0,
        maxDailyProfitPercent: undefined,
        emergencyStopOnLimit: true,
      },
      lossStreak: {
        stopAfterLosses: 4,
        reductions: {
          after2Losses: 0.75,
          after3Losses: 0.50,
          after4Losses: 0.25,
        },
      },
      concurrentRisk: {
        enabled: false,
        maxPositions: 1,
        maxRiskPerPosition: 2.0,
        maxTotalExposurePercent: 5.0,
      },
      positionSizing: {
        riskPerTradePercent: 1.0,
        minPositionSizeUsdt: 5.0,
        maxPositionSizeUsdt: 100.0,
        maxLeverageMultiplier: 2.0,
      },
    };
    const riskManager = new RiskManager(riskManagerConfig, this.logger);

    // 8. Initialize position management
    // NOTE: Phase 1.2 - Update PositionLifecycleService to use IExchange
    this.positionManager = new PositionLifecycleService(
      this.bybitService,
      config.trading,
      config.riskManagement,
      this.telegram,
      this.logger,
      this.journal,
      config.entryConfirmation,
      config,
      this.eventBus,
      this.compoundInterestCalculator,
      this.sessionStats,
    );

    // 8.5 Initialize position exiting service (depends on bybit, journal, configs, positionManager)
    // NOTE: Phase 1.3 - Update PositionExitingService to use IExchange
    this.positionExitingService = new PositionExitingService(
      this.bybitService,
      this.telegram,
      this.logger,
      this.journal,
      config.trading,
      config.riskManagement,
      config,
      this.sessionStats,
      this.positionManager, // Pass PositionManager so we can access takeProfitManager when needed
      this.realityCheck, // For analyzing trades when they close
    );

    // 9. Initialize WebSocket managers
    const orderExecutionDetector = new OrderExecutionDetectorService(this.logger);
    const authService = new WebSocketAuthenticationService();
    const deduplicationService = new EventDeduplicationService(100, 60000, this.logger);
    const keepAliveService = new WebSocketKeepAliveService(20000, this.logger);
    this.webSocketManager = new WebSocketManagerService(
      config.exchange,
      config.exchange.symbol,
      this.logger,
      orderExecutionDetector,
      authService,
      deduplicationService,
      keepAliveService,
    );

    this.publicWebSocket = new PublicWebSocketService(
      config.exchange,
      config.exchange.symbol,
      this.timeframeProvider,
      this.logger,
      config.btcConfirmation,
    );

    // 10. Initialize orderbook and monitoring
    this.orderbookManager = new OrderbookManagerService(
      config.exchange.symbol,
      this.logger,
      this.wallTrackerService,
    );

    const exitTypeDetectorService = new ExitTypeDetectorService(this.logger);
    const pnlCalculatorService = new PositionPnLCalculatorService();
    // PositionSyncService and PositionMonitorService now use IExchange interface
    // The adapter provides all necessary methods (getActiveOrders, verifyProtectionSet, etc.)
    const positionSyncService = new PositionSyncService(
      this.bybitService,
      this.positionManager,
      exitTypeDetectorService,
      this.telegram,
      this.logger,
      this.positionExitingService,
    );

    this.positionMonitor = new PositionMonitorService(
      this.bybitService,
      this.positionManager,
      config.riskManagement,
      this.telegram,
      this.logger,
      exitTypeDetectorService,
      pnlCalculatorService,
      positionSyncService,
      this.positionExitingService,
    );

    // 11. Initialize trading orchestrator (uses all above)
    // TradingOrchestrator creates RiskManager and TrendAnalyzer internally if not passed
    const orchestratorConfig = {
      contextConfig: {
        atrPeriod: config.indicators.atrPeriod,
        emaPeriod: config.indicators.slowEmaPeriod,
        zigzagDepth: config.indicators.zigzagDepth,
        minimumATR: config.atrFilter?.minimumATR || 0.01,
        maximumATR: config.atrFilter?.maximumATR || 100,
        maxEmaDistance: config.strategy?.emaDistanceThreshold || 0.5,
        filteringMode: (config.strategy?.contextFilteringMode) || 'HARD_BLOCK',
        atrFilterEnabled: config.atrFilter?.enabled === true,
      },
      entryConfig: {
        rsiPeriod: config.indicators.rsiPeriod,
        fastEmaPeriod: config.indicators.fastEmaPeriod,
        slowEmaPeriod: config.indicators.slowEmaPeriod,
        zigzagDepth: config.indicators.zigzagDepth,
        rsiOversold: config.indicators.rsiOversold,
        rsiOverbought: config.indicators.rsiOverbought,
        stopLossPercent: config.riskManagement.stopLossPercent,
        takeProfits: config.riskManagement.takeProfits,
        priceAction: config?.strategy?.priceAction,
        divergenceDetector: config.entryConfig.divergenceDetector,
      },
      strategiesConfig: config.strategies,
      positionSizeUsdt: config.riskManagement.positionSizeUsdt,
      leverage: config.trading.leverage,
      btcConfirmation: config?.btcConfirmation,
      system: config.system,
      strategicWeights: config.strategicWeights,
      trendConfirmation: config.trendConfirmation,
      analysisConfig: config.analysisConfig,
      volatilityRegime: config.volatilityRegime,
      riskManagement: config.riskManagement,
      indicators: config.indicators,
      analyzers: config.analyzers,
      analyzerDefaults: (config as any).analyzerDefaults,
    };

    this.logger.info('🔗 OrchestratorConfig prepared', {
      hasBtcConfirmation: !!orchestratorConfig.btcConfirmation,
      btcEnabled: orchestratorConfig.btcConfirmation?.enabled,
    });

    // NOTE: TradingOrchestrator still uses BybitService (Phase 2.5+ will migrate to IExchange)
    this.tradingOrchestrator = new TradingOrchestrator(
      orchestratorConfig,
      this.candleProvider,
      this.timeframeProvider,
      this.bybitService,
      this.positionManager,
      this.telegram,
      this.logger,
      riskManager,
    );

    // 11.5. Link Pre-calculation Service to TradingOrchestrator (Phase 0.2 Integration)
    this.tradingOrchestrator.setIndicatorPreCalculationService(this.indicatorPreCalc);
    this.logger.info('🔗 Pre-calculation service linked to TradingOrchestrator');

    // 11.6. Link BTC candles store to TradingOrchestrator for BTC_CORRELATION analyzer
    if (config.btcConfirmation?.enabled) {
      this.tradingOrchestrator.setBtcCandlesStore(this);
      this.logger.info('🔗 BTC candles store linked to TradingOrchestrator');
    }

    // 12. Initialize event handlers (uses all above services)
    this.positionEventHandler = new PositionEventHandler(
      this.positionManager,
      this.positionExitingService,
      this.bybitService,
      this.telegram,
      this.logger,
    );

    this.webSocketEventHandler = new WebSocketEventHandler(
      this.positionManager,
      this.positionExitingService,
      this.bybitService,
      this.webSocketManager,
      this.journal,
      this.telegram,
      this.logger,
    );

    // 13. Link BTC candles store to PublicWebSocket for real-time updates
    if (config.btcConfirmation?.enabled) {
      this.publicWebSocket.setBtcCandlesStore(this);
      this.logger.info('🔗 BTC candles store linked to PublicWebSocket');
    }

    this.logger.info('✅ BotServices initialized - all dependencies ready');
  }

  /**
   * Get all services as a collection
   * Useful for dependency injection
   */
  toObject() {
    return {
      logger: this.logger,
      eventBus: this.eventBus,
      metrics: this.metrics,
      telegram: this.telegram,
      timeService: this.timeService,
      bybitService: this.bybitService,
      timeframeProvider: this.timeframeProvider,
      candleProvider: this.candleProvider,
      indicatorCache: this.indicatorCache,
      indicatorPreCalc: this.indicatorPreCalc,
      tradingOrchestrator: this.tradingOrchestrator,
      journal: this.journal,
      sessionStats: this.sessionStats,
      positionManager: this.positionManager,
      positionExitingService: this.positionExitingService,
      webSocketManager: this.webSocketManager,
      publicWebSocket: this.publicWebSocket,
      orderbookManager: this.orderbookManager,
      positionMonitor: this.positionMonitor,
      positionEventHandler: this.positionEventHandler,
      webSocketEventHandler: this.webSocketEventHandler,
      compoundInterestCalculator: this.compoundInterestCalculator,
      retestEntryService: this.retestEntryService,
      deltaAnalyzerService: this.deltaAnalyzerService,
      orderbookImbalanceService: this.orderbookImbalanceService,
      wallTrackerService: this.wallTrackerService,
    };
  }
}
