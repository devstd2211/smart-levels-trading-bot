/**
 * Stochastic Analyzer NEW - with ConfigNew Support
 * Generates trading signals based on Stochastic Oscillator
 *
 * Signal Logic:
 * - %K > %D and %K < 20: LONG signal (oversold + bullish cross)
 * - %K < %D and %K > 80: SHORT signal (overbought + bearish cross)
 * - Otherwise: HOLD signal
 *
 * Confidence Calculation:
 * - Based on distance from overbought/oversold extremes and crossover strength
 * - Stronger signals when %K is further from midline (50)
 */

import type { Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';
import type { SignalDirection } from '../types/enums';
import type { StochasticAnalyzerConfigNew } from '../types/config-new.types';
import { SignalDirection as SignalDirectionEnum } from '../types/enums';
import { StochasticIndicatorNew } from '../indicators/stochastic.indicator-new';
import type { LoggerService } from '../services/logger.service';
import type { IIndicator } from '../types/indicator.interface';
import { IAnalyzer } from '../types/analyzer.interface';
import { AnalyzerType } from '../types/analyzer-type.enum';

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_CANDLES_FOR_STOCHASTIC = 50; // Need at least kPeriod + dPeriod
const MIN_CONFIDENCE = 0.1; // Minimum confidence floor (10%)
const OVERSOLD_LEVEL = 20;
const OVERBOUGHT_LEVEL = 80;
const MIDPOINT = 50;

// ============================================================================
// STOCHASTIC ANALYZER - NEW VERSION
// ============================================================================

export class StochasticAnalyzerNew implements IAnalyzer {
  private readonly enabled: boolean;
  private readonly weight: number;
  private readonly priority: number;
  private readonly kPeriod: number;
  private readonly dPeriod: number;

  private indicator: StochasticIndicatorNew;
  private lastSignal: AnalyzerSignal | null = null;
  private initialized: boolean = false;

  /**
   * Constructor with ConfigNew
   * STRICT - Throws if config is invalid
   *
   * @param config Analyzer configuration
   * @param logger Logger service (optional)
   * @param indicatorDI Stochastic indicator instance via DI (optional, will create if not provided)
   */
  constructor(
    config: StochasticAnalyzerConfigNew,
    private logger?: LoggerService,
    indicatorDI?: IIndicator | null,
  ) {
    // Validate analyzer config
    if (typeof config.enabled !== 'boolean') {
      throw new Error('[STOCHASTIC_ANALYZER] Missing or invalid: enabled (boolean)');
    }
    if (typeof config.weight !== 'number' || config.weight < 0 || config.weight > 1) {
      throw new Error('[STOCHASTIC_ANALYZER] Missing or invalid: weight (0.0-1.0)');
    }
    if (typeof config.priority !== 'number' || config.priority < 1 || config.priority > 10) {
      throw new Error('[STOCHASTIC_ANALYZER] Missing or invalid: priority (1-10)');
    }
    if (typeof config.kPeriod !== 'number' || config.kPeriod < 1 || config.kPeriod > 100) {
      throw new Error('[STOCHASTIC_ANALYZER] Missing or invalid: kPeriod (1-100)');
    }
    if (typeof config.dPeriod !== 'number' || config.dPeriod < 1 || config.dPeriod > 100) {
      throw new Error('[STOCHASTIC_ANALYZER] Missing or invalid: dPeriod (1-100)');
    }

    this.enabled = config.enabled;
    this.weight = config.weight;
    this.priority = config.priority;
    this.kPeriod = config.kPeriod;
    this.dPeriod = config.dPeriod;

    // Use injected indicator if provided (DI), otherwise create new one
    if (indicatorDI && indicatorDI instanceof StochasticIndicatorNew) {
      this.indicator = indicatorDI;
      this.logger?.info('[STOCHASTIC_ANALYZER] Using injected Stochastic indicator via DI');
    } else {
      // Fallback: Create Stochastic indicator with configured parameters
      this.logger?.info('[STOCHASTIC_ANALYZER] Creating new Stochastic indicator', {
        kPeriod: this.kPeriod,
        dPeriod: this.dPeriod,
      });

      this.indicator = new StochasticIndicatorNew({
        enabled: true,
        kPeriod: this.kPeriod,
        dPeriod: this.dPeriod,
      });
    }
  }

  /**
   * Analyze candles and generate Stochastic signal
   *
   * @param candles - Array of candles
   * @returns AnalyzerSignal with direction, confidence, and weight
   * @throws {Error} If not enabled, not enough candles, or invalid input
   */
  analyze(candles: Candle[]): AnalyzerSignal {
    if (!this.enabled) {
      throw new Error('[STOCHASTIC_ANALYZER] Analyzer is disabled');
    }

    if (!Array.isArray(candles)) {
      throw new Error('[STOCHASTIC_ANALYZER] Invalid candles input (must be array)');
    }

    if (candles.length < MIN_CANDLES_FOR_STOCHASTIC) {
      throw new Error(
        `[STOCHASTIC_ANALYZER] Not enough candles. Need ${MIN_CANDLES_FOR_STOCHASTIC}, got ${candles.length}`,
      );
    }

    // Validate candles
    for (let i = 0; i < candles.length; i++) {
      if (!candles[i] || typeof candles[i].high !== 'number' || typeof candles[i].low !== 'number' || typeof candles[i].close !== 'number') {
        throw new Error(`[STOCHASTIC_ANALYZER] Invalid candle at index ${i}`);
      }
    }

    // Calculate Stochastic
    const stochasticValues = this.indicator.calculate(candles);

    // Determine signal direction based on %K and %D
    const direction = this.getDirection(stochasticValues.k, stochasticValues.d);

    // Calculate confidence based on Stochastic levels
    const confidence = this.calculateConfidence(stochasticValues.k, stochasticValues.d);

    // Create signal
    const signal: AnalyzerSignal = {
      source: 'STOCHASTIC_ANALYZER',
      direction,
      confidence,
      weight: this.weight,
      priority: this.priority,
      score: (confidence / 100) * this.weight,
    };

    this.lastSignal = signal;
    this.initialized = true;

    this.logger?.debug('[STOCHASTIC_ANALYZER] Generated signal', {
      direction,
      confidence,
      k: stochasticValues.k,
      d: stochasticValues.d,
    });

    return signal;
  }

  /**
   * Determine signal direction based on %K and %D
   *
   * @private
   * @param k - %K value (0-100)
   * @param d - %D value (0-100)
   * @returns SignalDirection (LONG, SHORT, or HOLD)
   */
  private getDirection(k: number, d: number): SignalDirection {
    // Bullish signal: %K crosses above %D in oversold zone
    if (k > d && k < OVERSOLD_LEVEL) {
      return SignalDirectionEnum.LONG;
    }
    // Bearish signal: %K crosses below %D in overbought zone
    else if (k < d && k > OVERBOUGHT_LEVEL) {
      return SignalDirectionEnum.SHORT;
    }
    // Neutral
    else {
      return SignalDirectionEnum.HOLD;
    }
  }

  /**
   * Calculate confidence based on Stochastic levels
   *
   * @private
   * @param k - %K value (0-100)
   * @param d - %D value (0-100)
   * @returns Confidence value (0-100 scale)
   */
  private calculateConfidence(k: number, d: number): number {
    const MAX_CONFIDENCE = 0.95;
    let confidence: number;

    // Distance from midpoint (0 = midpoint, 1 = extreme)
    const distanceFromMid = Math.abs(k - MIDPOINT) / MIDPOINT;

    if (k > d && k < OVERSOLD_LEVEL) {
      // Bullish: confidence based on how far below oversold threshold
      const strengthFromOversold = (OVERSOLD_LEVEL - k) / OVERSOLD_LEVEL;
      confidence = MAX_CONFIDENCE * strengthFromOversold * distanceFromMid;
    } else if (k < d && k > OVERBOUGHT_LEVEL) {
      // Bearish: confidence based on how far above overbought threshold
      const strengthFromOverbought = (k - OVERBOUGHT_LEVEL) / (100 - OVERBOUGHT_LEVEL);
      confidence = MAX_CONFIDENCE * strengthFromOverbought * distanceFromMid;
    } else if (k > d && k < MIDPOINT) {
      // Bullish bias but not in clear zone
      confidence = MAX_CONFIDENCE * 0.3 * (MIDPOINT - k) / MIDPOINT;
    } else if (k < d && k > MIDPOINT) {
      // Bearish bias but not in clear zone
      confidence = MAX_CONFIDENCE * 0.3 * (k - MIDPOINT) / MIDPOINT;
    } else {
      // Neutral: conflicting signals or both in neutral
      confidence = MAX_CONFIDENCE * 0.2;
    }

    // Clamp to configured bounds
    confidence = Math.max(MIN_CONFIDENCE, Math.min(MAX_CONFIDENCE, confidence));

    // Convert to 0-100 scale
    return Math.round(confidence * 100);
  }

  /**
   * Get Stochastic values for current state
   *
   * @param candles - Array of candles
   * @returns { k: number, d: number }
   * @throws {Error} If not enough candles
   */
  getStochasticValues(candles: Candle[]): { k: number; d: number } {
    if (!Array.isArray(candles) || candles.length < MIN_CANDLES_FOR_STOCHASTIC) {
      throw new Error(`[STOCHASTIC_ANALYZER] Not enough candles for Stochastic calculation`);
    }

    return this.indicator.calculate(candles);
  }

  /**
   * Check if Stochastic is in oversold zone
   *
   * @param candles - Array of candles
   * @param threshold - Oversold threshold (default 20)
   * @returns true if %K < threshold
   */
  isOversold(candles: Candle[], threshold: number = OVERSOLD_LEVEL): boolean {
    const values = this.getStochasticValues(candles);
    return values.k < threshold;
  }

  /**
   * Check if Stochastic is in overbought zone
   *
   * @param candles - Array of candles
   * @param threshold - Overbought threshold (default 80)
   * @returns true if %K > threshold
   */
  isOverbought(candles: Candle[], threshold: number = OVERBOUGHT_LEVEL): boolean {
    const values = this.getStochasticValues(candles);
    return values.k > threshold;
  }

  /**
   * Check if %K has crossed above %D (bullish)
   *
   * @param candles - Array of candles
   * @returns true if %K > %D
   */
  isBullishCross(candles: Candle[]): boolean {
    const values = this.getStochasticValues(candles);
    return values.k > values.d;
  }

  /**
   * Check if %K has crossed below %D (bearish)
   *
   * @param candles - Array of candles
   * @returns true if %K < %D
   */
  isBearishCross(candles: Candle[]): boolean {
    const values = this.getStochasticValues(candles);
    return values.k < values.d;
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
      kPeriod: number;
      dPeriod: number;
    };
  } {
    return {
      enabled: this.enabled,
      initialized: this.initialized,
      lastSignal: this.lastSignal,
      config: {
        weight: this.weight,
        priority: this.priority,
        kPeriod: this.kPeriod,
        dPeriod: this.dPeriod,
      },
    };
  }

  // ===== INTERFACE IMPLEMENTATION (IAnalyzer) =====

  /**
   * Get analyzer type name
   * @returns AnalyzerType.STOCHASTIC
   */
  getType(): string {
    return AnalyzerType.STOCHASTIC;
  }

  /**
   * Check if analyzer has enough data
   * @param candles Array of candles
   * @returns true if enough candles, false otherwise
   */
  isReady(candles: Candle[]): boolean {
    return candles && Array.isArray(candles) && candles.length >= MIN_CANDLES_FOR_STOCHASTIC;
  }

  /**
   * Get minimum candles required for analysis
   * @returns Min candle count needed
   */
  getMinCandlesRequired(): number {
    return MIN_CANDLES_FOR_STOCHASTIC;
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
    return 0.95;
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
    kPeriod: number;
    dPeriod: number;
  } {
    return {
      enabled: this.enabled,
      weight: this.weight,
      priority: this.priority,
      kPeriod: this.kPeriod,
      dPeriod: this.dPeriod,
    };
  }
}
