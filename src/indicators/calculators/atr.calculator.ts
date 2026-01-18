import { IIndicatorCalculator } from '../../types/indicator-calculator.interface';
import { Candle } from '../../types';

/**
 * ATR Calculator - calculates Average True Range for multiple periods and timeframes
 *
 * Implements IIndicatorCalculator interface
 * Does NOT know about analyzers or how ATR will be used
 * Just calculates and returns results as Map
 */
export class AtrCalculator implements IIndicatorCalculator {
  private readonly periods = [14];
  private readonly timeframes = ['1h', '4h'];

  /**
   * Get configuration of what this calculator produces
   */
  getConfig() {
    return {
      indicators: [
        {
          name: 'ATR',
          periods: this.periods,
          timeframes: this.timeframes,
          minCandlesRequired: 50, // ATR needs at least ~50 candles for accuracy
        },
      ],
    };
  }

  /**
   * Calculate ATR for all periods and timeframes
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

        const atrValue = calculateATR(candles, period);
        const cacheKey = `ATR-${period}-${tf}`;
        results.set(cacheKey, atrValue);
      }
    }

    return results;
  }
}

/**
 * Calculate True Range for a single candle
 * TR = max of:
 *   - High - Low
 *   - |High - Previous Close|
 *   - |Low - Previous Close|
 */
function calculateTrueRange(current: Candle, previous: Candle): number {
  const highLow = current.high - current.low;
  const highClose = Math.abs(current.high - previous.close);
  const lowClose = Math.abs(current.low - previous.close);

  return Math.max(highLow, highClose, lowClose);
}

/**
 * Calculate ATR (Average True Range)
 * ATR = EMA of TR over period (Wilder's smoothing)
 *
 * Returns the ATR of the last candle
 */
export function calculateATR(candles: Candle[], period: number): number {
  if (candles.length < period + 1) {
    return 0; // Return 0 if not enough data
  }

  // Calculate True Range for each candle
  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = calculateTrueRange(candles[i], candles[i - 1]);
    trueRanges.push(tr);
  }

  // Initial ATR (simple average for first period)
  let sumTR = 0;
  for (let i = 0; i < period; i++) {
    sumTR += trueRanges[i];
  }
  let atr = sumTR / period;

  // Wilder's smoothing for remaining periods
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return Math.round(atr * 10000) / 10000; // Round to 4 decimals for prices
}
