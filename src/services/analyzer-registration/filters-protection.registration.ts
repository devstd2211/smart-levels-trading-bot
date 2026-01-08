/**
 * Filters & Protection Registration Module
 * Registers: ATH Protection, EMA Filter, RSI Filter, Volume Filter, Session Filter, Funding Rate Filter, BTC Correlation
 */

import { AnalyzerRegistry } from '../analyzer-registry.service';
import { LoggerService, StrategyMarketData, SignalDirection, BTCDirection, BTCAnalyzer } from '../../types';
import { AnalyzerRegistrationModule } from './analyzer-registry.interface';
import { INTEGER_MULTIPLIERS, PERCENT_MULTIPLIER } from '../../constants/technical.constants';
import {
  ATH_DISTANCE_THRESHOLD_PERCENT,
} from '../../constants/analyzer.constants';

export class FiltersProtectionRegistration implements AnalyzerRegistrationModule {
  constructor(private btcAnalyzer?: BTCAnalyzer | null, private btcCandlesStore?: { btcCandles1m: any[] }) {}

  register(analyzerRegistry: AnalyzerRegistry, logger: LoggerService, config: any): void {
    // ATH Protection (priority 4, weight 0.1)
    const athEnabled = config?.strategicWeights?.filters?.athProtection?.enabled ?? true;
    analyzerRegistry.register('ATH_PROTECTION', {
      name: 'ATH_PROTECTION',
      weight: 0.1,
      priority: 4,
      enabled: false,
      evaluate: async (data: StrategyMarketData) => {
        const ath = (data as any).ath;
        if (!ath || ath <= 0) return null;
        const athDistance = ((ath - data.currentPrice) / ath) * INTEGER_MULTIPLIERS.ONE_HUNDRED;
        const threshold = config?.analyzerConstants?.ath?.distanceThresholdPercent ?? ATH_DISTANCE_THRESHOLD_PERCENT;
        const protectionConfidence = config?.analyzerConstants?.ath?.protectionConfidence ?? 80;
        if (athDistance < threshold) {
          return {
            source: 'ATH_PROTECTION',
            direction: SignalDirection.HOLD,
            confidence: protectionConfidence,
            weight: 0.1,
            priority: 4,
          };
        }
        return null;
      },
    });

    // EMA Filter (priority 4, weight 0.1)
    const emaFilterEnabled = config?.strategicWeights?.filters?.emaFilter?.enabled ?? true;
    analyzerRegistry.register('EMA_FILTER', {
      name: 'EMA_FILTER',
      weight: 0.1,
      priority: 4,
      enabled: false,
      evaluate: async (data: StrategyMarketData) => {
        return null;
      },
    });

    // RSI Filter (priority 5, weight 0.09)
    const rsiFilterEnabled = config?.strategicWeights?.filters?.rsiFilter?.enabled ?? true;
    analyzerRegistry.register('RSI_FILTER', {
      name: 'RSI_FILTER',
      weight: 0.09,
      priority: 5,
      enabled: false,
      evaluate: async (data: StrategyMarketData) => {
        return null;
      },
    });

    // Volume Filter (priority 5, weight 0.09)
    const volumeFilterEnabled = config?.strategicWeights?.filters?.volumeFilter?.enabled ?? true;
    analyzerRegistry.register('VOLUME_FILTER', {
      name: 'VOLUME_FILTER',
      weight: 0.09,
      priority: 5,
      enabled: false,
      evaluate: async (data: StrategyMarketData) => {
        return null;
      },
    });

    // BTC Correlation (priority 5, weight 0.12)
    const isBtcConfirmationEnabled = config?.btcConfirmation?.enabled === true;

    logger.debug('🔗 BTC_CORRELATION analyzer registration', {
      btcConfirmationEnabled: isBtcConfirmationEnabled,
      configHasBtc: !!config?.btcConfirmation,
    });

    const btcAnalyzerConfig = config?.btcConfirmation?.analyzer || {
      weight: 0.12,
      priority: 5,
      minConfidence: 25,
      maxConfidence: 85,
    };

    logger.info('📊 Registering BTC_CORRELATION analyzer', {
      enabled: false,
      weight: btcAnalyzerConfig.weight,
      priority: btcAnalyzerConfig.priority,
    });

    analyzerRegistry.register('BTC_CORRELATION', {
      name: 'BTC_CORRELATION',
      weight: btcAnalyzerConfig.weight,
      priority: btcAnalyzerConfig.priority,
      enabled: false,
      evaluate: async (data: StrategyMarketData) => {
        if (!this.btcAnalyzer || !this.btcCandlesStore || this.btcCandlesStore.btcCandles1m.length === 0) {
          return null;
        }

        try {
          const btcCandles = this.btcCandlesStore.btcCandles1m;
          const btcAnalysis = this.btcAnalyzer.analyze(btcCandles, SignalDirection.LONG);

          if (btcAnalysis.direction === BTCDirection.NEUTRAL) {
            return null;
          }

          let confidence = btcAnalysis.momentum * PERCENT_MULTIPLIER;
          const minConfidence = btcAnalyzerConfig.minConfidence ?? 25;
          const maxConfidence = btcAnalyzerConfig.maxConfidence ?? 85;

          if (confidence < minConfidence) {
            logger.info('🔗 BTC_CORRELATION filtered (low momentum)');
            return null;
          }

          confidence = Math.min(confidence, maxConfidence);
          const direction = btcAnalysis.direction === BTCDirection.UP ? SignalDirection.LONG : SignalDirection.SHORT;

          logger.info('🔗 BTC_CORRELATION analyzer SIGNAL', {
            direction,
            confidence: confidence.toFixed(1),
            btcMomentum: btcAnalysis.momentum.toFixed(3),
          });

          return {
            source: 'BTC_CORRELATION',
            direction,
            confidence,
            weight: btcAnalyzerConfig.weight,
            priority: btcAnalyzerConfig.priority,
          };
        } catch (error) {
          logger.error('BTC_CORRELATION analyzer failed', {
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      },
    });

    // Session Filter (priority 3, weight 0.08)
    const sessionFilterEnabled = config?.strategicWeights?.filters?.sessionFilter?.enabled ?? true;
    analyzerRegistry.register('SESSION_FILTER', {
      name: 'SESSION_FILTER',
      weight: 0.08,
      priority: 3,
      enabled: false,
      evaluate: async (data: StrategyMarketData) => {
        return null;
      },
    });

    // Funding Rate Filter (priority 3, weight 0.08)
    const fundingFilterEnabled = config?.strategicWeights?.filters?.fundingRateFilter?.enabled ?? true;
    analyzerRegistry.register('FUNDING_RATE_FILTER', {
      name: 'FUNDING_RATE_FILTER',
      weight: 0.08,
      priority: 3,
      enabled: false,
      evaluate: async (data: StrategyMarketData) => {
        return null;
      },
    });

    logger.info('✅ Filters & Protection registered (7 analyzers)');
  }

  setBtcCandlesStore(store: { btcCandles1m: any[] }): void {
    this.btcCandlesStore = store;
  }
}
