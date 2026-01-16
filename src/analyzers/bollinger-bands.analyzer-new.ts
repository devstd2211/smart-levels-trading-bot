/**
 * Bollinger Bands Analyzer NEW - with ConfigNew Support
 * Generates trading signals based on Bollinger Bands and price position
 *
 * Signal Logic (based on %B value and bandwidth):
 * - %B < 20 (near lower band) + Expanding bands: LONG signal (oversold bounce potential)
 * - %B > 80 (near upper band) + Expanding bands: SHORT signal (overbought reversal potential)
 * - 20 <= %B <= 80: HOLD signal (price in middle zone)
 * - Squeeze (%B with narrow bands): HOLD with low confidence (consolidation)
 *
 * Confidence Calculation:
 * - Based on distance of %B from boundaries (0/100)
 * - Stronger signals when price is near bands AND bands are expanding
 * - Weaker signals when bands are squeezed (low volatility)
 */

import type { Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';
import type { SignalDirection } from '../types/enums';
import type { BollingerBandsAnalyzerConfigNew } from '../types/config-new.types';
import { SignalDirection as SignalDirectionEnum } from '../types/enums';
import { BollingerBandsIndicatorNew } from '../indicators/bollinger-bands.indicator-new';
import type { LoggerService } from '../services/logger.service';
import type { IIndicator } from '../types/indicator.interface';

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_CANDLES_FOR_BOLLINGER_BANDS = 25; // Need at least period (20) + some history
const MIN_CONFIDENCE = 0.1; // Minimum confidence floor (10%)
const OVERSOLD_THRESHOLD = 20; // %B < 20 = near lower band
const OVERBOUGHT_THRESHOLD = 80; // %B > 80 = near upper band
const NEUTRAL_LOWER = 40; // %B range for neutral zone
const NEUTRAL_UPPER = 60;
const SQUEEZE_THRESHOLD = 5; // Bandwidth < 5% = squeezing

// ============================================================================
// BOLLINGER BANDS ANALYZER - NEW VERSION
// ============================================================================

export class BollingerBandsAnalyzerNew {
  private readonly enabled: boolean;
  private readonly weight: number;
  private readonly priority: number;
  private readonly period: number;
  private readonly stdDev: number;

  private indicator: BollingerBandsIndicatorNew;
  private lastSignal: AnalyzerSignal | null = null;
  private lastBandwidth: number = 0;
  private initialized: boolean = false;

  /**
   * Constructor with ConfigNew
   * STRICT - Throws if config is invalid
   *
   * @param config Analyzer configuration
   * @param logger Logger service (optional)
   * @param indicatorDI Bollinger Bands indicator instance via DI (optional, will create if not provided)
   */
  constructor(
    config: BollingerBandsAnalyzerConfigNew,
    private logger?: LoggerService,
    indicatorDI?: IIndicator | null,
  ) {
    // Validate analyzer config
    if (typeof config.enabled !== 'boolean') {
      throw new Error('[BOLLINGER_BANDS_ANALYZER] Missing or invalid: enabled (boolean)');
    }
    if (typeof config.weight !== 'number' || config.weight < 0 || config.weight > 1) {
      throw new Error('[BOLLINGER_BANDS_ANALYZER] Missing or invalid: weight (0.0-1.0)');
    }
    if (typeof config.priority !== 'number' || config.priority < 1 || config.priority > 10) {
      throw new Error('[BOLLINGER_BANDS_ANALYZER] Missing or invalid: priority (1-10)');
    }
    if (typeof config.period !== 'number' || config.period < 1 || config.period > 100) {
      throw new Error('[BOLLINGER_BANDS_ANALYZER] Missing or invalid: period (1-100)');
    }
    if (typeof config.stdDev !== 'number' || config.stdDev < 0.1 || config.stdDev > 10) {
      throw new Error('[BOLLINGER_BANDS_ANALYZER] Missing or invalid: stdDev (0.1-10)');
    }

    this.enabled = config.enabled;
    this.weight = config.weight;
    this.priority = config.priority;
    this.period = config.period;
    this.stdDev = config.stdDev;

    // Use injected indicator if provided (DI), otherwise create new one
    if (indicatorDI && indicatorDI instanceof BollingerBandsIndicatorNew) {
      this.indicator = indicatorDI;
      this.logger?.info('[BOLLINGER_BANDS_ANALYZER] Using injected Bollinger Bands indicator via DI');
    } else {
      // Fallback: Create Bollinger Bands indicator with configured parameters
      this.logger?.info('[BOLLINGER_BANDS_ANALYZER] Creating new Bollinger Bands indicator', {
        period: this.period,
        stdDev: this.stdDev,
      });

      this.indicator = new BollingerBandsIndicatorNew({
        enabled: true,
        period: this.period,
        stdDev: this.stdDev,
      });
    }
  }

  /**
   * Analyze candles and generate Bollinger Bands signal
   *
   * @param candles - Array of candles
   * @returns AnalyzerSignal with direction, confidence, and weight
   * @throws {Error} If not enabled, not enough candles, or invalid input
   */
  analyze(candles: Candle[]): AnalyzerSignal {
    if (!this.enabled) {
      throw new Error('[BOLLINGER_BANDS_ANALYZER] Analyzer is disabled');
    }

    if (!Array.isArray(candles)) {
      throw new Error('[BOLLINGER_BANDS_ANALYZER] Invalid candles input (must be array)');
    }

    if (candles.length < MIN_CANDLES_FOR_BOLLINGER_BANDS) {
      throw new Error(
        `[BOLLINGER_BANDS_ANALYZER] Not enough candles. Need ${MIN_CANDLES_FOR_BOLLINGER_BANDS}, got ${candles.length}`,
      );
    }

    // Validate candles
    for (let i = 0; i < candles.length; i++) {
      if (!candles[i] || typeof candles[i].close !== 'number') {
        throw new Error(`[BOLLINGER_BANDS_ANALYZER] Invalid candle at index ${i}`);
      }
    }

    // Calculate Bollinger Bands
    const bbValues = this.indicator.calculate(candles);

    // Determine signal direction based on %B and bandwidth
    const direction = this.getDirection(bbValues.percentB, bbValues.bandwidth);

    // Calculate confidence based on price position and volatility
    const confidence = this.calculateConfidence(bbValues.percentB, bbValues.bandwidth);

    // Create signal
    const signal: AnalyzerSignal = {
      source: 'BOLLINGER_BANDS_ANALYZER',
      direction,
      confidence,
      weight: this.weight,
      priority: this.priority,
      score: (confidence / 100) * this.weight,
    };

    this.lastSignal = signal;
    this.lastBandwidth = bbValues.bandwidth;
    this.initialized = true;

    this.logger?.debug('[BOLLINGER_BANDS_ANALYZER] Generated signal', {
      direction,
      confidence,
      percentB: bbValues.percentB,
      bandwidth: bbValues.bandwidth,
    });

    return signal;
  }

  /**
   * Determine signal direction based on %B and bandwidth
   *
   * @private
   * @param percentB - %B value (0-100 scale)
   * @param bandwidth - Bandwidth percentage
   * @returns SignalDirection (LONG, SHORT, or HOLD)
   */
  private getDirection(percentB: number, bandwidth: number): SignalDirection {
    // Oversold with expanding bands: LONG signal
    if (percentB < OVERSOLD_THRESHOLD && bandwidth > SQUEEZE_THRESHOLD) {
      return SignalDirectionEnum.LONG;
    }
    // Overbought with expanding bands: SHORT signal
    else if (percentB > OVERBOUGHT_THRESHOLD && bandwidth > SQUEEZE_THRESHOLD) {
      return SignalDirectionEnum.SHORT;
    }
    // Middle zone: HOLD
    else {
      return SignalDirectionEnum.HOLD;
    }
  }

  /**
   * Calculate confidence based on %B position and bandwidth
   *
   * @private
   * @param percentB - %B value (0-100 scale)
   * @param bandwidth - Bandwidth percentage
   * @returns Confidence value (0-100 scale)
   */
  private calculateConfidence(percentB: number, bandwidth: number): number {
    const MAX_CONFIDENCE = 0.95;
    let confidence: number;

    // Distance from neutral zone (40-60)
    const distanceFromNeutral = Math.max(
      0,
      Math.min(Math.abs(percentB - NEUTRAL_LOWER), Math.abs(percentB - NEUTRAL_UPPER)),
    );

    // Normalize distance (0 = neutral, 1 = extreme)
    const normalizedDistance = Math.min(1, distanceFromNeutral / 40);

    // Bandwidth factor: Expanding = stronger signals, Squeeze = weaker
    const bandwidthFactor = Math.min(1, bandwidth / SQUEEZE_THRESHOLD);

    if (percentB < OVERSOLD_THRESHOLD) {
      // Bullish: confidence based on how oversold + bandwidth expansion
      const oversoldStrength = (OVERSOLD_THRESHOLD - percentB) / OVERSOLD_THRESHOLD;
      confidence = MAX_CONFIDENCE * oversoldStrength * bandwidthFactor;
    } else if (percentB > OVERBOUGHT_THRESHOLD) {
      // Bearish: confidence based on how overbought + bandwidth expansion
      const overboughtStrength = (percentB - OVERBOUGHT_THRESHOLD) / (100 - OVERBOUGHT_THRESHOLD);
      confidence = MAX_CONFIDENCE * overboughtStrength * bandwidthFactor;
    } else if (percentB > NEUTRAL_LOWER && percentB < NEUTRAL_UPPER) {
      // Neutral zone: low confidence
      confidence = MAX_CONFIDENCE * 0.2 * bandwidthFactor;
    } else {
      // Low/High zone but not extreme: moderate confidence
      confidence = MAX_CONFIDENCE * 0.4 * bandwidthFactor;
    }

    // Clamp to configured bounds
    confidence = Math.max(MIN_CONFIDENCE, Math.min(MAX_CONFIDENCE, confidence));

    // Convert to 0-100 scale
    return Math.round(confidence * 100);
  }

  /**
   * Get Bollinger Bands values for current state
   *
   * @param candles - Array of candles
   * @returns { upper, middle, lower, percentB, bandwidth }
   * @throws {Error} If not enough candles
   */
  getBollingerBandsValues(candles: Candle[]): {
    upper: number;
    middle: number;
    lower: number;
    percentB: number;
    bandwidth: number;
  } {
    if (!Array.isArray(candles) || candles.length < MIN_CANDLES_FOR_BOLLINGER_BANDS) {
      throw new Error(
        `[BOLLINGER_BANDS_ANALYZER] Not enough candles for Bollinger Bands calculation`,
      );
    }

    return this.indicator.calculate(candles);
  }

  /**
   * Check if price is near upper band (overbought)
   *
   * @param candles - Array of candles
   * @param threshold - %B threshold for overbought (default 80)
   * @returns true if %B > threshold
   */
  isOverbought(candles: Candle[], threshold: number = OVERBOUGHT_THRESHOLD): boolean {
    const values = this.getBollingerBandsValues(candles);
    return values.percentB > threshold;
  }

  /**
   * Check if price is near lower band (oversold)
   *
   * @param candles - Array of candles
   * @param threshold - %B threshold for oversold (default 20)
   * @returns true if %B < threshold
   */
  isOversold(candles: Candle[], threshold: number = OVERSOLD_THRESHOLD): boolean {
    const values = this.getBollingerBandsValues(candles);
    return values.percentB < threshold;
  }

  /**
   * Check if bands are squeezed (low volatility)
   *
   * @param candles - Array of candles
   * @param threshold - Bandwidth threshold for squeeze (default 5%)
   * @returns true if bandwidth < threshold
   */
  isSqueezing(candles: Candle[], threshold: number = SQUEEZE_THRESHOLD): boolean {
    const values = this.getBollingerBandsValues(candles);
    return values.bandwidth < threshold;
  }

  /**
   * Check if bands are expanding (high volatility)
   *
   * @param candles - Array of candles
   * @param threshold - Bandwidth threshold for expansion (default 10%)
   * @returns true if bandwidth > threshold
   */
  isExpanding(candles: Candle[], threshold: number = 10): boolean {
    const values = this.getBollingerBandsValues(candles);
    return values.bandwidth > threshold;
  }

  /**
   * Get volatility classification
   *
   * @param candles - Array of candles
   * @returns Volatility classification
   */
  getVolatilityClass(
    candles: Candle[],
  ): 'very_low' | 'low' | 'normal' | 'high' | 'very_high' {
    const values = this.getBollingerBandsValues(candles);
    const bw = values.bandwidth;

    if (bw < 3) return 'very_low';
    if (bw < 6) return 'low';
    if (bw < 10) return 'normal';
    if (bw < 15) return 'high';
    return 'very_high';
  }

  /**
   * Get last generated signal
   *
   * @returns Last AnalyzerSignal or null if not initialized
   */
  getLastSignal(): AnalyzerSignal | null {
    return this.lastSignal;
  }

  /**
   * Get analyzer state
   *
   * @returns Current analyzer state
   */
  getState(): {
    enabled: boolean;
    initialized: boolean;
    lastSignal: AnalyzerSignal | null;
    config: {
      weight: number;
      priority: number;
      period: number;
      stdDev: number;
    };
  } {
    return {
      enabled: this.enabled,
      initialized: this.initialized,
      lastSignal: this.lastSignal,
      config: {
        weight: this.weight,
        priority: this.priority,
        period: this.period,
        stdDev: this.stdDev,
      },
    };
  }

  /**
   * Reset analyzer state
   */
  reset(): void {
    this.indicator.reset();
    this.lastSignal = null;
    this.lastBandwidth = 0;
    this.initialized = false;
  }

  /**
   * Check if analyzer is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get config values
   */
  getConfig(): {
    enabled: boolean;
    weight: number;
    priority: number;
    period: number;
    stdDev: number;
  } {
    return {
      enabled: this.enabled,
      weight: this.weight,
      priority: this.priority,
      period: this.period,
      stdDev: this.stdDev,
    };
  }
}
