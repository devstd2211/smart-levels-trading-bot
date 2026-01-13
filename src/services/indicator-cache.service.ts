import { IIndicatorCache } from '../types/indicator-cache.interface';

/**
 * Simple LRU cache for pre-calculated indicators
 * Stores: "RSI-14-1h" -> 65, "EMA-20-1h" -> 2.50, etc
 *
 * Features:
 * - LRU eviction when size reaches MAX_SIZE
 * - Invalidation support (remove specific keys)
 * - Clear all on new candle
 */
export class IndicatorCacheService implements IIndicatorCache {
  private cache: Map<string, number> = new Map();
  private readonly MAX_SIZE = 500;

  /**
   * Get cached value
   */
  get(key: string): number | null {
    const value = this.cache.get(key);
    return value !== undefined ? value : null;
  }

  /**
   * Set cached value
   * Evicts LRU entry if cache is full
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
   */
  getStats(): { size: number; capacity: number } {
    return {
      size: this.cache.size,
      capacity: this.MAX_SIZE,
    };
  }
}
