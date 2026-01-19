import type { Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';
import type { VolumeProfileAnalyzerConfigNew } from '../types/config-new.types';
import { SignalDirection as SignalDirectionEnum } from '../types/enums';
import type { LoggerService } from '../services/logger.service';
import { IAnalyzer } from '../types/analyzer.interface';
import { AnalyzerType } from '../types/analyzer-type.enum';

const MIN_CANDLES_FOR_VOLUME_PROFILE = 20;
const MAX_CONFIDENCE = 0.95;

export class VolumeProfileAnalyzerNew implements IAnalyzer {
  private readonly enabled: boolean;
  private readonly weight: number;
  private readonly priority: number;
  private lastSignal: AnalyzerSignal | null = null;
  private initialized: boolean = false;

  constructor(config: VolumeProfileAnalyzerConfigNew, private logger?: LoggerService) {
    if (typeof config.enabled !== 'boolean') throw new Error('[VOLUME_PROFILE] Missing or invalid: enabled');
    if (typeof config.weight !== 'number' || config.weight < 0 || config.weight > 1) throw new Error('[VOLUME_PROFILE] Missing or invalid: weight');
    if (typeof config.priority !== 'number' || config.priority < 1 || config.priority > 10) throw new Error('[VOLUME_PROFILE] Missing or invalid: priority');
    this.enabled = config.enabled;
    this.weight = config.weight;
    this.priority = config.priority;
  }

  analyze(candles: Candle[]): AnalyzerSignal {
    if (!this.enabled) throw new Error('[VOLUME_PROFILE] Analyzer is disabled');
    if (!Array.isArray(candles)) throw new Error('[VOLUME_PROFILE] Invalid candles input');
    if (candles.length < 20) throw new Error('[VOLUME_PROFILE] Not enough candles');
    for (let i = 0; i < candles.length; i++) {
      if (!candles[i] || typeof candles[i].volume !== 'number') throw new Error('[VOLUME_PROFILE] Invalid candle');
    }

    const profile = this.analyzeProfile(candles);
    const direction = profile.type === 'HIGH_VOLUME_UP' ? SignalDirectionEnum.LONG : profile.type === 'HIGH_VOLUME_DOWN' ? SignalDirectionEnum.SHORT : SignalDirectionEnum.HOLD;
    const confidence = Math.round((0.1 + profile.strength * 0.85) * 100);
    const signal: AnalyzerSignal = { source: 'VOLUME_PROFILE_ANALYZER', direction, confidence, weight: this.weight, priority: this.priority, score: (confidence / 100) * this.weight };
    this.lastSignal = signal;
    this.initialized = true;
    return signal;
  }

  private analyzeProfile(candles: Candle[]): { type: 'HIGH_VOLUME_UP' | 'HIGH_VOLUME_DOWN' | 'NONE'; strength: number } {
    const recent = candles.slice(-20);
    const avgVol = recent.reduce((s, c) => s + (c.volume || 0), 0) / recent.length;
    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];
    const volRatio = (lastCandle.volume || 0) / avgVol;

    if (volRatio > 1.5 && lastCandle.close > prevCandle.close) return { type: 'HIGH_VOLUME_UP', strength: Math.min(1, volRatio / 3) };
    if (volRatio > 1.5 && lastCandle.close < prevCandle.close) return { type: 'HIGH_VOLUME_DOWN', strength: Math.min(1, volRatio / 3) };
    return { type: 'NONE', strength: 0 };
  }

  // ===== INTERFACE IMPLEMENTATION (IAnalyzer) =====
  getType(): string { return AnalyzerType.VOLUME_PROFILE; }
  isReady(candles: Candle[]): boolean { return candles && Array.isArray(candles) && candles.length >= MIN_CANDLES_FOR_VOLUME_PROFILE; }
  getMinCandlesRequired(): number { return MIN_CANDLES_FOR_VOLUME_PROFILE; }
  isEnabled(): boolean { return this.enabled; }
  getWeight(): number { return this.weight; }
  getPriority(): number { return this.priority; }
  getMaxConfidence(): number { return MAX_CONFIDENCE; }

  // ===== EXISTING METHODS =====
  getLastSignal(): AnalyzerSignal | null { return this.lastSignal; }
  getState() { return { enabled: this.enabled, initialized: this.initialized, lastSignal: this.lastSignal, config: { weight: this.weight, priority: this.priority } }; }
  reset(): void { this.lastSignal = null; this.initialized = false; }
  getConfig() { return { enabled: this.enabled, weight: this.weight, priority: this.priority }; }
}
