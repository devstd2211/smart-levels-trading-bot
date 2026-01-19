import type { Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';
import type { BreakoutAnalyzerConfigNew } from '../types/config-new.types';
import { SignalDirection as SignalDirectionEnum } from '../types/enums';
import { IAnalyzer } from '../types/analyzer.interface';
import { AnalyzerType } from '../types/analyzer-type.enum';

const MIN_CANDLES_FOR_LIQUIDITY_SWEEP = 25;

export class LiquiditySweepAnalyzerNew implements IAnalyzer {
  private readonly enabled: boolean;
  private readonly weight: number;
  private readonly priority: number;
  private maxConfidence: number = 0.95;
  private lastSignal: AnalyzerSignal | null = null;
  private initialized: boolean = false;

  constructor(config: BreakoutAnalyzerConfigNew, private logger?: any) {
    if (typeof config.enabled !== 'boolean') throw new Error('[LIQUIDITY_SWEEP] Missing or invalid: enabled');
    if (typeof config.weight !== 'number' || config.weight < 0 || config.weight > 1) throw new Error('[LIQUIDITY_SWEEP] Missing or invalid: weight');
    if (typeof config.priority !== 'number' || config.priority < 1 || config.priority > 10) throw new Error('[LIQUIDITY_SWEEP] Missing or invalid: priority');
    this.enabled = config.enabled;
    this.weight = config.weight;
    this.priority = config.priority;
  }

  analyze(candles: Candle[]): AnalyzerSignal {
    if (!this.enabled) throw new Error('[LIQUIDITY_SWEEP] Analyzer is disabled');
    if (!Array.isArray(candles)) throw new Error('[LIQUIDITY_SWEEP] Invalid candles input');
    if (candles.length < MIN_CANDLES_FOR_LIQUIDITY_SWEEP) throw new Error('[LIQUIDITY_SWEEP] Not enough candles');
    for (let i = 0; i < candles.length; i++) {
      if (!candles[i] || typeof candles[i].high !== 'number' || typeof candles[i].low !== 'number') throw new Error('[LIQUIDITY_SWEEP] Invalid candle');
    }

    const sweep = this.detectSweep(candles);
    const direction = sweep.type === 'BULLISH_SWEEP' ? SignalDirectionEnum.LONG : sweep.type === 'BEARISH_SWEEP' ? SignalDirectionEnum.SHORT : SignalDirectionEnum.HOLD;
    const confidence = Math.round((0.1 + sweep.strength * 0.85) * 100);
    const signal: AnalyzerSignal = { source: 'LIQUIDITY_SWEEP_ANALYZER', direction, confidence, weight: this.weight, priority: this.priority, score: (confidence / 100) * this.weight };
    this.lastSignal = signal;
    this.initialized = true;
    return signal;
  }

  private detectSweep(candles: Candle[]): { type: 'BULLISH_SWEEP' | 'BEARISH_SWEEP' | 'NONE'; strength: number } {
    const recent = candles.slice(-20);
    const lows = recent.map(c => c.low);
    const highs = recent.map(c => c.high);
    const minLow = Math.min(...lows.slice(0, -1));
    const maxHigh = Math.max(...highs.slice(0, -1));
    const current = candles[candles.length - 1];

    if (current.low < minLow && current.close > minLow + (minLow * 0.002)) return { type: 'BULLISH_SWEEP', strength: Math.min(1, (minLow - current.low) / minLow * 100) };
    if (current.high > maxHigh && current.close < maxHigh - (maxHigh * 0.002)) return { type: 'BEARISH_SWEEP', strength: Math.min(1, (current.high - maxHigh) / maxHigh * 100) };
    return { type: 'NONE', strength: 0 };
  }

  /**
   * Get analyzer type
   */
  getType(): string {
    return AnalyzerType.LIQUIDITY_SWEEP;
  }

  /**
   * Check if analyzer has enough data
   */
  isReady(candles: Candle[]): boolean {
    return candles && Array.isArray(candles) && candles.length >= MIN_CANDLES_FOR_LIQUIDITY_SWEEP;
  }

  /**
   * Get minimum candles required
   */
  getMinCandlesRequired(): number {
    return MIN_CANDLES_FOR_LIQUIDITY_SWEEP;
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
