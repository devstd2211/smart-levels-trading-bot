import { IIndicatorCalculator } from '../../types/indicator-calculator.interface';
import { Candle } from '../../types';

/**
 * RSI Calculator - calculates RSI for multiple periods and timeframes
 *
 * Implements IIndicatorCalculator interface
 * Does NOT know about analyzers or how RSI will be used
 * Just calculates and returns results as Map
 */
export class RsiCalculator implements IIndicatorCalculator {
  private readonly periods = [14, 21];
  private readonly timeframes = ['1h', '4h'];

  /**
   * Get configuration of what this calculator produces
   */
  getConfig() {
    return {
      indicators: [
        {
          name: 'RSI',
          periods: this.periods,
          timeframes: this.timeframes,
          minCandlesRequired: 50, // RSI needs at least ~50 candles for accuracy
        },
      ],
    };
  }

  /**
   * Calculate RSI for all periods and timeframes
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

        const rsiValue = calculateRSI(candles, period);
        const cacheKey = `RSI-${period}-${tf}`;
        results.set(cacheKey, rsiValue);
      }
    }

    return results;
  }
}

/**
 * Calculate RSI (Relative Strength Index)
 * RSI = 100 - (100 / (1 + RS))
 * where RS = Average Gain / Average Loss
 */
export function calculateRSI(candles: Candle[], period: number): number {
  if (candles.length < period + 1) {
    return 50; // Neutral if not enough data
  }

  // Calculate gains and losses
  let totalGain = 0;
  let totalLoss = 0;

  for (let i = candles.length - period; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) {
      totalGain += change;
    } else {
      totalLoss += Math.abs(change);
    }
  }

  const avgGain = totalGain / period;
  const avgLoss = totalLoss / period;

  // Prevent division by zero
  if (avgLoss === 0) {
    return avgGain > 0 ? 100 : 50;
  }

  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  return Math.round(rsi * 100) / 100; // Round to 2 decimals
}
