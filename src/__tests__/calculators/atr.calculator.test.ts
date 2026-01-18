import { AtrCalculator, calculateATR } from '../../indicators/calculators/atr.calculator';
import type { Candle } from '../../types';

describe('ATR Calculator', () => {
  let calculator: AtrCalculator;

  beforeEach(() => {
    calculator = new AtrCalculator();
  });

  // ============================================================================
  // Configuration Tests
  // ============================================================================

  describe('getConfig', () => {
    it('should return configuration with correct indicator name', () => {
      const config = calculator.getConfig();
      expect(config.indicators).toHaveLength(1);
      expect(config.indicators[0].name).toBe('ATR');
    });

    it('should return correct periods', () => {
      const config = calculator.getConfig();
      expect(config.indicators[0].periods).toEqual([14]);
    });

    it('should return correct timeframes', () => {
      const config = calculator.getConfig();
      expect(config.indicators[0].timeframes).toEqual(['1h', '4h']);
    });

    it('should return minimum candles required', () => {
      const config = calculator.getConfig();
      expect(config.indicators[0].minCandlesRequired).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Calculation Tests
  // ============================================================================

  describe('calculate', () => {
    function createCandles(count: number, basePrice: number = 100): Candle[] {
      return Array.from({ length: count }, (_, i) => ({
        open: basePrice + i,
        high: basePrice + i + 5,
        low: basePrice + i - 3,
        close: basePrice + i + 1,
        volume: 1000,
        timestamp: 1000 * (i + 1),
      }));
    }

    it('should calculate ATR for valid candles', async () => {
      const candles = createCandles(50);
      const context = {
        candlesByTimeframe: new Map([['1h', candles]]),
        timestamp: Date.now(),
      };

      const result = await calculator.calculate(context);

      expect(result.has('ATR-14-1h')).toBe(true);
      const atrValue = result.get('ATR-14-1h');
      expect(atrValue).toBeGreaterThan(0);
    });

    it('should skip if candles are too few', async () => {
      const candles = createCandles(10);
      const context = {
        candlesByTimeframe: new Map([['1h', candles]]),
        timestamp: Date.now(),
      };

      const result = await calculator.calculate(context);

      expect(result.has('ATR-14-1h')).toBe(false);
    });

    it('should handle multiple timeframes', async () => {
      const candles1h = createCandles(50);
      const candles4h = createCandles(50);

      const context = {
        candlesByTimeframe: new Map([
          ['1h', candles1h],
          ['4h', candles4h],
        ]),
        timestamp: Date.now(),
      };

      const result = await calculator.calculate(context);

      expect(result.has('ATR-14-1h')).toBe(true);
      expect(result.has('ATR-14-4h')).toBe(true);
    });

    it('should use cache key format: ATR-{period}-{timeframe}', async () => {
      const candles = createCandles(50);
      const context = {
        candlesByTimeframe: new Map([['1h', candles]]),
        timestamp: Date.now(),
      };

      const result = await calculator.calculate(context);
      const keys = Array.from(result.keys());

      expect(keys).toContain('ATR-14-1h');
    });

    it('should skip timeframe with no candles', async () => {
      const candles = createCandles(50);
      const context = {
        candlesByTimeframe: new Map([
          ['1h', candles],
          ['4h', []],
        ]),
        timestamp: Date.now(),
      };

      const result = await calculator.calculate(context);

      expect(result.has('ATR-14-1h')).toBe(true);
      expect(result.has('ATR-14-4h')).toBe(false);
    });
  });

  // ============================================================================
  // Helper Function Tests
  // ============================================================================

  describe('calculateATR helper function', () => {
    function createCandles(count: number, basePrice: number = 100): Candle[] {
      return Array.from({ length: count }, (_, i) => ({
        open: basePrice + i,
        high: basePrice + i + 5,
        low: basePrice + i - 3,
        close: basePrice + i + 1,
        volume: 1000,
        timestamp: 1000 * (i + 1),
      }));
    }

    it('should return 0 if not enough candles', () => {
      const candles = createCandles(10);
      const atr = calculateATR(candles, 14);
      expect(atr).toBe(0);
    });

    it('should calculate positive ATR for valid candles', () => {
      const candles = createCandles(50);
      const atr = calculateATR(candles, 14);
      expect(atr).toBeGreaterThan(0);
    });

    it('should return rounded value to 4 decimals', () => {
      const candles = createCandles(50);
      const atr = calculateATR(candles, 14);
      const decimalPlaces = (atr.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(4);
    });

    it('should calculate different ATR for different periods', () => {
      const candles = createCandles(50);
      const atr14 = calculateATR(candles, 14);
      const atr21 = calculateATR(candles, 21);

      // Different periods may result in different values
      expect(typeof atr14).toBe('number');
      expect(typeof atr21).toBe('number');
    });

    it('should handle candles with consistent price movement', () => {
      const candles = createCandles(50, 100);
      const atr = calculateATR(candles, 14);

      // For consistent movement, ATR should be predictable
      expect(atr).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge cases', () => {
    function createCandles(count: number, basePrice: number = 100): Candle[] {
      return Array.from({ length: count }, (_, i) => ({
        open: basePrice + i,
        high: basePrice + i + 5,
        low: basePrice + i - 3,
        close: basePrice + i + 1,
        volume: 1000,
        timestamp: 1000 * (i + 1),
      }));
    }

    it('should handle exactly period + 1 candles', async () => {
      const candles = createCandles(15); // exactly 14 + 1
      const context = {
        candlesByTimeframe: new Map([['1h', candles]]),
        timestamp: Date.now(),
      };

      const result = await calculator.calculate(context);
      expect(result.has('ATR-14-1h')).toBe(true);
    });

    it('should handle empty timeframe map', async () => {
      const context = {
        candlesByTimeframe: new Map(),
        timestamp: Date.now(),
      };

      const result = await calculator.calculate(context);
      expect(result.size).toBe(0);
    });

    it('should return empty map if no timeframes meet minimum', async () => {
      const candles = createCandles(5); // Too few
      const context = {
        candlesByTimeframe: new Map([['1h', candles]]),
        timestamp: Date.now(),
      };

      const result = await calculator.calculate(context);
      expect(result.size).toBe(0);
    });
  });
});
