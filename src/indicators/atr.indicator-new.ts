/**
 * ATR Indicator NEW - with ConfigNew Support
 * Average True Range - Measures market volatility
 *
 * Formula:
 * 1. True Range (TR) = max of:
 *    - High - Low
 *    - |High - Previous Close|
 *    - |Low - Previous Close|
 * 2. ATR = EMA of TR over period (Wilder's smoothing)
 *
 * Returns: ATR value in absolute price units (not percentage)
 * - Low volatility: < 0.5% of price
 * - Normal volatility: 0.5% - 2% of price
 * - High volatility: 2% - 5% of price
 * - Extreme volatility: > 5% of price
 *
 * Implementation: Wilder's smoothing (modified EMA)
 */

import type { Candle } from '../types/core';
import type { AtrIndicatorConfigNew } from '../types/config-new.types';
import type { IIndicator } from '../types/indicator.interface';
import { validateIndicatorConfig } from '../types/config-new.types';
import { IndicatorType } from '../types/indicator-type.enum';

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_CANDLES_FOR_TR = 2; // Need at least 2 candles for TR calculation

// ============================================================================
// ATR CALCULATOR - NEW VERSION
// ============================================================================

export class ATRIndicatorNew implements IIndicator {
  private readonly enabled: boolean;
  private readonly period: number;
  private readonly minimumATR: number;
  private readonly maximumATR: number;

  private atr: number = 0;
  private initialized: boolean = false;

  /**
   * Constructor with ConfigNew
   * STRICT - Throws if config is invalid
   */
  constructor(config: AtrIndicatorConfigNew) {
    // Validate config
    validateIndicatorConfig('ATR_INDICATOR', config);

    if (typeof config.period !== 'number' || config.period < 1) {
      throw new Error('[ATR_INDICATOR] Missing or invalid: period (number >= 1)');
    }
    if (typeof config.minimumATR !== 'number' || config.minimumATR < 0) {
      throw new Error('[ATR_INDICATOR] Missing or invalid: minimumATR (number >= 0)');
    }
    if (typeof config.maximumATR !== 'number' || config.maximumATR < config.minimumATR) {
      throw new Error(
        `[ATR_INDICATOR] Missing or invalid: maximumATR (must be >= minimumATR: ${config.minimumATR})`,
      );
    }

    this.enabled = config.enabled;
    this.period = config.period;
    this.minimumATR = config.minimumATR;
    this.maximumATR = config.maximumATR;
  }

  /**
   * Calculate True Range for a single candle
   *
   * @private
   * @param current - Current candle
   * @param previous - Previous candle
   * @returns True Range value
   */
  private calculateTrueRange(current: Candle, previous: Candle): number {
    const highLow = current.high - current.low;
    const highClose = Math.abs(current.high - previous.close);
    const lowClose = Math.abs(current.low - previous.close);

    return Math.max(highLow, highClose, lowClose);
  }

  /**
   * Calculate ATR for a series of candles
   *
   * @param candles - Array of candles (must be at least period + 1 length)
   * @returns ATR value in absolute price units
   * @throws {Error} If not enabled, not enough candles, or invalid input
   */
  calculate(candles: Candle[]): number {
    if (!this.enabled) {
      throw new Error('[ATR_INDICATOR] Indicator is disabled in config');
    }

    if (!Array.isArray(candles)) {
      throw new Error('[ATR_INDICATOR] Invalid candles input (must be array)');
    }

    if (candles.length < this.period + 1) {
      throw new Error(
        `[ATR_INDICATOR] Not enough candles. Need ${this.period + 1}, got ${candles.length}`,
      );
    }

    // Reset state
    this.initialized = false;

    // Calculate True Range for each candle
    const trueRanges: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const tr = this.calculateTrueRange(candles[i], candles[i - 1]);
      trueRanges.push(tr);
    }

    // Initial ATR (simple average for first period)
    let sumTR = 0;
    for (let i = 0; i < this.period; i++) {
      sumTR += trueRanges[i];
    }
    this.atr = sumTR / this.period;
    this.initialized = true;

    // Wilder's smoothing for remaining periods
    for (let i = this.period; i < trueRanges.length; i++) {
      this.atr = (this.atr * (this.period - 1) + trueRanges[i]) / this.period;
    }

    return this.atr;
  }

  /**
   * Update ATR with a new candle (incremental calculation)
   *
   * @param newCandle - Current candle
   * @param previousCandle - Previous candle
   * @returns Updated ATR value
   * @throws {Error} If not initialized or invalid input
   */
  update(newCandle: Candle, previousCandle: Candle): number {
    if (!this.initialized) {
      throw new Error('[ATR_INDICATOR] Not initialized. Call calculate() first.');
    }

    if (!newCandle || typeof newCandle.high !== 'number' || typeof newCandle.low !== 'number') {
      throw new Error('[ATR_INDICATOR] Invalid newCandle (missing high/low)');
    }
    if (!previousCandle || typeof previousCandle.close !== 'number') {
      throw new Error('[ATR_INDICATOR] Invalid previousCandle (missing close)');
    }

    const tr = this.calculateTrueRange(newCandle, previousCandle);
    this.atr = (this.atr * (this.period - 1) + tr) / this.period;

    return this.atr;
  }

  /**
   * Get current ATR value
   *
   * @returns Current ATR in absolute price units
   * @throws {Error} If not initialized
   */
  getValue(): number {
    if (!this.initialized) {
      throw new Error('[ATR_INDICATOR] Not initialized. Call calculate() first.');
    }

    return this.atr;
  }

  /**
   * Get ATR as percentage of price
   *
   * @param currentPrice - Current price
   * @returns ATR as percentage
   * @throws {Error} If not initialized
   */
  getPercentage(currentPrice: number): number {
    if (!this.initialized) {
      throw new Error('[ATR_INDICATOR] Not initialized. Call calculate() first.');
    }

    if (typeof currentPrice !== 'number' || currentPrice <= 0) {
      throw new Error('[ATR_INDICATOR] Invalid currentPrice (must be positive number)');
    }

    return (this.atr / currentPrice) * 100;
  }

  /**
   * Check if ATR is below minimum threshold
   *
   * @returns true if ATR < minimumATR
   * @throws {Error} If not initialized
   */
  isBelowMinimum(): boolean {
    return this.getValue() < this.minimumATR;
  }

  /**
   * Check if ATR is above maximum threshold
   *
   * @returns true if ATR > maximumATR
   * @throws {Error} If not initialized
   */
  isAboveMaximum(): boolean {
    return this.getValue() > this.maximumATR;
  }

  /**
   * Check if ATR is in valid range (not extreme)
   *
   * @returns true if minimumATR <= ATR <= maximumATR
   * @throws {Error} If not initialized
   */
  isInValidRange(): boolean {
    const atr = this.getValue();
    return atr >= this.minimumATR && atr <= this.maximumATR;
  }

  /**
   * Get ATR classification
   *
   * @param currentPrice - Current price (for percentage context)
   * @returns 'low' | 'normal' | 'high' | 'extreme' | 'below_minimum' | 'above_maximum'
   * @throws {Error} If not initialized
   */
  getClassification(currentPrice: number): 'low' | 'normal' | 'high' | 'extreme' | 'below_minimum' | 'above_maximum' {
    const atr = this.getValue();

    // Check boundaries first
    if (atr < this.minimumATR) {
      return 'below_minimum';
    }
    if (atr > this.maximumATR) {
      return 'above_maximum';
    }

    // General classification based on percentage
    const atrPercent = this.getPercentage(currentPrice);

    if (atrPercent < 0.5) {
      return 'low';
    }
    if (atrPercent < 2) {
      return 'normal';
    }
    if (atrPercent < 5) {
      return 'high';
    }
    return 'extreme';
  }

  /**
   * Get current state
   *
   * @returns Current ATR and initialization status
   */
  getState(): {
    atr: number;
    initialized: boolean;
  } {
    return {
      atr: this.atr,
      initialized: this.initialized,
    };
  }

  /**
   * Reset indicator state
   */
  reset(): void {
    this.atr = 0;
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
    minimumATR: number;
    maximumATR: number;
  } {
    return {
      enabled: this.enabled,
      period: this.period,
      minimumATR: this.minimumATR,
      maximumATR: this.maximumATR,
    };
  }

  // ============================================================================
  // IIndicator Interface Methods
  // ============================================================================

  /**
   * Get indicator type
   */
  getType(): string {
    return IndicatorType.ATR;
  }

  /**
   * Check if indicator has enough data to calculate
   */
  isReady(candles: Candle[]): boolean {
    if (!Array.isArray(candles)) {
      return false;
    }
    return candles.length >= this.getMinCandlesRequired();
  }

  /**
   * Get minimum candles required for calculation
   */
  getMinCandlesRequired(): number {
    return this.period + 1;
  }
}
