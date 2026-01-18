import { IIndicatorCalculator } from '../../types/indicator-calculator.interface';
import { Candle } from '../../types';

/**
 * Stochastic Calculator - calculates Stochastic %K values for multiple periods and timeframes
 *
 * Implements IIndicatorCalculator interface
 * Does NOT know about analyzers or how Stochastic will be used
 * Just calculates and returns results as Map
 *
 * Returns: %K value (primary metric for caching)
 */
export class StochasticCalculator implements IIndicatorCalculator {
  private readonly periods = [14];
  private readonly timeframes = ['1h', '4h'];

  /**
   * Get configuration of what this calculator produces
   */
  getConfig() {
    return {
      indicators: [
        {
          name: 'STOCHASTIC',
          periods: this.periods,
          timeframes: this.timeframes,
          minCandlesRequired: 50, // Stochastic needs at least ~50 candles for accuracy
        },
      ],
    };
  }

  /**
   * Calculate Stochastic for all periods and timeframes
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

        const kValue = calculateStochasticK(candles, period);
        const cacheKey = `STOCHASTIC-${period}-${tf}`;
        results.set(cacheKey, kValue);
      }
    }

    return results;
  }
}

/**
 * Calculate Stochastic %K
 * %K = ((Close - LowestLow) / (HighestHigh - LowestLow)) * 100
 *
 * Returns the %K value of the last candle (0-100 range)
 */
export function calculateStochasticK(candles: Candle[], period: number): number {
  if (candles.length < period) {
    return 50; // Neutral if not enough data
  }

  // Get last period candles
  const lookback = candles.slice(-period);
  const close = candles[candles.length - 1].close;

  // Find highest high and lowest low
  let highestHigh = lookback[0].high;
  let lowestLow = lookback[0].low;

  for (let i = 1; i < lookback.length; i++) {
    highestHigh = Math.max(highestHigh, lookback[i].high);
    lowestLow = Math.min(lowestLow, lookback[i].low);
  }

  // Calculate %K
  const range = highestHigh - lowestLow;
  if (range === 0) {
    return 50; // Neutral if range is 0
  }

  const k = ((close - lowestLow) / range) * 100;
  return Math.max(0, Math.min(100, k)); // Clamp to 0-100
}
