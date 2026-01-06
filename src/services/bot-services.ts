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

import { Config, LoggerService, MarketStructureAnalyzer, Candle } from '../types';
import {
  BybitService,
  PositionManagerService,
  WebSocketManagerService,
  PositionMonitorService,
  TradingJournalService,
  TimeService,
  TelegramService,
  SessionStatsService,
  BotEventBus,
  PositionExitingService,
} from './index';
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
import { DashboardIntegrationService } from './dashboard-integration.service';
import {
  CHOCH_ALIGNED_BOOST,
  CHOCH_AGAINST_PENALTY,
  BOS_ALIGNED_BOOST,
  NO_MODIFICATION_MULTIPLIER,
} from '../constants/technical.constants';
import { INTEGER_MULTIPLIERS } from '../constants';

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
  readonly bybitService: BybitService;

  // Data & Providers
  readonly timeframeProvider: TimeframeProvider;
  readonly candleProvider: CandleProvider;
  btcCandles1m: Candle[] = []; // BTC 1-minute candles for correlation analysis

  // Analysis & Orchestration
  readonly structureAnalyzer: MarketStructureAnalyzer;
  readonly tradingOrchestrator: TradingOrchestrator;

  // Tracking & Journal
  readonly journal: TradingJournalService;
  readonly sessionStats: SessionStatsService;
  readonly positionManager: PositionManagerService;
  readonly positionExitingService: PositionExitingService;

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
  readonly dashboardIntegration?: DashboardIntegrationService; // Optional now - disabled due to hang issues

  // Optional services
  readonly compoundInterestCalculator?: CompoundInterestCalculatorService;
  readonly retestEntryService?: RetestEntryService;
  readonly deltaAnalyzerService?: DeltaAnalyzerService;
  readonly orderbookImbalanceService?: OrderbookImbalanceService;
  readonly wallTrackerService?: WallTrackerService;

  constructor(config: Config) {
    // 0. Initialize dashboard FIRST to capture early logs
    this.dashboard = new ConsoleDashboardService({
      enabled: false, // TEMPORARILY DISABLED - dashboard was causing hang/freeze issues
      updateInterval: 500,
      theme: 'dark',
    });
    console.log('🎨 Console Dashboard DISABLED - focus on fixing position-opened event issue');

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

    // 3. Initialize exchange service
    this.bybitService = new BybitService(config.exchange, this.logger);
    this.timeService.setBybitService(this.bybitService);

    // 4. Initialize journal and stats
    this.journal = new TradingJournalService(
      this.logger,
      undefined,
      config.tradeHistory,
      config.compoundInterest?.baseDeposit || INTEGER_MULTIPLIERS.FIFTY,
    );

    this.sessionStats = new SessionStatsService(this.logger);

    // 5. Initialize data providers
    this.timeframeProvider = new TimeframeProvider(config.timeframes);
    this.candleProvider = new CandleProvider(
      this.timeframeProvider,
      this.bybitService,
      this.logger,
      config.exchange.symbol,
    );

    // 6. Initialize analyzers
    const marketStructureConfig = (config.analysisConfig as any)?.marketStructure || {
      chochAlignedBoost: CHOCH_ALIGNED_BOOST,
      chochAgainstPenalty: CHOCH_AGAINST_PENALTY,
      bosAlignedBoost: BOS_ALIGNED_BOOST,
      noModification: NO_MODIFICATION_MULTIPLIER,
    };
    this.structureAnalyzer = new MarketStructureAnalyzer(
      marketStructureConfig,
      this.logger,
    );

    // 7. Initialize optional services
    if (config.compoundInterest && config.compoundInterest.enabled) {
      this.compoundInterestCalculator = new CompoundInterestCalculatorService(
        config.compoundInterest,
        this.logger,
        async () => {
          if (config.compoundInterest?.useVirtualBalance) {
            return this.journal.getVirtualBalance();
          }
          return await this.bybitService.getBalance();
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
    const RiskManagerModule = require('./risk-manager.service') as any;
    const RiskManager = RiskManagerModule.RiskManager;
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
    this.positionManager = new PositionManagerService(
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
    );

    // 9. Initialize WebSocket managers
    this.webSocketManager = new WebSocketManagerService(
      config.exchange,
      config.exchange.symbol,
      this.logger,
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

    this.positionMonitor = new PositionMonitorService(
      this.bybitService,
      this.positionManager,
      config.riskManagement,
      this.telegram,
      this.logger,
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
        filteringMode: (config.strategy?.contextFilteringMode as any) || 'HARD_BLOCK',
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
    };

    this.logger.info('🔗 OrchestratorConfig prepared', {
      hasBtcConfirmation: !!orchestratorConfig.btcConfirmation,
      btcEnabled: orchestratorConfig.btcConfirmation?.enabled,
    });

    this.tradingOrchestrator = new TradingOrchestrator(
      orchestratorConfig,
      this.candleProvider,
      this.timeframeProvider,
      this.bybitService,
      this.positionManager,
      this.telegram,
      this.logger,
      this.retestEntryService,
      this.deltaAnalyzerService,
      this.orderbookImbalanceService,
      riskManager,           // 11 - PHASE 4 unified risk decision point
      undefined,             // 12 - trendAnalyzer (will be created internally)
      this.journal,          // 13
      this.sessionStats,     // 14
      config,                // 15 - Main Config for IndicatorInitializationService to access divergenceDetector
    );

    // 11.5. Link BTC candles store to TradingOrchestrator for BTC_CORRELATION analyzer
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

    // 14. Initialize Dashboard Integration (connects dashboard to data sources)
    // TEMPORARILY DISABLED - dashboard was causing hang/freeze issues
    // this.dashboardIntegration = new DashboardIntegrationService(
    //   this.dashboard,
    //   this.eventBus,
    //   this.logger,
    //   (this.tradingOrchestrator as any).trendAnalyzer,
    //   (this.tradingOrchestrator as any).rsiAnalyzer,
    //   (this.tradingOrchestrator as any).emaAnalyzer,
    //   this.positionManager,
    //   this.publicWebSocket,
    // );
    // this.logger.info('🔗 Dashboard Integration Service initialized - real-time updates enabled');

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
      structureAnalyzer: this.structureAnalyzer,
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
