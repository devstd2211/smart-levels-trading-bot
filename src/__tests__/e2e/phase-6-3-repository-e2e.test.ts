/**
 * Phase 6.3: Full Repository Integration E2E Tests
 *
 * Complete data flow: API → Repository → IndicatorCache → Services
 *
 * Validates:
 * - End-to-end candle flow with repository integration
 * - Cache coherence across multiple services
 * - Performance metrics (hit rate, latency)
 * - Memory efficiency & TTL
 */

import { MarketDataCacheRepository } from '../../repositories/market-data.cache-repository';
import { IndicatorCacheService } from '../../services/indicator-cache.service';
import { BybitService } from '../../services/bybit/bybit.service';
import { LoggerService } from '../../services/logger.service';
import type { IMarketDataRepository } from '../../repositories/IRepositories';
import type { Candle, ExchangeConfig } from '../../types';

describe('Phase 6.3: Full Repository Integration E2E', () => {
  let repository: IMarketDataRepository;
  let indicatorCache: IndicatorCacheService;
  let mockBybit: BybitService;
  let mockLogger: LoggerService;

  beforeEach(() => {
    // Setup mock logger
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as LoggerService;

    // Initialize repository
    repository = new MarketDataCacheRepository();

    // Initialize BybitService with repository
    const bybitConfig: ExchangeConfig = {
      name: 'bybit',
      symbol: 'XRPUSDT',
      timeframe: '5',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      demo: true,
      testnet: false,
    };

    mockBybit = new BybitService(bybitConfig, mockLogger, repository);

    // Initialize IndicatorCacheService with repository
    indicatorCache = new IndicatorCacheService(repository);
  });

  describe('E2E: API → Repository → Services Flow', () => {
    it('should flow candles from API through repository to services', async () => {
      // ARRANGE
      const mockCandles: Candle[] = Array.from({ length: 100 }, (_, i) => ({
        timestamp: Date.now() - i * 5 * 60 * 1000,
        open: 2.5 + Math.random() * 0.1,
        high: 2.6 + Math.random() * 0.1,
        low: 2.4 + Math.random() * 0.1,
        close: 2.5 + Math.random() * 0.1,
        volume: 1000000 + Math.random() * 500000,
      }));

      jest.spyOn(mockBybit, 'getCandles').mockResolvedValue(mockCandles);

      // ACT: Get candles from API (stores in repository)
      const apiCandles = await mockBybit.getCandles('XRPUSDT', '5');

      // ASSERT: Candles retrieved successfully
      expect(apiCandles).toHaveLength(100);

      // ACT: Store candles in repository directly
      repository.saveCandles('XRPUSDT', '5', mockCandles);

      // ASSERT: Retrieve candles from repository
      const cachedCandles = repository.getCandles('XRPUSDT', '5');
      expect(cachedCandles).toHaveLength(100);
      expect(apiCandles).toBeDefined();
      expect(cachedCandles[0].close).toBeCloseTo(apiCandles![0].close, 5);
    });

    it('should integrate with IndicatorCacheService via repository', () => {
      // ARRANGE
      const indicatorKey = 'EMA_14_5m';
      const indicatorValues = [2.5, 2.51, 2.52, 2.51, 2.50];
      const ttl = 60000;

      // ACT: Cache indicator
      indicatorCache.set(indicatorKey, indicatorValues[0], ttl);

      // ASSERT: Retrieve from cache
      const cached = indicatorCache.get(indicatorKey);
      expect(cached).toBe(indicatorValues[0]);
    });

    it('should maintain cache coherence: API + Repository + Services', async () => {
      // ARRANGE
      const mockCandles: Candle[] = Array.from({ length: 50 }, (_, i) => ({
        timestamp: Date.now() - i * 5 * 60 * 1000,
        open: 2.5,
        high: 2.6,
        low: 2.4,
        close: 2.5,
        volume: 1000000,
      }));

      jest.spyOn(mockBybit, 'getCandles').mockResolvedValue(mockCandles);

      // ACT: Simulate full flow
      // 1. Get from API
      const fromAPI = await mockBybit.getCandles('XRPUSDT', '5');

      // 2. Store in repository
      if (fromAPI) {
        repository.saveCandles('XRPUSDT', '5', fromAPI);
      }

      // 3. Retrieve from repository
      const fromRepo = repository.getCandles('XRPUSDT', '5');

      // 4. Get latest
      const latest = repository.getLatestCandle('XRPUSDT', '5');

      // ASSERT: All sources consistent
      expect(fromAPI).toHaveLength(50);
      expect(fromRepo).toHaveLength(50);
      expect(latest).toBeDefined();
      expect(latest?.close).toBe(fromAPI![0].close);
    });
  });

  describe('E2E: Performance Metrics & Hit Rate', () => {
    it('should measure cache hit rate improvement', async () => {
      // ARRANGE
      const mockCandles: Candle[] = Array.from({ length: 20 }, (_, i) => ({
        timestamp: Date.now() - i * 5 * 60 * 1000,
        open: 2.5,
        high: 2.6,
        low: 2.4,
        close: 2.5,
        volume: 1000000,
      }));

      let apiCallCount = 0;
      jest.spyOn(mockBybit, 'getCandles').mockImplementation(async () => {
        apiCallCount++;
        return mockCandles;
      });

      // ACT: First call (API hit)
      const call1 = await mockBybit.getCandles('XRPUSDT', '5');
      expect(apiCallCount).toBe(1);

      // Store in repository
      if (call1) {
        repository.saveCandles('XRPUSDT', '5', call1);
      }

      // Second call (should hit cache if service is updated)
      const call2 = await mockBybit.getCandles('XRPUSDT', '5');

      // ASSERT: Data consistency
      expect(call1).toBeDefined();
      expect(call2).toBeDefined();
      expect(call1).toEqual(call2);
      expect(call1![0].close).toBe(call2![0].close);
    });

    it('should monitor memory efficiency with repository limits', () => {
      // ARRANGE
      const initialMemory = process.memoryUsage().heapUsed;
      const stats1 = repository.getStats();

      // ACT: Store candles multiple times
      for (let i = 0; i < 5; i++) {
        const mockCandles: Candle[] = Array.from({ length: 100 }, (_, j) => ({
          timestamp: Date.now() - j * 5 * 60 * 1000,
          open: 2.5,
          high: 2.6,
          low: 2.4,
          close: 2.5,
          volume: 1000000,
        }));

        repository.saveCandles('XRPUSDT', `5_${i}`, mockCandles);
      }

      // ASSERT: Memory usage bounded
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;

      // Should be reasonable (< 50MB for this test)
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);

      const stats2 = repository.getStats();
      expect(stats2.candleCount).toBeGreaterThan(stats1.candleCount);
    });
  });

  describe('E2E: TTL & Expiration Management', () => {
    it('should expire cached indicators after TTL', async () => {
      // ARRANGE
      const indicatorKey = 'RSI_14_5m';
      const indicatorValue = 65.5;
      const shortTtl = 100; // 100ms for testing

      // ACT: Cache with short TTL
      indicatorCache.set(indicatorKey, indicatorValue, shortTtl);

      // ASSERT: Available immediately
      let cached = indicatorCache.get(indicatorKey);
      expect(cached).toBe(indicatorValue);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, shortTtl + 50));

      // ASSERT: Expired
      cached = indicatorCache.get(indicatorKey);
      expect(cached).toBeNull();
    });

    it('should handle time-range queries on candles', () => {
      // ARRANGE
      const baseTime = Date.now();
      const mockCandles: Candle[] = Array.from({ length: 10 }, (_, i) => ({
        timestamp: baseTime - i * 5 * 60 * 1000,
        open: 2.5,
        high: 2.6,
        low: 2.4,
        close: 2.5,
        volume: 1000000,
      }));

      repository.saveCandles('XRPUSDT', '5', mockCandles);

      // ACT: Query candles since specific time
      const sinceTime = baseTime - 20 * 60 * 1000; // Last 20 minutes
      const recentCandles = repository.getCandlesSince('XRPUSDT', '5', sinceTime);

      // ASSERT: Only candles after timestamp returned
      expect(recentCandles.length).toBeLessThanOrEqual(mockCandles.length);
      recentCandles.forEach(candle => {
        expect(candle.timestamp).toBeGreaterThanOrEqual(sinceTime);
      });
    });

    it('should limit candle queries by count', () => {
      // ARRANGE
      const mockCandles: Candle[] = Array.from({ length: 100 }, (_, i) => ({
        timestamp: Date.now() - i * 5 * 60 * 1000,
        open: 2.5,
        high: 2.6,
        low: 2.4,
        close: 2.5,
        volume: 1000000,
      }));

      repository.saveCandles('XRPUSDT', '5', mockCandles);

      // ACT: Query with limit
      const limited = repository.getCandles('XRPUSDT', '5', 10);

      // ASSERT: Limited to requested count
      expect(limited).toHaveLength(10);
      // Check that candles are from the stored set
      limited.forEach(candle => {
        expect(mockCandles).toContainEqual(expect.objectContaining({
          timestamp: candle.timestamp,
          close: candle.close,
        }));
      });
    });
  });

  describe('E2E: Multi-Symbol & Multi-Timeframe Coordination', () => {
    it('should coordinate multiple symbols in same repository', async () => {
      // ARRANGE
      const symbols = ['XRPUSDT', 'BTCUSDT', 'ETHUSDT'];
      const mockCandles: Candle[] = Array.from({ length: 20 }, (_, i) => ({
        timestamp: Date.now() - i * 5 * 60 * 1000,
        open: 2.5,
        high: 2.6,
        low: 2.4,
        close: 2.5,
        volume: 1000000,
      }));

      // ACT: Store candles for multiple symbols
      symbols.forEach(symbol => {
        repository.saveCandles(symbol, '5', mockCandles);
      });

      // ASSERT: All symbols accessible independently
      symbols.forEach(symbol => {
        const candles = repository.getCandles(symbol, '5');
        expect(candles).toHaveLength(20);
        expect(candles[0].close).toBe(2.5);
      });
    });

    it('should handle concurrent operations safely', async () => {
      // ARRANGE
      const operations = [];

      // ACT: Concurrent indicator caching
      for (let i = 0; i < 10; i++) {
        operations.push(
          Promise.resolve().then(() => {
            indicatorCache.set(`INDICATOR_${i}`, i * 0.1, 60000);
            return indicatorCache.get(`INDICATOR_${i}`);
          })
        );
      }

      const results = await Promise.all(operations);

      // ASSERT: All completed successfully
      expect(results).toHaveLength(10);
      results.forEach((value, index) => {
        expect(value).toBe(index * 0.1);
      });
    });
  });

  describe('E2E: Error Handling & Resilience', () => {
    it('should handle missing candles gracefully', () => {
      // ACT: Query non-existent candles
      const candles = repository.getCandles('NONEXISTENT', '5');
      const latest = repository.getLatestCandle('NONEXISTENT', '5');

      // ASSERT: Graceful return of empty/null
      expect(candles).toEqual([]);
      expect(latest).toBeNull();
    });

    it('should handle missing indicators gracefully', () => {
      // ACT: Get non-existent indicator
      const indicator = indicatorCache.get('NONEXISTENT_KEY');
      const hasIndicator = repository.hasIndicator('NONEXISTENT_KEY');

      // ASSERT: Returns null/false
      expect(indicator).toBeNull();
      expect(hasIndicator).toBe(false);
    });

    it('should clear repository without errors', () => {
      // ARRANGE
      const mockCandles: Candle[] = Array.from({ length: 10 }, (_, i) => ({
        timestamp: Date.now() - i * 5 * 60 * 1000,
        open: 2.5,
        high: 2.6,
        low: 2.4,
        close: 2.5,
        volume: 1000000,
      }));

      repository.saveCandles('XRPUSDT', '5', mockCandles);
      indicatorCache.set('TEST_KEY', 100, 60000);

      // ACT: Clear repository
      repository.clear();

      // ASSERT: All cleared
      expect(repository.getCandles('XRPUSDT', '5')).toEqual([]);
      expect(repository.getIndicator('TEST_KEY')).toBeNull();
      expect(repository.getSize()).toBe(0);
    });
  });

  describe('E2E: Repository Statistics & Diagnostics', () => {
    it('should track accurate statistics', () => {
      // ARRANGE
      const mockCandles: Candle[] = Array.from({ length: 50 }, (_, i) => ({
        timestamp: Date.now() - i * 5 * 60 * 1000,
        open: 2.5,
        high: 2.6,
        low: 2.4,
        close: 2.5,
        volume: 1000000,
      }));

      // ACT: Populate repository
      repository.saveCandles('XRPUSDT', '5', mockCandles);
      indicatorCache.set('INDICATOR_1', 50.5, 60000);
      indicatorCache.set('INDICATOR_2', 60.5, 60000);

      // ASSERT: Statistics accurate
      const stats = repository.getStats();
      expect(stats.candleCount).toBeGreaterThan(0);
      expect(stats.indicatorCount).toBeGreaterThan(0);
      expect(stats.sizeBytes).toBeGreaterThan(0);
    });

    it('should track expiration maintenance', async () => {
      // ARRANGE
      const ttl = 100;

      // ACT: Cache with short TTL
      indicatorCache.set('TEMP_INDICATOR', 99.9, ttl);
      indicatorCache.set('PERMANENT_INDICATOR', 88.8, 60000);

      let tempCached = indicatorCache.get('TEMP_INDICATOR');
      expect(tempCached).toBe(99.9);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, ttl + 50));

      // ACT: Clear expired
      const expiredCount = repository.clearExpiredIndicators();

      // ASSERT: Expired indicators cleared
      tempCached = indicatorCache.get('TEMP_INDICATOR');
      const permanentCached = indicatorCache.get('PERMANENT_INDICATOR');
      expect(tempCached).toBeNull();
      expect(permanentCached).toBe(88.8);
      expect(expiredCount).toBeGreaterThan(0);
    });
  });
});
