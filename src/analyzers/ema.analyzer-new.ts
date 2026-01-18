/**
 * EMA Analyzer NEW - with ConfigNew Support
 * Generates trading signals based on EMA crossovers and spread analysis
 *
 * Signal Logic:
 * - Fast EMA > Slow EMA: Bullish trend (LONG signal)
 * - Fast EMA < Slow EMA: Bearish trend (SHORT signal)
 * - Gap between EMAs: Strength indicator
 *
 * Confidence Calculation:
 * - Base confidence from config (0.0-1.0)
 * - Strength multiplier based on EMA gap
 * - Confidence = base * (1 + gap_percent * strengthMultiplier)
 * - Clamped to [minConfidence, maxConfidence]
 */

import type { Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';
import type { SignalDirection } from '../types/enums';
import type { EmaAnalyzerConfigNew } from '../types/config-new.types';
import { SignalDirection as SignalDirectionEnum } from '../types/enums';
import { validateIndicatorConfig } from '../types/config-new.types';
import { EMAIndicatorNew } from '../indicators/ema.indicator-new';
import type { LoggerService } from '../services/logger.service';
import type { IIndicator } from '../types/indicator.interface';
import { IAnalyzer } from '../types/analyzer.interface';
import { AnalyzerType } from '../types/analyzer-type.enum';

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_CANDLES_FOR_EMA = 50; // Need at least slow period + buffer
const MINIMUM_EMA_GAP_PERCENT = 0.01; // 0.01% minimum gap to register signal

// ============================================================================
// EMA ANALYZER - NEW VERSION
// ============================================================================

export class EmaAnalyzerNew implements IAnalyzer {
  private readonly enabled: boolean;
  private readonly weight: number;
  private readonly priority: number;
  private readonly baseConfidence: number;
  private readonly strengthMultiplier: number;
  private readonly minConfidence: number;
  private readonly maxConfidence: number;

  private indicator: EMAIndicatorNew;
  private lastSignal: AnalyzerSignal | null = null;
  private initialized: boolean = false;

  /**
   * Constructor with ConfigNew
   * STRICT - Throws if config is invalid
   *
   * @param config Analyzer configuration
   * @param logger Logger service (optional)
   * @param indicatorDI EMA indicator instance via DI (optional, will create if not provided)
   */
  constructor(
    config: EmaAnalyzerConfigNew,
    private logger?: LoggerService,
    indicatorDI?: IIndicator | null,
  ) {
    // Validate analyzer config
    if (typeof config.enabled !== 'boolean') {
      throw new Error('[EMA_ANALYZER] Missing or invalid: enabled (boolean)');
    }
    if (typeof config.weight !== 'number' || config.weight < 0 || config.weight > 1) {
      throw new Error('[EMA_ANALYZER] Missing or invalid: weight (0.0-1.0)');
    }
    if (typeof config.priority !== 'number' || config.priority < 1 || config.priority > 10) {
      throw new Error('[EMA_ANALYZER] Missing or invalid: priority (1-10)');
    }
    if (
      typeof config.baseConfidence !== 'number' ||
      config.baseConfidence < 0 ||
      config.baseConfidence > 1
    ) {
      throw new Error('[EMA_ANALYZER] Missing or invalid: baseConfidence (0.0-1.0)');
    }
    if (typeof config.strengthMultiplier !== 'number' || config.strengthMultiplier < 0) {
      throw new Error('[EMA_ANALYZER] Missing or invalid: strengthMultiplier (number >= 0)');
    }
    if (
      typeof config.minConfidence !== 'number' ||
      config.minConfidence < 0 ||
      config.minConfidence > 1
    ) {
      throw new Error('[EMA_ANALYZER] Missing or invalid: minConfidence (0.0-1.0)');
    }
    if (
      typeof config.maxConfidence !== 'number' ||
      config.maxConfidence < 0 ||
      config.maxConfidence > 1
    ) {
      throw new Error('[EMA_ANALYZER] Missing or invalid: maxConfidence (0.0-1.0)');
    }
    if (config.minConfidence > config.maxConfidence) {
      throw new Error('[EMA_ANALYZER] minConfidence cannot be greater than maxConfidence');
    }

    this.enabled = config.enabled;
    this.weight = config.weight;
    this.priority = config.priority;
    this.baseConfidence = config.baseConfidence;
    this.strengthMultiplier = config.strengthMultiplier;
    this.minConfidence = config.minConfidence;
    this.maxConfidence = config.maxConfidence;

    // Use injected indicator if provided (DI), otherwise create new one
    if (indicatorDI && indicatorDI instanceof EMAIndicatorNew) {
      this.indicator = indicatorDI;
      this.logger?.info('[EMA_ANALYZER] Using injected EMA indicator via DI');
    } else {
      // Fallback: Create EMA indicator with periods from config (or defaults if not provided)
      const fastPeriod = (config as any).fastPeriod || 9;
      const slowPeriod = (config as any).slowPeriod || 21;

      this.logger?.info('[EMA_ANALYZER] Creating new EMA indicator with periods', {
        fastPeriod,
        slowPeriod,
      });

      this.indicator = new EMAIndicatorNew({
        enabled: true,
        fastPeriod,
        slowPeriod,
        baseConfidence: 0,
        strengthMultiplier: 0,
      });
    }
  }

  /**
   * Analyze candles and generate EMA signal
   *
   * @param candles - Array of candles
   * @returns AnalyzerSignal with direction, confidence, and weight
   * @throws {Error} If not enabled, not enough candles, or invalid input
   */
  analyze(candles: Candle[]): AnalyzerSignal {
    if (!this.enabled) {
      throw new Error('[EMA_ANALYZER] Analyzer is disabled');
    }

    if (!Array.isArray(candles)) {
      throw new Error('[EMA_ANALYZER] Invalid candles input (must be array)');
    }

    if (candles.length < MIN_CANDLES_FOR_EMA) {
      throw new Error(
        `[EMA_ANALYZER] Not enough candles. Need ${MIN_CANDLES_FOR_EMA}, got ${candles.length}`,
      );
    }

    // Validate candles
    for (let i = 0; i < candles.length; i++) {
      if (!candles[i] || typeof candles[i].close !== 'number') {
        throw new Error(`[EMA_ANALYZER] Invalid candle at index ${i}`);
      }
    }

    // Calculate EMAs
    const emaResult = this.indicator.calculate(candles);
    const fastEma = emaResult.fast;
    const slowEma = emaResult.slow;

    // Determine signal direction
    const direction = this.getDirection(fastEma, slowEma);

    // Calculate confidence
    const confidence = this.calculateConfidence(fastEma, slowEma);

    // Create signal
    const signal: AnalyzerSignal = {
      source: 'EMA_ANALYZER',
      direction,
      confidence,
      weight: this.weight,
      priority: this.priority,
      score: (confidence / 100) * this.weight,
    };

    this.lastSignal = signal;
    this.initialized = true;

    this.logger?.debug('[EMA_ANALYZER] Generated signal', {
      direction,
      confidence,
      fastEma,
      slowEma,
      gap: fastEma - slowEma,
    });

    return signal;
  }

  /**
   * Determine signal direction based on EMA crossover
   *
   * @private
   * @param fastEma - Fast EMA value
   * @param slowEma - Slow EMA value
   * @returns SignalDirection (LONG, SHORT, or HOLD)
   */
  private getDirection(fastEma: number, slowEma: number): SignalDirection {
    const gap = fastEma - slowEma;
    const gapPercent = Math.abs(gap / slowEma);

    // Ignore very small gaps (noise)
    if (gapPercent < MINIMUM_EMA_GAP_PERCENT) {
      return SignalDirectionEnum.HOLD;
    }

    if (fastEma > slowEma) {
      return SignalDirectionEnum.LONG;
    } else {
      return SignalDirectionEnum.SHORT;
    }
  }

  /**
   * Calculate confidence based on EMA gap
   *
   * @private
   * @param fastEma - Fast EMA value
   * @param slowEma - Slow EMA value
   * @returns Confidence value (0-100 scale)
   */
  private calculateConfidence(fastEma: number, slowEma: number): number {
    // Calculate gap as percentage
    const gap = Math.abs(fastEma - slowEma);
    const gapPercent = gap / slowEma;

    // Base confidence with strength multiplier
    let confidence = this.baseConfidence * (1 + gapPercent * this.strengthMultiplier);

    // Clamp to configured bounds
    confidence = Math.max(this.minConfidence, Math.min(this.maxConfidence, confidence));

    // Convert to 0-100 scale
    return Math.round(confidence * 100);
  }

  /**
   * Get EMA values for current state
   *
   * @param candles - Array of candles
   * @returns Object with fast and slow EMA values
   * @throws {Error} If not enough candles
   */
  getEmaValues(candles: Candle[]): {
    fast: number;
    slow: number;
  } {
    if (!Array.isArray(candles) || candles.length < MIN_CANDLES_FOR_EMA) {
      throw new Error(`[EMA_ANALYZER] Not enough candles for EMA calculation`);
    }

    const result = this.indicator.calculate(candles);

    return { fast: result.fast, slow: result.slow };
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
      baseConfidence: number;
      strengthMultiplier: number;
      minConfidence: number;
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
        baseConfidence: this.baseConfidence,
        strengthMultiplier: this.strengthMultiplier,
        minConfidence: this.minConfidence,
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

  // ===== INTERFACE IMPLEMENTATION (IAnalyzer) =====

  /**
   * Get analyzer type name
   * @returns AnalyzerType.EMA
   */
  getType(): string {
    return AnalyzerType.EMA;
  }

  /**
   * Check if analyzer has enough data
   * @param candles Array of candles
   * @returns true if enough candles, false otherwise
   */
  isReady(candles: Candle[]): boolean {
    return candles && Array.isArray(candles) && candles.length >= MIN_CANDLES_FOR_EMA;
  }

  /**
   * Get minimum candles required for analysis
   * @returns Min candle count needed
   */
  getMinCandlesRequired(): number {
    return MIN_CANDLES_FOR_EMA;
  }

  /**
   * Check if analyzer is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
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

  // ===== EXISTING METHODS =====

  /**
   * Get config values
   */
  getConfig(): {
    enabled: boolean;
    weight: number;
    priority: number;
    baseConfidence: number;
    strengthMultiplier: number;
    minConfidence: number;
    maxConfidence: number;
  } {
    return {
      enabled: this.enabled,
      weight: this.weight,
      priority: this.priority,
      baseConfidence: this.baseConfidence,
      strengthMultiplier: this.strengthMultiplier,
      minConfidence: this.minConfidence,
      maxConfidence: this.maxConfidence,
    };
  }
}
