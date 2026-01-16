/**
 * Volume Analyzer NEW - with ConfigNew Support
 * Generates trading signals based on volume strength
 *
 * Signal Logic (strength is 0-100 scale):
 * - Volume strength > 65: High volume confirms trend (LONG signal)
 * - Volume strength < 35: Low volume, no confirmation (SHORT signal)
 * - 35 <= strength <= 65: Neutral volume (HOLD signal)
 *
 * Confidence Calculation:
 * - High strength: confidence = (strength - 65) / 35 * maxConfidence
 * - Low strength: confidence = (65 - strength) / 65 * maxConfidence
 * - Neutral: confidence = neutralConfidence (user-configured, typically low)
 * - Clamped to [0.1, maxConfidence]
 */

import type { Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';
import type { SignalDirection } from '../types/enums';
import type { VolumeAnalyzerConfigNew } from '../types/config-new.types';
import { SignalDirection as SignalDirectionEnum } from '../types/enums';
import { VolumeIndicatorNew } from '../indicators/volume.indicator-new';
import type { LoggerService } from '../services/logger.service';
import type { IIndicator } from '../types/indicator.interface';

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_CANDLES_FOR_VOLUME = 20; // Need at least period for volume calculation
const MIN_CONFIDENCE = 0.1; // Minimum confidence floor (10%)
const HIGH_STRENGTH_THRESHOLD = 65; // 0-100 scale
const LOW_STRENGTH_THRESHOLD = 35; // 0-100 scale

// ============================================================================
// VOLUME ANALYZER - NEW VERSION
// ============================================================================

export class VolumeAnalyzerNew {
  private readonly enabled: boolean;
  private readonly weight: number;
  private readonly priority: number;
  private readonly neutralConfidence: number;

  private indicator: VolumeIndicatorNew;
  private lastSignal: AnalyzerSignal | null = null;
  private initialized: boolean = false;

  /**
   * Constructor with ConfigNew
   * STRICT - Throws if config is invalid
   *
   * @param config Analyzer configuration
   * @param logger Logger service (optional)
   * @param indicatorDI Volume indicator instance via DI (optional, will create if not provided)
   */
  constructor(
    config: VolumeAnalyzerConfigNew,
    private logger?: LoggerService,
    indicatorDI?: IIndicator | null,
  ) {
    // Validate analyzer config
    if (typeof config.enabled !== 'boolean') {
      throw new Error('[VOLUME_ANALYZER] Missing or invalid: enabled (boolean)');
    }
    if (typeof config.weight !== 'number' || config.weight < 0 || config.weight > 1) {
      throw new Error('[VOLUME_ANALYZER] Missing or invalid: weight (0.0-1.0)');
    }
    if (typeof config.priority !== 'number' || config.priority < 1 || config.priority > 10) {
      throw new Error('[VOLUME_ANALYZER] Missing or invalid: priority (1-10)');
    }
    if (typeof config.neutralConfidence !== 'number' || config.neutralConfidence < 0 || config.neutralConfidence > 1) {
      throw new Error('[VOLUME_ANALYZER] Missing or invalid: neutralConfidence (0.0-1.0)');
    }

    this.enabled = config.enabled;
    this.weight = config.weight;
    this.priority = config.priority;
    this.neutralConfidence = config.neutralConfidence;

    // Use injected indicator if provided (DI), otherwise create new one
    if (indicatorDI && indicatorDI instanceof VolumeIndicatorNew) {
      this.indicator = indicatorDI;
      this.logger?.info('[VOLUME_ANALYZER] Using injected Volume indicator via DI');
    } else {
      // Fallback: Create Volume indicator with standard period
      this.logger?.info('[VOLUME_ANALYZER] Creating new Volume indicator with period 14');

      this.indicator = new VolumeIndicatorNew({
        enabled: true,
        period: 14, // Standard volume period
      });
    }
  }

  /**
   * Analyze candles and generate volume signal
   *
   * @param candles - Array of candles
   * @returns AnalyzerSignal with direction, confidence, and weight
   * @throws {Error} If not enabled, not enough candles, or invalid input
   */
  analyze(candles: Candle[]): AnalyzerSignal {
    if (!this.enabled) {
      throw new Error('[VOLUME_ANALYZER] Analyzer is disabled');
    }

    if (!Array.isArray(candles)) {
      throw new Error('[VOLUME_ANALYZER] Invalid candles input (must be array)');
    }

    if (candles.length < MIN_CANDLES_FOR_VOLUME) {
      throw new Error(
        `[VOLUME_ANALYZER] Not enough candles. Need ${MIN_CANDLES_FOR_VOLUME}, got ${candles.length}`,
      );
    }

    // Validate candles
    for (let i = 0; i < candles.length; i++) {
      if (!candles[i] || typeof candles[i].volume !== 'number') {
        throw new Error(`[VOLUME_ANALYZER] Invalid candle at index ${i}`);
      }
    }

    // Calculate volume metrics
    const volumeMetrics = this.indicator.calculate(candles);

    // Determine signal direction based on volume strength
    const direction = this.getDirection(volumeMetrics.strength);

    // Calculate confidence based on volume strength
    const confidence = this.calculateConfidence(volumeMetrics.strength);

    // Create signal
    const signal: AnalyzerSignal = {
      source: 'VOLUME_ANALYZER',
      direction,
      confidence,
      weight: this.weight,
      priority: this.priority,
      score: (confidence / 100) * this.weight,
    };

    this.lastSignal = signal;
    this.initialized = true;

    this.logger?.debug('[VOLUME_ANALYZER] Generated signal', {
      direction,
      confidence,
      strength: volumeMetrics.strength,
      ratio: volumeMetrics.ratio,
    });

    return signal;
  }

  /**
   * Determine signal direction based on volume strength
   *
   * @private
   * @param strength - Volume strength (0-100 scale)
   * @returns SignalDirection (LONG, SHORT, or HOLD)
   */
  private getDirection(strength: number): SignalDirection {
    if (strength > HIGH_STRENGTH_THRESHOLD) {
      // Strong volume - trend confirmation
      return SignalDirectionEnum.LONG;
    } else if (strength < LOW_STRENGTH_THRESHOLD) {
      // Weak volume - lack of conviction
      return SignalDirectionEnum.SHORT;
    } else {
      // Neutral volume
      return SignalDirectionEnum.HOLD;
    }
  }

  /**
   * Calculate confidence based on volume strength
   *
   * @private
   * @param strength - Volume strength (0-100 scale)
   * @returns Confidence value (0-100 scale)
   */
  private calculateConfidence(strength: number): number {
    const MAX_CONFIDENCE = 0.95; // Default maximum confidence
    let confidence: number;

    if (strength > HIGH_STRENGTH_THRESHOLD) {
      // High strength: increasing confidence as volume gets stronger
      // At 65: 0%, at 100: maxConfidence
      const normalizedStrength = (strength - HIGH_STRENGTH_THRESHOLD) / (100 - HIGH_STRENGTH_THRESHOLD);
      confidence = MAX_CONFIDENCE * normalizedStrength;
    } else if (strength < LOW_STRENGTH_THRESHOLD) {
      // Low strength: volume weakness signal
      // At 35: 0%, at 0: maxConfidence
      const normalizedStrength = (LOW_STRENGTH_THRESHOLD - strength) / LOW_STRENGTH_THRESHOLD;
      confidence = MAX_CONFIDENCE * normalizedStrength;
    } else {
      // Neutral zone: use configured neutral confidence
      confidence = this.neutralConfidence;
    }

    // Clamp to configured bounds
    confidence = Math.max(MIN_CONFIDENCE, Math.min(MAX_CONFIDENCE, confidence));

    // Convert to 0-100 scale
    return Math.round(confidence * 100);
  }

  /**
   * Get volume strength for current state
   *
   * @param candles - Array of candles
   * @returns Volume strength (0-1 scale)
   * @throws {Error} If not enough candles
   */
  getVolumeStrength(candles: Candle[]): number {
    if (!Array.isArray(candles) || candles.length < MIN_CANDLES_FOR_VOLUME) {
      throw new Error(`[VOLUME_ANALYZER] Not enough candles for volume calculation`);
    }

    return this.indicator.calculate(candles).strength;
  }

  /**
   * Check if volume is strong (above threshold)
   *
   * @param candles - Array of candles
   * @param threshold - Strong threshold (default 0.65)
   * @returns true if volume strength > threshold
   */
  isStrongVolume(candles: Candle[], threshold: number = HIGH_STRENGTH_THRESHOLD): boolean {
    const strength = this.getVolumeStrength(candles);
    return strength > threshold;
  }

  /**
   * Check if volume is weak (below threshold)
   *
   * @param candles - Array of candles
   * @param threshold - Weak threshold (default 0.35)
   * @returns true if volume strength < threshold
   */
  isWeakVolume(candles: Candle[], threshold: number = LOW_STRENGTH_THRESHOLD): boolean {
    const strength = this.getVolumeStrength(candles);
    return strength < threshold;
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
      neutralConfidence: number;
    };
  } {
    return {
      enabled: this.enabled,
      initialized: this.initialized,
      lastSignal: this.lastSignal,
      config: {
        weight: this.weight,
        priority: this.priority,
        neutralConfidence: this.neutralConfidence,
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
    neutralConfidence: number;
  } {
    return {
      enabled: this.enabled,
      weight: this.weight,
      priority: this.priority,
      neutralConfidence: this.neutralConfidence,
    };
  }
}
