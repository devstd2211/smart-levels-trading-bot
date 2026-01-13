import { IIndicatorCalculator } from '../../types/indicator-calculator.interface';
import { Candle } from '../../types';

/**
 * EMA Calculator - calculates Exponential Moving Average for multiple periods and timeframes
 *
 * Implements IIndicatorCalculator interface
 * Does NOT know about analyzers or how EMA will be used
 * Just calculates and returns results as Map
 */
export class EmaCalculator implements IIndicatorCalculator {
  private readonly periods = [20, 50];
  private readonly timeframes = ['1h', '4h'];

  /**
   * Get configuration of what this calculator produces
   */
  getConfig() {
    return {
      indicators: [
        {
          name: 'EMA',
          periods: this.periods,
          timeframes: this.timeframes,
          minCandlesRequired: 100, // EMA needs at least ~100 candles for accuracy
        },
      ],
    };
  }

  /**
   * Calculate EMA for all periods and timeframes
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
        if (candles.length < period + 1) {
          continue;
        }

        const emaValue = calculateEMA(candles, period);
        const cacheKey = `EMA-${period}-${tf}`;
        results.set(cacheKey, emaValue);
      }
    }

    return results;
  }
}

/**
 * Calculate EMA (Exponential Moving Average)
 * EMA = (Close - EMA_prev) × multiplier + EMA_prev
 * where multiplier = 2 / (period + 1)
 *
 * Returns the EMA of the last candle
 */
export function calculateEMA(candles: Candle[], period: number): number {
  if (candles.length < period) {
    return candles[candles.length - 1].close; // Return last close if not enough data
  }

  // Calculate SMA as starting point
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  let ema = sum / period;

  // Calculate EMA for remaining candles
  const multiplier = 2 / (period + 1);

  for (let i = period; i < candles.length; i++) {
    ema = (candles[i].close - ema) * multiplier + ema;
  }

  return Math.round(ema * 10000) / 10000; // Round to 4 decimals for prices
}
