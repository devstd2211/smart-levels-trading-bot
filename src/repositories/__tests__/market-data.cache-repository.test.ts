/**
 * Market Data Cache Repository Tests - Phase 6.1
 *
 * Tests for in-memory market data caching
 */

import { MarketDataCacheRepository } from '../market-data.cache-repository';
import { Candle } from '../../types';

/**
 * Create mock candle
 */
function createMockCandle(overrides?: Partial<Candle>): Candle {
  return {
    timestamp: Date.now(),
    open: 0.5,
    high: 0.55,
    low: 0.48,
    close: 0.52,
    volume: 1000000,
    ...overrides,
  };
}

describe('MarketDataCacheRepository - Phase 6.1', () => {
  let repo: MarketDataCacheRepository;

  beforeEach(() => {
    repo = new MarketDataCacheRepository();
  });

  describe('Candle Management', () => {
    test('T1: Should save and get candles', () => {
      const candles = [
        createMockCandle({ timestamp: 1000 }),
        createMockCandle({ timestamp: 2000 }),
        createMockCandle({ timestamp: 3000 }),
      ];

      repo.saveCandles('XRPUSDT', '1h', candles);

      const retrieved = repo.getCandles('XRPUSDT', '1h');
      expect(retrieved.length).toBe(3);
      expect(retrieved[0].timestamp).toBe(1000);
      expect(retrieved[2].timestamp).toBe(3000);
    });

    test('T2: Should get latest candle', () => {
      const candles = [
        createMockCandle({ timestamp: 1000 }),
        createMockCandle({ timestamp: 2000 }),
        createMockCandle({ timestamp: 3000 }),
      ];

      repo.saveCandles('XRPUSDT', '1h', candles);

      const latest = repo.getLatestCandle('XRPUSDT', '1h');
      expect(latest?.timestamp).toBe(3000);
    });

    test('T3: Should return null when no candles', () => {
      const latest = repo.getLatestCandle('BTCUSDT', '1h');
      expect(latest).toBeNull();
    });

    test('T4: Should limit candles returned', () => {
      const candles = [];
      for (let i = 0; i < 10; i++) {
        candles.push(createMockCandle({ timestamp: i * 1000 }));
      }

      repo.saveCandles('XRPUSDT', '1h', candles);

      const limited = repo.getCandles('XRPUSDT', '1h', 3);
      expect(limited.length).toBe(3);
      expect(limited[0].timestamp).toBe(7000); // Last 3
    });

    test('T5: Should handle multiple timeframes', () => {
      const candles1h = [createMockCandle({ timestamp: 1000 })];
      const candles5m = [createMockCandle({ timestamp: 2000 })];

      repo.saveCandles('XRPUSDT', '1h', candles1h);
      repo.saveCandles('XRPUSDT', '5m', candles5m);

      const get1h = repo.getCandles('XRPUSDT', '1h');
      const get5m = repo.getCandles('XRPUSDT', '5m');

      expect(get1h[0].timestamp).toBe(1000);
      expect(get5m[0].timestamp).toBe(2000);
    });

    test('T6: Should enforce max candles per TF', () => {
      const candles = [];
      // Add 600 candles (more than max 500)
      for (let i = 0; i < 600; i++) {
        candles.push(createMockCandle({ timestamp: i * 1000 }));
      }

      repo.saveCandles('XRPUSDT', '1h', candles);

      const stored = repo.getCandles('XRPUSDT', '1h');
      expect(stored.length).toBe(500); // Limited to max
      expect(stored[0].timestamp).toBe(100000); // Oldest kept
    });

    test('T7: Should get candles since timestamp', () => {
      const candles = [
        createMockCandle({ timestamp: 1000 }),
        createMockCandle({ timestamp: 2000 }),
        createMockCandle({ timestamp: 3000 }),
        createMockCandle({ timestamp: 4000 }),
      ];

      repo.saveCandles('XRPUSDT', '1h', candles);

      const since = repo.getCandlesSince('XRPUSDT', '1h', 2500);
      expect(since.length).toBe(2);
      expect(since[0].timestamp).toBe(3000);
    });
  });

  describe('Indicator Caching (TTL)', () => {
    test('T8: Should cache and retrieve indicator', () => {
      repo.cacheIndicator('RSI-14-1h', 65.5);

      const value = repo.getIndicator('RSI-14-1h');
      expect(value).toBe(65.5);
    });

    test('T9: Should return null for non-existent indicator', () => {
      const value = repo.getIndicator('NON_EXISTENT');
      expect(value).toBeNull();
    });

    test('T10: Should handle indicator expiration', (done) => {
      repo.cacheIndicator('EMA-20-5m', 0.5, 100); // 100ms TTL

      // Immediately should work
      expect(repo.getIndicator('EMA-20-5m')).toBe(0.5);

      // After TTL, should be expired
      setTimeout(() => {
        const value = repo.getIndicator('EMA-20-5m');
        expect(value).toBeNull();
        done();
      }, 150);
    });

    test('T11: Should check indicator existence', () => {
      repo.cacheIndicator('TEST_IND', 42);

      expect(repo.hasIndicator('TEST_IND')).toBe(true);
      expect(repo.hasIndicator('NON_EXISTENT')).toBe(false);
    });

    test('T12: Should cache different indicators', () => {
      repo.cacheIndicator('RSI-14-1h', 65);
      repo.cacheIndicator('EMA-20-1h', 0.52);
      repo.cacheIndicator('ATR-14-1h', 0.05);

      expect(repo.getIndicator('RSI-14-1h')).toBe(65);
      expect(repo.getIndicator('EMA-20-1h')).toBe(0.52);
      expect(repo.getIndicator('ATR-14-1h')).toBe(0.05);
    });
  });

  describe('Cache Maintenance', () => {
    test('T13: Should clear expired indicators', (done) => {
      repo.cacheIndicator('FAST', 1, 50);
      repo.cacheIndicator('SLOW', 2, 500);

      setTimeout(() => {
        const cleared = repo.clearExpiredIndicators();
        expect(cleared).toBeGreaterThan(0);
        expect(repo.getIndicator('FAST')).toBeNull();
        expect(repo.getIndicator('SLOW')).toBe(2);
        done();
      }, 100);
    });

    test('T14: Should clear all data', () => {
      const candles = [createMockCandle()];
      repo.saveCandles('XRPUSDT', '1h', candles);
      repo.cacheIndicator('RSI', 65);

      repo.clear();

      expect(repo.getCandles('XRPUSDT', '1h').length).toBe(0);
      expect(repo.getIndicator('RSI')).toBeNull();
    });

    test('T15: Should calculate cache size', () => {
      const candles = [];
      for (let i = 0; i < 10; i++) {
        candles.push(createMockCandle());
      }
      repo.saveCandles('XRPUSDT', '1h', candles);
      repo.cacheIndicator('RSI', 65);

      const size = repo.getSize();
      expect(size).toBeGreaterThan(0);
    });

    test('T16: Should get cache statistics', () => {
      const candles = [
        createMockCandle(),
        createMockCandle(),
      ];
      repo.saveCandles('XRPUSDT', '1h', candles);
      repo.cacheIndicator('RSI', 65);
      repo.cacheIndicator('EMA', 0.52);

      const stats = repo.getStats();
      expect(stats.candleCount).toBe(2);
      expect(stats.indicatorCount).toBe(2);
      expect(stats.sizeBytes).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    test('T17: Should handle large candle dataset', () => {
      const candles = [];
      for (let i = 0; i < 500; i++) {
        candles.push(createMockCandle({ timestamp: i * 60000 }));
      }

      const start = Date.now();
      repo.saveCandles('XRPUSDT', '1m', candles);
      const saved = Date.now() - start;

      const getStart = Date.now();
      const retrieved = repo.getCandles('XRPUSDT', '1m');
      const got = Date.now() - getStart;

      expect(retrieved.length).toBe(500);
      expect(saved).toBeLessThan(50);
      expect(got).toBeLessThan(50);
    });

    test('T18: Should handle many indicator lookups', () => {
      // Cache 100 indicators
      for (let i = 0; i < 100; i++) {
        repo.cacheIndicator(`IND_${i}`, Math.random());
      }

      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        repo.getIndicator(`IND_${i}`);
      }
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50);
    });
  });
});
