/**
 * Bollinger Bands Indicator NEW - with ConfigNew Support
 * Measures volatility and overbought/oversold conditions
 *
 * Formula:
 * 1. Middle Band = SMA of close over period
 * 2. Standard Deviation = StdDev of close over period
 * 3. Upper Band = Middle Band + (StdDev * stdDev multiplier)
 * 4. Lower Band = Middle Band - (StdDev * stdDev multiplier)
 *
 * Metrics:
 * - Bandwidth: (Upper - Lower) / Middle * 100
 * - %B: (Close - Lower) / (Upper - Lower) * 100
 *   where 0 = at lower band, 100 = at upper band, 50 = at middle
 *
 * Interpretation:
 * - Price touches upper band: Overbought potential
 * - Price touches lower band: Oversold potential
 * - Narrow bands: Low volatility, consolidation
 * - Wide bands: High volatility, trending
 * - %B > 80: Price near upper band (overbought)
 * - %B < 20: Price near lower band (oversold)
 *
 * Implementation: Period-based lookback with rolling close values
 * Returns: Upper, Middle, Lower bands and %B value (0-100)
 */

import type { Candle } from '../types/core';
import type { BollingerBandsConfigNew } from '../types/config-new.types';
import { validateIndicatorConfig } from '../types/config-new.types';

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_CANDLES_FOR_BOLLINGER = 1; // Need at least 1 candle

// ============================================================================
// BOLLINGER BANDS CALCULATOR - NEW VERSION
// ============================================================================

export class BollingerBandsIndicatorNew {
  private readonly enabled: boolean;
  private readonly period: number;
  private readonly stdDev: number;

  private closes: number[] = [];
  private middleBand: number = 0;
  private upperBand: number = 0;
  private lowerBand: number = 0;
  private percentB: number = 0;
  private bandwidth: number = 0;
  private initialized: boolean = false;

  /**
   * Constructor with ConfigNew
   * STRICT - Throws if config is invalid
   */
  constructor(config: BollingerBandsConfigNew) {
    // Validate config
    validateIndicatorConfig('BOLLINGER_BANDS_INDICATOR', config);

    if (typeof config.period !== 'number' || config.period < 1) {
      throw new Error('[BOLLINGER_BANDS_INDICATOR] Missing or invalid: period (number >= 1)');
    }
    if (typeof config.stdDev !== 'number' || config.stdDev < 0.1) {
      throw new Error('[BOLLINGER_BANDS_INDICATOR] Missing or invalid: stdDev (number >= 0.1)');
    }

    this.enabled = config.enabled;
    this.period = config.period;
    this.stdDev = config.stdDev;
  }

  /**
   * Calculate SMA (Simple Moving Average)
   *
   * @private
   * @param values - Array of values
   * @returns SMA value
   */
  private calculateSma(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }

  /**
   * Calculate Standard Deviation
   *
   * @private
   * @param values - Array of values
   * @param mean - Average of values
   * @returns Standard deviation
   */
  private calculateStdDev(values: number[], mean: number): number {
    if (values.length === 0) return 0;

    let sumSquaredDiff = 0;
    for (let i = 0; i < values.length; i++) {
      const diff = values[i] - mean;
      sumSquaredDiff += diff * diff;
    }

    const variance = sumSquaredDiff / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate Bollinger Bands for a series of candles
   *
   * @param candles - Array of candles (must be at least period length)
   * @returns Object with upper, middle, lower bands and %B value
   * @throws {Error} If not enabled, not enough candles, or invalid input
   */
  calculate(candles: Candle[]): {
    upper: number;
    middle: number;
    lower: number;
    percentB: number;
    bandwidth: number;
  } {
    if (!this.enabled) {
      throw new Error('[BOLLINGER_BANDS_INDICATOR] Indicator is disabled in config');
    }

    if (!Array.isArray(candles)) {
      throw new Error('[BOLLINGER_BANDS_INDICATOR] Invalid candles input (must be array)');
    }

    if (candles.length < this.period) {
      throw new Error(
        `[BOLLINGER_BANDS_INDICATOR] Not enough candles. Need ${this.period}, got ${candles.length}`,
      );
    }

    // Validate candles
    for (let i = 0; i < candles.length; i++) {
      if (!candles[i] || typeof candles[i].close !== 'number') {
        throw new Error(`[BOLLINGER_BANDS_INDICATOR] Invalid candle at index ${i}`);
      }
    }

    // Reset state
    this.closes = candles.map((c) => c.close);
    this.initialized = false;

    // Get last period closes
    const lookback = this.closes.slice(-this.period);

    // Calculate middle band (SMA)
    this.middleBand = this.calculateSma(lookback);

    // Calculate standard deviation
    const stdDevValue = this.calculateStdDev(lookback, this.middleBand);

    // Calculate upper and lower bands
    this.upperBand = this.middleBand + stdDevValue * this.stdDev;
    this.lowerBand = this.middleBand - stdDevValue * this.stdDev;

    // Calculate bandwidth
    const bandWidth = this.upperBand - this.lowerBand;
    this.bandwidth = this.middleBand !== 0 ? (bandWidth / this.middleBand) * 100 : 0;

    // Calculate %B
    const currentClose = candles[candles.length - 1].close;
    if (bandWidth === 0) {
      this.percentB = 50; // At middle if no band width
    } else {
      this.percentB = ((currentClose - this.lowerBand) / bandWidth) * 100;
      this.percentB = Math.max(0, Math.min(100, this.percentB)); // Clamp to 0-100
    }

    this.initialized = true;

    return {
      upper: this.upperBand,
      middle: this.middleBand,
      lower: this.lowerBand,
      percentB: this.percentB,
      bandwidth: this.bandwidth,
    };
  }

  /**
   * Update Bollinger Bands with new candle (incremental calculation)
   *
   * @param newCandle - Current candle
   * @returns Updated bands and %B value
   * @throws {Error} If not initialized or invalid input
   */
  update(newCandle: Candle): {
    upper: number;
    middle: number;
    lower: number;
    percentB: number;
    bandwidth: number;
  } {
    if (!this.initialized) {
      throw new Error('[BOLLINGER_BANDS_INDICATOR] Not initialized. Call calculate() first.');
    }

    if (!newCandle || typeof newCandle.close !== 'number') {
      throw new Error('[BOLLINGER_BANDS_INDICATOR] Invalid newCandle (missing or invalid close)');
    }

    // Add new close
    this.closes.push(newCandle.close);

    // Keep only last period closes
    if (this.closes.length > this.period) {
      this.closes.shift();
    }

    // Recalculate with current data
    const lookback = this.closes.slice(-this.period);

    // Calculate middle band (SMA)
    this.middleBand = this.calculateSma(lookback);

    // Calculate standard deviation
    const stdDevValue = this.calculateStdDev(lookback, this.middleBand);

    // Calculate upper and lower bands
    this.upperBand = this.middleBand + stdDevValue * this.stdDev;
    this.lowerBand = this.middleBand - stdDevValue * this.stdDev;

    // Calculate bandwidth
    const bandWidth = this.upperBand - this.lowerBand;
    this.bandwidth = this.middleBand !== 0 ? (bandWidth / this.middleBand) * 100 : 0;

    // Calculate %B
    if (bandWidth === 0) {
      this.percentB = 50; // At middle if no band width
    } else {
      this.percentB = ((newCandle.close - this.lowerBand) / bandWidth) * 100;
      this.percentB = Math.max(0, Math.min(100, this.percentB)); // Clamp to 0-100
    }

    return {
      upper: this.upperBand,
      middle: this.middleBand,
      lower: this.lowerBand,
      percentB: this.percentB,
      bandwidth: this.bandwidth,
    };
  }

  /**
   * Get current Bollinger Bands values
   *
   * @returns Current bands and %B
   * @throws {Error} If not initialized
   */
  getValue(): {
    upper: number;
    middle: number;
    lower: number;
    percentB: number;
    bandwidth: number;
  } {
    if (!this.initialized) {
      throw new Error('[BOLLINGER_BANDS_INDICATOR] Not initialized. Call calculate() first.');
    }

    return {
      upper: this.upperBand,
      middle: this.middleBand,
      lower: this.lowerBand,
      percentB: this.percentB,
      bandwidth: this.bandwidth,
    };
  }

  /**
   * Check if price is at or above upper band
   *
   * @param threshold - Distance from band (default 0 = touching)
   * @returns true if price >= upper band - threshold
   * @throws {Error} If not initialized
   */
  isAtUpperBand(threshold: number = 0): boolean {
    const current = this.closes[this.closes.length - 1];
    return current >= this.upperBand - threshold;
  }

  /**
   * Check if price is at or below lower band
   *
   * @param threshold - Distance from band (default 0 = touching)
   * @returns true if price <= lower band + threshold
   * @throws {Error} If not initialized
   */
  isAtLowerBand(threshold: number = 0): boolean {
    const current = this.closes[this.closes.length - 1];
    return current <= this.lowerBand + threshold;
  }

  /**
   * Check if bands are compressed (low volatility - squeeze)
   *
   * @param thresholdPercent - Bandwidth threshold for squeeze (default 5%)
   * @returns true if bandwidth < threshold
   * @throws {Error} If not initialized
   */
  isSqueezing(thresholdPercent: number = 5): boolean {
    return this.bandwidth < thresholdPercent;
  }

  /**
   * Get volatility classification based on bandwidth
   *
   * @returns 'very_low' | 'low' | 'normal' | 'high' | 'very_high'
   * @throws {Error} If not initialized
   */
  getVolatilityClassification():
    | 'very_low'
    | 'low'
    | 'normal'
    | 'high'
    | 'very_high' {
    const bw = this.bandwidth;

    if (bw < 3) return 'very_low';
    if (bw < 6) return 'low';
    if (bw < 10) return 'normal';
    if (bw < 15) return 'high';
    return 'very_high';
  }

  /**
   * Get price position classification based on %B
   *
   * @returns 'oversold' | 'low' | 'neutral' | 'high' | 'overbought'
   * @throws {Error} If not initialized
   */
  getPriceClassification(): 'oversold' | 'low' | 'neutral' | 'high' | 'overbought' {
    const pb = this.percentB;

    if (pb < 20) return 'oversold';
    if (pb < 40) return 'low';
    if (pb < 60) return 'neutral';
    if (pb <= 80) return 'high';
    return 'overbought';
  }

  /**
   * Get current state
   *
   * @returns Current Bollinger Bands state
   */
  getState(): {
    upper: number;
    middle: number;
    lower: number;
    percentB: number;
    bandwidth: number;
    initialized: boolean;
    candleCount: number;
  } {
    return {
      upper: this.upperBand,
      middle: this.middleBand,
      lower: this.lowerBand,
      percentB: this.percentB,
      bandwidth: this.bandwidth,
      initialized: this.initialized,
      candleCount: this.closes.length,
    };
  }

  /**
   * Reset indicator state
   */
  reset(): void {
    this.closes = [];
    this.middleBand = 0;
    this.upperBand = 0;
    this.lowerBand = 0;
    this.percentB = 0;
    this.bandwidth = 0;
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
    period: number;
    stdDev: number;
  } {
    return {
      enabled: this.enabled,
      period: this.period,
      stdDev: this.stdDev,
    };
  }
}
