/**
 * Signal Aggregation Integration Tests (Phase 3.3)
 *
 * Verifies that signal aggregation works correctly across backtest and production systems.
 * Tests complete signal processing flows from analyzers to entry decisions.
 */

import {
  aggregateSignalsWeighted,
  buildAggregationConfig,
  AggregationConfig,
} from '../../decision-engine/signal-aggregation';
import { AnalyzerSignal, SignalDirection } from '../../types';
import { BacktestEngineV5 } from '../../backtest/backtest-engine-v5';
import { LoggerService } from '../../services/logger.service';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createAnalyzerSignal(
  source: string,
  direction: SignalDirection,
  confidence: number,
): AnalyzerSignal {
  return {
    source,
    direction,
    confidence,
    weight: 1.0,
    priority: 1,
  };
}

function createBacktestConfig(strategyFile: string): any {
  return {
    strategyFile,
    symbol: 'ETHUSDT',
    dataProvider: 'json',
    startDate: '2023-01-01',
    endDate: '2023-01-07',
    initialBalance: 10000,
    maxOpenPositions: 1,
  };
}

// ============================================================================
// TEST SUITE: Integration Tests
// ============================================================================

describe('Signal Aggregation Integration Tests', () => {
  const logger = new LoggerService();

  describe('Aggregation Config Builder', () => {
    test('builds config from simple analyzer list', () => {
      const mockStrategy = {
        analyzers: [
          { name: 'RSI', enabled: true, weight: 1.0, priority: 1 },
          { name: 'MACD', enabled: true, weight: 1.0, priority: 1 },
          { name: 'EMA', enabled: false, weight: 1.0, priority: 1 },
        ],
        filters: {},
      };

      const config = buildAggregationConfig(
        new Map([
          ['RSI', 1.0],
          ['MACD', 1.0],
        ])
      );

      expect(config.weights.size).toBe(2);
      expect(config.weights.get('RSI')).toBe(1.0);
      expect(config.weights.get('MACD')).toBe(1.0);
      expect(config.minTotalScore).toBe(0.45);
      expect(config.minConfidence).toBe(0.75);
    });

    test('includes blind zone config if provided', () => {
      const weights = new Map<string, number>();
      weights.set('RSI', 1.0);

      const config = buildAggregationConfig(weights, {
        blindZone: {
          minSignalsForLong: 4,
          minSignalsForShort: 4,
          longPenalty: 0.8,
          shortPenalty: 0.85,
        },
      });

      expect(config.blindZone).toBeDefined();
      expect(config.blindZone?.minSignalsForLong).toBe(4);
      expect(config.blindZone?.longPenalty).toBe(0.8);
    });
  });

  describe('Complete Signal Flow: Analyzer → Aggregation → Entry Decision', () => {
    test('multiple LONG signals → aggregates to strong LONG', () => {
      const config = buildAggregationConfig(
        new Map([
          ['RSI', 1.0],
          ['MACD', 1.0],
          ['EMA', 1.0],
        ])
      );

      const signals: AnalyzerSignal[] = [
        createAnalyzerSignal('RSI', SignalDirection.LONG, 0.85),
        createAnalyzerSignal('MACD', SignalDirection.LONG, 0.90),
        createAnalyzerSignal('EMA', SignalDirection.LONG, 0.80),
      ];

      const result = aggregateSignalsWeighted(signals, config);

      expect(result.direction).toBe(SignalDirection.LONG);
      expect(result.totalScore).toBeGreaterThan(0.8);
      expect(result.signalCount).toBe(3);
      expect(result.confidence).toBeGreaterThan(0.75);
    });

    test('mixed LONG/SHORT signals with LONG majority → LONG direction', () => {
      const config = buildAggregationConfig(
        new Map([
          ['RSI', 1.0],
          ['MACD', 1.0],
          ['EMA', 1.0],
        ])
      );

      const signals: AnalyzerSignal[] = [
        createAnalyzerSignal('RSI', SignalDirection.LONG, 0.90),
        createAnalyzerSignal('MACD', SignalDirection.LONG, 0.85),
        createAnalyzerSignal('EMA', SignalDirection.SHORT, 0.70),
      ];

      const result = aggregateSignalsWeighted(signals, config);

      expect(result.direction).toBe(SignalDirection.LONG);
      expect(result.conflictAnalysis.conflictLevel).toBeGreaterThan(0);
      expect(result.conflictAnalysis.consensusStrength).toBeGreaterThan(0.5);
    });

    test('equal LONG/SHORT signals → no consensus, wait', () => {
      const config = buildAggregationConfig(
        new Map([
          ['RSI', 1.0],
          ['MACD', 1.0],
        ])
      );

      const signals: AnalyzerSignal[] = [
        createAnalyzerSignal('RSI', SignalDirection.LONG, 0.85),
        createAnalyzerSignal('MACD', SignalDirection.SHORT, 0.85),
      ];

      const result = aggregateSignalsWeighted(signals, config);

      expect(result.direction).toBeNull();
      expect(result.conflictAnalysis.shouldWait).toBe(true);
      expect(result.conflictAnalysis.reasoning).toContain('CONSENSUS');
    });

    test('low confidence signals → rejected by thresholds', () => {
      const config = buildAggregationConfig(
        new Map([
          ['RSI', 1.0],
          ['MACD', 1.0],
        ]),
        { minConfidence: 0.80 }
      );

      const signals: AnalyzerSignal[] = [
        createAnalyzerSignal('RSI', SignalDirection.LONG, 0.60), // Below threshold
        createAnalyzerSignal('MACD', SignalDirection.LONG, 0.65),
      ];

      const result = aggregateSignalsWeighted(signals, config);

      expect(result.direction).toBeNull();
    });

    test('blind zone penalty on low signal count', () => {
      const config = buildAggregationConfig(
        new Map([['RSI', 1.0]]),
        {
          minConfidence: 0.60,
          blindZone: {
            minSignalsForLong: 3,
            minSignalsForShort: 3,
            longPenalty: 0.85,
            shortPenalty: 0.90,
          },
        }
      );

      const signals: AnalyzerSignal[] = [
        createAnalyzerSignal('RSI', SignalDirection.LONG, 0.80),
      ];

      const result = aggregateSignalsWeighted(signals, config);

      expect(result.appliedPenalty).toBe(0.85);
      expect(result.confidence).toBeLessThan(0.80);
    });
  });

  describe('Weighted Aggregation Accuracy', () => {
    test('different weights produce different aggregation scores', () => {
      const configEqual = buildAggregationConfig(
        new Map([
          ['High', 1.0],
          ['Low', 1.0],
        ])
      );

      const configWeighted = buildAggregationConfig(
        new Map([
          ['High', 2.0], // Double weight
          ['Low', 1.0],
        ])
      );

      const signals: AnalyzerSignal[] = [
        createAnalyzerSignal('High', SignalDirection.LONG, 0.90),
        createAnalyzerSignal('Low', SignalDirection.LONG, 0.50),
      ];

      const resultEqual = aggregateSignalsWeighted(signals, configEqual);
      const resultWeighted = aggregateSignalsWeighted(signals, configWeighted);

      // Weighted score should be higher (90 weighted more heavily)
      expect(resultWeighted.totalScore).toBeGreaterThan(resultEqual.totalScore);
    });

    test('breakdown excludes analyzers without weight', () => {
      const config = buildAggregationConfig(
        new Map([
          ['RSI', 1.0],
          ['MACD', 1.0],
          // EMA not in weights (will be ignored in breakdown)
        ]),
        { minConfidence: 0.60 }
      );

      const signals: AnalyzerSignal[] = [
        createAnalyzerSignal('RSI', SignalDirection.LONG, 0.90),
        createAnalyzerSignal('MACD', SignalDirection.LONG, 0.85),
        createAnalyzerSignal('EMA', SignalDirection.LONG, 0.95), // Has no weight in config
      ];

      const result = aggregateSignalsWeighted(signals, config);

      // EMA will be counted in direction analysis (3 LONG), but not in weighted breakdown
      expect(result.direction).toBe(SignalDirection.LONG);
      expect(result.analyzerBreakdown.has('EMA')).toBe(false); // Not in breakdown (no weight)
      expect(result.analyzerBreakdown.has('RSI')).toBe(true);
      expect(result.analyzerBreakdown.has('MACD')).toBe(true);
      expect(result.analyzerBreakdown.size).toBe(2); // Only RSI and MACD
    });

    test('analyzer breakdown tracks weighted contributions', () => {
      const config = buildAggregationConfig(
        new Map([
          ['RSI', 1.5],
          ['MACD', 1.0],
        ])
      );

      const signals: AnalyzerSignal[] = [
        createAnalyzerSignal('RSI', SignalDirection.LONG, 0.80),
        createAnalyzerSignal('MACD', SignalDirection.LONG, 0.60),
      ];

      const result = aggregateSignalsWeighted(signals, config);

      expect(result.analyzerBreakdown.get('RSI')).toBeCloseTo(1.2, 1); // 0.80 * 1.5
      expect(result.analyzerBreakdown.get('MACD')).toBeCloseTo(0.6, 1); // 0.60 * 1.0
    });
  });

  describe('Conflict Detection Accuracy', () => {
    test('strong consensus (80/20) → low conflict, execute', () => {
      const config = buildAggregationConfig(
        new Map([
          ['S1', 1.0],
          ['S2', 1.0],
          ['S3', 1.0],
          ['S4', 1.0],
          ['S5', 1.0],
        ])
      );

      const signals: AnalyzerSignal[] = [
        createAnalyzerSignal('S1', SignalDirection.LONG, 0.85),
        createAnalyzerSignal('S2', SignalDirection.LONG, 0.85),
        createAnalyzerSignal('S3', SignalDirection.LONG, 0.85),
        createAnalyzerSignal('S4', SignalDirection.LONG, 0.85),
        createAnalyzerSignal('S5', SignalDirection.SHORT, 0.70),
      ];

      const result = aggregateSignalsWeighted(signals, config);

      expect(result.direction).toBe(SignalDirection.LONG);
      expect(result.conflictAnalysis.conflictLevel).toBeLessThan(0.25);
      expect(result.conflictAnalysis.shouldWait).toBe(false);
    });

    test('moderate conflict (60/40) → allow entry if above threshold', () => {
      const config = buildAggregationConfig(
        new Map([
          ['S1', 1.0],
          ['S2', 1.0],
          ['S3', 1.0],
          ['S4', 1.0],
          ['S5', 1.0],
        ]),
        { conflictThreshold: 0.4 }
      );

      const signals: AnalyzerSignal[] = [
        createAnalyzerSignal('S1', SignalDirection.LONG, 0.85),
        createAnalyzerSignal('S2', SignalDirection.LONG, 0.85),
        createAnalyzerSignal('S3', SignalDirection.LONG, 0.85),
        createAnalyzerSignal('S4', SignalDirection.SHORT, 0.85),
        createAnalyzerSignal('S5', SignalDirection.SHORT, 0.85),
      ];

      const result = aggregateSignalsWeighted(signals, config);

      expect(result.direction).toBe(SignalDirection.LONG);
      expect(result.conflictAnalysis.conflictLevel).toBe(0.4); // 2/(3+2)
      expect(result.conflictAnalysis.shouldWait).toBe(false); // At threshold uses >
    });

    test('high conflict (50/50) → wait for clarity', () => {
      const config = buildAggregationConfig(
        new Map([
          ['S1', 1.0],
          ['S2', 1.0],
        ]),
        { conflictThreshold: 0.4 }
      );

      const signals: AnalyzerSignal[] = [
        createAnalyzerSignal('S1', SignalDirection.LONG, 0.85),
        createAnalyzerSignal('S2', SignalDirection.SHORT, 0.85),
      ];

      const result = aggregateSignalsWeighted(signals, config);

      expect(result.direction).toBeNull();
      expect(result.conflictAnalysis.shouldWait).toBe(true);
      expect(result.conflictAnalysis.conflictLevel).toBe(0.5);
    });
  });

  describe('Edge Cases & Robustness', () => {
    test('empty signal list → null decision', () => {
      const config = buildAggregationConfig(new Map());
      const result = aggregateSignalsWeighted([], config);

      expect(result.direction).toBeNull();
      expect(result.totalScore).toBe(0);
      expect(result.signalCount).toBe(0);
    });

    test('all signals with zero weight → null decision', () => {
      const config = buildAggregationConfig(
        new Map([
          ['RSI', 0],
          ['MACD', 0],
        ])
      );

      const signals: AnalyzerSignal[] = [
        createAnalyzerSignal('RSI', SignalDirection.LONG, 0.90),
        createAnalyzerSignal('MACD', SignalDirection.LONG, 0.85),
      ];

      const result = aggregateSignalsWeighted(signals, config);

      expect(result.direction).toBeNull();
      expect(result.totalScore).toBe(0);
    });

    test('analyzer not in weights map → signal ignored', () => {
      const config = buildAggregationConfig(
        new Map([['RSI', 1.0]])
        // MACD not in map
      );

      const signals: AnalyzerSignal[] = [
        createAnalyzerSignal('RSI', SignalDirection.LONG, 0.85),
        createAnalyzerSignal('MACD', SignalDirection.LONG, 0.90),
      ];

      const result = aggregateSignalsWeighted(signals, config);

      expect(result.analyzerBreakdown.has('MACD')).toBe(false);
      expect(result.analyzerBreakdown.size).toBe(1);
    });

    test('extreme confidence values → handled gracefully', () => {
      const config = buildAggregationConfig(
        new Map([['RSI', 1.0]])
      );

      const signals: AnalyzerSignal[] = [
        createAnalyzerSignal('RSI', SignalDirection.LONG, 1.0), // Max
        createAnalyzerSignal('RSI', SignalDirection.SHORT, 0.0), // Min
      ];

      // Should not throw
      expect(() => {
        aggregateSignalsWeighted(signals, config);
      }).not.toThrow();
    });

    test('very large signal count → scales correctly', () => {
      const config = buildAggregationConfig(
        new Map([['RSI', 1.0]])
      );

      const signals: AnalyzerSignal[] = Array(100)
        .fill(null)
        .map((_, i) => createAnalyzerSignal(`RSI_${i}`, SignalDirection.LONG, 0.85));

      config.weights.set('RSI_0', 1.0); // Only first has weight
      const result = aggregateSignalsWeighted(signals, config);

      expect(result.direction).toBe(SignalDirection.LONG);
      expect(result.signalCount).toBe(100); // All counted
      expect(result.analyzerBreakdown.size).toBe(1); // Only weighted one
    });
  });

  describe('Backtest/Production Parity', () => {
    test('same signals produce same aggregation result (deterministic)', () => {
      const config = buildAggregationConfig(
        new Map([
          ['RSI', 1.0],
          ['MACD', 1.0],
          ['EMA', 1.0],
        ])
      );

      const signals: AnalyzerSignal[] = [
        createAnalyzerSignal('RSI', SignalDirection.LONG, 0.85),
        createAnalyzerSignal('MACD', SignalDirection.LONG, 0.90),
        createAnalyzerSignal('EMA', SignalDirection.LONG, 0.80),
      ];

      // Run multiple times - should get same result
      const result1 = aggregateSignalsWeighted(signals, config);
      const result2 = aggregateSignalsWeighted(signals, config);
      const result3 = aggregateSignalsWeighted(signals, config);

      expect(result1.direction).toBe(result2.direction);
      expect(result1.totalScore).toBe(result2.totalScore);
      expect(result1.confidence).toBe(result2.confidence);
      expect(result2.direction).toBe(result3.direction);
      expect(result2.totalScore).toBe(result3.totalScore);
    });

    test('config variations produce expected differences', () => {
      const signals: AnalyzerSignal[] = [
        createAnalyzerSignal('RSI', SignalDirection.LONG, 0.80),
        createAnalyzerSignal('MACD', SignalDirection.LONG, 0.70),
      ];

      // Lenient thresholds
      const configLenient = buildAggregationConfig(
        new Map([
          ['RSI', 1.0],
          ['MACD', 1.0],
        ]),
        { minConfidence: 0.50 }
      );

      // Strict thresholds
      const configStrict = buildAggregationConfig(
        new Map([
          ['RSI', 1.0],
          ['MACD', 1.0],
        ]),
        { minConfidence: 0.85 }
      );

      const resultLenient = aggregateSignalsWeighted(signals, configLenient);
      const resultStrict = aggregateSignalsWeighted(signals, configStrict);

      // Lenient should allow, strict should reject
      expect(resultLenient.direction).toBe(SignalDirection.LONG);
      expect(resultStrict.direction).toBeNull();
    });
  });
});
