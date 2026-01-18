import { IIndicatorCalculator } from '../../types/indicator-calculator.interface';
import { Candle } from '../../types';

/**
 * Bollinger Bands Calculator - calculates Bollinger Bands middle band for multiple periods and timeframes
 *
 * Implements IIndicatorCalculator interface
 * Does NOT know about analyzers or how Bollinger Bands will be used
 * Just calculates and returns results as Map
 *
 * Returns: Middle band value (SMA - primary metric for caching)
 */
export class BollingerBandsCalculator implements IIndicatorCalculator {
  private readonly periods = [20];
  private readonly timeframes = ['1h', '4h'];

  /**
   * Get configuration of what this calculator produces
   */
  getConfig() {
    return {
      indicators: [
        {
          name: 'BOLLINGER_BANDS',
          periods: this.periods,
          timeframes: this.timeframes,
          minCandlesRequired: 50, // BB needs at least ~50 candles for accuracy
        },
      ],
    };
  }

  /**
   * Calculate Bollinger Bands for all periods and timeframes
   */
  async calculate(context: {
    candlesByTimeframe: Map<string, Candle[]>;
    timestamp: number;
  }): Promise<Map<string, number>> {
    const results = new Map<string, number>();

    for (const tf of this.timeframes) {
      const candles = context.candlesByTimeframe.get(tf);
      if (!candles || candles.length === 0) {
        continue;
      }

      for (const period of this.periods) {
        // Ensure we have enough candles
        if (candles.length < period) {
          continue;
        }

        const middleBand = calculateBollingerMiddleBand(candles, period);
        const cacheKey = `BOLLINGER_BANDS-${period}-${tf}`;
        results.set(cacheKey, middleBand);
      }
    }

    return results;
  }
}

/**
 * Calculate SMA (Simple Moving Average)
 */
function calculateSMA(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

/**
 * Calculate Bollinger Bands Middle Band (SMA)
 * Middle Band = SMA of close over period
 *
 * Returns the middle band (SMA) value
 */
export function calculateBollingerMiddleBand(candles: Candle[], period: number): number {
  if (candles.length < period) {
    return 0; // Return 0 if not enough data
  }

  // Get last period closes
  const lookback = candles.slice(-period).map((c) => c.close);

  // Calculate SMA
  const sma = calculateSMA(lookback);

  return Math.round(sma * 10000) / 10000; // Round to 4 decimals for prices
}
