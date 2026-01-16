/**
 * ANALYZER REGISTRY SERVICE
 * Factory pattern for dynamic analyzer instantiation
 *
 * Replaces hardcoded analyzer instantiation with configuration-driven registry.
 * Allows enabling/disabling analyzers via strategy JSON without code changes.
 *
 * Benefits:
 * - True black-box pattern: analyzers configured, not hardcoded
 * - Runtime analyzer loading from strategy config
 * - Easy to add/remove analyzers
 * - Type-safe factory pattern
 */

import { LoggerService } from './logger.service';
import { SwingPointDetectorService } from './swing-point-detector.service';
import { StrategyAnalyzerConfig } from '../types/strategy-config.types';
import { IIndicator } from '../types/indicator.interface';
import { IndicatorType } from '../types/indicator-type.enum';

// Lazy-load analyzer types for type safety
type AnalyzerInstance = any; // Will be typed as specific analyzer interfaces in real code

/**
 * Analyzer metadata for registry
 */
interface AnalyzerMetadata {
  name: string;
  class: { new(config: any, logger: LoggerService): AnalyzerInstance };
  description: string;
  category: 'technical' | 'advanced' | 'structure' | 'liquidity' | 'scalping';
}

/**
 * Registry of all available analyzers
 */
const ANALYZER_REGISTRY: Map<string, AnalyzerMetadata> = new Map();

/**
 * AnalyzerRegistry Service
 * Manages dynamic analyzer instantiation and lifecycle
 */
export class AnalyzerRegistryService {
  private loadedAnalyzers: Map<string, AnalyzerInstance> = new Map();
  private analyzerClasses: Map<string, any> = new Map();
  private swingPointDetector: SwingPointDetectorService;
  private indicators: Map<IndicatorType, IIndicator> = new Map();

  constructor(private logger: LoggerService) {
    this.initializeAnalyzerMap();
    // Initialize SwingPointDetectorService for analyzers that need it
    this.swingPointDetector = new SwingPointDetectorService(this.logger, 2);
  }

  /**
   * Set indicators to be used by analyzers
   * Called by TradingOrchestrator after indicators are loaded from config
   * @param indicators Map of loaded indicator instances
   */
  setIndicators(indicators: Map<IndicatorType, IIndicator>): void {
    this.indicators = indicators;
    this.logger.debug('📊 Indicators set in AnalyzerRegistry', {
      count: indicators.size,
      types: Array.from(indicators.keys()),
    });
  }

  /**
   * Get a specific indicator instance by type
   * Used when initializing analyzers that need specific indicators
   * @param type Indicator type (enum, not string!)
   * @returns Indicator instance or null if not loaded
   */
  getIndicator(type: IndicatorType): IIndicator | null {
    return this.indicators.get(type) || null;
  }

  /**
   * Get all loaded indicators
   * @returns Map of all indicator instances
   */
  getAllIndicators(): Map<IndicatorType, IIndicator> {
    return this.indicators;
  }

  /**
   * Initialize lazy-loading map for analyzer classes
   * These will be imported on demand
   */
  private initializeAnalyzerMap(): void {
    // Technical Indicators (6)
    this.analyzerClasses.set('EMA_ANALYZER_NEW', () =>
      import('../analyzers/ema.analyzer-new').then(m => m.EmaAnalyzerNew)
    );
    this.analyzerClasses.set('RSI_ANALYZER_NEW', () =>
      import('../analyzers/rsi.analyzer-new').then(m => m.RsiAnalyzerNew)
    );
    this.analyzerClasses.set('ATR_ANALYZER_NEW', () =>
      import('../analyzers/atr.analyzer-new').then(m => m.AtrAnalyzerNew)
    );
    this.analyzerClasses.set('VOLUME_ANALYZER_NEW', () =>
      import('../analyzers/volume.analyzer-new').then(m => m.VolumeAnalyzerNew)
    );
    this.analyzerClasses.set('STOCHASTIC_ANALYZER_NEW', () =>
      import('../analyzers/stochastic.analyzer-new').then(m => m.StochasticAnalyzerNew)
    );
    this.analyzerClasses.set('BOLLINGER_BANDS_ANALYZER_NEW', () =>
      import('../analyzers/bollinger-bands.analyzer-new').then(m => m.BollingerBandsAnalyzerNew)
    );

    // Advanced Analysis (4)
    this.analyzerClasses.set('DIVERGENCE_ANALYZER_NEW', () =>
      import('../analyzers/divergence.analyzer-new').then(m => m.DivergenceAnalyzerNew)
    );
    this.analyzerClasses.set('BREAKOUT_ANALYZER_NEW', () =>
      import('../analyzers/breakout.analyzer-new').then(m => m.BreakoutAnalyzerNew)
    );
    this.analyzerClasses.set('WICK_ANALYZER_NEW', () =>
      import('../analyzers/wick.analyzer-new').then(m => m.WickAnalyzerNew)
    );
    this.analyzerClasses.set('PRICE_MOMENTUM_ANALYZER_NEW', () =>
      import('../analyzers/price-momentum.analyzer-new').then(m => m.PriceMomentumAnalyzerNew)
    );

    // Structure Analysis (4)
    this.analyzerClasses.set('TREND_DETECTOR_ANALYZER_NEW', () =>
      import('../analyzers/trend-detector.analyzer-new').then(m => m.TrendDetectorAnalyzerNew)
    );
    this.analyzerClasses.set('SWING_ANALYZER_NEW', () =>
      import('../analyzers/swing.analyzer-new').then(m => m.SwingAnalyzerNew)
    );
    this.analyzerClasses.set('LEVEL_ANALYZER_NEW', () =>
      import('../analyzers/level.analyzer-new').then(m => m.LevelAnalyzerNew)
    );
    this.analyzerClasses.set('CHOCH_BOS_ANALYZER_NEW', () =>
      import('../analyzers/choch-bos.analyzer-new').then(m => m.ChochBosAnalyzerNew)
    );

    // Liquidity & Smart Money (8)
    this.analyzerClasses.set('LIQUIDITY_SWEEP_ANALYZER_NEW', () =>
      import('../analyzers/liquidity-sweep.analyzer-new').then(m => m.LiquiditySweepAnalyzerNew)
    );
    this.analyzerClasses.set('LIQUIDITY_ZONE_ANALYZER_NEW', () =>
      import('../analyzers/liquidity-zone.analyzer-new').then(m => m.LiquidityZoneAnalyzerNew)
    );
    this.analyzerClasses.set('ORDER_BLOCK_ANALYZER_NEW', () =>
      import('../analyzers/order-block.analyzer-new').then(m => m.OrderBlockAnalyzerNew)
    );
    this.analyzerClasses.set('FAIR_VALUE_GAP_ANALYZER_NEW', () =>
      import('../analyzers/fair-value-gap.analyzer-new').then(m => m.FairValueGapAnalyzerNew)
    );
    this.analyzerClasses.set('VOLUME_PROFILE_ANALYZER_NEW', () =>
      import('../analyzers/volume-profile.analyzer-new').then(m => m.VolumeProfileAnalyzerNew)
    );
    this.analyzerClasses.set('ORDER_FLOW_ANALYZER_NEW', () =>
      import('../analyzers/order-flow.analyzer-new').then(m => m.OrderFlowAnalyzerNew)
    );
    this.analyzerClasses.set('FOOTPRINT_ANALYZER_NEW', () =>
      import('../analyzers/footprint.analyzer-new').then(m => m.FootprintAnalyzerNew)
    );
    this.analyzerClasses.set('WHALE_ANALYZER_NEW', () =>
      import('../analyzers/whale.analyzer-new').then(m => m.WhaleAnalyzerNew)
    );

    // Micro-Level Analysis (3)
    this.analyzerClasses.set('MICRO_WALL_ANALYZER_NEW', () =>
      import('../analyzers/micro-wall.analyzer-new').then(m => m.MicroWallAnalyzerNew)
    );
    this.analyzerClasses.set('DELTA_ANALYZER_NEW', () =>
      import('../analyzers/delta.analyzer-new').then(m => m.DeltaAnalyzerNew)
    );
    this.analyzerClasses.set('TICK_DELTA_ANALYZER_NEW', () =>
      import('../analyzers/tick-delta.analyzer-new').then(m => m.TickDeltaAnalyzerNew)
    );

    // Additional (3)
    this.analyzerClasses.set('PRICE_ACTION_ANALYZER_NEW', () =>
      import('../analyzers/price-action.analyzer-new').then(m => m.PriceActionAnalyzerNew)
    );
    this.analyzerClasses.set('TREND_CONFLICT_ANALYZER_NEW', () =>
      import('../analyzers/trend-conflict.analyzer-new').then(m => m.TrendConflictAnalyzerNew)
    );
    this.analyzerClasses.set('VOLATILITY_SPIKE_ANALYZER_NEW', () =>
      import('../analyzers/volatility-spike.analyzer-new').then(m => m.VolatilitySpikeAnalyzerNew)
    );
  }

  /**
   * Get or create analyzer instance
   * @param config Base config with indicators and analyzerDefaults
   * @param analyzerConfig Specific analyzer config with name and parameters
   * @returns Analyzer instance
   */
  async getAnalyzerInstance(
    config: any,
    analyzerConfig: StrategyAnalyzerConfig,
  ): Promise<AnalyzerInstance | null> {
    const analyzerName = analyzerConfig.name;

    // Validate analyzer exists in registry
    if (!this.analyzerClasses.has(analyzerName)) {
      this.logger.warn(`Unknown analyzer: ${analyzerName}`, {
        availableAnalyzers: Array.from(this.analyzerClasses.keys()),
      });
      return null;
    }

    // Check cache
    if (this.loadedAnalyzers.has(analyzerName)) {
      return this.loadedAnalyzers.get(analyzerName)!;
    }

    try {
      // Load analyzer class
      const loaderFn = this.analyzerClasses.get(analyzerName);
      const AnalyzerClass = await loaderFn();

      // Build analyzer-specific config by merging defaults and strategy params
      const analyzerConfig2 = this.buildAnalyzerConfig(config, analyzerConfig);

      // Create instance - some analyzers need additional services/indicators injected
      let instance;
      if (analyzerName === 'LEVEL_ANALYZER_NEW') {
        // LevelAnalyzer needs SwingPointDetectorService for better level detection
        instance = new AnalyzerClass(analyzerConfig2, this.logger, this.swingPointDetector);
      } else if (this.isBasicAnalyzer(analyzerName)) {
        // Basic 6 analyzers receive their corresponding indicator through DI
        const indicator = this.getIndicatorForAnalyzer(analyzerName);
        instance = new AnalyzerClass(analyzerConfig2, this.logger, indicator);
      } else {
        // Advanced analyzers only need config and logger
        instance = new AnalyzerClass(analyzerConfig2, this.logger);
      }

      // Cache instance for reuse
      this.loadedAnalyzers.set(analyzerName, instance);

      this.logger.debug(`Loaded analyzer: ${analyzerName}`);
      return instance;
    } catch (error) {
      this.logger.error(`Failed to load analyzer: ${analyzerName}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Build analyzer-specific config by merging defaults and strategy params
   * @param baseConfig Config with indicators and analyzerDefaults sections
   * @param analyzerCfg Analyzer config from strategy
   * @returns Merged config for the specific analyzer
   */
  private buildAnalyzerConfig(baseConfig: any, analyzerCfg: StrategyAnalyzerConfig): any {
    const indicators = baseConfig.indicators || {};
    const analyzerDefaults = baseConfig.analyzerDefaults || {};

    // Start with enabled flag and metadata
    const config: any = {
      enabled: analyzerCfg.enabled,
      weight: analyzerCfg.weight,
      priority: analyzerCfg.priority,
      minConfidence: analyzerCfg.minConfidence ?? 0.5,
      maxConfidence: analyzerCfg.maxConfidence ?? 1.0,
    };

    // 1. Merge analyzer defaults from main config
    if (analyzerDefaults[analyzerCfg.name]) {
      Object.assign(config, analyzerDefaults[analyzerCfg.name]);
    }

    // 2. Map analyzer names to their indicator configs
    const analyzerToIndicator: Record<string, string> = {
      EMA_ANALYZER_NEW: 'ema',
      RSI_ANALYZER_NEW: 'rsi',
      ATR_ANALYZER_NEW: 'atr',
      VOLUME_ANALYZER_NEW: 'volume',
      STOCHASTIC_ANALYZER_NEW: 'stochastic',
      BOLLINGER_BANDS_ANALYZER_NEW: 'bollingerBands',
    };

    // Merge indicator config if available (overrides defaults)
    const indicatorKey = analyzerToIndicator[analyzerCfg.name];
    if (indicatorKey && indicators[indicatorKey]) {
      Object.assign(config, indicators[indicatorKey]);
    }

    // 3. Add analyzer-specific params from strategy (highest priority)
    if (analyzerCfg.params) {
      Object.assign(config, analyzerCfg.params);
    }

    return config;
  }

  /**
   * Get all enabled analyzers from strategy config
   * @param analyzerConfigs Array of analyzer configurations from strategy
   * @param config Full config object to pass to analyzers
   * @returns Map of enabled analyzers by name
   */
  async getEnabledAnalyzers(
    analyzerConfigs: StrategyAnalyzerConfig[],
    config: any,
  ): Promise<Map<string, { instance: AnalyzerInstance; weight: number; priority: number }>> {
    const enabledAnalyzers = new Map();

    for (const analyzerCfg of analyzerConfigs) {
      if (!analyzerCfg.enabled) continue;

      const instance = await this.getAnalyzerInstance(config, analyzerCfg);
      if (instance) {
        enabledAnalyzers.set(analyzerCfg.name, {
          instance,
          weight: analyzerCfg.weight,
          priority: analyzerCfg.priority,
        });
      }
    }

    return enabledAnalyzers;
  }

  /**
   * Get list of all available analyzer names
   */
  getAvailableAnalyzers(): string[] {
    return Array.from(this.analyzerClasses.keys());
  }

  /**
   * Check if analyzer is available
   */
  isAnalyzerAvailable(name: string): boolean {
    return this.analyzerClasses.has(name);
  }

  /**
   * Check if analyzer is one of the 6 basic analyzers that use indicators
   * @param analyzerName Name of the analyzer
   * @returns true if basic analyzer (EMA, RSI, ATR, Volume, Stochastic, Bollinger Bands)
   */
  private isBasicAnalyzer(analyzerName: string): boolean {
    const basicAnalyzers = [
      'EMA_ANALYZER_NEW',
      'RSI_ANALYZER_NEW',
      'ATR_ANALYZER_NEW',
      'VOLUME_ANALYZER_NEW',
      'STOCHASTIC_ANALYZER_NEW',
      'BOLLINGER_BANDS_ANALYZER_NEW',
    ];
    return basicAnalyzers.includes(analyzerName);
  }

  /**
   * Get the indicator instance for a basic analyzer
   * Maps analyzer names to their corresponding IndicatorType
   * @param analyzerName Name of the basic analyzer
   * @returns Indicator instance or null if not available
   */
  private getIndicatorForAnalyzer(analyzerName: string): IIndicator | null {
    const analyzerToIndicatorType: Record<string, IndicatorType> = {
      EMA_ANALYZER_NEW: IndicatorType.EMA,
      RSI_ANALYZER_NEW: IndicatorType.RSI,
      ATR_ANALYZER_NEW: IndicatorType.ATR,
      VOLUME_ANALYZER_NEW: IndicatorType.VOLUME,
      STOCHASTIC_ANALYZER_NEW: IndicatorType.STOCHASTIC,
      BOLLINGER_BANDS_ANALYZER_NEW: IndicatorType.BOLLINGER_BANDS,
    };

    const indicatorType = analyzerToIndicatorType[analyzerName];
    if (!indicatorType) {
      return null;
    }

    const indicator = this.getIndicator(indicatorType);
    if (!indicator) {
      this.logger.warn(`Indicator ${indicatorType} not available for ${analyzerName}`);
    }
    return indicator;
  }

  /**
   * Clear cached instances (for testing/reset)
   */
  clearCache(): void {
    this.loadedAnalyzers.clear();
    this.logger.debug('Analyzer registry cache cleared');
  }
}

export default AnalyzerRegistryService;
