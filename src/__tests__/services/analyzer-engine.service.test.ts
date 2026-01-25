/**
 * Analyzer Engine Service Tests - Phase 4
 * Comprehensive test suite covering all execution modes and configurations
 *
 * Test Categories (28 tests total):
 * 1. Basic Execution (5 tests)
 * 2. Readiness Filtering (4 tests)
 * 3. HOLD Filtering (3 tests)
 * 4. Signal Enrichment (4 tests)
 * 5. Error Handling (5 tests)
 * 6. Performance Metrics (3 tests)
 * 7. Edge Cases (4 tests)
 */

import type { Candle } from '../../types/core';
import type { AnalyzerSignal } from '../../types/strategy';
import type { StrategyConfig } from '../../types/strategy-config.types';
import { AnalyzerEngineService, AnalyzerExecutionConfig } from '../../services/analyzer-engine.service';
import type { AnalyzerRegistryService } from '../../services/analyzer-registry.service';
import type { IAnalyzer } from '../../types/analyzer.interface';
import { LoggerService } from '../../services/logger.service';

// ============================================================================
// MOCK UTILITIES
// ============================================================================

/**
 * Create mock analyzer with configurable behavior
 */
function createMockAnalyzer(
  name: string,
  direction: 'LONG' | 'SHORT' | 'HOLD' = 'LONG',
  options: {
    isReady?: boolean;
    throwError?: Error | null;
    minCandlesRequired?: number;
    weight?: number;
    priority?: number;
  } = {},
): IAnalyzer {
  const {
    isReady: shouldBeReady = true,
    throwError = null,
    minCandlesRequired = 20,
    weight = 0.5,
    priority = 5,
  } = options;

  return {
    getType: jest.fn(() => name),
    analyze: jest.fn((candles: Candle[]) => {
      if (throwError) {
        throw throwError;
      }

      return {
        source: name,
        direction,
        confidence: 0.75,
        weight,
        priority,
      } as AnalyzerSignal;
    }),
    isReady: jest.fn(() => shouldBeReady),
    getMinCandlesRequired: jest.fn(() => minCandlesRequired),
    isEnabled: jest.fn(() => true),
    getWeight: jest.fn(() => weight),
    getPriority: jest.fn(() => priority),
    getMaxConfidence: jest.fn(() => 1.0),
  };
}

/**
 * Create mock analyzer registry
 */
function createMockAnalyzerRegistry(
  analyzers: Map<string, { instance: IAnalyzer; weight: number; priority: number }>,
): AnalyzerRegistryService {
  return {
    getEnabledAnalyzers: jest.fn(async () => analyzers),
  } as any;
}

/**
 * Create mock strategy config
 */
function createMockStrategyConfig(analyzerNames: string[]): StrategyConfig {
  return {
    version: 1,
    metadata: {
      name: 'test-strategy',
      version: '1.0',
      description: 'Test strategy',
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      tags: [],
    },
    analyzers: analyzerNames.map((name, idx) => ({
      name,
      enabled: true,
      weight: 0.5 + idx * 0.1,
      priority: 5 + idx,
      minConfidence: 0.5,
      maxConfidence: 1.0,
    })),
  };
}

/**
 * Create mock candles
 */
function createMockCandles(count: number): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: Date.now() - (count - i) * 60000,
    open: 100,
    high: 101,
    low: 99,
    close: 100 + i * 0.1,
    volume: 1000,
  }));
}

const createMockLogger = () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

// ============================================================================
// TESTS
// ============================================================================

describe('AnalyzerEngineService', () => {
  let service: AnalyzerEngineService;
  let mockRegistry: AnalyzerRegistryService;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  // ========== BASIC EXECUTION (5 tests) ==========

  describe('Basic Execution', () => {
    it('should execute analyzers in parallel mode by default', async () => {
      const analyzer1 = createMockAnalyzer('EMA');
      const analyzer2 = createMockAnalyzer('RSI');
      const analyzers = new Map([
        ['EMA', { instance: analyzer1, weight: 0.5, priority: 5 }],
        ['RSI', { instance: analyzer2, weight: 0.5, priority: 5 }],
      ]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(['EMA', 'RSI']);

      const result = await service.executeAnalyzers(candles, config);

      expect(result.signals).toHaveLength(2);
      expect(result.analyzersExecuted).toBe(2);
      expect(result.analyzersFailed).toBe(0);
      expect(result.executionMode).toBe('parallel');
    });

    it('should execute analyzers in sequential mode when specified', async () => {
      const analyzer1 = createMockAnalyzer('EMA');
      const analyzer2 = createMockAnalyzer('RSI');
      const analyzers = new Map([
        ['EMA', { instance: analyzer1, weight: 0.5, priority: 5 }],
        ['RSI', { instance: analyzer2, weight: 0.5, priority: 5 }],
      ]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(['EMA', 'RSI']);
      const executionConfig: AnalyzerExecutionConfig = { executionMode: 'sequential' };

      const result = await service.executeAnalyzers(candles, config, executionConfig);

      expect(result.signals).toHaveLength(2);
      expect(result.executionMode).toBe('sequential');
    });

    it('should return all signals from analyzers', async () => {
      const analyzer1 = createMockAnalyzer('EMA', 'LONG');
      const analyzer2 = createMockAnalyzer('RSI', 'SHORT');
      const analyzer3 = createMockAnalyzer('ATR', 'HOLD');
      const analyzers = new Map([
        ['EMA', { instance: analyzer1, weight: 0.5, priority: 5 }],
        ['RSI', { instance: analyzer2, weight: 0.5, priority: 5 }],
        ['ATR', { instance: analyzer3, weight: 0.5, priority: 5 }],
      ]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(['EMA', 'RSI', 'ATR']);

      const result = await service.executeAnalyzers(candles, config);

      expect(result.signals).toHaveLength(3);
      expect(result.signals.map((s) => s.direction)).toEqual(['LONG', 'SHORT', 'HOLD']);
    });

    it('should track execution time', async () => {
      const analyzer = createMockAnalyzer('EMA');
      const analyzers = new Map([['EMA', { instance: analyzer, weight: 0.5, priority: 5 }]]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(['EMA']);

      const result = await service.executeAnalyzers(candles, config);

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('should return empty result when no analyzers enabled', async () => {
      const analyzers = new Map();
      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig([]);

      const result = await service.executeAnalyzers(candles, config);

      expect(result.signals).toHaveLength(0);
      expect(result.analyzersExecuted).toBe(0);
      expect(result.analyzersFailed).toBe(0);
    });
  });

  // ========== READINESS FILTERING (4 tests) ==========

  describe('Readiness Filtering', () => {
    it('should filter out unready analyzers when checkReadiness=true', async () => {
      const analyzer1 = createMockAnalyzer('EMA', 'LONG', { isReady: true });
      const analyzer2 = createMockAnalyzer('RSI', 'SHORT', { isReady: false });
      const analyzers = new Map([
        ['EMA', { instance: analyzer1, weight: 0.5, priority: 5 }],
        ['RSI', { instance: analyzer2, weight: 0.5, priority: 5 }],
      ]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(30);
      const config = createMockStrategyConfig(['EMA', 'RSI']);
      const executionConfig: AnalyzerExecutionConfig = { checkReadiness: true };

      const result = await service.executeAnalyzers(candles, config, executionConfig);

      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].source).toBe('EMA');
      expect(result.analyzersSkipped).toBe(1);
    });

    it('should include all analyzers when checkReadiness=false', async () => {
      const analyzer1 = createMockAnalyzer('EMA', 'LONG', { isReady: true });
      const analyzer2 = createMockAnalyzer('RSI', 'SHORT', { isReady: false });
      const analyzers = new Map([
        ['EMA', { instance: analyzer1, weight: 0.5, priority: 5 }],
        ['RSI', { instance: analyzer2, weight: 0.5, priority: 5 }],
      ]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(30);
      const config = createMockStrategyConfig(['EMA', 'RSI']);
      const executionConfig: AnalyzerExecutionConfig = { checkReadiness: false };

      const result = await service.executeAnalyzers(candles, config, executionConfig);

      expect(result.signals).toHaveLength(2);
      expect(result.analyzersSkipped).toBe(0);
    });

    it('should throw error in strict mode if no analyzers ready', async () => {
      const analyzer = createMockAnalyzer('EMA', 'LONG', { isReady: false });
      const analyzers = new Map([['EMA', { instance: analyzer, weight: 0.5, priority: 5 }]]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(30);
      const config = createMockStrategyConfig(['EMA']);
      const executionConfig: AnalyzerExecutionConfig = {
        checkReadiness: true,
        errorHandling: 'strict',
      };

      await expect(service.executeAnalyzers(candles, config, executionConfig)).rejects.toThrow(
        /No analyzers ready/,
      );
    });

    it('should return empty signals in lenient mode if no analyzers ready', async () => {
      const analyzer = createMockAnalyzer('EMA', 'LONG', { isReady: false });
      const analyzers = new Map([['EMA', { instance: analyzer, weight: 0.5, priority: 5 }]]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(30);
      const config = createMockStrategyConfig(['EMA']);
      const executionConfig: AnalyzerExecutionConfig = {
        checkReadiness: true,
        errorHandling: 'lenient',
      };

      const result = await service.executeAnalyzers(candles, config, executionConfig);

      expect(result.signals).toHaveLength(0);
      expect(result.analyzersExecuted).toBe(0);
    });
  });

  // ========== HOLD FILTERING (3 tests) ==========

  describe('HOLD Filtering', () => {
    it('should keep HOLD signals when filterHoldSignals=false', async () => {
      const analyzer1 = createMockAnalyzer('EMA', 'LONG');
      const analyzer2 = createMockAnalyzer('RSI', 'HOLD');
      const analyzers = new Map([
        ['EMA', { instance: analyzer1, weight: 0.5, priority: 5 }],
        ['RSI', { instance: analyzer2, weight: 0.5, priority: 5 }],
      ]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(['EMA', 'RSI']);
      const executionConfig: AnalyzerExecutionConfig = { filterHoldSignals: false };

      const result = await service.executeAnalyzers(candles, config, executionConfig);

      expect(result.signals).toHaveLength(2);
      expect(result.signals.map((s) => s.direction)).toEqual(['LONG', 'HOLD']);
    });

    it('should remove HOLD signals when filterHoldSignals=true', async () => {
      const analyzer1 = createMockAnalyzer('EMA', 'LONG');
      const analyzer2 = createMockAnalyzer('RSI', 'HOLD');
      const analyzer3 = createMockAnalyzer('ATR', 'SHORT');
      const analyzers = new Map([
        ['EMA', { instance: analyzer1, weight: 0.5, priority: 5 }],
        ['RSI', { instance: analyzer2, weight: 0.5, priority: 5 }],
        ['ATR', { instance: analyzer3, weight: 0.5, priority: 5 }],
      ]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(['EMA', 'RSI', 'ATR']);
      const executionConfig: AnalyzerExecutionConfig = { filterHoldSignals: true };

      const result = await service.executeAnalyzers(candles, config, executionConfig);

      expect(result.signals).toHaveLength(2);
      expect(result.signals.map((s) => s.direction)).toEqual(['LONG', 'SHORT']);
    });

    it('should preserve non-HOLD signals always', async () => {
      const analyzer1 = createMockAnalyzer('EMA', 'LONG');
      const analyzer2 = createMockAnalyzer('RSI', 'SHORT');
      const analyzers = new Map([
        ['EMA', { instance: analyzer1, weight: 0.5, priority: 5 }],
        ['RSI', { instance: analyzer2, weight: 0.5, priority: 5 }],
      ]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(['EMA', 'RSI']);
      const executionConfig: AnalyzerExecutionConfig = { filterHoldSignals: true };

      const result = await service.executeAnalyzers(candles, config, executionConfig);

      expect(result.signals).toHaveLength(2);
      expect(result.signals.every((s) => s.direction !== 'HOLD')).toBe(true);
    });
  });

  // ========== SIGNAL ENRICHMENT (4 tests) ==========

  describe('Signal Enrichment', () => {
    it('should add weight from config when enrichSignals=true', async () => {
      const analyzer = createMockAnalyzer('EMA', 'LONG', { weight: 0.3 });
      const analyzers = new Map([['EMA', { instance: analyzer, weight: 0.5, priority: 5 }]]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(['EMA']);
      const executionConfig: AnalyzerExecutionConfig = { enrichSignals: true };

      const result = await service.executeAnalyzers(candles, config, executionConfig);

      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].weight).toBe(0.5); // From strategy config (0.5 + 0 * 0.1), not analyzer
    });

    it('should add priority from config when enrichSignals=true', async () => {
      const analyzer = createMockAnalyzer('EMA', 'LONG', { priority: 2 });
      const analyzers = new Map([['EMA', { instance: analyzer, weight: 0.5, priority: 5 }]]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(['EMA']);
      const executionConfig: AnalyzerExecutionConfig = { enrichSignals: true };

      const result = await service.executeAnalyzers(candles, config, executionConfig);

      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].priority).toBe(5); // From strategy config (5 + 0), not analyzer
    });

    it('should add currentPrice when enrichSignals=true', async () => {
      const analyzer = createMockAnalyzer('EMA', 'LONG');
      const analyzers = new Map([['EMA', { instance: analyzer, weight: 0.5, priority: 5 }]]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(['EMA']);
      const executionConfig: AnalyzerExecutionConfig = {
        enrichSignals: true,
        currentPrice: 12345.67,
      };

      const result = await service.executeAnalyzers(candles, config, executionConfig);

      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].price).toBe(12345.67);
    });

    it('should skip enrichment when enrichSignals=false', async () => {
      const analyzer = createMockAnalyzer('EMA', 'LONG');
      const analyzers = new Map([['EMA', { instance: analyzer, weight: 0.5, priority: 5 }]]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(['EMA']);
      const executionConfig: AnalyzerExecutionConfig = { enrichSignals: false };

      const result = await service.executeAnalyzers(candles, config, executionConfig);

      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].price).toBeUndefined();
    });
  });

  // ========== ERROR HANDLING (5 tests) ==========

  describe('Error Handling', () => {
    it('should log error and continue in lenient mode', async () => {
      const analyzer1 = createMockAnalyzer('EMA', 'LONG');
      const analyzer2 = createMockAnalyzer('RSI', 'SHORT', {
        throwError: new Error('RSI calculation failed'),
      });
      const analyzers = new Map([
        ['EMA', { instance: analyzer1, weight: 0.5, priority: 5 }],
        ['RSI', { instance: analyzer2, weight: 0.5, priority: 5 }],
      ]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(['EMA', 'RSI']);
      const executionConfig: AnalyzerExecutionConfig = { errorHandling: 'lenient' };

      const result = await service.executeAnalyzers(candles, config, executionConfig);

      expect(result.signals).toHaveLength(1);
      expect(result.analyzersExecuted).toBe(1);
      expect(result.analyzersFailed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].analyzerName).toBe('RSI');
    });

    it('should collect all errors in result.errors array', async () => {
      const analyzer1 = createMockAnalyzer('EMA', 'LONG', {
        throwError: new Error('EMA failed'),
      });
      const analyzer2 = createMockAnalyzer('RSI', 'SHORT', {
        throwError: new Error('RSI failed'),
      });
      const analyzers = new Map([
        ['EMA', { instance: analyzer1, weight: 0.5, priority: 5 }],
        ['RSI', { instance: analyzer2, weight: 0.5, priority: 5 }],
      ]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(['EMA', 'RSI']);
      const executionConfig: AnalyzerExecutionConfig = { errorHandling: 'lenient' };

      const result = await service.executeAnalyzers(candles, config, executionConfig);

      expect(result.errors).toHaveLength(2);
      expect(result.errors!.map((e) => e.analyzerName)).toEqual(['EMA', 'RSI']);
    });

    it('should handle registry failure gracefully in lenient mode', async () => {
      const mockFailingRegistry = {
        getEnabledAnalyzers: jest.fn(async () => {
          throw new Error('Registry connection failed');
        }),
      } as any;

      service = new AnalyzerEngineService(mockFailingRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(['EMA']);
      const executionConfig: AnalyzerExecutionConfig = { errorHandling: 'lenient' };

      const result = await service.executeAnalyzers(candles, config, executionConfig);

      expect(result.signals).toHaveLength(0);
      expect(result.errors).toBeDefined();
    });

    it('should throw error in strict mode on registry failure', async () => {
      const mockFailingRegistry = {
        getEnabledAnalyzers: jest.fn(async () => {
          throw new Error('Registry connection failed');
        }),
      } as any;

      service = new AnalyzerEngineService(mockFailingRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(['EMA']);
      const executionConfig: AnalyzerExecutionConfig = { errorHandling: 'strict' };

      await expect(service.executeAnalyzers(candles, config, executionConfig)).rejects.toThrow(
        /Registry connection failed/,
      );
    });

    it('should validate signal structure on analyzer result', async () => {
      const badAnalyzer: IAnalyzer = {
        getType: jest.fn(() => 'BAD'),
        analyze: jest.fn(() => ({ direction: undefined } as any)), // Missing direction
        isReady: jest.fn(() => true),
        getMinCandlesRequired: jest.fn(() => 20),
        isEnabled: jest.fn(() => true),
        getWeight: jest.fn(() => 0.5),
        getPriority: jest.fn(() => 5),
        getMaxConfidence: jest.fn(() => 1.0),
      };

      const analyzers = new Map([['BAD', { instance: badAnalyzer, weight: 0.5, priority: 5 }]]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(['BAD']);
      const executionConfig: AnalyzerExecutionConfig = { errorHandling: 'lenient' };

      const result = await service.executeAnalyzers(candles, config, executionConfig);

      expect(result.signals).toHaveLength(0);
      expect(result.analyzersFailed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  // ========== PERFORMANCE METRICS (3 tests) ==========

  describe('Performance Metrics', () => {
    it('should track executionTimeMs accurately', async () => {
      const analyzer = createMockAnalyzer('EMA');
      const analyzers = new Map([['EMA', { instance: analyzer, weight: 0.5, priority: 5 }]]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(['EMA']);

      const result = await service.executeAnalyzers(candles, config);

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result.executionTimeMs)).toBe(true);
    });

    it('should verify parallel execution is tracked in result', async () => {
      const analyzer1 = createMockAnalyzer('EMA');
      const analyzer2 = createMockAnalyzer('RSI');
      const analyzers = new Map([
        ['EMA', { instance: analyzer1, weight: 0.5, priority: 5 }],
        ['RSI', { instance: analyzer2, weight: 0.5, priority: 5 }],
      ]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(['EMA', 'RSI']);
      const executionConfig: AnalyzerExecutionConfig = { executionMode: 'parallel' };

      const result = await service.executeAnalyzers(candles, config, executionConfig);

      expect(result.executionMode).toBe('parallel');
      expect(result.signals).toHaveLength(2);
    });

    it('should set timestamp on execution result', async () => {
      const analyzer = createMockAnalyzer('EMA');
      const analyzers = new Map([['EMA', { instance: analyzer, weight: 0.5, priority: 5 }]]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(['EMA']);

      const beforeTime = Date.now();
      const result = await service.executeAnalyzers(candles, config);
      const afterTime = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(result.timestamp).toBeLessThanOrEqual(afterTime + 100); // Allow small margin
    });
  });

  // ========== EDGE CASES (4 tests) ==========

  describe('Edge Cases', () => {
    it('should handle empty enabled analyzers list', async () => {
      const analyzers = new Map();
      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig([]);

      const result = await service.executeAnalyzers(candles, config);

      expect(result.signals).toHaveLength(0);
      expect(result.analyzersExecuted).toBe(0);
    });

    it('should handle all analyzers failing in lenient mode', async () => {
      const analyzer1 = createMockAnalyzer('EMA', 'LONG', {
        throwError: new Error('Failed'),
      });
      const analyzer2 = createMockAnalyzer('RSI', 'SHORT', {
        throwError: new Error('Failed'),
      });
      const analyzers = new Map([
        ['EMA', { instance: analyzer1, weight: 0.5, priority: 5 }],
        ['RSI', { instance: analyzer2, weight: 0.5, priority: 5 }],
      ]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(['EMA', 'RSI']);
      const executionConfig: AnalyzerExecutionConfig = { errorHandling: 'lenient' };

      const result = await service.executeAnalyzers(candles, config, executionConfig);

      expect(result.signals).toHaveLength(0);
      expect(result.analyzersFailed).toBe(2);
    });

    it('should handle large number of analyzers', async () => {
      const analyzerCount = 28; // Typical analyzer count
      const analyzers = new Map();

      for (let i = 0; i < analyzerCount; i++) {
        const analyzer = createMockAnalyzer(`ANALYZER_${i}`);
        analyzers.set(`ANALYZER_${i}`, { instance: analyzer, weight: 0.5, priority: 5 });
      }

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const analyzerNames = Array.from({ length: analyzerCount }, (_, i) => `ANALYZER_${i}`);
      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(analyzerNames);

      const result = await service.executeAnalyzers(candles, config);

      expect(result.signals).toHaveLength(analyzerCount);
      expect(result.analyzersExecuted).toBe(analyzerCount);
    });

    it('should handle concurrent execution calls', async () => {
      const analyzer1 = createMockAnalyzer('EMA');
      const analyzer2 = createMockAnalyzer('RSI');
      const analyzers = new Map([
        ['EMA', { instance: analyzer1, weight: 0.5, priority: 5 }],
        ['RSI', { instance: analyzer2, weight: 0.5, priority: 5 }],
      ]);

      mockRegistry = createMockAnalyzerRegistry(analyzers);
      service = new AnalyzerEngineService(mockRegistry, mockLogger as any);

      const candles = createMockCandles(50);
      const config = createMockStrategyConfig(['EMA', 'RSI']);

      // Execute multiple times concurrently
      const results = await Promise.all([
        service.executeAnalyzers(candles, config),
        service.executeAnalyzers(candles, config),
        service.executeAnalyzers(candles, config),
      ]);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.signals).toHaveLength(2);
      });
    });
  });
});
