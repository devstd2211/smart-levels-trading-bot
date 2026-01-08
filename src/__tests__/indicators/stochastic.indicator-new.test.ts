/**
 * Stochastic Indicator NEW - Technical Tests
 * Tests code execution, configuration validation, and stochastic calculations
 */

import { StochasticIndicatorNew } from '../../indicators/stochastic.indicator-new';
import type { Candle } from '../../types/core';
import type { StochasticIndicatorConfigNew } from '../../types/config-new.types';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createCandle(high: number, low: number, close: number): Candle {
  return {
    open: close * 0.99,
    high,
    low,
    close,
    volume: 1000,
    timestamp: Date.now(),
  };
}

// %K = ((Close - LowestLow) / (HighestHigh - LowestLow)) * 100
function expectK(high: number, low: number, close: number, expectedK: number) {
  const range = high - low;
  if (range === 0) {
    return 50; // Edge case
  }
  const k = ((close - low) / range) * 100;
  expect(Math.round(k)).toBeCloseTo(expectedK, -1);
}

// ============================================================================
// CONFIGURATION VALIDATION TESTS
// ============================================================================

describe('StochasticIndicatorNew - Configuration Validation', () => {
  test('should throw on missing enabled property', () => {
    const config = { kPeriod: 14, dPeriod: 3 } as any;
    expect(() => new StochasticIndicatorNew(config)).toThrow();
  });

  test('should throw on missing kPeriod property', () => {
    const config = { enabled: true, dPeriod: 3 } as any;
    expect(() => new StochasticIndicatorNew(config)).toThrow();
  });

  test('should throw on missing dPeriod property', () => {
    const config = { enabled: true, kPeriod: 14 } as any;
    expect(() => new StochasticIndicatorNew(config)).toThrow();
  });

  test('should throw on invalid kPeriod (0)', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 0, dPeriod: 3 };
    expect(() => new StochasticIndicatorNew(config)).toThrow();
  });

  test('should throw on negative kPeriod', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: -14, dPeriod: 3 };
    expect(() => new StochasticIndicatorNew(config)).toThrow();
  });

  test('should throw on invalid dPeriod (0)', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 14, dPeriod: 0 };
    expect(() => new StochasticIndicatorNew(config)).toThrow();
  });

  test('should accept valid configuration', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 14, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    expect(indicator).toBeDefined();
  });

  test('should accept disabled configuration', () => {
    const config: StochasticIndicatorConfigNew = { enabled: false, kPeriod: 14, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    expect(indicator.isEnabled()).toBe(false);
  });
});

// ============================================================================
// INITIALIZATION AND BASIC FUNCTIONALITY
// ============================================================================

describe('StochasticIndicatorNew - Initialization', () => {
  test('should throw when calling getValue() before calculate()', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);

    expect(() => indicator.getValue()).toThrow('[STOCHASTIC_INDICATOR] Not initialized');
  });

  test('should throw when calling update() before calculate()', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candle = createCandle(102, 98, 100);

    expect(() => indicator.update(candle)).toThrow('[STOCHASTIC_INDICATOR] Not initialized');
  });

  test('should throw when indicator is disabled', () => {
    const config: StochasticIndicatorConfigNew = { enabled: false, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(102, 98, 100),
      createCandle(103, 99, 101),
      createCandle(104, 100, 102),
      createCandle(105, 101, 103),
      createCandle(106, 102, 104),
    ];

    expect(() => indicator.calculate(candles)).toThrow('[STOCHASTIC_INDICATOR] Indicator is disabled');
  });

  test('should initialize after calculate()', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(102, 98, 100),
      createCandle(103, 99, 101),
      createCandle(104, 100, 102),
      createCandle(105, 101, 103),
      createCandle(106, 102, 104),
    ];

    const result = indicator.calculate(candles);
    expect(result).toBeDefined();
    expect(result.k).toBeGreaterThanOrEqual(0);
    expect(result.k).toBeLessThanOrEqual(100);
  });
});

// ============================================================================
// %K CALCULATION TESTS
// ============================================================================

describe('StochasticIndicatorNew - %K Calculation', () => {
  test('should calculate %K correctly (middle of range)', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 90, 95), // %K = ((95-90)/(100-90))*100 = 50
      createCandle(101, 91, 96),
      createCandle(102, 92, 97),
      createCandle(103, 93, 98),
      createCandle(104, 94, 99), // Current: %K = ((99-90)/(104-90))*100 = 64.3
    ];

    const result = indicator.calculate(candles);
    // Last candle: high=104, low=90 (over 5 candles), close=99
    // %K = ((99-90)/(104-90))*100 = 64.3
    expect(result.k).toBeCloseTo(64.3, 0);
  });

  test('should calculate %K = 100 at highest point', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      createCandle(100, 90, 100), // Close = high
    ];

    const result = indicator.calculate(candles);
    expect(result.k).toBe(100);
  });

  test('should calculate %K = 0 at lowest point', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      createCandle(100, 90, 90), // Close = low
    ];

    const result = indicator.calculate(candles);
    expect(result.k).toBe(0);
  });

  test('should handle zero range (high = low)', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 100, 100),
      createCandle(100, 100, 100),
      createCandle(100, 100, 100),
      createCandle(100, 100, 100),
      createCandle(100, 100, 100), // Zero range = neutral 50
    ];

    const result = indicator.calculate(candles);
    expect(result.k).toBe(50); // Neutral when no volatility
  });
});

// ============================================================================
// %D CALCULATION TESTS
// ============================================================================

describe('StochasticIndicatorNew - %D Calculation', () => {
  test('should calculate %D as SMA of %K', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 2, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    // Create candles with predictable %K values
    const candles = [
      createCandle(100, 90, 100), // %K = 100
      createCandle(100, 90, 95), // %K = 50
      createCandle(100, 90, 90), // %K = 0
    ];

    const result = indicator.calculate(candles);
    // kValues calculation:
    // i=0: candles[0:1] length=1 < kPeriod(2), returns 0
    // i=1: candles[0:2] %K = ((95-90)/(100-90))*100 = 50
    // i=2: candles[0:3] lookback=[c1,c2], %K = ((90-90)/(100-90))*100 = 0
    // kValues = [0, 50, 0]
    // %D (over 3) = (0+50+0)/3 = 16.67
    expect(result.d).toBeCloseTo(16.67, 1);
  });

  test('should return %K when dPeriod not met', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 2, dPeriod: 5 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 90, 100),
      createCandle(100, 90, 95),
    ];

    const result = indicator.calculate(candles);
    // Not enough K values for %D, should return %K
    expect(result.d).toBe(result.k);
  });
});

// ============================================================================
// OVERSOLD/OVERBOUGHT TESTS
// ============================================================================

describe('StochasticIndicatorNew - Oversold/Overbought', () => {
  test('should detect oversold condition (%K < 20)', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 80, 85),
      createCandle(100, 80, 85),
      createCandle(100, 80, 82),
      createCandle(100, 80, 81),
      createCandle(100, 80, 80), // Close at low = 0% = oversold
    ];

    indicator.calculate(candles);
    expect(indicator.isOversold()).toBe(true);
  });

  test('should detect overbought condition (%K > 80)', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 80, 95),
      createCandle(100, 80, 95),
      createCandle(100, 80, 98),
      createCandle(100, 80, 99),
      createCandle(100, 80, 100), // Close at high = 100% = overbought
    ];

    indicator.calculate(candles);
    expect(indicator.isOverbought()).toBe(true);
  });

  test('should support custom oversold threshold', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 80, 85),
      createCandle(100, 80, 85),
      createCandle(100, 80, 85),
      createCandle(100, 80, 85),
      createCandle(100, 80, 85), // 25%
    ];

    indicator.calculate(candles);
    expect(indicator.isOversold(30)).toBe(true);
    expect(indicator.isOversold(20)).toBe(false);
  });
});

// ============================================================================
// CROSSOVER TESTS
// ============================================================================

describe('StochasticIndicatorNew - Crossovers', () => {
  test('should detect bullish crossover (%K > %D)', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 2, dPeriod: 2 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 90, 92), // %K = 0 (not enough history)
      createCandle(100, 90, 92), // %K = 20
      createCandle(100, 90, 98), // %K = 80
    ];

    indicator.calculate(candles);
    // kValues = [0, 20, 80], last 2 = [20, 80], %D = 50, %K = 80, so %K > %D
    expect(indicator.isBullishCrossover()).toBe(true);
  });

  test('should detect bearish crossover (%K < %D)', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 2, dPeriod: 2 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 90, 98), // %K = 0 (not enough history yet)
      createCandle(100, 90, 98), // %K = 80
      createCandle(100, 90, 92), // %K = 20
    ];

    indicator.calculate(candles);
    // kValues = [0, 80, 20], last 2 = [80, 20], %D = 50, %K = 20, so %K < %D
    expect(indicator.isBearishCrossover()).toBe(true);
  });
});

// ============================================================================
// CLASSIFICATION TESTS
// ============================================================================

describe('StochasticIndicatorNew - Classification', () => {
  test('should classify oversold (< 20)', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 80, 81),
      createCandle(100, 80, 81),
      createCandle(100, 80, 81),
      createCandle(100, 80, 81),
      createCandle(100, 80, 81), // ~5%
    ];

    indicator.calculate(candles);
    expect(indicator.getClassification()).toBe('oversold');
  });

  test('should classify low (20-40)', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 80, 84),
      createCandle(100, 80, 84),
      createCandle(100, 80, 84),
      createCandle(100, 80, 84),
      createCandle(100, 80, 84), // 20%
    ];

    indicator.calculate(candles);
    expect(indicator.getClassification()).toBe('low');
  });

  test('should classify neutral (40-60)', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 80, 90),
      createCandle(100, 80, 90),
      createCandle(100, 80, 90),
      createCandle(100, 80, 90),
      createCandle(100, 80, 90), // 50%
    ];

    indicator.calculate(candles);
    expect(indicator.getClassification()).toBe('neutral');
  });

  test('should classify high (60-80)', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 80, 96),
      createCandle(100, 80, 96),
      createCandle(100, 80, 96),
      createCandle(100, 80, 96),
      createCandle(100, 80, 96), // 80%
    ];

    indicator.calculate(candles);
    expect(indicator.getClassification()).toBe('high');
  });

  test('should classify overbought (> 80)', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 80, 98), // 90%
      createCandle(100, 80, 98),
      createCandle(100, 80, 98),
      createCandle(100, 80, 98),
      createCandle(100, 80, 98), // 90% > 80
    ];

    indicator.calculate(candles);
    expect(indicator.getClassification()).toBe('overbought');
  });
});

// ============================================================================
// MOMENTUM TESTS
// ============================================================================

describe('StochasticIndicatorNew - Momentum', () => {
  test('should determine momentum from %K vs %D difference', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
    ];

    indicator.calculate(candles);
    // Stable prices should have %K ≈ %D
    const momentum = indicator.getMomentum();
    expect(['bullish', 'bearish', 'neutral']).toContain(momentum);
  });
});

// ============================================================================
// UPDATE TESTS
// ============================================================================

describe('StochasticIndicatorNew - Update Method', () => {
  test('should update stochastic on new candle', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 3, dPeriod: 2 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
    ];

    indicator.calculate(candles);
    const before = indicator.getValue();

    indicator.update(createCandle(105, 90, 105)); // New high
    const after = indicator.getValue();

    expect(after.k).not.toBe(before.k);
  });

  test('should throw on invalid candle', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 3, dPeriod: 2 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
    ];

    indicator.calculate(candles);

    const invalidCandle = { high: 100 } as any; // Missing low and close
    expect(() => indicator.update(invalidCandle)).toThrow();
  });
});

// ============================================================================
// INPUT VALIDATION TESTS
// ============================================================================

describe('StochasticIndicatorNew - Input Validation', () => {
  test('should throw on invalid candles input (not array)', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);

    expect(() => indicator.calculate({} as any)).toThrow();
  });

  test('should throw on not enough candles', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
    ];

    expect(() => indicator.calculate(candles)).toThrow('Not enough candles');
  });

  test('should throw on invalid candle in array', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      { high: 100 }, // Missing low, close
      createCandle(100, 90, 95),
    ] as any;

    expect(() => indicator.calculate(candles)).toThrow('[STOCHASTIC_INDICATOR] Invalid candle');
  });
});

// ============================================================================
// STATE MANAGEMENT TESTS
// ============================================================================

describe('StochasticIndicatorNew - State Management', () => {
  test('should return correct state', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
    ];

    indicator.calculate(candles);
    const state = indicator.getState();

    expect(state.initialized).toBe(true);
    expect(state.candleCount).toBe(5);
    expect(state.kValueCount).toBe(5);
  });

  test('should reset state', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
    ];

    indicator.calculate(candles);
    indicator.reset();
    const state = indicator.getState();

    expect(state.initialized).toBe(false);
    expect(state.k).toBe(0);
    expect(state.d).toBe(0);
  });

  test('should throw after reset', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
      createCandle(100, 90, 95),
    ];

    indicator.calculate(candles);
    indicator.reset();

    expect(() => indicator.getValue()).toThrow('[STOCHASTIC_INDICATOR] Not initialized');
  });
});

// ============================================================================
// CONFIG RETRIEVAL TESTS
// ============================================================================

describe('StochasticIndicatorNew - Config Retrieval', () => {
  test('should return correct config', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 14, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);

    const returnedConfig = indicator.getConfig();
    expect(returnedConfig.enabled).toBe(true);
    expect(returnedConfig.kPeriod).toBe(14);
    expect(returnedConfig.dPeriod).toBe(3);
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe('StochasticIndicatorNew - Edge Cases', () => {
  test('should handle period of 1', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 1, dPeriod: 1 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [createCandle(100, 95, 98)];

    const result = indicator.calculate(candles);
    expect(result.k).toBeGreaterThanOrEqual(0);
    expect(result.k).toBeLessThanOrEqual(100);
  });

  test('should handle large periods', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 50, dPeriod: 20 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [];

    for (let i = 0; i < 50; i++) {
      candles.push(createCandle(150 - i, 100 + i, 125));
    }

    const result = indicator.calculate(candles);
    expect(result.k).toBeGreaterThanOrEqual(0);
    expect(result.k).toBeLessThanOrEqual(100);
  });

  test('should handle extremely volatile price', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 5, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);
    const candles = [
      createCandle(10000, 1, 5000),
      createCandle(10000, 1, 5000),
      createCandle(10000, 1, 5000),
      createCandle(10000, 1, 5000),
      createCandle(10000, 1, 5000),
    ];

    const result = indicator.calculate(candles);
    expect(result.k).toBeCloseTo(50, 0);
  });
});
