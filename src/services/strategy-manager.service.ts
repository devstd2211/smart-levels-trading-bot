/**
 * STRATEGY MANAGER SERVICE
 * Central service for strategy management
 *
 * Responsibilities:
 * 1. Load strategy from JSON at startup
 * 2. Merge strategy overrides with main config
 * 3. Provide strategy to services (weights, analyzer selection)
 *
 * Bot integration point:
 * - Load strategy once at startup
 * - Pass to services
 * - Everything else transparent
 */

import { StrategyLoaderService } from './strategy-loader.service';
import { StrategyConfigMergerService } from './strategy-config-merger.service';
import { StrategyConfig } from '../types/strategy-config.types';
import { ConfigNew } from '../types/config-new.types';

export class StrategyManagerService {
  private strategy: StrategyConfig | null = null;
  private mergedConfig: ConfigNew | null = null;
  private mergedConfigGeneric: any = null; // Generic config that can be Config or ConfigNew

  constructor(
    private loader: StrategyLoaderService,
    private merger: StrategyConfigMergerService,
  ) {}

  /**
   * Initialize strategy manager
   * Called once at bot startup
   *
   * @param strategyName - Name of strategy to load (e.g., "level-trading")
   * @param mainConfig - Main config from config-new.json
   */
  async initialize(strategyName: string, mainConfig: ConfigNew | any): Promise<void> {
    console.log(`[StrategyManager] Loading strategy: ${strategyName}`);

    // Load strategy from JSON
    this.strategy = await this.loader.loadStrategy(strategyName);

    // Merge with main config (supports both Config and ConfigNew types)
    this.mergedConfigGeneric = this.merger.mergeConfigs(mainConfig, this.strategy);

    // Log what changed
    const changeReport = this.merger.getChangeReport(mainConfig, this.strategy);
    console.log(
      `[StrategyManager] Applied ${changeReport.changesCount} config overrides from strategy`,
    );

    if (changeReport.changesCount > 0) {
      changeReport.changes.forEach((change) => {
        console.log(
          `  - ${change.path}: ${JSON.stringify(change.original)} → ${JSON.stringify(change.overridden)}`,
        );
      });
    }

    console.log(`[StrategyManager] Strategy ready: ${this.strategy.metadata.name} v${this.strategy.metadata.version}`);
  }

  /**
   * Get loaded strategy
   * Used by AnalyzerRegistry to know which analyzers to load
   */
  getStrategy(): StrategyConfig {
    if (!this.strategy) {
      throw new Error(
        '[StrategyManager] Strategy not initialized. Call initialize() first.',
      );
    }
    return this.strategy;
  }

  /**
   * Get merged config (strategy overrides applied)
   * Used by services that need the final config
   * Returns either Config or ConfigNew depending on what was passed
   */
  getMergedConfig(): any {
    if (!this.mergedConfigGeneric) {
      throw new Error(
        '[StrategyManager] Config not merged. Call initialize() first.',
      );
    }
    return this.mergedConfigGeneric;
  }

  /**
   * Get strategy metadata
   */
  getStrategyName(): string {
    return this.getStrategy().metadata.name;
  }

  /**
   * Get list of enabled analyzers in strategy
   */
  getEnabledAnalyzers(): string[] {
    return this.getStrategy().analyzers
      .filter((a) => a.enabled)
      .map((a) => a.name);
  }

  /**
   * Get weight for a specific analyzer
   * Used by StrategyCoordinator
   */
  getAnalyzerWeight(analyzerName: string): number {
    const analyzer = this.getStrategy().analyzers.find((a) => a.name === analyzerName);
    return analyzer?.weight ?? 0;
  }

  /**
   * Get all analyzer weights
   * Used by StrategyCoordinator
   */
  getAllWeights(): Map<string, number> {
    const weights = new Map<string, number>();
    this.getStrategy().analyzers.forEach((a) => {
      if (a.enabled) {
        weights.set(a.name, a.weight);
      }
    });
    return weights;
  }

  /**
   * Check if strategy is ready
   */
  isReady(): boolean {
    return this.strategy !== null && this.mergedConfigGeneric !== null;
  }
}
