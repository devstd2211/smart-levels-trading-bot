/**
 * SMC (Smart Money Concepts) Analysis Registration Module
 * Registers: Footprint, Order Block, Fair Value Gap
 */

import { AnalyzerRegistry } from '../analyzer-registry.service';
import { LoggerService, StrategyMarketData, SignalDirection } from '../../types';
import { AnalyzerRegistrationModule } from './analyzer-registry.interface';
import { INTEGER_MULTIPLIERS, EPSILON } from '../../constants/technical.constants';
import {
  ORDER_BLOCK_BASE_CONFIDENCE,
  ORDER_BLOCK_BODY_WICK_MULTIPLIER,
  FAIR_VALUE_GAP_BASE_CONFIDENCE,
  FAIR_VALUE_GAP_PERCENT_MULTIPLIER,
} from '../../constants/analyzer.constants';
import { FootprintSignalAnalyzer } from '../../analyzers/footprint-signal.analyzer';

export class SmcAnalysisRegistration implements AnalyzerRegistrationModule {
  constructor(private footprintSignalAnalyzer: FootprintSignalAnalyzer) {}

  register(analyzerRegistry: AnalyzerRegistry, logger: LoggerService, config: any): void {
    // ===== FIX #3: FOOTPRINT - Resistance Rejection Mode for SHORT =====
    const footprintEnabled = config?.strategicWeights?.smcMicrostructure?.footprint?.enabled ?? true;
    analyzerRegistry.register('FOOTPRINT', {
      name: 'FOOTPRINT',
      weight: 0.18,
      priority: 9,
      enabled: false,
      evaluate: async (data: StrategyMarketData) => {
        return this.footprintSignalAnalyzer.evaluate(data);
      },
    });

    // Order Block Detector (priority 8, weight 0.18)
    const orderBlockEnabled = config?.strategicWeights?.smcMicrostructure?.orderBlock?.enabled ?? true;
    analyzerRegistry.register('ORDER_BLOCK', {
      name: 'ORDER_BLOCK',
      weight: 0.18,
      priority: 8,
      enabled: false,
      evaluate: async (data: StrategyMarketData) => {
        if (!data.candles || data.candles.length < 3) {
          return null;
        }

        const obConfig = config?.smcMicrostructure?.orderBlock;
        const minBodyToWickRatio = obConfig?.minBodyToWickRatio ?? 2.5;
        const minBodyPercent = obConfig?.minBodyPercent ?? 0.3;
        const maxConf = obConfig?.maxConfidence ?? 85;
        const baseConfidence = config?.analyzerConstants?.orderBlock?.baseConfidence ?? ORDER_BLOCK_BASE_CONFIDENCE;
        const bodyWickMultiplier = config?.analyzerConstants?.orderBlock?.bodyWickMultiplier ?? ORDER_BLOCK_BODY_WICK_MULTIPLIER;

        const current = data.candles[data.candles.length - 1];
        const currentBodySize = Math.abs(current.close - current.open);
        const currentBodyPercent = (currentBodySize / current.open) * INTEGER_MULTIPLIERS.ONE_HUNDRED;
        const currentWickSize = Math.max(current.high - current.close, current.open - current.low);
        const bodyToWickRatio = currentBodySize / (currentWickSize + EPSILON);

        if (bodyToWickRatio > minBodyToWickRatio && currentBodyPercent > minBodyPercent) {
          if (current.close > current.open) {
            const blockLongEnabled = config?.strategies?.levelBased?.blockLongInDowntrend ?? true;
            if (blockLongEnabled) {
              const rsiDowntrendThreshold = config?.strategies?.levelBased?.levelClustering?.trendFilters?.downtrend?.rsiThreshold ?? 55;
              const isDowntrend = data.ema.fast < data.ema.slow && data.rsi < rsiDowntrendThreshold;
              if (isDowntrend) {
                return null;
              }
            }

            return {
              source: 'ORDER_BLOCK',
              direction: SignalDirection.LONG,
              confidence: Math.min(baseConfidence + bodyToWickRatio * bodyWickMultiplier, maxConf),
              weight: 0.22,
              priority: 8,
            };
          } else if (current.close < current.open) {
            const blockShortEnabled = config?.strategies?.levelBased?.blockShortInUptrend ?? true;
            if (blockShortEnabled) {
              const rsiUptrendThreshold = config?.strategies?.levelBased?.levelClustering?.trendFilters?.uptrend?.rsiThreshold ?? 45;
              const isUptrend = data.ema.fast > data.ema.slow && data.rsi > rsiUptrendThreshold;
              if (isUptrend) {
                return null;
              }
            }

            return {
              source: 'ORDER_BLOCK',
              direction: SignalDirection.SHORT,
              confidence: Math.min(baseConfidence + bodyToWickRatio * bodyWickMultiplier, maxConf),
              weight: 0.22,
              priority: 8,
            };
          }
        }

        return null;
      },
    });

    // Fair Value Gap Detector (priority 8, weight 0.2)
    const fvgEnabled = config?.strategicWeights?.smcMicrostructure?.fairValueGap?.enabled ?? true;
    analyzerRegistry.register('FAIR_VALUE_GAP', {
      name: 'FAIR_VALUE_GAP',
      weight: 0.2,
      priority: 8,
      enabled: false,
      evaluate: async (data: StrategyMarketData) => {
        if (!data.candles || data.candles.length < 2) {
          return null;
        }

        const fvgConfig = config?.smcMicrostructure?.fairValueGap;
        const minGapPercent = fvgConfig?.minGapPercent ?? 0.2;
        const maxConf = fvgConfig?.maxConfidence ?? 75;
        const baseConfidence = config?.analyzerConstants?.fairValueGap?.baseConfidence ?? FAIR_VALUE_GAP_BASE_CONFIDENCE;
        const percentMultiplier = config?.analyzerConstants?.fairValueGap?.percentMultiplier ?? FAIR_VALUE_GAP_PERCENT_MULTIPLIER;

        const current = data.candles[data.candles.length - INTEGER_MULTIPLIERS.ONE];
        const prev = data.candles[data.candles.length - INTEGER_MULTIPLIERS.TWO];

        const bullishGap = current.low - prev.high;
        const bearishGap = prev.low - current.high;
        const gapPercent = (Math.abs(bullishGap) / current.open) * INTEGER_MULTIPLIERS.ONE_HUNDRED;

        if (bullishGap > 0 && gapPercent > minGapPercent) {
          return {
            source: 'FAIR_VALUE_GAP',
            direction: SignalDirection.SHORT,
            confidence: Math.min(baseConfidence + gapPercent * percentMultiplier, maxConf),
            weight: 0.2,
            priority: 8,
          };
        } else if (bearishGap > 0 && gapPercent > minGapPercent) {
          return {
            source: 'FAIR_VALUE_GAP',
            direction: SignalDirection.LONG,
            confidence: Math.min(baseConfidence + gapPercent * percentMultiplier, maxConf),
            weight: 0.2,
            priority: 8,
          };
        }

        return null;
      },
    });

    logger.info('✅ SMC Analysis registered (3 analyzers)');
  }
}
