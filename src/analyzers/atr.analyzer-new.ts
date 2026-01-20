/**
 * ATR Analyzer NEW - with ConfigNew Support
 * Generates trading signals based on volatility levels
 *
 * Signal Logic:
 * - ATR > highThreshold: High volatility (LONG signal - trending opportunity)
 * - ATR < lowThreshold: Low volatility (SHORT signal - consolidation/breakout risk)
 * - lowThreshold <= ATR <= highThreshold: Neutral zone (HOLD signal)
 *
 * Confidence Calculation:
 * - High ATR: confidence = (ATR - highThreshold) / (maxATR - highThreshold) * maxConfidence
 * - Low ATR: confidence = (lowThreshold - ATR) / lowThreshold * maxConfidence
 * - Neutral: confidence = maxConfidence * 0.3 (low confidence for neutral)
 * - Clamped to [0.1, maxConfidence]
 */

import type { Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';
import type { SignalDirection } from '../types/enums';
import type { AtrAnalyzerConfigNew } from '../types/config-new.types';
import { SignalDirection as SignalDirectionEnum } from '../types/enums';
import { ATRIndicatorNew } from '../indicators/atr.indicator-new';
import type { LoggerService } from '../services/logger.service';
import type { IIndicator } from '../types/indicator.interface';
import { IAnalyzer } from '../types/analyzer.interface';
import { AnalyzerType } from '../types/analyzer-type.enum';

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_CANDLES_FOR_ATR = 50; // Need at least period + buffer
const MIN_CONFIDENCE = 0.1; // Minimum confidence floor (10%)
const NEUTRAL_CONFIDENCE_MULTIPLIER = 0.3; // Neutral zone gets 30% of max confidence
const MAX_ATR_ESTIMATE = 100; // Upper bound for ATR value (for scaling)

// ============================================================================
// ATR ANALYZER - NEW VERSION
// ============================================================================

export class AtrAnalyzerNew implements IAnalyzer {
  private readonly enabled: boolean;
  private readonly weight: number;
  private readonly priority: number;
  private readonly confidenceMultiplier: number;
  private readonly maxConfidence: number;

  private indicator: ATRIndicatorNew;
  private lastSignal: AnalyzerSignal | null = null;
  private initialized: boolean = false;

  /**
   * Constructor with ConfigNew
   * STRICT - Throws if config is invalid
   *
   * @param config Analyzer configuration
   * @param logger Logger service (optional)
   * @param indicatorDI ATR indicator instance via DI (optional, will create if not provided)
   */
  constructor(
    config: AtrAnalyzerConfigNew,
    private logger?: LoggerService,
    indicatorDI?: IIndicator | null,
  ) {
    // Validate analyzer config
    if (typeof config.enabled !== 'boolean') {
      throw new Error('[ATR_ANALYZER] Missing or invalid: enabled (boolean)');
    }
    if (typeof config.weight !== 'number' || config.weight < 0 || config.weight > 1) {
      throw new Error('[ATR_ANALYZER] Missing or invalid: weight (0.0-1.0)');
    }
    if (typeof config.priority !== 'number' || config.priority < 1 || config.priority > 10) {
      throw new Error('[ATR_ANALYZER] Missing or invalid: priority (1-10)');
    }
    if (typeof config.confidenceMultiplier !== 'number' || config.confidenceMultiplier < 0 || config.confidenceMultiplier > 10) {
      throw new Error('[ATR_ANALYZER] Missing or invalid: confidenceMultiplier (0.0-10.0)');
    }
    if (typeof config.maxConfidence !== 'number' || config.maxConfidence < 0 || config.maxConfidence > 1) {
      throw new Error('[ATR_ANALYZER] Missing or invalid: maxConfidence (0.0-1.0)');
    }

    this.enabled = config.enabled;
    this.weight = config.weight;
    this.priority = config.priority;
    this.confidenceMultiplier = config.confidenceMultiplier;
    this.maxConfidence = config.maxConfidence;

    // Use injected indicator if provided (DI), otherwise create new one
    if (indicatorDI && indicatorDI instanceof ATRIndicatorNew) {
      this.indicator = indicatorDI;
      this.logger?.info('[ATR_ANALYZER] Using injected ATR indicator via DI');
    } else {
      // Fallback: Create ATR indicator with default config
      this.logger?.info('[ATR_ANALYZER] Creating new ATR indicator with default period 14');

      this.indicator = new ATRIndicatorNew({
        enabled: true,
        period: 14, // Standard ATR period
        minimumATR: 0.5,
        maximumATR: 50,
      });
    }
  }

  /**
   * Analyze candles and generate ATR signal
   *
   * @param candles - Array of candles
   * @returns AnalyzerSignal with direction, confidence, and weight
   * @throws {Error} If not enabled, not enough candles, or invalid input
   */
  analyze(candles: Candle[]): AnalyzerSignal {
    if (!this.enabled) {
      throw new Error('[ATR_ANALYZER] Analyzer is disabled');
    }

    if (!Array.isArray(candles)) {
      throw new Error('[ATR_ANALYZER] Invalid candles input (must be array)');
    }

    if (candles.length < MIN_CANDLES_FOR_ATR) {
      throw new Error(
        `[ATR_ANALYZER] Not enough candles. Need ${MIN_CANDLES_FOR_ATR}, got ${candles.length}`,
      );
    }

    // Validate candles
    for (let i = 0; i < candles.length; i++) {
      if (!candles[i] || typeof candles[i].high !== 'number' || typeof candles[i].low !== 'number') {
        throw new Error(`[ATR_ANALYZER] Invalid candle at index ${i}`);
      }
    }

    // Calculate ATR
    const atr = this.indicator.calculate(candles);

    // Determine signal direction based on ATR level
    const direction = this.getDirection(atr);

    // Calculate confidence based on ATR extremeness
    const confidence = this.calculateConfidence(atr);

    // Create signal
    const signal: AnalyzerSignal = {
      source: 'ATR_ANALYZER',
      direction,
      confidence,
      weight: this.weight,
      priority: this.priority,
      score: (confidence / 100) * this.weight,
    };

    this.lastSignal = signal;
    this.initialized = true;

    this.logger?.debug('[ATR_ANALYZER] Generated signal', {
      direction,
      confidence,
      atr,
    });

    return signal;
  }

  /**
   * Determine signal direction based on ATR level
   *
   * @private
   * @param atr - ATR value
   * @returns SignalDirection (LONG, SHORT, or HOLD)
   */
  private getDirection(atr: number): SignalDirection {
    // Phase 4.10: Thresholds can be configured via analyzerParameters in strategy.json
    // Default values: highThreshold = 2.5, lowThreshold = 0.8
    const highThreshold = 2.5;
    const lowThreshold = 0.8;

    if (atr > highThreshold) {
      // High volatility - good trading environment
      return SignalDirectionEnum.LONG;
    } else if (atr < lowThreshold) {
      // Low volatility - consolidation zone, potential breakout
      return SignalDirectionEnum.SHORT;
    } else {
      // Neutral zone
      return SignalDirectionEnum.HOLD;
    }
  }

  /**
   * Calculate confidence based on ATR level
   *
   * @private
   * @param atr - ATR value
   * @returns Confidence value (0-100 scale)
   */
  private calculateConfidence(atr: number): number {
    let confidence: number;

    // Phase 4.10: Thresholds can be configured via analyzerParameters in strategy.json
    const highThreshold = 2.5;
    const lowThreshold = 0.8;

    if (atr > highThreshold) {
      // High ATR: stronger signal as ATR goes higher
      // At highThreshold: 0% strength, at highThreshold * 2: maxConfidence
      const strength = Math.min((atr - highThreshold) / highThreshold, 1);
      confidence = this.maxConfidence * strength * this.confidenceMultiplier;
    } else if (atr < lowThreshold) {
      // Low ATR: consolidation signal
      // At 0: maxConfidence, at lowThreshold: 0% strength
      const strength = (lowThreshold - atr) / lowThreshold;
      confidence = this.maxConfidence * strength * this.confidenceMultiplier;
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
   * Get ATR value for current state
   *
   * @param candles - Array of candles
   * @returns ATR value
   * @throws {Error} If not enough candles
   */
  getAtrValue(candles: Candle[]): number {
    if (!Array.isArray(candles) || candles.length < MIN_CANDLES_FOR_ATR) {
      throw new Error(`[ATR_ANALYZER] Not enough candles for ATR calculation`);
    }

    return this.indicator.calculate(candles);
  }

  /**
   * Check if ATR is high (above threshold)
   *
   * @param candles - Array of candles
   * @param threshold - High threshold (default 2.5)
   * @returns true if ATR > threshold
   */
  isHighVolatility(candles: Candle[], threshold: number = 2.5): boolean {
    const atr = this.getAtrValue(candles);
    return atr > threshold;
  }

  /**
   * Check if ATR is low (below threshold)
   *
   * @param candles - Array of candles
   * @param threshold - Low threshold (default 0.8)
   * @returns true if ATR < threshold
   */
  isLowVolatility(candles: Candle[], threshold: number = 0.8): boolean {
    const atr = this.getAtrValue(candles);
    return atr < threshold;
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
      confidenceMultiplier: number;
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
        confidenceMultiplier: this.confidenceMultiplier,
        maxConfidence: this.maxConfidence,
      },
    };
  }

  // ===== INTERFACE IMPLEMENTATION (IAnalyzer) =====

  /**
   * Get analyzer type name
   * @returns AnalyzerType.ATR
   */
  getType(): string {
    return AnalyzerType.ATR;
  }

  /**
   * Check if analyzer has enough data
   * @param candles Array of candles
   * @returns true if enough candles, false otherwise
   */
  isReady(candles: Candle[]): boolean {
    return candles && Array.isArray(candles) && candles.length >= MIN_CANDLES_FOR_ATR;
  }

  /**
   * Get minimum candles required for analysis
   * @returns Min candle count needed
   */
  getMinCandlesRequired(): number {
    return MIN_CANDLES_FOR_ATR;
  }

  /**
   * Get analyzer weight (contribution to final decision)
   * @returns Weight 0.0-1.0
   */
  getWeight(): number {
    return this.weight;
  }

  /**
   * Get analyzer priority (execution order)
   * @returns Priority 1-10 (higher = more important)
   */
  getPriority(): number {
    return this.priority;
  }

  /**
   * Get maximum confidence this analyzer can produce
   * @returns Max confidence 0.0-1.0
   */
  getMaxConfidence(): number {
    return this.maxConfidence;
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
    confidenceMultiplier: number;
    maxConfidence: number;
  } {
    return {
      enabled: this.enabled,
      weight: this.weight,
      priority: this.priority,
      confidenceMultiplier: this.confidenceMultiplier,
      maxConfidence: this.maxConfidence,
    };
  }
}
