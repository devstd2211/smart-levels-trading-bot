/**
 * Stochastic Indicator NEW - with ConfigNew Support
 * Measures momentum and overbought/oversold conditions
 *
 * Formula:
 * 1. %K = ((Close - LowestLow) / (HighestHigh - LowestLow)) * 100
 *    where LowestLow and HighestHigh are over kPeriod
 * 2. %D = SMA of %K over dPeriod (signal line)
 *
 * Ranges:
 * - < 20: Oversold (potential bounce)
 * - 20-80: Normal range
 * - > 80: Overbought (potential pullback)
 *
 * Interpretation:
 * - Cross above 20: Bullish signal
 * - Cross below 80: Bearish signal
 * - %K > %D: Bullish momentum
 * - %K < %D: Bearish momentum
 *
 * Implementation: Period-based lookback with rolling K values
 * Returns: %K and %D values (0-100 range)
 */

import type { Candle } from '../types/core';
import type { StochasticIndicatorConfigNew } from '../types/config-new.types';
import { validateIndicatorConfig } from '../types/config-new.types';

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_CANDLES_FOR_STOCHASTIC = 1; // Need at least 1 candle
const STOCHASTIC_RANGE = 100; // 0-100 scale

// ============================================================================
// STOCHASTIC CALCULATOR - NEW VERSION
// ============================================================================

export class StochasticIndicatorNew {
  private readonly enabled: boolean;
  private readonly kPeriod: number;
  private readonly dPeriod: number;

  private candles: Candle[] = [];
  private kValues: number[] = [];
  private k: number = 0;
  private d: number = 0;
  private initialized: boolean = false;

  /**
   * Constructor with ConfigNew
   * STRICT - Throws if config is invalid
   */
  constructor(config: StochasticIndicatorConfigNew) {
    // Validate config
    validateIndicatorConfig('STOCHASTIC_INDICATOR', config);

    if (typeof config.kPeriod !== 'number' || config.kPeriod < 1) {
      throw new Error('[STOCHASTIC_INDICATOR] Missing or invalid: kPeriod (number >= 1)');
    }
    if (typeof config.dPeriod !== 'number' || config.dPeriod < 1) {
      throw new Error('[STOCHASTIC_INDICATOR] Missing or invalid: dPeriod (number >= 1)');
    }

    this.enabled = config.enabled;
    this.kPeriod = config.kPeriod;
    this.dPeriod = config.dPeriod;
  }

  /**
   * Calculate %K for a single candle within a lookback period
   *
   * @private
   * @param candles - Array of candles (must be at least kPeriod)
   * @returns %K value (0-100)
   */
  private calculateK(candles: Candle[]): number {
    if (candles.length < this.kPeriod) {
      return 0;
    }

    // Get last kPeriod candles
    const lookback = candles.slice(-this.kPeriod);
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

    const k = ((close - lowestLow) / range) * STOCHASTIC_RANGE;
    return Math.max(0, Math.min(STOCHASTIC_RANGE, k)); // Clamp to 0-100
  }

  /**
   * Calculate %D (SMA of %K values)
   *
   * @private
   * @returns %D value (0-100)
   */
  private calculateD(): number {
    if (this.kValues.length < this.dPeriod) {
      return this.k; // Return %K if not enough data
    }

    const lookback = this.kValues.slice(-this.dPeriod);
    const sum = lookback.reduce((a, b) => a + b, 0);
    return sum / this.dPeriod;
  }

  /**
   * Calculate stochastic for a series of candles
   *
   * @param candles - Array of candles (must be at least kPeriod length)
   * @returns Object with %K and %D values
   * @throws {Error} If not enabled, not enough candles, or invalid input
   */
  calculate(candles: Candle[]): {
    k: number;
    d: number;
  } {
    if (!this.enabled) {
      throw new Error('[STOCHASTIC_INDICATOR] Indicator is disabled in config');
    }

    if (!Array.isArray(candles)) {
      throw new Error('[STOCHASTIC_INDICATOR] Invalid candles input (must be array)');
    }

    if (candles.length < this.kPeriod) {
      throw new Error(
        `[STOCHASTIC_INDICATOR] Not enough candles. Need ${this.kPeriod}, got ${candles.length}`,
      );
    }

    // Validate candles
    for (let i = 0; i < candles.length; i++) {
      if (
        !candles[i] ||
        typeof candles[i].high !== 'number' ||
        typeof candles[i].low !== 'number' ||
        typeof candles[i].close !== 'number'
      ) {
        throw new Error(`[STOCHASTIC_INDICATOR] Invalid candle at index ${i}`);
      }
    }

    // Reset state
    this.candles = [...candles];
    this.kValues = [];
    this.initialized = false;

    // Calculate %K for each candle
    for (let i = 0; i < candles.length; i++) {
      const k = this.calculateK(candles.slice(0, i + 1));
      this.kValues.push(k);
    }

    // Get latest %K and %D
    this.k = this.kValues[this.kValues.length - 1];
    this.d = this.calculateD();
    this.initialized = true;

    return {
      k: this.k,
      d: this.d,
    };
  }

  /**
   * Update stochastic with new candle (incremental calculation)
   *
   * @param newCandle - Current candle
   * @returns Updated %K and %D values
   * @throws {Error} If not initialized or invalid input
   */
  update(newCandle: Candle): {
    k: number;
    d: number;
  } {
    if (!this.initialized) {
      throw new Error('[STOCHASTIC_INDICATOR] Not initialized. Call calculate() first.');
    }

    if (
      !newCandle ||
      typeof newCandle.high !== 'number' ||
      typeof newCandle.low !== 'number' ||
      typeof newCandle.close !== 'number'
    ) {
      throw new Error('[STOCHASTIC_INDICATOR] Invalid newCandle');
    }

    // Add new candle
    this.candles.push(newCandle);

    // Keep last kPeriod candles
    if (this.candles.length > this.kPeriod) {
      this.candles.shift();
    }

    // Calculate new %K
    const newK = this.calculateK(this.candles);
    this.kValues.push(newK);

    // Keep last dPeriod+1 K values (for calculating D)
    if (this.kValues.length > this.dPeriod + 1) {
      this.kValues.shift();
    }

    // Update values
    this.k = newK;
    this.d = this.calculateD();

    return {
      k: this.k,
      d: this.d,
    };
  }

  /**
   * Get current stochastic values
   *
   * @returns Current %K and %D
   * @throws {Error} If not initialized
   */
  getValue(): {
    k: number;
    d: number;
  } {
    if (!this.initialized) {
      throw new Error('[STOCHASTIC_INDICATOR] Not initialized. Call calculate() first.');
    }

    return {
      k: this.k,
      d: this.d,
    };
  }

  /**
   * Check if stochastic is in oversold condition
   *
   * @param threshold - Oversold threshold (default 20)
   * @returns true if %K < threshold
   * @throws {Error} If not initialized
   */
  isOversold(threshold: number = 20): boolean {
    return this.k < threshold;
  }

  /**
   * Check if stochastic is in overbought condition
   *
   * @param threshold - Overbought threshold (default 80)
   * @returns true if %K > threshold
   * @throws {Error} If not initialized
   */
  isOverbought(threshold: number = 80): boolean {
    return this.k > threshold;
  }

  /**
   * Check if %K crossed above %D (bullish signal)
   *
   * @returns true if %K > %D
   * @throws {Error} If not initialized
   */
  isBullishCrossover(): boolean {
    return this.k > this.d;
  }

  /**
   * Check if %K crossed below %D (bearish signal)
   *
   * @returns true if %K < %D
   * @throws {Error} If not initialized
   */
  isBearishCrossover(): boolean {
    return this.k < this.d;
  }

  /**
   * Get stochastic classification
   *
   * @returns 'oversold' | 'low' | 'neutral' | 'high' | 'overbought'
   * @throws {Error} If not initialized
   */
  getClassification(): 'oversold' | 'low' | 'neutral' | 'high' | 'overbought' {
    if (this.k < 20) return 'oversold';
    if (this.k < 40) return 'low';
    if (this.k < 60) return 'neutral';
    if (this.k <= 80) return 'high';
    return 'overbought';
  }

  /**
   * Get momentum direction based on %K vs %D
   *
   * @returns 'bullish' | 'bearish' | 'neutral'
   * @throws {Error} If not initialized
   */
  getMomentum(): 'bullish' | 'bearish' | 'neutral' {
    const diff = this.k - this.d;
    if (Math.abs(diff) < 2) return 'neutral'; // Small difference = neutral
    return diff > 0 ? 'bullish' : 'bearish';
  }

  /**
   * Get current state
   *
   * @returns Current stochastic state
   */
  getState(): {
    k: number;
    d: number;
    initialized: boolean;
    candleCount: number;
    kValueCount: number;
  } {
    return {
      k: this.k,
      d: this.d,
      initialized: this.initialized,
      candleCount: this.candles.length,
      kValueCount: this.kValues.length,
    };
  }

  /**
   * Reset indicator state
   */
  reset(): void {
    this.candles = [];
    this.kValues = [];
    this.k = 0;
    this.d = 0;
    this.initialized = false;
  }

  /**
   * Check if indicator is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get config values (for debugging/logging)
   */
  getConfig(): {
    enabled: boolean;
    kPeriod: number;
    dPeriod: number;
  } {
    return {
      enabled: this.enabled,
      kPeriod: this.kPeriod,
      dPeriod: this.dPeriod,
    };
  }
}
