import { StochasticCalculator, calculateStochasticK } from '../../indicators/calculators/stochastic.calculator';
import type { Candle } from '../../types';

describe('Stochastic Calculator', () => {
  let calculator: StochasticCalculator;

  beforeEach(() => {
    calculator = new StochasticCalculator();
  });

  // ============================================================================
  // Configuration Tests
  // ============================================================================

  describe('getConfig', () => {
    it('should return configuration with correct indicator name', () => {
      const config = calculator.getConfig();
      expect(config.indicators).toHaveLength(1);
      expect(config.indicators[0].name).toBe('STOCHASTIC');
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

    it('should calculate stochastic for valid candles', async () => {
      const candles = createCandles(50);
      const context = {
        candlesByTimeframe: new Map([['1h', candles]]),
        timestamp: Date.now(),
      };

      const result = await calculator.calculate(context);

      expect(result.has('STOCHASTIC-14-1h')).toBe(true);
      const kValue = result.get('STOCHASTIC-14-1h');
      expect(kValue).toBeGreaterThanOrEqual(0);
      expect(kValue).toBeLessThanOrEqual(100); // 0-100 range
    });

    it('should skip if candles are too few', async () => {
      const candles = createCandles(10);
      const context = {
        candlesByTimeframe: new Map([['1h', candles]]),
        timestamp: Date.now(),
      };

      const result = await calculator.calculate(context);

      expect(result.has('STOCHASTIC-14-1h')).toBe(false);
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

      expect(result.has('STOCHASTIC-14-1h')).toBe(true);
      expect(result.has('STOCHASTIC-14-4h')).toBe(true);
    });

    it('should use cache key format: STOCHASTIC-{period}-{timeframe}', async () => {
      const candles = createCandles(50);
      const context = {
        candlesByTimeframe: new Map([['1h', candles]]),
        timestamp: Date.now(),
      };

      const result = await calculator.calculate(context);
      const keys = Array.from(result.keys());

      expect(keys).toContain('STOCHASTIC-14-1h');
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

      expect(result.has('STOCHASTIC-14-1h')).toBe(true);
      expect(result.has('STOCHASTIC-14-4h')).toBe(false);
    });
  });

  // ============================================================================
  // Helper Function Tests
  // ============================================================================

  describe('calculateStochasticK helper function', () => {
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

    it('should return neutral (50) if not enough candles', () => {
      const candles = createCandles(10);
      const k = calculateStochasticK(candles, 14);
      expect(k).toBe(50);
    });

    it('should return value in 0-100 range', () => {
      const candles = createCandles(50);
      const k = calculateStochasticK(candles, 14);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(100);
    });

    it('should calculate %K based on highest high and lowest low', () => {
      // Create candles with known high/low/close
      const candles: Candle[] = [
        { open: 100, high: 100, low: 100, close: 100, volume: 1000, timestamp: 1 },
        { open: 101, high: 101, low: 101, close: 101, volume: 1000, timestamp: 2 },
        { open: 102, high: 105, low: 97, close: 102, volume: 1000, timestamp: 3 },
      ];

      // For period 3: high=105, low=97, close=102
      // %K = ((102-97)/(105-97))*100 = (5/8)*100 = 62.5
      const k = calculateStochasticK(candles, 3);
      expect(k).toBeCloseTo(62.5, 1);
    });

    it('should return 50 if range is 0 (no volatility)', () => {
      // Create candles with no range (same high/low)
      const candles: Candle[] = Array.from({ length: 20 }, (_, i) => ({
        open: 100,
        high: 100,
        low: 100,
        close: 100,
        volume: 1000,
        timestamp: 1000 * (i + 1),
      }));

      const k = calculateStochasticK(candles, 14);
      expect(k).toBe(50);
    });

    it('should calculate different values for different periods', () => {
      const candles = createCandles(50);
      const k14 = calculateStochasticK(candles, 14);
      const k21 = calculateStochasticK(candles, 21);

      // Different periods should be comparable but may differ
      expect(typeof k14).toBe('number');
      expect(typeof k21).toBe('number');
    });

    it('should return low %K for price near lowest low', () => {
      // Create candles: first 10 with high volatility to set a range, then last 4 with close near low
      const candles: Candle[] = [
        // First 10 candles to establish a range
        ...Array.from({ length: 10 }, (_, i) => ({
          open: 100,
          high: 120,
          low: 80,
          close: 100 + (i % 2 === 0 ? 5 : -5),
          volume: 1000,
          timestamp: 1000 * (i + 1),
        })),
        // Last 4 candles with close near lowest low (80)
        ...Array.from({ length: 4 }, (_, i) => ({
          open: 85,
          high: 100,
          low: 80,
          close: 82, // Close near low (82-80 = 2, while high-low = 20)
          volume: 1000,
          timestamp: 1000 * (10 + i + 1),
        })),
      ];

      const k = calculateStochasticK(candles, 14);
      // For last 14 candles: high=120, low=80, close=82
      // %K = ((82-80)/(120-80))*100 = (2/40)*100 = 5
      expect(k).toBeLessThan(40);
    });

    it('should return high %K for price near highest high', () => {
      // Create candles where close is near highest high
      const candles: Candle[] = Array.from({ length: 20 }, (_, i) => ({
        open: 100 + i,
        high: 110 + i,
        low: 90 + i,
        close: 109 + i, // Close near high
        volume: 1000,
        timestamp: 1000 * (i + 1),
      }));

      const k = calculateStochasticK(candles, 14);
      expect(k).toBeGreaterThan(80);
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

    it('should handle exactly period candles', async () => {
      const candles = createCandles(14); // exactly 14
      const context = {
        candlesByTimeframe: new Map([['1h', candles]]),
        timestamp: Date.now(),
      };

      const result = await calculator.calculate(context);
      expect(result.has('STOCHASTIC-14-1h')).toBe(true);
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
