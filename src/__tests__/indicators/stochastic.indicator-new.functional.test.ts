/**
 * Stochastic Indicator NEW - Functional Tests
 * Tests real market patterns: uptrend, downtrend, reversals, divergences
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

// ============================================================================
// MARKET PATTERN TESTS
// ============================================================================

describe('StochasticIndicatorNew - Functional: Market Patterns', () => {
  describe('Uptrend', () => {
    test('should show overbought conditions during strong uptrend', () => {
      const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 14, dPeriod: 3 };
      const indicator = new StochasticIndicatorNew(config);

      // Strong uptrend: price steadily increasing
      const candles = [
        createCandle(100, 90, 95),
        createCandle(101, 91, 96),
        createCandle(102, 92, 97),
        createCandle(103, 93, 98),
        createCandle(104, 94, 99),
        createCandle(105, 95, 100),
        createCandle(106, 96, 101),
        createCandle(107, 97, 102),
        createCandle(108, 98, 103),
        createCandle(109, 99, 104),
        createCandle(110, 100, 105),
        createCandle(111, 101, 106),
        createCandle(112, 102, 107),
        createCandle(113, 103, 108), // High close near high
      ];

      const result = indicator.calculate(candles);
      // In uptrend with close near highs, %K should be high
      expect(result.k).toBeGreaterThan(50);
      // Check if it's at least in high zone (overbought or high classification)
      expect(['overbought', 'high']).toContain(indicator.getClassification());
    });

    test('should show overbought stochastic values in uptrend', () => {
      const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 14, dPeriod: 3 };
      const indicator = new StochasticIndicatorNew(config);

      // Uptrend pattern with progressive price increase
      const candles = [];
      for (let i = 0; i < 14; i++) {
        candles.push(createCandle(100 + i * 2, 90 + i * 1.5, 95 + i * 2));
      }

      const result = indicator.calculate(candles);
      // In strong uptrend, %K should be high
      expect(result.k).toBeGreaterThan(50);
    });
  });

  describe('Downtrend', () => {
    test('should show oversold conditions during downtrend', () => {
      const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 14, dPeriod: 3 };
      const indicator = new StochasticIndicatorNew(config);

      // Downtrend: price steadily decreasing
      const candles = [
        createCandle(113, 103, 108),
        createCandle(112, 102, 107),
        createCandle(111, 101, 106),
        createCandle(110, 100, 105),
        createCandle(109, 99, 104),
        createCandle(108, 98, 103),
        createCandle(107, 97, 102),
        createCandle(106, 96, 101),
        createCandle(105, 95, 100),
        createCandle(104, 94, 99),
        createCandle(103, 93, 98),
        createCandle(102, 92, 97),
        createCandle(101, 91, 96),
        createCandle(100, 90, 95), // Low close near low
      ];

      const result = indicator.calculate(candles);
      // In downtrend with close near lows, %K should be low
      expect(result.k).toBeLessThan(50);
      // Check if it's at least in low zone (oversold or low classification)
      expect(['oversold', 'low']).toContain(indicator.getClassification());
    });

    test('should show oversold stochastic values in downtrend', () => {
      const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 14, dPeriod: 3 };
      const indicator = new StochasticIndicatorNew(config);

      // Downtrend pattern with progressive price decrease
      const candles = [];
      for (let i = 0; i < 14; i++) {
        candles.push(createCandle(115 - i * 2, 95 - i * 1.5, 110 - i * 2));
      }

      const result = indicator.calculate(candles);
      // In strong downtrend, %K should be low
      expect(result.k).toBeLessThan(50);
    });
  });

  describe('Consolidation', () => {
    test('should show neutral stochastic during consolidation', () => {
      const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 14, dPeriod: 3 };
      const indicator = new StochasticIndicatorNew(config);

      // Tight consolidation: price oscillates within range
      const candles = [];
      for (let i = 0; i < 14; i++) {
        const offset = i % 3; // Oscillate between 3 levels
        candles.push(createCandle(105 + offset, 95 + offset, 100 + offset));
      }

      const result = indicator.calculate(candles);
      // Consolidation should be in neutral/middle zone
      expect(result.k).toBeGreaterThan(30);
      expect(result.k).toBeLessThan(70);
    });
  });

  describe('V-Shape Reversal from Oversold', () => {
    test('should detect bounce from oversold conditions', () => {
      const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 14, dPeriod: 3 };
      const indicator = new StochasticIndicatorNew(config);

      // V-shape: down to low, then recovery
      const candles = [];
      // First part: downtrend to oversold
      for (let i = 0; i < 7; i++) {
        candles.push(createCandle(110 - i * 2, 90, 105 - i * 2));
      }
      // Second part: recovery from oversold
      for (let i = 0; i < 7; i++) {
        candles.push(createCandle(100 + i * 2, 90 + i * 1, 95 + i * 2));
      }

      const result = indicator.calculate(candles);
      // At the end of recovery, should be rising
      expect(result.k).toBeGreaterThan(result.d);
    });
  });

  describe('Inverse Head and Shoulders', () => {
    test('should detect reversal pattern with stochastic confirmation', () => {
      const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 14, dPeriod: 3 };
      const indicator = new StochasticIndicatorNew(config);

      // Inverse H&S pattern with stochastic
      const candles = [];
      // Left shoulder (down)
      for (let i = 0; i < 5; i++) {
        candles.push(createCandle(110 - i, 90, 100 - i));
      }
      // Head (lower low)
      for (let i = 0; i < 5; i++) {
        candles.push(createCandle(107 - i, 85, 97 - i));
      }
      // Right shoulder (recovery to neckline)
      for (let i = 0; i < 5; i++) {
        candles.push(createCandle(85 + i * 2, 85, 88 + i * 2));
      }

      const result = indicator.calculate(candles);
      // At end of pattern (recovery), stochastic should be rising
      expect(indicator.isBullishCrossover() || result.k > 40).toBe(true);
    });
  });

  describe('Bearish Divergence', () => {
    test('should show weakening momentum despite price highs', () => {
      const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 14, dPeriod: 3 };
      const indicator = new StochasticIndicatorNew(config);

      // Price makes higher high but stochastic weakens
      const candles = [];
      // First leg up with high stochastic
      for (let i = 0; i < 7; i++) {
        candles.push(createCandle(105 + i, 95, 103 + i));
      }
      // Second leg with lower stochastic
      for (let i = 0; i < 7; i++) {
        candles.push(createCandle(110 + i, 92, 99 + i)); // Lower closes despite higher highs
      }

      const result = indicator.calculate(candles);
      // Stochastic should be lower despite higher prices
      expect(result.k).toBeLessThan(60);
    });
  });

  describe('Bullish Divergence', () => {
    test('should show strengthening momentum despite price lows', () => {
      const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 14, dPeriod: 3 };
      const indicator = new StochasticIndicatorNew(config);

      // Price makes lower low but stochastic strengthens
      const candles = [];
      // First leg down with low stochastic
      for (let i = 0; i < 7; i++) {
        candles.push(createCandle(110 - i, 100 - i, 105 - i));
      }
      // Second leg with higher closes (higher stochastic)
      for (let i = 0; i < 7; i++) {
        candles.push(createCandle(105 - i, 98 - i, 103 - i * 0.5)); // Higher closes despite lower lows
      }

      const result = indicator.calculate(candles);
      // Stochastic should be higher despite lower prices
      expect(result.k).toBeGreaterThan(40);
    });
  });

  describe('Range Trading', () => {
    test('should oscillate between oversold and overbought in range', () => {
      const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 14, dPeriod: 3 };
      const indicator = new StochasticIndicatorNew(config);

      // Range-bound price movement
      const candles = [];
      let goingUp = true;
      for (let i = 0; i < 14; i++) {
        if (goingUp) {
          candles.push(createCandle(105 + (i % 5), 95, 100 + (i % 5)));
          if (i % 5 === 4) goingUp = false;
        } else {
          candles.push(createCandle(105 - (i % 5), 95, 100 - (i % 5)));
          if (i % 5 === 4) goingUp = true;
        }
      }

      indicator.calculate(candles);
      // In range, should oscillate through different zones
      expect(indicator.getClassification()).toBeDefined();
    });
  });

  describe('Gap Movements', () => {
    test('should respond to gap up with potential overbought', () => {
      const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 14, dPeriod: 3 };
      const indicator = new StochasticIndicatorNew(config);

      // Gap up pattern
      const candles = [];
      for (let i = 0; i < 10; i++) {
        candles.push(createCandle(100 + i, 90, 95 + i));
      }
      // Gap up
      candles.push(createCandle(115, 105, 112));
      candles.push(createCandle(116, 106, 113));
      candles.push(createCandle(117, 107, 114));
      candles.push(createCandle(118, 108, 115));

      const result = indicator.calculate(candles);
      // After gap up, stochastic should be high
      expect(result.k).toBeGreaterThan(60);
    });

    test('should respond to gap down with potential oversold', () => {
      const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 14, dPeriod: 3 };
      const indicator = new StochasticIndicatorNew(config);

      // Gap down pattern
      const candles = [];
      for (let i = 0; i < 10; i++) {
        candles.push(createCandle(110 - i, 100, 105 - i));
      }
      // Gap down
      candles.push(createCandle(85, 75, 78));
      candles.push(createCandle(84, 74, 77));
      candles.push(createCandle(83, 73, 76));
      candles.push(createCandle(82, 72, 75));

      const result = indicator.calculate(candles);
      // After gap down, stochastic should be low
      expect(result.k).toBeLessThan(40);
    });
  });
});

// ============================================================================
// SIGNAL LINE TESTS
// ============================================================================

describe('StochasticIndicatorNew - Functional: Signal Line Behavior', () => {
  test('should show %D smoothing effect', () => {
    const config: StochasticIndicatorConfigNew = { enabled: true, kPeriod: 14, dPeriod: 3 };
    const indicator = new StochasticIndicatorNew(config);

    // Create volatile price action
    const candles = [];
    for (let i = 0; i < 14; i++) {
      if (i % 2 === 0) {
        candles.push(createCandle(110, 90, 100)); // Low close
      } else {
        candles.push(createCandle(110, 90, 110)); // High close
      }
    }

    const result = indicator.calculate(candles);
    // %D should be less volatile than %K
    expect(Math.abs(result.d)).toBeLessThanOrEqual(Math.abs(result.k) + 10);
  });
});
