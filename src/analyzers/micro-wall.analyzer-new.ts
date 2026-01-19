import type { Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';
import type { BreakoutAnalyzerConfigNew } from '../types/config-new.types';
import { SignalDirection as SignalDirectionEnum } from '../types/enums';
import { IAnalyzer } from '../types/analyzer.interface';
import { AnalyzerType } from '../types/analyzer-type.enum';

const MIN_CANDLES_FOR_MICRO_WALL = 20;

export class MicroWallAnalyzerNew implements IAnalyzer {
  private readonly enabled: boolean;
  private readonly weight: number;
  private readonly priority: number;
  private maxConfidence: number = 0.95;
  private lastSignal: AnalyzerSignal | null = null;
  private initialized: boolean = false;

  constructor(config: BreakoutAnalyzerConfigNew, private logger?: any) {
    if (typeof config.enabled !== 'boolean') throw new Error('[MICRO_WALL] Missing or invalid: enabled');
    if (typeof config.weight !== 'number' || config.weight < 0 || config.weight > 1) throw new Error('[MICRO_WALL] Missing or invalid: weight');
    if (typeof config.priority !== 'number' || config.priority < 1 || config.priority > 10) throw new Error('[MICRO_WALL] Missing or invalid: priority');
    this.enabled = config.enabled;
    this.weight = config.weight;
    this.priority = config.priority;
  }

  analyze(candles: Candle[]): AnalyzerSignal {
    if (!this.enabled) throw new Error('[MICRO_WALL] Analyzer is disabled');
    if (!Array.isArray(candles)) throw new Error('[MICRO_WALL] Invalid candles input');
    if (candles.length < MIN_CANDLES_FOR_MICRO_WALL) throw new Error('[MICRO_WALL] Not enough candles');
    for (let i = 0; i < candles.length; i++) {
      if (!candles[i] || typeof candles[i].volume !== 'number') throw new Error('[MICRO_WALL] Invalid candle');
    }

    const wall = this.detectWall(candles);
    const direction = wall.type === 'BUY' ? SignalDirectionEnum.LONG : wall.type === 'SELL' ? SignalDirectionEnum.SHORT : SignalDirectionEnum.HOLD;
    const confidence = Math.round((0.1 + wall.strength * 0.85) * 100);
    const signal: AnalyzerSignal = { source: 'MICRO_WALL_ANALYZER', direction, confidence, weight: this.weight, priority: this.priority, score: (confidence / 100) * this.weight };
    this.lastSignal = signal;
    this.initialized = true;
    return signal;
  }

  private detectWall(candles: Candle[]): { type: 'BUY' | 'SELL' | 'NONE'; strength: number } {
    const recent = candles.slice(-5);
    const volumes = recent.map(c => c.volume || 0);
    const maxVol = Math.max(...volumes);
    const wallIdx = volumes.indexOf(maxVol);

    if (wallIdx >= 0 && wallIdx < recent.length - 1) {
      const wallPrice = recent[wallIdx].high;
      const currentPrice = candles[candles.length - 1].close;
      if (currentPrice < wallPrice) return { type: 'BUY', strength: Math.min(1, (wallPrice - currentPrice) / wallPrice) };
    }
    return { type: 'NONE', strength: 0 };
  }

  /**
   * Get analyzer type
   */
  getType(): string {
    return AnalyzerType.MICRO_WALL;
  }

  /**
   * Check if analyzer has enough data
   */
  isReady(candles: Candle[]): boolean {
    return candles && Array.isArray(candles) && candles.length >= MIN_CANDLES_FOR_MICRO_WALL;
  }

  /**
   * Get minimum candles required
   */
  getMinCandlesRequired(): number {
    return MIN_CANDLES_FOR_MICRO_WALL;
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
