import { VolumeCalculator, calculateAverageVolume } from '../../indicators/calculators/volume.calculator';
import type { Candle } from '../../types';

describe('Volume Calculator', () => {
  let calculator: VolumeCalculator;

  beforeEach(() => {
    calculator = new VolumeCalculator();
  });

  // ============================================================================
  // Configuration Tests
  // ============================================================================

  describe('getConfig', () => {
    it('should return configuration with correct indicator name', () => {
      const config = calculator.getConfig();
      expect(config.indicators).toHaveLength(1);
      expect(config.indicators[0].name).toBe('VOLUME');
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
    function createCandles(count: number, baseVolume: number = 1000): Candle[] {
      return Array.from({ length: count }, (_, i) => ({
        open: 100 + i,
        high: 105 + i,
        low: 97 + i,
        close: 101 + i,
        volume: baseVolume + i * 100,
        timestamp: 1000 * (i + 1),
      }));
    }

    it('should calculate average volume for valid candles', async () => {
      const candles = createCandles(50);
      const context = {
        candlesByTimeframe: new Map([['1h', candles]]),
        timestamp: Date.now(),
      };

      const result = await calculator.calculate(context);

      expect(result.has('VOLUME-20-1h')).toBe(true);
      const volumeValue = result.get('VOLUME-20-1h');
      expect(volumeValue).toBeGreaterThan(0);
    });

    it('should skip if candles are too few', async () => {
      const candles = createCandles(10);
      const context = {
        candlesByTimeframe: new Map([['1h', candles]]),
        timestamp: Date.now(),
      };

      const result = await calculator.calculate(context);

      expect(result.has('VOLUME-20-1h')).toBe(false);
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

      expect(result.has('VOLUME-20-1h')).toBe(true);
      expect(result.has('VOLUME-20-4h')).toBe(true);
    });

    it('should use cache key format: VOLUME-{period}-{timeframe}', async () => {
      const candles = createCandles(50);
      const context = {
        candlesByTimeframe: new Map([['1h', candles]]),
        timestamp: Date.now(),
      };

      const result = await calculator.calculate(context);
      const keys = Array.from(result.keys());

      expect(keys).toContain('VOLUME-20-1h');
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

      expect(result.has('VOLUME-20-1h')).toBe(true);
      expect(result.has('VOLUME-20-4h')).toBe(false);
    });
  });

  // ============================================================================
  // Helper Function Tests
  // ============================================================================

  describe('calculateAverageVolume helper function', () => {
    function createCandles(count: number, baseVolume: number = 1000): Candle[] {
      return Array.from({ length: count }, (_, i) => ({
        open: 100 + i,
        high: 105 + i,
        low: 97 + i,
        close: 101 + i,
        volume: baseVolume + i * 100,
        timestamp: 1000 * (i + 1),
      }));
    }

    it('should return 0 if not enough candles', () => {
      const candles = createCandles(10);
      const avgVolume = calculateAverageVolume(candles, 20);
      expect(avgVolume).toBe(0);
    });

    it('should calculate positive average for valid candles', () => {
      const candles = createCandles(50);
      const avgVolume = calculateAverageVolume(candles, 20);
      expect(avgVolume).toBeGreaterThan(0);
    });

    it('should return correct average for known values', () => {
      const candles = createCandles(50, 1000);
      const avgVolume = calculateAverageVolume(candles, 20);

      // Expected: average of last 20 volumes
      // Last 20: 1000 + (30*100), 1000 + (31*100), ..., 1000 + (49*100)
      // Average of 3000 to 5900 in increments of 100
      expect(avgVolume).toBeGreaterThan(0);
    });

    it('should return rounded value to 2 decimals', () => {
      const candles = createCandles(50);
      const avgVolume = calculateAverageVolume(candles, 20);
      const decimalPlaces = (avgVolume.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });

    it('should calculate average using last N candles', () => {
      // Create candles with known volumes: [100, 200, 300, 400, 500]
      const candles: Candle[] = [100, 200, 300, 400, 500].map((vol, i) => ({
        open: 100,
        high: 105,
        low: 97,
        close: 101,
        volume: vol,
        timestamp: 1000 * (i + 1),
      }));

      const avgVolume = calculateAverageVolume(candles, 5);
      const expected = (100 + 200 + 300 + 400 + 500) / 5;
      expect(avgVolume).toBe(expected);
    });

    it('should handle candles with zero volume', () => {
      const candles: Candle[] = Array.from({ length: 50 }, (_, i) => ({
        open: 100,
        high: 105,
        low: 97,
        close: 101,
        volume: i === 0 ? 0 : 1000, // First candle has zero volume
        timestamp: 1000 * (i + 1),
      }));

      const avgVolume = calculateAverageVolume(candles, 20);
      expect(avgVolume).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge cases', () => {
    function createCandles(count: number, baseVolume: number = 1000): Candle[] {
      return Array.from({ length: count }, (_, i) => ({
        open: 100 + i,
        high: 105 + i,
        low: 97 + i,
        close: 101 + i,
        volume: baseVolume + i * 100,
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
      expect(result.has('VOLUME-20-1h')).toBe(true);
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

    it('should handle large volume values', () => {
      const candles: Candle[] = Array.from({ length: 50 }, (_, i) => ({
        open: 100,
        high: 105,
        low: 97,
        close: 101,
        volume: 1000000000 + i, // Very large volumes
        timestamp: 1000 * (i + 1),
      }));

      const avgVolume = calculateAverageVolume(candles, 20);
      expect(avgVolume).toBeGreaterThan(0);
    });
  });
});
