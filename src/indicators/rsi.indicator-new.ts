/**
 * RSI Indicator NEW - with ConfigNew Support
 * Relative Strength Index - Measures momentum and overbought/oversold conditions
 *
 * Formula:
 * 1. Calculate price changes (gains and losses)
 * 2. Average gain = EMA of gains over period (Wilder's smoothing)
 * 3. Average loss = EMA of losses over period (Wilder's smoothing)
 * 4. RS = Average Gain / Average Loss
 * 5. RSI = 100 - (100 / (1 + RS))
 *
 * Range: 0-100
 * - Above overbought: Overbought (default 70)
 * - Below oversold: Oversold (default 30)
 *
 * Implementation: Wilder's smoothing (modified EMA)
 */

import type { Candle } from '../types/core';
import type { RsiIndicatorConfigNew } from '../types/config-new.types';
import type { IIndicator } from '../types/indicator.interface';
import { validateIndicatorConfig } from '../types/config-new.types';
import { IndicatorType } from '../types/indicator-type.enum';

// ============================================================================
// CONSTANTS
// ============================================================================

const RSI_MIN = 0;
const RSI_MAX = 100;
const RSI_NEUTRAL_FALLBACK = 70; // When avgLoss = 0

// ============================================================================
// RSI CALCULATOR - NEW VERSION
// ============================================================================

export class RSIIndicatorNew implements IIndicator {
  private readonly enabled: boolean;
  private readonly period: number;
  private readonly oversold: number;
  private readonly overbought: number;
  private readonly extreme: { low: number; high: number };
  private readonly neutralZone: { min: number; max: number };
  private readonly maxConfidence: number;

  private avgGain: number = 0;
  private avgLoss: number = 0;
  private initialized: boolean = false;

  /**
   * Constructor with ConfigNew
   * STRICT - Throws if config is invalid
   */
  constructor(config: RsiIndicatorConfigNew) {
    // Validate config
    validateIndicatorConfig('RSI_INDICATOR', config);

    if (typeof config.period !== 'number' || config.period < 1) {
      throw new Error('[RSI_INDICATOR] Missing or invalid: period (number >= 1)');
    }
    if (typeof config.oversold !== 'number' || config.oversold < 0 || config.oversold > 100) {
      throw new Error('[RSI_INDICATOR] Missing or invalid: oversold (number 0-100)');
    }
    if (typeof config.overbought !== 'number' || config.overbought < 0 || config.overbought > 100) {
      throw new Error('[RSI_INDICATOR] Missing or invalid: overbought (number 0-100)');
    }
    if (
      !config.extreme ||
      typeof config.extreme.low !== 'number' ||
      typeof config.extreme.high !== 'number'
    ) {
      throw new Error('[RSI_INDICATOR] Missing or invalid: extreme { low, high }');
    }
    if (
      !config.neutralZone ||
      typeof config.neutralZone.min !== 'number' ||
      typeof config.neutralZone.max !== 'number'
    ) {
      throw new Error('[RSI_INDICATOR] Missing or invalid: neutralZone { min, max }');
    }
    if (typeof config.maxConfidence !== 'number' || config.maxConfidence < 0 || config.maxConfidence > 100) {
      throw new Error('[RSI_INDICATOR] Missing or invalid: maxConfidence (number 0-100)');
    }

    this.enabled = config.enabled;
    this.period = config.period;
    this.oversold = config.oversold;
    this.overbought = config.overbought;
    this.extreme = config.extreme;
    this.neutralZone = config.neutralZone;
    this.maxConfidence = config.maxConfidence;
  }

  /**
   * Calculate RSI for a series of candles
   *
   * @param candles - Array of candles (must be at least period + 1 length)
   * @returns RSI value (0-100)
   * @throws {Error} If not enabled, not enough candles, or invalid input
   */
  calculate(candles: Candle[]): number {
    if (!this.enabled) {
      throw new Error('[RSI_INDICATOR] Indicator is disabled in config');
    }

    if (!Array.isArray(candles)) {
      throw new Error('[RSI_INDICATOR] Invalid candles input (must be array)');
    }

    if (candles.length < this.period + 1) {
      throw new Error(
        `[RSI_INDICATOR] Not enough candles. Need ${this.period + 1}, got ${candles.length}`,
      );
    }

    // Reset state
    this.initialized = false;

    // Calculate price changes
    const changes: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      changes.push(candles[i].close - candles[i - 1].close);
    }

    // Initial averages (simple average for first period)
    let sumGain = 0;
    let sumLoss = 0;

    for (let i = 0; i < this.period; i++) {
      if (changes[i] > 0) {
        sumGain += changes[i];
      } else {
        sumLoss += Math.abs(changes[i]);
      }
    }

    this.avgGain = sumGain / this.period;
    this.avgLoss = sumLoss / this.period;
    this.initialized = true;

    // Wilder's smoothing for remaining periods
    for (let i = this.period; i < changes.length; i++) {
      const change = changes[i];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;

      this.avgGain = (this.avgGain * (this.period - 1) + gain) / this.period;
      this.avgLoss = (this.avgLoss * (this.period - 1) + loss) / this.period;
    }

    // Calculate and return RSI
    return this.calculateRSI();
  }

  /**
   * Update RSI with a new candle (incremental calculation)
   *
   * @param previousClose - Previous candle close
   * @param currentClose - Current candle close
   * @returns Updated RSI value (0-100)
   * @throws {Error} If not initialized or invalid input
   */
  update(previousClose: number, currentClose: number): number {
    if (!this.initialized) {
      throw new Error('[RSI_INDICATOR] Not initialized. Call calculate() first.');
    }

    if (
      typeof previousClose !== 'number' ||
      isNaN(previousClose) ||
      previousClose < 0
    ) {
      throw new Error('[RSI_INDICATOR] Invalid previousClose (must be positive number)');
    }
    if (
      typeof currentClose !== 'number' ||
      isNaN(currentClose) ||
      currentClose < 0
    ) {
      throw new Error('[RSI_INDICATOR] Invalid currentClose (must be positive number)');
    }

    const change = currentClose - previousClose;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    this.avgGain = (this.avgGain * (this.period - 1) + gain) / this.period;
    this.avgLoss = (this.avgLoss * (this.period - 1) + loss) / this.period;

    return this.calculateRSI();
  }

  /**
   * Calculate RSI from current avgGain and avgLoss
   *
   * @private
   * @returns RSI value (0-100)
   */
  private calculateRSI(): number {
    // Handle zero division (no losses)
    if (this.avgLoss === 0) {
      return this.avgGain === 0 ? RSI_NEUTRAL_FALLBACK : RSI_MAX;
    }

    const rs = this.avgGain / this.avgLoss;
    const rsi = RSI_MAX - (RSI_MAX / (1 + rs));

    // Clamp to 0-100 range
    return Math.max(RSI_MIN, Math.min(RSI_MAX, rsi));
  }

  /**
   * Get current RSI value
   *
   * @returns Current RSI (0-100)
   * @throws {Error} If not initialized
   */
  getValue(): number {
    if (!this.initialized) {
      throw new Error('[RSI_INDICATOR] Not initialized. Call calculate() first.');
    }

    return this.calculateRSI();
  }

  /**
   * Get current state
   *
   * @returns Current RSI and internal state
   */
  getState(): {
    rsi: number;
    avgGain: number;
    avgLoss: number;
    initialized: boolean;
  } {
    return {
      rsi: this.initialized ? this.calculateRSI() : 0,
      avgGain: this.avgGain,
      avgLoss: this.avgLoss,
      initialized: this.initialized,
    };
  }

  /**
   * Check if RSI is in oversold zone
   *
   * @returns true if RSI < oversold threshold
   * @throws {Error} If not initialized
   */
  isOversold(): boolean {
    const rsi = this.getValue();
    return rsi < this.oversold;
  }

  /**
   * Check if RSI is in overbought zone
   *
   * @returns true if RSI > overbought threshold
   * @throws {Error} If not initialized
   */
  isOverbought(): boolean {
    const rsi = this.getValue();
    return rsi > this.overbought;
  }

  /**
   * Check if RSI is in extreme zone
   *
   * @returns 'LOW' if in extreme low, 'HIGH' if in extreme high, null otherwise
   * @throws {Error} If not initialized
   */
  getExtremeZone(): 'LOW' | 'HIGH' | null {
    const rsi = this.getValue();

    if (rsi <= this.extreme.low) {
      return 'LOW';
    }
    if (rsi >= this.extreme.high) {
      return 'HIGH';
    }
    return null;
  }

  /**
   * Check if RSI is in neutral zone
   *
   * @returns true if RSI is between min and max of neutral zone
   * @throws {Error} If not initialized
   */
  isInNeutralZone(): boolean {
    const rsi = this.getValue();
    return rsi >= this.neutralZone.min && rsi <= this.neutralZone.max;
  }

  /**
   * Reset indicator state
   */
  reset(): void {
    this.avgGain = 0;
    this.avgLoss = 0;
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
    oversold: number;
    overbought: number;
    extreme: { low: number; high: number };
    neutralZone: { min: number; max: number };
    maxConfidence: number;
  } {
    return {
      enabled: this.enabled,
      period: this.period,
      oversold: this.oversold,
      overbought: this.overbought,
      extreme: this.extreme,
      neutralZone: this.neutralZone,
      maxConfidence: this.maxConfidence,
    };
  }

  // ============================================================================
  // IIndicator Interface Methods
  // ============================================================================

  /**
   * Get indicator type
   */
  getType(): string {
    return IndicatorType.RSI;
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
