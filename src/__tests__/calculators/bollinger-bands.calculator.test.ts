import { BollingerBandsCalculator, calculateBollingerMiddleBand } from '../../indicators/calculators/bollinger-bands.calculator';
import type { Candle } from '../../types';

describe('Bollinger Bands Calculator', () => {
  let calculator: BollingerBandsCalculator;

  beforeEach(() => {
    calculator = new BollingerBandsCalculator();
  });

  // ============================================================================
  // Configuration Tests
  // ============================================================================

  describe('getConfig', () => {
    it('should return configuration with correct indicator name', () => {
      const config = calculator.getConfig();
      expect(config.indicators).toHaveLength(1);
      expect(config.indicators[0].name).toBe('BOLLINGER_BANDS');
    });

    it('should return correct periods', () => {
      const config = calculator.getConfig();
      expect(config.indicators[0].periods).toEqual([20]);
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

    it('should calculate middle band for valid candles', async () => {
      const candles = createCandles(50);
      const context = {
        candlesByTimeframe: new Map([['1h', candles]]),
        timestamp: Date.now(),
      };

      const result = await calculator.calculate(context);

      expect(result.has('BOLLINGER_BANDS-20-1h')).toBe(true);
      const middleBand = result.get('BOLLINGER_BANDS-20-1h');
      expect(middleBand).toBeGreaterThan(0);
    });

    it('should skip if candles are too few', async () => {
      const candles = createCandles(10);
      const context = {
        candlesByTimeframe: new Map([['1h', candles]]),
        timestamp: Date.now(),
      };

      const result = await calculator.calculate(context);

      expect(result.has('BOLLINGER_BANDS-20-1h')).toBe(false);
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

      expect(result.has('BOLLINGER_BANDS-20-1h')).toBe(true);
      expect(result.has('BOLLINGER_BANDS-20-4h')).toBe(true);
    });

    it('should use cache key format: BOLLINGER_BANDS-{period}-{timeframe}', async () => {
      const candles = createCandles(50);
      const context = {
        candlesByTimeframe: new Map([['1h', candles]]),
        timestamp: Date.now(),
      };

      const result = await calculator.calculate(context);
      const keys = Array.from(result.keys());

      expect(keys).toContain('BOLLINGER_BANDS-20-1h');
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

      expect(result.has('BOLLINGER_BANDS-20-1h')).toBe(true);
      expect(result.has('BOLLINGER_BANDS-20-4h')).toBe(false);
    });
  });

  // ============================================================================
  // Helper Function Tests
  // ============================================================================

  describe('calculateBollingerMiddleBand helper function', () => {
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
      const middleBand = calculateBollingerMiddleBand(candles, 20);
      expect(middleBand).toBe(0);
    });

    it('should calculate positive middle band for valid candles', () => {
      const candles = createCandles(50);
      const middleBand = calculateBollingerMiddleBand(candles, 20);
      expect(middleBand).toBeGreaterThan(0);
    });

    it('should calculate correct SMA for known values', () => {
      // Create 20 candles with simple pattern
      const candles: Candle[] = Array.from({ length: 20 }, (_, i) => ({
        open: 100,
        high: 105,
        low: 97,
        close: 100 + i, // 100, 101, 102, ..., 119
        volume: 1000,
        timestamp: 1000 * (i + 1),
      }));

      const middleBand = calculateBollingerMiddleBand(candles, 20);
      // SMA of 100-119 = (100+101+...+119)/20 = 109.5
      expect(middleBand).toBeCloseTo(109.5, 0);
    });

    it('should return rounded value to 4 decimals', () => {
      const candles = createCandles(50);
      const middleBand = calculateBollingerMiddleBand(candles, 20);
      const decimalPlaces = (middleBand.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(4);
    });

    it('should use last period candles for calculation', () => {
      // Create candles: first 30 with close=100, last 20 with close=200
      const candles: Candle[] = [];

      for (let i = 0; i < 30; i++) {
        candles.push({
          open: 100,
          high: 105,
          low: 97,
          close: 100,
          volume: 1000,
          timestamp: 1000 * (i + 1),
        });
      }

      for (let i = 30; i < 50; i++) {
        candles.push({
          open: 200,
          high: 205,
          low: 197,
          close: 200,
          volume: 1000,
          timestamp: 1000 * (i + 1),
        });
      }

      const middleBand = calculateBollingerMiddleBand(candles, 20);
      // Should be based on last 20 candles (all with close=200)
      expect(middleBand).toBeCloseTo(200, 0);
    });

    it('should handle volatile candles', () => {
      // Create candles with high volatility
      const candles: Candle[] = Array.from({ length: 50 }, (_, i) => ({
        open: 100,
        high: 100 + (i % 2 === 0 ? 50 : 0),
        low: 100 - (i % 2 === 0 ? 50 : 0),
        close: 100 + (i % 2 === 0 ? 25 : -25),
        volume: 1000,
        timestamp: 1000 * (i + 1),
      }));

      const middleBand = calculateBollingerMiddleBand(candles, 20);
      expect(typeof middleBand).toBe('number');
      expect(middleBand).toBeGreaterThan(0);
    });

    it('should handle constant price candles', () => {
      // Create candles where all closes are the same
      const candles: Candle[] = Array.from({ length: 50 }, (_, i) => ({
        open: 100,
        high: 105,
        low: 97,
        close: 100, // Same close
        volume: 1000,
        timestamp: 1000 * (i + 1),
      }));

      const middleBand = calculateBollingerMiddleBand(candles, 20);
      expect(middleBand).toBe(100); // SMA should be 100
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
      const candles = createCandles(20); // exactly 20
      const context = {
        candlesByTimeframe: new Map([['1h', candles]]),
        timestamp: Date.now(),
      };

      const result = await calculator.calculate(context);
      expect(result.has('BOLLINGER_BANDS-20-1h')).toBe(true);
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

    it('should handle very large price values', () => {
      const candles: Candle[] = Array.from({ length: 50 }, (_, i) => ({
        open: 50000 + i,
        high: 50005 + i,
        low: 49997 + i,
        close: 50001 + i,
        volume: 1000,
        timestamp: 1000 * (i + 1),
      }));

      const middleBand = calculateBollingerMiddleBand(candles, 20);
      expect(middleBand).toBeGreaterThan(0);
    });
  });
});
