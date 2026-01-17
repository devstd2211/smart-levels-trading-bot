/**
 * CandleProvider
 *
 * Manages multi-timeframe candle caching with separate LRU caches per timeframe.
 * Replaces MarketDataCollectorService for candle management.
 */

import { Candle, TimeframeRole, LoggerService } from '../types';
import type { IExchange } from '../interfaces/IExchange';
import { ArrayLRUCache } from '../utils/lru-cache';
import { TimeframeProvider } from './timeframe.provider';
import { MULTIPLIERS } from '../constants';

interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
}

export class CandleProvider {
  private caches: Map<TimeframeRole, ArrayLRUCache<Candle>>;
  private lastUpdate: Map<TimeframeRole, number>;

  constructor(
    private timeframeProvider: TimeframeProvider,
    private bybitService: IExchange,
    private logger: LoggerService,
    private symbol: string,
  ) {
    this.caches = new Map();
    this.lastUpdate = new Map();
    this.initializeCaches();
  }

  /**
   * Initialize LRU caches for all enabled timeframes
   */
  private initializeCaches(): void {
    const timeframes = this.timeframeProvider.getAllTimeframes();

    for (const [role, config] of timeframes) {
      const cache = new ArrayLRUCache<Candle>(config.candleLimit);
      this.caches.set(role, cache);
      this.lastUpdate.set(role, 0);

      this.logger.info(`Initialized cache for ${role} (${config.interval}m, limit: ${config.candleLimit})`);
    }
  }

  /**
   * Load initial candles for all timeframes
   */
  async initialize(): Promise<void> {
    this.logger.info('🔄 Loading initial candles for all timeframes...');

    const timeframes = this.timeframeProvider.getAllTimeframes();
    const loadPromises: Promise<void>[] = [];

    for (const [role, config] of timeframes) {
      loadPromises.push(this.loadTimeframeCandles(role, config.interval, config.candleLimit));
    }

    await Promise.all(loadPromises);
    this.logger.info('✅ All timeframe candles loaded successfully');
  }

  /**
   * Load initial candles for a specific timeframe only (SCALPING mode optimization)
   */
  async initializeTimeframe(role: TimeframeRole): Promise<void> {
    this.logger.info(`🔄 Loading initial candles for ${role} only (SCALPING mode)...`);

    const config = this.timeframeProvider.getTimeframe(role);
    if (!config) {
      throw new Error(`Timeframe ${role} not found in config`);
    }

    await this.loadTimeframeCandles(role, config.interval, config.candleLimit);
    this.logger.info(`✅ ${role} candles loaded successfully`);
  }

  /**
   * Load candles for a specific timeframe
   */
  private async loadTimeframeCandles(
    role: TimeframeRole,
    interval: string,
    limit: number,
  ): Promise<void> {
    try {
      this.logger.info(`Loading ${limit} candles for ${role} (${interval}m)...`);

      const candles = await this.bybitService.getCandles({
        symbol: this.symbol,
        timeframe: interval,
        limit,
      });
      const cache = this.caches.get(role);

      if (!cache) {
        throw new Error(`Cache not found for ${role}`);
      }

      // Add all candles to cache
      for (const candle of candles) {
        cache.push(candle);
      }

      this.lastUpdate.set(role, Date.now());

      this.logger.info(`✅ Loaded ${candles.length} candles for ${role}`);
    } catch (error) {
      const errorObj = error instanceof Error ? { error: error.message } : { error: String(error) };
      this.logger.error(`Failed to load candles for ${role}`, errorObj);
      throw error;
    }
  }

  /**
   * Handle candle closed event and update cache
   */
  onCandleClosed(role: TimeframeRole, candle: Candle): void {
    const cache = this.caches.get(role);
    if (!cache) {
      this.logger.warn(`Cache not found for ${role}, skipping update`);
      return;
    }

    cache.push(candle);
    this.lastUpdate.set(role, Date.now());

    this.logger.debug(`📊 Cache updated for ${role}`, {
      timestamp: new Date(candle.timestamp).toISOString(),
      close: candle.close,
    });
  }

  /**
   * Get candles for a specific timeframe
   * @param role - Timeframe role
   * @param limit - Optional limit (defaults to all candles in cache)
   *
   * NOTE: No TTL check - cache is kept fresh via WebSocket onCandleClosed() events
   * Initial load is done at startup via preloadCandles()
   */
  async getCandles(role: TimeframeRole, limit?: number): Promise<Candle[]> {
    const cache = this.caches.get(role);
    if (!cache) {
      throw new Error(`Cache not found for ${role}`);
    }

    // If cache exists, use it (WebSocket keeps it fresh via onCandleClosed)
    const candles = cache.getAll();
    if (candles.length > 0) {
      return limit ? candles.slice(-limit) : candles;
    }

    // Only load from API if cache is empty (should not happen after preload)
    this.logger.warn(`Cache empty for ${role}, loading from API...`);
    const config = this.timeframeProvider.getTimeframe(role);
    if (config) {
      await this.loadTimeframeCandles(role, config.interval, config.candleLimit);
    }

    const refreshedCandles = cache.getAll();
    return limit ? refreshedCandles.slice(-limit) : refreshedCandles;
  }

  /**
   * Get cache metrics for a specific timeframe
   * Note: ArrayLRUCache doesn't track hits/misses internally, so we return basic metrics
   */
  getCacheMetrics(role: TimeframeRole): CacheMetrics | null {
    const cache = this.caches.get(role);
    if (!cache) {
      return null;
    }

    return {
      hits: 0, // Not tracked by ArrayLRUCache
      misses: 0, // Not tracked by ArrayLRUCache
      hitRate: MULTIPLIERS.NEUTRAL, // Assume 100% since we always use cache after initialization
    };
  }

  /**
   * Get cache metrics for all timeframes
   */
  getAllCacheMetrics(): Map<TimeframeRole, CacheMetrics> {
    const metricsMap = new Map<TimeframeRole, CacheMetrics>();

    for (const role of this.caches.keys()) {
      const metrics = this.getCacheMetrics(role);
      if (metrics) {
        metricsMap.set(role, metrics);
      }
    }

    return metricsMap;
  }

  /**
   * Get cache size for a timeframe
   */
  getCacheSize(role: TimeframeRole): number {
    const cache = this.caches.get(role);
    return cache ? cache.size() : 0;
  }

  /**
   * Clear cache for a specific timeframe
   */
  clearCache(role: TimeframeRole): void {
    const cache = this.caches.get(role);
    if (cache) {
      cache.clear();
      this.lastUpdate.set(role, 0);
      this.logger.info(`Cache cleared for ${role}`);
    }
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    for (const role of this.caches.keys()) {
      this.clearCache(role);
    }
    this.logger.info('All caches cleared');
  }
}
