import { CONFIDENCE_THRESHOLDS, DECIMAL_PLACES, FIXED_EXIT_PERCENTAGES, MULTIPLIERS, PERCENT_MULTIPLIER, PERCENTAGE_THRESHOLDS, THRESHOLD_VALUES, MULTIPLIER_VALUES, INTEGER_MULTIPLIERS, BACKTEST_CONSTANTS } from '../constants';
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
  EntrySignal,
  TimeframeRole,
  Candle,
  LoggerService,
  SignalType,
  Signal,
  ContextFilteringMode,
  StrategyMarketData,
  SignalDirection,
  BTCConfirmationConfig,
  BTCAnalysis,
  FundingRateFilterConfig,
  SessionBasedSLConfig,
  FlatMarketConfig,
  TakeProfit,
  SessionEntryCondition,
  IndicatorSnapshot,
  PatternSnapshot,
  LevelSnapshot,
  ContextSnapshot,
  DailyLimitsConfig,
  RiskBasedSizingConfig,
  IStrategy,
  OrderBook,
  OrderbookLevel,
  LossStreakConfig,
  LevelBasedConfig,
  WhaleHunterConfig,
  Config,
  ScalpingMicroWallConfig,
  ScalpingLimitOrderConfig,
  ScalpingLadderTpConfig,
  ScalpingTickDeltaConfig,
  ScalpingOrderFlowConfig,
  IndicatorsConfig,
  FastEntryConfig,
  SmartBreakevenConfig,
  RetestConfig,
  WeightMatrixConfig,
  DeltaConfig,
  OrderbookImbalanceConfig,
  VolumeProfileConfig,
  TrendConfirmationConfig,
  TrendAnalysis,
  TrendBias,
  RiskManagerConfig,
  RiskDecision,
  Position,
  OrchestratorConfig,
  ExitType,
  OrderBookAnalyzer,
  ATRIndicator,
  ZigZagNRIndicator,
  StochasticIndicator,
  BollingerBandsIndicator,
  LiquidityDetector,
  DivergenceDetector,
  BTCAnalyzer,
  BreakoutPredictor,
  PriceMomentumAnalyzer,
  FlatMarketDetector,
  DailyLevelTracker,
  BreakoutDetector,
  RetestPhaseAnalyzer,
  EntryRefinementAnalyzer,
  VolumeAnalyzer,
  MarketStructureAnalyzer,
  TrendAnalyzer,
  LevelBasedStrategy,
  WhaleHunterStrategy,
  WhaleHunterFollowStrategy,
  ScalpingMicroWallStrategy,
  ScalpingLimitOrderStrategy,
  ScalpingLadderTpStrategy,
  ScalpingTickDeltaStrategy,
  ScalpingOrderFlowStrategy,
  FractalBreakoutRetestStrategy,
} from '../types';
// PHASE 4: ContextAnalyzer archived to src/archive/phase4-integration/
// Replaced by TrendAnalyzer (PRIMARY component)
import { CandleProvider } from '../providers/candle.provider';
import { BybitService } from './bybit';
import { PositionManagerService } from './position-manager.service';
import { TelegramService } from './telegram.service';
import { TradingJournalService } from './trading-journal.service';
import { SessionStatsService } from './session-stats.service';
import { StrategyCoordinator } from './strategy-coordinator.service';
import { AnalyzerRegistry } from './analyzer-registry.service';
import { AnalyzerRegistrationService } from './analyzer-registration.service';
import { WhaleDetectorService } from './whale-detector.service';
import { WhaleDetectorFollowService } from './whale-detector-follow.service';
import { MicroWallDetectorService } from './micro-wall-detector.service';
import { EntryScanner } from '../analyzers/entry.scanner';
import { MultiTimeframeRSIAnalyzer } from '../analyzers/multi-timeframe-rsi.analyzer';
import { MultiTimeframeEMAAnalyzer } from '../analyzers/multi-timeframe-ema.analyzer';
import { TimeframeProvider } from '../providers/timeframe.provider';
import { FundingRateFilterService } from './funding-rate-filter.service';
// FastEntryService archived to src/archive/phase4-week2/ (consolidated into EntryOrchestrator)
// SmartBreakevenService archived to src/archive/phase4-week3/ (consolidated into ExitOrchestrator)
import { RetestEntryService } from './retest-entry.service';
import { WeightMatrixCalculatorService } from './weight-matrix-calculator.service';
import { DeltaAnalyzerService } from './delta-analyzer.service';
import { OrderbookImbalanceService } from './orderbook-imbalance.service';
import { VolumeProfileService } from './volume-profile.service';
import { RiskCalculator } from './risk-calculator.service';
import { TrendConfirmationService } from './trend-confirmation.service';
import { FractalSmcWeightingService } from './fractal-smc-weighting.service';
import { MarketHealthMonitor } from './market-health.monitor';
// PHASE 4: RiskManager (unified risk gatekeeper - ATOMIC decision point)
import { RiskManager } from './risk-manager.service';
// PHASE 4: EntryOrchestrator (PRIMARY entry decision point - Week 2)
import { EntryOrchestrator } from '../orchestrators/entry.orchestrator';
// PHASE 4: ExitOrchestrator (PRIMARY exit state machine - Week 3)
import { ExitOrchestrator } from '../orchestrators/exit.orchestrator';
import { PositionExitingService } from './position-exiting.service';
import { IndicatorInitializationService } from './indicator-initialization.service';
import { FilterInitializationService } from './filter-initialization.service';
import { EntryLogicService } from './entry-logic.service';
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
  // PHASE 4: Removed contextAnalyzer (archived to phase4-integration)
  // Replaced by trendAnalyzer (passed in constructor)
  private entryScanner: EntryScanner;
  private strategyCoordinator: StrategyCoordinator;
  private analyzerRegistry: AnalyzerRegistry;
  private riskCalculator: RiskCalculator;
  private currentContext: TradingContext | null = null;

  // Multi-timeframe analyzers
  private rsiAnalyzer: MultiTimeframeRSIAnalyzer;
  private emaAnalyzer: MultiTimeframeEMAAnalyzer;

  // PHASE 6c: Price momentum analyzer for real-time momentum validation
  private priceMomentumAnalyzer: PriceMomentumAnalyzer;

  // Single-timeframe indicators (still needed for specific tasks)
  private atrIndicator: ATRIndicator;
  private zigzagNRIndicator: ZigZagNRIndicator;
  private stochasticIndicator?: StochasticIndicator;
  private bollingerIndicator?: BollingerBandsIndicator;
  private liquidityDetector: LiquidityDetector;
  private divergenceDetector: DivergenceDetector;
  private breakoutPredictor: BreakoutPredictor;

  // BTC confirmation
  private btcAnalyzer: BTCAnalyzer | null = null;

  // Funding rate filter
  private fundingRateFilter: FundingRateFilterService | null = null;

  // Flat market detector
  private flatMarketDetector: FlatMarketDetector | null = null;

  // Trend confirmation filter (secondary filter for signal validation)
  private trendConfirmationService: TrendConfirmationService | null = null;

  // Phase 1: Smart Entry & Breakeven services
  private fastEntryService: any | null = null; // Archived - Consolidated into EntryOrchestrator
  private smartBreakevenService: any | null = null; // Archived - Consolidated into ExitOrchestrator
  private retestEntryService: RetestEntryService | null = null;

  // Phase 4: Market Data Enhancement services
  private deltaAnalyzerService: DeltaAnalyzerService | null = null;
  private orderbookImbalanceService: OrderbookImbalanceService | null = null;
  private volumeProfileService: VolumeProfileService | null = null;

  // Phase 5: Risk Management services - ARCHIVED to src/archive/phase4-week1/
  private dailyLimitsService: any | null = null; // Consolidated into RiskManager
  private riskBasedSizingService: any | null = null; // Consolidated into RiskManager
  private lossStreakService: any | null = null; // Consolidated into RiskManager
  private maxConcurrentRiskService: any | null = null; // Consolidated into RiskManager

  // PHASE 4: TrendAnalyzer (PRIMARY - runs FIRST to set global trend bias)
  private trendAnalyzer: TrendAnalyzer | null = null;
  private currentTrendAnalysis: TrendAnalysis | null = null;

  // PHASE 4: RiskManager (PRIMARY - unified atomic risk gatekeeper)
  private riskManager: RiskManager | null = null;

  // PHASE 4: EntryOrchestrator (PRIMARY - single entry decision point - Week 2)
  private entryOrchestrator: EntryOrchestrator | null = null;

  // PHASE 4: ExitOrchestrator (PRIMARY - position exit state machine - Week 3)
  private exitOrchestrator: ExitOrchestrator | null = null;

  // PHASE 4: PositionExitingService (PRIMARY - position exit execution - Week 3)
  private positionExitingService: PositionExitingService | null = null;

  // Market structure analyzer for TrendAnalyzer dependency
  private marketStructureAnalyzer: MarketStructureAnalyzer | null = null;

  // Orderbook data (for whale detection)
  private currentOrderbook: OrderBook | null = null;

  // Week 13: MarketDataPreparationService (extracted from trading-orchestrator)
  // Handles market data aggregation, indicator calculation, and data preparation
  private marketDataPreparationService: any | null = null; // Will be MarketDataPreparationService

  // Week 13: TradingContextService (extracted from trading-orchestrator)
  // Handles trend analysis and signal filtering by trend alignment
  private tradingContextService: any | null = null; // Will be TradingContextService

  // Week 13: ExternalAnalysisService (extracted from trading-orchestrator)
  // Handles BTC analysis, funding rate filtering, and flat market detection
  private externalAnalysisService: any | null = null; // Will be ExternalAnalysisService

  // Week 13: SignalProcessingService (extracted from trading-orchestrator)
  // Handles signal collection, filtering, aggregation, and entry signal generation
  private signalProcessingService: any | null = null; // Will be SignalProcessingService

  // Week 13: TradeExecutionService (extracted from trading-orchestrator)
  // Handles all pre-trade checks and position opening
  private tradeExecutionService: any | null = null; // Will be TradeExecutionService

  // Week 13: EntryLogicService (extracted from trading-orchestrator)
  // Handles entire ENTRY candle scanning pipeline
  private entryLogicService: EntryLogicService | null = null; // Will be EntryLogicService

  // Week 13: WhaleSignalDetectionService (extracted from trading-orchestrator)
  // Handles real-time whale hunter signal detection and execution
  private whaleSignalDetectionService: any | null = null; // Will be WhaleSignalDetectionService

  // Reference to analyzer registration for updating BTC candles later
  private analyzerRegistration: AnalyzerRegistrationService | null = null;

  constructor(
    private config: OrchestratorConfig,
    private candleProvider: CandleProvider,
    private timeframeProvider: TimeframeProvider,
    private bybitService: BybitService,
    private positionManager: PositionManagerService,
    private telegram: TelegramService | null,
    private logger: LoggerService,
    retestEntryService?: RetestEntryService,
    deltaAnalyzerService?: DeltaAnalyzerService,
    orderbookImbalanceService?: OrderbookImbalanceService,
    riskManager?: RiskManager,  // PHASE 4: Unified risk decision point
    trendAnalyzer?: TrendAnalyzer,  // PHASE 4: Global trend detection
    private tradingJournal?: TradingJournalService,  // For PositionExitingService (Session 68)
    private sessionStats?: SessionStatsService,  // For PositionExitingService (Session 68)
  ) {
    // Week 13 Phase 5b: Use IndicatorInitializationService for all indicator initialization
    const IndicatorInitModule = require('./indicator-initialization.service') as any;
    const IndicatorInit = IndicatorInitModule.IndicatorInitializationService;
    const indicatorInit = new IndicatorInit(config, candleProvider, timeframeProvider, logger);
    const indicators = indicatorInit.initializeAllIndicators();

    // Assign initialized indicators to class properties
    this.entryScanner = indicators.entryScanner;
    this.rsiAnalyzer = indicators.rsiAnalyzer;
    this.emaAnalyzer = indicators.emaAnalyzer;
    this.atrIndicator = indicators.atrIndicator;
    this.zigzagNRIndicator = indicators.zigzagNRIndicator;
    this.liquidityDetector = indicators.liquidityDetector;
    this.divergenceDetector = indicators.divergenceDetector;
    this.breakoutPredictor = indicators.breakoutPredictor;
    this.stochasticIndicator = indicators.stochasticIndicator;
    this.bollingerIndicator = indicators.bollingerIndicator;

    // PHASE 6c: Initialize PriceMomentumAnalyzer
    this.priceMomentumAnalyzer = new PriceMomentumAnalyzer();
    logger.info('✅ PriceMomentumAnalyzer initialized for real-time momentum validation');

    // Initialize Strategy Coordinator
    this.strategyCoordinator = new StrategyCoordinator(logger);

    // Initialize Analyzer Registry (for unified signal collection and weighting)
    this.analyzerRegistry = new AnalyzerRegistry(logger);
    logger.info('✅ Analyzer Registry initialized for unified weighted voting system');

    // Initialize Risk Calculator (for SL/TP calculation)
    this.riskCalculator = new RiskCalculator(logger);
    logger.info('✅ Risk Calculator initialized for consistent SL/TP calculation');

    // Week 13 Phase 5c: Initialize filters BEFORE analyzer registration
    // (BTCAnalyzer needed for BTC_CORRELATION analyzer in AnalyzerRegistrationService)
    const FilterInitModule = require('./filter-initialization.service') as any;
    const FilterInit = FilterInitModule.FilterInitializationService;
    const filterInit = new FilterInit(config, candleProvider, bybitService, logger);
    const filters = filterInit.initializeAllFilters();

    // Assign initialized filters to class properties
    this.btcAnalyzer = filters.btcAnalyzer;
    this.fundingRateFilter = filters.fundingRateFilter;
    this.flatMarketDetector = filters.flatMarketDetector;
    this.trendConfirmationService = filters.trendConfirmationService;

    // Register all analyzers into the registry (45+ analyzers)
    this.analyzerRegistration = new AnalyzerRegistrationService(
      this.analyzerRegistry,
      logger,
      config,
      this.rsiAnalyzer,
      this.emaAnalyzer,
      this.priceMomentumAnalyzer, // PHASE 6c: Added momentum analyzer
      this.atrIndicator,
      this.liquidityDetector,
      this.divergenceDetector,
      this.breakoutPredictor,
      this.btcAnalyzer,
      this.stochasticIndicator,
      this.bollingerIndicator,
      this.flatMarketDetector,
      this.deltaAnalyzerService,
      this.orderbookImbalanceService,
    );
    this.analyzerRegistration.registerAllAnalyzers();

    // Week 13 Phase 5a: Use StrategyRegistrationService for all strategy registration
    const StrategyRegistrationModule = require('./strategy-registration.service') as any;
    const StrategyRegistration = StrategyRegistrationModule.StrategyRegistrationService;
    const strategyRegistration = new StrategyRegistration(
      this.strategyCoordinator,
      config,
      bybitService,
      logger,
    );
    strategyRegistration.registerAllStrategies();

    // Initialize Phase 1 services (Smart Entry & Breakeven)
    // Services are passed from bot.ts to ensure single instance shared with PositionManager
    this.retestEntryService = retestEntryService || null;

    // Phase 4: Market Data Enhancement services
    this.deltaAnalyzerService = deltaAnalyzerService || null;
    this.orderbookImbalanceService = orderbookImbalanceService || null;

    // Initialize Volume Profile Service (PHASE 4 Feature 3)
    if (config.volumeProfile?.enabled) {
      this.volumeProfileService = new VolumeProfileService(config.volumeProfile, logger);
      this.logger.info('📊 Volume Profile Service initialized', {
        lookbackCandles: config.volumeProfile.lookbackCandles,
        valueAreaPercent: config.volumeProfile.valueAreaPercent,
        priceTickSize: config.volumeProfile.priceTickSize,
      });
    }


    if (this.retestEntryService) {
      this.logger.info('🎯 Retest Entry Service enabled', {
        minImpulsePercent: config.retestEntry?.minImpulsePercent,
        retestZone: config.retestEntry ? `${config.retestEntry.retestZoneFibStart}%-${config.retestEntry.retestZoneFibEnd}%` : 'N/A',
        maxRetestWaitMs: config.retestEntry?.maxRetestWaitMs,
      });
    }

    if (this.deltaAnalyzerService) {
      this.logger.info('📊 Delta Analyzer Service enabled (PHASE 4)', {
        windowSizeMs: config.delta?.windowSizeMs,
        minDeltaThreshold: config.delta?.minDeltaThreshold,
      });
    }


    // PHASE 4: Initialize Market Structure Analyzer (dependency for TrendAnalyzer)
    this.marketStructureAnalyzer = new MarketStructureAnalyzer(
      config.analysisConfig?.marketStructure || {
        chochAlignedBoost: 1.3,
        chochAgainstPenalty: 0.5,
        bosAlignedBoost: 1.1,
        bosAgainstPenalty: 0.8,
        noModification: 1.0,
      },
      logger,
    );
    this.logger.info('✅ Market Structure Analyzer initialized (TrendAnalyzer dependency)');

    // PHASE 4: Initialize TrendAnalyzer (PRIMARY - runs FIRST in pipeline)
    if (trendAnalyzer) {
      this.trendAnalyzer = trendAnalyzer;
    } else if (this.marketStructureAnalyzer) {
      // Create SwingPointDetectorService for trend analysis
      const swingPointDetector = new SwingPointDetectorService(logger, 2); // lookback=2 candles

      // Session 73: Add multi-timeframe services for comprehensive trend analysis
      const multiTimeframeTrendService = new MultiTimeframeTrendService(logger, swingPointDetector);
      const timeframeWeightingService = new TimeframeWeightingService(logger);

      this.trendAnalyzer = new TrendAnalyzer(
        this.marketStructureAnalyzer,
        logger,
        swingPointDetector,
        multiTimeframeTrendService, // Session 73 addition
        timeframeWeightingService, // Session 73 addition
      );
    }

    if (this.trendAnalyzer) {
      this.logger.info('✅ TrendAnalyzer initialized (PHASE 4 PRIMARY)', {
        role: 'Global trend detection - runs FIRST in pipeline',
        blocks: ['LONG in BEARISH trend', 'SHORT in BULLISH trend'],
      });
    }

    // PHASE 4: Initialize RiskManager (PRIMARY - atomic risk gatekeeper)
    if (riskManager) {
      this.riskManager = riskManager;
    }
    // Note: RiskManager requires RiskManagerConfig structure (not the Config.riskManagement structure)
    // It must be passed as a constructor parameter from BotServices

    if (this.riskManager) {
      this.logger.info('✅ RiskManager initialized (PHASE 4 PRIMARY)', {
        role: 'Unified atomic risk decision point',
        checks: ['Daily loss limits', 'Loss streak penalties', 'Concurrent risk', 'Position sizing'],
      });
    }

    // PHASE 4: Initialize EntryOrchestrator (PRIMARY - single entry decision point - Week 2)
    if (this.riskManager) {
      this.entryOrchestrator = new EntryOrchestrator(this.riskManager, logger);
      this.logger.info('✅ EntryOrchestrator initialized (PHASE 4 PRIMARY Week 2)', {
        role: 'Single atomic entry decision point',
        consolidates: ['EntryScanner', 'FastEntryService', 'EntryConfirmationManager', 'StrategyCoordinator entry logic'],
        logic: ['Signal ranking by confidence', 'Trend alignment check', 'RiskManager approval'],
      });
    } else {
      this.logger.error('❌ CRITICAL: RiskManager not initialized - EntryOrchestrator disabled. Trading will not work.');
    }

    // PHASE 4: Initialize ExitOrchestrator (PRIMARY - position exit state machine - Week 3)
    this.exitOrchestrator = new ExitOrchestrator(logger);
    this.logger.info('✅ ExitOrchestrator initialized (PHASE 4 PRIMARY Week 3)', {
      role: 'Position exit state machine',
      consolidates: ['SmartBreakevenService', 'SmartTrailingV2Service', 'AdaptiveTP3Service', 'PositionManagerService exit logic'],
      states: ['OPEN', 'TP1_HIT', 'TP2_HIT', 'TP3_HIT', 'CLOSED'],
      logic: ['State transitions', 'SL priority', 'Breakeven lock-in', 'Trailing stop activation'],
    });

    // PHASE 4: Initialize PositionExitingService (PRIMARY - position exit execution - Week 3)
    // Session 70: Full integration (ACTIVE since Dec 23, 2025)
    if (this.tradingJournal && this.bybitService) {
      // Create minimal config objects for PositionExitingService
      const tradingConfigForExit: any = {
        leverage: (config as any).leverage || 10,
        riskPercent: (config as any).riskPercent || 2,
        maxPositions: (config as any).maxPositions || 1,
        tradingCycleIntervalMs: 1000,
        orderType: 'LIMIT',
      };

      // Use riskManagement config - fail fast if not configured
      const rm = this.config.riskManagement;
      if (!rm) {
        throw new Error('riskManagement config is required but not provided');
      }
      const riskConfigForExit: any = {
        takeProfits: rm.takeProfits,
        stopLossPercent: rm.stopLossPercent,
        breakevenOffsetPercent: rm.breakevenOffsetPercent,
        trailingStopEnabled: rm.trailingStopEnabled,
        trailingStopPercent: rm.trailingStopPercent,
        trailingStopActivationLevel: rm.trailingStopActivationLevel,
        positionSizeUsdt: rm.positionSizeUsdt,
      };

      const fullConfigForExit: any = {
        trading: tradingConfigForExit,
        riskManagement: riskConfigForExit,
        exchange: { symbol: 'APEXUSDT' },
        timeframes: {},
        strategies: {},
        strategy: {},
        indicators: {},
        logging: {},
        system: {},
        dataSubscriptions: { candles: { enabled: true, calculateIndicators: true }, orderbook: { enabled: false, updateIntervalMs: 5000 }, ticks: { enabled: false, calculateDelta: false } },
        entryConfirmation: {},
      };

      // For read-only mode, create a dummy TelegramService if not available
      const telegramForExit = this.telegram || {
        sendAlert: () => Promise.resolve(),
        notifyPositionOpened: () => Promise.resolve(),
        notifyTakeProfitHit: () => Promise.resolve(),
      } as any;

      this.positionExitingService = new PositionExitingService(
        this.bybitService,
        telegramForExit,
        logger,
        this.tradingJournal,
        tradingConfigForExit,
        riskConfigForExit,
        fullConfigForExit,
        this.sessionStats,
        null, // TakeProfitManager (not required for read-only mode)
      );
      this.logger.info('✅ PositionExitingService initialized (PHASE 4 Week 3, ACTIVE)', {
        role: 'Position exit execution',
        mode: 'ACTIVE - handling all position exits',
        consolidates: ['PositionManagerService.closePosition()', 'PositionManagerService.recordPositionClose()', 'SL updates', 'Trailing stops'],
      });
    } else {
      this.logger.warn('⚠️  PositionExitingService NOT initialized - missing dependencies', {
        hasTradingJournal: !!this.tradingJournal,
        hasBybitService: !!this.bybitService,
      });
    }

    // Week 13: Initialize MarketDataPreparationService (extracted market data aggregation)
    // Dynamic import to avoid circular dependencies
    const MarketDataPrepModule = require('./market-data-preparation.service') as any;
    const MarketDataPrep = MarketDataPrepModule.MarketDataPreparationService;
    this.marketDataPreparationService = new MarketDataPrep(
      config,
      candleProvider,
      timeframeProvider,
      bybitService,
      logger,
      this.rsiAnalyzer,
      this.emaAnalyzer,
      this.atrIndicator,
      this.zigzagNRIndicator,
      this.liquidityDetector,
      this.divergenceDetector,
      this.breakoutPredictor,
      this.stochasticIndicator,
      this.bollingerIndicator,
      deltaAnalyzerService,
      orderbookImbalanceService,
    );
    this.logger.info('✅ MarketDataPreparationService initialized (Week 13)', {
      role: 'Market data aggregation and indicator calculation',
      responsibility: ['Fetch and organize candles', 'Calculate technical indicators', 'Prepare strategy data'],
    });

    // Week 13: Initialize TradingContextService (extracted trend analysis)
    const TradingContextModule = require('./trading-context.service') as any;
    const TradingContext = TradingContextModule.TradingContextService;
    this.tradingContextService = new TradingContext(
      candleProvider,
      this.trendAnalyzer,
      logger,
    );
    this.logger.info('✅ TradingContextService initialized (Week 13)', {
      role: 'Trend analysis and signal filtering',
      responsibility: ['Update trend analysis on PRIMARY candle close', 'Filter signals by trend alignment'],
    });

    // CRITICAL: Trend analysis will be initialized in initializeAfterConstruction()
    // This prevents the ~5 minute wait for first PRIMARY candle close

    // Week 13: Initialize ExternalAnalysisService (extracted external data analysis)
    const ExternalAnalysisModule = require('./external-analysis.service') as any;
    const ExternalAnalysis = ExternalAnalysisModule.ExternalAnalysisService;
    this.externalAnalysisService = new ExternalAnalysis(
      this.bybitService,
      candleProvider,
      this.btcAnalyzer,
      this.fundingRateFilter,
      this.flatMarketDetector,
      logger,
      this.config.btcConfirmation,
      this.config.fundingRateFilter,
      this.config.flatMarketDetection,
    );
    this.logger.info('✅ ExternalAnalysisService initialized (Week 13)', {
      role: 'External data analysis and filtering',
      responsibility: ['Analyze BTC correlation', 'Check funding rates', 'Detect flat market conditions'],
    });

    // Week 13: Initialize SignalProcessingService (extracted signal processing pipeline)
    const SignalProcessingModule = require('./signal-processing.service') as any;
    const SignalProcessing = SignalProcessingModule.SignalProcessingService;
    this.signalProcessingService = new SignalProcessing(
      this.strategyCoordinator,
      this.trendConfirmationService,
      this.riskCalculator,
      logger,
      this.config,
    );
    this.logger.info('✅ SignalProcessingService initialized (Week 13)', {
      role: 'Signal collection, filtering, and aggregation',
      responsibility: ['Collect and filter signals', 'Apply trend confirmation', 'Generate entry signals'],
    });

    // Week 13: Initialize TradeExecutionService (extracted trade execution pipeline)
    const TradeExecutionModule = require('./trade-execution.service') as any;
    const TradeExecution = TradeExecutionModule.TradeExecutionService;
    this.tradeExecutionService = new TradeExecution(
      this.bybitService,
      this.positionManager,
      candleProvider,
      this.riskManager,
      this.retestEntryService,
      this.externalAnalysisService,
      this.telegram,
      logger,
      this.config,
      this.rsiAnalyzer,
      this.emaAnalyzer,
      this.liquidityDetector,
      this.entryOrchestrator, // PHASE 6: EntryOrchestrator for atomic entry decisions
    );
    this.logger.info('✅ TradeExecutionService initialized (Week 13)', {
      role: 'Pre-trade checks and position opening',
      responsibility: ['Risk management', 'BTC/funding checks', 'Position execution'],
    });

    // Week 13 Phase 5d: Initialize EntryLogicService (extracted entry scanning pipeline)
    const EntryLogicModule = require('./entry-logic.service') as any;
    const EntryLogic = EntryLogicModule.EntryLogicService;
    this.entryLogicService = new EntryLogic(
      config,
      this.positionManager,
      this.bollingerIndicator,
      candleProvider,
      this.emaAnalyzer,
      this.currentContext,
      this.retestEntryService,
      this.marketDataPreparationService,
      this.externalAnalysisService,
      this.analyzerRegistry,
      this.strategyCoordinator,
      this.signalProcessingService,
      this.tradeExecutionService,
      bybitService,
      logger,
    );
    this.logger.info('✅ EntryLogicService initialized (Week 13 Phase 5d)', {
      role: 'ENTRY candle scanning pipeline',
      responsibility: ['Signal collection', 'Strategy evaluation', 'Entry confirmation', 'Trade execution'],
    });

    // Week 13 Phase 5e: Initialize WhaleSignalDetectionService (extracted whale signal detection)
    const WhaleSignalDetModule = require('./whale-signal-detection.service') as any;
    const WhaleSignalDet = WhaleSignalDetModule.WhaleSignalDetectionService;
    this.whaleSignalDetectionService = new WhaleSignalDet(
      this.strategyCoordinator,
      this.positionManager,
      this.marketDataPreparationService,
      this.tradeExecutionService,
      logger,
    );
    this.logger.info('✅ WhaleSignalDetectionService initialized (Week 13 Phase 5e)', {
      role: 'Real-time whale signal detection',
      responsibility: ['Whale strategy evaluation', 'Real-time signal processing', 'Immediate trade execution'],
    });

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
    // Link BTC candles to AnalyzerRegistrationService for BTC_CORRELATION analyzer
    if (this.analyzerRegistration) {
      this.analyzerRegistration.setBtcCandlesStore(store);
    }
    // Link BTC candles to ExternalAnalysisService for BTC analysis
    if (this.externalAnalysisService) {
      (this.externalAnalysisService as any).setBtcCandlesStore(store);
    }
    this.logger.info('🔗 BTC candles store linked to TradingOrchestrator');
  }

  /**
   * Initialize trend analysis from loaded candles
   * CRITICAL: Called immediately after candles are loaded to prevent ~5 minute startup delay
   * This allows trend analysis to be available immediately instead of waiting for first PRIMARY candle close
   */
  async initializeTrendAnalysis(): Promise<void> {
    try {
      this.logger.info('📍 TradingOrchestrator.initializeTrendAnalysis() called');
      if (this.tradingContextService) {
        this.logger.info('🚀 Initializing trend analysis from loaded candles...');
        await this.tradingContextService.initializeTrendAnalysis();
        this.logger.info('✅ TradingContextService.initializeTrendAnalysis() completed');
      } else {
        this.logger.warn('⚠️ TradingContextService not available');
      }
    } catch (error) {
      this.logger.error('Failed to initialize trend analysis', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Non-fatal error - continue without initial trend analysis
      // It will be available on first PRIMARY candle close
    }
  }

  /**
   * Handle candle close event
   * Called by Bot when candle closes on any timeframe
   * Week 13 Phase 5d: Thin dispatcher - delegates to specialized services
   */
  async onCandleClosed(role: TimeframeRole, candle: Candle): Promise<void> {
    try {
      // PRIMARY closed → Update trend analysis + evaluate exits
      if (role === TimeframeRole.PRIMARY) {
        this.logger.info('📊 PRIMARY candle closed - updating trend analysis');
        await this.tradingContextService!.updateTrendContext();

        // PHASE 4 Week 3: Evaluate exit conditions with orchestrator
        const currentPosition = this.positionManager.getCurrentPosition();
        if (currentPosition && this.exitOrchestrator && this.positionExitingService) {
          try {
            // Gather indicators for advanced exit features (Smart Breakeven, SmartTrailingV2)
            const indicators = {
              ema20: this.emaAnalyzer ? (await this.emaAnalyzer.calculate(TimeframeRole.PRIMARY))?.fast : undefined,
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

      // ENTRY closed → Scan for entry (delegated to EntryLogicService)
      if (role === TimeframeRole.ENTRY) {
        await this.entryLogicService!.scanForEntries(candle);
      }
    } catch (error) {
      this.logger.error('Error in orchestrator onCandleClosed', {
        role,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
    // Delegated to WhaleSignalDetectionService (Week 13 Phase 5e)
    await this.whaleSignalDetectionService!.checkWhaleSignalRealtime(
      orderbook,
      this.currentContext,
    );
  }

  /**
   * Get current context (for monitoring/debugging)
   */
  getCurrentContext(): TradingContext | null {
    return this.currentContext;
  }
  /**
   * Get all registered strategies
   */
  getStrategies(): IStrategy[] {
    return this.strategyCoordinator.getStrategies();
  }

}
