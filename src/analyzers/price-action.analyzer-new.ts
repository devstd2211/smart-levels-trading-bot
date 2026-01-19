import type { Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';
import type { BreakoutAnalyzerConfigNew } from '../types/config-new.types';
import { SignalDirection as SignalDirectionEnum } from '../types/enums';
import { IAnalyzer } from '../types/analyzer.interface';
import { AnalyzerType } from '../types/analyzer-type.enum';

const MIN_CANDLES_FOR_PRICE_ACTION = 20;

export class PriceActionAnalyzerNew implements IAnalyzer {
  private readonly enabled: boolean;
  private readonly weight: number;
  private readonly priority: number;
  private maxConfidence: number = 0.95;
  private lastSignal: AnalyzerSignal | null = null;
  private initialized: boolean = false;

  constructor(config: BreakoutAnalyzerConfigNew, private logger?: any) {
    if (typeof config.enabled !== 'boolean') throw new Error('[PRICE_ACTION] Missing or invalid: enabled');
    if (typeof config.weight !== 'number' || config.weight < 0 || config.weight > 1) throw new Error('[PRICE_ACTION] Missing or invalid: weight');
    if (typeof config.priority !== 'number' || config.priority < 1 || config.priority > 10) throw new Error('[PRICE_ACTION] Missing or invalid: priority');
    this.enabled = config.enabled;
    this.weight = config.weight;
    this.priority = config.priority;
  }

  analyze(candles: Candle[]): AnalyzerSignal {
    if (!this.enabled) throw new Error('[PRICE_ACTION] Analyzer is disabled');
    if (!Array.isArray(candles)) throw new Error('[PRICE_ACTION] Invalid candles input');
    if (candles.length < 20) throw new Error('[PRICE_ACTION] Not enough candles');
    for (let i = 0; i < candles.length; i++) {
      if (!candles[i] || typeof candles[i].close !== 'number') throw new Error('[PRICE_ACTION] Invalid candle');
    }

    const pa = this.analyzePriceAction(candles);
    const direction = pa.type === 'BULLISH' ? SignalDirectionEnum.LONG : pa.type === 'BEARISH' ? SignalDirectionEnum.SHORT : SignalDirectionEnum.HOLD;
    const confidence = Math.round((0.1 + pa.strength * 0.85) * 100);
    const signal: AnalyzerSignal = { source: 'PRICE_ACTION_ANALYZER', direction, confidence, weight: this.weight, priority: this.priority, score: (confidence / 100) * this.weight };
    this.lastSignal = signal;
    this.initialized = true;
    return signal;
  }

  private analyzePriceAction(candles: Candle[]): { type: 'BULLISH' | 'BEARISH' | 'NONE'; strength: number } {
    const recent = candles.slice(-5);
    let bullishCount = 0;
    let bearishCount = 0;

    for (let i = 0; i < recent.length - 1; i++) {
      if (recent[i + 1].close > recent[i].close) bullishCount++;
      else bearishCount++;
    }

    if (bullishCount > bearishCount) return { type: 'BULLISH', strength: bullishCount / (bullishCount + bearishCount) };
    if (bearishCount > bullishCount) return { type: 'BEARISH', strength: bearishCount / (bullishCount + bearishCount) };
    return { type: 'NONE', strength: 0 };
  }

  /**
   * Get analyzer type
   */
  getType(): string {
    return AnalyzerType.PRICE_ACTION;
  }

  /**
   * Check if analyzer has enough data
   */
  isReady(candles: Candle[]): boolean {
    return candles && Array.isArray(candles) && candles.length >= MIN_CANDLES_FOR_PRICE_ACTION;
  }

  /**
   * Get minimum candles required
   */
  getMinCandlesRequired(): number {
    return MIN_CANDLES_FOR_PRICE_ACTION;
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
