/**
 * Volume Indicator NEW - with ConfigNew Support
 * Measures volume trend and volume strength
 *
 * Metrics:
 * 1. Average Volume (SMA over period)
 * 2. Current Volume vs Average (ratio)
 * 3. Volume Trend (increasing/decreasing)
 * 4. Volume Strength (0-100 scale)
 *
 * Implementation: Simple Moving Average of volume
 * Returns:
 * - average: Average volume over period
 * - ratio: Current volume / average volume
 * - strength: 0-100 scale (50 = average, 100 = 2x average, 0 = no volume)
 */

import type { Candle } from '../types/core';
import type { VolumeIndicatorConfigNew } from '../types/config-new.types';
import type { IIndicator } from '../types/indicator.interface';
import { validateIndicatorConfig } from '../types/config-new.types';
import { IndicatorType } from '../types/indicator-type.enum';

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_CANDLES_FOR_VOLUME = 1; // Need at least 1 candle
const MIN_VOLUME_VALUE = 0.00001; // Minimum volume threshold to avoid division by zero

// ============================================================================
// VOLUME CALCULATOR - NEW VERSION
// ============================================================================

export class VolumeIndicatorNew implements IIndicator {
  private readonly enabled: boolean;
  private readonly period: number;

  private volumes: number[] = [];
  private average: number = 0;
  private initialized: boolean = false;

  /**
   * Constructor with ConfigNew
   * STRICT - Throws if config is invalid
   */
  constructor(config: VolumeIndicatorConfigNew) {
    // Validate config
    validateIndicatorConfig('VOLUME_INDICATOR', config);

    if (typeof config.period !== 'number' || config.period < 1) {
      throw new Error('[VOLUME_INDICATOR] Missing or invalid: period (number >= 1)');
    }

    this.enabled = config.enabled;
    this.period = config.period;
  }

  /**
   * Calculate volume for a series of candles
   *
   * @param candles - Array of candles (must be at least period length)
   * @returns Object with average, ratio, and strength
   * @throws {Error} If not enabled, not enough candles, or invalid input
   */
  calculate(candles: Candle[]): {
    average: number;
    ratio: number;
    strength: number;
  } {
    if (!this.enabled) {
      throw new Error('[VOLUME_INDICATOR] Indicator is disabled in config');
    }

    if (!Array.isArray(candles)) {
      throw new Error('[VOLUME_INDICATOR] Invalid candles input (must be array)');
    }

    if (candles.length < this.period) {
      throw new Error(
        `[VOLUME_INDICATOR] Not enough candles. Need ${this.period}, got ${candles.length}`,
      );
    }

    // Extract volumes from candles
    this.volumes = [];
    for (let i = 0; i < candles.length; i++) {
      if (!candles[i] || typeof candles[i].volume !== 'number' || candles[i].volume < 0) {
        throw new Error(
          `[VOLUME_INDICATOR] Invalid volume at candle ${i}: ${candles[i]?.volume}`,
        );
      }
      this.volumes.push(candles[i].volume);
    }

    // Calculate average volume over period
    let sumVolume = 0;
    for (let i = this.volumes.length - this.period; i < this.volumes.length; i++) {
      sumVolume += this.volumes[i];
    }
    this.average = sumVolume / this.period;
    this.initialized = true;

    // Calculate current ratio and strength
    const currentVolume = this.volumes[this.volumes.length - 1];
    const ratio = this.average > MIN_VOLUME_VALUE ? currentVolume / this.average : 1;
    const strength = Math.min(100, Math.max(0, ratio * 50)); // 0-100 scale

    return {
      average: this.average,
      ratio,
      strength,
    };
  }

  /**
   * Update volume with new candle (incremental calculation)
   *
   * @param newCandle - Current candle
   * @returns Updated volume metrics
   * @throws {Error} If not initialized or invalid input
   */
  update(newCandle: Candle): {
    average: number;
    ratio: number;
    strength: number;
  } {
    if (!this.initialized) {
      throw new Error('[VOLUME_INDICATOR] Not initialized. Call calculate() first.');
    }

    if (!newCandle || typeof newCandle.volume !== 'number' || newCandle.volume < 0) {
      throw new Error('[VOLUME_INDICATOR] Invalid newCandle (missing or invalid volume)');
    }

    // Add new volume
    this.volumes.push(newCandle.volume);

    // Keep only last period candles for rolling average
    if (this.volumes.length > this.period) {
      this.volumes.shift();
    }

    // Recalculate average
    let sumVolume = 0;
    for (let i = 0; i < this.volumes.length; i++) {
      sumVolume += this.volumes[i];
    }
    this.average = sumVolume / this.volumes.length;

    // Calculate current ratio and strength
    const currentVolume = this.volumes[this.volumes.length - 1];
    const ratio = this.average > MIN_VOLUME_VALUE ? currentVolume / this.average : 1;
    const strength = Math.min(100, Math.max(0, ratio * 50)); // 0-100 scale

    return {
      average: this.average,
      ratio,
      strength,
    };
  }

  /**
   * Get current volume metrics
   *
   * @returns Current average, ratio, strength
   * @throws {Error} If not initialized
   */
  getValue(): {
    average: number;
    ratio: number;
    strength: number;
  } {
    if (!this.initialized) {
      throw new Error('[VOLUME_INDICATOR] Not initialized. Call calculate() first.');
    }

    const currentVolume = this.volumes[this.volumes.length - 1];
    const ratio = this.average > MIN_VOLUME_VALUE ? currentVolume / this.average : 1;
    const strength = Math.min(100, Math.max(0, ratio * 50));

    return {
      average: this.average,
      ratio,
      strength,
    };
  }

  /**
   * Check if volume is above average
   *
   * @param threshold - Multiplier threshold (default 1.0 = equal to average)
   * @returns true if current volume > average * threshold
   * @throws {Error} If not initialized
   */
  isAboveAverage(threshold: number = 1.0): boolean {
    const metrics = this.getValue();
    return metrics.ratio > threshold;
  }

  /**
   * Check if volume is below average
   *
   * @param threshold - Multiplier threshold (default 1.0 = equal to average)
   * @returns true if current volume < average * threshold
   * @throws {Error} If not initialized
   */
  isBelowAverage(threshold: number = 1.0): boolean {
    const metrics = this.getValue();
    return metrics.ratio < threshold;
  }

  /**
   * Get volume strength classification
   *
   * @returns 'very_low' | 'low' | 'normal' | 'high' | 'very_high'
   * @throws {Error} If not initialized
   */
  getClassification(): 'very_low' | 'low' | 'normal' | 'high' | 'very_high' {
    const metrics = this.getValue();
    const ratio = metrics.ratio;

    if (ratio < 0.3) return 'very_low';
    if (ratio < 0.7) return 'low';
    if (ratio < 1.3) return 'normal';
    if (ratio < 2.0) return 'high';
    return 'very_high';
  }

  /**
   * Get volume trend (increasing or decreasing)
   *
   * @returns 'increasing' | 'decreasing' | 'stable'
   * @throws {Error} If not initialized or not enough data
   */
  getTrend(): 'increasing' | 'decreasing' | 'stable' {
    if (!this.initialized) {
      throw new Error('[VOLUME_INDICATOR] Not initialized. Call calculate() first.');
    }

    if (this.volumes.length < 2) {
      throw new Error('[VOLUME_INDICATOR] Not enough data for trend analysis');
    }

    const current = this.volumes[this.volumes.length - 1];
    const previous = this.volumes[this.volumes.length - 2];

    const changePercent = ((current - previous) / previous) * 100;

    if (changePercent > 10) return 'increasing';
    if (changePercent < -10) return 'decreasing';
    return 'stable';
  }

  /**
   * Get current state
   *
   * @returns Current volume indicator state
   */
  getState(): {
    average: number;
    initialized: boolean;
    volumeCount: number;
  } {
    return {
      average: this.average,
      initialized: this.initialized,
      volumeCount: this.volumes.length,
    };
  }

  /**
   * Reset indicator state
   */
  reset(): void {
    this.volumes = [];
    this.average = 0;
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
  } {
    return {
      enabled: this.enabled,
      period: this.period,
    };
  }

  // ============================================================================
  // IIndicator Interface Methods
  // ============================================================================

  /**
   * Get indicator type
   */
  getType(): string {
    return IndicatorType.VOLUME;
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
    return this.period;
  }
}
