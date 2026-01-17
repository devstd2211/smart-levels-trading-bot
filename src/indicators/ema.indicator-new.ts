/**
 * EMA Indicator - NEW with ConfigNew Support
 * Exponential Moving Average with strict typing
 *
 * Formula:
 * 1. Multiplier = 2 / (period + 1)
 * 2. EMA = (Close - EMA_prev) * Multiplier + EMA_prev
 * 3. First EMA = SMA (Simple Moving Average) of first N periods
 *
 * Use cases:
 * - Trend identification (price above EMA = uptrend)
 * - Support/resistance levels
 * - Entry confirmation (price crosses EMA)
 */

import type { Candle } from '../types/core';
import type { EmaIndicatorConfigNew } from '../types/config-new.types';
import type { IIndicator } from '../types/indicator.interface';
import { INTEGER_MULTIPLIERS } from '../constants';
import { validateIndicatorConfig } from '../types/config-new.types';
import { IndicatorType } from '../types/indicator-type.enum';

// ============================================================================
// CONSTANTS
// ============================================================================

const MULTIPLIER_NUMERATOR = INTEGER_MULTIPLIERS.TWO;
const MULTIPLIER_DENOMINATOR_OFFSET = INTEGER_MULTIPLIERS.ONE;

// ============================================================================
// EMA CALCULATOR - NEW VERSION
// ============================================================================

export class EMAIndicatorNew implements IIndicator {
  private readonly fastPeriod: number;
  private readonly slowPeriod: number;
  private readonly enabled: boolean;
  private readonly baseConfidence: number;
  private readonly strengthMultiplier: number;

  private fastEma: number = 0;
  private slowEma: number = 0;
  private fastMultiplier: number;
  private slowMultiplier: number;
  private initialized: boolean = false;

  /**
   * Constructor with ConfigNew
   * STRICT - Throws if config is invalid
   */
  constructor(config: EmaIndicatorConfigNew) {
    // Validate config
    validateIndicatorConfig('EMA_INDICATOR', config);

    if (typeof config.fastPeriod !== 'number' || config.fastPeriod < 1) {
      throw new Error('[EMA_INDICATOR] Missing or invalid: fastPeriod (number >= 1)');
    }
    if (typeof config.slowPeriod !== 'number' || config.slowPeriod < 1) {
      throw new Error('[EMA_INDICATOR] Missing or invalid: slowPeriod (number >= 1)');
    }
    if (typeof config.baseConfidence !== 'number' || config.baseConfidence < 0 || config.baseConfidence > 1) {
      throw new Error('[EMA_INDICATOR] Missing or invalid: baseConfidence (number 0-1)');
    }
    if (typeof config.strengthMultiplier !== 'number' || config.strengthMultiplier < 0) {
      throw new Error('[EMA_INDICATOR] Missing or invalid: strengthMultiplier (number >= 0)');
    }

    this.enabled = config.enabled;
    this.fastPeriod = config.fastPeriod;
    this.slowPeriod = config.slowPeriod;
    this.baseConfidence = config.baseConfidence;
    this.strengthMultiplier = config.strengthMultiplier;

    // Pre-calculate multipliers
    this.fastMultiplier = MULTIPLIER_NUMERATOR / (this.fastPeriod + MULTIPLIER_DENOMINATOR_OFFSET);
    this.slowMultiplier = MULTIPLIER_NUMERATOR / (this.slowPeriod + MULTIPLIER_DENOMINATOR_OFFSET);
  }

  /**
   * Calculate both Fast and Slow EMA for a series of candles
   *
   * @param candles - Array of candles (must be at least slowPeriod length)
   * @returns { fast: number, slow: number, diff: number }
   * @throws {Error} If not enabled, not enough candles, or invalid input
   */
  calculate(candles: Candle[]): { fast: number; slow: number; diff: number } {
    if (!this.enabled) {
      throw new Error('[EMA_INDICATOR] Indicator is disabled in config');
    }

    if (!Array.isArray(candles)) {
      throw new Error('[EMA_INDICATOR] Invalid candles input (must be array)');
    }

    if (candles.length < this.slowPeriod) {
      throw new Error(
        `[EMA_INDICATOR] Not enough candles. Need ${this.slowPeriod}, got ${candles.length}`,
      );
    }

    // Reset state
    this.initialized = false;

    // Calculate Fast EMA: Calculate initial SMA for fast period
    let fastSum = 0;
    for (let i = 0; i < this.fastPeriod; i++) {
      fastSum += candles[i].close;
    }
    this.fastEma = fastSum / this.fastPeriod;

    // Calculate Slow EMA: Calculate initial SMA for slow period
    let slowSum = 0;
    for (let i = 0; i < this.slowPeriod; i++) {
      slowSum += candles[i].close;
    }
    this.slowEma = slowSum / this.slowPeriod;

    // Apply EMA formula for remaining candles
    for (let i = Math.max(this.fastPeriod, this.slowPeriod); i < candles.length; i++) {
      const close = candles[i].close;

      // Update fast EMA only if we're past fast period
      if (i >= this.fastPeriod) {
        this.fastEma = (close - this.fastEma) * this.fastMultiplier + this.fastEma;
      }

      // Update slow EMA only if we're past slow period
      if (i >= this.slowPeriod) {
        this.slowEma = (close - this.slowEma) * this.slowMultiplier + this.slowEma;
      }
    }

    this.initialized = true;

    const diff = this.fastEma - this.slowEma;
    return {
      fast: this.fastEma,
      slow: this.slowEma,
      diff,
    };
  }

  /**
   * Update both EMAs with a new price (incremental calculation)
   *
   * @param price - Current close price
   * @returns { fast: number, slow: number, diff: number }
   * @throws {Error} If not initialized or invalid input
   */
  update(price: number): { fast: number; slow: number; diff: number } {
    if (!this.initialized) {
      throw new Error('[EMA_INDICATOR] Not initialized. Call calculate() first.');
    }

    if (typeof price !== 'number' || isNaN(price) || price < 0) {
      throw new Error('[EMA_INDICATOR] Invalid price input (must be positive number)');
    }

    this.fastEma = (price - this.fastEma) * this.fastMultiplier + this.fastEma;
    this.slowEma = (price - this.slowEma) * this.slowMultiplier + this.slowEma;

    const diff = this.fastEma - this.slowEma;
    return {
      fast: this.fastEma,
      slow: this.slowEma,
      diff,
    };
  }

  /**
   * Get current EMA values
   *
   * @returns { fast: number, slow: number, diff: number }
   * @throws {Error} If not initialized
   */
  getValue(): { fast: number; slow: number; diff: number } {
    if (!this.initialized) {
      throw new Error('[EMA_INDICATOR] Not initialized. Call calculate() first.');
    }

    const diff = this.fastEma - this.slowEma;
    return {
      fast: this.fastEma,
      slow: this.slowEma,
      diff,
    };
  }

  /**
   * Get current state
   *
   * @returns Current EMAs and initialization status
   */
  getState(): {
    fastEma: number;
    slowEma: number;
    diff: number;
    initialized: boolean;
  } {
    const diff = this.fastEma - this.slowEma;
    return {
      fastEma: this.fastEma,
      slowEma: this.slowEma,
      diff,
      initialized: this.initialized,
    };
  }

  /**
   * Reset indicator state
   */
  reset(): void {
    this.fastEma = 0;
    this.slowEma = 0;
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
    fastPeriod: number;
    slowPeriod: number;
    baseConfidence: number;
    strengthMultiplier: number;
  } {
    return {
      enabled: this.enabled,
      fastPeriod: this.fastPeriod,
      slowPeriod: this.slowPeriod,
      baseConfidence: this.baseConfidence,
      strengthMultiplier: this.strengthMultiplier,
    };
  }

  // ============================================================================
  // IIndicator Interface Methods
  // ============================================================================

  /**
   * Get indicator type
   */
  getType(): string {
    return IndicatorType.EMA;
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
    return this.slowPeriod;
  }
}
