import { Candle } from './core';

/**
 * Universal Indicator Interface
 *
 * All indicators must implement this contract:
 * - EMA, RSI, ATR, Volume, Stochastic, Bollinger Bands
 *
 * Implementers:
 * - src/indicators/ema.indicator-new.ts
 * - src/indicators/rsi.indicator-new.ts
 * - src/indicators/atr.indicator-new.ts
 * - src/indicators/volume.indicator-new.ts
 * - src/indicators/stochastic.indicator-new.ts
 * - src/indicators/bollinger-bands.indicator-new.ts
 *
 * Usage:
 * - Analyzers inject indicators through constructor
 * - No hardcoded dependencies, only interfaces
 * - Loaded dynamically by IndicatorLoader
 */
export interface IIndicator {
  /**
   * Get indicator type name
   * @returns 'EMA', 'RSI', 'ATR', 'Volume', 'Stochastic', 'BollingerBands'
   */
  getType(): string;

  /**
   * Calculate indicator value(s) for given candles
   * @param candles Array of candles (usually last N candles)
   * @returns Indicator value or array of values
   *          EMA: single number
   *          RSI: single number
   *          ATR: single number
   *          BB: { upper: number, middle: number, lower: number }
   *          Stoch: { k: number, d: number }
   */
  calculate(candles: Candle[]): number | Record<string, number>;

  /**
   * Check if indicator has enough data to calculate
   * @param candles Array of candles
   * @returns true if enough candles, false otherwise
   */
  isReady(candles: Candle[]): boolean;

  /**
   * Get minimum candles required for calculation
   * @returns Min candle count needed
   */
  getMinCandlesRequired(): number;
}
