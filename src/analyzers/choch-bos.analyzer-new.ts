/**
 * CHOCH/BOS Analyzer NEW - with ConfigNew Support
 * Detects Change of Character (CHOCH) and Break of Structure (BOS)
 *
 * Signal Logic:
 * - BOS (Break of Structure): Price breaks key support/resistance = Signal
 * - CHOCH (Change of Character): Trend pattern changes = Signal
 * - No structure break: HOLD signal
 */

import type { Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';
import type { SignalDirection } from '../types/enums';
import type { ChochBosAnalyzerConfigNew } from '../types/config-new.types';
import { SignalDirection as SignalDirectionEnum } from '../types/enums';
import type { LoggerService } from '../services/logger.service';
import { IAnalyzer } from '../types/analyzer.interface';
import { AnalyzerType } from '../types/analyzer-type.enum';

const MIN_CANDLES_FOR_CHOCH_BOS = 30;
const MIN_CONFIDENCE = 0.1;
const MAX_CONFIDENCE = 0.95;

export class ChochBosAnalyzerNew implements IAnalyzer {
  private readonly enabled: boolean;
  private readonly weight: number;
  private readonly priority: number;
  private maxConfidence: number = MAX_CONFIDENCE;
  private lastSignal: AnalyzerSignal | null = null;
  private initialized: boolean = false;

  constructor(config: ChochBosAnalyzerConfigNew, private logger?: LoggerService) {
    if (typeof config.enabled !== 'boolean')
      throw new Error('[CHOCH_BOS] Missing or invalid: enabled (boolean)');
    if (typeof config.weight !== 'number' || config.weight < 0 || config.weight > 1)
      throw new Error('[CHOCH_BOS] Missing or invalid: weight (0.0-1.0)');
    if (typeof config.priority !== 'number' || config.priority < 1 || config.priority > 10)
      throw new Error('[CHOCH_BOS] Missing or invalid: priority (1-10)');

    this.enabled = config.enabled;
    this.weight = config.weight;
    this.priority = config.priority;
  }

  analyze(candles: Candle[]): AnalyzerSignal {
    if (!this.enabled) throw new Error('[CHOCH_BOS] Analyzer is disabled');
    if (!Array.isArray(candles)) throw new Error('[CHOCH_BOS] Invalid candles input (must be array)');
    if (candles.length < MIN_CANDLES_FOR_CHOCH_BOS) throw new Error(`[CHOCH_BOS] Not enough candles. Need ${MIN_CANDLES_FOR_CHOCH_BOS}, got ${candles.length}`);

    for (let i = 0; i < candles.length; i++) {
      if (!candles[i] || typeof candles[i].high !== 'number' || typeof candles[i].low !== 'number')
        throw new Error(`[CHOCH_BOS] Invalid candle at index ${i}`);
    }

    const structure = this.detectStructure(candles);
    const direction = structure.type === 'BULLISH_BOS' ? SignalDirectionEnum.LONG : structure.type === 'BEARISH_BOS' ? SignalDirectionEnum.SHORT : SignalDirectionEnum.HOLD;
    const confidence = structure.type === 'NONE' ? Math.round(MIN_CONFIDENCE * 100) : Math.round((MIN_CONFIDENCE + structure.strength * (MAX_CONFIDENCE - MIN_CONFIDENCE)) * 100);

    const signal: AnalyzerSignal = {
      source: 'CHOCH_BOS_ANALYZER',
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

  private detectStructure(candles: Candle[]): { type: 'NONE' | 'BULLISH_BOS' | 'BEARISH_BOS'; strength: number } {
    const lookback = Math.min(20, candles.length - 1);
    const recent = candles.slice(-lookback);
    
    const lows = recent.map(c => c.low);
    const highs = recent.map(c => c.high);
    
    const lowestLow = Math.min(...lows.slice(0, -1));
    const highestHigh = Math.max(...highs.slice(0, -1));
    
    const current = candles[candles.length - 1];

    if (current.low < lowestLow) {
      return { type: 'BULLISH_BOS', strength: Math.min(1, Math.abs(current.low - lowestLow) / lowestLow * 10) };
    }
    if (current.high > highestHigh) {
      return { type: 'BEARISH_BOS', strength: Math.min(1, Math.abs(current.high - highestHigh) / highestHigh * 10) };
    }

    return { type: 'NONE', strength: 0 };
  }

  /**
   * Get analyzer type
   */
  getType(): string {
    return AnalyzerType.CHOCH_BOS;
  }

  /**
   * Check if analyzer has enough data
   */
  isReady(candles: Candle[]): boolean {
    return candles && Array.isArray(candles) && candles.length >= MIN_CANDLES_FOR_CHOCH_BOS;
  }

  /**
   * Get minimum candles required
   */
  getMinCandlesRequired(): number {
    return MIN_CANDLES_FOR_CHOCH_BOS;
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
  getState() {
    return {
      enabled: this.enabled,
      initialized: this.initialized,
      lastSignal: this.lastSignal,
      config: { weight: this.weight, priority: this.priority },
    };
  }
  reset(): void { this.lastSignal = null; this.initialized = false; }
  isEnabled(): boolean { return this.enabled; }
  getConfig() { return { enabled: this.enabled, weight: this.weight, priority: this.priority }; }
}
