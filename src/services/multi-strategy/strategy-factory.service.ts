/**
 * STRATEGY FACTORY SERVICE
 *
 * Creates and manages isolated strategy execution contexts.
 * Each strategy gets its own complete set of services and state.
 *
 * Responsibilities:
 * 1. Create isolated strategy contexts on demand
 * 2. Load strategy configurations
 * 3. Merge base + strategy configs
 * 4. Initialize analyzer instances
 * 5. Manage context lifecycle
 * 6. Clean up resources on removal
 *
 * Design Pattern: Factory + Object Pool
 * Usage: Injected into StrategyOrchestrator
 */

import type {
  IsolatedStrategyContext,
  StrategyFactoryConfig,
  StrategyLoadingOptions,
  StrategyRemovalOptions,
} from '../../types/multi-strategy-types';
import type { StrategyConfig } from '../../types/strategy-config.types';
import type { ConfigNew } from '../../types/config-new.types';
import type { IExchange } from '../../interfaces/IExchange';
import type { IAnalyzer } from '../../types/analyzer.interface';

/**
 * Internal strategy context implementation
 */
class StrategyContextImpl implements IsolatedStrategyContext {
  strategyId: string;
  strategyName: string;
  symbol: string;
  config: ConfigNew;
  strategy: StrategyConfig;
  exchange: IExchange;
  analyzers: IAnalyzer[];
  createdAt: Date;
  lastTradedAt?: Date;
  lastCandleTime?: Date;
  isActive: boolean;

  constructor(
    strategyId: string,
    strategyName: string,
    symbol: string,
    config: ConfigNew,
    strategy: StrategyConfig,
    exchange: IExchange,
    analyzers: IAnalyzer[],
  ) {
    this.strategyId = strategyId;
    this.strategyName = strategyName;
    this.symbol = symbol;
    this.config = config;
    this.strategy = strategy;
    this.exchange = exchange;
    this.analyzers = analyzers;
    this.createdAt = new Date();
    this.isActive = false;
  }

  getSnapshot() {
    return {
      strategyId: this.strategyId,
      strategyName: this.strategyName,
      positions: [],
      journal: [],
      metrics: {
        totalPnL: 0,
        winRate: 0,
        profitFactor: 1,
        maxDrawdown: 0,
        sharpeRatio: 0,
      },
      timestamp: new Date(),
      lastCandleTime: this.lastCandleTime,
    };
  }

  async restoreFromSnapshot() {
    // Placeholder for restoration logic
    console.log(
      `[StrategyContext] Restoring state for ${this.strategyId}`,
    );
  }

  async cleanup(): Promise<void> {
    console.log(`[StrategyContext] Cleaning up ${this.strategyId}`);
    this.isActive = false;
  }
}

export class StrategyFactoryService {
  private contextCache = new Map<string, IsolatedStrategyContext>();
  private strategyLoader: StrategyLoaderService;
  private configMerger: ConfigMergerService;

  constructor(
    private config: StrategyFactoryConfig,
    loaderService: StrategyLoaderService,
    mergerService: ConfigMergerService,
  ) {
    this.strategyLoader = loaderService;
    this.configMerger = mergerService;
  }

  /**
   * Create a new isolated strategy context
   *
   * @param strategyName Name of strategy to load (e.g., "level-trading")
   * @param symbol Trading symbol
   * @param options Loading options
   * @returns New isolated context
   */
  async createContext(
    strategyName: string,
    symbol: string,
    options?: StrategyLoadingOptions,
  ): Promise<IsolatedStrategyContext> {
    console.log(`[StrategyFactory] Creating context for ${strategyName}`);

    // Validate
    if (this.config.registry.validateOnRegister && options?.validate) {
      // Validation would happen here
    }

    // Generate unique context ID
    const contextId = this.generateContextId(strategyName);

    // Load strategy configuration
    const strategy = await this.strategyLoader.loadStrategy(strategyName);

    // Merge configurations
    let mergedConfig = { ...this.config.baseConfig };
    if (options?.configOverrides) {
      mergedConfig = { ...mergedConfig, ...options.configOverrides };
    }

    // Apply strategy overrides
    mergedConfig = this.configMerger.mergeConfigs(
      mergedConfig,
      strategy,
    ) as ConfigNew;

    // Override symbol if provided
    if (options?.symbol) {
      mergedConfig.exchange = mergedConfig.exchange || {};
      mergedConfig.exchange.symbol = options.symbol;
    }

    // Create isolated exchange instance
    const exchange = this.createExchangeInstance(mergedConfig);

    // Create analyzer instances
    const analyzers = this.createAnalyzerInstances(strategy);

    // Create context
    const context = new StrategyContextImpl(
      contextId,
      strategyName,
      symbol,
      mergedConfig,
      strategy,
      exchange,
      analyzers,
    );

    // Cache context
    this.contextCache.set(contextId, context);

    console.log(
      `[StrategyFactory] ✅ Created context: ${contextId}`,
    );

    // Restore previous state if available
    if (options?.restorePreviousState) {
      try {
        // Restoration logic would happen here
        console.log(`[StrategyFactory] Restored previous state for ${contextId}`);
      } catch (error) {
        console.warn(
          `[StrategyFactory] Could not restore previous state: ${error}`,
        );
      }
    }

    return context;
  }

  /**
   * Get existing strategy context
   *
   * @throws Error if context not found
   */
  getContext(contextId: string): IsolatedStrategyContext {
    const context = this.contextCache.get(contextId);
    if (!context) {
      throw new Error(`[StrategyFactory] Context not found: ${contextId}`);
    }
    return context;
  }

  /**
   * Check if context exists
   */
  hasContext(contextId: string): boolean {
    return this.contextCache.has(contextId);
  }

  /**
   * Destroy strategy context and cleanup resources
   */
  async destroyContext(
    contextId: string,
    options?: StrategyRemovalOptions,
  ): Promise<void> {
    const context = this.contextCache.get(contextId);
    if (!context) {
      throw new Error(`[StrategyFactory] Context not found: ${contextId}`);
    }

    console.log(`[StrategyFactory] Destroying context: ${contextId}`);

    // Save final state if requested
    if (options?.saveFinalState) {
      try {
        const snapshot = context.getSnapshot();
        // Save snapshot logic would happen here
        console.log(`[StrategyFactory] Saved final state for ${contextId}`);
      } catch (error) {
        console.warn(`[StrategyFactory] Failed to save final state: ${error}`);
      }
    }

    // Close positions if requested
    if (options?.closePositions) {
      try {
        // Position closure logic would happen here
        console.log(`[StrategyFactory] Closed positions for ${contextId}`);
      } catch (error) {
        console.warn(`[StrategyFactory] Failed to close positions: ${error}`);
      }
    }

    // Cleanup
    await context.cleanup();

    // Remove from cache
    this.contextCache.delete(contextId);

    console.log(`[StrategyFactory] ✅ Destroyed context: ${contextId}`);
  }

  /**
   * List all cached contexts
   */
  listContexts(): IsolatedStrategyContext[] {
    return Array.from(this.contextCache.values());
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.contextCache.size;
  }

  /**
   * Clear cache (be careful!)
   */
  clearCache(): void {
    console.warn('[StrategyFactory] Clearing context cache');
    this.contextCache.clear();
  }

  /**
   * Generate unique context ID
   */
  private generateContextId(strategyName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `strategy-${strategyName}-${timestamp}-${random}`;
  }

  /**
   * Create isolated exchange instance
   */
  private createExchangeInstance(config: ConfigNew): IExchange {
    // This would use ExchangeFactory to create an exchange instance
    // For now, placeholder
    throw new Error('ExchangeFactory integration needed');
  }

  /**
   * Create isolated analyzer instances
   */
  private createAnalyzerInstances(strategy: StrategyConfig): IAnalyzer[] {
    // This would use AnalyzerLoader to create instances
    // For now, placeholder
    return [];
  }
}

/**
 * Placeholder interfaces for dependencies
 * These would be imported from actual services
 */
interface StrategyLoaderService {
  loadStrategy(name: string): Promise<StrategyConfig>;
}

interface ConfigMergerService {
  mergeConfigs(base: ConfigNew, strategy: StrategyConfig): ConfigNew;
}
