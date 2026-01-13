import type { Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';
import type { BreakoutAnalyzerConfigNew } from '../types/config-new.types';
import { SignalDirection as SignalDirectionEnum } from '../types/enums';

export class OrderBlockAnalyzerNew {
  private readonly enabled: boolean;
  private readonly weight: number;
  private readonly priority: number;
  private lastSignal: AnalyzerSignal | null = null;
  private initialized: boolean = false;

  constructor(config: BreakoutAnalyzerConfigNew, private logger?: any) {
    if (typeof config.enabled !== 'boolean') throw new Error('[ORDER_BLOCK] Missing or invalid: enabled');
    if (typeof config.weight !== 'number' || config.weight < 0 || config.weight > 1) throw new Error('[ORDER_BLOCK] Missing or invalid: weight');
    if (typeof config.priority !== 'number' || config.priority < 1 || config.priority > 10) throw new Error('[ORDER_BLOCK] Missing or invalid: priority');
    this.enabled = config.enabled;
    this.weight = config.weight;
    this.priority = config.priority;
  }

  analyze(candles: Candle[]): AnalyzerSignal {
    if (!this.enabled) throw new Error('[ORDER_BLOCK] Analyzer is disabled');
    if (!Array.isArray(candles)) throw new Error('[ORDER_BLOCK] Invalid candles input');
    if (candles.length < 25) throw new Error('[ORDER_BLOCK] Not enough candles');

    for (let i = 0; i < candles.length; i++) {
      if (!candles[i] || typeof candles[i].close !== 'number') {
        throw new Error('[ORDER_BLOCK] Invalid candle');
      }
    }

    const block = this.detectBlock(candles);

    // FIX #1: Only generate signal if block is relevant (close to current price)
    if (block.type === 'NONE' || !block.isRelevant) {
      const signal: AnalyzerSignal = {
        source: 'ORDER_BLOCK_ANALYZER',
        direction: SignalDirectionEnum.HOLD,
        confidence: 0,
        weight: this.weight,
        priority: this.priority,
        score: 0,
      };
      this.lastSignal = signal;
      this.initialized = true;
      return signal;
    }

    // FIX #2: Use proper confidence based on strength
    const direction = block.type === 'BULLISH' ? SignalDirectionEnum.LONG : SignalDirectionEnum.SHORT;

    /**
     * CONFIDENCE SCORING: Evidence-based calculation for Order Blocks
     *
     * Why 0.15 baseline + 0.8 multiplier?
     * - 0.15 baseline (15%): Even with low strength, we detected a rejection pattern
     *   (wick ratio >= 1.5x body) which has meaning
     * - 0.8 multiplier: Maximum possible is 95% (Bayesian skepticism)
     *
     * Range: [15%, 95%]
     * - strength=0: confidence = 15% (block detected but very weak)
     * - strength=1: confidence = 95% (multiple strong rejections at same level, price near block)
     *
     * Why different from LiquidityZone?
     * - Order blocks require explicit wick rejection (higher bar)
     * - Start at 15% instead of 25% (harder to confirm)
     * - But when strong, reach same 95% max (both analyzers equal weight)
     *
     * Applied because:
     * ✓ Reflects SMC theory: rejections are meaningful pattern
     * ✓ Distance penalty already applied in strength calculation
     * ✓ Prevents overconfidence in noisy wicks
     */
    const confidence = Math.round((0.15 + block.strength * 0.8) * 100);

    const signal: AnalyzerSignal = {
      source: 'ORDER_BLOCK_ANALYZER',
      direction,
      confidence: Math.max(0, Math.min(100, confidence)),
      weight: this.weight,
      priority: this.priority,
      score: (confidence / 100) * this.weight,
    };

    this.lastSignal = signal;
    this.initialized = true;
    return signal;
  }

  /**
   * FIX #3: Detect REAL order blocks using wick rejection
   *
   * ORDER BLOCK THEORY (SMC):
   * - Bullish OB: Price tried to go down, but got rejected (big lower wick)
   * - Bearish OB: Price tried to go up, but got rejected (big upper wick)
   *
   * Detection:
   * 1. Find candles with wick > 1.5x body size (rejection signal)
   * 2. Count rejections at each price level
   * 3. Find the most relevant block (closest to current price)
   * 4. Calculate strength based on: rejection count + proximity
   */
  private detectBlock(
    candles: Candle[]
  ): {
    type: 'BULLISH' | 'BEARISH' | 'NONE';
    strength: number;
    blockLevel?: number;
    distance?: number;
    isRelevant: boolean;
  } {
    const recent = candles.slice(-10);
    const lastCandle = candles[candles.length - 1];

    if (recent.length < 3) {
      return { type: 'NONE', strength: 0, isRelevant: false };
    }

    // Helper: Calculate wick-to-body ratios
    const getWickRatio = (
      c: Candle
    ): { upper: number; lower: number; body: number } => {
      const body = Math.abs(c.close - c.open);
      const upperWick = c.high - Math.max(c.open, c.close);
      const lowerWick = Math.min(c.open, c.close) - c.low;

      return {
        upper: body > 0 ? upperWick / body : 0,
        lower: body > 0 ? lowerWick / body : 0,
        body,
      };
    };

    // FIX #4: Find rejections (wick > 1.5x body)
    // BEARISH rejection: upper wick (price went up, got rejected)
    const bearishRejections = recent
      .map((c, i) => {
        const wick = getWickRatio(c);
        return {
          index: i,
          candle: c,
          level: c.high, // Top of rejection wick
          wickRatio: wick.upper,
          body: wick.body,
          isRejection: wick.upper >= 1.5 && wick.body > 0,
        };
      })
      .filter((x) => x.isRejection);

    // BULLISH rejection: lower wick (price went down, got rejected)
    const bullishRejections = recent
      .map((c, i) => {
        const wick = getWickRatio(c);
        return {
          index: i,
          candle: c,
          level: c.low, // Bottom of rejection wick
          wickRatio: wick.lower,
          body: wick.body,
          isRejection: wick.lower >= 1.5 && wick.body > 0,
        };
      })
      .filter((x) => x.isRejection);

    // FIX #5: Find most relevant block (closest to current price)
    interface BlockCandidate {
      type: 'BULLISH' | 'BEARISH';
      level: number;
      distance: number;
      rejections: any[];
    }

    let bestBlock: BlockCandidate | null = null;
    let minDistance = Infinity;

    // Check bearish rejections → BULLISH order block
    if (bearishRejections.length > 0) {
      // Use most recent rejection as block level
      const blockLevel = bearishRejections[bearishRejections.length - 1].level;
      const distance = Math.abs(lastCandle.close - blockLevel) / blockLevel;

      if (distance < minDistance) {
        minDistance = distance;
        bestBlock = {
          type: 'BULLISH',
          level: blockLevel,
          distance,
          rejections: bearishRejections,
        };
      }
    }

    // Check bullish rejections → BEARISH order block
    if (bullishRejections.length > 0) {
      const blockLevel = bullishRejections[bullishRejections.length - 1].level;
      const distance = Math.abs(lastCandle.close - blockLevel) / blockLevel;

      if (distance < minDistance) {
        minDistance = distance;
        bestBlock = {
          type: 'BEARISH',
          level: blockLevel,
          distance,
          rejections: bullishRejections,
        };
      }
    }

    // No rejections found
    if (!bestBlock) {
      return { type: 'NONE', strength: 0, isRelevant: false };
    }

    // FIX #6: Calculate strength
    // Strength = f(rejectionCount, distance)
    // More rejections = stronger
    // Closer distance = stronger
    const maxDistanceThreshold = 0.05; // 5% distance = full strength
    const maxRejectionCount = 5; // 5+ rejections = max strength

    // Distance factor: 0 at block, 1 when too far
    const distanceFactor = Math.min(1, bestBlock.distance / maxDistanceThreshold);

    // Rejection factor: 0 with no rejections, 1 with many
    const rejectionFactor = Math.min(1, bestBlock.rejections.length / maxRejectionCount);

    // Combined strength: both matter equally
    // At block (distance=0) with many rejections (ratio=1): strength ≈ 1.0
    // Far from block (distance=max) with few rejections: strength ≈ 0
    const strength = (1 - distanceFactor * 0.5) * rejectionFactor;

    // Only consider block relevant if:
    // 1. It has at least 1 rejection (confirmed)
    // 2. Price is within 10% of block level
    const isRelevant =
      bestBlock.rejections.length >= 1 && bestBlock.distance <= 0.1;

    return {
      type: bestBlock.type,
      strength: Math.max(0, Math.min(1, strength)),
      blockLevel: bestBlock.level,
      distance: bestBlock.distance,
      isRelevant,
    };
  }

  getLastSignal(): AnalyzerSignal | null { return this.lastSignal; }
  getState() { return { enabled: this.enabled, initialized: this.initialized, lastSignal: this.lastSignal, config: { weight: this.weight, priority: this.priority } }; }
  reset(): void { this.lastSignal = null; this.initialized = false; }
  isEnabled(): boolean { return this.enabled; }
  getConfig() { return { enabled: this.enabled, weight: this.weight, priority: this.priority }; }
}
