/**
 * Breakout Analyzer NEW - with ConfigNew Support
 * Detects breakouts from consolidation/resistance zones
 *
 * Signal Logic:
 * - Price breaks above resistance + expanding bands: LONG signal
 * - Price breaks below support + expanding bands: SHORT signal
 * - Normal range trading: HOLD signal
 *
 * Confidence Calculation:
 * - Based on strength of price momentum and volume confirmation
 */

import type { Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';
import type { SignalDirection } from '../types/enums';
import type { BreakoutAnalyzerConfigNew } from '../types/config-new.types';
import { SignalDirection as SignalDirectionEnum } from '../types/enums';
import type { LoggerService } from '../services/logger.service';
import { IAnalyzer } from '../types/analyzer.interface';
import { AnalyzerType } from '../types/analyzer-type.enum';

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_CANDLES_FOR_BREAKOUT = 30;
const MIN_CONFIDENCE = 0.1;
const MAX_CONFIDENCE = 0.95;
const RESISTANCE_LOOKBACK = 20; // Look back to find resistance/support
const VOLATILITY_THRESHOLD = 1.5; // ATR multiple for breakout confirmation

// ============================================================================
// BREAKOUT ANALYZER - NEW VERSION
// ============================================================================

export class BreakoutAnalyzerNew implements IAnalyzer {
  private readonly enabled: boolean;
  private readonly weight: number;
  private readonly priority: number;
  private maxConfidence: number = MAX_CONFIDENCE;

  private lastSignal: AnalyzerSignal | null = null;
  private lastHigh: number = 0;
  private lastLow: number = 0;
  private initialized: boolean = false;

  /**
   * Constructor with ConfigNew
   * STRICT - Throws if config is invalid
   */
  constructor(
    config: BreakoutAnalyzerConfigNew,
    private logger?: LoggerService,
  ) {
    // Validate analyzer config
    if (typeof config.enabled !== 'boolean') {
      throw new Error('[BREAKOUT_ANALYZER] Missing or invalid: enabled (boolean)');
    }
    if (typeof config.weight !== 'number' || config.weight < 0 || config.weight > 1) {
      throw new Error('[BREAKOUT_ANALYZER] Missing or invalid: weight (0.0-1.0)');
    }
    if (typeof config.priority !== 'number' || config.priority < 1 || config.priority > 10) {
      throw new Error('[BREAKOUT_ANALYZER] Missing or invalid: priority (1-10)');
    }

    this.enabled = config.enabled;
    this.weight = config.weight;
    this.priority = config.priority;
  }

  /**
   * Analyze candles and generate breakout signal
   *
   * @param candles - Array of candles
   * @returns AnalyzerSignal with direction, confidence, and weight
   * @throws {Error} If not enabled, not enough candles, or invalid input
   */
  analyze(candles: Candle[]): AnalyzerSignal {
    if (!this.enabled) {
      throw new Error('[BREAKOUT_ANALYZER] Analyzer is disabled');
    }

    if (!Array.isArray(candles)) {
      throw new Error('[BREAKOUT_ANALYZER] Invalid candles input (must be array)');
    }

    if (candles.length < MIN_CANDLES_FOR_BREAKOUT) {
      throw new Error(
        `[BREAKOUT_ANALYZER] Not enough candles. Need ${MIN_CANDLES_FOR_BREAKOUT}, got ${candles.length}`,
      );
    }

    // Validate candles
    for (let i = 0; i < candles.length; i++) {
      if (!candles[i] || typeof candles[i].high !== 'number' || typeof candles[i].low !== 'number' || typeof candles[i].close !== 'number') {
        throw new Error(`[BREAKOUT_ANALYZER] Invalid candle at index ${i}`);
      }
    }

    // Calculate resistance and support levels
    const levels = this.calculateLevels(candles);

    // Detect breakout
    const breakout = this.detectBreakout(candles, levels);

    // Determine signal direction
    const direction = this.getDirection(breakout);

    // Calculate confidence
    const confidence = this.calculateConfidence(breakout);

    // Create signal
    const signal: AnalyzerSignal = {
      source: 'BREAKOUT_ANALYZER',
      direction,
      confidence,
      weight: this.weight,
      priority: this.priority,
      score: (confidence / 100) * this.weight,
    };

    this.lastSignal = signal;
    this.lastHigh = levels.resistance;
    this.lastLow = levels.support;
    this.initialized = true;

    this.logger?.debug('[BREAKOUT_ANALYZER] Generated signal', {
      direction,
      confidence,
      breakoutType: breakout.type,
      strength: breakout.strength,
    });

    return signal;
  }

  /**
   * Calculate resistance and support levels
   *
   * @private
   * @param candles - Array of candles
   * @returns Levels object with resistance and support
   */
  private calculateLevels(candles: Candle[]): { resistance: number; support: number } {
    const lookback = Math.min(RESISTANCE_LOOKBACK, candles.length);
    const recentCandles = candles.slice(-lookback);

    const highs = recentCandles.map((c) => c.high);
    const lows = recentCandles.map((c) => c.low);

    const resistance = Math.max(...highs);
    const support = Math.min(...lows);

    return { resistance, support };
  }

  /**
   * Detect breakout
   *
   * @private
   * @param candles - Array of candles
   * @param levels - Resistance and support levels
   * @returns Breakout information
   */
  private detectBreakout(
    candles: Candle[],
    levels: { resistance: number; support: number },
  ): {
    type: 'NONE' | 'BULLISH' | 'BEARISH';
    strength: number;
    momentum: number;
  } {
    const currentCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];
    const avgVolume = candles.slice(-20).reduce((sum, c) => sum + (c.volume || 0), 0) / 20;

    // Calculate volatility (ATR-like)
    const atr = this.calculateATR(candles.slice(-14));

    // Check for upside breakout
    if (currentCandle.high > levels.resistance) {
      const momentum = (currentCandle.close - prevCandle.close) / prevCandle.close;
      const volumeRatio = (currentCandle.volume || 0) / avgVolume;
      const strength = Math.min(1, Math.abs(momentum) * 10 + (volumeRatio > 1.5 ? 0.3 : 0));

      return {
        type: 'BULLISH',
        strength,
        momentum,
      };
    }

    // Check for downside breakout
    if (currentCandle.low < levels.support) {
      const momentum = (prevCandle.close - currentCandle.close) / prevCandle.close;
      const volumeRatio = (currentCandle.volume || 0) / avgVolume;
      const strength = Math.min(1, Math.abs(momentum) * 10 + (volumeRatio > 1.5 ? 0.3 : 0));

      return {
        type: 'BEARISH',
        strength,
        momentum,
      };
    }

    return { type: 'NONE', strength: 0, momentum: 0 };
  }

  /**
   * Calculate ATR (Average True Range)
   *
   * @private
   * @param candles - Array of candles (14 period)
   * @returns ATR value
   */
  private calculateATR(candles: Candle[]): number {
    if (candles.length === 0) return 0;

    let sumTR = 0;
    for (let i = 0; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const closeI = i > 0 ? candles[i - 1].close : candles[i].close;

      const tr = Math.max(high - low, Math.abs(high - closeI), Math.abs(low - closeI));
      sumTR += tr;
    }

    return sumTR / candles.length;
  }

  /**
   * Determine signal direction based on breakout
   *
   * @private
   * @param breakout - Breakout information
   * @returns SignalDirection
   */
  private getDirection(breakout: { type: 'NONE' | 'BULLISH' | 'BEARISH' }): SignalDirection {
    if (breakout.type === 'BULLISH') {
      return SignalDirectionEnum.LONG;
    } else if (breakout.type === 'BEARISH') {
      return SignalDirectionEnum.SHORT;
    } else {
      return SignalDirectionEnum.HOLD;
    }
  }

  /**
   * Calculate confidence based on breakout strength
   *
   * @private
   * @param breakout - Breakout information
   * @returns Confidence value (0-100 scale)
   */
  private calculateConfidence(breakout: {
    type: 'NONE' | 'BULLISH' | 'BEARISH';
    strength: number;
  }): number {
    let confidence: number;

    if (breakout.type === 'NONE') {
      confidence = MIN_CONFIDENCE;
    } else {
      confidence = MIN_CONFIDENCE + breakout.strength * (MAX_CONFIDENCE - MIN_CONFIDENCE);
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
    this.lastHigh = 0;
    this.lastLow = 0;
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
    return AnalyzerType.BREAKOUT;
  }

  /**
   * Check if analyzer has enough data
   */
  isReady(candles: Candle[]): boolean {
    return candles && Array.isArray(candles) && candles.length >= MIN_CANDLES_FOR_BREAKOUT;
  }

  /**
   * Get minimum candles required
   */
  getMinCandlesRequired(): number {
    return MIN_CANDLES_FOR_BREAKOUT;
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
