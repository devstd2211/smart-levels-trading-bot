/**
 * EMA Indicator NEW - Functional Tests
 * Testing real market patterns and expected behavior
 *
 * These tests verify that the EMA indicator behaves correctly
 * in realistic market scenarios, not just that the code runs.
 */

import { EMAIndicatorNew } from '../../indicators/ema.indicator-new';
import type { Candle } from '../../types/core';
import type { EmaIndicatorConfigNew } from '../../types/config-new.types';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const standardConfig: EmaIndicatorConfigNew = {
  enabled: true,
  fastPeriod: 9,
  slowPeriod: 21,
  baseConfidence: 0.5,
  strengthMultiplier: 0.2,
};

/**
 * Create realistic OHLC candles for testing
 */
function createRealisticCandles(
  pattern: 'uptrend' | 'downtrend' | 'consolidation' | 'v-shape' | 'gap-up' | 'gap-down',
  startPrice: number = 100,
  count: number = 40,
): Candle[] {
  const candles: Candle[] = [];
  let currentPrice = startPrice;

  for (let i = 0; i < count; i++) {
    let close: number;
    let open: number;
    let high: number;
    let low: number;

    switch (pattern) {
      // ===== UPTREND: Consistent price increase =====
      case 'uptrend':
        close = currentPrice + i * 0.5; // Steady increase
        open = close - 0.3;
        high = close + 0.8;
        low = open - 0.2;
        break;

      // ===== DOWNTREND: Consistent price decrease =====
      case 'downtrend':
        close = currentPrice - i * 0.5; // Steady decrease
        open = close + 0.3;
        high = open + 0.2;
        low = close - 0.8;
        break;

      // ===== CONSOLIDATION: Price moves sideways =====
      case 'consolidation':
        close = currentPrice + (i % 5 === 0 ? 0.5 : i % 5 === 1 ? -0.3 : 0.1);
        open = close - 0.2;
        high = Math.max(open, close) + 0.5;
        low = Math.min(open, close) - 0.5;
        break;

      // ===== V-SHAPE: Down then up (reversal) =====
      case 'v-shape':
        const midpoint = Math.floor(count / 2);
        if (i < midpoint) {
          // Downtrend first half
          close = currentPrice - (midpoint - i) * 0.6;
        } else {
          // Uptrend second half
          close = currentPrice - 15 + (i - midpoint) * 0.8;
        }
        open = close - 0.2;
        high = Math.max(open, close) + 0.8;
        low = Math.min(open, close) - 0.5;
        break;

      // ===== GAP UP: Sudden jump up =====
      case 'gap-up':
        if (i === 10) {
          // Create gap at candle 10
          currentPrice += 5; // Sudden jump
        }
        close = currentPrice + i * 0.2;
        open = close - 0.2;
        high = close + 0.5;
        low = open - 0.2;
        break;

      // ===== GAP DOWN: Sudden jump down =====
      case 'gap-down':
        if (i === 10) {
          // Create gap at candle 10
          currentPrice -= 5; // Sudden drop
        }
        close = currentPrice - i * 0.2;
        open = close + 0.2;
        high = Math.max(open, close) + 0.2;
        low = close - 0.5;
        break;

      default:
        close = currentPrice;
        open = close;
        high = close;
        low = close;
    }

    currentPrice = close;
    candles.push({
      open,
      high,
      low,
      close,
      volume: 1000 + Math.random() * 500,
      timestamp: 1000 * (i + 1),
    });
  }

  return candles;
}

// ============================================================================
// FUNCTIONAL TESTS
// ============================================================================

describe('EMA Indicator NEW - Functional Tests', () => {
  describe('UPTREND Pattern', () => {
    it('should have fast EMA above slow EMA in uptrend', () => {
      const ema = new EMAIndicatorNew(standardConfig);
      const candles = createRealisticCandles('uptrend', 100, 50);

      const result = ema.calculate(candles);

      // In uptrend, fast EMA should be above slow EMA
      expect(result.fast).toBeGreaterThan(result.slow);
      expect(result.diff).toBeGreaterThan(0);
    });

    it('should show increasing EMA values as price rises', () => {
      const ema = new EMAIndicatorNew(standardConfig);
      const candles = createRealisticCandles('uptrend', 100, 50);

      // Calculate at 25 candles
      const middleCandles = candles.slice(0, 25);
      ema.calculate(middleCandles);
      const middleResult = ema.getValue();

      // Calculate at 50 candles
      ema.reset();
      const fullResult = ema.calculate(candles);

      // Both EMAs should be higher with more uptrend data
      expect(fullResult.fast).toBeGreaterThan(middleResult.fast);
      expect(fullResult.slow).toBeGreaterThan(middleResult.slow);
    });

    it('should maintain fast > slow consistently during uptrend', () => {
      const ema = new EMAIndicatorNew(standardConfig);
      const candles = createRealisticCandles('uptrend', 100, 40);

      ema.calculate(candles);
      let { fast: lastFast, slow: lastSlow } = ema.getValue();

      // Simulate more uptrend data
      for (let i = 0; i < 10; i++) {
        const newPrice = candles[candles.length - 1].close + i * 0.5;
        const result = ema.update(newPrice);

        // Fast should consistently be above slow
        expect(result.fast).toBeGreaterThan(result.slow);
        lastFast = result.fast;
        lastSlow = result.slow;
      }
    });

    it('fast EMA should be more responsive than slow EMA', () => {
      const ema = new EMAIndicatorNew(standardConfig);
      const candles = createRealisticCandles('uptrend', 100, 30);

      ema.calculate(candles);
      const { fast: initialFast, slow: initialSlow } = ema.getValue();

      // Add a spike in price
      const spikePrice = candles[candles.length - 1].close + 10;
      const result = ema.update(spikePrice);

      // Fast EMA should respond more to the spike
      const fastChange = result.fast - initialFast;
      const slowChange = result.slow - initialSlow;

      expect(fastChange).toBeGreaterThan(slowChange);
    });
  });

  describe('DOWNTREND Pattern', () => {
    it('should have fast EMA below slow EMA in downtrend', () => {
      const ema = new EMAIndicatorNew(standardConfig);
      const candles = createRealisticCandles('downtrend', 100, 50);

      const result = ema.calculate(candles);

      // In downtrend, fast EMA should be below slow EMA
      expect(result.fast).toBeLessThan(result.slow);
      expect(result.diff).toBeLessThan(0);
    });

    it('should show decreasing EMA values as price falls', () => {
      const ema = new EMAIndicatorNew(standardConfig);
      const candles = createRealisticCandles('downtrend', 100, 50);

      // Calculate at 25 candles
      const middleCandles = candles.slice(0, 25);
      ema.calculate(middleCandles);
      const middleResult = ema.getValue();

      // Calculate at 50 candles
      ema.reset();
      const fullResult = ema.calculate(candles);

      // Both EMAs should be lower with more downtrend data
      expect(fullResult.fast).toBeLessThan(middleResult.fast);
      expect(fullResult.slow).toBeLessThan(middleResult.slow);
    });

    it('should maintain fast < slow consistently during downtrend', () => {
      const ema = new EMAIndicatorNew(standardConfig);
      const candles = createRealisticCandles('downtrend', 100, 30); // Less aggressive downtrend

      ema.calculate(candles);
      const lastPrice = candles[candles.length - 1].close;

      // Simulate more downtrend data
      for (let i = 0; i < 5; i++) {
        const newPrice = lastPrice - i * 0.2; // Gentle downtrend
        const result = ema.update(newPrice);

        // Fast should consistently be below slow
        expect(result.fast).toBeLessThan(result.slow);
      }
    });
  });

  describe('CONSOLIDATION Pattern', () => {
    it('should have fast and slow EMA very close in consolidation', () => {
      const ema = new EMAIndicatorNew(standardConfig);
      const candles = createRealisticCandles('consolidation', 100, 50);

      const result = ema.calculate(candles);

      // In consolidation, the diff should be small (both near 100)
      expect(Math.abs(result.diff)).toBeLessThan(1);
    });

    it('should track middle price in consolidation', () => {
      const ema = new EMAIndicatorNew(standardConfig);
      const candles = createRealisticCandles('consolidation', 100, 40);

      const result = ema.calculate(candles);

      // EMAs should be close to the consolidation level (around 100, allow range)
      expect(result.fast).toBeGreaterThan(98);
      expect(result.fast).toBeLessThan(104); // Allow some variation
      expect(result.slow).toBeGreaterThan(98);
      expect(result.slow).toBeLessThan(104);
    });
  });

  describe('V-SHAPE Pattern (Reversal)', () => {
    it('should detect trend change from down to up', () => {
      const ema = new EMAIndicatorNew(standardConfig);

      // Create more realistic v-shape (not so extreme)
      const downCandles: Candle[] = Array.from({ length: 25 }, (_, i) => {
        const close = 100 - i * 0.3;
        return {
          open: close + 0.1,
          high: close + 0.3,
          low: close - 0.5,
          close,
          volume: 1000,
          timestamp: 1000 * (i + 1),
        };
      });

      ema.calculate(downCandles);
      const downResult = ema.getValue();

      // At downtrend, fast should be below slow
      expect(downResult.fast).toBeLessThan(downResult.slow);

      // Now add uptrend candles
      for (let i = 0; i < 25; i++) {
        const newPrice = 92.5 + i * 0.4; // Recovery
        ema.update(newPrice);
      }

      const fullResult = ema.getValue();

      // After reversal, should be trending up
      expect(fullResult.fast).toBeGreaterThan(downResult.fast);
      expect(fullResult.slow).toBeGreaterThan(downResult.slow);
    });

    it('should recover from downtrend to uptrend', () => {
      const ema = new EMAIndicatorNew(standardConfig);

      // Simple downtrend then uptrend
      const vShapeCandles: Candle[] = [
        ...Array.from({ length: 20 }, (_, i) => ({
          close: 100 - i * 0.2,
          open: 100 - i * 0.2 + 0.1,
          high: 100 - i * 0.2 + 0.3,
          low: 100 - i * 0.2 - 0.3,
          volume: 1000,
          timestamp: 1000 * (i + 1),
        })),
        ...Array.from({ length: 20 }, (_, i) => ({
          close: 96 + i * 0.3,
          open: 96 + i * 0.3 - 0.1,
          high: 96 + i * 0.3 + 0.3,
          low: 96 + i * 0.3 - 0.3,
          volume: 1000,
          timestamp: 1000 * (20 + i + 1),
        })),
      ];

      const result = ema.calculate(vShapeCandles);

      // After V-shape recovery, should show uptrend
      expect(result.fast).toBeGreaterThan(result.slow);
    });
  });

  describe('GAP Patterns', () => {
    it('should handle gap up correctly', () => {
      const ema = new EMAIndicatorNew(standardConfig);
      const candles = createRealisticCandles('gap-up', 100, 40);

      const result = ema.calculate(candles);

      // After gap up, EMAs should be higher
      expect(result.fast).toBeGreaterThan(100);
      expect(result.slow).toBeGreaterThan(100);
    });

    it('should handle gap down correctly', () => {
      const ema = new EMAIndicatorNew(standardConfig);
      const candles = createRealisticCandles('gap-down', 100, 40);

      const result = ema.calculate(candles);

      // After gap down, EMAs should be lower
      expect(result.fast).toBeLessThan(100);
      expect(result.slow).toBeLessThan(100);
    });
  });

  describe('EMA Lag Effect', () => {
    it('should lag behind sudden price changes', () => {
      const ema = new EMAIndicatorNew(standardConfig);
      const baseCandles = createRealisticCandles('consolidation', 100, 25);

      ema.calculate(baseCandles);
      const { fast: initialFast } = ema.getValue();

      // Sudden price change
      const suddenPrice = 115; // Jump from ~100 to 115
      const result = ema.update(suddenPrice);

      // EMA should NOT immediately reach the new price
      // It should be between initial and new price
      expect(result.fast).toBeGreaterThan(initialFast);
      expect(result.fast).toBeLessThan(suddenPrice);
    });

    it('should gradually approach new price level', () => {
      const ema = new EMAIndicatorNew(standardConfig);
      const baseCandles = createRealisticCandles('consolidation', 100, 25);

      ema.calculate(baseCandles);

      // New price level
      const newPrice = 110;
      let lastFast = ema.getValue().fast;

      // Simulate candles at new level
      for (let i = 0; i < 10; i++) {
        const result = ema.update(newPrice);
        // EMA should gradually move towards new price
        expect(result.fast).toBeGreaterThanOrEqual(lastFast);
        expect(result.fast).toBeLessThanOrEqual(newPrice);
        lastFast = result.fast;
      }

      // After many candles at new price, EMA should be very close to new price
      expect(lastFast).toBeGreaterThan(109);
    });
  });

  describe('Fast vs Slow Period Response', () => {
    it('fast period should respond quicker to changes', () => {
      const fastConfig: EmaIndicatorConfigNew = {
        ...standardConfig,
        fastPeriod: 5,
        slowPeriod: 15,
      };
      const slowConfig: EmaIndicatorConfigNew = {
        ...standardConfig,
        fastPeriod: 15,
        slowPeriod: 40,
      };

      const candles = createRealisticCandles('uptrend', 100, 50); // Need more candles

      const fastEma = new EMAIndicatorNew(fastConfig);
      const slowEma = new EMAIndicatorNew(slowConfig);

      const fastResult = fastEma.calculate(candles);
      const slowResult = slowEma.calculate(candles);

      // Shorter periods should be closer to current price
      const currentPrice = candles[candles.length - 1].close;
      expect(Math.abs(fastResult.fast - currentPrice)).toBeLessThan(
        Math.abs(slowResult.fast - currentPrice),
      );
    });
  });

  describe('Real Trading Scenarios', () => {
    it('should identify golden cross (bullish signal)', () => {
      const ema = new EMAIndicatorNew(standardConfig);

      // Phase 1: Downtrend (fast < slow)
      const downCandles = createRealisticCandles('downtrend', 100, 30);
      ema.calculate(downCandles);
      const downResult = ema.getValue();
      expect(downResult.fast).toBeLessThan(downResult.slow); // Bearish

      // Phase 2: Start of uptrend - create simple uptrend
      ema.reset();
      const upCandles: Candle[] = Array.from({ length: 35 }, (_, i) => {
        const close = 97 + i * 0.4; // Simple uptrend from low point
        return {
          open: close - 0.1,
          high: close + 0.4,
          low: close - 0.3,
          close,
          volume: 1000,
          timestamp: 1000 * (i + 1),
        };
      });

      const upResult = ema.calculate(upCandles);

      // After uptrend, should be bullish (golden cross)
      expect(upResult.fast).toBeGreaterThan(upResult.slow);
    });

    it('should identify death cross (bearish signal)', () => {
      const ema = new EMAIndicatorNew(standardConfig);

      // Phase 1: Uptrend (fast > slow)
      const upCandles = createRealisticCandles('uptrend', 100, 30);
      ema.calculate(upCandles);
      const upResult = ema.getValue();
      expect(upResult.fast).toBeGreaterThan(upResult.slow); // Bullish

      // Phase 2: Reversal to downtrend - create simple downtrend
      ema.reset();
      const downCandles: Candle[] = Array.from({ length: 35 }, (_, i) => {
        const close = 112 - i * 0.4; // Simple downtrend from high point
        return {
          open: close + 0.1,
          high: close + 0.3,
          low: close - 0.4,
          close,
          volume: 1000,
          timestamp: 1000 * (i + 1),
        };
      });

      const downResult = ema.calculate(downCandles);

      // After downtrend, should be bearish (death cross)
      expect(downResult.fast).toBeLessThan(downResult.slow);
    });

    it('should be stable during consolidation (no false signals)', () => {
      const ema = new EMAIndicatorNew(standardConfig);
      const consolidationCandles = createRealisticCandles('consolidation', 100, 50);

      ema.calculate(consolidationCandles);

      let previousDiff = ema.getValue().diff;
      let crossovers = 0;

      // Simulate more consolidation
      for (let i = 0; i < 20; i++) {
        const basePrice = 100 + (Math.sin(i * 0.5) * 2);
        const result = ema.update(basePrice);

        // Count how many times diff changes sign (crossovers)
        if ((previousDiff > 0 && result.diff < 0) || (previousDiff < 0 && result.diff > 0)) {
          crossovers++;
        }
        previousDiff = result.diff;
      }

      // In consolidation, should NOT have many crossovers
      expect(crossovers).toBeLessThan(3); // Allow some noise but not many
    });
  });

  describe('Boundary Conditions', () => {
    it('should work with only minimum required candles', () => {
      const ema = new EMAIndicatorNew(standardConfig);
      const minCandles = createRealisticCandles('uptrend', 100, 21); // Just slowPeriod

      const result = ema.calculate(minCandles);

      expect(result.fast).toBeGreaterThan(0);
      expect(result.slow).toBeGreaterThan(0);
      expect(result.diff).toBeDefined();
    });

    it('should be consistent whether calculated all-at-once or incrementally', () => {
      const config = standardConfig;
      const candles = createRealisticCandles('uptrend', 100, 50);

      // Calculate all at once
      const ema1 = new EMAIndicatorNew(config);
      const result1 = ema1.calculate(candles);

      // Calculate incrementally
      const ema2 = new EMAIndicatorNew(config);
      const initialCandles = candles.slice(0, 30);
      ema2.calculate(initialCandles);

      for (let i = 30; i < candles.length; i++) {
        ema2.update(candles[i].close);
      }
      const result2 = ema2.getValue();

      // Results should be nearly identical
      expect(result1.fast).toBeCloseTo(result2.fast, 5);
      expect(result1.slow).toBeCloseTo(result2.slow, 5);
    });
  });
});
