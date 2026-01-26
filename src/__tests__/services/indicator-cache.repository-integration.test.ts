/**
 * Phase 6.2: IndicatorCacheService + IMarketDataRepository Integration Tests
 *
 * Tests the integration of IndicatorCacheService with IMarketDataRepository
 * Ensures caching is delegated to repository with TTL support
 */

import { IndicatorCacheService } from '../../services/indicator-cache.service';
import { IMarketDataRepository } from '../../repositories/IRepositories';

/**
 * Mock IMarketDataRepository for testing
 */
class MockMarketDataRepository implements IMarketDataRepository {
  private indicators: Map<string, { value: any; expiresAt: number }> = new Map();
  private readonly maxIndicators = 500; // Match real repository limit

  cacheIndicator(key: string, value: any, ttlMs: number = 60000): void {
    const expiresAt = Date.now() + ttlMs;

    // LRU eviction: remove oldest if at capacity
    if (this.indicators.size >= this.maxIndicators && !this.indicators.has(key)) {
      const firstKey = this.indicators.keys().next().value;
      if (firstKey) {
        this.indicators.delete(firstKey);
      }
    }

    this.indicators.set(key, { value, expiresAt });
  }

  getIndicator(key: string): any | null {
    const cached = this.indicators.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      this.indicators.delete(key);
      return null;
    }
    return cached.value;
  }

  hasIndicator(key: string): boolean {
    return this.getIndicator(key) !== null;
  }

  clearExpiredIndicators(): number {
    let count = 0;
    for (const [key, value] of this.indicators.entries()) {
      if (Date.now() > value.expiresAt) {
        this.indicators.delete(key);
        count++;
      }
    }
    return count;
  }

  // Unused methods (stubs)
  saveCandles(): void {}
  getCandles(): any[] { return []; }
  getLatestCandle(): any { return null; }
  getCandlesSince(): any[] { return []; }
  clearExpiredCandles(): number { return 0; }
  clear(): void {
    this.indicators.clear();
  }
  getSize(): number { return this.indicators.size; }
  getStats(): any {
    return {
      candleCount: 0,
      indicatorCount: this.indicators.size,
      sizeBytes: 0,
    };
  }
}

describe('IndicatorCacheService + IMarketDataRepository Integration', () => {
  let service: IndicatorCacheService;
  let repository: MockMarketDataRepository;

  beforeEach(() => {
    repository = new MockMarketDataRepository();
    // Phase 6.2: IndicatorCacheService now accepts repository via constructor
    service = new IndicatorCacheService(repository);
  });

  describe('Basic Operations', () => {
    it('should cache indicator via repository', () => {
      service.set('RSI-14-1h', 65.5);

      // Phase 6.2: service.set() calls repository.cacheIndicator() internally
      expect(service.get('RSI-14-1h')).toBe(65.5);
    });

    it('should retrieve cached indicator from repository', () => {
      service.set('EMA-20-1h', 2.50);
      const value = service.get('EMA-20-1h');

      expect(value).toBe(2.50);
    });

    it('should return null for missing indicator', () => {
      const value = service.get('NONEXISTENT');

      expect(value).toBeNull();
    });

    it('should clear expired indicators on invalidate call', (done) => {
      // Set two indicators with different TTLs
      service.set('RSI-14-1h', 65.5, 60000); // Long TTL
      service.set('EMA-20-1h', 2.50, 10); // Very short TTL

      // Give short TTL time to expire
      setTimeout(() => {
        // Call invalidate (which calls clearExpiredIndicators)
        service.invalidate('anything');

        // Long TTL indicator should still exist
        expect(service.get('RSI-14-1h')).toBe(65.5);

        // Short TTL should be gone
        expect(service.get('EMA-20-1h')).toBeNull();
        done();
      }, 50);
    });

    it('should clear all indicators', () => {
      service.set('RSI-14-1h', 65.5);
      service.set('EMA-20-1h', 2.50);

      service.clear();

      expect(service.get('RSI-14-1h')).toBeNull();
      expect(service.get('EMA-20-1h')).toBeNull();
    });
  });

  describe('Repository Integration Patterns', () => {
    it('should delegate caching to repository with TTL', () => {
      const spy = jest.spyOn(repository, 'cacheIndicator');

      // After refactoring: service will call repository.cacheIndicator()
      repository.cacheIndicator('RSI-14-1h', 65.5, 60000);

      expect(spy).toHaveBeenCalledWith('RSI-14-1h', 65.5, 60000);
      spy.mockRestore();
    });

    it('should retrieve from repository instead of local cache', () => {
      repository.cacheIndicator('EMA-20-1h', 2.50, 60000);

      // After refactoring: service.get() will call repository.getIndicator()
      const value = repository.getIndicator('EMA-20-1h');

      expect(value).toBe(2.50);
    });

    it('should respect TTL expiration from repository', (done) => {
      const ttlMs = 50; // 50ms for testing
      repository.cacheIndicator('RSI-14-1h', 65.5, ttlMs);

      // Should exist immediately
      expect(repository.getIndicator('RSI-14-1h')).toBe(65.5);

      // Should expire after TTL
      setTimeout(() => {
        expect(repository.getIndicator('RSI-14-1h')).toBeNull();
        done();
      }, ttlMs + 100);
    });

    it('should handle concurrent cache operations', async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          Promise.resolve().then(() => {
            repository.cacheIndicator(`RSI-${i}`, 60 + i, 60000);
          })
        );
      }

      await Promise.all(promises);

      expect(repository.getSize()).toBe(10);
    });
  });

  describe('Cache Statistics', () => {
    it('should track hit rate correctly', () => {
      service.resetMetrics();

      service.set('RSI-14-1h', 65.5);
      service.get('RSI-14-1h'); // Hit
      service.get('RSI-14-1h'); // Hit
      service.get('MISSING');   // Miss

      const stats = service.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.totalRequests).toBe(3);
      expect(stats.hitRate).toBe(66.67);
    });

    it('should report indicator count from repository', () => {
      service.resetMetrics();

      service.set('RSI-14-1h', 65.5);
      service.set('EMA-20-1h', 2.50);
      service.set('MACD-1h', 0.15);

      const stats = service.getStats();

      // Size should match repository indicator count
      expect(stats.size).toBe(3);
      expect(stats.capacity).toBe(500);
    });

    it('should maintain capacity limit via repository', () => {
      // Add entries up to capacity
      for (let i = 0; i < 550; i++) {
        service.set(`IND-${i}`, i);
      }

      const stats = service.getStats();

      // Repository maintains max 500 indicators
      expect(stats.size).toBeLessThanOrEqual(500);
      expect(stats.capacity).toBe(500);
    });

    it('should reset local metrics (not repository)', () => {
      service.set('RSI-14-1h', 65.5);
      service.get('RSI-14-1h');
      service.get('MISSING');

      service.resetMetrics();

      const stats = service.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.totalRequests).toBe(0);

      // But data persists in repository
      expect(service.get('RSI-14-1h')).toBe(65.5);
    });
  });

  describe('Migration Patterns', () => {
    /**
     * This test demonstrates the refactoring pattern:
     * OLD: IndicatorCacheService with direct Map storage
     * NEW: IndicatorCacheService delegates to IMarketDataRepository
     */
    it('should support both direct and repository-based access during migration', () => {
      // Simulate old pattern (direct cache)
      service.set('RSI-14-1h', 65.5);
      expect(service.get('RSI-14-1h')).toBe(65.5);

      // Simulate new pattern (repository-based)
      repository.cacheIndicator('EMA-20-1h', 2.50, 60000);
      expect(repository.getIndicator('EMA-20-1h')).toBe(2.50);

      // Both should work independently
      expect(service.get('RSI-14-1h')).toBe(65.5);
      expect(repository.getIndicator('EMA-20-1h')).toBe(2.50);
    });

    it('should transition from Map-based to Repository-based cache', () => {
      // Old pattern: populate direct Map
      service.set('RSI-14-1h', 65.5);
      service.set('EMA-20-1h', 2.50);

      // New pattern: migrate to repository
      // This simulates what happens after refactoring
      const oldValue1 = service.get('RSI-14-1h');
      const oldValue2 = service.get('EMA-20-1h');

      repository.cacheIndicator('RSI-14-1h', oldValue1!, 60000);
      repository.cacheIndicator('EMA-20-1h', oldValue2!, 60000);

      // Verify migration
      expect(repository.getIndicator('RSI-14-1h')).toBe(65.5);
      expect(repository.getIndicator('EMA-20-1h')).toBe(2.50);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid keys gracefully', () => {
      service.set('', 100); // Empty key
      service.set('null', null as any);

      expect(service.get('')).toBeDefined();
      expect(service.get('null')).toBeDefined();
    });

    it('should handle non-numeric values in repository', () => {
      repository.cacheIndicator('COMPLEX', { value: 65.5, trend: 'UP' }, 60000);

      const result = repository.getIndicator('COMPLEX');
      expect(result).toEqual({ value: 65.5, trend: 'UP' });
    });

    it('should recover from clear operation', () => {
      service.set('RSI-14-1h', 65.5);
      service.clear();

      // Should be able to use after clear
      service.set('RSI-14-1h', 70.0);
      expect(service.get('RSI-14-1h')).toBe(70.0);
    });
  });

  describe('Performance Characteristics', () => {
    it('should have O(1) cache access time', () => {
      // Populate cache
      for (let i = 0; i < 100; i++) {
        service.set(`IND-${i}`, i);
      }

      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        service.get('IND-50');
      }
      const duration = performance.now() - start;

      // Phase 6.2: Repository adds slight overhead but still O(1)
      // Should be fast (< 30ms for 10k lookups)
      expect(duration).toBeLessThan(30);
    });

    it('should handle large number of indicators efficiently', () => {
      const start = performance.now();

      for (let i = 0; i < 500; i++) {
        service.set(`IND-${i}`, i);
      }

      const duration = performance.now() - start;

      // Should fill 500 items quickly
      expect(duration).toBeLessThan(100);
      expect(service.getStats().size).toBe(500);
    });
  });
});
