/**
 * Bollinger Bands Indicator NEW - Functional Tests
 * Tests real market patterns: uptrend, downtrend, breakouts, squeezes, reversals
 */

import { BollingerBandsIndicatorNew } from '../../indicators/bollinger-bands.indicator-new';
import type { Candle } from '../../types/core';
import type { BollingerBandsConfigNew } from '../../types/config-new.types';

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

describe('BollingerBandsIndicatorNew - Functional: Market Patterns', () => {
  describe('Uptrend', () => {
    test('should expand bands during strong uptrend', () => {
      const config: BollingerBandsConfigNew = { enabled: true, period: 14, stdDev: 2 };
      const indicator = new BollingerBandsIndicatorNew(config);

      // Strong uptrend: steadily increasing prices with widening range
      const candles = [];
      for (let i = 0; i < 14; i++) {
        candles.push(
          createCandle(
            100 + i * 2 + 1, // High
            90 + i * 1.5, // Low
            95 + i * 2, // Close
          ),
        );
      }

      const result = indicator.calculate(candles);
      // In uptrend with expansion, bandwidth should be significant
      expect(result.bandwidth).toBeGreaterThan(3);

      // Price should be in upper half (high %B)
      expect(result.percentB).toBeGreaterThan(50);
    });

    test('should show price touching or near upper band in uptrend', () => {
      const config: BollingerBandsConfigNew = { enabled: true, period: 14, stdDev: 2 };
      const indicator = new BollingerBandsIndicatorNew(config);

      // Strong uptrend with closes at highs
      const candles = [];
      for (let i = 0; i < 14; i++) {
        const high = 100 + i * 2;
        candles.push(
          createCandle(
            high, // Close at high
            90 + i * 1.5,
            high,
          ),
        );
      }

      const result = indicator.calculate(candles);
      // Price near upper band
      expect(result.percentB).toBeGreaterThan(70);
      expect(['high', 'overbought']).toContain(indicator.getPriceClassification());
    });
  });

  describe('Downtrend', () => {
    test('should expand bands during strong downtrend', () => {
      const config: BollingerBandsConfigNew = { enabled: true, period: 14, stdDev: 2 };
      const indicator = new BollingerBandsIndicatorNew(config);

      // Strong downtrend: steadily decreasing prices with widening range
      const candles = [];
      for (let i = 0; i < 14; i++) {
        candles.push(
          createCandle(
            115 - i * 2, // High
            95 - i * 1.5, // Low (closes at low)
            110 - i * 2,
          ),
        );
      }

      const result = indicator.calculate(candles);
      // In downtrend with expansion, bandwidth should be significant
      expect(result.bandwidth).toBeGreaterThan(3);

      // Price should be in lower half (low %B)
      expect(result.percentB).toBeLessThan(50);
    });

    test('should show price touching or near lower band in downtrend', () => {
      const config: BollingerBandsConfigNew = { enabled: true, period: 14, stdDev: 2 };
      const indicator = new BollingerBandsIndicatorNew(config);

      // Strong downtrend with closes at lows
      const candles = [];
      for (let i = 0; i < 14; i++) {
        const low = 95 - i * 1.5;
        candles.push(
          createCandle(
            110 - i * 2, // High
            low, // Close at low
            low,
          ),
        );
      }

      const result = indicator.calculate(candles);
      // Price near lower band
      expect(result.percentB).toBeLessThan(30);
      expect(['oversold', 'low']).toContain(indicator.getPriceClassification());
    });
  });

  describe('Bollinger Squeeze', () => {
    test('should detect squeeze during consolidation', () => {
      const config: BollingerBandsConfigNew = { enabled: true, period: 14, stdDev: 2 };
      const indicator = new BollingerBandsIndicatorNew(config);

      // Tight consolidation: minimal price movement
      const candles = [];
      for (let i = 0; i < 14; i++) {
        const offset = i % 2 ? 0.1 : -0.1;
        candles.push(
          createCandle(
            100.2 + offset, // Very tight high
            99.8 + offset, // Very tight low
            100 + offset,
          ),
        );
      }

      const result = indicator.calculate(candles);
      // Squeeze = very low bandwidth
      expect(indicator.isSqueezing(5)).toBe(true);
      expect(result.bandwidth).toBeLessThan(5);
    });

    test('should detect breakout after squeeze', () => {
      const config: BollingerBandsConfigNew = { enabled: true, period: 14, stdDev: 2 };
      const indicator = new BollingerBandsIndicatorNew(config);

      // Consolidation followed by breakout
      const candles = [];

      // First part: tight consolidation
      for (let i = 0; i < 7; i++) {
        candles.push(
          createCandle(100.2, 99.8, 100),
        );
      }

      // Second part: explosive breakout
      for (let i = 0; i < 7; i++) {
        candles.push(
          createCandle(100 + i * 2.5, 99 + i * 2, 100 + i * 2.5),
        );
      }

      const result = indicator.calculate(candles);
      // After breakout, bands should expand and price should be high
      expect(result.bandwidth).toBeGreaterThan(8);
      expect(result.percentB).toBeGreaterThan(60);
    });
  });

  describe('V-Shape Reversal', () => {
    test('should detect expansion during reversal from bottom', () => {
      const config: BollingerBandsConfigNew = { enabled: true, period: 14, stdDev: 2 };
      const indicator = new BollingerBandsIndicatorNew(config);

      // V-shape reversal: down to bottom, then recovery
      const candles = [];

      // First part: downtrend to bottom
      for (let i = 0; i < 7; i++) {
        candles.push(
          createCandle(110 - i * 2, 90, 105 - i * 2),
        );
      }

      // Second part: recovery uptrend
      for (let i = 0; i < 7; i++) {
        candles.push(
          createCandle(100 + i * 2, 90 + i * 1, 95 + i * 2),
        );
      }

      const result = indicator.calculate(candles);
      // During recovery, bands should expand
      expect(result.bandwidth).toBeGreaterThan(3);

      // Price moving up should show rising %B
      expect(result.percentB).toBeGreaterThan(50);
    });
  });

  describe('Inverse Head and Shoulders', () => {
    test('should show band expansion on reversal pattern', () => {
      const config: BollingerBandsConfigNew = { enabled: true, period: 14, stdDev: 2 };
      const indicator = new BollingerBandsIndicatorNew(config);

      // Inverse H&S pattern
      const candles = [];

      // Left shoulder (down)
      for (let i = 0; i < 5; i++) {
        candles.push(
          createCandle(110 - i, 90, 100 - i),
        );
      }

      // Head (lower low)
      for (let i = 0; i < 5; i++) {
        candles.push(
          createCandle(107 - i, 85, 97 - i),
        );
      }

      // Right shoulder (recovery)
      for (let i = 0; i < 4; i++) {
        candles.push(
          createCandle(85 + i * 2, 85, 88 + i * 2),
        );
      }

      const result = indicator.calculate(candles);
      // At end of pattern, price should be rising and bands expanding
      expect(result.bandwidth).toBeGreaterThan(2);
      expect(result.percentB).toBeGreaterThan(40);
    });
  });

  describe('Double Top Reversal', () => {
    test('should detect bands tightening then breaking at top', () => {
      const config: BollingerBandsConfigNew = { enabled: true, period: 14, stdDev: 2 };
      const indicator = new BollingerBandsIndicatorNew(config);

      // Double top pattern
      const candles = [];

      // First top
      for (let i = 0; i < 3; i++) {
        candles.push(
          createCandle(110 + i * 0.5, 100, 108 + i * 0.5),
        );
      }

      // Pull back
      for (let i = 0; i < 3; i++) {
        candles.push(
          createCandle(110 - i, 100, 105 - i),
        );
      }

      // Second top attempt
      for (let i = 0; i < 3; i++) {
        candles.push(
          createCandle(110 + i * 0.5, 100, 108 + i * 0.5),
        );
      }

      // Breakdown
      for (let i = 0; i < 5; i++) {
        candles.push(
          createCandle(108 - i * 1.5, 95 - i * 1.5, 102 - i * 1.5),
        );
      }

      const result = indicator.calculate(candles);
      // After breakdown, should be in lower half
      expect(result.percentB).toBeLessThan(50);
    });
  });

  describe('Range Trading', () => {
    test('should oscillate between bands in range-bound market', () => {
      const config: BollingerBandsConfigNew = { enabled: true, period: 14, stdDev: 2 };
      const indicator = new BollingerBandsIndicatorNew(config);

      // Range-bound oscillation
      const candles = [];
      let goingUp = true;

      for (let i = 0; i < 14; i++) {
        if (goingUp) {
          candles.push(
            createCandle(105 + (i % 3), 95, 100 + (i % 3)),
          );
          if (i % 3 === 2) goingUp = false;
        } else {
          candles.push(
            createCandle(105 - (i % 3), 95, 100 - (i % 3)),
          );
          if (i % 3 === 2) goingUp = true;
        }
      }

      indicator.calculate(candles);
      // In range, should have normal volatility classification
      const volClass = indicator.getVolatilityClassification();
      expect(['low', 'normal', 'high']).toContain(volClass);
    });
  });

  describe('Gap Up / Gap Down', () => {
    test('should respond to gap up with upper band at high', () => {
      const config: BollingerBandsConfigNew = { enabled: true, period: 14, stdDev: 2 };
      const indicator = new BollingerBandsIndicatorNew(config);

      // Pre-gap consolidation followed by gap up
      const candles = [];
      for (let i = 0; i < 10; i++) {
        candles.push(
          createCandle(100 + i * 0.5, 90, 95 + i * 0.5),
        );
      }

      // Gap up
      candles.push(createCandle(115, 105, 112));
      candles.push(createCandle(116, 106, 113));
      candles.push(createCandle(117, 107, 114));
      candles.push(createCandle(118, 108, 115));

      const result = indicator.calculate(candles);
      // After gap, price near upper band, high %B
      expect(result.percentB).toBeGreaterThan(60);
      expect(['high', 'overbought']).toContain(indicator.getPriceClassification());
    });

    test('should respond to gap down with lower band at low', () => {
      const config: BollingerBandsConfigNew = { enabled: true, period: 14, stdDev: 2 };
      const indicator = new BollingerBandsIndicatorNew(config);

      // Pre-gap consolidation followed by gap down
      const candles = [];
      for (let i = 0; i < 10; i++) {
        candles.push(
          createCandle(110 - i * 0.5, 100, 105 - i * 0.5),
        );
      }

      // Gap down
      candles.push(createCandle(85, 75, 78));
      candles.push(createCandle(84, 74, 77));
      candles.push(createCandle(83, 73, 76));
      candles.push(createCandle(82, 72, 75));

      const result = indicator.calculate(candles);
      // After gap, price near lower band, low %B
      expect(result.percentB).toBeLessThan(40);
      expect(['low', 'oversold']).toContain(indicator.getPriceClassification());
    });
  });

  describe('Mean Reversion', () => {
    test('should detect mean reversion from upper band', () => {
      const config: BollingerBandsConfigNew = { enabled: true, period: 14, stdDev: 2 };
      const indicator = new BollingerBandsIndicatorNew(config);

      // Price touching upper band then reverting
      const candles = [];

      // Setup: normal prices
      for (let i = 0; i < 5; i++) {
        candles.push(
          createCandle(102, 98, 100),
        );
      }

      // Spike to upper band
      candles.push(createCandle(110, 100, 109));
      candles.push(createCandle(111, 101, 110));

      // Mean reversion back
      for (let i = 0; i < 7; i++) {
        candles.push(
          createCandle(108 - i * 1.5, 95 - i * 1.5, 102 - i * 1.5),
        );
      }

      const result = indicator.calculate(candles);
      // After reversion, should be back to middle/lower
      expect(result.percentB).toBeLessThan(70);
    });

    test('should detect mean reversion from lower band', () => {
      const config: BollingerBandsConfigNew = { enabled: true, period: 14, stdDev: 2 };
      const indicator = new BollingerBandsIndicatorNew(config);

      // Price touching lower band then reverting
      const candles = [];

      // Setup: normal prices
      for (let i = 0; i < 5; i++) {
        candles.push(
          createCandle(102, 98, 100),
        );
      }

      // Drop to lower band
      candles.push(createCandle(95, 85, 86));
      candles.push(createCandle(94, 84, 85));

      // Mean reversion back up
      for (let i = 0; i < 7; i++) {
        candles.push(
          createCandle(90 + i * 1.5, 80 + i * 1.5, 88 + i * 1.5),
        );
      }

      const result = indicator.calculate(candles);
      // After reversion, should be back to middle/upper
      expect(result.percentB).toBeGreaterThan(30);
    });
  });
});

// ============================================================================
// STATE TRANSITIONS
// ============================================================================

describe('BollingerBandsIndicatorNew - Functional: State Transitions', () => {
  test('should track volatility expansion and contraction', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 5, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    // Start with low volatility
    const lowVolCandles = [100, 100.05, 99.95, 100.1, 100].map((p) =>
      createCandle(p * 1.01, p * 0.99, p),
    );

    const result1 = indicator.calculate(lowVolCandles);
    expect(result1.bandwidth).toBeLessThan(2);

    // Transition to high volatility
    const highVolCandles = [100, 110, 90, 110, 95].map((p) =>
      createCandle(p * 1.05, p * 0.95, p),
    );

    const result2 = indicator.calculate(highVolCandles);
    expect(result2.bandwidth).toBeGreaterThan(5);
  });

  test('should maintain consistency through incremental updates', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 3, stdDev: 2 };
    const indicator = new BollingerBandsIndicatorNew(config);

    // Initial candles
    const initialCandles = [100, 101, 102].map((p) =>
      createCandle(p * 1.01, p * 0.99, p),
    );

    const result1 = indicator.calculate(initialCandles);
    const bandwidth1 = result1.bandwidth;

    // Update with similar candle
    const result2 = indicator.update(createCandle(103 * 1.01, 103 * 0.99, 103));

    // Bandwidth should still be in reasonable range
    expect(result2.bandwidth).toBeGreaterThan(0);
    expect(result2.bandwidth).toBeLessThan(50); // Sanity check
  });

  test('should classify price position through updates', () => {
    const config: BollingerBandsConfigNew = { enabled: true, period: 3, stdDev: 1 };
    const indicator = new BollingerBandsIndicatorNew(config);

    // Initial calculation
    const initialCandles = [100, 100, 100].map((p) =>
      createCandle(p * 1.01, p * 0.99, p),
    );

    indicator.calculate(initialCandles);

    // Update to high price
    indicator.update(createCandle(110 * 1.01, 110 * 0.99, 110));
    const highClass = indicator.getPriceClassification();
    expect(['high', 'overbought']).toContain(highClass);

    // Update to low price
    indicator.reset();
    indicator.calculate(initialCandles);
    indicator.update(createCandle(90 * 1.01, 90 * 0.99, 90));
    const lowClass = indicator.getPriceClassification();
    expect(['low', 'oversold']).toContain(lowClass);
  });
});
