/**
 * RSI Analyzer NEW - with ConfigNew Support
 * Generates trading signals based on RSI overbought/oversold conditions
 *
 * Signal Logic:
 * - RSI < oversold: Oversold (LONG signal - buy opportunity)
 * - RSI > overbought: Overbought (SHORT signal - sell opportunity)
 * - oversold-overbought: Neutral zone (HOLD signal)
 *
 * Confidence Calculation:
 * - Oversold: confidence = (oversold - RSI) / oversold * maxConfidence
 * - Overbought: confidence = (RSI - overbought) / (100 - overbought) * maxConfidence
 * - Neutral: confidence = maxConfidence * 0.3 (low confidence for neutral)
 * - Clamped to [0.1, maxConfidence]
 */

import type { Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';
import type { SignalDirection } from '../types/enums';
import type { RsiAnalyzerConfigNew } from '../types/config-new.types';
import { SignalDirection as SignalDirectionEnum } from '../types/enums';
import { RSIIndicatorNew } from '../indicators/rsi.indicator-new';
import type { LoggerService } from '../services/logger.service';
import type { IIndicator } from '../types/indicator.interface';

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_CANDLES_FOR_RSI = 50; // Need at least period + buffer
const MIN_CONFIDENCE = 0.1; // Minimum confidence floor (10%)
const NEUTRAL_CONFIDENCE_MULTIPLIER = 0.3; // Neutral zone gets 30% of max confidence

// ============================================================================
// RSI ANALYZER - NEW VERSION
// ============================================================================

export class RsiAnalyzerNew {
  private readonly enabled: boolean;
  private readonly weight: number;
  private readonly priority: number;
  private readonly period: number;
  private readonly oversold: number;
  private readonly overbought: number;
  private readonly maxConfidence: number;

  private indicator: RSIIndicatorNew;
  private lastSignal: AnalyzerSignal | null = null;
  private initialized: boolean = false;

  /**
   * Constructor with ConfigNew
   * STRICT - Throws if config is invalid
   *
   * @param config Analyzer configuration
   * @param logger Logger service (optional)
   * @param indicatorDI RSI indicator instance via DI (optional, will create if not provided)
   */
  constructor(
    config: RsiAnalyzerConfigNew,
    private logger?: LoggerService,
    indicatorDI?: IIndicator | null,
  ) {
    // Validate analyzer config
    if (typeof config.enabled !== 'boolean') {
      throw new Error('[RSI_ANALYZER] Missing or invalid: enabled (boolean)');
    }
    if (typeof config.weight !== 'number' || config.weight < 0 || config.weight > 1) {
      throw new Error('[RSI_ANALYZER] Missing or invalid: weight (0.0-1.0)');
    }
    if (typeof config.priority !== 'number' || config.priority < 1 || config.priority > 10) {
      throw new Error('[RSI_ANALYZER] Missing or invalid: priority (1-10)');
    }
    if (typeof config.period !== 'number' || config.period < 1 || config.period > 100) {
      throw new Error('[RSI_ANALYZER] Missing or invalid: period (1-100)');
    }
    if (typeof config.oversold !== 'number' || config.oversold < 0 || config.oversold > 50) {
      throw new Error('[RSI_ANALYZER] Missing or invalid: oversold (0-50)');
    }
    if (typeof config.overbought !== 'number' || config.overbought < 50 || config.overbought > 100) {
      throw new Error('[RSI_ANALYZER] Missing or invalid: overbought (50-100)');
    }
    if (config.oversold >= config.overbought) {
      throw new Error('[RSI_ANALYZER] oversold must be less than overbought');
    }
    if (typeof config.maxConfidence !== 'number' || config.maxConfidence < 0 || config.maxConfidence > 1) {
      throw new Error('[RSI_ANALYZER] Missing or invalid: maxConfidence (0.0-1.0)');
    }

    this.enabled = config.enabled;
    this.weight = config.weight;
    this.priority = config.priority;
    this.period = config.period;
    this.oversold = config.oversold;
    this.overbought = config.overbought;
    this.maxConfidence = config.maxConfidence;

    // Use injected indicator if provided (DI), otherwise create new one
    if (indicatorDI && indicatorDI instanceof RSIIndicatorNew) {
      this.indicator = indicatorDI;
      this.logger?.info('[RSI_ANALYZER] Using injected RSI indicator via DI');
    } else {
      // Fallback: Create RSI indicator with configured parameters
      this.logger?.info('[RSI_ANALYZER] Creating new RSI indicator with period', {
        period: this.period,
      });

      this.indicator = new RSIIndicatorNew({
        enabled: true,
        period: this.period,
        oversold: this.oversold,
        overbought: this.overbought,
        extreme: {
          low: 10,
          high: 90,
        },
        neutralZone: {
          min: this.oversold,
          max: this.overbought,
        },
        maxConfidence: this.maxConfidence,
      });
    }
  }

  /**
   * Analyze candles and generate RSI signal
   *
   * @param candles - Array of candles
   * @returns AnalyzerSignal with direction, confidence, and weight
   * @throws {Error} If not enabled, not enough candles, or invalid input
   */
  analyze(candles: Candle[]): AnalyzerSignal {
    if (!this.enabled) {
      throw new Error('[RSI_ANALYZER] Analyzer is disabled');
    }

    if (!Array.isArray(candles)) {
      throw new Error('[RSI_ANALYZER] Invalid candles input (must be array)');
    }

    if (candles.length < MIN_CANDLES_FOR_RSI) {
      throw new Error(
        `[RSI_ANALYZER] Not enough candles. Need ${MIN_CANDLES_FOR_RSI}, got ${candles.length}`,
      );
    }

    // Validate candles
    for (let i = 0; i < candles.length; i++) {
      if (!candles[i] || typeof candles[i].close !== 'number') {
        throw new Error(`[RSI_ANALYZER] Invalid candle at index ${i}`);
      }
    }

    // Calculate RSI
    const rsi = this.indicator.calculate(candles);

    // Determine signal direction
    const direction = this.getDirection(rsi);

    // Calculate confidence
    const confidence = this.calculateConfidence(rsi);

    // Create signal
    const signal: AnalyzerSignal = {
      source: 'RSI_ANALYZER',
      direction,
      confidence,
      weight: this.weight,
      priority: this.priority,
      score: (confidence / 100) * this.weight,
    };

    this.lastSignal = signal;
    this.initialized = true;

    this.logger?.debug('[RSI_ANALYZER] Generated signal', {
      direction,
      confidence,
      rsi,
    });

    return signal;
  }

  /**
   * Determine signal direction based on RSI level
   *
   * @private
   * @param rsi - RSI value (0-100)
   * @returns SignalDirection (LONG, SHORT, or HOLD)
   */
  private getDirection(rsi: number): SignalDirection {
    if (rsi < this.oversold) {
      // Oversold - buying opportunity
      return SignalDirectionEnum.LONG;
    } else if (rsi > this.overbought) {
      // Overbought - selling opportunity
      return SignalDirectionEnum.SHORT;
    } else {
      // Neutral zone
      return SignalDirectionEnum.HOLD;
    }
  }

  /**
   * Calculate confidence based on RSI level
   *
   * @private
   * @param rsi - RSI value (0-100)
   * @returns Confidence value (0-100 scale)
   */
  private calculateConfidence(rsi: number): number {
    let confidence: number;

    if (rsi < this.oversold) {
      // Oversold: stronger signal closer to 0
      // At RSI=0: maxConfidence, at RSI=oversold: 0% strength
      const oversoldStrength = (this.oversold - rsi) / this.oversold;
      confidence = this.maxConfidence * oversoldStrength;
    } else if (rsi > this.overbought) {
      // Overbought: stronger signal closer to 100
      // At RSI=overbought: 0% strength, at RSI=100: maxConfidence
      const overboughtStrength = (rsi - this.overbought) / (100 - this.overbought);
      confidence = this.maxConfidence * overboughtStrength;
    } else {
      // Neutral zone: lower confidence
      confidence = this.maxConfidence * NEUTRAL_CONFIDENCE_MULTIPLIER;
    }

    // Clamp to configured bounds
    confidence = Math.max(MIN_CONFIDENCE, Math.min(this.maxConfidence, confidence));

    // Convert to 0-100 scale
    return Math.round(confidence * 100);
  }

  /**
   * Get RSI value for current state
   *
   * @param candles - Array of candles
   * @returns RSI value (0-100)
   * @throws {Error} If not enough candles
   */
  getRsiValue(candles: Candle[]): number {
    if (!Array.isArray(candles) || candles.length < MIN_CANDLES_FOR_RSI) {
      throw new Error(`[RSI_ANALYZER] Not enough candles for RSI calculation`);
    }

    return this.indicator.calculate(candles);
  }

  /**
   * Check if RSI is oversold
   *
   * @param candles - Array of candles
   * @param threshold - Oversold threshold (default from config)
   * @returns true if RSI < threshold
   */
  isOversold(candles: Candle[], threshold?: number): boolean {
    const rsi = this.getRsiValue(candles);
    const thresholdToUse = threshold ?? this.oversold;
    return rsi < thresholdToUse;
  }

  /**
   * Check if RSI is overbought
   *
   * @param candles - Array of candles
   * @param threshold - Overbought threshold (default from config)
   * @returns true if RSI > threshold
   */
  isOverbought(candles: Candle[], threshold?: number): boolean {
    const rsi = this.getRsiValue(candles);
    const thresholdToUse = threshold ?? this.overbought;
    return rsi > thresholdToUse;
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
      oversold: number;
      overbought: number;
      maxConfidence: number;
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
        oversold: this.oversold,
        overbought: this.overbought,
        maxConfidence: this.maxConfidence,
      },
    };
  }

  /**
   * Reset analyzer state
   */
  reset(): void {
    this.indicator.reset();
    this.lastSignal = null;
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
    oversold: number;
    overbought: number;
    maxConfidence: number;
  } {
    return {
      enabled: this.enabled,
      weight: this.weight,
      priority: this.priority,
      period: this.period,
      oversold: this.oversold,
      overbought: this.overbought,
      maxConfidence: this.maxConfidence,
    };
  }
}
