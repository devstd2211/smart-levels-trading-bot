import { IndicatorCacheService } from '../../services/indicator-cache.service';

describe('IndicatorCacheService - Cache Metrics & Performance', () => {
  let cache: IndicatorCacheService;

  beforeEach(() => {
    cache = new IndicatorCacheService();
  });

  describe('Basic cache operations', () => {
    it('should store and retrieve values', () => {
      cache.set('RSI-14-1h', 65);
      expect(cache.get('RSI-14-1h')).toBe(65);
    });

    it('should return null for missing keys', () => {
      expect(cache.get('NONEXISTENT')).toBeNull();
    });

    it('should invalidate entries', () => {
      cache.set('EMA-20-1h', 2.5);
      cache.invalidate('EMA-20-1h');
      expect(cache.get('EMA-20-1h')).toBeNull();
    });

    it('should clear all entries', () => {
      cache.set('RSI-14-1h', 65);
      cache.set('EMA-20-1h', 2.5);
      cache.clear();
      expect(cache.get('RSI-14-1h')).toBeNull();
      expect(cache.get('EMA-20-1h')).toBeNull();
    });
  });

  describe('Cache hit/miss tracking', () => {
    it('should track cache hits', () => {
      cache.set('RSI-14-1h', 65);
      cache.get('RSI-14-1h'); // HIT
      cache.get('RSI-14-1h'); // HIT

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(0);
    });

    it('should track cache misses', () => {
      cache.get('MISSING-1'); // MISS
      cache.get('MISSING-2'); // MISS

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(2);
    });

    it('should calculate hit rate correctly', () => {
      cache.set('RSI-14-1h', 65);
      cache.get('RSI-14-1h'); // HIT
      cache.get('RSI-14-1h'); // HIT
      cache.get('MISSING'); // MISS

      const stats = cache.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.hitRate).toBe(66.67); // 2 hits / 3 requests
    });

    it('should have 100% hit rate when all requests are hits', () => {
      cache.set('KEY1', 1);
      cache.set('KEY2', 2);
      cache.get('KEY1'); // HIT
      cache.get('KEY2'); // HIT

      const stats = cache.getStats();
      expect(stats.hitRate).toBe(100);
    });

    it('should have 0% hit rate when all requests are misses', () => {
      cache.get('MISSING1'); // MISS
      cache.get('MISSING2'); // MISS

      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('LRU eviction tracking', () => {
    it('should track evictions when cache is full', () => {
      const MAX_SIZE = 500;

      // Fill cache to capacity
      for (let i = 0; i < MAX_SIZE; i++) {
        cache.set(`KEY-${i}`, i);
      }

      let stats = cache.getStats();
      expect(stats.evictions).toBe(0);

      // Next insertion should trigger eviction
      cache.set('KEY-500', 500);
      stats = cache.getStats();
      expect(stats.evictions).toBe(1);
      expect(stats.size).toBe(MAX_SIZE); // Should stay at max

      // The oldest key should be gone
      expect(cache.get('KEY-0')).toBeNull();
    });

    it('should not evict when updating existing keys', () => {
      cache.set('KEY-1', 1);
      cache.set('KEY-1', 2); // Update

      const stats = cache.getStats();
      expect(stats.evictions).toBe(0);
      expect(cache.get('KEY-1')).toBe(2);
    });
  });

  describe('Real-world caching scenario', () => {
    it('should demonstrate indicator caching performance', () => {
      // Simulate 4 analyzers calculating indicators multiple times
      const indicators = [
        'RSI-14-1h',
        'EMA-9-1h',
        'EMA-19-1h',
        'ATR-14-1h',
        'VOLUME-20-1h',
      ];

      // First round: all MISS, all STORE
      indicators.forEach(key => {
        if (!cache.get(key)) {
          cache.set(key, Math.random() * 100);
        }
      });

      // Second round: all HIT (no recalculation needed)
      indicators.forEach(key => {
        cache.get(key);
      });

      // Third round: all HIT again
      indicators.forEach(key => {
        cache.get(key);
      });

      const stats = cache.getStats();

      // Expected: 5 misses (first round), 10 hits (2nd + 3rd round)
      expect(stats.misses).toBe(5);
      expect(stats.hits).toBe(10);
      expect(stats.hitRate).toBe(66.67);
    });
  });

  describe('Metrics reset', () => {
    it('should reset metrics while keeping cache data', () => {
      cache.set('RSI-14-1h', 65);
      cache.get('RSI-14-1h');

      let stats = cache.getStats();
      expect(stats.hits).toBe(1);

      cache.resetMetrics();
      stats = cache.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(1); // Cache data still there
      expect(cache.get('RSI-14-1h')).toBe(65); // Value still accessible
    });
  });
});
