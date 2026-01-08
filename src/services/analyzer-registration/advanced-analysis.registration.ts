/**
 * Advanced Analysis Registration Module
 * Registers: Divergence, Breakout, Wick, Price Momentum
 */

import { AnalyzerRegistry } from '../analyzer-registry.service';
import { LoggerService, StrategyMarketData, SignalDirection } from '../../types';
import { AnalyzerRegistrationModule } from './analyzer-registry.interface';
import {
  INTEGER_MULTIPLIERS,
} from '../../constants/technical.constants';
import { HiddenDivergenceSignalAnalyzer } from '../../analyzers/hidden-divergence-signal.analyzer';
import { WickSignalAnalyzer } from '../../analyzers/wick-signal.analyzer';
import { PriceMomentumAnalyzer, BreakoutPredictor } from '../../types';

export class AdvancedAnalysisRegistration implements AnalyzerRegistrationModule {
  constructor(
    private hiddenDivergenceAnalyzer: HiddenDivergenceSignalAnalyzer,
    private wickSignalAnalyzer: WickSignalAnalyzer,
    private priceMomentumAnalyzer: PriceMomentumAnalyzer,
    private breakoutPredictor: BreakoutPredictor,
  ) {}

  register(analyzerRegistry: AnalyzerRegistry, logger: LoggerService, config: any): void {
    // ===== FIX #4: DIVERGENCE_ANALYZER - Hidden Divergence Detection =====
    const divergenceEnabled = config?.strategicWeights?.advancedAnalysis?.divergence?.enabled ?? true;
    analyzerRegistry.register('DIVERGENCE_ANALYZER', {
      name: 'DIVERGENCE_ANALYZER',
      weight: 0.15,
      priority: 7,
      enabled: false,
      evaluate: async (data: StrategyMarketData) => {
        // First check regular divergence
        const divConfig = config?.analyzerStrategic?.divergenceAnalyzer;
        const maxConfidence = divConfig?.maxConfidence ?? 80;

        if (data.divergence && data.divergence.type && data.divergence.type !== 'NONE') {
          const direction = data.divergence.type === 'BULLISH' ? SignalDirection.LONG : SignalDirection.SHORT;
          logger.info('✅ DIVERGENCE_ANALYZER | Regular divergence detected', {
            type: data.divergence.type,
            direction: direction === SignalDirection.LONG ? 'LONG' : 'SHORT',
            strength: data.divergence.strength.toFixed(3),
          });
          return {
            source: 'DIVERGENCE_ANALYZER',
            direction,
            confidence: Math.min(data.divergence.strength * INTEGER_MULTIPLIERS.ONE_HUNDRED, maxConfidence),
            weight: 0.15,
            priority: 7,
          };
        }

        // FIX #4: Check hidden divergence using new analyzer
        const hiddenSignal = await this.hiddenDivergenceAnalyzer.evaluate(data);
        if (hiddenSignal) {
          return hiddenSignal;
        }

        if (divergenceEnabled) {
          logger.debug('⛔ DIVERGENCE_ANALYZER | No divergence patterns detected');
        }
        return null;
      },
    });

    // Breakout Predictor (priority 6, weight 0.14)
    const breakoutEnabled = config?.strategicWeights?.advancedAnalysis?.breakoutPredictor?.enabled ?? true;
    analyzerRegistry.register('BREAKOUT_PREDICTOR', {
      name: 'BREAKOUT_PREDICTOR',
      weight: 0.14,
      priority: 6,
      enabled: false,
      evaluate: async (data: StrategyMarketData) => {
        if (!data.breakoutPrediction || !data.breakoutPrediction.direction || data.breakoutPrediction.direction === 'NEUTRAL') {
          logger.debug('⛔ BREAKOUT_PREDICTOR | No clear breakout direction');
          return null;
        }
        const direction = data.breakoutPrediction.direction === 'BULLISH' ? SignalDirection.LONG : SignalDirection.SHORT;
        return {
          source: 'BREAKOUT_PREDICTOR',
          direction,
          confidence: data.breakoutPrediction.confidence,
          weight: 0.14,
          priority: 6,
        };
      },
    });

    // ===== FIX #5: WICK_ANALYZER - Adaptive wick age handling for rejection signals =====
    const wickEnabled = config?.strategicWeights?.advancedAnalysis?.wickAnalyzer?.enabled ?? true;
    analyzerRegistry.register('WICK_ANALYZER', {
      name: 'WICK_ANALYZER',
      weight: 0.12,
      priority: 7,
      enabled: false,
      evaluate: async (data: StrategyMarketData) => {
        return this.wickSignalAnalyzer.evaluate(data);
      },
    });

    // Price Momentum Analyzer (priority 9, weight 0.20)
    const priceMomentumEnabled = config?.indicators?.priceMomentum?.enabled ?? false;
    const priceMomentumAnalyzerConfig = config?.analyzers?.priceMomentum;
    analyzerRegistry.register('PRICE_MOMENTUM', {
      name: 'PRICE_MOMENTUM',
      weight: priceMomentumAnalyzerConfig?.weight ?? 0.35,
      priority: priceMomentumAnalyzerConfig?.priority ?? 6,
      enabled: priceMomentumEnabled,
      evaluate: async (data: StrategyMarketData) => {
        if (!data.candles || data.candles.length < 5) {
          return null;
        }

        const signal = this.priceMomentumAnalyzer.analyze(data.candles);
        if (!signal) {
          return null;
        }

        return {
          source: 'PRICE_MOMENTUM',
          direction: signal.direction,
          confidence: signal.confidence,
          weight: 0.20,
          priority: 9,
        };
      },
    });

    logger.info('✅ Advanced Analysis registered (4 analyzers)');
  }
}
