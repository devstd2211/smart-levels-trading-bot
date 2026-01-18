import { IIndicatorCache } from '../types/indicator-cache.interface';

/**
 * Simple LRU cache for pre-calculated indicators
 * Stores: "RSI-14-1h" -> 65, "EMA-20-1h" -> 2.50, etc
 *
 * Features:
 * - LRU eviction when size reaches MAX_SIZE
 * - Invalidation support (remove specific keys)
 * - Clear all on new candle
 * - Hit/Miss tracking for monitoring cache effectiveness
 */
export class IndicatorCacheService implements IIndicatorCache {
  private cache: Map<string, number> = new Map();
  private readonly MAX_SIZE = 500;

  // Metrics for monitoring cache effectiveness
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;

  /**
   * Get cached value
   * Tracks hit/miss metrics for monitoring
   */
  get(key: string): number | null {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.hits++;
      return value;
    }
    this.misses++;
    return null;
  }

  /**
   * Set cached value
   * Evicts LRU entry if cache is full
   * Tracks eviction metrics
   */
  set(key: string, value: number): void {
    // If key already exists, remove it (to update position in Map)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // If cache is full, evict oldest (first entry in Map)
    if (this.cache.size >= this.MAX_SIZE) {
      const oldestKey = this.cache.keys().next().value as string;
      this.cache.delete(oldestKey);
      this.evictions++;
    }

    // Add new entry (Maps maintain insertion order)
    this.cache.set(key, value);
  }

  /**
   * Invalidate specific cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   * Called on new candle or on critical error
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics for monitoring
   * Returns hits, misses, hit rate, evictions, and current state
   */
  getStats(): {
    size: number;
    capacity: number;
    hits: number;
    misses: number;
    hitRate: number;
    evictions: number;
    totalRequests: number;
  } {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;

    return {
      size: this.cache.size,
      capacity: this.MAX_SIZE,
      hits: this.hits,
      misses: this.misses,
      hitRate: parseFloat(hitRate.toFixed(2)),
      evictions: this.evictions,
      totalRequests,
    };
  }

  /**
   * Reset all metrics (useful for session start)
   */
  resetMetrics(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }
}
