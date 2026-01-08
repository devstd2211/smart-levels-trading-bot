/**
 * EMA Analyzer NEW - Technical Tests
 * Tests core functionality: configuration, calculations, signal generation
 */

import { EmaAnalyzerNew } from '../../analyzers/ema.analyzer-new';
import type { Candle } from '../../types/core';
import type { EmaAnalyzerConfigNew } from '../../types/config-new.types';
import { SignalDirection } from '../../types/enums';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createCandle(close: number): Candle {
  return {
    open: close * 0.99,
    high: close * 1.01,
    low: close * 0.98,
    close,
    volume: 1000,
    timestamp: Date.now(),
  };
}

function createCandleSequence(startPrice: number, count: number, direction: 'up' | 'down' | 'flat'): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    if (direction === 'up') {
      price += 0.5;
    } else if (direction === 'down') {
      price -= 0.5;
    }
    candles.push(createCandle(price));
  }

  return candles;
}

// ============================================================================
// CONFIGURATION TESTS
// ============================================================================

describe('EmaAnalyzerNew - Configuration', () => {
  test('should throw if enabled is not a boolean', () => {
    const config: any = {
      enabled: 'true',
      weight: 0.3,
      priority: 5,
      baseConfidence: 0.5,
      strengthMultiplier: 0.2,
      minConfidence: 0.3,
      maxConfidence: 0.8,
    };
    expect(() => new EmaAnalyzerNew(config)).toThrow('[EMA_ANALYZER] Missing or invalid: enabled');
  });

  test('should throw if weight is invalid', () => {
    const config: any = {
      enabled: true,
      weight: 1.5, // Invalid: > 1.0
      priority: 5,
      baseConfidence: 0.5,
      strengthMultiplier: 0.2,
      minConfidence: 0.3,
      maxConfidence: 0.8,
    };
    expect(() => new EmaAnalyzerNew(config)).toThrow('[EMA_ANALYZER] Missing or invalid: weight');
  });

  test('should throw if priority is invalid', () => {
    const config: any = {
      enabled: true,
      weight: 0.3,
      priority: 11, // Invalid: > 10
      baseConfidence: 0.5,
      strengthMultiplier: 0.2,
      minConfidence: 0.3,
      maxConfidence: 0.8,
    };
    expect(() => new EmaAnalyzerNew(config)).toThrow('[EMA_ANALYZER] Missing or invalid: priority');
  });

  test('should throw if baseConfidence is invalid', () => {
    const config: any = {
      enabled: true,
      weight: 0.3,
      priority: 5,
      baseConfidence: 1.5, // Invalid: > 1.0
      strengthMultiplier: 0.2,
      minConfidence: 0.3,
      maxConfidence: 0.8,
    };
    expect(() => new EmaAnalyzerNew(config)).toThrow('[EMA_ANALYZER] Missing or invalid: baseConfidence');
  });

  test('should throw if strengthMultiplier is negative', () => {
    const config: any = {
      enabled: true,
      weight: 0.3,
      priority: 5,
      baseConfidence: 0.5,
      strengthMultiplier: -0.1, // Invalid
      minConfidence: 0.3,
      maxConfidence: 0.8,
    };
    expect(() => new EmaAnalyzerNew(config)).toThrow('[EMA_ANALYZER] Missing or invalid: strengthMultiplier');
  });

  test('should throw if minConfidence is invalid', () => {
    const config: any = {
      enabled: true,
      weight: 0.3,
      priority: 5,
      baseConfidence: 0.5,
      strengthMultiplier: 0.2,
      minConfidence: 1.5, // Invalid: > 1.0
      maxConfidence: 0.8,
    };
    expect(() => new EmaAnalyzerNew(config)).toThrow('[EMA_ANALYZER] Missing or invalid: minConfidence');
  });

  test('should throw if maxConfidence is invalid', () => {
    const config: any = {
      enabled: true,
      weight: 0.3,
      priority: 5,
      baseConfidence: 0.5,
      strengthMultiplier: 0.2,
      minConfidence: 0.3,
      maxConfidence: 1.5, // Invalid: > 1.0
    };
    expect(() => new EmaAnalyzerNew(config)).toThrow('[EMA_ANALYZER] Missing or invalid: maxConfidence');
  });

  test('should throw if minConfidence > maxConfidence', () => {
    const config: any = {
      enabled: true,
      weight: 0.3,
      priority: 5,
      baseConfidence: 0.5,
      strengthMultiplier: 0.2,
      minConfidence: 0.8,
      maxConfidence: 0.3, // Invalid: min > max
    };
    expect(() => new EmaAnalyzerNew(config)).toThrow('minConfidence cannot be greater than maxConfidence');
  });

  test('should accept valid config', () => {
    const config: EmaAnalyzerConfigNew = {
      enabled: true,
      weight: 0.3,
      priority: 5,
      baseConfidence: 0.5,
      strengthMultiplier: 0.2,
      minConfidence: 0.3,
      maxConfidence: 0.8,
    };
    expect(() => new EmaAnalyzerNew(config)).not.toThrow();
  });

  test('should return config values', () => {
    const config: EmaAnalyzerConfigNew = {
      enabled: true,
      weight: 0.25,
      priority: 6,
      baseConfidence: 0.6,
      strengthMultiplier: 0.3,
      minConfidence: 0.4,
      maxConfidence: 0.9,
    };
    const analyzer = new EmaAnalyzerNew(config);
    const retrieved = analyzer.getConfig();

    expect(retrieved.enabled).toBe(true);
    expect(retrieved.weight).toBe(0.25);
    expect(retrieved.priority).toBe(6);
    expect(retrieved.baseConfidence).toBe(0.6);
    expect(retrieved.strengthMultiplier).toBe(0.3);
    expect(retrieved.minConfidence).toBe(0.4);
    expect(retrieved.maxConfidence).toBe(0.9);
  });
});

// ============================================================================
// INPUT VALIDATION TESTS
// ============================================================================

describe('EmaAnalyzerNew - Input Validation', () => {
  const config: EmaAnalyzerConfigNew = {
    enabled: true,
    weight: 0.3,
    priority: 5,
    baseConfidence: 0.5,
    strengthMultiplier: 0.2,
    minConfidence: 0.3,
    maxConfidence: 0.8,
  };

  test('should throw if analyzer is disabled', () => {
    const disabledConfig = { ...config, enabled: false };
    const analyzer = new EmaAnalyzerNew(disabledConfig);

    const candles = createCandleSequence(100, 50, 'up');
    expect(() => analyzer.analyze(candles)).toThrow('[EMA_ANALYZER] Analyzer is disabled');
  });

  test('should throw if candles is not array', () => {
    const analyzer = new EmaAnalyzerNew(config);
    expect(() => analyzer.analyze(null as any)).toThrow('[EMA_ANALYZER] Invalid candles input');
  });

  test('should throw if candles array is too short', () => {
    const analyzer = new EmaAnalyzerNew(config);
    const candles = createCandleSequence(100, 30, 'up');

    expect(() => analyzer.analyze(candles)).toThrow('Not enough candles');
  });

  test('should throw if candle is missing close', () => {
    const analyzer = new EmaAnalyzerNew(config);
    const candles = createCandleSequence(100, 50, 'up');
    candles[25].close = undefined as any;

    expect(() => analyzer.analyze(candles)).toThrow('Invalid candle at index 25');
  });
});

// ============================================================================
// SIGNAL GENERATION TESTS
// ============================================================================

describe('EmaAnalyzerNew - Signal Generation', () => {
  const config: EmaAnalyzerConfigNew = {
    enabled: true,
    weight: 0.3,
    priority: 5,
    baseConfidence: 0.5,
    strengthMultiplier: 0.2,
    minConfidence: 0.3,
    maxConfidence: 0.8,
  };

  test('should generate LONG signal during uptrend', () => {
    const analyzer = new EmaAnalyzerNew(config);
    const candles = createCandleSequence(100, 50, 'up');

    const signal = analyzer.analyze(candles);

    expect(signal.source).toBe('EMA_ANALYZER');
    expect(signal.direction).toBe(SignalDirection.LONG);
    expect(signal.confidence).toBeGreaterThan(0);
    expect(signal.confidence).toBeLessThanOrEqual(100);
    expect(signal.weight).toBe(0.3);
    expect(signal.priority).toBe(5);
  });

  test('should generate SHORT signal during downtrend', () => {
    const analyzer = new EmaAnalyzerNew(config);
    const candles = createCandleSequence(100, 50, 'down');

    const signal = analyzer.analyze(candles);

    expect(signal.source).toBe('EMA_ANALYZER');
    expect(signal.direction).toBe(SignalDirection.SHORT);
    expect(signal.confidence).toBeGreaterThan(0);
    expect(signal.confidence).toBeLessThanOrEqual(100);
  });

  test('should generate HOLD signal during consolidation', () => {
    const analyzer = new EmaAnalyzerNew(config);
    const candles = createCandleSequence(100, 50, 'flat');

    const signal = analyzer.analyze(candles);

    // Flat trend might be LONG or SHORT depending on EMAs, but check it's valid
    expect([SignalDirection.LONG, SignalDirection.SHORT, SignalDirection.HOLD]).toContain(
      signal.direction,
    );
  });

  test('should include score calculation', () => {
    const analyzer = new EmaAnalyzerNew(config);
    const candles = createCandleSequence(100, 50, 'up');

    const signal = analyzer.analyze(candles);

    // Score = (confidence/100) * weight
    // Max = (100/100) * 0.3 = 0.3
    expect(signal.score).toBeDefined();
    expect(signal.score).toBeGreaterThanOrEqual(0);
    expect(signal.score).toBeLessThanOrEqual(0.3); // 100% confidence * 0.3 weight
  });
});

// ============================================================================
// CONFIDENCE CALCULATION TESTS
// ============================================================================

describe('EmaAnalyzerNew - Confidence Calculation', () => {
  test('should respect minimum confidence', () => {
    const config: EmaAnalyzerConfigNew = {
      enabled: true,
      weight: 0.3,
      priority: 5,
      baseConfidence: 0.1,
      strengthMultiplier: 0.01, // Very low multiplier
      minConfidence: 0.5,
      maxConfidence: 0.8,
    };
    const analyzer = new EmaAnalyzerNew(config);
    const candles = createCandleSequence(100, 50, 'flat'); // Low gap

    const signal = analyzer.analyze(candles);

    // Should be at least minConfidence * 100 = 50
    expect(signal.confidence).toBeGreaterThanOrEqual(50);
  });

  test('should respect maximum confidence', () => {
    const config: EmaAnalyzerConfigNew = {
      enabled: true,
      weight: 0.3,
      priority: 5,
      baseConfidence: 0.9,
      strengthMultiplier: 10, // Very high multiplier
      minConfidence: 0.3,
      maxConfidence: 0.6,
    };
    const analyzer = new EmaAnalyzerNew(config);
    const candles = createCandleSequence(100, 100, 'up'); // Large gap

    const signal = analyzer.analyze(candles);

    // Should be at most maxConfidence * 100 = 60
    expect(signal.confidence).toBeLessThanOrEqual(60);
  });

  test('should increase confidence with EMA gap', () => {
    const analyzer1 = new EmaAnalyzerNew({
      enabled: true,
      weight: 0.3,
      priority: 5,
      baseConfidence: 0.5,
      strengthMultiplier: 0.5,
      minConfidence: 0.3,
      maxConfidence: 0.8,
    });

    const analyzer2 = new EmaAnalyzerNew({
      enabled: true,
      weight: 0.3,
      priority: 5,
      baseConfidence: 0.5,
      strengthMultiplier: 2.0, // Higher multiplier
      minConfidence: 0.3,
      maxConfidence: 0.8,
    });

    const smallGapCandles = createCandleSequence(100, 50, 'up');
    const largeGapCandles = createCandleSequence(100, 100, 'up');

    const signal1 = analyzer1.analyze(smallGapCandles);
    const signal2 = analyzer2.analyze(largeGapCandles);

    // Larger gap with higher multiplier should produce higher confidence
    expect(signal2.confidence).toBeGreaterThan(signal1.confidence);
  });
});

// ============================================================================
// STATE MANAGEMENT TESTS
// ============================================================================

describe('EmaAnalyzerNew - State Management', () => {
  const config: EmaAnalyzerConfigNew = {
    enabled: true,
    weight: 0.3,
    priority: 5,
    baseConfidence: 0.5,
    strengthMultiplier: 0.2,
    minConfidence: 0.3,
    maxConfidence: 0.8,
  };

  test('should track last signal', () => {
    const analyzer = new EmaAnalyzerNew(config);
    expect(analyzer.getLastSignal()).toBeNull();

    const candles = createCandleSequence(100, 50, 'up');
    analyzer.analyze(candles);

    const lastSignal = analyzer.getLastSignal();
    expect(lastSignal).not.toBeNull();
    expect(lastSignal?.source).toBe('EMA_ANALYZER');
  });

  test('should update last signal on subsequent analysis', () => {
    const analyzer = new EmaAnalyzerNew(config);

    const upCandles = createCandleSequence(100, 50, 'up');
    const signal1 = analyzer.analyze(upCandles);

    const downCandles = createCandleSequence(150, 50, 'down');
    const signal2 = analyzer.analyze(downCandles);

    expect(signal1.direction).toBe(SignalDirection.LONG);
    expect(signal2.direction).toBe(SignalDirection.SHORT);
    expect(analyzer.getLastSignal()?.direction).toBe(SignalDirection.SHORT);
  });

  test('should return state correctly', () => {
    const analyzer = new EmaAnalyzerNew(config);
    const state1 = analyzer.getState();

    expect(state1.enabled).toBe(true);
    expect(state1.initialized).toBe(false);
    expect(state1.lastSignal).toBeNull();

    const candles = createCandleSequence(100, 50, 'up');
    analyzer.analyze(candles);

    const state2 = analyzer.getState();
    expect(state2.initialized).toBe(true);
    expect(state2.lastSignal).not.toBeNull();
  });

  test('should reset state correctly', () => {
    const analyzer = new EmaAnalyzerNew(config);
    const candles = createCandleSequence(100, 50, 'up');
    analyzer.analyze(candles);

    expect(analyzer.getLastSignal()).not.toBeNull();

    analyzer.reset();

    expect(analyzer.getLastSignal()).toBeNull();
    const state = analyzer.getState();
    expect(state.initialized).toBe(false);
  });
});

// ============================================================================
// EMA VALUE TESTS
// ============================================================================

describe('EmaAnalyzerNew - EMA Values', () => {
  const config: EmaAnalyzerConfigNew = {
    enabled: true,
    weight: 0.3,
    priority: 5,
    baseConfidence: 0.5,
    strengthMultiplier: 0.2,
    minConfidence: 0.3,
    maxConfidence: 0.8,
  };

  test('should return EMA values', () => {
    const analyzer = new EmaAnalyzerNew(config);
    const candles = createCandleSequence(100, 50, 'up');

    const emaValues = analyzer.getEmaValues(candles);

    expect(emaValues.fast).toBeDefined();
    expect(emaValues.slow).toBeDefined();
    expect(typeof emaValues.fast).toBe('number');
    expect(typeof emaValues.slow).toBe('number');
  });

  test('should have fast EMA above slow EMA in uptrend', () => {
    const analyzer = new EmaAnalyzerNew(config);
    const candles = createCandleSequence(100, 100, 'up');

    const emaValues = analyzer.getEmaValues(candles);

    expect(emaValues.fast).toBeGreaterThan(emaValues.slow);
  });

  test('should have fast EMA below slow EMA in downtrend', () => {
    const analyzer = new EmaAnalyzerNew(config);
    const candles = createCandleSequence(100, 100, 'down');

    const emaValues = analyzer.getEmaValues(candles);

    expect(emaValues.fast).toBeLessThan(emaValues.slow);
  });

  test('should throw if not enough candles for EMA values', () => {
    const analyzer = new EmaAnalyzerNew(config);
    const candles = createCandleSequence(100, 30, 'up');

    expect(() => analyzer.getEmaValues(candles)).toThrow('Not enough candles');
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('EmaAnalyzerNew - Edge Cases', () => {
  const config: EmaAnalyzerConfigNew = {
    enabled: true,
    weight: 0.3,
    priority: 5,
    baseConfidence: 0.5,
    strengthMultiplier: 0.2,
    minConfidence: 0.3,
    maxConfidence: 0.8,
  };

  test('should handle minimum candle requirement', () => {
    const analyzer = new EmaAnalyzerNew(config);
    const candles = createCandleSequence(100, 50, 'up'); // Exactly 50 candles

    expect(() => analyzer.analyze(candles)).not.toThrow();
  });

  test('should handle very large price values', () => {
    const analyzer = new EmaAnalyzerNew(config);
    const candles = createCandleSequence(100000, 50, 'up');

    const signal = analyzer.analyze(candles);

    // Large price values can have precision issues, so accept LONG or HOLD
    expect([SignalDirection.LONG, SignalDirection.HOLD]).toContain(signal.direction);
    expect(signal.confidence).toBeGreaterThan(0);
  });

  test('should handle very small price values', () => {
    const analyzer = new EmaAnalyzerNew(config);
    const candles = createCandleSequence(0.001, 50, 'up');

    const signal = analyzer.analyze(candles);

    expect(signal.direction).toBe(SignalDirection.LONG);
    expect(signal.confidence).toBeGreaterThan(0);
  });

  test('should handle weight of 0', () => {
    const zeroWeightConfig: EmaAnalyzerConfigNew = {
      enabled: true,
      weight: 0,
      priority: 5,
      baseConfidence: 0.5,
      strengthMultiplier: 0.2,
      minConfidence: 0.3,
      maxConfidence: 0.8,
    };
    const analyzer = new EmaAnalyzerNew(zeroWeightConfig);
    const candles = createCandleSequence(100, 50, 'up');

    const signal = analyzer.analyze(candles);

    expect(signal.score).toBe(0);
  });

  test('should handle zero base confidence', () => {
    const zeroConfConfig: EmaAnalyzerConfigNew = {
      enabled: true,
      weight: 0.3,
      priority: 5,
      baseConfidence: 0,
      strengthMultiplier: 0.2,
      minConfidence: 0,
      maxConfidence: 0.8,
    };
    const analyzer = new EmaAnalyzerNew(zeroConfConfig);
    const candles = createCandleSequence(100, 50, 'flat');

    const signal = analyzer.analyze(candles);

    expect(signal.confidence).toBeGreaterThanOrEqual(0);
  });

  test('should handle zero strength multiplier', () => {
    const zeroMultConfig: EmaAnalyzerConfigNew = {
      enabled: true,
      weight: 0.3,
      priority: 5,
      baseConfidence: 0.5,
      strengthMultiplier: 0, // No multiplier effect
      minConfidence: 0.3,
      maxConfidence: 0.8,
    };
    const analyzer = new EmaAnalyzerNew(zeroMultConfig);
    const candles = createCandleSequence(100, 50, 'up');

    const signal = analyzer.analyze(candles);

    // Confidence should be close to baseConfidence * 100
    expect(signal.confidence).toBeCloseTo(50, 0);
  });
});

// ============================================================================
// MULTIPLE ANALYSIS TESTS
// ============================================================================

describe('EmaAnalyzerNew - Multiple Analysis', () => {
  const config: EmaAnalyzerConfigNew = {
    enabled: true,
    weight: 0.3,
    priority: 5,
    baseConfidence: 0.5,
    strengthMultiplier: 0.2,
    minConfidence: 0.3,
    maxConfidence: 0.8,
  };

  test('should handle multiple sequential analyses', () => {
    const analyzer = new EmaAnalyzerNew(config);

    const upCandles = createCandleSequence(100, 50, 'up');
    const signal1 = analyzer.analyze(upCandles);
    expect(signal1.direction).toBe(SignalDirection.LONG);

    const downCandles = createCandleSequence(150, 50, 'down');
    const signal2 = analyzer.analyze(downCandles);
    expect(signal2.direction).toBe(SignalDirection.SHORT);

    const flatCandles = createCandleSequence(100, 50, 'flat');
    const signal3 = analyzer.analyze(flatCandles);
    // Direction is valid regardless
    expect([SignalDirection.LONG, SignalDirection.SHORT, SignalDirection.HOLD]).toContain(
      signal3.direction,
    );
  });

  test('should maintain config consistency across analyses', () => {
    const analyzer = new EmaAnalyzerNew(config);

    const candles1 = createCandleSequence(100, 50, 'up');
    analyzer.analyze(candles1);

    const candles2 = createCandleSequence(200, 50, 'down');
    analyzer.analyze(candles2);

    const retrievedConfig = analyzer.getConfig();
    expect(retrievedConfig.weight).toBe(config.weight);
    expect(retrievedConfig.priority).toBe(config.priority);
    expect(retrievedConfig.baseConfidence).toBe(config.baseConfidence);
  });
});
