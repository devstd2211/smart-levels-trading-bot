/**
 * ORCHESTRATOR INITIALIZATION SERVICE - NEW VERSION
 *
 * Initializes all orchestrator services using NEW architecture:
 * - Strategy-driven (no hardcoded analyzers)
 * - Lazy loading (only analyzers from strategy)
 * - Type-safe ConfigNew
 */

import type { LoggerService } from './logger.service';
import type { OrchestratorConfig } from '../types';

import { CandleProvider } from '../providers/candle.provider';
import { TimeframeProvider } from '../providers/timeframe.provider';
import { BybitService } from './bybit';
import { PositionLifecycleService } from './position-lifecycle.service';
import { TelegramService } from './telegram.service';
import { TradingJournalService } from './trading-journal.service';
import { SessionStatsService } from './session-stats.service';

import { StrategyCoordinator } from './strategy-coordinator.service';
import { AnalyzerRegistry } from './analyzer-registry.service';
import { StrategyManagerService } from './strategy-manager.service';
import { StrategyLoaderService } from './strategy-loader.service';
import { StrategyConfigMergerService } from './strategy-config-merger.service';
import { ConfigNew } from '../types/config-new.types';

/**
 * Result of orchestrator initialization
 */
export interface OrchestratorInitResult {
  strategyManager: StrategyManagerService;
  analyzerRegistry: AnalyzerRegistry;
  strategyCoordinator: StrategyCoordinator;
  candleProvider: CandleProvider;
  timeframeProvider: TimeframeProvider;
  positionLifecycle: PositionLifecycleService;
  bybit: BybitService;
  telegram: TelegramService;
  tradingJournal: TradingJournalService;
  sessionStats: SessionStatsService;
}

export class OrchestratorInitializationService {
  constructor(private logger: LoggerService) {}

  /**
   * Initialize orchestrator with strategy-driven architecture
   *
   * @param config - Main configuration
   * @param strategyName - Name of strategy to load
   * @param bybitService - Bybit API service
   * @param telegramService - Telegram service
   * @returns All initialized services
   */
  async initializeOrchestrator(
    config: ConfigNew,
    strategyName: string,
    bybitService: BybitService,
    telegramService: TelegramService,
  ): Promise<OrchestratorInitResult> {
    this.logger.info('[Init] Starting orchestrator initialization (NEW architecture)');

    // ========== PHASE 1: Strategy Loading ==========
    this.logger.info('[Init] Phase 1: Loading strategy...');
    const strategyLoader = new StrategyLoaderService();
    const strategyMerger = new StrategyConfigMergerService();
    const strategyManager = new StrategyManagerService(strategyLoader, strategyMerger);

    await strategyManager.initialize(strategyName, config);
    this.logger.info(`[Init] ✅ Strategy loaded: ${strategyManager.getStrategyName()}`);

    // ========== PHASE 2: Providers ==========
    this.logger.info('[Init] Phase 2: Initializing data providers...');
    const candleProvider = new CandleProvider(config, this.logger);
    const timeframeProvider = new TimeframeProvider(config, this.logger);
    this.logger.info('[Init] ✅ Data providers initialized');

    // ========== PHASE 3: Analyzer Registry ==========
    this.logger.info('[Init] Phase 3: Initializing analyzer registry with strategy...');
    const analyzerRegistry = new AnalyzerRegistry(
      strategyManager.getMergedConfig(),
      strategyManager.getStrategy(),
      this.logger,
    );
    this.logger.info(
      `[Init] ✅ Analyzer registry ready (${strategyManager.getEnabledAnalyzers().length} analyzers loaded)`,
    );

    // ========== PHASE 4: Strategy Coordinator ==========
    this.logger.info('[Init] Phase 4: Initializing strategy coordinator...');
    const strategyCoordinator = new StrategyCoordinator(
      strategyManager.getStrategy(),
      this.logger,
    );
    this.logger.info('[Init] ✅ Strategy coordinator initialized with strategy weights');

    // ========== PHASE 5: Trading Infrastructure ==========
    this.logger.info('[Init] Phase 5: Initializing trading infrastructure...');
    const positionLifecycle = new PositionLifecycleService(
      config,
      bybitService,
      this.logger,
    );
    this.logger.info('[Init] ✅ Position lifecycle initialized');

    // ========== PHASE 6: Trading Journal & Stats ==========
    this.logger.info('[Init] Phase 6: Initializing logging services...');
    const tradingJournal = new TradingJournalService(config, this.logger);
    const sessionStats = new SessionStatsService(this.logger);
    this.logger.info('[Init] ✅ Logging services initialized');

    this.logger.info('[Init] ✅ ALL PHASES COMPLETE - Orchestrator ready!');

    return {
      strategyManager,
      analyzerRegistry,
      strategyCoordinator,
      candleProvider,
      timeframeProvider,
      positionLifecycle,
      bybit: bybitService,
      telegram: telegramService,
      tradingJournal,
      sessionStats,
    };
  }
}
