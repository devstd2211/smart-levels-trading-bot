/**
 * STRATEGY LOADER SERVICE
 * Loads, validates, and parses strategy JSON configuration files
 *
 * Responsibilities:
 * 1. Load strategy JSON from file system
 * 2. Validate against schema
 * 3. Validate analyzer references exist
 * 4. Validate weight distribution
 * 5. Return parsed StrategyConfig
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import {
  StrategyConfig,
  AvailableAnalyzer,
  StrategyValidationError,
  StrategyAnalyzerConfig,
  StrategyMetadata,
} from '../types/strategy-config.types';

const AVAILABLE_ANALYZERS: Set<AvailableAnalyzer> = new Set([
  // Technical Indicators
  'EMA_ANALYZER_NEW',
  'RSI_ANALYZER_NEW',
  'ATR_ANALYZER_NEW',
  'VOLUME_ANALYZER_NEW',
  'STOCHASTIC_ANALYZER_NEW',
  'BOLLINGER_BANDS_ANALYZER_NEW',
  // Advanced Analysis
  'DIVERGENCE_ANALYZER_NEW',
  'BREAKOUT_ANALYZER_NEW',
  'WICK_ANALYZER_NEW',
  'PRICE_MOMENTUM_ANALYZER_NEW',
  // Structure Analysis
  'TREND_DETECTOR_ANALYZER_NEW',
  'SWING_ANALYZER_NEW',
  'LEVEL_ANALYZER_NEW',
  'CHOCH_BOS_ANALYZER_NEW',
  // Liquidity & Smart Money
  'LIQUIDITY_SWEEP_ANALYZER_NEW',
  'LIQUIDITY_ZONE_ANALYZER_NEW',
  'ORDER_BLOCK_ANALYZER_NEW',
  'FAIR_VALUE_GAP_ANALYZER_NEW',
  'VOLUME_PROFILE_ANALYZER_NEW',
  'ORDER_FLOW_ANALYZER_NEW',
  'FOOTPRINT_ANALYZER_NEW',
  'WHALE_ANALYZER_NEW',
  // Micro-Level Analysis
  'MICRO_WALL_ANALYZER_NEW',
  'DELTA_ANALYZER_NEW',
  'TICK_DELTA_ANALYZER_NEW',
  'PRICE_ACTION_ANALYZER_NEW',
  // Additional
  'TREND_CONFLICT_ANALYZER_NEW',
  'WHALE_HUNTER_ANALYZER_NEW',
  'VOLATILITY_SPIKE_ANALYZER_NEW',
]);

export class StrategyLoaderService {
  private strategiesDir: string;

  constructor(strategiesDir: string = join(process.cwd(), 'strategies', 'json')) {
    this.strategiesDir = strategiesDir;
  }

  /**
   * Load strategy from JSON file
   * @param strategyName - Strategy file name (without .json extension)
   * @returns Parsed and validated StrategyConfig
   * @throws StrategyValidationError if validation fails
   */
  async loadStrategy(strategyName: string): Promise<StrategyConfig> {
    try {
      const filePath = join(this.strategiesDir, `${strategyName}.strategy.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      // Validate the loaded strategy
      this.validateStrategy(parsed);

      return parsed as StrategyConfig;
    } catch (error) {
      if (error instanceof StrategyValidationError) {
        throw error;
      }

      if (error instanceof SyntaxError) {
        throw new StrategyValidationError(
          `Invalid JSON in strategy file: ${error.message}`,
          'json',
        );
      }

      throw new StrategyValidationError(
        `Failed to load strategy '${strategyName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        'file',
      );
    }
  }

  /**
   * Validate strategy configuration structure and content
   * @throws StrategyValidationError if validation fails
   */
  private validateStrategy(strategy: unknown): void {
    if (!strategy || typeof strategy !== 'object') {
      throw new StrategyValidationError('Strategy must be an object');
    }

    const config = strategy as Record<string, unknown>;

    // Validate required fields
    if (typeof config.version !== 'number') {
      throw new StrategyValidationError('version must be a number', 'version');
    }

    if (!config.metadata || typeof config.metadata !== 'object') {
      throw new StrategyValidationError('metadata is required and must be an object', 'metadata');
    }

    if (!Array.isArray(config.analyzers) || config.analyzers.length === 0) {
      throw new StrategyValidationError(
        'analyzers must be a non-empty array',
        'analyzers',
      );
    }

    // Validate metadata
    this.validateMetadata(config.metadata as StrategyMetadata);

    // Validate analyzers
    this.validateAnalyzers(config.analyzers as StrategyAnalyzerConfig[]);

    // Validate overrides if present
    if (config.indicators && typeof config.indicators === 'object') {
      this.validateIndicatorOverrides(config.indicators as Record<string, unknown>);
    }

    if (config.filters && typeof config.filters === 'object') {
      this.validateFilterOverrides(config.filters as Record<string, unknown>);
    }

    if (config.riskManagement && typeof config.riskManagement === 'object') {
      this.validateRiskManagementOverrides(config.riskManagement as Record<string, unknown>);
    }
  }

  /**
   * Validate metadata section
   */
  private validateMetadata(metadata: unknown): void {
    if (!metadata || typeof metadata !== 'object') {
      throw new StrategyValidationError('metadata must be an object', 'metadata');
    }

    const meta = metadata as Record<string, unknown>;

    const requiredFields = ['name', 'version', 'description', 'createdAt', 'lastModified', 'tags'];
    for (const field of requiredFields) {
      if (!meta[field]) {
        throw new StrategyValidationError(
          `metadata.${field} is required`,
          `metadata.${field}`,
        );
      }
    }

    if (typeof meta.name !== 'string') {
      throw new StrategyValidationError('metadata.name must be a string', 'metadata.name');
    }

    if (typeof meta.version !== 'string') {
      throw new StrategyValidationError('metadata.version must be a string', 'metadata.version');
    }

    if (!Array.isArray(meta.tags)) {
      throw new StrategyValidationError('metadata.tags must be an array', 'metadata.tags');
    }

    // Validate backtest results if present
    if (meta.backtest) {
      if (typeof meta.backtest !== 'object') {
        throw new StrategyValidationError(
          'metadata.backtest must be an object',
          'metadata.backtest',
        );
      }
      const backtest = meta.backtest as Record<string, unknown>;
      if (
        typeof backtest.winRate !== 'number' ||
        backtest.winRate < 0 ||
        backtest.winRate > 1
      ) {
        throw new StrategyValidationError(
          'metadata.backtest.winRate must be a number between 0 and 1',
          'metadata.backtest.winRate',
        );
      }
    }
  }

  /**
   * Validate analyzers configuration
   */
  private validateAnalyzers(analyzers: unknown[]): void {
    if (!Array.isArray(analyzers)) {
      throw new StrategyValidationError('analyzers must be an array', 'analyzers');
    }

    const names = new Set<string>();

    for (let i = 0; i < analyzers.length; i++) {
      const analyzer = analyzers[i];

      if (!analyzer || typeof analyzer !== 'object') {
        throw new StrategyValidationError(
          `analyzers[${i}] must be an object`,
          `analyzers[${i}]`,
        );
      }

      const a = analyzer as Record<string, unknown>;

      // Validate required fields
      if (typeof a.name !== 'string') {
        throw new StrategyValidationError(
          `analyzers[${i}].name must be a string`,
          `analyzers[${i}].name`,
        );
      }

      if (typeof a.enabled !== 'boolean') {
        throw new StrategyValidationError(
          `analyzers[${i}].enabled must be a boolean`,
          `analyzers[${i}].enabled`,
        );
      }

      if (typeof a.weight !== 'number' || a.weight < 0 || a.weight > 1) {
        throw new StrategyValidationError(
          `analyzers[${i}].weight must be a number between 0 and 1`,
          `analyzers[${i}].weight`,
          a.weight,
        );
      }

      if (typeof a.priority !== 'number' || a.priority < 1 || a.priority > 10) {
        throw new StrategyValidationError(
          `analyzers[${i}].priority must be a number between 1 and 10`,
          `analyzers[${i}].priority`,
          a.priority,
        );
      }

      // Validate analyzer exists
      if (!AVAILABLE_ANALYZERS.has(a.name as AvailableAnalyzer)) {
        throw new StrategyValidationError(
          `Unknown analyzer: ${a.name}. Available analyzers: ${Array.from(AVAILABLE_ANALYZERS).join(', ')}`,
          `analyzers[${i}].name`,
          a.name,
        );
      }

      // Check for duplicates
      if (names.has(a.name as string)) {
        throw new StrategyValidationError(
          `Duplicate analyzer: ${a.name}`,
          `analyzers[${i}].name`,
          a.name,
        );
      }
      names.add(a.name as string);

      // Validate confidence thresholds if present
      if (a.minConfidence !== undefined) {
        if (typeof a.minConfidence !== 'number' || a.minConfidence < 0 || a.minConfidence > 100) {
          throw new StrategyValidationError(
            `analyzers[${i}].minConfidence must be a number between 0 and 100`,
            `analyzers[${i}].minConfidence`,
            a.minConfidence,
          );
        }
      }

      if (a.maxConfidence !== undefined) {
        if (typeof a.maxConfidence !== 'number' || a.maxConfidence < 0 || a.maxConfidence > 100) {
          throw new StrategyValidationError(
            `analyzers[${i}].maxConfidence must be a number between 0 and 100`,
            `analyzers[${i}].maxConfidence`,
            a.maxConfidence,
          );
        }
      }
    }
  }

  /**
   * Validate indicator overrides
   */
  private validateIndicatorOverrides(overrides: Record<string, unknown>): void {
    const validIndicators = ['ema', 'rsi', 'atr', 'volume', 'stochastic', 'bollingerBands'];

    for (const [key, value] of Object.entries(overrides)) {
      if (!validIndicators.includes(key)) {
        throw new StrategyValidationError(
          `Unknown indicator override: ${key}`,
          `indicators.${key}`,
        );
      }

      if (typeof value !== 'object') {
        throw new StrategyValidationError(
          `indicators.${key} must be an object`,
          `indicators.${key}`,
        );
      }
    }
  }

  /**
   * Validate filter overrides
   */
  private validateFilterOverrides(overrides: Record<string, unknown>): void {
    const validFilters = [
      'blindZone',
      'flatMarket',
      'fundingRate',
      'btcCorrelation',
      'trendAlignment',
      'postTpFilter',
      'timeBasedFilter',
      'volatilityRegime',
      // Legacy filters
      'nightTrading',
      'atr',
      'emaFilter',
    ];

    for (const [key, value] of Object.entries(overrides)) {
      if (!validFilters.includes(key)) {
        throw new StrategyValidationError(
          `Unknown filter override: ${key}`,
          `filters.${key}`,
        );
      }

      if (typeof value !== 'object') {
        throw new StrategyValidationError(
          `filters.${key} must be an object`,
          `filters.${key}`,
        );
      }
    }
  }

  /**
   * Validate risk management overrides
   */
  private validateRiskManagementOverrides(overrides: Record<string, unknown>): void {
    const validFields = ['stopLoss', 'takeProfits', 'trailing', 'breakeven', 'timeBasedExit'];

    for (const [key, value] of Object.entries(overrides)) {
      if (!validFields.includes(key)) {
        throw new StrategyValidationError(
          `Unknown risk management override: ${key}`,
          `riskManagement.${key}`,
        );
      }

      if (key === 'takeProfits') {
        if (!Array.isArray(value)) {
          throw new StrategyValidationError(
            'riskManagement.takeProfits must be an array',
            'riskManagement.takeProfits',
          );
        }
      } else if (typeof value !== 'object') {
        throw new StrategyValidationError(
          `riskManagement.${key} must be an object`,
          `riskManagement.${key}`,
        );
      }
    }
  }

  /**
   * Get list of available analyzer names
   */
  getAvailableAnalyzers(): string[] {
    return Array.from(AVAILABLE_ANALYZERS).sort();
  }

  /**
   * Load all strategies from directory
   */
  async loadAllStrategies(): Promise<Map<string, StrategyConfig>> {
    const strategies = new Map<string, StrategyConfig>();

    try {
      const files = await fs.readdir(this.strategiesDir);
      const strategyFiles = files.filter((f) => f.endsWith('.strategy.json'));

      for (const file of strategyFiles) {
        const name = file.replace('.strategy.json', '');
        try {
          const strategy = await this.loadStrategy(name);
          strategies.set(name, strategy);
        } catch (error) {
          console.error(`Failed to load strategy ${name}:`, error);
        }
      }
    } catch (error) {
      console.warn(`Could not read strategies directory: ${error}`);
    }

    return strategies;
  }
}
