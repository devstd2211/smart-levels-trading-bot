/**
 * LEVEL ANALYZER NEW (WITH SWING POINT DETECTION)
 * Advanced support/resistance level analysis
 *
 * Features:
 * - Swing point detection via SwingPointDetectorService
 * - Multi-level clustering and merging
 * - Level strength based on: touches, recency, volume context
 * - Proximity analysis to current price
 * - Trend-aware signal generation
 */

import type { Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';
import type { LevelAnalyzerConfigNew } from '../types/config-new.types';
import { SignalDirection } from '../types/enums';
import type { LoggerService } from '../services/logger.service';
import { SwingPointDetectorService } from '../services/swing-point-detector.service';

const MIN_CANDLES = 30;
const MIN_CONFIDENCE = 0.15;
const MAX_CONFIDENCE = 0.95;

interface Level {
  price: number;
  type: 'support' | 'resistance';
  touches: number; // How many swing points at this level
  strength: number; // 0-1
  age: number; // How many candles old
  isRecent: boolean; // Within last 15 candles
}

export class LevelAnalyzerNew {
  private readonly enabled: boolean;
  private readonly weight: number;
  private readonly priority: number;
  private lastSignal: AnalyzerSignal | null = null;
  private initialized: boolean = false;

  constructor(
    config: LevelAnalyzerConfigNew,
    private logger?: LoggerService,
    private swingPointDetector?: SwingPointDetectorService,
  ) {
    if (typeof config.enabled !== 'boolean') throw new Error('[LEVEL] Missing or invalid: enabled');
    if (typeof config.weight !== 'number' || config.weight < 0 || config.weight > 1)
      throw new Error('[LEVEL] Missing or invalid: weight');
    if (typeof config.priority !== 'number' || config.priority < 1 || config.priority > 10)
      throw new Error('[LEVEL] Missing or invalid: priority');

    this.enabled = config.enabled;
    this.weight = config.weight;
    this.priority = config.priority;

    if (this.logger && this.swingPointDetector) {
      this.logger.debug('[LEVEL] Initialized with SwingPointDetectorService');
    }
  }

  analyze(candles: Candle[]): AnalyzerSignal {
    if (!this.enabled) throw new Error('[LEVEL] Analyzer is disabled');
    if (!Array.isArray(candles)) throw new Error('[LEVEL] Invalid candles input');
    if (candles.length < MIN_CANDLES) throw new Error(`[LEVEL] Not enough candles`);
    for (let i = 0; i < candles.length; i++) {
      if (!candles[i] || typeof candles[i].close !== 'number')
        throw new Error(`[LEVEL] Invalid candle`);
    }

    const current = candles[candles.length - 1];

    // Detect swing points using injected service
    let supportLevels: Level[] = [];
    let resistanceLevels: Level[] = [];

    if (this.swingPointDetector) {
      // Use swing point detection for better level identification
      const swings = this.swingPointDetector.detectSwingPoints(candles);

      supportLevels = this.buildLevelsFromSwingPoints(
        swings.lows,
        'support',
        candles.length,
      );
      resistanceLevels = this.buildLevelsFromSwingPoints(
        swings.highs,
        'resistance',
        candles.length,
      );
    } else {
      // Fallback: simple local min/max detection
      supportLevels = this.detectSupportLevels(candles, candles.length);
      resistanceLevels = this.detectResistanceLevels(candles, candles.length);
    }

    // Merge clustered levels
    supportLevels = this.mergeLevels(supportLevels);
    resistanceLevels = this.mergeLevels(resistanceLevels);

    // Analyze proximity and generate signal
    const range = this.calculateRange(candles);
    const proximityThreshold = range * 0.02; // 2% of range

    const nearSupport = supportLevels.some((s) => Math.abs(current.close - s.price) < proximityThreshold);
    const nearResistance = resistanceLevels.some((r) => Math.abs(current.close - r.price) < proximityThreshold);

    // Calculate trend
    const trend = this.calculateTrend(candles);

    // Determine direction
    let direction = SignalDirection.HOLD;
    let confidence = MIN_CONFIDENCE;

    if (nearSupport && (trend === 'up' || trend === 'neutral')) {
      direction = SignalDirection.LONG;
      const topSupport = supportLevels[0];
      confidence = Math.min(
        MAX_CONFIDENCE,
        MIN_CONFIDENCE + topSupport.strength * (MAX_CONFIDENCE - MIN_CONFIDENCE),
      );
    } else if (nearResistance && (trend === 'down' || trend === 'neutral')) {
      direction = SignalDirection.SHORT;
      const topResistance = resistanceLevels[0];
      confidence = Math.min(
        MAX_CONFIDENCE,
        MIN_CONFIDENCE + topResistance.strength * (MAX_CONFIDENCE - MIN_CONFIDENCE),
      );
    } else if (nearSupport && trend === 'down' && supportLevels[0]?.touches >= 2) {
      direction = SignalDirection.LONG;
      confidence = MIN_CONFIDENCE + 0.3;
    } else if (nearResistance && trend === 'up' && resistanceLevels[0]?.touches >= 2) {
      direction = SignalDirection.SHORT;
      confidence = MIN_CONFIDENCE + 0.3;
    } else {
      confidence = MIN_CONFIDENCE + (supportLevels.length + resistanceLevels.length) * 0.05;
    }

    const signal: AnalyzerSignal = {
      source: 'LEVEL_ANALYZER',
      direction,
      confidence: Math.round(confidence),
      weight: this.weight,
      priority: this.priority,
      score: (confidence / 100) * this.weight,
    };

    this.lastSignal = signal;
    this.initialized = true;

    return signal;
  }

  /**
   * Build levels from detected swing points
   */
  private buildLevelsFromSwingPoints(swingPoints: any[], type: 'support' | 'resistance', totalCandles: number): Level[] {
    const levels: Level[] = [];
    const tolerance = 0.01; // 1% tolerance for clustering

    for (const sp of swingPoints) {
      const age = totalCandles - (sp.index ?? 0);
      const isRecent = age <= 15;

      let existing = levels.find((l) => Math.abs(l.price - sp.price) / sp.price < tolerance);
      if (existing) {
        existing.touches++;
        existing.age = Math.min(existing.age, age);
        existing.isRecent = existing.isRecent || isRecent;
      } else {
        levels.push({
          price: sp.price,
          type,
          touches: 1,
          strength: 0.5,
          age,
          isRecent,
        });
      }
    }

    // Calculate strength
    levels.forEach((level) => {
      const touchStrength = Math.min(1, level.touches / 4);
      const recencyBonus = level.isRecent ? 0.2 : 0;
      const ageDecay = Math.max(0, 1 - level.age / 100);
      level.strength = Math.min(1, touchStrength * 0.6 + recencyBonus + ageDecay * 0.2);
    });

    return levels.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Detect support levels (local minima)
   */
  private detectSupportLevels(candles: Candle[], totalCandles: number): Level[] {
    const lows = candles.map((c) => c.low);
    const levels: Level[] = [];
    const tolerance = this.calculateRange(candles) * 0.01;

    for (let i = 1; i < lows.length - 1; i++) {
      if (lows[i] < lows[i - 1] && lows[i] < lows[i + 1]) {
        const price = lows[i];
        const age = totalCandles - i;
        const isRecent = i > lows.length - 15;

        let existing = levels.find((l) => Math.abs(l.price - price) < tolerance);
        if (existing) {
          existing.touches++;
          existing.age = Math.min(existing.age, age);
          existing.isRecent = existing.isRecent || isRecent;
        } else {
          levels.push({
            price,
            type: 'support',
            touches: 1,
            strength: 0.5,
            age,
            isRecent,
          });
        }
      }
    }

    // Add global minimum
    const minLow = Math.min(...lows);
    if (!levels.some((l) => Math.abs(l.price - minLow) < tolerance)) {
      const minIdx = lows.indexOf(minLow);
      levels.push({
        price: minLow,
        type: 'support',
        touches: 2,
        strength: 0.6,
        age: totalCandles - minIdx,
        isRecent: minIdx > lows.length - 15,
      });
    }

    // Calculate strength
    levels.forEach((level) => {
      const touchStrength = Math.min(1, level.touches / 4);
      const recencyBonus = level.isRecent ? 0.2 : 0;
      const ageDecay = Math.max(0, 1 - level.age / 100);
      level.strength = Math.min(1, touchStrength * 0.6 + recencyBonus + ageDecay * 0.2);
    });

    return levels.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Detect resistance levels (local maxima)
   */
  private detectResistanceLevels(candles: Candle[], totalCandles: number): Level[] {
    const highs = candles.map((c) => c.high);
    const levels: Level[] = [];
    const tolerance = this.calculateRange(candles) * 0.01;

    for (let i = 1; i < highs.length - 1; i++) {
      if (highs[i] > highs[i - 1] && highs[i] > highs[i + 1]) {
        const price = highs[i];
        const age = totalCandles - i;
        const isRecent = i > highs.length - 15;

        let existing = levels.find((l) => Math.abs(l.price - price) < tolerance);
        if (existing) {
          existing.touches++;
          existing.age = Math.min(existing.age, age);
          existing.isRecent = existing.isRecent || isRecent;
        } else {
          levels.push({
            price,
            type: 'resistance',
            touches: 1,
            strength: 0.5,
            age,
            isRecent,
          });
        }
      }
    }

    // Add global maximum
    const maxHigh = Math.max(...highs);
    if (!levels.some((l) => Math.abs(l.price - maxHigh) < tolerance)) {
      const maxIdx = highs.indexOf(maxHigh);
      levels.push({
        price: maxHigh,
        type: 'resistance',
        touches: 2,
        strength: 0.6,
        age: totalCandles - maxIdx,
        isRecent: maxIdx > highs.length - 15,
      });
    }

    // Calculate strength
    levels.forEach((level) => {
      const touchStrength = Math.min(1, level.touches / 4);
      const recencyBonus = level.isRecent ? 0.2 : 0;
      const ageDecay = Math.max(0, 1 - level.age / 100);
      level.strength = Math.min(1, touchStrength * 0.6 + recencyBonus + ageDecay * 0.2);
    });

    return levels.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Merge clustered levels (within tolerance)
   */
  private mergeLevels(levels: Level[]): Level[] {
    if (levels.length === 0) return [];

    const sorted = [...levels].sort((a, b) => a.price - b.price);
    const merged: Level[] = [];
    const tolerance = 0.01; // 1% tolerance

    for (const level of sorted) {
      const existing = merged.find((m) => Math.abs(m.price - level.price) / level.price < tolerance);
      if (existing) {
        existing.touches += level.touches;
        existing.strength = Math.max(existing.strength, level.strength);
        existing.age = Math.min(existing.age, level.age);
        existing.isRecent = existing.isRecent || level.isRecent;
      } else {
        merged.push({ ...level });
      }
    }

    return merged.sort((a, b) => b.strength - a.strength).slice(0, 5);
  }

  /**
   * Calculate price trend from recent candles
   */
  private calculateTrend(candles: Candle[]): 'up' | 'down' | 'neutral' {
    if (candles.length < 10) return 'neutral';

    const recent = candles.slice(-10);
    const open = recent[0].open;
    const close = recent[recent.length - 1].close;
    const change = ((close - open) / open) * 100;

    if (change > 0.3) return 'up';
    if (change < -0.3) return 'down';
    return 'neutral';
  }

  /**
   * Calculate price range
   */
  private calculateRange(candles: Candle[]): number {
    const high = Math.max(...candles.map((c) => c.high));
    const low = Math.min(...candles.map((c) => c.low));
    return high - low;
  }

  getLastSignal(): AnalyzerSignal | null {
    return this.lastSignal;
  }

  getState() {
    return {
      enabled: this.enabled,
      initialized: this.initialized,
      lastSignal: this.lastSignal,
      config: { weight: this.weight, priority: this.priority },
    };
  }

  reset(): void {
    this.lastSignal = null;
    this.initialized = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getConfig() {
    return { enabled: this.enabled, weight: this.weight, priority: this.priority };
  }
}
