import { Candle } from './candle.types';

/**
 * Interface for indicator calculators
 * Each calculator is responsible for one indicator type (RSI, EMA, etc)
 * Does NOT know about analyzers - just calculates and returns results
 */
export interface IIndicatorCalculator {
  /**
   * Get configuration of what this calculator produces
   * Tells PreCalculationService:
   * - What indicators this calculator provides
   * - What periods/parameters it uses
   * - Which timeframes it operates on
   * - Minimum candles required for accuracy
   */
  getConfig(): {
    indicators: Array<{
      name: string; // "RSI", "EMA", "ATR", etc
      periods: number[]; // [14, 21] or [20, 50]
      timeframes: string[]; // ["1h", "4h", "1d"]
      minCandlesRequired: number; // How many candles needed for this calculation
    }>;
  };

  /**
   * Calculate indicators
   * @param context Candles organized by timeframe
   * @returns Map of cache keys to calculated values
   *
   * Example:
   * - Input: { "1h" -> [candle1, candle2, ...], "4h" -> [...] }
   * - Output: {
   *     "RSI-14-1h" -> 65,
   *     "RSI-21-1h" -> 63,
   *     "RSI-14-4h" -> 72
   *   }
   */
  calculate(context: {
    candlesByTimeframe: Map<string, Candle[]>;
    timestamp: number;
  }): Promise<Map<string, number>>;
}
