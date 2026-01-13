/**
 * Interface for indicator cache
 * Simple key-value store for pre-calculated indicators
 */
export interface IIndicatorCache {
  /**
   * Get cached indicator value
   * @param key Cache key (e.g., "RSI-14-1h")
   * @returns Cached value or null if not found
   */
  get(key: string): number | null;

  /**
   * Store indicator value in cache
   * @param key Cache key (e.g., "RSI-14-1h")
   * @param value Calculated indicator value
   */
  set(key: string, value: number): void;

  /**
   * Remove indicator from cache (invalidation)
   * @param key Cache key to invalidate
   */
  invalidate(key: string): void;

  /**
   * Clear all cache entries
   */
  clear(): void;

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    capacity: number;
  };
}
