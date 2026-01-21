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
import { StrategyRegistryService } from './strategy-registry.service';
import { StrategyFactoryService } from './strategy-factory.service';
import { StrategyStateManagerService } from './strategy-state-manager.service';

export class StrategyOrchestratorService {
  private activeContext: IsolatedStrategyContext | null = null;
  private contextMap = new Map<string, IsolatedStrategyContext>();

  constructor(
    private registry: StrategyRegistryService,
    private factory: StrategyFactoryService,
    private stateManager: StrategyStateManagerService,
  ) {}

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
      { restorePreviousState: true },
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
   * Routes candle data only to active strategy.
   */
  async onCandleClosed(candle: any): Promise<void> {
    if (!this.activeContext) {
      return; // No active strategy
    }

    this.activeContext.lastCandleTime = new Date();

    // Route to active strategy's decision engine
    // Actual implementation would call TradingOrchestrator with active context
    console.log(
      `[StrategyOrchestrator] Routing candle to ${this.activeContext.strategyId}`,
    );
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
}
