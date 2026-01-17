/**
 * Indicator Loader Service
 *
 * Responsibility:
 * - Load indicator implementations based on config
 * - Create instances of indicators with their configs
 * - Validate that indicators are registered
 * - Return Map<type, IIndicator> for use in analyzers
 *
 * Architecture:
 * - Registry: metadata only (no implementations)
 * - Loader: creates implementations (imports actual classes)
 * - Analyzers: consume through IIndicator interface
 *
 * Why separate?
 * - DIP: Registry doesn't depend on implementations
 * - SRP: Loader handles loading, Registry handles registry
 * - Testability: Can mock Registry/Loader independently
 */

import { IndicatorRegistry } from '../services/indicator-registry.service';
import { IIndicator } from '../types/indicator.interface';
import { IndicatorType } from '../types/indicator-type.enum';
import { IndicatorsConfig } from '../types/config.types';
import { LoggerService } from '../services/logger.service';

/**
 * Loader imports the ACTUAL indicator implementations
 * Registry knows nothing about these imports!
 */
// NOTE: These imports are HERE, not in Registry
// This is the key separation: Registry is pure, Loader has dependencies
import { EMAIndicatorNew } from '../indicators/ema.indicator-new';
import { RSIIndicatorNew } from '../indicators/rsi.indicator-new';
import { ATRIndicatorNew } from '../indicators/atr.indicator-new';
import { VolumeIndicatorNew } from '../indicators/volume.indicator-new';
import { StochasticIndicatorNew } from '../indicators/stochastic.indicator-new';
import { BollingerBandsIndicatorNew } from '../indicators/bollinger-bands.indicator-new';

export class IndicatorLoader {
  constructor(
    private registry: IndicatorRegistry,
    private logger: LoggerService
  ) {}

  /**
   * Load indicators from config
   * Creates only enabled indicators
   *
   * Uses IndicatorType enum to ensure type safety (no magic strings!)
   *
   * @param config IndicatorsConfig from strategy
   * @returns Map<type, IIndicator> for analyzers to inject
   * @throws Error if indicator registered but config missing
   */
  async loadIndicators(config: IndicatorsConfig): Promise<Map<IndicatorType, IIndicator>> {
    const indicators = new Map<IndicatorType, IIndicator>();

    try {
      // Load each indicator based on config
      // Using enum ensures type-safety and catches typos at compile time

      if (config.ema?.enabled) {
        this.validateRegistration(IndicatorType.EMA);
        this.logger.debug('Loading EMA indicator', {
          fastPeriod: config.ema.fastPeriod,
          slowPeriod: config.ema.slowPeriod,
        });
        indicators.set(IndicatorType.EMA, new EMAIndicatorNew(config.ema));
      }

      if (config.rsi?.enabled) {
        this.validateRegistration(IndicatorType.RSI);
        this.logger.debug('Loading RSI indicator', {
          period: config.rsi.period,
        });
        indicators.set(IndicatorType.RSI, new RSIIndicatorNew(config.rsi));
      }

      if (config.atr?.enabled) {
        this.validateRegistration(IndicatorType.ATR);
        this.logger.debug('Loading ATR indicator', {
          period: config.atr.period,
        });
        indicators.set(IndicatorType.ATR, new ATRIndicatorNew(config.atr));
      }

      if (config.volume?.enabled) {
        this.validateRegistration(IndicatorType.VOLUME);
        this.logger.debug('Loading Volume indicator', {
          period: config.volume.period,
        });
        indicators.set(IndicatorType.VOLUME, new VolumeIndicatorNew(config.volume));
      }

      if (config.stochastic?.enabled) {
        this.validateRegistration(IndicatorType.STOCHASTIC);
        this.logger.debug('Loading Stochastic indicator');
        indicators.set(IndicatorType.STOCHASTIC, new StochasticIndicatorNew(config.stochastic));
      }

      if (config.bollingerBands?.enabled) {
        this.validateRegistration(IndicatorType.BOLLINGER_BANDS);
        this.logger.debug('Loading Bollinger Bands indicator');
        indicators.set(IndicatorType.BOLLINGER_BANDS, new BollingerBandsIndicatorNew(config.bollingerBands));
      }

      this.logger.info(`📊 Loaded ${indicators.size} indicators`, {
        types: Array.from(indicators.keys()),
      });

      return indicators;
    } catch (error) {
      this.logger.error('Failed to load indicators:', error instanceof Error ? { message: error.message } : {});
      throw error;
    }
  }

  /**
   * Validate that indicator is registered
   * @param type Indicator type (enum - no magic strings!)
   * @throws Error if not registered
   */
  private validateRegistration(type: IndicatorType): void {
    if (!this.registry.isRegistered(type)) {
      throw new Error(`Indicator ${type} is not registered in registry. Make sure IndicatorRegistry.register() was called during initialization.`);
    }
  }
}
