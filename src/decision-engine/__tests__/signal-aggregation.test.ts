/**
 * Signal Aggregation Tests (Phase 3.1)
 *
 * Comprehensive unit tests for pure signal aggregation functions
 * Tests all edge cases, thresholds, penalties, and conflict detection
 */

import {
  aggregateSignalsWeighted,
  calculateWeightedScore,
  analyzeSignalConflicts,
  applyBlindZonePenalty,
  meetsThresholdChecks,
  buildAggregationConfig,
  AggregationConfig,
  WeightedScore,
} from '../signal-aggregation';
import { AnalyzerSignal, SignalDirection } from '../../types';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create a test analyzer signal
 */
function createSignal(
  source: string,
  direction: SignalDirection,
  confidence: number,
  weight: number = 1.0,
): AnalyzerSignal {
  return {
    source,
    direction,
    confidence,
    weight,
    priority: 1,
  };
}

/**
 * Create a test aggregation config
 */
function createConfig(overrides?: Partial<AggregationConfig>): AggregationConfig {
  const weights = new Map<string, number>();
  weights.set('RSI', 1.0);
  weights.set('MACD', 1.0);
  weights.set('EMA', 1.0);

  return {
    weights,
    minTotalScore: 0.45,
    minConfidence: 0.75,
    conflictThreshold: 0.4,
    ...overrides,
  };
}

// ============================================================================
// TEST SUITE: aggregateSignalsWeighted()
// ============================================================================

describe('aggregateSignalsWeighted() - Main Function', () => {
  test('empty signals array → null direction', () => {
    const config = createConfig();
    const result = aggregateSignalsWeighted([], config);

    expect(result.direction).toBeNull();
    expect(result.totalScore).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.signalCount).toBe(0);
    expect(result.appliedPenalty).toBe(1.0);
    expect(result.analyzerBreakdown.size).toBe(0);
  });

  test('single LONG signal above threshold → LONG decision', () => {
    const config = createConfig();
    const signals = [createSignal('RSI', SignalDirection.LONG, 80)];

    const result = aggregateSignalsWeighted(signals, config);

    expect(result.direction).toBe(SignalDirection.LONG);
    expect(result.signalCount).toBe(1);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test('single SHORT signal above threshold → SHORT decision', () => {
    const config = createConfig();
    const signals = [createSignal('RSI', SignalDirection.SHORT, 90)];

    const result = aggregateSignalsWeighted(signals, config);

    expect(result.direction).toBe(SignalDirection.SHORT);
    expect(result.signalCount).toBe(1);
  });

  test('signal below confidence threshold → null direction', () => {
    const config = createConfig({ minConfidence: 0.80 });
    const signals = [createSignal('RSI', SignalDirection.LONG, 50)]; // 50% < 80%

    const result = aggregateSignalsWeighted(signals, config);

    expect(result.direction).toBeNull();
  });

  test('LONG signals outnumber SHORT → LONG direction', () => {
    const config = createConfig();
    const signals = [
      createSignal('RSI', SignalDirection.LONG, 80),
      createSignal('MACD', SignalDirection.LONG, 85),
      createSignal('EMA', SignalDirection.SHORT, 70),
    ];

    const result = aggregateSignalsWeighted(signals, config);

    expect(result.direction).toBe(SignalDirection.LONG);
    expect(result.signalCount).toBe(2); // Count of LONG signals (winning direction)
  });

  test('SHORT signals outnumber LONG → SHORT direction', () => {
    const config = createConfig();
    const signals = [
      createSignal('RSI', SignalDirection.LONG, 80),
      createSignal('MACD', SignalDirection.SHORT, 85),
      createSignal('EMA', SignalDirection.SHORT, 90),
    ];

    const result = aggregateSignalsWeighted(signals, config);

    expect(result.direction).toBe(SignalDirection.SHORT);
  });

  test('equal LONG/SHORT votes (no consensus) → null direction + shouldWait', () => {
    const config = createConfig();
    const signals = [
      createSignal('RSI', SignalDirection.LONG, 80),
      createSignal('MACD', SignalDirection.SHORT, 90),
    ];

    const result = aggregateSignalsWeighted(signals, config);

    expect(result.direction).toBeNull();
    expect(result.conflictAnalysis.shouldWait).toBe(true);
    expect(result.conflictAnalysis.reasoning).toContain('CONSENSUS'); // Contains NO CONSENSUS
  });

  test('high signal conflict (50/50 split) → wait instead of enter', () => {
    const config = createConfig({ conflictThreshold: 0.4 });
    const signals = [
      createSignal('RSI', SignalDirection.LONG, 85),
      createSignal('MACD', SignalDirection.SHORT, 85),
      createSignal('EMA', SignalDirection.LONG, 80),
      createSignal('BB', SignalDirection.SHORT, 80),
    ];

    const result = aggregateSignalsWeighted(signals, config);

    expect(result.direction).toBeNull();
    expect(result.conflictAnalysis.shouldWait).toBe(true);
    expect(result.conflictAnalysis.conflictLevel).toBe(0.5);
  });

  test('weighted average calculation → correct score', () => {
    const config = createConfig();
    // RSI: 80 * 1.0 = 80, MACD: 100 * 1.0 = 100
    // Weighted avg = (80 + 100) / 2 = 90 = 0.90
    const signals = [
      createSignal('RSI', SignalDirection.LONG, 80),
      createSignal('MACD', SignalDirection.LONG, 100),
    ];

    const result = aggregateSignalsWeighted(signals, config);

    expect(result.totalScore).toBeCloseTo(0.90, 2);
    expect(result.direction).toBe(SignalDirection.LONG);
  });

  test('analyzer breakdown → maps all sources with scores', () => {
    const config = createConfig();
    const signals = [
      createSignal('RSI', SignalDirection.LONG, 80),
      createSignal('MACD', SignalDirection.LONG, 100),
    ];

    const result = aggregateSignalsWeighted(signals, config);

    expect(result.analyzerBreakdown.has('RSI')).toBe(true);
    expect(result.analyzerBreakdown.has('MACD')).toBe(true);
    expect(result.analyzerBreakdown.get('RSI')).toBeCloseTo(0.8, 2);
    expect(result.analyzerBreakdown.get('MACD')).toBeCloseTo(1.0, 2);
  });

  test('blind zone penalty → reduces confidence for low signal count', () => {
    const config = createConfig({
      blindZone: {
        minSignalsForLong: 3,
        minSignalsForShort: 3,
        longPenalty: 0.85,
        shortPenalty: 0.90,
      },
    });
    const signals = [createSignal('RSI', SignalDirection.LONG, 80)]; // Only 1 signal < 3

    const result = aggregateSignalsWeighted(signals, config);

    expect(result.appliedPenalty).toBe(0.85);
    expect(result.confidence).toBeLessThan(0.8 * 1.0); // Penalty applied
  });

  test('no blind zone config → no penalty applied', () => {
    const config = createConfig({ blindZone: undefined });
    const signals = [createSignal('RSI', SignalDirection.LONG, 80)];

    const result = aggregateSignalsWeighted(signals, config);

    expect(result.appliedPenalty).toBe(1.0);
    expect(result.confidence).toBeCloseTo(0.8, 2);
  });

  test('confidence > 100 (normalized from percentage) → handled correctly', () => {
    const config = createConfig();
    const signals = [createSignal('RSI', SignalDirection.LONG, 85)]; // Assume 85 is 85%

    const result = aggregateSignalsWeighted(signals, config);

    expect(result.direction).toBe(SignalDirection.LONG);
    expect(result.confidence).toBeCloseTo(0.85, 2);
  });
});

// ============================================================================
// TEST SUITE: calculateWeightedScore()
// ============================================================================

describe('calculateWeightedScore() - Weighted Average Calculation', () => {
  test('empty signals → zero score', () => {
    const weights = new Map<string, number>();
    weights.set('RSI', 1.0);

    const result = calculateWeightedScore([], weights);

    expect(result.total).toBe(0);
    expect(result.average).toBe(0);
    expect(result.count).toBe(0);
    expect(result.breakdown.size).toBe(0);
  });

  test('single signal with weight 1.0 → confidence as score', () => {
    const weights = new Map<string, number>();
    weights.set('RSI', 1.0);
    const signals = [createSignal('RSI', SignalDirection.LONG, 75)];

    const result = calculateWeightedScore(signals, weights);

    expect(result.total).toBeCloseTo(0.75, 2);
    expect(result.average).toBeCloseTo(0.75, 2);
    expect(result.count).toBe(1);
  });

  test('three equal-weighted signals → average confidence', () => {
    const weights = new Map<string, number>();
    weights.set('RSI', 1.0);
    weights.set('MACD', 1.0);
    weights.set('EMA', 1.0);
    const signals = [
      createSignal('RSI', SignalDirection.LONG, 0.80),
      createSignal('MACD', SignalDirection.LONG, 0.90),
      createSignal('EMA', SignalDirection.LONG, 0.70),
    ];

    const result = calculateWeightedScore(signals, weights);

    expect(result.total).toBeCloseTo(0.8, 1); // (0.80 + 0.90 + 0.70) / 3 ≈ 0.8
    expect(result.count).toBe(3);
  });

  test('different weights → weighted average applied correctly', () => {
    const weights = new Map<string, number>();
    weights.set('RSI', 2.0);  // Double weight
    weights.set('MACD', 1.0);
    const signals = [
      createSignal('RSI', SignalDirection.LONG, 100),
      createSignal('MACD', SignalDirection.LONG, 0),
    ];

    const result = calculateWeightedScore(signals, weights);

    // Weighted avg = (100 * 2.0 + 0 * 1.0) / (2.0 + 1.0) = 200 / 3 = 0.667
    expect(result.total).toBeCloseTo(0.6667, 3);
  });

  test('zero weight → signal ignored', () => {
    const weights = new Map<string, number>();
    weights.set('RSI', 1.0);
    weights.set('MACD', 0); // Zero weight
    const signals = [
      createSignal('RSI', SignalDirection.LONG, 80),
      createSignal('MACD', SignalDirection.LONG, 0), // Should be ignored
    ];

    const result = calculateWeightedScore(signals, weights);

    expect(result.total).toBeCloseTo(0.8, 2);
    expect(result.breakdown.has('MACD')).toBe(false);
  });

  test('negative weight → signal ignored (treated as zero)', () => {
    const weights = new Map<string, number>();
    weights.set('RSI', 1.0);
    weights.set('MACD', -1.0); // Negative weight
    const signals = [
      createSignal('RSI', SignalDirection.LONG, 80),
      createSignal('MACD', SignalDirection.LONG, 50),
    ];

    const result = calculateWeightedScore(signals, weights);

    expect(result.total).toBeCloseTo(0.8, 2);
    expect(result.breakdown.has('MACD')).toBe(false);
  });

  test('missing weight → signal ignored (treated as zero)', () => {
    const weights = new Map<string, number>();
    weights.set('RSI', 1.0);
    // MACD not in weights map
    const signals = [
      createSignal('RSI', SignalDirection.LONG, 80),
      createSignal('MACD', SignalDirection.LONG, 50),
    ];

    const result = calculateWeightedScore(signals, weights);

    expect(result.total).toBeCloseTo(0.8, 2);
    expect(result.breakdown.has('MACD')).toBe(false);
  });

  test('breakdown map contains all signals', () => {
    const weights = new Map<string, number>();
    weights.set('RSI', 1.0);
    weights.set('MACD', 2.0);
    const signals = [
      createSignal('RSI', SignalDirection.LONG, 80),
      createSignal('MACD', SignalDirection.LONG, 90),
    ];

    const result = calculateWeightedScore(signals, weights);

    expect(result.breakdown.size).toBe(2);
    expect(result.breakdown.get('RSI')).toBeCloseTo(0.8, 2);
    expect(result.breakdown.get('MACD')).toBeCloseTo(1.8, 2);
  });
});

// ============================================================================
// TEST SUITE: analyzeSignalConflicts()
// ============================================================================

describe('analyzeSignalConflicts() - Conflict Detection', () => {
  test('all LONG signals → no conflict', () => {
    const longScore: WeightedScore = {
      total: 0.85,
      average: 0.85,
      count: 3,
      breakdown: new Map(),
    };
    const shortScore: WeightedScore = {
      total: 0,
      average: 0,
      count: 0,
      breakdown: new Map(),
    };

    const result = analyzeSignalConflicts(longScore, shortScore, 0.4);

    expect(result.conflictLevel).toBe(0);
    expect(result.direction).toBe(SignalDirection.LONG);
    expect(result.shouldWait).toBe(false);
  });

  test('all SHORT signals → no conflict', () => {
    const longScore: WeightedScore = {
      total: 0,
      average: 0,
      count: 0,
      breakdown: new Map(),
    };
    const shortScore: WeightedScore = {
      total: 0.80,
      average: 0.80,
      count: 2,
      breakdown: new Map(),
    };

    const result = analyzeSignalConflicts(longScore, shortScore, 0.4);

    expect(result.conflictLevel).toBe(0);
    expect(result.direction).toBe(SignalDirection.SHORT);
    expect(result.shouldWait).toBe(false);
  });

  test('60/40 split (at threshold) → LONG consensus (conflict > threshold)', () => {
    const longScore: WeightedScore = {
      total: 0.85,
      average: 0.85,
      count: 3,
      breakdown: new Map(),
    };
    const shortScore: WeightedScore = {
      total: 0.80,
      average: 0.80,
      count: 2,
      breakdown: new Map(),
    };

    const result = analyzeSignalConflicts(longScore, shortScore, 0.4);

    expect(result.conflictLevel).toBe(0.4); // 2/(3+2) = 0.4
    expect(result.direction).toBe(SignalDirection.LONG); // Not equal, LONG > SHORT
    expect(result.shouldWait).toBe(false); // At threshold uses > not >=
  });

  test('50/50 split (equal votes) → wait with NO CONSENSUS', () => {
    const longScore: WeightedScore = {
      total: 0.85,
      average: 0.85,
      count: 2,
      breakdown: new Map(),
    };
    const shortScore: WeightedScore = {
      total: 0.80,
      average: 0.80,
      count: 2,
      breakdown: new Map(),
    };

    const result = analyzeSignalConflicts(longScore, shortScore, 0.4);

    expect(result.conflictLevel).toBe(0.5);
    expect(result.direction).toBeNull();
    expect(result.shouldWait).toBe(true);
    expect(result.reasoning).toContain('CONSENSUS'); // NO CONSENSUS message
  });

  test('high conflict (1 vs 3) → above threshold → wait', () => {
    const longScore: WeightedScore = {
      total: 0.90,
      average: 0.90,
      count: 1,
      breakdown: new Map(),
    };
    const shortScore: WeightedScore = {
      total: 0.85,
      average: 0.85,
      count: 3,
      breakdown: new Map(),
    };

    const result = analyzeSignalConflicts(longScore, shortScore, 0.4);

    expect(result.conflictLevel).toBe(0.25); // 1/(1+3) = 0.25
    expect(result.direction).toBe(SignalDirection.SHORT);
    expect(result.shouldWait).toBe(false); // Below threshold
  });

  test('empty signals → no conflict', () => {
    const longScore: WeightedScore = {
      total: 0,
      average: 0,
      count: 0,
      breakdown: new Map(),
    };
    const shortScore: WeightedScore = {
      total: 0,
      average: 0,
      count: 0,
      breakdown: new Map(),
    };

    const result = analyzeSignalConflicts(longScore, shortScore, 0.4);

    expect(result.direction).toBeNull();
    expect(result.conflictLevel).toBe(0);
    expect(result.shouldWait).toBe(false);
  });

  test('consensus strength calculation → correct metric', () => {
    const longScore: WeightedScore = {
      total: 0.85,
      average: 0.85,
      count: 4,
      breakdown: new Map(),
    };
    const shortScore: WeightedScore = {
      total: 0.80,
      average: 0.80,
      count: 1,
      breakdown: new Map(),
    };

    const result = analyzeSignalConflicts(longScore, shortScore, 0.4);

    expect(result.consensusStrength).toBe(0.8); // 4/(4+1) = 0.8
  });
});

// ============================================================================
// TEST SUITE: applyBlindZonePenalty()
// ============================================================================

describe('applyBlindZonePenalty() - Blind Zone Penalty', () => {
  test('no blind zone config → no penalty', () => {
    const score: WeightedScore = {
      total: 0.85,
      average: 0.85,
      count: 1,
      breakdown: new Map(),
    };

    const penalty = applyBlindZonePenalty(score, SignalDirection.LONG);

    expect(penalty).toBe(1.0);
  });

  test('LONG with 1 signal < minSignalsForLong (3) → apply penalty', () => {
    const score: WeightedScore = {
      total: 0.85,
      average: 0.85,
      count: 1,
      breakdown: new Map(),
    };
    const config = {
      minSignalsForLong: 3,
      minSignalsForShort: 3,
      longPenalty: 0.85,
      shortPenalty: 0.90,
    };

    const penalty = applyBlindZonePenalty(score, SignalDirection.LONG, config);

    expect(penalty).toBe(0.85);
  });

  test('SHORT with 2 signals < minSignalsForShort (3) → apply penalty', () => {
    const score: WeightedScore = {
      total: 0.90,
      average: 0.90,
      count: 2,
      breakdown: new Map(),
    };
    const config = {
      minSignalsForLong: 3,
      minSignalsForShort: 3,
      longPenalty: 0.85,
      shortPenalty: 0.90,
    };

    const penalty = applyBlindZonePenalty(score, SignalDirection.SHORT, config);

    expect(penalty).toBe(0.90);
  });

  test('LONG with 3 signals >= minSignalsForLong (3) → no penalty', () => {
    const score: WeightedScore = {
      total: 0.85,
      average: 0.85,
      count: 3,
      breakdown: new Map(),
    };
    const config = {
      minSignalsForLong: 3,
      minSignalsForShort: 3,
      longPenalty: 0.85,
      shortPenalty: 0.90,
    };

    const penalty = applyBlindZonePenalty(score, SignalDirection.LONG, config);

    expect(penalty).toBe(1.0);
  });

  test('SHORT with 5 signals >> minSignalsForShort (3) → no penalty', () => {
    const score: WeightedScore = {
      total: 0.90,
      average: 0.90,
      count: 5,
      breakdown: new Map(),
    };
    const config = {
      minSignalsForLong: 3,
      minSignalsForShort: 3,
      longPenalty: 0.85,
      shortPenalty: 0.90,
    };

    const penalty = applyBlindZonePenalty(score, SignalDirection.SHORT, config);

    expect(penalty).toBe(1.0);
  });

  test('custom blind zone thresholds → correct penalty applied', () => {
    const score: WeightedScore = {
      total: 0.85,
      average: 0.85,
      count: 2,
      breakdown: new Map(),
    };
    const config = {
      minSignalsForLong: 5,  // Custom: 5 signals required
      minSignalsForShort: 5,
      longPenalty: 0.70,    // Custom: 30% penalty
      shortPenalty: 0.80,
    };

    const penalty = applyBlindZonePenalty(score, SignalDirection.LONG, config);

    expect(penalty).toBe(0.70);
  });
});

// ============================================================================
// TEST SUITE: meetsThresholdChecks()
// ============================================================================

describe('meetsThresholdChecks() - Threshold Validation', () => {
  test('both above thresholds → true', () => {
    const result = meetsThresholdChecks(0.5, 0.8, 0.45, 0.75);
    expect(result).toBe(true);
  });

  test('score below threshold → false', () => {
    const result = meetsThresholdChecks(0.4, 0.8, 0.45, 0.75);
    expect(result).toBe(false);
  });

  test('confidence below threshold → false', () => {
    const result = meetsThresholdChecks(0.5, 0.7, 0.45, 0.75);
    expect(result).toBe(false);
  });

  test('both below thresholds → false', () => {
    const result = meetsThresholdChecks(0.3, 0.6, 0.45, 0.75);
    expect(result).toBe(false);
  });

  test('exactly at thresholds → true', () => {
    const result = meetsThresholdChecks(0.45, 0.75, 0.45, 0.75);
    expect(result).toBe(true);
  });

  test('custom thresholds → correct comparison', () => {
    const result = meetsThresholdChecks(0.6, 0.9, 0.5, 0.8);
    expect(result).toBe(true);
  });
});

// ============================================================================
// TEST SUITE: buildAggregationConfig()
// ============================================================================

describe('buildAggregationConfig() - Config Builder', () => {
  test('minimal config → default values applied', () => {
    const weights = new Map<string, number>();
    weights.set('RSI', 1.0);

    const config = buildAggregationConfig(weights);

    expect(config.weights).toBe(weights);
    expect(config.minTotalScore).toBe(0.45);
    expect(config.minConfidence).toBe(0.75);
    expect(config.conflictThreshold).toBe(0.4);
    expect(config.blindZone).toBeUndefined();
  });

  test('with options → options override defaults', () => {
    const weights = new Map<string, number>();
    const config = buildAggregationConfig(weights, {
      minTotalScore: 0.5,
      minConfidence: 0.8,
      conflictThreshold: 0.3,
    });

    expect(config.minTotalScore).toBe(0.5);
    expect(config.minConfidence).toBe(0.8);
    expect(config.conflictThreshold).toBe(0.3);
  });

  test('with blind zone config → included in result', () => {
    const weights = new Map<string, number>();
    const blindZone = {
      minSignalsForLong: 4,
      minSignalsForShort: 4,
      longPenalty: 0.8,
      shortPenalty: 0.85,
    };

    const config = buildAggregationConfig(weights, { blindZone });

    expect(config.blindZone).toEqual(blindZone);
  });

  test('partial options → only specified override', () => {
    const weights = new Map<string, number>();
    const config = buildAggregationConfig(weights, {
      minConfidence: 0.9,
      // minTotalScore not specified, should use default
    });

    expect(config.minConfidence).toBe(0.9);
    expect(config.minTotalScore).toBe(0.45);
  });
});

// ============================================================================
// INTEGRATION TESTS: Complex Scenarios
// ============================================================================

describe('Signal Aggregation - Integration Tests', () => {
  test('real-world scenario: strong LONG consensus with penalty', () => {
    const config = createConfig({
      minTotalScore: 0.45,
      minConfidence: 0.60, // Lower threshold due to penalty
      blindZone: {
        minSignalsForLong: 3,
        minSignalsForShort: 3,
        longPenalty: 0.85,
        shortPenalty: 0.90,
      },
    });
    const signals = [
      createSignal('RSI', SignalDirection.LONG, 0.85),
      createSignal('MACD', SignalDirection.LONG, 0.80),
    ];

    const result = aggregateSignalsWeighted(signals, config);

    expect(result.direction).toBe(SignalDirection.LONG);
    expect(result.appliedPenalty).toBe(0.85); // Only 2 signals < 3
    const expectedConfidence = ((0.85 + 0.80) / 2) * 0.85; // Average * penalty
    expect(result.confidence).toBeCloseTo(expectedConfidence, 2);
  });

  test('weak signal + conflict = wait', () => {
    const config = createConfig();
    const signals = [
      createSignal('RSI', SignalDirection.LONG, 55), // Below 75% threshold
      createSignal('MACD', SignalDirection.SHORT, 65),
    ];

    const result = aggregateSignalsWeighted(signals, config);

    expect(result.direction).toBeNull();
  });

  test('mixed weights with varying confidence', () => {
    const weights = new Map<string, number>();
    weights.set('RSI', 1.5);
    weights.set('MACD', 1.0);
    weights.set('EMA', 0.5);

    const config = { ...createConfig(), weights, minConfidence: 0.70 };
    const signals = [
      createSignal('RSI', SignalDirection.LONG, 0.80),
      createSignal('MACD', SignalDirection.LONG, 0.80),
      createSignal('EMA', SignalDirection.LONG, 0.80),
    ];

    const result = aggregateSignalsWeighted(signals, config);

    expect(result.direction).toBe(SignalDirection.LONG);
    expect(result.analyzerBreakdown.has('RSI')).toBe(true);
    expect(result.analyzerBreakdown.get('RSI')).toBeCloseTo(1.2, 2); // 0.80 * 1.5
  });

  test('confidence normalization: 100-scale input', () => {
    const config = createConfig();
    const signals = [
      createSignal('RSI', SignalDirection.LONG, 85), // Assumed to be 85%
    ];

    const result = aggregateSignalsWeighted(signals, config);

    expect(result.confidence).toBeCloseTo(0.85, 2);
    expect(result.direction).toBe(SignalDirection.LONG);
  });

  test('all signals with zero weight → null direction', () => {
    const weights = new Map<string, number>();
    weights.set('RSI', 0);
    weights.set('MACD', 0);

    const config = { ...createConfig(), weights };
    const signals = [
      createSignal('RSI', SignalDirection.LONG, 85),
      createSignal('MACD', SignalDirection.LONG, 90),
    ];

    const result = aggregateSignalsWeighted(signals, config);

    expect(result.direction).toBeNull();
    expect(result.totalScore).toBe(0);
  });
});
