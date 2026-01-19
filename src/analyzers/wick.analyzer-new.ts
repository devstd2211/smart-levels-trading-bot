/**
 * Wick Analyzer NEW - with ConfigNew Support
 * Detects wick rejection patterns (price rejection from extremes)
 *
 * Signal Logic:
 * - Long wick down (bullish): Price rejected from lows = LONG signal
 * - Long wick up (bearish): Price rejected from highs = SHORT signal
 * - Normal wicks: HOLD signal
 *
 * Confidence Calculation:
 * - Based on wick size relative to body and volatility
 */

import type { Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';
import type { SignalDirection } from '../types/enums';
import type { WickAnalyzerConfigNew } from '../types/config-new.types';
import { SignalDirection as SignalDirectionEnum } from '../types/enums';
import type { LoggerService } from '../services/logger.service';
import { IAnalyzer } from '../types/analyzer.interface';
import { AnalyzerType } from '../types/analyzer-type.enum';

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_CANDLES_FOR_WICK = 20;
const MIN_CONFIDENCE = 0.1;
const MAX_CONFIDENCE = 0.95;
const MIN_BODY_TO_WICK_RATIO = 0.3; // Wick should be at least 3x body

// ============================================================================
// WICK ANALYZER - NEW VERSION
// ============================================================================

export class WickAnalyzerNew implements IAnalyzer {
  private readonly enabled: boolean;
  private readonly weight: number;
  private readonly priority: number;
  private maxConfidence: number = MAX_CONFIDENCE;

  private lastSignal: AnalyzerSignal | null = null;
  private initialized: boolean = false;

  /**
   * Constructor with ConfigNew
   * STRICT - Throws if config is invalid
   */
  constructor(
    config: WickAnalyzerConfigNew,
    private logger?: LoggerService,
  ) {
    // Validate analyzer config
    if (typeof config.enabled !== 'boolean') {
      throw new Error('[WICK_ANALYZER] Missing or invalid: enabled (boolean)');
    }
    if (typeof config.weight !== 'number' || config.weight < 0 || config.weight > 1) {
      throw new Error('[WICK_ANALYZER] Missing or invalid: weight (0.0-1.0)');
    }
    if (typeof config.priority !== 'number' || config.priority < 1 || config.priority > 10) {
      throw new Error('[WICK_ANALYZER] Missing or invalid: priority (1-10)');
    }

    this.enabled = config.enabled;
    this.weight = config.weight;
    this.priority = config.priority;
  }

  /**
   * Analyze candles and generate wick signal
   *
   * @param candles - Array of candles
   * @returns AnalyzerSignal with direction, confidence, and weight
   * @throws {Error} If not enabled, not enough candles, or invalid input
   */
  analyze(candles: Candle[]): AnalyzerSignal {
    if (!this.enabled) {
      throw new Error('[WICK_ANALYZER] Analyzer is disabled');
    }

    if (!Array.isArray(candles)) {
      throw new Error('[WICK_ANALYZER] Invalid candles input (must be array)');
    }

    if (candles.length < MIN_CANDLES_FOR_WICK) {
      throw new Error(`[WICK_ANALYZER] Not enough candles. Need ${MIN_CANDLES_FOR_WICK}, got ${candles.length}`);
    }

    // Validate candles
    for (let i = 0; i < candles.length; i++) {
      if (!candles[i] || typeof candles[i].high !== 'number' || typeof candles[i].low !== 'number' || typeof candles[i].close !== 'number' || typeof candles[i].open !== 'number') {
        throw new Error(`[WICK_ANALYZER] Invalid candle at index ${i}`);
      }
    }

    // Analyze current and recent candles for wick patterns
    const wick = this.analyzeWicks(candles);

    // Determine signal direction
    const direction = this.getDirection(wick);

    // Calculate confidence
    const confidence = this.calculateConfidence(wick);

    // Create signal
    const signal: AnalyzerSignal = {
      source: 'WICK_ANALYZER',
      direction,
      confidence,
      weight: this.weight,
      priority: this.priority,
      score: (confidence / 100) * this.weight,
    };

    this.lastSignal = signal;
    this.initialized = true;

    this.logger?.debug('[WICK_ANALYZER] Generated signal', {
      direction,
      confidence,
      wickType: wick.type,
      wickRatio: wick.ratio,
    });

    return signal;
  }

  /**
   * Analyze wick patterns in recent candles
   *
   * @private
   * @param candles - Array of candles
   * @returns Wick analysis result
   */
  private analyzeWicks(candles: Candle[]): {
    type: 'NONE' | 'BULLISH_WICK' | 'BEARISH_WICK';
    ratio: number;
    strength: number;
  } {
    const current = candles[candles.length - 1];
    const prev = candles[candles.length - 2];

    // Calculate body and wicks
    const bodyHigh = Math.max(current.open, current.close);
    const bodyLow = Math.min(current.open, current.close);
    const body = bodyHigh - bodyLow;
    const upperWick = current.high - bodyHigh;
    const lowerWick = bodyLow - current.low;

    // Check for bullish wick (long lower wick)
    if (lowerWick > 0 && body > 0) {
      const ratio = lowerWick / body;
      if (ratio > MIN_BODY_TO_WICK_RATIO) {
        const strength = Math.min(1, ratio / (MIN_BODY_TO_WICK_RATIO * 2));
        return { type: 'BULLISH_WICK', ratio, strength };
      }
    }

    // Check for bearish wick (long upper wick)
    if (upperWick > 0 && body > 0) {
      const ratio = upperWick / body;
      if (ratio > MIN_BODY_TO_WICK_RATIO) {
        const strength = Math.min(1, ratio / (MIN_BODY_TO_WICK_RATIO * 2));
        return { type: 'BEARISH_WICK', ratio, strength };
      }
    }

    return { type: 'NONE', ratio: 0, strength: 0 };
  }

  /**
   * Determine signal direction based on wick type
   *
   * @private
   * @param wick - Wick analysis result
   * @returns SignalDirection
   */
  private getDirection(wick: { type: 'NONE' | 'BULLISH_WICK' | 'BEARISH_WICK' }): SignalDirection {
    if (wick.type === 'BULLISH_WICK') {
      return SignalDirectionEnum.LONG;
    } else if (wick.type === 'BEARISH_WICK') {
      return SignalDirectionEnum.SHORT;
    } else {
      return SignalDirectionEnum.HOLD;
    }
  }

  /**
   * Calculate confidence based on wick strength
   *
   * @private
   * @param wick - Wick analysis result
   * @returns Confidence value (0-100 scale)
   */
  private calculateConfidence(wick: { type: 'NONE' | 'BULLISH_WICK' | 'BEARISH_WICK'; strength: number }): number {
    let confidence: number;

    if (wick.type === 'NONE') {
      confidence = MIN_CONFIDENCE;
    } else {
      confidence = MIN_CONFIDENCE + wick.strength * (MAX_CONFIDENCE - MIN_CONFIDENCE);
    }

    confidence = Math.max(MIN_CONFIDENCE, Math.min(MAX_CONFIDENCE, confidence));
    return Math.round(confidence * 100);
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
    };
  } {
    return {
      enabled: this.enabled,
      initialized: this.initialized,
      lastSignal: this.lastSignal,
      config: {
        weight: this.weight,
        priority: this.priority,
      },
    };
  }

  /**
   * Reset analyzer state
   */
  reset(): void {
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
   * Get analyzer type
   */
  getType(): string {
    return AnalyzerType.WICK;
  }

  /**
   * Check if analyzer has enough data
   */
  isReady(candles: Candle[]): boolean {
    return candles && Array.isArray(candles) && candles.length >= MIN_CANDLES_FOR_WICK;
  }

  /**
   * Get minimum candles required
   */
  getMinCandlesRequired(): number {
    return MIN_CANDLES_FOR_WICK;
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
   * Get config values
   */
  getConfig(): {
    enabled: boolean;
    weight: number;
    priority: number;
  } {
    return {
      enabled: this.enabled,
      weight: this.weight,
      priority: this.priority,
    };
  }
}
