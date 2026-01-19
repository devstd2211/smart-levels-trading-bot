import type { Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';
import type { BreakoutAnalyzerConfigNew } from '../types/config-new.types';
import { SignalDirection as SignalDirectionEnum } from '../types/enums';
import { IAnalyzer } from '../types/analyzer.interface';
import { AnalyzerType } from '../types/analyzer-type.enum';

const MIN_CANDLES_FOR_TICK_DELTA = 15;

export class TickDeltaAnalyzerNew implements IAnalyzer {
  private readonly enabled: boolean;
  private readonly weight: number;
  private readonly priority: number;
  private maxConfidence: number = 0.95;
  private lastSignal: AnalyzerSignal | null = null;
  private initialized: boolean = false;

  constructor(config: BreakoutAnalyzerConfigNew, private logger?: any) {
    if (typeof config.enabled !== 'boolean') throw new Error('[TICK_DELTA] Missing or invalid: enabled');
    if (typeof config.weight !== 'number' || config.weight < 0 || config.weight > 1) throw new Error('[TICK_DELTA] Missing or invalid: weight');
    if (typeof config.priority !== 'number' || config.priority < 1 || config.priority > 10) throw new Error('[TICK_DELTA] Missing or invalid: priority');
    this.enabled = config.enabled;
    this.weight = config.weight;
    this.priority = config.priority;
  }

  analyze(candles: Candle[]): AnalyzerSignal {
    if (!this.enabled) throw new Error('[TICK_DELTA] Analyzer is disabled');
    if (!Array.isArray(candles)) throw new Error('[TICK_DELTA] Invalid candles input');
    if (candles.length < MIN_CANDLES_FOR_TICK_DELTA) throw new Error('[TICK_DELTA] Not enough candles');
    for (let i = 0; i < candles.length; i++) {
      if (!candles[i] || typeof candles[i].close !== 'number') throw new Error('[TICK_DELTA] Invalid candle');
    }

    const delta = this.calculateDelta(candles);
    const direction = delta.positive ? SignalDirectionEnum.LONG : delta.negative ? SignalDirectionEnum.SHORT : SignalDirectionEnum.HOLD;
    const confidence = Math.round((0.1 + Math.abs(delta.value) * 0.85) * 100);
    const signal: AnalyzerSignal = { source: 'TICK_DELTA_ANALYZER', direction, confidence, weight: this.weight, priority: this.priority, score: (confidence / 100) * this.weight };
    this.lastSignal = signal;
    this.initialized = true;
    return signal;
  }

  private calculateDelta(candles: Candle[]): { value: number; positive: boolean; negative: boolean } {
    let delta = 0;
    const recent = candles.slice(-10);

    for (let i = 0; i < recent.length - 1; i++) {
      if (recent[i + 1].close > recent[i].close) delta += 1;
      else delta -= 1;
    }

    const normalized = delta / 10;
    return { value: normalized, positive: delta > 0, negative: delta < 0 };
  }

  // ===== INTERFACE IMPLEMENTATION (IAnalyzer) =====
  getType(): string { return AnalyzerType.TICK_DELTA; }
  isReady(candles: Candle[]): boolean { return candles && Array.isArray(candles) && candles.length >= MIN_CANDLES_FOR_TICK_DELTA; }
  getMinCandlesRequired(): number { return MIN_CANDLES_FOR_TICK_DELTA; }
  getWeight(): number { return this.weight; }
  getPriority(): number { return this.priority; }
  getMaxConfidence(): number { return this.maxConfidence; }
  isEnabled(): boolean { return this.enabled; }

  // ===== EXISTING METHODS =====
  getLastSignal(): AnalyzerSignal | null { return this.lastSignal; }
  getState() { return { enabled: this.enabled, initialized: this.initialized, lastSignal: this.lastSignal, config: { weight: this.weight, priority: this.priority } }; }
  reset(): void { this.lastSignal = null; this.initialized = false; }
  getConfig() { return { enabled: this.enabled, weight: this.weight, priority: this.priority }; }
}
