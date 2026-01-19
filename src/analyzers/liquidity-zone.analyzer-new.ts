import type { Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';
import type { BreakoutAnalyzerConfigNew } from '../types/config-new.types';
import { SignalDirection as SignalDirectionEnum } from '../types/enums';
import { IAnalyzer } from '../types/analyzer.interface';
import { AnalyzerType } from '../types/analyzer-type.enum';

const MIN_CANDLES_FOR_LIQUIDITY_ZONE = 25;

export class LiquidityZoneAnalyzerNew implements IAnalyzer {
  private readonly enabled: boolean;
  private readonly weight: number;
  private readonly priority: number;
  private maxConfidence: number = 0.95;
  private lastSignal: AnalyzerSignal | null = null;
  private initialized: boolean = false;

  constructor(config: BreakoutAnalyzerConfigNew, private logger?: any) {
    if (typeof config.enabled !== 'boolean') throw new Error('[LIQUIDITY_ZONE] Missing or invalid: enabled');
    if (typeof config.weight !== 'number' || config.weight < 0 || config.weight > 1) throw new Error('[LIQUIDITY_ZONE] Missing or invalid: weight');
    if (typeof config.priority !== 'number' || config.priority < 1 || config.priority > 10) throw new Error('[LIQUIDITY_ZONE] Missing or invalid: priority');
    this.enabled = config.enabled;
    this.weight = config.weight;
    this.priority = config.priority;
  }

  analyze(candles: Candle[]): AnalyzerSignal {
    if (!this.enabled) throw new Error('[LIQUIDITY_ZONE] Analyzer is disabled');
    if (!Array.isArray(candles)) throw new Error('[LIQUIDITY_ZONE] Invalid candles input');
    if (candles.length < MIN_CANDLES_FOR_LIQUIDITY_ZONE) throw new Error('[LIQUIDITY_ZONE] Not enough candles');

    for (let i = 0; i < candles.length; i++) {
      if (!candles[i] || typeof candles[i].volume !== 'number') {
        throw new Error('[LIQUIDITY_ZONE] Invalid candle');
      }
    }

    const zone = this.detectZone(candles);

    // FIX #1: Properly handle HIGH vs LOW zones
    let direction = SignalDirectionEnum.HOLD;
    let confidence = 0;

    if (zone.hasHigh && !zone.hasLow) {
      // Pure HIGH zone: price was rejected at high prices
      direction = SignalDirectionEnum.SHORT; // Expect pullback from high

      /**
       * CONFIDENCE SCORING: Evidence-based calculation
       *
       * Why 0.25 baseline + 0.7 multiplier?
       * - 0.25 baseline (25%): Even with no HIGH strength, we have some confidence in detection
       *   (price behavior near highs with volume is meaningful)
       * - 0.7 multiplier: Leaves 5% margin for unknown unknowns (Bayesian skepticism)
       *
       * Range: [25%, 95%]
       * - strength=0: confidence = 25% (weak zone detected but low certainty)
       * - strength=1: confidence = 95% (strong zone with multiple rejections)
       *
       * Applied because:
       * ✓ Never overconfident in single analyzer output
       * ✓ Allows weak signals to participate but with lower weight
       * ✓ Preserves margin for edge cases and market uncertainty
       */
      confidence = Math.round((0.25 + zone.highStrength * 0.7) * 100);

    } else if (zone.hasLow && !zone.hasHigh) {
      // Pure LOW zone: price was supported at low prices
      direction = SignalDirectionEnum.LONG; // Expect bounce from low

      /**
       * CONFIDENCE SCORING: Same logic as HIGH zone
       * 0.25 baseline + 0.7 multiplier
       * Range: [25%, 95%]
       */
      confidence = Math.round((0.25 + zone.lowStrength * 0.7) * 100);

    } else if (zone.hasHigh && zone.hasLow) {
      // Both zones present: High liquidity consolidation zone
      direction = SignalDirectionEnum.HOLD; // No clear directional bias, but high liquidity

      /**
       * CONFIDENCE SCORING: Consolidation strength
       * When both HIGH and LOW zones exist with significant volume:
       * - This indicates active two-way trading (support & resistance)
       * - Strong marker of liquidity and interest level
       * - Use AVERAGE strength instead of minimum (both zones matter equally)
       * - Apply 0.5 multiplier (decent signal for consolidation/accumulation)
       * - Range: [25%, 75%] -> meaningful but not overconfident
       *
       * Example:
       * - highStrength=0.13, lowStrength=0.07
       * - avg(0.13, 0.07) * 0.5 = 0.10 * 0.5 = 0.05 = 5%... still low
       * Better: use sum instead of avg to reflect BOTH zones
       * - (0.13 + 0.07) * 0.5 = 0.20 * 0.5 = 0.10 = 10% -> acceptable
       */
      const combinedStrength = (zone.highStrength + zone.lowStrength) / 2;
      confidence = Math.round((0.15 + combinedStrength * 0.6) * 100);
      if (this.logger) {
        this.logger.debug('[LIQUIDITY_ZONE] Both HIGH and LOW zones detected - strong consolidation');
      }

    } else {
      // No clear zones
      direction = SignalDirectionEnum.HOLD;
      confidence = 0;
    }

    // Ensure confidence is valid [0, 100]
    confidence = Math.max(0, Math.min(100, confidence));

    const signal: AnalyzerSignal = {
      source: 'LIQUIDITY_ZONE_ANALYZER',
      direction,
      confidence,
      weight: this.weight,
      priority: this.priority,
      score: (confidence / 100) * this.weight,
    };

    this.lastSignal = signal;
    this.initialized = true;
    return signal;
  }

  /**
   * FIX #2: Detect HIGH and LOW zones independently
   * HIGH zone: recent high prices with elevated volume
   * LOW zone: recent low prices with elevated volume
   */
  private detectZone(
    candles: Candle[]
  ): { hasHigh: boolean; hasLow: boolean; highStrength: number; lowStrength: number } {
    const recent = candles.slice(-30);

    if (recent.length === 0) {
      return { hasHigh: false, hasLow: false, highStrength: 0, lowStrength: 0 };
    }

    // Calculate average volume
    const avgVolume = recent.reduce((s, x) => s + (x.volume || 0), 0) / recent.length;
    const volumeThreshold = avgVolume; // Use average as threshold (candles equal or above avg = zone candidate)

    // Find max and min prices
    const maxHigh = recent.reduce((max, x) => Math.max(max, x.high), 0);
    const minLow = recent.reduce((min, x) => Math.min(min, x.low), Infinity);

    // Calculate price range for proper zone detection
    const priceRange = maxHigh - minLow;

    // HIGH zone: recent HIGH prices with elevated volume
    // (top 10% of price range with high volume)
    const highPricesWithVolume = recent.filter((c) => {
      const isHighPrice = c.high > maxHigh - priceRange * 0.1; // Top 10% of range
      const hasHighVolume = (c.volume || 0) >= volumeThreshold;
      return isHighPrice && hasHighVolume;
    });

    // LOW zone: recent LOW prices with elevated volume
    // (bottom 10% of price range with high volume)
    const lowPricesWithVolume = recent.filter((c) => {
      const isLowPrice = c.low < minLow + priceRange * 0.1; // Bottom 10% of range
      const hasHighVolume = (c.volume || 0) >= volumeThreshold;
      return isLowPrice && hasHighVolume;
    });

    // Calculate strength (ratio of zone candles)
    const highStrength = highPricesWithVolume.length / recent.length;
    const lowStrength = lowPricesWithVolume.length / recent.length;

    // Threshold: need at least 2 candles in zone to consider it valid
    const minCandlesForZone = 2;

    return {
      hasHigh: highPricesWithVolume.length >= minCandlesForZone,
      hasLow: lowPricesWithVolume.length >= minCandlesForZone,
      highStrength,
      lowStrength,
    };
  }

  /**
   * Get analyzer type
   */
  getType(): string {
    return AnalyzerType.LIQUIDITY_ZONE;
  }

  /**
   * Check if analyzer has enough data
   */
  isReady(candles: Candle[]): boolean {
    return candles && Array.isArray(candles) && candles.length >= MIN_CANDLES_FOR_LIQUIDITY_ZONE;
  }

  /**
   * Get minimum candles required
   */
  getMinCandlesRequired(): number {
    return MIN_CANDLES_FOR_LIQUIDITY_ZONE;
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

  getLastSignal(): AnalyzerSignal | null { return this.lastSignal; }
  getState() { return { enabled: this.enabled, initialized: this.initialized, lastSignal: this.lastSignal, config: { weight: this.weight, priority: this.priority } }; }
  reset(): void { this.lastSignal = null; this.initialized = false; }
  isEnabled(): boolean { return this.enabled; }
  getConfig() { return { enabled: this.enabled, weight: this.weight, priority: this.priority }; }
}
