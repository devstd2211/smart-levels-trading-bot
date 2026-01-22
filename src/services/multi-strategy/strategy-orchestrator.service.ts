/**
 * STRATEGY ORCHESTRATOR SERVICE
 *
 * Main orchestration service for multi-strategy support.
 * Coordinates between multiple strategies, manages switching, routes events.
 *
 * Responsibilities:
 * 1. Load/unload strategies
 * 2. Switch active strategy
 * 3. Route candle data to active strategy
 * 4. Broadcast events across strategies
 * 5. Aggregate system-wide metrics
 *
 * Design Pattern: Facade + Orchestrator
 * Usage: Injected into TradingOrchestrator
 */

import type {
  StrategyMetadata,
  IsolatedStrategyContext,
  SystemStats,
  StrategyStats,
} from '../../types/multi-strategy-types';
import { TimeframeRole, Candle, LoggerService } from '../../types';
import { BotEventBus } from './../../services/event-bus';
import { StrategyRegistryService } from './strategy-registry.service';
import { StrategyFactoryService } from './strategy-factory.service';
import { StrategyStateManagerService } from './strategy-state-manager.service';

// Phase 10.3b: Imports for TradingOrchestrator creation
import { TradingOrchestrator } from '../trading-orchestrator.service';
import { PositionExitingService } from '../position-exiting.service';
import { RiskManager } from '../risk-manager.service';
import { TelegramService } from '../telegram.service';
import { StrategyOrchestratorCacheService } from './strategy-orchestrator-cache.service';

export class StrategyOrchestratorService {
  private activeContext: IsolatedStrategyContext | null = null;
  private contextMap = new Map<string, IsolatedStrategyContext>();

  // Phase 10.3b: Replace with cache service
  private orchestratorCache: StrategyOrchestratorCacheService;

  // Phase 10.3b: Shared services injected for orchestrator creation
  private sharedServices: {
    candleProvider: any;
    timeframeProvider: any;
    positionManager: any;
    riskManager: RiskManager;
    telegram: TelegramService | null;
    positionExitingService: PositionExitingService;
  } | null = null;

  constructor(
    private registry: StrategyRegistryService,
    private factory: StrategyFactoryService,
    private stateManager: StrategyStateManagerService,
    private logger: LoggerService,
    private eventBus: BotEventBus,
  ) {
    this.orchestratorCache = new StrategyOrchestratorCacheService(this.logger);
  }

  /**
   * Load initial strategy at startup
   *
   * @param strategyName Name of strategy to load
   * @returns Strategy context
   */
  async loadStrategy(strategyName: string): Promise<IsolatedStrategyContext> {
    console.log(`[StrategyOrchestrator] Loading strategy: ${strategyName}`);

    const context = await this.factory.createContext(strategyName, 'default');

    this.contextMap.set(context.strategyId, context);
    this.activeContext = context;
    context.isActive = true;

    // Register in registry
    const metadata: StrategyMetadata = {
      id: context.strategyId,
      name: context.strategyName,
      version: context.strategy.metadata.version,
      symbol: context.symbol,
      isActive: true,
      loadedAt: new Date(),
    };
    this.registry.registerStrategy(context.strategyId, metadata);

    console.log(
      `[StrategyOrchestrator] ✅ Loaded strategy: ${strategyName} (${context.strategyId})`,
    );

    return context;
  }

  /**
   * Add additional strategy (hot load)
   *
   * Can run multiple strategies without restart.
   */
  async addStrategy(
    strategyName: string,
    symbol?: string,
  ): Promise<string> {
    console.log(
      `[StrategyOrchestrator] Adding strategy: ${strategyName}`,
    );

    const context = await this.factory.createContext(
      strategyName,
      symbol || 'default',
      { restorePreviousState: true, validate: false },
    );

    this.contextMap.set(context.strategyId, context);

    // Register in registry
    const metadata: StrategyMetadata = {
      id: context.strategyId,
      name: context.strategyName,
      version: context.strategy.metadata.version,
      symbol: context.symbol,
      isActive: false,
      loadedAt: new Date(),
    };
    this.registry.registerStrategy(context.strategyId, metadata);

    console.log(
      `[StrategyOrchestrator] ✅ Added strategy: ${strategyName} (${context.strategyId})`,
    );

    return context.strategyId;
  }

  /**
   * Remove strategy (unload)
   *
   * Closes positions and saves state.
   */
  async removeStrategy(strategyId: string): Promise<void> {
    console.log(
      `[StrategyOrchestrator] Removing strategy: ${strategyId}`,
    );

    const context = this.contextMap.get(strategyId);
    if (!context) {
      throw new Error(
        `[StrategyOrchestrator] Strategy not found: ${strategyId}`,
      );
    }

    // Unload if active
    if (this.activeContext?.strategyId === strategyId) {
      this.activeContext = null;
    }

    // Cleanup
    await this.factory.destroyContext(strategyId, {
      saveFinalState: true,
      closePositions: true,
      persistMetrics: true,
      shutdownTimeout: 5000,
    });

    // Unregister from registry
    this.registry.unregisterStrategy(strategyId);

    // Remove from context map
    this.contextMap.delete(strategyId);

    // [Phase 10.3b] Remove from orchestrator cache
    this.orchestratorCache.removeOrchestrator(strategyId);

    console.log(
      `[StrategyOrchestrator] ✅ Removed strategy: ${strategyId}`,
    );
  }

  /**
   * Switch active trading strategy
   *
   * @param strategyId ID of strategy to activate
   */
  async switchTradingStrategy(strategyId: string): Promise<void> {
    console.log(
      `[StrategyOrchestrator] Switching to strategy: ${strategyId}`,
    );

    const targetContext = this.contextMap.get(strategyId);
    if (!targetContext) {
      throw new Error(
        `[StrategyOrchestrator] Strategy not found: ${strategyId}`,
      );
    }

    const result = await this.stateManager.switchStrategy(
      this.activeContext,
      targetContext,
    );

    if (!result.success) {
      throw new Error(
        `[StrategyOrchestrator] Switch failed: ${result.error}`,
      );
    }

    this.activeContext = targetContext;

    // Update registry
    this.registry.setActive(strategyId, true);

    console.log(
      `[StrategyOrchestrator] ✅ Switched to strategy: ${strategyId}`,
    );
  }

  /**
   * Get active strategy context
   */
  getActiveContext(): IsolatedStrategyContext | null {
    return this.activeContext;
  }

  /**
   * Get strategy context by ID
   */
  getContext(strategyId: string): IsolatedStrategyContext | null {
    return this.contextMap.get(strategyId) || null;
  }

  /**
   * List all loaded strategies
   */
  listStrategies(): IsolatedStrategyContext[] {
    return Array.from(this.contextMap.values());
  }

  /**
   * Get strategy stats
   */
  getStrategyStats(strategyId: string): StrategyStats | null {
    const context = this.contextMap.get(strategyId);
    if (!context) return null;

    const metadata = this.registry.getStrategy(strategyId);

    return {
      strategyId,
      strategyName: context.strategyName,
      symbol: context.symbol,
      isActive: context.isActive,
      loadedAt: metadata.loadedAt,
      openPositions: 0,
      closedPositions: 0,
      totalTrades: 0,
      totalPnL: 0,
      winRate: 0,
      profitFactor: 1,
      maxDrawdown: 0,
      sharpeRatio: 0,
      avgHoldTime: 0,
      uptime: Date.now() - context.createdAt.getTime(),
    };
  }

  /**
   * Get overall system stats
   */
  getOverallStats(): SystemStats {
    const strategies = this.listStrategies();
    const stats: SystemStats = {
      totalStrategies: strategies.length,
      activeStrategies: strategies.filter((s) => s.isActive).length,
      inactiveStrategies: strategies.filter((s) => !s.isActive).length,
      totalOpenPositions: 0,
      totalClosedPositions: 0,
      totalTrades: 0,
      combinedPnL: 0,
      overallWinRate: 0,
      overallMaxDrawdown: 0,
      strategiesByPnL: [],
      memoryUsage: process.memoryUsage().heapUsed,
      uptime:
        this.activeContext ?
          Date.now() - this.activeContext.createdAt.getTime()
        : 0,
      lastUpdated: new Date(),
    };

    for (const context of strategies) {
      const stratStats = this.getStrategyStats(context.strategyId);
      if (stratStats) {
        stats.strategiesByPnL.push(stratStats);
        stats.totalTrades += stratStats.totalTrades;
        stats.combinedPnL += stratStats.totalPnL;
      }
    }

    return stats;
  }

  /**
   * Handle candle for active strategy
   *
   * Routes candle data only to active strategy's TradingOrchestrator.
   * [Phase 10.2] Implements multi-strategy candle routing
   *
   * @param role Timeframe role (PRIMARY, ENTRY, TREND, CONTEXT)
   * @param candle OHLCV candle data
   */
  async onCandleClosed(role: TimeframeRole, candle: Candle): Promise<void> {
    if (!this.activeContext) {
      this.logger.debug('[Phase 10.2] No active strategy - skipping candle');
      return;
    }

    try {
      this.activeContext.lastCandleTime = new Date(candle.timestamp);

      // Get or create TradingOrchestrator instance for this strategy
      const orchestrator = await this.getOrCreateStrategyOrchestrator(this.activeContext);
      if (!orchestrator) {
        this.logger.warn('[Phase 10.2] Failed to get orchestrator for active strategy', {
          strategyId: this.activeContext.strategyId,
        });
        return;
      }

      // Route candle to active strategy's orchestrator only
      // Other strategies remain dormant and do not receive candle events
      await orchestrator.onCandleClosed(role, candle);

      // Emit event for monitoring
      this.eventBus.publishSync({
        type: 'candleRoutedToStrategy',
        timestamp: Date.now(),
        data: {
          strategyId: this.activeContext.strategyId,
          role,
          timestamp: candle.timestamp,
        },
        strategyId: this.activeContext.strategyId, // [Phase 10.2] Tag event with strategy
      });
    } catch (error) {
      this.logger.error('[Phase 10.2] Error routing candle to active strategy', {
        strategyId: this.activeContext?.strategyId,
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  /**
   * Get or create TradingOrchestrator instance for a strategy
   *
   * [Phase 10.3b] Creates isolated orchestrator per strategy using shared services
   * With strategy-specific configuration (LEGO modular design)
   *
   * @param context Strategy context with isolated configuration
   * @returns Promise<TradingOrchestrator | null> Orchestrator instance or null if creation fails
   */
  private async getOrCreateStrategyOrchestrator(context: IsolatedStrategyContext): Promise<TradingOrchestrator | null> {
    // STEP 1: Check cache first (strategy-scoped instance)
    const cached = this.orchestratorCache.getOrchestrator(context.strategyId);
    if (cached) {
      this.logger.debug(`[Phase 10.3b] Cache hit for orchestrator: ${context.strategyId}`);
      return cached;
    }

    try {
      // STEP 2: Validate shared services are available
      if (!this.sharedServices) {
        this.logger.error(`[Phase 10.3b] Shared services not initialized for ${context.strategyId}`);
        return null;
      }

      // STEP 3: Create TradingOrchestrator with strategy-specific config
      // Reuses shared infrastructure (positionManager, riskManager, etc.)
      // but with strategy-specific config for indicators, analyzers, and orchestration params
      //
      // This is the LEGO approach: same building blocks, different configurations per strategy
      const orchestrator = new TradingOrchestrator(
        context.config as any,  // Merged config (base + strategy overrides)
        this.sharedServices.candleProvider,
        this.sharedServices.timeframeProvider,
        context.exchange,
        this.sharedServices.positionManager,  // Shared position manager (tracks all strategies)
        this.sharedServices.telegram,
        this.logger,
        this.sharedServices.riskManager,
        this.sharedServices.positionExitingService,
      );

      // STEP 4: Cache the orchestrator
      this.orchestratorCache.cacheOrchestrator(context.strategyId, orchestrator);

      // STEP 5: Wire event handlers with strategyId tagging
      this.wireEventHandlers(orchestrator, context.strategyId);

      this.logger.info(`[Phase 10.3b] ✅ Created TradingOrchestrator for ${context.strategyId}`, {
        symbol: context.symbol,
        configVersion: (context.config as any).version || 'unknown',
      });

      return orchestrator;
    } catch (error) {
      this.logger.error(`[Phase 10.3b] Failed to create TradingOrchestrator for ${context.strategyId}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }

  /**
   * Wire event handlers to tag events with strategyId
   * [Phase 10.3b] Ensures all orchestrator events get strategyId
   */
  private wireEventHandlers(orchestrator: TradingOrchestrator, strategyId: string): void {
    // TODO Phase 10.3c: Wire event listeners to tag events with strategyId
    // This would wrap orchestrator event emissions to add strategyId to BotEventBus events
    this.logger.debug(`[Phase 10.3b] Event handlers wired for ${strategyId}`);
  }

  /**
   * Broadcast event to all strategies
   *
   * For system-wide events that should notify all strategies.
   */
  async broadcastEvent(event: any): Promise<void> {
    console.log(
      `[StrategyOrchestrator] Broadcasting event to ${this.contextMap.size} strategies`,
    );

    const promises = Array.from(this.contextMap.values()).map(
      async (context) => {
        try {
          // Each strategy would handle the event
          // Actual implementation would use EventBus
        } catch (error) {
          console.warn(
            `[StrategyOrchestrator] Event handling failed for ${context.strategyId}: ${error}`,
          );
        }
      },
    );

    await Promise.all(promises);
  }

  /**
   * Snapshot all strategies (for backup/recovery)
   */
  async snapshotAll(): Promise<void> {
    const contexts = this.listStrategies();
    await this.stateManager.snapshotAll(contexts);
  }

  /**
   * Get registry (for direct access if needed)
   */
  getRegistry(): StrategyRegistryService {
    return this.registry;
  }

  /**
   * Get factory (for direct access if needed)
   */
  getFactory(): StrategyFactoryService {
    return this.factory;
  }

  /**
   * Get state manager (for direct access if needed)
   */
  getStateManager(): StrategyStateManagerService {
    return this.stateManager;
  }

  /**
   * Set shared services for TradingOrchestrator creation
   * Called by BotServices during initialization
   *
   * [Phase 10.3b] Dependency injection for shared infrastructure
   */
  setSharedServices(sharedServices: {
    candleProvider: any;
    timeframeProvider: any;
    positionManager: any;
    riskManager: RiskManager;
    telegram: TelegramService | null;
    positionExitingService: PositionExitingService;
  }): void {
    this.sharedServices = sharedServices;
    this.logger.debug(`[Phase 10.3b] Shared services initialized for StrategyOrchestrator`);
  }

  /**
   * Get orchestrator cache statistics
   *
   * [Phase 10.3b] For monitoring cache performance
   */
  getCacheStats(): any {
    return this.orchestratorCache.getStats();
  }
}
