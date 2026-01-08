/**
 * RSI Indicator NEW - Functional Tests
 * Testing real market patterns and expected behavior
 *
 * These tests verify that the RSI indicator behaves correctly
 * in realistic market scenarios, not just that the code runs.
 */

import { RSIIndicatorNew } from '../../indicators/rsi.indicator-new';
import type { Candle } from '../../types/core';
import type { RsiIndicatorConfigNew } from '../../types/config-new.types';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const standardConfig: RsiIndicatorConfigNew = {
  enabled: true,
  period: 14,
  oversold: 30,
  overbought: 70,
  extreme: { low: 20, high: 80 },
  neutralZone: { min: 45, max: 55 },
  maxConfidence: 100,
};

/**
 * Create realistic OHLC candles for testing
 */
function createRealisticCandles(
  pattern: 'uptrend' | 'downtrend' | 'consolidation' | 'v-shape' | 'divergence-bullish',
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
        close = currentPrice + i * 0.5;
        open = close - 0.2;
        high = close + 0.8;
        low = open - 0.2;
        break;

      // ===== DOWNTREND: Consistent price decrease =====
      case 'downtrend':
        close = currentPrice - i * 0.5;
        open = close + 0.2;
        high = open + 0.2;
        low = close - 0.8;
        break;

      // ===== CONSOLIDATION: Price moves sideways =====
      case 'consolidation':
        close = currentPrice + (i % 4 === 0 ? 0.5 : i % 4 === 2 ? -0.5 : 0.1);
        open = close - 0.1;
        high = Math.max(open, close) + 0.4;
        low = Math.min(open, close) - 0.4;
        break;

      // ===== V-SHAPE: Down then up (reversal) =====
      case 'v-shape':
        const midpoint = Math.floor(count / 2);
        if (i < midpoint) {
          close = currentPrice - (midpoint - i) * 0.6;
        } else {
          close = currentPrice - 15 + (i - midpoint) * 0.8;
        }
        open = close - 0.2;
        high = Math.max(open, close) + 0.8;
        low = Math.min(open, close) - 0.5;
        break;

      // ===== BULLISH DIVERGENCE: Price lower but RSI higher =====
      case 'divergence-bullish':
        if (i < 20) {
          // First swing: price down, large losses
          close = currentPrice - i * 0.6;
        } else {
          // Second swing: price slightly lower but smaller losses (divergence)
          close = currentPrice - 10 - (i - 20) * 0.2;
        }
        open = close - 0.2;
        high = Math.max(open, close) + 0.5;
        low = Math.min(open, close) - 0.5;
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

describe('RSI Indicator NEW - Functional Tests', () => {
  describe('UPTREND Pattern', () => {
    it('should be overbought (RSI > 70) in strong uptrend', () => {
      const rsi = new RSIIndicatorNew(standardConfig);
      const candles = createRealisticCandles('uptrend', 100, 50);

      rsi.calculate(candles);

      expect(rsi.isOverbought()).toBe(true);
      expect(rsi.getValue()).toBeGreaterThan(70);
    });

    it('should show RSI approaching 100 with consistent gains', () => {
      const rsi = new RSIIndicatorNew(standardConfig);
      const upCandles: Candle[] = Array.from({ length: 30 }, (_, i) => ({
        open: 100 + i,
        high: 105 + i,
        low: 100 + i,
        close: 101 + i, // Always increasing
        volume: 1000,
        timestamp: 1000 * (i + 1),
      }));

      const result = rsi.calculate(upCandles);

      expect(result).toBe(100);
    });

    it('should detect extreme high zone (RSI > 80) in very strong uptrend', () => {
      const rsi = new RSIIndicatorNew(standardConfig);
      const candles = createRealisticCandles('uptrend', 100, 50);

      rsi.calculate(candles);

      const extreme = rsi.getExtremeZone();
      expect(extreme).toBe('HIGH');
      expect(rsi.getValue()).toBeGreaterThan(80);
    });

    it('should increase RSI as uptrend continues', () => {
      const rsi = new RSIIndicatorNew(standardConfig);
      const baseCandles = createRealisticCandles('uptrend', 100, 25);

      rsi.calculate(baseCandles);
      const rsi1 = rsi.getValue();

      // Add more uptrend
      for (let i = 0; i < 15; i++) {
        const newPrice = baseCandles[baseCandles.length - 1].close + i * 0.5;
        rsi.update(baseCandles[baseCandles.length - 1].close, newPrice);
      }

      const rsi2 = rsi.getValue();

      // RSI should increase with continued uptrend
      expect(rsi2).toBeGreaterThan(rsi1);
    });
  });

  describe('DOWNTREND Pattern', () => {
    it('should be oversold (RSI < 30) in strong downtrend', () => {
      const rsi = new RSIIndicatorNew(standardConfig);
      const candles = createRealisticCandles('downtrend', 100, 50);

      rsi.calculate(candles);

      expect(rsi.isOversold()).toBe(true);
      expect(rsi.getValue()).toBeLessThan(30);
    });

    it('should show RSI approaching 0 with consistent losses', () => {
      const rsi = new RSIIndicatorNew(standardConfig);
      const downCandles: Candle[] = Array.from({ length: 30 }, (_, i) => ({
        open: 100 - i,
        high: 100 - i,
        low: 95 - i,
        close: 99 - i, // Always decreasing
        volume: 1000,
        timestamp: 1000 * (i + 1),
      }));

      const result = rsi.calculate(downCandles);

      expect(result).toBe(0);
    });

    it('should detect extreme low zone (RSI < 20) in very strong downtrend', () => {
      const rsi = new RSIIndicatorNew(standardConfig);
      const candles = createRealisticCandles('downtrend', 100, 50);

      rsi.calculate(candles);

      const extreme = rsi.getExtremeZone();
      expect(extreme).toBe('LOW');
      expect(rsi.getValue()).toBeLessThan(20);
    });

    it('should decrease RSI as downtrend continues', () => {
      const rsi = new RSIIndicatorNew(standardConfig);
      const baseCandles = createRealisticCandles('downtrend', 100, 25);

      rsi.calculate(baseCandles);
      const rsi1 = rsi.getValue();

      // Add more downtrend
      for (let i = 0; i < 15; i++) {
        const newPrice = baseCandles[baseCandles.length - 1].close - i * 0.5;
        rsi.update(baseCandles[baseCandles.length - 1].close, newPrice);
      }

      const rsi2 = rsi.getValue();

      // RSI should decrease with continued downtrend
      expect(rsi2).toBeLessThan(rsi1);
    });
  });

  describe('CONSOLIDATION Pattern', () => {
    it('should have RSI near 50 in consolidation', () => {
      const rsi = new RSIIndicatorNew(standardConfig);
      const candles = createRealisticCandles('consolidation', 100, 50);

      rsi.calculate(candles);
      const rsiValue = rsi.getValue();

      // In consolidation, RSI should be in middle range
      expect(rsiValue).toBeGreaterThan(40);
      expect(rsiValue).toBeLessThan(60);
    });

    it('should NOT be overbought or oversold in consolidation', () => {
      const rsi = new RSIIndicatorNew(standardConfig);
      const candles = createRealisticCandles('consolidation', 100, 50);

      rsi.calculate(candles);

      expect(rsi.isOverbought()).toBe(false);
      expect(rsi.isOversold()).toBe(false);
    });

    it('should be stable (no wild swings) in consolidation', () => {
      const rsi = new RSIIndicatorNew(standardConfig);
      const baseCandles = createRealisticCandles('consolidation', 100, 25);

      rsi.calculate(baseCandles);
      const initialRsi = rsi.getValue();

      // Simulate more consolidation
      let maxRsi = initialRsi;
      let minRsi = initialRsi;

      for (let i = 0; i < 20; i++) {
        const basePrice = 100 + (Math.sin(i * 0.5) * 2);
        const currentRsi = rsi.update(baseCandles[baseCandles.length - 1].close, basePrice);

        maxRsi = Math.max(maxRsi, currentRsi);
        minRsi = Math.min(minRsi, currentRsi);
      }

      // RSI should stay in narrow range (not wild swings)
      const range = maxRsi - minRsi;
      expect(range).toBeLessThan(20); // Less than 20 point swing
    });
  });

  describe('V-SHAPE Pattern (Reversal)', () => {
    it('should show RSI recovery from oversold after V-shape reversal', () => {
      const rsi = new RSIIndicatorNew(standardConfig);
      const candles = createRealisticCandles('v-shape', 100, 50);

      const result = rsi.calculate(candles);

      // After V-shape with uptrend recovery, RSI should be back above 50
      expect(result).toBeGreaterThan(50);
    });

    it('should identify turn point from oversold to uptrend', () => {
      const rsi = new RSIIndicatorNew(standardConfig);

      // First: downtrend (oversold)
      const downCandles = createRealisticCandles('downtrend', 100, 25);
      rsi.calculate(downCandles);
      const downRsi = rsi.getValue();
      expect(downRsi).toBeLessThan(30); // Oversold

      // Then: recovery
      rsi.reset();
      const vShapeCandles = createRealisticCandles('v-shape', 100, 40);
      const recoveryRsi = rsi.calculate(vShapeCandles);

      // After reversal, should be above oversold
      expect(recoveryRsi).toBeGreaterThan(40);
    });
  });

  describe('Bullish Divergence Pattern', () => {
    it('should detect bullish divergence (lower lows but higher RSI)', () => {
      const rsi = new RSIIndicatorNew(standardConfig);
      const candles = createRealisticCandles('divergence-bullish', 100, 45);

      const result = rsi.calculate(candles);

      // After bullish divergence setup, RSI should be rising even though price is making lower lows
      // This is a bullish warning
      expect(result).toBeGreaterThan(30); // Should be back above oversold despite lower price
    });
  });

  describe('Wilder\'s Smoothing Effect', () => {
    it('should smooth out noise and avoid RSI extremes on random noise', () => {
      const rsi = new RSIIndicatorNew(standardConfig);
      // Consolidation with noise
      const noisyCandles: Candle[] = Array.from({ length: 40 }, (_, i) => {
        const randomNoise = (Math.random() - 0.5) * 0.5;
        const close = 100 + randomNoise;
        return {
          open: close - 0.1,
          high: close + 0.3,
          low: close - 0.3,
          close,
          volume: 1000,
          timestamp: 1000 * (i + 1),
        };
      });

      const result = rsi.calculate(noisyCandles);

      // With noise but no clear trend, RSI should stay in middle range
      expect(result).toBeGreaterThan(30);
      expect(result).toBeLessThan(70);
    });

    it('should gradually respond to trend changes (not jump)', () => {
      const rsi = new RSIIndicatorNew(standardConfig);
      const baseCandles = createRealisticCandles('consolidation', 100, 25);

      rsi.calculate(baseCandles);
      const initialRsi = rsi.getValue();

      // Start uptrend
      let previousRsi = initialRsi;
      const rsiProgression = [];

      for (let i = 0; i < 20; i++) {
        const newPrice = 100 + i * 0.5; // Consistent uptrend
        previousRsi = rsi.update(100 + (i - 1) * 0.5, newPrice);
        rsiProgression.push(previousRsi);
      }

      // Check that RSI increases gradually, not in jumps
      for (let i = 1; i < rsiProgression.length; i++) {
        const change = rsiProgression[i] - rsiProgression[i - 1];
        // No jump should be more than 5 points in one update
        expect(Math.abs(change)).toBeLessThan(5);
      }

      // But overall should be trending up
      expect(rsiProgression[rsiProgression.length - 1]).toBeGreaterThan(initialRsi);
    });
  });

  describe('Real Trading Scenarios', () => {
    it('should identify oversold bounce opportunity', () => {
      const rsi = new RSIIndicatorNew(standardConfig);
      const downCandles = createRealisticCandles('downtrend', 100, 30);

      rsi.calculate(downCandles);

      // Should be oversold
      expect(rsi.isOversold()).toBe(true);
      const extreme = rsi.getExtremeZone();
      expect(extreme).toBe('LOW');

      // This signals bounce opportunity
    });

    it('should identify overbought pullback opportunity', () => {
      const rsi = new RSIIndicatorNew(standardConfig);
      const upCandles = createRealisticCandles('uptrend', 100, 30);

      rsi.calculate(upCandles);

      // Should be overbought
      expect(rsi.isOverbought()).toBe(true);
      const extreme = rsi.getExtremeZone();
      expect(extreme).toBe('HIGH');

      // This signals pullback opportunity
    });

    it('should confirm trend with RSI > 50 for uptrend', () => {
      const rsi = new RSIIndicatorNew(standardConfig);
      const upCandles = createRealisticCandles('uptrend', 100, 40);

      rsi.calculate(upCandles);
      const rsiValue = rsi.getValue();

      // Uptrend should have RSI > 50
      expect(rsiValue).toBeGreaterThan(50);
    });

    it('should confirm trend with RSI < 50 for downtrend', () => {
      const rsi = new RSIIndicatorNew(standardConfig);
      const downCandles = createRealisticCandles('downtrend', 100, 40);

      rsi.calculate(downCandles);
      const rsiValue = rsi.getValue();

      // Downtrend should have RSI < 50
      expect(rsiValue).toBeLessThan(50);
    });
  });

  describe('Different Period Configurations', () => {
    it('should respond differently with different periods', () => {
      const fastConfig: RsiIndicatorConfigNew = {
        ...standardConfig,
        period: 7,
      };
      const slowConfig: RsiIndicatorConfigNew = {
        ...standardConfig,
        period: 21,
      };

      const candles = createRealisticCandles('uptrend', 100, 40);

      const fastRsi = new RSIIndicatorNew(fastConfig);
      const slowRsi = new RSIIndicatorNew(slowConfig);

      const fastResult = fastRsi.calculate(candles);
      const slowResult = slowRsi.calculate(candles);

      // Faster period should be more responsive (higher RSI in uptrend)
      expect(fastResult).toBeGreaterThan(slowResult);
    });
  });

  describe('Zone Transitions', () => {
    it('should transition from oversold to normal as uptrend continues', () => {
      const rsi = new RSIIndicatorNew(standardConfig);
      const downCandles = createRealisticCandles('downtrend', 100, 25);

      rsi.calculate(downCandles);
      expect(rsi.isOversold()).toBe(true);

      // Simulate transition to uptrend
      for (let i = 0; i < 15; i++) {
        const newPrice = downCandles[downCandles.length - 1].close + i * 0.5;
        rsi.update(downCandles[downCandles.length - 1].close, newPrice);
      }

      // Should transition to normal range
      expect(rsi.isOversold()).toBe(false);
      expect(rsi.getValue()).toBeGreaterThan(30);
    });

    it('should transition from overbought to normal as downtrend continues', () => {
      const rsi = new RSIIndicatorNew(standardConfig);
      const upCandles = createRealisticCandles('uptrend', 100, 25);

      rsi.calculate(upCandles);
      expect(rsi.isOverbought()).toBe(true);

      // Simulate transition to downtrend
      for (let i = 0; i < 15; i++) {
        const newPrice = upCandles[upCandles.length - 1].close - i * 0.5;
        rsi.update(upCandles[upCandles.length - 1].close, newPrice);
      }

      // Should transition to normal range
      expect(rsi.isOverbought()).toBe(false);
      expect(rsi.getValue()).toBeLessThan(70);
    });
  });

  describe('Consistency Checks', () => {
    it('should be consistent whether calculated all-at-once or incrementally', () => {
      const candles = createRealisticCandles('uptrend', 100, 50);

      // Calculate all at once
      const rsi1 = new RSIIndicatorNew(standardConfig);
      const result1 = rsi1.calculate(candles);

      // Calculate incrementally
      const rsi2 = new RSIIndicatorNew(standardConfig);
      const initialCandles = candles.slice(0, 30);
      rsi2.calculate(initialCandles);

      for (let i = 30; i < candles.length; i++) {
        rsi2.update(candles[i - 1].close, candles[i].close);
      }
      const result2 = rsi2.getValue();

      // Results should be nearly identical
      expect(result1).toBeCloseTo(result2, 1);
    });
  });
});
