/**
 * Orchestrator Initialization Service
 *
 * Extracted from TradingOrchestrator constructor to support Single Responsibility Principle.
 * Responsible for initializing all 50+ orchestrator services in 8 distinct phases.
 *
 * Pattern: Follows IndicatorInitializationService / FilterInitializationService
 * - Constructor: accepts config + all dependencies
 * - Main method: initializeOrchestrator() - returns typed result
 * - Private methods: one per initialization phase
 *
 * Benefits:
 * - TradingOrchestrator constructor reduced from 394 to 20 lines
 * - Clear separation of concerns: initialization vs business logic
 * - Easy to test each phase independently
 * - Easy to modify initialization order or dependencies
 */

import {
  LoggerService,
  OrchestratorConfig,
  ATRIndicator,
  ZigZagNRIndicator,
  StochasticIndicator,
  BollingerBandsIndicator,
  LiquidityDetector,
  DivergenceDetector,
  BreakoutPredictor,
  PriceMomentumAnalyzer,
  BTCAnalyzer,
  FlatMarketDetector,
  MarketStructureAnalyzer,
  TrendAnalyzer,
} from '../types';

import { CandleProvider } from '../providers/candle.provider';
import { TimeframeProvider } from '../providers/timeframe.provider';
import { BybitService } from './bybit';
import { PositionLifecycleService } from './position-lifecycle.service';
import { TelegramService } from './telegram.service';
import { TradingJournalService } from './trading-journal.service';
import { SessionStatsService } from './session-stats.service';

import { EntryScanner } from '../analyzers/entry.scanner';
import { MultiTimeframeRSIAnalyzer } from '../analyzers/multi-timeframe-rsi.analyzer';
import { MultiTimeframeEMAAnalyzer } from '../analyzers/multi-timeframe-ema.analyzer';

import { StrategyCoordinator } from './strategy-coordinator.service';
import { AnalyzerRegistry } from './analyzer-registry.service';
import { AnalyzerRegistrationService } from './analyzer-registration.service';
import { RiskCalculator } from './risk-calculator.service';
import { FundingRateFilterService } from './funding-rate-filter.service';
import { TrendConfirmationService } from './trend-confirmation.service';

import { RetestEntryService } from './retest-entry.service';
import { DeltaAnalyzerService } from './delta-analyzer.service';
import { OrderbookImbalanceService } from './orderbook-imbalance.service';
import { VolumeProfileService } from './volume-profile.service';

import { SwingPointDetectorService } from './swing-point-detector.service';
import { MultiTimeframeTrendService } from './multi-timeframe-trend.service';
import { TimeframeWeightingService } from './timeframe-weighting.service';

import { IndicatorInitializationService, InitializedIndicators } from './indicator-initialization.service';
import { FilterInitializationService, InitializedFilters } from './filter-initialization.service';
import { StrategyRegistrationService } from './strategy-registration.service';

import { RiskManager } from './risk-manager.service';
import { EntryOrchestrator } from '../orchestrators/entry.orchestrator';
import { NeutralTrendStrengthFilter } from '../filters/neutral-trend-strength.filter';
import { ExitOrchestrator } from '../orchestrators/exit.orchestrator';
import { PositionExitingService } from './position-exiting.service';

import { MarketDataPreparationService } from './market-data-preparation.service';
import { TradingContextService } from './trading-context.service';
import { ExternalAnalysisService } from './external-analysis.service';
import { SignalProcessingService } from './signal-processing.service';
import { TradeExecutionService } from './trade-execution.service';

import { EntryLogicService } from './entry-logic.service';
import { WhaleSignalDetectionService } from './whale-signal-detection.service';

/**
 * Typed result of orchestrator initialization
 * Contains all 50+ orchestrator services organized by responsibility
 */
export interface InitializedOrchestratorServices {
  // Indicators (from IndicatorInitializationService)
  entryScanner: EntryScanner;
  rsiAnalyzer: MultiTimeframeRSIAnalyzer;
  emaAnalyzer: MultiTimeframeEMAAnalyzer;
  atrIndicator: ATRIndicator;
  zigzagNRIndicator: ZigZagNRIndicator;
  liquidityDetector: LiquidityDetector;
  divergenceDetector: DivergenceDetector;
  breakoutPredictor: BreakoutPredictor;
  stochasticIndicator?: StochasticIndicator;
  bollingerIndicator?: BollingerBandsIndicator;

  // Filters (from FilterInitializationService)
  btcAnalyzer: BTCAnalyzer | null;
  fundingRateFilter: FundingRateFilterService | null;
  flatMarketDetector: FlatMarketDetector | null;
  trendConfirmationService: TrendConfirmationService | null;

  // Core analyzers
  priceMomentumAnalyzer: PriceMomentumAnalyzer;
  strategyCoordinator: StrategyCoordinator;
  analyzerRegistry: AnalyzerRegistry;
  riskCalculator: RiskCalculator;

  // Registrations
  analyzerRegistration: AnalyzerRegistrationService;
  strategyRegistration: StrategyRegistrationService;

  // Market structure & trend
  marketStructureAnalyzer: MarketStructureAnalyzer;
  trendAnalyzer: TrendAnalyzer | null;

  // Orchestrators
  entryOrchestrator: EntryOrchestrator;
  exitOrchestrator: ExitOrchestrator;

  // Position exiting
  positionExitingService: PositionExitingService | null;

  // Optional services
  retestEntryService: RetestEntryService | null;
  deltaAnalyzerService: DeltaAnalyzerService | null;
  orderbookImbalanceService: OrderbookImbalanceService | null;
  volumeProfileService: VolumeProfileService | null;

  // Service pipeline
  marketDataPreparationService: MarketDataPreparationService;
  tradingContextService: TradingContextService;
  externalAnalysisService: ExternalAnalysisService;
  signalProcessingService: SignalProcessingService;
  tradeExecutionService: TradeExecutionService;

  // Entry services
  entryLogicService: EntryLogicService;
  whaleSignalDetectionService: WhaleSignalDetectionService;
}

/**
 * OrchestratorInitializationService
 *
 * Responsible for initializing all orchestrator services in correct dependency order.
 * Follows the same pattern as IndicatorInitializationService and FilterInitializationService.
 */
export class OrchestratorInitializationService {
  constructor(
    private config: OrchestratorConfig,
    private candleProvider: CandleProvider,
    private timeframeProvider: TimeframeProvider,
    private bybitService: BybitService,
    private positionManager: PositionLifecycleService,
    private telegram: TelegramService | null,
    private logger: LoggerService,
    private riskManager: RiskManager,
    // Optional parameters
    private retestEntryService?: RetestEntryService,
    private deltaAnalyzerService?: DeltaAnalyzerService,
    private orderbookImbalanceService?: OrderbookImbalanceService,
    private trendAnalyzer?: TrendAnalyzer,
    private tradingJournal?: TradingJournalService,
    private sessionStats?: SessionStatsService,
  ) {}

  /**
   * Initialize all orchestrator services and return them as a typed result
   *
   * Execution flow:
   * Phase 1: Indicators & Filters (independent, can be cached)
   * Phase 2: Core Analyzers (simple single-instance services)
   * Phase 3: Registrations (register all analyzers + strategies)
   * Phase 4: Market Structure & Trend (primary components)
   * Phase 5: Orchestrators (entry + exit decision points)
   * Phase 6: Position Exiting (optional, requires journal + bybit)
   * Phase 7: Service Pipeline (9 services: market data, context, external, signals, execution)
   * Phase 8: Entry Services (entry logic + whale detection)
   */
  initializeOrchestrator(): InitializedOrchestratorServices {
    // Phase 1: Indicators
    const { indicators, filters } = this.initializeIndicatorsAndFilters();

    // Phase 2: Core analyzers
    const coreAnalyzers = this.initializeCoreAnalyzers();

    // Phase 3: Registration services
    const registrations = this.initializeRegistrations(indicators, filters, coreAnalyzers);

    // Phase 4: Market structure & trend
    const { marketStructure, trend } = this.initializeMarketStructureAndTrend();

    // Phase 5: Orchestrators
    const orchestrators = this.initializeOrchestrators();

    // Phase 6: Position exiting
    const positionExiting = this.initializePositionExiting();

    // Phase 7: Service pipeline
    const pipeline = this.initializeServicePipeline(indicators, filters, trend, orchestrators, coreAnalyzers);

    // Phase 8: Entry & whale services
    const entry = this.initializeEntryServices(indicators, filters, pipeline, orchestrators, coreAnalyzers);

    return {
      // Indicators & Filters
      ...indicators,
      ...filters,

      // Core analyzers
      ...coreAnalyzers,

      // Registrations
      ...registrations,

      // Market structure & trend
      marketStructureAnalyzer: marketStructure,
      trendAnalyzer: trend,

      // Orchestrators
      ...orchestrators,

      // Position exiting
      positionExitingService: positionExiting,

      // Service pipeline
      ...pipeline,

      // Entry services
      ...entry,
    };
  }

  // ===================================================================
  // PHASE 1: INDICATORS & FILTERS
  // ===================================================================

  private initializeIndicatorsAndFilters(): {
    indicators: InitializedIndicators;
    filters: InitializedFilters;
  } {
    // Use existing IndicatorInitializationService
    const indicatorInit = new IndicatorInitializationService(
      this.config,
      this.candleProvider,
      this.timeframeProvider,
      this.logger,
    );
    const indicators = indicatorInit.initializeAllIndicators();

    // Use existing FilterInitializationService
    const filterInit = new FilterInitializationService(
      this.config,
      this.candleProvider,
      this.bybitService,
      this.logger,
    );
    const filters = filterInit.initializeAllFilters();

    return { indicators, filters };
  }

  // ===================================================================
  // PHASE 2: CORE ANALYZERS
  // ===================================================================

  private initializeCoreAnalyzers() {
    const priceMomentumAnalyzer = new PriceMomentumAnalyzer();
    this.logger.info('✅ PriceMomentumAnalyzer initialized for real-time momentum validation');

    const strategyCoordinator = new StrategyCoordinator(this.logger);

    const analyzerRegistry = new AnalyzerRegistry(this.logger);
    this.logger.info('✅ Analyzer Registry initialized for unified weighted voting system');

    const riskCalculator = new RiskCalculator(this.logger);
    this.logger.info('✅ Risk Calculator initialized for consistent SL/TP calculation');

    return {
      priceMomentumAnalyzer,
      strategyCoordinator,
      analyzerRegistry,
      riskCalculator,
    };
  }

  // ===================================================================
  // PHASE 3: REGISTRATIONS
  // ===================================================================

  private initializeRegistrations(
    indicators: InitializedIndicators,
    filters: InitializedFilters,
    coreAnalyzers: ReturnType<typeof this.initializeCoreAnalyzers>,
  ) {
    // Register all analyzers
    const analyzerRegistration = new AnalyzerRegistrationService(
      coreAnalyzers.analyzerRegistry,
      this.logger,
      this.config,
      indicators.rsiAnalyzer,
      indicators.emaAnalyzer,
      coreAnalyzers.priceMomentumAnalyzer,
      indicators.atrIndicator,
      indicators.liquidityDetector,
      indicators.divergenceDetector,
      indicators.breakoutPredictor,
      filters.btcAnalyzer,
      indicators.stochasticIndicator,
      indicators.bollingerIndicator,
      filters.flatMarketDetector,
      this.deltaAnalyzerService,
      this.orderbookImbalanceService,
    );
    analyzerRegistration.registerAllAnalyzers();

    // Register all strategies
    const strategyRegistration = new StrategyRegistrationService(
      coreAnalyzers.strategyCoordinator,
      this.config,
      this.bybitService,
      this.logger,
    );
    strategyRegistration.registerAllStrategies();

    return {
      analyzerRegistration,
      strategyRegistration,
    };
  }

  // ===================================================================
  // PHASE 4: MARKET STRUCTURE & TREND
  // ===================================================================

  private initializeMarketStructureAndTrend() {
    // Initialize Market Structure Analyzer
    const marketStructureAnalyzer = new MarketStructureAnalyzer(
      this.config.analysisConfig?.marketStructure || {
        chochAlignedBoost: 1.3,
        chochAgainstPenalty: 0.5,
        bosAlignedBoost: 1.1,
        bosAgainstPenalty: 0.8,
        noModification: 1.0,
      },
      this.logger,
    );
    this.logger.info('✅ Market Structure Analyzer initialized (TrendAnalyzer dependency)');

    // Initialize TrendAnalyzer
    let trendAnalyzer: TrendAnalyzer | null = null;
    if (this.trendAnalyzer) {
      trendAnalyzer = this.trendAnalyzer;
    } else if (marketStructureAnalyzer) {
      const swingPointDetector = new SwingPointDetectorService(this.logger, 2);
      const multiTimeframeTrendService = new MultiTimeframeTrendService(this.logger, swingPointDetector);
      const timeframeWeightingService = new TimeframeWeightingService(this.logger);

      trendAnalyzer = new TrendAnalyzer(
        marketStructureAnalyzer,
        this.logger,
        swingPointDetector,
        multiTimeframeTrendService,
        timeframeWeightingService,
      );
    }

    if (trendAnalyzer) {
      this.logger.info('✅ TrendAnalyzer initialized (PHASE 4 PRIMARY)', {
        role: 'Global trend detection - runs FIRST in pipeline',
        blocks: ['LONG in BEARISH trend', 'SHORT in BULLISH trend'],
      });
    }

    return {
      marketStructure: marketStructureAnalyzer,
      trend: trendAnalyzer,
    };
  }

  // ===================================================================
  // PHASE 5: ORCHESTRATORS
  // ===================================================================

  private initializeOrchestrators() {
    this.logger.info('✅ RiskManager initialized (PHASE 4 PRIMARY)', {
      role: 'Unified atomic risk decision point',
      checks: ['Daily loss limits', 'Loss streak penalties', 'Concurrent risk', 'Position sizing'],
    });

    const neutralTrendFilter = new NeutralTrendStrengthFilter(this.logger, 0.7);
    const entryOrchestrator = new EntryOrchestrator(this.riskManager, this.logger, neutralTrendFilter);
    this.logger.info('✅ EntryOrchestrator initialized (PHASE 4 PRIMARY Week 2)', {
      role: 'Single atomic entry decision point',
      consolidates: ['EntryScanner', 'FastEntryService', 'EntryConfirmationManager', 'StrategyCoordinator entry logic'],
      logic: ['Signal ranking by confidence', 'Trend alignment check', 'NEUTRAL trend strength check', 'RiskManager approval'],
      optimization: 'SHORT entries filtered on weak NEUTRAL trends (strength < 40%)',
    });

    const exitOrchestrator = new ExitOrchestrator(this.logger);
    this.logger.info('✅ ExitOrchestrator initialized (PHASE 4 PRIMARY Week 3)', {
      role: 'Position exit state machine',
      consolidates: ['SmartBreakevenService', 'SmartTrailingV2Service', 'AdaptiveTP3Service', 'PositionLifecycleService exit logic'],
      states: ['OPEN', 'TP1_HIT', 'TP2_HIT', 'TP3_HIT', 'CLOSED'],
      logic: ['State transitions', 'SL priority', 'Breakeven lock-in', 'Trailing stop activation'],
    });

    return {
      entryOrchestrator,
      exitOrchestrator,
    };
  }

  // ===================================================================
  // PHASE 6: POSITION EXITING
  // ===================================================================

  private initializePositionExiting(): PositionExitingService | null {
    if (!this.tradingJournal || !this.bybitService) {
      this.logger.warn('⚠️  PositionExitingService NOT initialized - missing dependencies', {
        hasTradingJournal: !!this.tradingJournal,
        hasBybitService: !!this.bybitService,
      });
      return null;
    }

    // Create minimal config objects for PositionExitingService
    const tradingConfigForExit: any = {
      leverage: (this.config as any).leverage || 10,
      riskPercent: (this.config as any).riskPercent || 2,
      maxPositions: (this.config as any).maxPositions || 1,
      tradingCycleIntervalMs: 1000,
      orderType: 'LIMIT',
    };

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
      dataSubscriptions: {
        candles: { enabled: true, calculateIndicators: true },
        orderbook: { enabled: false, updateIntervalMs: 5000 },
        ticks: { enabled: false, calculateDelta: false },
      },
      entryConfirmation: {},
    };

    const telegramForExit = this.telegram || {
      sendAlert: () => Promise.resolve(),
      notifyPositionOpened: () => Promise.resolve(),
      notifyTakeProfitHit: () => Promise.resolve(),
    };

    const positionExitingService = new PositionExitingService(
      this.bybitService,
      telegramForExit as any,
      this.logger,
      this.tradingJournal,
      tradingConfigForExit,
      riskConfigForExit,
      fullConfigForExit,
      this.sessionStats,
      this.positionManager,
    );

    this.logger.info('✅ PositionExitingService initialized (PHASE 4 Week 3, ACTIVE)', {
      role: 'Position exit execution',
      mode: 'ACTIVE - handling all position exits',
      consolidates: [
        'PositionLifecycleService.closeFullPosition()',
        'PositionLifecycleService.closePartialPosition()',
        'SL updates',
        'Trailing stops',
      ],
    });

    return positionExitingService;
  }

  // ===================================================================
  // PHASE 7: SERVICE PIPELINE
  // ===================================================================

  private initializeServicePipeline(
    indicators: InitializedIndicators,
    filters: InitializedFilters,
    trendAnalyzer: TrendAnalyzer | null,
    orchestrators: ReturnType<typeof this.initializeOrchestrators>,
    coreAnalyzers: ReturnType<typeof this.initializeCoreAnalyzers>,
  ) {
    // Optional services
    const retestEntryService = this.retestEntryService || null;
    if (retestEntryService) {
      this.logger.info('🎯 Retest Entry Service enabled', {
        minImpulsePercent: this.config.retestEntry?.minImpulsePercent,
        retestZone: this.config.retestEntry
          ? `${this.config.retestEntry.retestZoneFibStart}%-${this.config.retestEntry.retestZoneFibEnd}%`
          : 'N/A',
        maxRetestWaitMs: this.config.retestEntry?.maxRetestWaitMs,
      });
    }

    const deltaAnalyzerService = this.deltaAnalyzerService || null;
    if (deltaAnalyzerService) {
      this.logger.info('📊 Delta Analyzer Service enabled (PHASE 4)', {
        windowSizeMs: this.config.delta?.windowSizeMs,
        minDeltaThreshold: this.config.delta?.minDeltaThreshold,
      });
    }

    // Initialize Volume Profile Service
    let volumeProfileService: VolumeProfileService | null = null;
    if (this.config.volumeProfile?.enabled) {
      volumeProfileService = new VolumeProfileService(this.config.volumeProfile, this.logger);
      this.logger.info('📊 Volume Profile Service initialized', {
        lookbackCandles: this.config.volumeProfile.lookbackCandles,
        valueAreaPercent: this.config.volumeProfile.valueAreaPercent,
        priceTickSize: this.config.volumeProfile.priceTickSize,
      });
    }

    // MarketDataPreparationService
    const marketDataPreparationService = new MarketDataPreparationService(
      this.config,
      this.candleProvider,
      this.timeframeProvider,
      this.bybitService,
      this.logger,
      indicators.rsiAnalyzer,
      indicators.emaAnalyzer,
      indicators.atrIndicator,
      indicators.zigzagNRIndicator,
      indicators.liquidityDetector,
      indicators.divergenceDetector,
      indicators.breakoutPredictor,
      indicators.stochasticIndicator,
      indicators.bollingerIndicator,
      deltaAnalyzerService || undefined,
      this.orderbookImbalanceService || undefined,
    );
    this.logger.info('✅ MarketDataPreparationService initialized (Week 13)', {
      role: 'Market data aggregation and indicator calculation',
      responsibility: ['Fetch and organize candles', 'Calculate technical indicators', 'Prepare strategy data'],
    });

    // TradingContextService
    const tradingContextService = new TradingContextService(
      this.candleProvider,
      trendAnalyzer,
      this.logger,
    );
    this.logger.info('✅ TradingContextService initialized (Week 13)', {
      role: 'Trend analysis and signal filtering',
      responsibility: ['Update trend analysis on PRIMARY candle close', 'Filter signals by trend alignment'],
    });

    // ExternalAnalysisService
    const externalAnalysisService = new ExternalAnalysisService(
      this.bybitService,
      this.candleProvider,
      filters.btcAnalyzer,
      filters.fundingRateFilter,
      filters.flatMarketDetector,
      this.logger,
      this.config.btcConfirmation,
      this.config.fundingRateFilter,
      this.config.flatMarketDetection,
    );
    this.logger.info('✅ ExternalAnalysisService initialized (Week 13)', {
      role: 'External data analysis and filtering',
      responsibility: ['Analyze BTC correlation', 'Check funding rates', 'Detect flat market conditions'],
    });

    // SignalProcessingService
    const signalProcessingService = new SignalProcessingService(
      coreAnalyzers.strategyCoordinator,
      filters.trendConfirmationService,
      coreAnalyzers.riskCalculator,
      this.logger,
      this.config,
    );
    this.logger.info('✅ SignalProcessingService initialized (Week 13)', {
      role: 'Signal collection, filtering, and aggregation',
      responsibility: ['Collect and filter signals', 'Apply trend confirmation', 'Generate entry signals'],
    });

    // TradeExecutionService
    const tradeExecutionService = new TradeExecutionService(
      this.bybitService,
      this.positionManager,
      this.candleProvider,
      this.riskManager,
      retestEntryService,
      externalAnalysisService,
      this.telegram,
      this.logger,
      this.config,
      indicators.rsiAnalyzer,
      indicators.emaAnalyzer,
      indicators.liquidityDetector,
      orchestrators.entryOrchestrator,
    );
    this.logger.info('✅ TradeExecutionService initialized (Week 13)', {
      role: 'Pre-trade checks and position opening',
      responsibility: ['Risk management', 'BTC/funding checks', 'Position execution'],
    });

    return {
      retestEntryService,
      deltaAnalyzerService,
      orderbookImbalanceService: this.orderbookImbalanceService || null,
      volumeProfileService,
      marketDataPreparationService,
      tradingContextService,
      externalAnalysisService,
      signalProcessingService,
      tradeExecutionService,
    };
  }

  // ===================================================================
  // PHASE 8: ENTRY SERVICES
  // ===================================================================

  private initializeEntryServices(
    indicators: InitializedIndicators,
    filters: InitializedFilters,
    pipeline: ReturnType<typeof this.initializeServicePipeline>,
    orchestrators: ReturnType<typeof this.initializeOrchestrators>,
    coreAnalyzers: ReturnType<typeof this.initializeCoreAnalyzers>,
  ) {
    // EntryLogicService
    const entryLogicService = new EntryLogicService(
      this.config,
      this.positionManager,
      indicators.bollingerIndicator,
      this.candleProvider,
      indicators.emaAnalyzer,
      pipeline.tradingContextService,
      pipeline.retestEntryService,
      pipeline.marketDataPreparationService,
      pipeline.externalAnalysisService,
      coreAnalyzers.analyzerRegistry,
      coreAnalyzers.strategyCoordinator,
      pipeline.signalProcessingService,
      pipeline.tradeExecutionService,
      this.bybitService,
      this.logger,
    );
    this.logger.info('✅ EntryLogicService initialized (Week 13 Phase 5d)', {
      role: 'ENTRY candle scanning pipeline',
      responsibility: ['Signal collection', 'Strategy evaluation', 'Entry confirmation', 'Trade execution'],
    });

    // WhaleSignalDetectionService
    const whaleSignalDetectionService = new WhaleSignalDetectionService(
      coreAnalyzers.strategyCoordinator,
      this.positionManager,
      pipeline.marketDataPreparationService,
      pipeline.tradeExecutionService,
      this.logger,
    );
    this.logger.info('✅ WhaleSignalDetectionService initialized (Week 13 Phase 5e)', {
      role: 'Real-time whale signal detection',
      responsibility: ['Whale strategy evaluation', 'Real-time signal processing', 'Immediate trade execution'],
    });

    return {
      entryLogicService,
      whaleSignalDetectionService,
    };
  }
}
