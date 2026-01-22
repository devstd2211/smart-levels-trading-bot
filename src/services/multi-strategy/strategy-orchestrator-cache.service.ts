/**
 * STRATEGY ORCHESTRATOR CACHE SERVICE
 *
 * Phase 10.3: Isolated TradingOrchestrator Per Strategy (Simplified)
 *
 * Maintains a cache of TradingOrchestrator instances, one per active strategy.
 * Uses existing TradingOrchestrator creation mechanisms rather than trying to
 * recreate all dependencies from scratch.
 *
 * Design Pattern: Cache + Facade
 * Responsibility:
 * - Cache TradingOrchestrator instances by strategyId
 * - Manage orchestrator lifecycle (create, cache, destroy)
 * - Support strategy switching with fast retrieval
 * - Cleanup resources when strategy is unloaded
 *
 * This is the simplified, practical approach to Phase 10.3 that works with
 * the real codebase architecture rather than against it.
 */

import type { LoggerService } from '../../types';

/**
 * Cache entry for a strategy's orchestrator
 */
interface CacheEntry {
  strategyId: string;
  orchestrator: any; // TradingOrchestrator - using any to avoid circular deps
  createdAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
}

/**
 * Strategy Orchestrator Cache Service
 *
 * Maintains per-strategy TradingOrchestrator instances
 */
export class StrategyOrchestratorCacheService {
  private cache = new Map<string, CacheEntry>();
  private maxCacheSize = 10; // Max strategies to cache simultaneously

  constructor(private logger: LoggerService) {
    this.logger.debug('[StrategyOrchestratorCache] Initialized');
  }

  /**
   * Get cached orchestrator for a strategy
   *
   * @param strategyId Strategy identifier
   * @returns Cached orchestrator or undefined if not cached
   */
  getOrchestrator(strategyId: string): any | undefined {
    const entry = this.cache.get(strategyId);

    if (entry) {
      entry.lastAccessedAt = new Date();
      entry.accessCount++;
      this.logger.debug(
        `[StrategyOrchestratorCache] Cache hit for ${strategyId} (${entry.accessCount} accesses)`
      );
      return entry.orchestrator;
    }

    return undefined;
  }

  /**
   * Cache an orchestrator for a strategy
   *
   * @param strategyId Strategy identifier
   * @param orchestrator TradingOrchestrator instance
   */
  cacheOrchestrator(strategyId: string, orchestrator: any): void {
    // Check cache size and evict LRU if needed
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLRU();
    }

    const entry: CacheEntry = {
      strategyId,
      orchestrator,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 1,
    };

    this.cache.set(strategyId, entry);
    this.logger.debug(
      `[StrategyOrchestratorCache] Cached orchestrator for ${strategyId} (cache size: ${this.cache.size})`
    );
  }

  /**
   * Remove orchestrator from cache
   *
   * @param strategyId Strategy identifier
   */
  removeOrchestrator(strategyId: string): void {
    const removed = this.cache.delete(strategyId);
    if (removed) {
      this.logger.debug(
        `[StrategyOrchestratorCache] Removed orchestrator for ${strategyId} (cache size: ${this.cache.size})`
      );
    }
  }

  /**
   * Check if orchestrator is cached
   *
   * @param strategyId Strategy identifier
   * @returns true if cached
   */
  isCached(strategyId: string): boolean {
    return this.cache.has(strategyId);
  }

  /**
   * Clear all cached orchestrators
   */
  clearAll(): void {
    this.logger.info(`[StrategyOrchestratorCache] Clearing ${this.cache.size} cached orchestrators`);
    this.cache.clear();
  }

  /**
   * Get cache statistics
   *
   * @returns Statistics object
   */
  getStats(): {
    cacheSize: number;
    strategies: Array<{
      strategyId: string;
      accessCount: number;
      age: number; // milliseconds
      timeSinceAccess: number; // milliseconds
    }>;
  } {
    const now = Date.now();
    const strategies = Array.from(this.cache.values()).map(entry => ({
      strategyId: entry.strategyId,
      accessCount: entry.accessCount,
      age: now - entry.createdAt.getTime(),
      timeSinceAccess: now - entry.lastAccessedAt.getTime(),
    }));

    return {
      cacheSize: this.cache.size,
      strategies,
    };
  }

  /**
   * Get all cached strategy IDs
   *
   * @returns Array of strategy IDs
   */
  getCachedStrategies(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Evict Least Recently Used orchestrator from cache
   * Used when cache reaches max size
   */
  private evictLRU(): void {
    let lruEntry: CacheEntry | null = null;
    let lruStrategyId: string | null = null;

    for (const [strategyId, entry] of this.cache.entries()) {
      if (
        lruEntry === null ||
        entry.lastAccessedAt.getTime() < lruEntry.lastAccessedAt.getTime()
      ) {
        lruEntry = entry;
        lruStrategyId = strategyId;
      }
    }

    if (lruStrategyId) {
      this.logger.warn(
        `[StrategyOrchestratorCache] Evicting LRU entry: ${lruStrategyId}`
      );
      this.cache.delete(lruStrategyId);
    }
  }

  /**
   * Initialize with max cache size
   *
   * @param size Maximum number of orchestrators to cache
   */
  setMaxCacheSize(size: number): void {
    if (size < 1) {
      throw new Error('Max cache size must be at least 1');
    }
    this.maxCacheSize = size;
    this.logger.debug(`[StrategyOrchestratorCache] Set max cache size to ${size}`);
  }

  /**
   * Get max cache size
   *
   * @returns Max cache size
   */
  getMaxCacheSize(): number {
    return this.maxCacheSize;
  }
}
