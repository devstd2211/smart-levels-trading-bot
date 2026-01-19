/**
 * Divergence Analyzer NEW - with ConfigNew Support
 * Detects divergences between price action and RSI indicator
 *
 * Divergences are powerful reversal signals:
 * - BULLISH DIVERGENCE: Price makes lower low, RSI makes higher low → Potential reversal UP
 * - BEARISH DIVERGENCE: Price makes higher high, RSI makes lower high → Potential reversal DOWN
 *
 * Signal Logic:
 * - Bullish divergence detected: LONG signal
 * - Bearish divergence detected: SHORT signal
 * - No divergence: HOLD signal
 *
 * Confidence Calculation:
 * - Based on divergence strength (price diff + RSI diff magnitude)
 * - Stronger divergences = higher confidence
 */

import type { Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';
import type { SignalDirection } from '../types/enums';
import type { DivergenceAnalyzerConfigNew } from '../types/config-new.types';
import { SignalDirection as SignalDirectionEnum } from '../types/enums';
import { RSIIndicatorNew } from '../indicators/rsi.indicator-new';
import type { LoggerService } from '../services/logger.service';
import { IAnalyzer } from '../types/analyzer.interface';
import { AnalyzerType } from '../types/analyzer-type.enum';

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_CANDLES_FOR_DIVERGENCE = 50; // Need enough candles to find swing points
const MIN_CONFIDENCE = 0.1; // Minimum confidence floor (10%)
const MAX_CONFIDENCE = 0.95; // Maximum confidence (from config)
const MIN_PRICE_DIFF_PERCENT = 1.0; // Minimum price movement for divergence
const MIN_RSI_DIFF_POINTS = 5; // Minimum RSI movement for divergence
const SWING_LOOKBACK = 10; // Look back N candles to find swing points

// ============================================================================
// DIVERGENCE ANALYZER - NEW VERSION
// ============================================================================

export class DivergenceAnalyzerNew implements IAnalyzer {
  private readonly enabled: boolean;
  private readonly weight: number;
  private readonly priority: number;
  private readonly maxConfidence: number;

  private rsiIndicator: RSIIndicatorNew;
  private lastSignal: AnalyzerSignal | null = null;
  private initialized: boolean = false;

  /**
   * Constructor with ConfigNew
   * STRICT - Throws if config is invalid
   */
  constructor(
    config: DivergenceAnalyzerConfigNew,
    private logger?: LoggerService,
  ) {
    // Validate analyzer config
    if (typeof config.enabled !== 'boolean') {
      throw new Error('[DIVERGENCE_ANALYZER] Missing or invalid: enabled (boolean)');
    }
    if (typeof config.weight !== 'number' || config.weight < 0 || config.weight > 1) {
      throw new Error('[DIVERGENCE_ANALYZER] Missing or invalid: weight (0.0-1.0)');
    }
    if (typeof config.priority !== 'number' || config.priority < 1 || config.priority > 10) {
      throw new Error('[DIVERGENCE_ANALYZER] Missing or invalid: priority (1-10)');
    }
    if (typeof config.maxConfidence !== 'number' || config.maxConfidence < 0.1 || config.maxConfidence > 1) {
      throw new Error('[DIVERGENCE_ANALYZER] Missing or invalid: maxConfidence (0.1-1.0)');
    }

    this.enabled = config.enabled;
    this.weight = config.weight;
    this.priority = config.priority;
    this.maxConfidence = config.maxConfidence;

    // Create RSI indicator for divergence detection
    this.rsiIndicator = new RSIIndicatorNew({
      enabled: true,
      period: 14,
      oversold: 30,
      overbought: 70,
      extreme: { low: 5, high: 95 },
      neutralZone: { min: 40, max: 60 },
      maxConfidence: 0.95,
    });
  }

  /**
   * Analyze candles and generate divergence signal
   *
   * @param candles - Array of candles
   * @returns AnalyzerSignal with direction, confidence, and weight
   * @throws {Error} If not enabled, not enough candles, or invalid input
   */
  analyze(candles: Candle[]): AnalyzerSignal {
    if (!this.enabled) {
      throw new Error('[DIVERGENCE_ANALYZER] Analyzer is disabled');
    }

    if (!Array.isArray(candles)) {
      throw new Error('[DIVERGENCE_ANALYZER] Invalid candles input (must be array)');
    }

    if (candles.length < MIN_CANDLES_FOR_DIVERGENCE) {
      throw new Error(
        `[DIVERGENCE_ANALYZER] Not enough candles. Need ${MIN_CANDLES_FOR_DIVERGENCE}, got ${candles.length}`,
      );
    }

    // Validate candles
    for (let i = 0; i < candles.length; i++) {
      if (
        !candles[i] ||
        typeof candles[i].high !== 'number' ||
        typeof candles[i].low !== 'number' ||
        typeof candles[i].close !== 'number'
      ) {
        throw new Error(`[DIVERGENCE_ANALYZER] Invalid candle at index ${i}`);
      }
    }

    // Calculate RSI for all candles
    const rsiValues = this.calculateRSI(candles);

    // Detect divergence
    const divergence = this.detectDivergence(candles, rsiValues);

    // Determine signal direction based on divergence
    const direction = this.getDirection(divergence);

    // Calculate confidence based on divergence strength
    const confidence = this.calculateConfidence(divergence);

    // Create signal
    const signal: AnalyzerSignal = {
      source: 'DIVERGENCE_ANALYZER',
      direction,
      confidence,
      weight: this.weight,
      priority: this.priority,
      score: (confidence / 100) * this.weight,
    };

    this.lastSignal = signal;
    this.initialized = true;

    this.logger?.debug('[DIVERGENCE_ANALYZER] Generated signal', {
      direction,
      confidence,
      divergenceType: divergence.type,
      strength: divergence.strength,
    });

    return signal;
  }

  /**
   * Calculate RSI values for all candles
   *
   * @private
   * @param candles - Array of candles
   * @returns Array of RSI values
   */
  private calculateRSI(candles: Candle[]): number[] {
    const rsiValues: number[] = [];

    // For each candle, calculate RSI up to that point
    for (let i = 13; i < candles.length; i++) {
      const sliceCandles = candles.slice(0, i + 1);
      try {
        const rsiValue = this.rsiIndicator.calculate(sliceCandles);
        rsiValues.push(rsiValue);
      } catch {
        // If we can't calculate RSI for this point, use NaN
        rsiValues.push(NaN);
      }
    }

    return rsiValues;
  }

  /**
   * Detect divergence between price and RSI
   *
   * @private
   * @param candles - Array of candles
   * @param rsiValues - Array of RSI values (parallel to candles)
   * @returns Divergence information
   */
  private detectDivergence(
    candles: Candle[],
    rsiValues: number[],
  ): {
    type: 'NONE' | 'BULLISH' | 'BEARISH';
    strength: number;
    priceDiff: number;
    rsiDiff: number;
  } {
    // Find swing points (local highs and lows)
    const lastN = Math.min(SWING_LOOKBACK, candles.length - 1);
    const recentCandles = candles.slice(-lastN);
    const recentRsi = rsiValues.slice(-lastN);

    // Find last two highs (for bearish divergence)
    const highs = this.findSwingHighs(recentCandles, recentRsi);

    // Find last two lows (for bullish divergence)
    const lows = this.findSwingLows(recentCandles, recentRsi);

    // Check for bearish divergence (price HH, RSI LH)
    if (highs.length >= 2) {
      const divergence = this.checkBearishDivergence(highs[0], highs[1]);
      if (divergence.type === 'BEARISH') {
        return divergence;
      }
    }

    // Check for bullish divergence (price LL, RSI HL)
    if (lows.length >= 2) {
      const divergence = this.checkBullishDivergence(lows[0], lows[1]);
      if (divergence.type === 'BULLISH') {
        return divergence;
      }
    }

    return { type: 'NONE', strength: 0, priceDiff: 0, rsiDiff: 0 };
  }

  /**
   * Find swing highs in recent candles
   *
   * @private
   * @param candles - Recent candles
   * @param rsiValues - Corresponding RSI values
   * @returns Array of swing high points [{index, high, rsi}]
   */
  private findSwingHighs(
    candles: Candle[],
    rsiValues: number[],
  ): Array<{ index: number; high: number; rsi: number }> {
    const highs: Array<{ index: number; high: number; rsi: number }> = [];

    for (let i = 1; i < candles.length - 1; i++) {
      const prevHigh = candles[i - 1].high;
      const currentHigh = candles[i].high;
      const nextHigh = candles[i + 1].high;

      // Swing high: local maximum
      if (currentHigh > prevHigh && currentHigh > nextHigh) {
        const rsi = rsiValues[i];
        if (!isNaN(rsi)) {
          highs.push({ index: i, high: currentHigh, rsi });
        }
      }
    }

    return highs;
  }

  /**
   * Find swing lows in recent candles
   *
   * @private
   * @param candles - Recent candles
   * @param rsiValues - Corresponding RSI values
   * @returns Array of swing low points [{index, low, rsi}]
   */
  private findSwingLows(
    candles: Candle[],
    rsiValues: number[],
  ): Array<{ index: number; low: number; rsi: number }> {
    const lows: Array<{ index: number; low: number; rsi: number }> = [];

    for (let i = 1; i < candles.length - 1; i++) {
      const prevLow = candles[i - 1].low;
      const currentLow = candles[i].low;
      const nextLow = candles[i + 1].low;

      // Swing low: local minimum
      if (currentLow < prevLow && currentLow < nextLow) {
        const rsi = rsiValues[i];
        if (!isNaN(rsi)) {
          lows.push({ index: i, low: currentLow, rsi });
        }
      }
    }

    return lows;
  }

  /**
   * Check for bearish divergence (price HH, RSI LH)
   *
   * @private
   * @param oldHigh - Earlier swing high
   * @param recentHigh - Recent swing high
   * @returns Divergence result
   */
  private checkBearishDivergence(
    oldHigh: { index: number; high: number; rsi: number },
    recentHigh: { index: number; high: number; rsi: number },
  ): {
    type: 'NONE' | 'BULLISH' | 'BEARISH';
    strength: number;
    priceDiff: number;
    rsiDiff: number;
  } {
    // Bearish: price makes higher high, RSI makes lower high
    const priceIsHigher = recentHigh.high > oldHigh.high;
    const rsiIsLower = recentHigh.rsi < oldHigh.rsi;

    if (priceIsHigher && rsiIsLower) {
      const priceDiff = ((recentHigh.high - oldHigh.high) / oldHigh.high) * 100;
      const rsiDiff = Math.abs(oldHigh.rsi - recentHigh.rsi);

      // Check if differences are significant
      if (priceDiff >= MIN_PRICE_DIFF_PERCENT && rsiDiff >= MIN_RSI_DIFF_POINTS) {
        const strength = this.calculateDivergenceStrength(priceDiff, rsiDiff);
        return {
          type: 'BEARISH',
          strength,
          priceDiff,
          rsiDiff,
        };
      }
    }

    return { type: 'NONE', strength: 0, priceDiff: 0, rsiDiff: 0 };
  }

  /**
   * Check for bullish divergence (price LL, RSI HL)
   *
   * @private
   * @param oldLow - Earlier swing low
   * @param recentLow - Recent swing low
   * @returns Divergence result
   */
  private checkBullishDivergence(
    oldLow: { index: number; low: number; rsi: number },
    recentLow: { index: number; low: number; rsi: number },
  ): {
    type: 'NONE' | 'BULLISH' | 'BEARISH';
    strength: number;
    priceDiff: number;
    rsiDiff: number;
  } {
    // Bullish: price makes lower low, RSI makes higher low
    const priceIsLower = recentLow.low < oldLow.low;
    const rsiIsHigher = recentLow.rsi > oldLow.rsi;

    if (priceIsLower && rsiIsHigher) {
      const priceDiff = ((oldLow.low - recentLow.low) / oldLow.low) * 100;
      const rsiDiff = Math.abs(recentLow.rsi - oldLow.rsi);

      // Check if differences are significant
      if (priceDiff >= MIN_PRICE_DIFF_PERCENT && rsiDiff >= MIN_RSI_DIFF_POINTS) {
        const strength = this.calculateDivergenceStrength(priceDiff, rsiDiff);
        return {
          type: 'BULLISH',
          strength,
          priceDiff,
          rsiDiff,
        };
      }
    }

    return { type: 'NONE', strength: 0, priceDiff: 0, rsiDiff: 0 };
  }

  /**
   * Calculate divergence strength (0-1)
   *
   * @private
   * @param priceDiffPercent - Price difference percentage
   * @param rsiDiff - RSI difference in points (0-100)
   * @returns Strength value (0-1)
   */
  private calculateDivergenceStrength(priceDiffPercent: number, rsiDiff: number): number {
    // Normalize price diff (0-5% range)
    const priceScore = Math.min(priceDiffPercent / 5, 1);

    // Normalize RSI diff (0-20 points range)
    const rsiScore = Math.min(rsiDiff / 20, 1);

    // Average of both scores
    const strength = (priceScore + rsiScore) / 2;

    return Math.max(MIN_CONFIDENCE, Math.min(strength, 1));
  }

  /**
   * Determine signal direction based on divergence type
   *
   * @private
   * @param divergence - Divergence information
   * @returns SignalDirection
   */
  private getDirection(divergence: {
    type: 'NONE' | 'BULLISH' | 'BEARISH';
    strength: number;
  }): SignalDirection {
    if (divergence.type === 'BULLISH') {
      return SignalDirectionEnum.LONG;
    } else if (divergence.type === 'BEARISH') {
      return SignalDirectionEnum.SHORT;
    } else {
      return SignalDirectionEnum.HOLD;
    }
  }

  /**
   * Calculate confidence based on divergence strength
   *
   * @private
   * @param divergence - Divergence information
   * @returns Confidence value (0-100 scale)
   */
  private calculateConfidence(divergence: {
    type: 'NONE' | 'BULLISH' | 'BEARISH';
    strength: number;
  }): number {
    let confidence: number;

    if (divergence.type === 'NONE') {
      // No divergence: low confidence
      confidence = MIN_CONFIDENCE;
    } else {
      // Divergence found: confidence based on strength
      confidence = MIN_CONFIDENCE + divergence.strength * (this.maxConfidence - MIN_CONFIDENCE);
    }

    // Clamp to bounds
    confidence = Math.max(MIN_CONFIDENCE, Math.min(this.maxConfidence, confidence));

    // Convert to 0-100 scale
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
        maxConfidence: this.maxConfidence,
      },
    };
  }

  /**
   * Reset analyzer state
   */
  reset(): void {
    this.rsiIndicator.reset();
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
    return AnalyzerType.DIVERGENCE;
  }

  /**
   * Check if analyzer has enough data
   */
  isReady(candles: Candle[]): boolean {
    return candles && Array.isArray(candles) && candles.length >= MIN_CANDLES_FOR_DIVERGENCE;
  }

  /**
   * Get minimum candles required
   */
  getMinCandlesRequired(): number {
    return MIN_CANDLES_FOR_DIVERGENCE;
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
    maxConfidence: number;
  } {
    return {
      enabled: this.enabled,
      weight: this.weight,
      priority: this.priority,
      maxConfidence: this.maxConfidence,
    };
  }
}
