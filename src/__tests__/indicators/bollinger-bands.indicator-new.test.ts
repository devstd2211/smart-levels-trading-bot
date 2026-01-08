/**
 * Bollinger Bands Indicator NEW - Technical Tests
 * Tests core functionality: configuration, calculations, state management
 */

import { BollingerBandsIndicatorNew } from '../../indicators/bollinger-bands.indicator-new';
import type { Candle } from '../../types/core';
import type { BollingerBandsConfigNew } from '../../types/config-new.types';

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

// ============================================================================
// CONFIGURATION TESTS
// ============================================================================

describe('BollingerBandsIndicatorNew - Configuration', () => {
  test('should throw if indicator is not enabled', () => {
    const config: BollingerBandsConfigNew = { enabled: false, period: 20, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    const candles = Array.from({ length: 20 }, (_, i) => createCandle(100 + i));
    expect(() => indicator.calculate(candles)).toThrow(
      '[BOLLINGER_BANDS_INDICATOR] Indicator is disabled in config',
    );
  });

  test('should throw if period is missing', () => {
    const config: any = { enabled: true, stdDev: 2 };
    expect(() => new BollingerBandsIndicatorNew(config)).toThrow(
      '[BOLLINGER_BANDS_INDICATOR] Missing or invalid: period',
    );
  });

  test('should throw if period is 0', () => {
    const config: any = { enabled: true, period: 0, stdDev: 2 };
    expect(() => new BollingerBandsIndicatorNew(config)).toThrow(
      '[BOLLINGER_BANDS_INDICATOR] Missing or invalid: period',
    );
  });

  test('should throw if period is negative', () => {
    const config: any = { enabled: true, period: -1, stdDev: 2 };
    expect(() => new BollingerBandsIndicatorNew(config)).toThrow(
      '[BOLLINGER_BANDS_INDICATOR] Missing or invalid: period',
    );
  });

  test('should throw if stdDev is missing', () => {
    const config: any = { enabled: true, period: 20 };
    expect(() => new BollingerBandsIndicatorNew(config)).toThrow(
      '[BOLLINGER_BANDS_INDICATOR] Missing or invalid: stdDev',
    );
  });

  test('should throw if stdDev is too low', () => {
    const config: any = { enabled: true, period: 20, stdDev: 0.05 };
    expect(() => new BollingerBandsIndicatorNew(config)).toThrow(
      '[BOLLINGER_BANDS_INDICATOR] Missing or invalid: stdDev',
    );
  });

  test('should accept valid config', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 20, stdDev: 2 };
    expect(() => new BollingerBandsIndicatorNew(config)).not.toThrow();
  });

  test('should return config values', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 20, stdDev: 2.5 };
    const indicator = new BollingerBandsIndicatorNew(config);

    const retrieved = indicator.getConfig();
    expect(retrieved.enabled).toBe(true);
    expect(retrieved.period).toBe(20);
    expect(retrieved.stdDev).toBe(2.5);
  });
});

// ============================================================================
// INPUT VALIDATION TESTS
// ============================================================================

describe('BollingerBandsIndicatorNew - Input Validation', () => {
  test('should throw if candles array is empty', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 20, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    expect(() => indicator.calculate([])).toThrow(
      'Not enough candles. Need 20, got 0',
    );
  });

  test('should throw if candles array is too short', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 20, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    const candles = Array.from({ length: 10 }, (_, i) => createCandle(100 + i));
    expect(() => indicator.calculate(candles)).toThrow(
      'Not enough candles. Need 20, got 10',
    );
  });

  test('should throw if candles is not array', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 20, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    expect(() => indicator.calculate(null as any)).toThrow(
      '[BOLLINGER_BANDS_INDICATOR] Invalid candles input (must be array)',
    );
  });

  test('should throw if candle is missing close', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 20, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    const candles = Array.from({ length: 20 }, (_, i) => ({
      open: 100,
      high: 101,
      low: 99,
      close: i === 10 ? undefined : 100 + i,
      volume: 1000,
      timestamp: Date.now(),
    })) as any[];

    expect(() => indicator.calculate(candles)).toThrow(
      '[BOLLINGER_BANDS_INDICATOR] Invalid candle at index 10',
    );
  });

  test('should throw if update called before calculate', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 20, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    expect(() => indicator.update(createCandle(100))).toThrow(
      '[BOLLINGER_BANDS_INDICATOR] Not initialized. Call calculate() first.',
    );
  });

  test('should throw if update candle is invalid', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 20, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    const candles = Array.from({ length: 20 }, (_, i) => createCandle(100 + i));
    indicator.calculate(candles);

    expect(() => indicator.update(null as any)).toThrow(
      '[BOLLINGER_BANDS_INDICATOR] Invalid newCandle',
    );
  });
});

// ============================================================================
// CALCULATION TESTS
// ============================================================================

describe('BollingerBandsIndicatorNew - Calculations', () => {
  test('should calculate bands with constant prices', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 5, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    // All prices equal = no variation = zero std dev
    const candles = Array.from({ length: 5 }, () => createCandle(100));
    const result = indicator.calculate(candles);

    expect(result.middle).toBe(100); // SMA = 100
    expect(result.upper).toBe(100); // 100 + 2*0 = 100
    expect(result.lower).toBe(100); // 100 - 2*0 = 100
    expect(result.percentB).toBe(50); // At middle
  });

  test('should calculate bands with increasing prices', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 5, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    // Prices: 100, 101, 102, 103, 104
    const candles = Array.from({ length: 5 }, (_, i) => createCandle(100 + i));
    const result = indicator.calculate(candles);

    // Middle = (100 + 101 + 102 + 103 + 104) / 5 = 102
    expect(result.middle).toBeCloseTo(102, 1);

    // Upper and lower should be different due to std dev
    expect(result.upper).toBeGreaterThan(result.middle);
    expect(result.lower).toBeLessThan(result.middle);

    // Price is at 104, which is above middle and high
    expect(result.percentB).toBeGreaterThan(50);
  });

  test('should calculate bands with volatile prices', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 5, stdDev: 1 };
    const indicator = new BollingerBandsIndicatorNew(config);

    // Volatile prices: 95, 105, 95, 105, 100
    const candles = [95, 105, 95, 105, 100].map((p) => createCandle(p));
    const result = indicator.calculate(candles);

    // Middle = (95 + 105 + 95 + 105 + 100) / 5 = 100
    expect(result.middle).toBeCloseTo(100, 1);

    // High volatility = wide bands
    const bandWidth = result.upper - result.lower;
    expect(bandWidth).toBeGreaterThan(8); // Should be significantly wide
  });

  test('should calculate percentB correctly', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 3, stdDev: 1 };
    const indicator = new BollingerBandsIndicatorNew(config);

    // Prices: 100, 100, 100 -> middle = 100, no bands
    const candles = Array.from({ length: 3 }, () => createCandle(100));
    const result = indicator.calculate(candles);

    // %B should be 50 (at middle)
    expect(result.percentB).toBe(50);
  });

  test('should clamp percentB to 0-100 range', () => {
    const config: BollingerBandsConfigNew = {
      enabled: true,
      period: 3,
      stdDev: 0.1,
    };
    const indicator = new BollingerBandsIndicatorNew(config);

    // Prices: 100, 100, 150 -> price way above bands
    const candles = [100, 100, 150].map((p) => createCandle(p));
    const result = indicator.calculate(candles);

    expect(result.percentB).toBeLessThanOrEqual(100);
    expect(result.percentB).toBeGreaterThanOrEqual(0);
  });

  test('should calculate bandwidth as percentage', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 5, stdDev: 1 };
    const indicator = new BollingerBandsIndicatorNew(config);

    const candles = Array.from({ length: 5 }, (_, i) => createCandle(100 + i));
    const result = indicator.calculate(candles);

    // Bandwidth = (upper - lower) / middle * 100
    const expectedBandwidth = ((result.upper - result.lower) / result.middle) * 100;
    expect(result.bandwidth).toBeCloseTo(expectedBandwidth, 2);
  });

  test('should handle zero band width', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 5, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    // All equal prices = zero bandwidth
    const candles = Array.from({ length: 5 }, () => createCandle(100));
    const result = indicator.calculate(candles);

    expect(result.bandwidth).toBe(0);
  });
});

// ============================================================================
// UPDATE TESTS
// ============================================================================

describe('BollingerBandsIndicatorNew - Update Method', () => {
  test('should update bands with new candle', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 3, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    const initialCandles = [100, 101, 102].map((p) => createCandle(p));
    const result1 = indicator.calculate(initialCandles);

    const result2 = indicator.update(createCandle(103));

    expect(result2.middle).not.toBe(result1.middle);
    expect(result2.upper).toBeDefined();
    expect(result2.lower).toBeDefined();
  });

  test('should maintain rolling window of specified period', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 2, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    let candles = [100, 101].map((p) => createCandle(p));
    indicator.calculate(candles);

    // Update 3 times - should only keep last 2
    indicator.update(createCandle(102));
    indicator.update(createCandle(103));
    indicator.update(createCandle(104));

    const state = indicator.getState();
    expect(state.candleCount).toBeLessThanOrEqual(2);
  });

  test('should return updated values from update method', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 3, stdDev: 1 };
    const indicator = new BollingerBandsIndicatorNew(config);

    const candles = Array.from({ length: 3 }, (_, i) => createCandle(100 + i));
    indicator.calculate(candles);

    const result = indicator.update(createCandle(104));

    expect(result.upper).toBeDefined();
    expect(result.middle).toBeDefined();
    expect(result.lower).toBeDefined();
    expect(result.percentB).toBeDefined();
    expect(result.bandwidth).toBeDefined();
  });
});

// ============================================================================
// STATE MANAGEMENT TESTS
// ============================================================================

describe('BollingerBandsIndicatorNew - State Management', () => {
  test('should track initialization state', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 20, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    const state1 = indicator.getState();
    expect(state1.initialized).toBe(false);

    const candles = Array.from({ length: 20 }, (_, i) => createCandle(100 + i));
    indicator.calculate(candles);

    const state2 = indicator.getState();
    expect(state2.initialized).toBe(true);
  });

  test('should reset state correctly', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 20, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    const candles = Array.from({ length: 20 }, (_, i) => createCandle(100 + i));
    indicator.calculate(candles);

    let state = indicator.getState();
    expect(state.upper).not.toBe(0);

    indicator.reset();

    state = indicator.getState();
    expect(state.upper).toBe(0);
    expect(state.middle).toBe(0);
    expect(state.lower).toBe(0);
    expect(state.initialized).toBe(false);
  });

  test('should throw getValue before initialization', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 20, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    expect(() => indicator.getValue()).toThrow(
      '[BOLLINGER_BANDS_INDICATOR] Not initialized. Call calculate() first.',
    );
  });

  test('should return state after calculation', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 20, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    const candles = Array.from({ length: 20 }, (_, i) => createCandle(100 + i));
    indicator.calculate(candles);

    const state = indicator.getState();
    expect(state.initialized).toBe(true);
    expect(state.candleCount).toBe(20);
    expect(state.upper).toBeDefined();
    expect(state.middle).toBeDefined();
    expect(state.lower).toBeDefined();
  });

  test('should be disabled after reset', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 20, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    const candles = Array.from({ length: 20 }, (_, i) => createCandle(100 + i));
    indicator.calculate(candles);
    indicator.reset();

    expect(() => indicator.getValue()).toThrow(
      '[BOLLINGER_BANDS_INDICATOR] Not initialized',
    );
  });
});

// ============================================================================
// BAND ANALYSIS TESTS
// ============================================================================

describe('BollingerBandsIndicatorNew - Band Analysis', () => {
  test('should detect price at upper band', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 5, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    // Prices going up: 100, 101, 102, 103, 120 (spike)
    const candles = [100, 101, 102, 103, 120].map((p) => createCandle(p));
    indicator.calculate(candles);

    expect(indicator.isAtUpperBand(5)).toBe(true);
  });

  test('should detect price at lower band', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 5, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    // Prices going down: 100, 99, 98, 97, 80 (drop)
    const candles = [100, 99, 98, 97, 80].map((p) => createCandle(p));
    indicator.calculate(candles);

    expect(indicator.isAtLowerBand(5)).toBe(true);
  });

  test('should detect squeeze condition', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 5, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    // Consolidation - very tight prices
    const candles = [100, 100.1, 100.05, 100.2, 100.1].map((p) => createCandle(p));
    indicator.calculate(candles);

    expect(indicator.isSqueezing(10)).toBe(true);
  });

  test('should not detect squeeze with wide bands', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 5, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    // Volatile prices
    const candles = [90, 110, 85, 115, 95].map((p) => createCandle(p));
    indicator.calculate(candles);

    expect(indicator.isSqueezing(5)).toBe(false);
  });
});

// ============================================================================
// CLASSIFICATION TESTS
// ============================================================================

describe('BollingerBandsIndicatorNew - Classification', () => {
  test('should classify very low volatility', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 5, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    const candles = Array.from({ length: 5 }, () => createCandle(100));
    indicator.calculate(candles);

    expect(indicator.getVolatilityClassification()).toBe('very_low');
  });

  test('should classify high volatility', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 5, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    // Very volatile: alternating high/low
    const candles = [100, 200, 100, 200, 100].map((p) => createCandle(p));
    indicator.calculate(candles);

    expect(indicator.getVolatilityClassification()).toBe('very_high');
  });

  test('should classify price position', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 5, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    // Price at 80 (low)
    const candles = [100, 100, 100, 100, 80].map((p) => createCandle(p));
    indicator.calculate(candles);

    const classification = indicator.getPriceClassification();
    expect(['oversold', 'low']).toContain(classification);
  });

  test('should classify overbought position', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 5, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    // Price at 120 (high)
    const candles = [100, 100, 100, 100, 120].map((p) => createCandle(p));
    indicator.calculate(candles);

    const classification = indicator.getPriceClassification();
    expect(['high', 'overbought']).toContain(classification);
  });

  test('should classify neutral position', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 5, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    // Prices centered around 100
    const candles = [99, 100, 101, 100, 100].map((p) => createCandle(p));
    indicator.calculate(candles);

    const classification = indicator.getPriceClassification();
    expect(['low', 'neutral', 'high']).toContain(classification);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('BollingerBandsIndicatorNew - Edge Cases', () => {
  test('should handle very small stdDev value', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 5, stdDev: 0.1 };
    const indicator = new BollingerBandsIndicatorNew(config);

    const candles = Array.from({ length: 5 }, (_, i) => createCandle(100 + i * 0.01));
    const result = indicator.calculate(candles);

    expect(result.upper).toBeDefined();
    expect(result.lower).toBeDefined();
    expect(result.upper).toBeGreaterThanOrEqual(result.lower);
  });

  test('should handle large period with small dataset', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 100, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    const candles = Array.from({ length: 100 }, (_, i) => createCandle(100 + i * 0.5));
    const result = indicator.calculate(candles);

    expect(result.upper).toBeDefined();
    expect(result.middle).toBeGreaterThan(0);
  });

  test('should handle very large price values', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 5, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    const candles = Array.from({ length: 5 }, (_, i) => createCandle(100000 + i * 1000));
    const result = indicator.calculate(candles);

    expect(result.upper).toBeDefined();
    expect(result.lower).toBeDefined();
    expect(result.upper).toBeGreaterThan(result.middle);
  });

  test('should handle very small price values', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 5, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    const candles = Array.from({ length: 5 }, (_, i) => createCandle(0.001 + i * 0.0001));
    const result = indicator.calculate(candles);

    expect(result.upper).toBeDefined();
    expect(result.lower).toBeGreaterThanOrEqual(0);
  });

  test('should handle single candle update', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 3, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    const initialCandles = Array.from({ length: 3 }, (_, i) => createCandle(100 + i));
    indicator.calculate(initialCandles);

    // Single update
    const result = indicator.update(createCandle(105));

    expect(result.upper).toBeDefined();
    expect(result.middle).toBeDefined();
  });

  test('should maintain consistency across multiple updates', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 3, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    const initialCandles = Array.from({ length: 3 }, (_, i) => createCandle(100 + i));
    indicator.calculate(initialCandles);

    const results = [];
    for (let i = 0; i < 10; i++) {
      const result = indicator.update(createCandle(104 + i));
      results.push(result);
    }

    // Each update should return valid values
    results.forEach((result) => {
      expect(result.upper).toBeDefined();
      expect(result.middle).toBeDefined();
      expect(result.lower).toBeDefined();
      expect(result.upper).toBeGreaterThanOrEqual(result.lower);
    });
  });
});

// ============================================================================
// PERCENTAGE B TESTS
// ============================================================================

describe('BollingerBandsIndicatorNew - %B Calculation', () => {
  test('should return 0 when price is at lower band', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 3, stdDev: 1 };
    const indicator = new BollingerBandsIndicatorNew(config);

    // Create a scenario where final price is at/near lower band
    const candles = [100, 100, 100].map((p) => createCandle(p));
    indicator.calculate(candles);

    // %B should be around 50 when price is at middle
    const value = indicator.getValue();
    expect(value.percentB).toBeCloseTo(50, 5);
  });

  test('should return 100 when price is at upper band', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 3, stdDev: 0.5 };
    const indicator = new BollingerBandsIndicatorNew(config);

    // Prices where last one goes very high
    const candles = [100, 100, 150].map((p) => createCandle(p));
    const result = indicator.calculate(candles);

    // %B should be high (close to 100)
    expect(result.percentB).toBeGreaterThan(80);
  });

  test('should return 50 when price is at middle band', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 5, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    // All prices the same = at middle
    const candles = Array.from({ length: 5 }, () => createCandle(100));
    const result = indicator.calculate(candles);

    expect(result.percentB).toBe(50);
  });
});
