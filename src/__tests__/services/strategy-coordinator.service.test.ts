/**
 * StrategyCoordinatorService Unit Tests - Phase 3
 *
 * Tests for the pure strategy coordinator that wraps analyzers and signal aggregation.
 */

import { StrategyCoordinatorService } from '../../services/strategy-coordinator.service';
import type { Candle } from '../../types/core';
import { SignalDirection } from '../../types/enums';
import type { AnalyzerSignal } from '../../types/strategy';
import type { IAnalyzer } from '../../types/analyzer.interface';
import type { StrategyConfig } from '../../types/strategy-config.types';

// ============================================================================
// MOCK DATA & HELPERS
// ============================================================================

function createMockCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    candles.push({
      open: 100 + i * 0.1,
      high: 101 + i * 0.1,
      low: 99 + i * 0.1,
      close: 100.5 + i * 0.1,
      volume: 1000 + i * 100,
      timestamp: 1000 + i * 60000,
    });
  }
  return candles;
}

function createMockAnalyzer(
  direction: SignalDirection,
  confidence: number = 0.8,
  ready: boolean = true,
  source: string = 'MOCK',
): IAnalyzer {
  return {
    getType: () => 'MOCK_ANALYZER',
    analyze: () => ({
      source, // Use passed-in source (analyzerName) so weights Map can find it
      direction,
      confidence: confidence * 100, // Convert to 0-100
      weight: 1.0,
      priority: 5,
    }),
    isReady: () => ready,
    getMinCandlesRequired: () => 20,
    isEnabled: () => true,
    getWeight: () => 1.0,
    getPriority: () => 5,
    getMaxConfidence: () => 100,
  };
}

function createMockStrategyConfig(): StrategyConfig {
  const now = new Date().toISOString();
  return {
    version: 1,
    metadata: {
      name: 'test-strategy',
      description: 'Test strategy',
      version: '1.0.0',
      author: 'test',
      createdAt: now,
      lastModified: now,
      tags: ['test'],
    },
    analyzers: [],
    filters: {},
  };
}

class MockAnalyzerRegistry {
  async getEnabledAnalyzers(_analyzers: any, _config: StrategyConfig) {
    return new Map();
  }
}

// ============================================================================
// TEST SUITE
// ============================================================================

// Mock logger for testing
class MockLogger {
  debug(msg: string, data?: any) {
    console.log(`[DEBUG] ${msg}`, data);
  }
  info(msg: string, data?: any) {
    console.log(`[INFO] ${msg}`, data);
  }
  warn(msg: string, data?: any) {
    console.log(`[WARN] ${msg}`, data);
  }
  error(msg: string, data?: any) {
    console.log(`[ERROR] ${msg}`, data);
  }
}

describe('StrategyCoordinatorService', () => {
  let service: StrategyCoordinatorService;
  let mockRegistry: any;

  beforeEach(() => {
    mockRegistry = new MockAnalyzerRegistry();
    service = new StrategyCoordinatorService(mockRegistry, new MockLogger() as any);
  });

  describe('Configuration Management', () => {
    it('should initialize with default configuration', () => {
      const config = service.getConfig();

      expect(config.minConfidence).toBe(0.75);
      expect(config.parallelExecution).toBe(true);
      expect(config.errorHandling).toBe('lenient');
    });

    it('should update configuration', () => {
      service.setConfig({
        minConfidence: 0.9,
        conflictThreshold: 0.3,
      });

      const config = service.getConfig();

      expect(config.minConfidence).toBe(0.9);
      expect(config.conflictThreshold).toBe(0.3);
    });

    it('should preserve unmodified settings when updating', () => {
      service.setConfig({ minConfidence: 0.95 });

      const config = service.getConfig();

      expect(config.minTotalScore).toBe(0.45); // Default unchanged
      expect(config.parallelExecution).toBe(true); // Default unchanged
    });

    it('should merge blind zone configuration', () => {
      service.setConfig({
        blindZone: {
          minSignalsForLong: 5,
        },
      });

      const config = service.getConfig();

      expect(config.blindZone.minSignalsForLong).toBe(5);
      expect(config.blindZone.minSignalsForShort).toBe(3); // Default preserved
    });

    it('should reset configuration to defaults', () => {
      service.setConfig({
        minConfidence: 0.95,
        errorHandling: 'strict',
      });

      service.resetConfig();

      const config = service.getConfig();

      expect(config.minConfidence).toBe(0.75); // Back to default
      expect(config.errorHandling).toBe('lenient'); // Back to default
    });
  });

  describe('Coordination Metadata', () => {
    it('should return coordination result with metadata', async () => {
      const candles = createMockCandles(50);
      const config = createMockStrategyConfig();

      // Override registry to return a single analyzer
      mockRegistry.getEnabledAnalyzers = async () =>
        new Map([
          [
            'testAnalyzer',
            {
              instance: createMockAnalyzer(SignalDirection.LONG, 0.8, true, 'testAnalyzer'),
              weight: 1.0,
              priority: 5,
            },
          ],
        ]);

      const result = await service.coordinateStrategy(candles, config);

      expect(result).toBeDefined();
      expect(result.aggregation).toBeDefined();
      expect(result.analyzersExecuted).toBeGreaterThan(0);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeDefined();
    });

    it('should measure execution time', async () => {
      const candles = createMockCandles(50);
      const config = createMockStrategyConfig();

      mockRegistry.getEnabledAnalyzers = async () =>
        new Map([
          [
            'testAnalyzer',
            {
              instance: createMockAnalyzer(SignalDirection.LONG, 0.8, true, 'testAnalyzer'),
              weight: 1.0,
              priority: 5,
            },
          ],
        ]);

      const result = await service.coordinateStrategy(candles, config);

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('Analyzer Readiness', () => {
    it('should skip analyzers that are not ready', async () => {
      const candles = createMockCandles(50);
      const config = createMockStrategyConfig();

      const readyAnalyzer = createMockAnalyzer(SignalDirection.LONG, 0.9, true, 'ready');
      const notReadyAnalyzer = createMockAnalyzer(SignalDirection.SHORT, 0.7, false, 'notReady');

      mockRegistry.getEnabledAnalyzers = async () =>
        new Map([
          ['ready', { instance: readyAnalyzer, weight: 1.0, priority: 5 }],
          ['notReady', { instance: notReadyAnalyzer, weight: 1.0, priority: 5 }],
        ]);

      const result = await service.coordinateStrategy(candles, config);

      expect(result.analyzersExecuted).toBe(1); // Only 1 ready
      expect(result.aggregation.signalCount).toBe(1);
    });

    it('should throw error if no analyzers are enabled (strict mode)', async () => {
      service.setConfig({ errorHandling: 'strict' });

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig();

      mockRegistry.getEnabledAnalyzers = async () => new Map();

      await expect(service.coordinateStrategy(candles, config)).rejects.toThrow();
    });

    it('should return neutral result if no analyzers are ready (lenient mode)', async () => {
      service.setConfig({ errorHandling: 'lenient' });

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig();

      const notReadyAnalyzer = createMockAnalyzer(SignalDirection.LONG, 0.9, false, 'notReady');

      mockRegistry.getEnabledAnalyzers = async () =>
        new Map([['notReady', { instance: notReadyAnalyzer, weight: 1.0, priority: 5 }]]);

      const result = await service.coordinateStrategy(candles, config);

      expect(result.aggregation.direction).toBeNull();
      expect(result.aggregation.confidence).toBe(0);
    });
  });

  describe('Error Handling Modes', () => {
    it('should handle registry failure in lenient mode', async () => {
      service.setConfig({ errorHandling: 'lenient' });

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig();

      mockRegistry.getEnabledAnalyzers = async () => {
        throw new Error('Registry error');
      };

      const result = await service.coordinateStrategy(candles, config);

      expect(result.aggregation.direction).toBeNull();
      expect(result.analyzerErrors).toBeDefined();
      expect(result.analyzerErrors?.length).toBeGreaterThan(0);
    });

    it('should throw error in strict mode on registry failure', async () => {
      service.setConfig({ errorHandling: 'strict' });

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig();

      mockRegistry.getEnabledAnalyzers = async () => {
        throw new Error('Registry error');
      };

      await expect(service.coordinateStrategy(candles, config)).rejects.toThrow();
    });
  });

  describe('Signal Aggregation', () => {
    it('should aggregate LONG signals', async () => {
      const candles = createMockCandles(50);
      const config = createMockStrategyConfig();

      // Disable blind zone to avoid penalty for 2 signals
      service.setConfig({
        blindZone: {
          minSignalsForLong: 1,
          minSignalsForShort: 1,
          longPenalty: 1.0,
          shortPenalty: 1.0,
        },
      });

      mockRegistry.getEnabledAnalyzers = async () =>
        new Map([
          [
            'analyzer1',
            {
              instance: createMockAnalyzer(SignalDirection.LONG, 0.9, true, 'analyzer1'),
              weight: 0.5,
              priority: 5,
            },
          ],
          [
            'analyzer2',
            {
              instance: createMockAnalyzer(SignalDirection.LONG, 0.8, true, 'analyzer2'),
              weight: 0.5,
              priority: 5,
            },
          ],
        ]);

      const result = await service.coordinateStrategy(candles, config);

      expect(result.aggregation.direction).toBe(SignalDirection.LONG);
      expect(result.aggregation.signalCount).toBe(2);
    });

    it('should select highest confidence direction', async () => {
      const candles = createMockCandles(50);
      const config = createMockStrategyConfig();

      // Disable blind zone to avoid penalty
      service.setConfig({
        blindZone: {
          minSignalsForLong: 1,
          minSignalsForShort: 1,
          longPenalty: 1.0,
          shortPenalty: 1.0,
        },
      });

      mockRegistry.getEnabledAnalyzers = async () =>
        new Map([
          [
            'longAnalyzer1',
            {
              instance: createMockAnalyzer(SignalDirection.LONG, 0.95, true, 'longAnalyzer1'),
              weight: 1.0,
              priority: 5,
            },
          ],
          [
            'longAnalyzer2',
            {
              instance: createMockAnalyzer(SignalDirection.LONG, 0.85, true, 'longAnalyzer2'),
              weight: 1.0,
              priority: 5,
            },
          ],
          [
            'shortAnalyzer',
            {
              instance: createMockAnalyzer(SignalDirection.SHORT, 0.5, true, 'shortAnalyzer'),
              weight: 1.0,
              priority: 5,
            },
          ],
        ]);

      const result = await service.coordinateStrategy(candles, config);

      // LONG should win due to higher confidence (2 LONG @ avg 0.9 vs 1 SHORT @ 0.5)
      expect(result.aggregation.direction).toBe(SignalDirection.LONG);
    });
  });

  describe('Configuration Thresholds', () => {
    it('should apply custom minConfidence threshold', async () => {
      service.setConfig({ minConfidence: 0.95 });

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig();

      mockRegistry.getEnabledAnalyzers = async () =>
        new Map([
          [
            'analyzer',
            {
              instance: createMockAnalyzer(SignalDirection.LONG, 0.8, true, 'analyzer'),
              weight: 1.0,
              priority: 5,
            },
          ],
        ]);

      const result = await service.coordinateStrategy(candles, config);

      expect(result).toBeDefined();
      expect(result.aggregation).toBeDefined();
    });

    it('should apply minTotalScore threshold', async () => {
      service.setConfig({ minTotalScore: 0.9 }); // Very high threshold

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig();

      mockRegistry.getEnabledAnalyzers = async () =>
        new Map([
          [
            'analyzer',
            {
              instance: createMockAnalyzer(SignalDirection.LONG, 0.5, true, 'analyzer'),
              weight: 0.3, // Low weight
              priority: 5,
            },
          ],
        ]);

      const result = await service.coordinateStrategy(candles, config);

      expect(result).toBeDefined();
    });
  });
});
