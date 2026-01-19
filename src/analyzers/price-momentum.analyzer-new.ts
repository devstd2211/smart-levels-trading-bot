/**
 * Price Momentum Analyzer NEW - with ConfigNew Support
 * Analyzes price momentum and acceleration
 *
 * Signal Logic:
 * - Strong upward momentum + acceleration: LONG signal
 * - Strong downward momentum + acceleration: SHORT signal
 * - Weak momentum or deceleration: HOLD signal
 *
 * Confidence Calculation:
 * - Based on momentum strength and consistency
 */

import type { Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';
import type { SignalDirection } from '../types/enums';
import type { PriceMomentumAnalyzerConfigNew } from '../types/config-new.types';
import { SignalDirection as SignalDirectionEnum } from '../types/enums';
import type { LoggerService } from '../services/logger.service';
import { IAnalyzer } from '../types/analyzer.interface';
import { AnalyzerType } from '../types/analyzer-type.enum';

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_CANDLES_FOR_MOMENTUM = 20;
const MIN_CONFIDENCE = 0.1;
const MAX_CONFIDENCE = 0.95;
const MOMENTUM_LOOKBACK = 5; // Look back N candles for momentum
const ACCELERATION_LOOKBACK = 3; // Look back for acceleration

// ============================================================================
// PRICE MOMENTUM ANALYZER - NEW VERSION
// ============================================================================

export class PriceMomentumAnalyzerNew implements IAnalyzer {
  private readonly enabled: boolean;
  private readonly weight: number;
  private readonly priority: number;
  private readonly minConfidence: number;
  private readonly maxConfidence: number;

  private lastSignal: AnalyzerSignal | null = null;
  private initialized: boolean = false;

  /**
   * Constructor with ConfigNew
   * STRICT - Throws if config is invalid
   */
  constructor(
    config: PriceMomentumAnalyzerConfigNew,
    private logger?: LoggerService,
  ) {
    // Validate analyzer config
    if (typeof config.enabled !== 'boolean') {
      throw new Error('[PRICE_MOMENTUM_ANALYZER] Missing or invalid: enabled (boolean)');
    }
    if (typeof config.weight !== 'number' || config.weight < 0 || config.weight > 1) {
      throw new Error('[PRICE_MOMENTUM_ANALYZER] Missing or invalid: weight (0.0-1.0)');
    }
    if (typeof config.priority !== 'number' || config.priority < 1 || config.priority > 10) {
      throw new Error('[PRICE_MOMENTUM_ANALYZER] Missing or invalid: priority (1-10)');
    }
    if (typeof config.minConfidence !== 'number' || config.minConfidence < 0 || config.minConfidence > 1) {
      throw new Error('[PRICE_MOMENTUM_ANALYZER] Missing or invalid: minConfidence (0.0-1.0)');
    }
    if (typeof config.maxConfidence !== 'number' || config.maxConfidence < 0 || config.maxConfidence > 1) {
      throw new Error('[PRICE_MOMENTUM_ANALYZER] Missing or invalid: maxConfidence (0.0-1.0)');
    }

    this.enabled = config.enabled;
    this.weight = config.weight;
    this.priority = config.priority;
    this.minConfidence = config.minConfidence;
    this.maxConfidence = config.maxConfidence;
  }

  /**
   * Analyze candles and generate momentum signal
   *
   * @param candles - Array of candles
   * @returns AnalyzerSignal with direction, confidence, and weight
   * @throws {Error} If not enabled, not enough candles, or invalid input
   */
  analyze(candles: Candle[]): AnalyzerSignal {
    if (!this.enabled) {
      throw new Error('[PRICE_MOMENTUM_ANALYZER] Analyzer is disabled');
    }

    if (!Array.isArray(candles)) {
      throw new Error('[PRICE_MOMENTUM_ANALYZER] Invalid candles input (must be array)');
    }

    if (candles.length < MIN_CANDLES_FOR_MOMENTUM) {
      throw new Error(
        `[PRICE_MOMENTUM_ANALYZER] Not enough candles. Need ${MIN_CANDLES_FOR_MOMENTUM}, got ${candles.length}`,
      );
    }

    // Validate candles
    for (let i = 0; i < candles.length; i++) {
      if (!candles[i] || typeof candles[i].close !== 'number') {
        throw new Error(`[PRICE_MOMENTUM_ANALYZER] Invalid candle at index ${i}`);
      }
    }

    // Calculate momentum
    const momentum = this.calculateMomentum(candles);

    // Determine signal direction
    const direction = this.getDirection(momentum);

    // Calculate confidence
    const confidence = this.calculateConfidence(momentum);

    // Create signal
    const signal: AnalyzerSignal = {
      source: 'PRICE_MOMENTUM_ANALYZER',
      direction,
      confidence,
      weight: this.weight,
      priority: this.priority,
      score: (confidence / 100) * this.weight,
    };

    this.lastSignal = signal;
    this.initialized = true;

    this.logger?.debug('[PRICE_MOMENTUM_ANALYZER] Generated signal', {
      direction,
      confidence,
      momentum: momentum.value,
      acceleration: momentum.acceleration,
    });

    return signal;
  }

  /**
   * Calculate momentum metrics
   *
   * @private
   * @param candles - Array of candles
   * @returns Momentum object with value and acceleration
   */
  private calculateMomentum(candles: Candle[]): {
    value: number;
    acceleration: number;
    type: 'STRONG_UP' | 'WEAK_UP' | 'STRONG_DOWN' | 'WEAK_DOWN' | 'NEUTRAL';
  } {
    // Calculate recent momentum (last N candles)
    const lookback = Math.min(MOMENTUM_LOOKBACK, candles.length - 1);
    const recentCandles = candles.slice(-lookback - 1);

    // Calculate price change
    const startPrice = recentCandles[0].close;
    const endPrice = candles[candles.length - 1].close;
    const priceChange = endPrice - startPrice;
    const priceChangePercent = (priceChange / startPrice) * 100;

    // Calculate acceleration (momentum change)
    const accelLookback = Math.min(ACCELERATION_LOOKBACK, candles.length - 1);
    const accelCandles = candles.slice(-accelLookback - 1);

    const accelStart = accelCandles[0].close;
    const accelEnd = candles[candles.length - 1].close;
    const accelChange = accelEnd - accelStart;
    const accelerationPercent = (accelChange / accelStart) * 100;

    // Classify momentum type
    let type: 'STRONG_UP' | 'WEAK_UP' | 'STRONG_DOWN' | 'WEAK_DOWN' | 'NEUTRAL';
    if (Math.abs(priceChangePercent) < 0.1) {
      type = 'NEUTRAL';
    } else if (priceChangePercent > 0.5) {
      type = accelerationPercent > priceChangePercent * 0.5 ? 'STRONG_UP' : 'WEAK_UP';
    } else if (priceChangePercent < -0.5) {
      type = accelerationPercent < priceChangePercent * 0.5 ? 'STRONG_DOWN' : 'WEAK_DOWN';
    } else {
      type = priceChangePercent > 0 ? 'WEAK_UP' : 'WEAK_DOWN';
    }

    return {
      value: priceChangePercent,
      acceleration: accelerationPercent,
      type,
    };
  }

  /**
   * Determine signal direction based on momentum
   *
   * @private
   * @param momentum - Momentum information
   * @returns SignalDirection
   */
  private getDirection(momentum: { type: 'STRONG_UP' | 'WEAK_UP' | 'STRONG_DOWN' | 'WEAK_DOWN' | 'NEUTRAL' }): SignalDirection {
    switch (momentum.type) {
      case 'STRONG_UP':
        return SignalDirectionEnum.LONG;
      case 'STRONG_DOWN':
        return SignalDirectionEnum.SHORT;
      case 'WEAK_UP':
      case 'WEAK_DOWN':
      case 'NEUTRAL':
      default:
        return SignalDirectionEnum.HOLD;
    }
  }

  /**
   * Calculate confidence based on momentum strength
   *
   * @private
   * @param momentum - Momentum information
   * @returns Confidence value (0-100 scale)
   */
  private calculateConfidence(momentum: {
    type: 'STRONG_UP' | 'WEAK_UP' | 'STRONG_DOWN' | 'WEAK_DOWN' | 'NEUTRAL';
    value: number;
  }): number {
    let confidence: number;

    switch (momentum.type) {
      case 'STRONG_UP':
      case 'STRONG_DOWN':
        confidence = Math.min(0.8, Math.abs(momentum.value) / 2 + 0.5);
        break;
      case 'WEAK_UP':
      case 'WEAK_DOWN':
        confidence = Math.min(0.5, Math.abs(momentum.value) / 2 + 0.2);
        break;
      case 'NEUTRAL':
      default:
        confidence = MIN_CONFIDENCE;
        break;
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

  // ===== INTERFACE IMPLEMENTATION (IAnalyzer) =====

  /**
   * Get analyzer type name
   */
  getType(): string {
    return AnalyzerType.PRICE_MOMENTUM;
  }

  /**
   * Check if analyzer has enough data
   */
  isReady(candles: Candle[]): boolean {
    return candles && Array.isArray(candles) && candles.length >= MIN_CANDLES_FOR_MOMENTUM;
  }

  /**
   * Get minimum candles required for analysis
   */
  getMinCandlesRequired(): number {
    return MIN_CANDLES_FOR_MOMENTUM;
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

  // ===== EXISTING METHODS =====

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
