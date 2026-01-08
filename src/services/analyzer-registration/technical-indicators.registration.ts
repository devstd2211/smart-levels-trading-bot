/**
 * Technical Indicators Registration Module
 * Registers: RSI, EMA, ATR, Volume, Stochastic, Bollinger Bands
 */

import { AnalyzerRegistry } from '../analyzer-registry.service';
import { LoggerService, StrategyMarketData, SignalDirection } from '../../types';
import { AnalyzerRegistrationModule } from './analyzer-registry.interface';
import {
  INTEGER_MULTIPLIERS,
  PERCENT_MULTIPLIER,
  THRESHOLD_VALUES,
} from '../../constants/technical.constants';
import {
  EMA_BASE_CONFIDENCE,
  EMA_STRENGTH_CONFIDENCE_MULTIPLIER,
  ATR_CONFIDENCE_MULTIPLIER,
  VOLUME_NEUTRAL_CONFIDENCE,
} from '../../constants/analyzer.constants';
import { RSISignalAnalyzer } from '../../analyzers/rsi-signal.analyzer';
import { MultiTimeframeRSIAnalyzer } from '../../analyzers/multi-timeframe-rsi.analyzer';
import { MultiTimeframeEMAAnalyzer } from '../../analyzers/multi-timeframe-ema.analyzer';
import { ATRIndicator, StochasticIndicator, BollingerBandsIndicator } from '../../types';

export class TechnicalIndicatorsRegistration implements AnalyzerRegistrationModule {
  constructor(
    private rsiSignalAnalyzer: RSISignalAnalyzer,
    private rsiAnalyzer: MultiTimeframeRSIAnalyzer,
    private emaAnalyzer: MultiTimeframeEMAAnalyzer,
    private atrIndicator: ATRIndicator,
    private stochasticIndicator?: StochasticIndicator,
    private bollingerIndicator?: BollingerBandsIndicator,
  ) {}

  register(analyzerRegistry: AnalyzerRegistry, logger: LoggerService, config: any): void {
    // ===== FIX #1: RSI_ANALYZER - Dynamic SHORT Threshold =====
    const rsiEnabled = config?.indicators?.rsi?.enabled ?? false;
    analyzerRegistry.register('RSI_ANALYZER', {
      name: 'RSI_ANALYZER',
      weight: 0.15,
      priority: 6,
      enabled: rsiEnabled,
      evaluate: async (data: StrategyMarketData) => {
        return this.rsiSignalAnalyzer.evaluate(data);
      },
    });

    // EMA Analyzer (priority 5, weight 0.12)
    const emaEnabled = config?.indicators?.ema?.enabled ?? false;
    const emaAnalyzerConfig = config?.analyzers?.ema;
    analyzerRegistry.register('EMA_ANALYZER', {
      name: 'EMA_ANALYZER',
      weight: emaAnalyzerConfig?.weight ?? 0.3,
      priority: emaAnalyzerConfig?.priority ?? 5,
      enabled: emaEnabled,
      evaluate: async (data: StrategyMarketData) => {
        if (!data.ema) return null;
        const { fast, slow } = data.ema;
        const emaDiff = Math.abs(fast - slow);
        const emaDiffPercent = (emaDiff / slow) * (PERCENT_MULTIPLIER as number);
        const baseConfidence = config?.indicators?.ema?.baseConfidence ?? EMA_BASE_CONFIDENCE;
        const strengthMultiplier = config?.indicators?.ema?.strengthMultiplier ?? EMA_STRENGTH_CONFIDENCE_MULTIPLIER;

        if (fast > slow) {
          const strength = Math.min(emaDiffPercent, PERCENT_MULTIPLIER as number);
          return {
            source: 'EMA_ANALYZER',
            direction: SignalDirection.LONG,
            confidence: baseConfidence + strength * strengthMultiplier,
            weight: THRESHOLD_VALUES.TWELVE_PERCENT as number,
            priority: INTEGER_MULTIPLIERS.FIVE as number,
          };
        }
        if (fast < slow) {
          const strength = Math.min(emaDiffPercent, PERCENT_MULTIPLIER as number);
          return {
            source: 'EMA_ANALYZER',
            direction: SignalDirection.SHORT,
            confidence: baseConfidence + strength * strengthMultiplier,
            weight: THRESHOLD_VALUES.TWELVE_PERCENT as number,
            priority: INTEGER_MULTIPLIERS.FIVE as number,
          };
        }
        return null;
      },
    });

    // ATR Analyzer (priority 6, weight 0.12)
    const atrEnabled = config?.strategicWeights?.technicalIndicators?.atr?.enabled ?? true;
    analyzerRegistry.register('ATR_ANALYZER', {
      name: 'ATR_ANALYZER',
      weight: 0.12,
      priority: 6,
      enabled: atrEnabled,
      evaluate: async (data: StrategyMarketData) => {
        if (!data.atr || data.atr <= 0) return null;
        const atrPercent = (data.atr / data.currentPrice) * (PERCENT_MULTIPLIER as number);
        const multiplier = config?.analyzerConstants?.atr?.confidenceMultiplier ?? ATR_CONFIDENCE_MULTIPLIER;
        const maxConfidence = config?.analyzerConstants?.atr?.maxConfidence ?? 80;
        const confidence = Math.min(atrPercent * multiplier, maxConfidence);
        return {
          source: 'ATR_ANALYZER',
          direction: SignalDirection.HOLD,
          confidence,
          weight: 0.12,
          priority: 6,
        };
      },
    });

    // Volume Analyzer (priority 6, weight 0.14)
    const volumeEnabled = config?.strategicWeights?.technicalIndicators?.volume?.enabled ?? true;
    analyzerRegistry.register('VOLUME_ANALYZER', {
      name: 'VOLUME_ANALYZER',
      weight: 0.14,
      priority: 6,
      enabled: volumeEnabled,
      evaluate: async (data: StrategyMarketData) => {
        const confidence = config?.analyzerConstants?.volume?.neutralConfidence ?? VOLUME_NEUTRAL_CONFIDENCE;
        return {
          source: 'VOLUME_ANALYZER',
          direction: SignalDirection.HOLD,
          confidence,
          weight: 0.14,
          priority: 6,
        };
      },
    });

    // Stochastic (priority 6, weight 0.12)
    if (this.stochasticIndicator) {
      const stochasticEnabled = config?.strategicWeights?.technicalIndicators?.stochastic?.enabled ?? true;
      analyzerRegistry.register('STOCHASTIC_ANALYZER', {
        name: 'STOCHASTIC_ANALYZER',
        weight: 0.12,
        priority: 6,
        enabled: stochasticEnabled,
        evaluate: async (data: StrategyMarketData) => {
          return null;
        },
      });
    }

    // Bollinger Bands (priority 7, weight 0.13)
    if (this.bollingerIndicator) {
      const bollingerEnabled = config?.strategicWeights?.technicalIndicators?.bollingerBands?.enabled ?? true;
      analyzerRegistry.register('BOLLINGER_BANDS_ANALYZER', {
        name: 'BOLLINGER_BANDS_ANALYZER',
        weight: 0.13,
        priority: 7,
        enabled: bollingerEnabled,
        evaluate: async (data: StrategyMarketData) => {
          return null;
        },
      });
    }

    logger.info('✅ Technical Indicators registered (6 analyzers)');
  }
}
