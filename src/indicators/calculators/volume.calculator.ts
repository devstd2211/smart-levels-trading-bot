import { IIndicatorCalculator } from '../../types/indicator-calculator.interface';
import { Candle } from '../../types';

/**
 * Volume Calculator - calculates Volume metrics for multiple periods and timeframes
 *
 * Implements IIndicatorCalculator interface
 * Does NOT know about analyzers or how Volume will be used
 * Just calculates and returns results as Map
 *
 * Returns: Average volume for caching (primary metric)
 */
export class VolumeCalculator implements IIndicatorCalculator {
  private readonly periods = [20];
  private readonly timeframes = ['1h', '4h'];

  /**
   * Get configuration of what this calculator produces
   */
  getConfig() {
    return {
      indicators: [
        {
          name: 'VOLUME',
          periods: this.periods,
          timeframes: this.timeframes,
          minCandlesRequired: 50, // Volume needs at least ~50 candles for accuracy
        },
      ],
    };
  }

  /**
   * Calculate Volume for all periods and timeframes
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

        const avgVolume = calculateAverageVolume(candles, period);
        const cacheKey = `VOLUME-${period}-${tf}`;
        results.set(cacheKey, avgVolume);
      }
    }

    return results;
  }
}

/**
 * Calculate Average Volume
 * Average = SMA of volume over period
 *
 * Returns the average volume of the last period candles
 */
export function calculateAverageVolume(candles: Candle[], period: number): number {
  if (candles.length < period) {
    return 0; // Return 0 if not enough data
  }

  // Get last period candles
  let sumVolume = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    if (candles[i].volume < 0) {
      return 0; // Invalid volume
    }
    sumVolume += candles[i].volume;
  }

  const average = sumVolume / period;
  return Math.round(average * 100) / 100; // Round to 2 decimals
}
