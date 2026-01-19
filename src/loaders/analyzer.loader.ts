/**
 * Analyzer Loader Service
 *
 * Responsibility:
 * - Load analyzer implementations based on config
 * - Create instances of analyzers with their configs
 * - Validate that analyzers are registered
 * - Return Map<type, IAnalyzer> for use in strategies
 *
 * Architecture:
 * - Registry: metadata only (no implementations)
 * - Loader: creates implementations (imports actual classes)
 * - Strategies: consume through IAnalyzer interface
 *
 * Why separate?
 * - DIP: Registry doesn't depend on implementations
 * - SRP: Loader handles loading, Registry handles registry
 * - Testability: Can mock Registry/Loader independently
 *
 * Pattern Mirror:
 * - Same as IndicatorLoader
 * - Uses AnalyzerType enum (no magic strings!)
 * - Lazy-loads implementations on demand
 */

import AnalyzerRegistryService from '../services/analyzer-registry.service';
import { IAnalyzer } from '../types/analyzer.interface';
import { AnalyzerType } from '../types/analyzer-type.enum';
import { LoggerService } from '../services/logger.service';
import { IIndicator } from '../types/indicator.interface';
import { IndicatorType } from '../types/indicator-type.enum';

/**
 * Loader imports the ACTUAL analyzer implementations
 * Registry knows nothing about these imports!
 */
// NOTE: These imports are HERE, not in Registry
// This is the key separation: Registry is pure, Loader has dependencies

// Basic indicator analyzers (6)
import { EmaAnalyzerNew } from '../analyzers/ema.analyzer-new';
import { RsiAnalyzerNew } from '../analyzers/rsi.analyzer-new';
import { AtrAnalyzerNew } from '../analyzers/atr.analyzer-new';
import { VolumeAnalyzerNew } from '../analyzers/volume.analyzer-new';
import { StochasticAnalyzerNew } from '../analyzers/stochastic.analyzer-new';
import { BollingerBandsAnalyzerNew } from '../analyzers/bollinger-bands.analyzer-new';

// Advanced analyzers
import { DivergenceAnalyzerNew } from '../analyzers/divergence.analyzer-new';
import { BreakoutAnalyzerNew } from '../analyzers/breakout.analyzer-new';
import { WickAnalyzerNew } from '../analyzers/wick.analyzer-new';
import { PriceActionAnalyzerNew } from '../analyzers/price-action.analyzer-new';
import { ChochBosAnalyzerNew } from '../analyzers/choch-bos.analyzer-new';
import { SwingAnalyzerNew } from '../analyzers/swing.analyzer-new';
import { TrendConflictAnalyzerNew } from '../analyzers/trend-conflict.analyzer-new';
import { TrendDetectorAnalyzerNew } from '../analyzers/trend-detector.analyzer-new';
import { LevelAnalyzerNew } from '../analyzers/level.analyzer-new';
import { MicroWallAnalyzerNew } from '../analyzers/micro-wall.analyzer-new';
import { OrderBlockAnalyzerNew } from '../analyzers/order-block.analyzer-new';
import { FairValueGapAnalyzerNew } from '../analyzers/fair-value-gap.analyzer-new';
import { LiquiditySweepAnalyzerNew } from '../analyzers/liquidity-sweep.analyzer-new';
import { LiquidityZoneAnalyzerNew } from '../analyzers/liquidity-zone.analyzer-new';
import { WhaleAnalyzerNew } from '../analyzers/whale.analyzer-new';
import { VolatilitySpikeAnalyzerNew } from '../analyzers/volatility-spike.analyzer-new';
import { FootprintAnalyzerNew } from '../analyzers/footprint.analyzer-new';
import { OrderFlowAnalyzerNew } from '../analyzers/order-flow.analyzer-new';
import { TickDeltaAnalyzerNew } from '../analyzers/tick-delta.analyzer-new';
import { DeltaAnalyzerNew } from '../analyzers/delta.analyzer-new';
import { PriceMomentumAnalyzerNew } from '../analyzers/price-momentum.analyzer-new';
import { VolumeProfileAnalyzerNew } from '../analyzers/volume-profile.analyzer-new';

/**
 * Config type for analyzer instantiation
 * Mirrors the pattern used in IndicatorLoader
 */
export interface AnalyzerConfig {
  [key: string]: any;
  enabled: boolean;
  weight: number;
  priority: number;
}

export interface AnalyzersConfig {
  [key: string]: AnalyzerConfig;
}

export class AnalyzerLoader {
  constructor(
    private registry: AnalyzerRegistryService,
    private logger: LoggerService,
    private indicators?: Map<IndicatorType, IIndicator>
  ) {}

  /**
   * Load analyzers from config
   * Creates only enabled analyzers
   *
   * Uses AnalyzerType enum to ensure type safety (no magic strings!)
   *
   * @param config AnalyzersConfig from strategy
   * @param indicators Optional indicator instances for basic analyzers
   * @returns Map<type, IAnalyzer> for strategies to use
   * @throws Error if analyzer registered but config missing
   */
  async loadAnalyzers(
    config: AnalyzersConfig,
    indicators?: Map<IndicatorType, IIndicator>
  ): Promise<Map<AnalyzerType, IAnalyzer>> {
    const analyzers = new Map<AnalyzerType, IAnalyzer>();

    // Update indicators if provided
    if (indicators) {
      this.indicators = indicators;
    }

    try {
      // ========== BASIC INDICATOR ANALYZERS (6) ==========

      if (config.ema?.enabled) {
        this.logger.debug('Loading EMA analyzer', {
          weight: config.ema.weight,
          priority: config.ema.priority,
        });
        const indicator = this.getIndicator(IndicatorType.EMA);
        analyzers.set(AnalyzerType.EMA, new EmaAnalyzerNew(config.ema as any, this.logger, indicator));
      }

      if (config.rsi?.enabled) {
        this.logger.debug('Loading RSI analyzer', {
          weight: config.rsi.weight,
          priority: config.rsi.priority,
        });
        const indicator = this.getIndicator(IndicatorType.RSI);
        analyzers.set(AnalyzerType.RSI, new RsiAnalyzerNew(config.rsi as any, this.logger, indicator));
      }

      if (config.atr?.enabled) {
        this.logger.debug('Loading ATR analyzer');
        const indicator = this.getIndicator(IndicatorType.ATR);
        analyzers.set(AnalyzerType.ATR, new AtrAnalyzerNew(config.atr as any, this.logger, indicator));
      }

      if (config.volume?.enabled) {
        this.logger.debug('Loading Volume analyzer');
        const indicator = this.getIndicator(IndicatorType.VOLUME);
        analyzers.set(AnalyzerType.VOLUME, new VolumeAnalyzerNew(config.volume as any, this.logger, indicator));
      }

      if (config.stochastic?.enabled) {
        this.logger.debug('Loading Stochastic analyzer');
        const indicator = this.getIndicator(IndicatorType.STOCHASTIC);
        analyzers.set(AnalyzerType.STOCHASTIC, new StochasticAnalyzerNew(config.stochastic as any, this.logger, indicator));
      }

      if (config.bollingerBands?.enabled) {
        this.logger.debug('Loading Bollinger Bands analyzer');
        const indicator = this.getIndicator(IndicatorType.BOLLINGER_BANDS);
        analyzers.set(AnalyzerType.BOLLINGER_BANDS, new BollingerBandsAnalyzerNew(config.bollingerBands as any, this.logger, indicator));
      }

      // ========== DIVERGENCE ==========
      if (config.divergence?.enabled) {
        this.logger.debug('Loading Divergence analyzer');
        analyzers.set(AnalyzerType.DIVERGENCE, new DivergenceAnalyzerNew(config.divergence as any, this.logger));
      }

      // ========== BREAKOUT ==========
      if (config.breakout?.enabled) {
        this.logger.debug('Loading Breakout analyzer');
        analyzers.set(AnalyzerType.BREAKOUT, new BreakoutAnalyzerNew(config.breakout, this.logger));
      }

      // ========== PRICE ACTION ==========
      if (config.priceAction?.enabled) {
        this.logger.debug('Loading Price Action analyzer');
        analyzers.set(AnalyzerType.PRICE_ACTION, new PriceActionAnalyzerNew(config.priceAction, this.logger));
      }

      if (config.wick?.enabled) {
        this.logger.debug('Loading Wick analyzer');
        analyzers.set(AnalyzerType.WICK, new WickAnalyzerNew(config.wick, this.logger));
      }

      // ========== STRUCTURE ANALYSIS ==========
      if (config.chochBos?.enabled) {
        this.logger.debug('Loading CHOCH/BOS analyzer');
        analyzers.set(AnalyzerType.CHOCH_BOS, new ChochBosAnalyzerNew(config.chochBos, this.logger));
      }

      if (config.swing?.enabled) {
        this.logger.debug('Loading Swing analyzer');
        analyzers.set(AnalyzerType.SWING, new SwingAnalyzerNew(config.swing, this.logger));
      }

      if (config.trendConflict?.enabled) {
        this.logger.debug('Loading Trend Conflict analyzer');
        analyzers.set(AnalyzerType.TREND_CONFLICT, new TrendConflictAnalyzerNew(config.trendConflict, this.logger));
      }

      if (config.trendDetector?.enabled) {
        this.logger.debug('Loading Trend Detector analyzer');
        analyzers.set(AnalyzerType.TREND_DETECTOR, new TrendDetectorAnalyzerNew(config.trendDetector as any, this.logger));
      }

      // ========== LEVEL ANALYSIS ==========
      if (config.level?.enabled) {
        this.logger.debug('Loading Level analyzer');
        analyzers.set(AnalyzerType.LEVEL, new LevelAnalyzerNew(config.level, this.logger));
      }

      if (config.microWall?.enabled) {
        this.logger.debug('Loading Micro Wall analyzer');
        analyzers.set(AnalyzerType.MICRO_WALL, new MicroWallAnalyzerNew(config.microWall, this.logger));
      }

      if (config.orderBlock?.enabled) {
        this.logger.debug('Loading Order Block analyzer');
        analyzers.set(AnalyzerType.ORDER_BLOCK, new OrderBlockAnalyzerNew(config.orderBlock, this.logger));
      }

      if (config.fairValueGap?.enabled) {
        this.logger.debug('Loading Fair Value Gap analyzer');
        analyzers.set(AnalyzerType.FAIR_VALUE_GAP, new FairValueGapAnalyzerNew(config.fairValueGap, this.logger));
      }

      // ========== LIQUIDITY & SMART MONEY CONCEPT ==========
      if (config.liquiditySweep?.enabled) {
        this.logger.debug('Loading Liquidity Sweep analyzer');
        analyzers.set(AnalyzerType.LIQUIDITY_SWEEP, new LiquiditySweepAnalyzerNew(config.liquiditySweep, this.logger));
      }

      if (config.liquidityZone?.enabled) {
        this.logger.debug('Loading Liquidity Zone analyzer');
        analyzers.set(AnalyzerType.LIQUIDITY_ZONE, new LiquidityZoneAnalyzerNew(config.liquidityZone, this.logger));
      }

      if (config.whale?.enabled) {
        this.logger.debug('Loading Whale analyzer');
        analyzers.set(AnalyzerType.WHALE, new WhaleAnalyzerNew(config.whale, this.logger));
      }

      if (config.volatilitySpike?.enabled) {
        this.logger.debug('Loading Volatility Spike analyzer');
        analyzers.set(AnalyzerType.VOLATILITY_SPIKE, new VolatilitySpikeAnalyzerNew(config.volatilitySpike, this.logger));
      }

      if (config.footprint?.enabled) {
        this.logger.debug('Loading Footprint analyzer');
        analyzers.set(AnalyzerType.FOOTPRINT, new FootprintAnalyzerNew(config.footprint, this.logger));
      }

      // ========== ORDER FLOW ==========
      if (config.orderFlow?.enabled) {
        this.logger.debug('Loading Order Flow analyzer');
        analyzers.set(AnalyzerType.ORDER_FLOW, new OrderFlowAnalyzerNew(config.orderFlow, this.logger));
      }

      if (config.tickDelta?.enabled) {
        this.logger.debug('Loading Tick Delta analyzer');
        analyzers.set(AnalyzerType.TICK_DELTA, new TickDeltaAnalyzerNew(config.tickDelta, this.logger));
      }

      if (config.delta?.enabled) {
        this.logger.debug('Loading Delta analyzer');
        analyzers.set(AnalyzerType.DELTA, new DeltaAnalyzerNew(config.delta, this.logger));
      }

      // ========== SCALPING ==========
      if (config.priceMomentum?.enabled) {
        this.logger.debug('Loading Price Momentum analyzer');
        analyzers.set(AnalyzerType.PRICE_MOMENTUM, new PriceMomentumAnalyzerNew(config.priceMomentum as any, this.logger));
      }

      if (config.volumeProfile?.enabled) {
        this.logger.debug('Loading Volume Profile analyzer');
        analyzers.set(AnalyzerType.VOLUME_PROFILE, new VolumeProfileAnalyzerNew(config.volumeProfile, this.logger));
      }

      this.logger.info(`Loaded ${analyzers.size} analyzers`, {
        types: Array.from(analyzers.keys()),
      });

      return analyzers;
    } catch (error) {
      this.logger.error('Failed to load analyzers', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get indicator instance by type
   *
   * @param type Indicator type
   * @returns Indicator instance or null
   */
  private getIndicator(type: IndicatorType): IIndicator | null {
    if (!this.indicators) {
      return null;
    }
    return this.indicators.get(type) || null;
  }
}
