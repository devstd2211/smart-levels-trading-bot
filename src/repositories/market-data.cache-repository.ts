/**
 * Market Data Cache Repository - Phase 6.1
 *
 * In-memory cache for market data (candles, indicators)
 * Features:
 * - TTL-based expiration for indicators
 * - LRU eviction for candles
 * - Fast O(1) lookups
 * - Memory-efficient design
 * - Statistics tracking
 */

import { Candle } from '../types';
import { IMarketDataRepository } from './IRepositories';

/**
 * Cached indicator entry with TTL
 */
interface CachedIndicator {
  value: any;
  timestamp: number;
  ttlMs: number; // Time to live in milliseconds
}

/**
 * In-memory market data cache
 * Stores candles and indicators with smart eviction
 */
export class MarketDataCacheRepository implements IMarketDataRepository {
  // Candle storage: key = "SYMBOL_TIMEFRAME"
  private candles: Map<string, Candle[]> = new Map();

  // Indicator cache with TTL: key = "RSI-14-1h"
  private indicators: Map<string, CachedIndicator> = new Map();

  // Configuration
  private readonly maxCandlesPerTF = 500;
  private readonly maxIndicators = 500;
  private readonly defaultIndicatorTTL = 60000; // 1 minute

  // ============================================================================
  // CANDLE MANAGEMENT
  // ============================================================================

  /**
   * Save candles for a symbol/timeframe
   * Replaces existing candles for that TF
   * @param symbol - Trading symbol (e.g., "XRPUSDT")
   * @param timeframe - Timeframe (e.g., "1h", "5m")
   * @param candles - Array of candles
   */
  saveCandles(symbol: string, timeframe: string, candles: Candle[]): void {
    const key = this.getCandleKey(symbol, timeframe);

    // Keep only latest maxCandlesPerTF candles (LRU eviction)
    const limited = candles.slice(-this.maxCandlesPerTF);
    this.candles.set(key, limited);
  }

  /**
   * Get candles for symbol/timeframe
   * @param symbol - Trading symbol
   * @param timeframe - Timeframe
   * @param limit - Max candles to return (default all)
   * @returns Array of candles
   */
  getCandles(symbol: string, timeframe: string, limit?: number): Candle[] {
    const key = this.getCandleKey(symbol, timeframe);
    const candleList = this.candles.get(key) || [];

    if (limit) {
      return candleList.slice(-limit);
    }

    return candleList;
  }

  /**
   * Get latest candle for symbol/timeframe
   * @param symbol - Trading symbol
   * @param timeframe - Timeframe
   * @returns Latest candle or null
   */
  getLatestCandle(symbol: string, timeframe: string): Candle | null {
    const candles = this.getCandles(symbol, timeframe);
    return candles.length > 0 ? candles[candles.length - 1] : null;
  }

  /**
   * Get candles since specific timestamp
   * @param symbol - Trading symbol
   * @param timeframe - Timeframe
   * @param timestamp - Minimum timestamp
   * @returns Candles with timestamp >= given value
   */
  getCandlesSince(symbol: string, timeframe: string, timestamp: number): Candle[] {
    const candles = this.getCandles(symbol, timeframe);
    return candles.filter(c => c.timestamp >= timestamp);
  }

  // ============================================================================
  // INDICATOR CACHING (TTL-based)
  // ============================================================================

  /**
   * Cache indicator result with TTL
   * @param key - Indicator key (e.g., "RSI-14-1h")
   * @param value - Calculated indicator value
   * @param ttlMs - Time to live in milliseconds (default 60s)
   */
  cacheIndicator(key: string, value: any, ttlMs: number = this.defaultIndicatorTTL): void {
    // Evict old indicators if over limit
    if (this.indicators.size >= this.maxIndicators) {
      this.evictOldestIndicator();
    }

    this.indicators.set(key, {
      value,
      timestamp: Date.now(),
      ttlMs,
    });
  }

  /**
   * Get cached indicator
   * Returns null if not found or expired
   * @param key - Indicator key
   * @returns Cached value or null
   */
  getIndicator(key: string): any | null {
    const cached = this.indicators.get(key);

    if (!cached) {
      return null;
    }

    // Check if expired
    const age = Date.now() - cached.timestamp;
    if (age > cached.ttlMs) {
      this.indicators.delete(key);
      return null;
    }

    return cached.value;
  }

  /**
   * Check if indicator exists and is not expired
   * @param key - Indicator key
   * @returns true if cached and not expired
   */
  hasIndicator(key: string): boolean {
    return this.getIndicator(key) !== null;
  }

  // ============================================================================
  // CACHE MAINTENANCE
  // ============================================================================

  /**
   * Clear all expired indicators
   * @returns Number of indicators cleared
   */
  clearExpiredIndicators(): number {
    const now = Date.now();
    let cleared = 0;

    for (const [key, cached] of this.indicators.entries()) {
      const age = now - cached.timestamp;
      if (age > cached.ttlMs) {
        this.indicators.delete(key);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Clear candles older than specified time
   * @returns Number of candles cleared
   */
  clearExpiredCandles(): number {
    // For now, we don't have timestamp filtering for candles
    // They're managed by LRU eviction instead
    return 0;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.candles.clear();
    this.indicators.clear();
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get repository size in bytes (approximate)
   * @returns Approximate size in bytes
   */
  getSize(): number {
    let size = 0;

    // Count candle bytes
    for (const candleList of this.candles.values()) {
      size += candleList.length * this.estimateCandleSize();
    }

    // Count indicator bytes
    for (const indicator of this.indicators.values()) {
      size += this.estimateIndicatorSize(indicator.value);
    }

    return size;
  }

  /**
   * Get cache statistics
   * @returns Statistics object
   */
  getStats(): {
    candleCount: number;
    indicatorCount: number;
    sizeBytes: number;
  } {
    let totalCandles = 0;
    for (const candleList of this.candles.values()) {
      totalCandles += candleList.length;
    }

    return {
      candleCount: totalCandles,
      indicatorCount: this.indicators.size,
      sizeBytes: this.getSize(),
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Get candle cache key
   */
  private getCandleKey(symbol: string, timeframe: string): string {
    return `${symbol}_${timeframe}`;
  }

  /**
   * Evict oldest indicator (FIFO)
   */
  private evictOldestIndicator(): void {
    let oldest: [string, CachedIndicator] | null = null;

    for (const entry of this.indicators.entries()) {
      if (!oldest || entry[1].timestamp < oldest[1].timestamp) {
        oldest = entry;
      }
    }

    if (oldest) {
      this.indicators.delete(oldest[0]);
    }
  }

  /**
   * Estimate size of candle in bytes
   * Rough estimation: OHLCV + timestamp = ~80 bytes
   */
  private estimateCandleSize(): number {
    return 80;
  }

  /**
   * Estimate size of indicator value
   * Numbers: ~8 bytes each, Arrays: ~24 + value*8
   */
  private estimateIndicatorSize(value: any): number {
    if (typeof value === 'number') return 8;
    if (Array.isArray(value)) return 24 + value.length * 8;
    if (typeof value === 'object') return 100; // Rough estimate for objects
    return 16; // Default
  }
}
