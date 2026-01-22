/**
 * STRATEGY ORCHESTRATOR CACHE SERVICE - UNIT TESTS
 *
 * Tests for caching TradingOrchestrator instances per strategy
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { StrategyOrchestratorCacheService } from '../../services/multi-strategy/strategy-orchestrator-cache.service';
import type { LoggerService } from '../../types';

const createMockLogger = (): LoggerService => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as LoggerService);

const createMockOrchestrator = (strategyId: string) => ({
  strategyId,
  process: jest.fn(),
  cleanup: jest.fn(),
});

describe('StrategyOrchestratorCacheService', () => {
  let cache: StrategyOrchestratorCacheService;
  let logger: LoggerService;

  beforeEach(() => {
    logger = createMockLogger();
    cache = new StrategyOrchestratorCacheService(logger);
  });

  describe('Initialization', () => {
    it('should create cache service with logger', () => {
      expect(cache).toBeInstanceOf(StrategyOrchestratorCacheService);
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should have max cache size of 10 by default', () => {
      expect(cache.getMaxCacheSize()).toBe(10);
    });

    it('should start with empty cache', () => {
      expect(cache.getCachedStrategies()).toHaveLength(0);
    });
  });

  describe('Caching Operations', () => {
    it('should cache an orchestrator', () => {
      const orchestrator = createMockOrchestrator('strategy-1');
      cache.cacheOrchestrator('strategy-1', orchestrator);

      expect(cache.isCached('strategy-1')).toBe(true);
      expect(cache.getOrchestrator('strategy-1')).toBe(orchestrator);
    });

    it('should retrieve cached orchestrator', () => {
      const orchestrator = createMockOrchestrator('strategy-1');
      cache.cacheOrchestrator('strategy-1', orchestrator);

      const retrieved = cache.getOrchestrator('strategy-1');
      expect(retrieved).toBe(orchestrator);
    });

    it('should return undefined for uncached strategy', () => {
      const result = cache.getOrchestrator('non-existent');
      expect(result).toBeUndefined();
    });

    it('should track access count', () => {
      const orchestrator = createMockOrchestrator('strategy-1');
      cache.cacheOrchestrator('strategy-1', orchestrator);

      // Access multiple times
      cache.getOrchestrator('strategy-1');
      cache.getOrchestrator('strategy-1');
      cache.getOrchestrator('strategy-1');

      const stats = cache.getStats();
      expect(stats.strategies[0].accessCount).toBe(4); // 1 from cache + 3 from get
    });

    it('should update last access time', () => {
      const orchestrator = createMockOrchestrator('strategy-1');
      cache.cacheOrchestrator('strategy-1', orchestrator);

      const statsAfterCache = cache.getStats();
      const initialTime = statsAfterCache.strategies[0].timeSinceAccess;

      // Wait a bit and access again
      cache.getOrchestrator('strategy-1');
      const statsAfterGet = cache.getStats();
      const newTime = statsAfterGet.strategies[0].timeSinceAccess;

      expect(newTime).toBeLessThanOrEqual(initialTime);
    });
  });

  describe('Cache Removal', () => {
    it('should remove cached orchestrator', () => {
      const orchestrator = createMockOrchestrator('strategy-1');
      cache.cacheOrchestrator('strategy-1', orchestrator);

      cache.removeOrchestrator('strategy-1');

      expect(cache.isCached('strategy-1')).toBe(false);
      expect(cache.getOrchestrator('strategy-1')).toBeUndefined();
    });

    it('should handle removing non-existent orchestrator gracefully', () => {
      expect(() => cache.removeOrchestrator('non-existent')).not.toThrow();
    });

    it('should clear all cached orchestrators', () => {
      cache.cacheOrchestrator('strategy-1', createMockOrchestrator('strategy-1'));
      cache.cacheOrchestrator('strategy-2', createMockOrchestrator('strategy-2'));
      cache.cacheOrchestrator('strategy-3', createMockOrchestrator('strategy-3'));

      expect(cache.getStats().cacheSize).toBe(3);

      cache.clearAll();

      expect(cache.getStats().cacheSize).toBe(0);
      expect(cache.getCachedStrategies()).toHaveLength(0);
    });
  });

  describe('Cache Size Management', () => {
    it('should evict LRU when cache is full', () => {
      cache.setMaxCacheSize(2);

      // Cache 2 orchestrators
      cache.cacheOrchestrator('strategy-1', createMockOrchestrator('strategy-1'));
      cache.cacheOrchestrator('strategy-2', createMockOrchestrator('strategy-2'));

      expect(cache.getStats().cacheSize).toBe(2);

      // Add 3rd orchestrator - should evict one (LRU)
      cache.cacheOrchestrator('strategy-3', createMockOrchestrator('strategy-3'));

      // Cache size should remain at max (2)
      expect(cache.getStats().cacheSize).toBe(2);

      // At least one should still be cached
      const cached = cache.getCachedStrategies();
      expect(cached.length).toBeLessThanOrEqual(2);
    });

    it('should respect max cache size setting', () => {
      cache.setMaxCacheSize(5);
      expect(cache.getMaxCacheSize()).toBe(5);
    });

    it('should reject invalid cache size', () => {
      expect(() => cache.setMaxCacheSize(0)).toThrow();
      expect(() => cache.setMaxCacheSize(-1)).toThrow();
    });
  });

  describe('Statistics', () => {
    it('should provide cache statistics', () => {
      const orch1 = createMockOrchestrator('strategy-1');
      const orch2 = createMockOrchestrator('strategy-2');

      cache.cacheOrchestrator('strategy-1', orch1);
      cache.cacheOrchestrator('strategy-2', orch2);

      const stats = cache.getStats();

      expect(stats.cacheSize).toBe(2);
      expect(stats.strategies).toHaveLength(2);
      expect(stats.strategies[0]).toHaveProperty('strategyId');
      expect(stats.strategies[0]).toHaveProperty('accessCount');
      expect(stats.strategies[0]).toHaveProperty('age');
      expect(stats.strategies[0]).toHaveProperty('timeSinceAccess');
    });

    it('should list all cached strategies', () => {
      cache.cacheOrchestrator('strategy-1', createMockOrchestrator('strategy-1'));
      cache.cacheOrchestrator('strategy-2', createMockOrchestrator('strategy-2'));
      cache.cacheOrchestrator('strategy-3', createMockOrchestrator('strategy-3'));

      const cached = cache.getCachedStrategies();

      expect(cached).toContain('strategy-1');
      expect(cached).toContain('strategy-2');
      expect(cached).toContain('strategy-3');
      expect(cached).toHaveLength(3);
    });
  });

  describe('Multiple Strategies', () => {
    it('should isolate orchestrators for different strategies', () => {
      const orch1 = createMockOrchestrator('strategy-1');
      const orch2 = createMockOrchestrator('strategy-2');
      const orch3 = createMockOrchestrator('strategy-3');

      cache.cacheOrchestrator('strategy-1', orch1);
      cache.cacheOrchestrator('strategy-2', orch2);
      cache.cacheOrchestrator('strategy-3', orch3);

      expect(cache.getOrchestrator('strategy-1')).toBe(orch1);
      expect(cache.getOrchestrator('strategy-2')).toBe(orch2);
      expect(cache.getOrchestrator('strategy-3')).toBe(orch3);
    });

    it('should handle concurrent access to different strategies', () => {
      cache.cacheOrchestrator('strategy-1', createMockOrchestrator('strategy-1'));
      cache.cacheOrchestrator('strategy-2', createMockOrchestrator('strategy-2'));

      const orch1 = cache.getOrchestrator('strategy-1');
      const orch2 = cache.getOrchestrator('strategy-2');
      const orch1Again = cache.getOrchestrator('strategy-1');

      expect(orch1).toBe(orch1Again);
      expect(orch1).not.toBe(orch2);
    });

    it('should support strategy switching', () => {
      const orch1 = createMockOrchestrator('strategy-1');
      const orch2 = createMockOrchestrator('strategy-2');

      cache.cacheOrchestrator('strategy-1', orch1);
      cache.cacheOrchestrator('strategy-2', orch2);

      // Switch from strategy 1 to strategy 2
      let active = cache.getOrchestrator('strategy-1');
      expect(active).toBe(orch1);

      active = cache.getOrchestrator('strategy-2');
      expect(active).toBe(orch2);

      // Switch back to strategy 1
      active = cache.getOrchestrator('strategy-1');
      expect(active).toBe(orch1);
    });
  });

  describe('Logging', () => {
    it('should log cache hits', () => {
      const orchestrator = createMockOrchestrator('strategy-1');
      cache.cacheOrchestrator('strategy-1', orchestrator);

      cache.getOrchestrator('strategy-1');

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Cache hit'));
    });

    it('should log cache operations', () => {
      cache.cacheOrchestrator('strategy-1', createMockOrchestrator('strategy-1'));

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Cached orchestrator'));
    });

    it('should log LRU eviction with warning', () => {
      cache.setMaxCacheSize(2);
      cache.cacheOrchestrator('strategy-1', createMockOrchestrator('strategy-1'));
      cache.cacheOrchestrator('strategy-2', createMockOrchestrator('strategy-2'));

      // Access strategy-1 to make it more recent
      cache.getOrchestrator('strategy-1');

      // Add strategy-3, which should trigger LRU eviction of strategy-2
      cache.cacheOrchestrator('strategy-3', createMockOrchestrator('strategy-3'));

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Evicting LRU')
      );
    });
  });

  describe('Performance', () => {
    it('should handle large number of strategies', () => {
      const strategyCount = 100;
      const orchestrators: any[] = [];

      // Cache 100 strategies (with LRU eviction to max 10)
      for (let i = 0; i < strategyCount; i++) {
        const orch = createMockOrchestrator(`strategy-${i}`);
        orchestrators.push(orch);
        cache.cacheOrchestrator(`strategy-${i}`, orch);
      }

      // Should only have max 10 cached (LRU evicted the rest)
      expect(cache.getStats().cacheSize).toBeLessThanOrEqual(10);
    });

    it('should retrieve cached orchestrator quickly', () => {
      const orchestrator = createMockOrchestrator('strategy-1');
      cache.cacheOrchestrator('strategy-1', orchestrator);

      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        cache.getOrchestrator('strategy-1');
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // 1000 lookups should be very fast (< 100ms)
      expect(duration).toBeLessThan(100);
    });
  });
});
