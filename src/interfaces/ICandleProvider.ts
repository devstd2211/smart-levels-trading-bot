/**
 * Candle Data Provider Interface
 *
 * Abstracts candle data retrieval and caching
 * Can be implemented with file, database, or API source
 */

import type { Candle } from '../types/core';

/**
 * Candle provider interface
 * Handles candle retrieval and caching across timeframes
 */
export interface ICandleProvider {
  /**
   * Get candles for a symbol and timeframe
   * Returns from cache if available, fetches if not
   */
  getCandles(symbol: string, timeframe: string, limit: number): Promise<Candle[]>;

  /**
   * Get the latest candle
   */
  getLatest(symbol: string, timeframe: string): Promise<Candle | null>;

  /**
   * Get candle at specific index (0 = latest, 1 = previous, etc)
   */
  getCandleAt(symbol: string, timeframe: string, index: number): Candle | null;

  /**
   * Check if candle data is ready for a timeframe
   */
  isReady(symbol: string, timeframe: string): boolean;

  /**
   * Clear cache for timeframe
   */
  clearCache(symbol: string, timeframe: string): void;

  /**
   * Clear all caches
   */
  clearAllCaches(): void;

  /**
   * Get cache size in bytes (for memory monitoring)
   */
  getCacheSize(): number;
}
