/**
 * Volatility Spike Analyzer NEW - with ConfigNew Support
 * Generates trading signals based on volatility spikes
 *
 * Signal Logic:
 * - ATR spikes above 1.5x average: High volatility (LONG signal - breakout opportunity)
 * - ATR drops below 0.5x average: Low volatility (SHORT signal - consolidation risk)
 * - 0.5x <= ATR <= 1.5x: Normal volatility (HOLD signal)
 *
 * Confidence Calculation:
 * - High spike: confidence = (currentATR - avgATR*1.5) / (maxATR - avgATR*1.5) * maxConfidence
 * - Low volatility: confidence = (avgATR*0.5 - currentATR) / avgATR*0.5 * maxConfidence
 * - Normal: confidence = 0.2 (low confidence for neutral)
 * - Clamped to [0.1, maxConfidence]
 */

import type { Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';
import type { SignalDirection } from '../types/enums';
import { SignalDirection as SignalDirectionEnum } from '../types/enums';
import { ATRIndicatorNew } from '../indicators/atr.indicator-new';
import type { LoggerService } from '../services/logger.service';
import { IAnalyzer } from '../types/analyzer.interface';
import { AnalyzerType } from '../types/analyzer-type.enum';

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_CANDLES_FOR_VOLATILITY = 50; // Need enough candles for ATR average
const MIN_CONFIDENCE = 0.1; // Minimum confidence floor (10%)
const VOLATILITY_HIGH_MULTIPLIER = 1.5; // 1.5x average = spike
const VOLATILITY_LOW_MULTIPLIER = 0.5; // 0.5x average = low volatility
const NEUTRAL_CONFIDENCE = 0.2; // Low confidence for neutral/normal volatility
const MAX_ATR_ESTIMATE = 100; // Upper bound for ATR scaling

// ============================================================================
// VOLATILITY SPIKE ANALYZER - NEW VERSION
// ============================================================================

export class VolatilitySpikeAnalyzerNew implements IAnalyzer {
  private readonly enabled: boolean;
  private readonly weight: number;
  private readonly priority: number;
  private readonly maxConfidence: number;

  private indicator: ATRIndicatorNew;
  private lastSignal: AnalyzerSignal | null = null;
  private initialized: boolean = false;

  /**
   * Constructor with config
   * STRICT - Throws if config is invalid
   */
  constructor(
    config: any,
    private logger?: LoggerService,
  ) {
    // Validate analyzer config
    if (typeof config.enabled !== 'boolean') {
      throw new Error('[VOLATILITY_SPIKE] Missing or invalid: enabled (boolean)');
    }
    if (typeof config.weight !== 'number' || config.weight < 0 || config.weight > 1) {
      throw new Error('[VOLATILITY_SPIKE] Missing or invalid: weight (0.0-1.0)');
    }
    if (typeof config.priority !== 'number' || config.priority < 1 || config.priority > 10) {
      throw new Error('[VOLATILITY_SPIKE] Missing or invalid: priority (1-10)');
    }

    this.enabled = config.enabled;
    this.weight = config.weight;
    this.priority = config.priority;
    this.maxConfidence = config.maxConfidence ?? 0.95;

    // Create ATR indicator for volatility measurement
    this.indicator = new ATRIndicatorNew({
      enabled: true,
      period: config.period ?? 14,
      minimumATR: config.minimumATR ?? 0.005,
      maximumATR: config.maximumATR ?? 2.0,
    });
  }

  /**
   * Analyze candles and generate volatility spike signal
   *
   * @param candles - Array of candles
   * @returns AnalyzerSignal with direction, confidence, and weight
   * @throws {Error} If not enabled, not enough candles, or invalid input
   */
  analyze(candles: Candle[]): AnalyzerSignal {
    if (!this.enabled) {
      throw new Error('[VOLATILITY_SPIKE] Analyzer is disabled');
    }

    if (!Array.isArray(candles)) {
      throw new Error('[VOLATILITY_SPIKE] Invalid candles input (must be array)');
    }

    if (candles.length < MIN_CANDLES_FOR_VOLATILITY) {
      throw new Error(
        `[VOLATILITY_SPIKE] Not enough candles. Need ${MIN_CANDLES_FOR_VOLATILITY}, got ${candles.length}`,
      );
    }

    // Validate candles
    for (let i = 0; i < candles.length; i++) {
      if (!candles[i] || typeof candles[i].high !== 'number' || typeof candles[i].low !== 'number') {
        throw new Error(`[VOLATILITY_SPIKE] Invalid candle at index ${i}`);
      }
    }

    // Calculate ATR
    const currentATR = this.indicator.calculate(candles);

    // Calculate average ATR from last 20 candles (excluding current)
    const sampleSize = Math.min(20, Math.floor(candles.length / 2));
    const recentCandles = candles.slice(-sampleSize - 1, -1);
    let totalATR = 0;
    for (const candle of recentCandles) {
      const atr = Math.abs(candle.high - candle.low);
      totalATR += atr;
    }
    const avgATR = sampleSize > 0 ? totalATR / sampleSize : currentATR;

    // Determine signal direction based on volatility
    const direction = this.getDirection(currentATR, avgATR);

    // Calculate confidence based on volatility level
    const confidence = this.calculateConfidence(currentATR, avgATR);

    // Create signal
    this.lastSignal = {
      source: 'VOLATILITY_SPIKE_ANALYZER_NEW',
      direction,
      confidence,
      weight: this.weight,
      priority: this.priority,
    };

    return this.lastSignal;
  }

  /**
   * Determine signal direction based on volatility spike
   */
  private getDirection(currentATR: number, avgATR: number): SignalDirection {
    const highThreshold = avgATR * VOLATILITY_HIGH_MULTIPLIER;
    const lowThreshold = avgATR * VOLATILITY_LOW_MULTIPLIER;

    if (currentATR >= highThreshold) {
      return SignalDirectionEnum.LONG; // Volatility spike = breakout opportunity
    } else if (currentATR <= lowThreshold) {
      return SignalDirectionEnum.SHORT; // Low volatility = consolidation/reversal risk
    } else {
      return SignalDirectionEnum.HOLD; // Normal volatility
    }
  }

  /**
   * Calculate confidence based on volatility level
   */
  private calculateConfidence(currentATR: number, avgATR: number): number {
    const highThreshold = avgATR * VOLATILITY_HIGH_MULTIPLIER;
    const lowThreshold = avgATR * VOLATILITY_LOW_MULTIPLIER;

    let confidence: number;

    if (currentATR >= highThreshold) {
      // High volatility: scale from threshold to max
      const range = MAX_ATR_ESTIMATE - highThreshold;
      const position = Math.min(currentATR - highThreshold, range);
      confidence = (position / range) * this.maxConfidence;
    } else if (currentATR <= lowThreshold) {
      // Low volatility: scale from threshold to 0
      const range = lowThreshold;
      const position = Math.max(lowThreshold - currentATR, 0);
      confidence = (position / range) * this.maxConfidence;
    } else {
      // Normal volatility: low confidence
      confidence = NEUTRAL_CONFIDENCE;
    }

    // Clamp to range [MIN_CONFIDENCE, maxConfidence]
    return Math.max(MIN_CONFIDENCE, Math.min(this.maxConfidence, confidence));
  }

  /**
   * Get analyzer type
   */
  getType(): string {
    return AnalyzerType.VOLATILITY_SPIKE;
  }

  /**
   * Check if analyzer has enough data
   */
  isReady(candles: Candle[]): boolean {
    return candles && Array.isArray(candles) && candles.length >= MIN_CANDLES_FOR_VOLATILITY;
  }

  /**
   * Get minimum candles required
   */
  getMinCandlesRequired(): number {
    return MIN_CANDLES_FOR_VOLATILITY;
  }

  /**
   * Get analyzer type
   */
  getType(): string {
    return AnalyzerType.VOLATILITY_SPIKE;
  }

  /**
   * Check if analyzer is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get analyzer weight
   */
  getWeight(): number {
    return this.weight;
  }

  /**
   * Get analyzer priority
   */
  getPriority(): number {
    return this.priority;
  }

  /**
   * Get maximum confidence
   */
  getMaxConfidence(): number {
    return this.maxConfidence;
  }

  /**
   * Get last signal (for testing/debugging)
   */
  getLastSignal(): AnalyzerSignal | null {
    return this.lastSignal;
  }
}
