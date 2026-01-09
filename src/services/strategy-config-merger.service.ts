/**
 * STRATEGY CONFIG MERGER SERVICE
 * Merges main config with strategy overrides
 *
 * Priority: Strategy Overrides > config-new.json > Defaults
 *
 * Example:
 * - config-new.json has: emaFilter.rsiThreshold = 50
 * - strategy.json has: filters.emaFilter.rsiThreshold = 55
 * - Result: emaFilter.rsiThreshold = 55 (strategy wins)
 */

import { ConfigNew } from '../types/config-new.types';
import { StrategyConfig } from '../types/strategy-config.types';

export class StrategyConfigMergerService {
  /**
   * Merge strategy overrides into main config
   * Strategy values override config values
   *
   * @param mainConfig - Main configuration from config-new.json
   * @param strategy - Strategy with optional overrides
   * @returns Merged configuration
   */
  mergeConfigs(mainConfig: ConfigNew, strategy: StrategyConfig): ConfigNew {
    const merged = { ...mainConfig };

    // 1. Merge indicator overrides
    if (strategy.indicators) {
      merged.indicators = this.mergeIndicators(merged.indicators, strategy.indicators);
    }

    // 2. Merge filter overrides
    if (strategy.filters) {
      merged.filters = this.mergeFilters(merged.filters, strategy.filters);
    }

    // 3. Merge risk management overrides
    if (strategy.riskManagement) {
      merged.riskManagement = this.mergeRiskManagement(
        merged.riskManagement,
        strategy.riskManagement,
      );
    }

    return merged;
  }

  /**
   * Merge indicator overrides
   */
  private mergeIndicators(original: any, overrides: any): any {
    const merged = { ...original };

    if (overrides.ema) {
      merged.ema = { ...merged.ema, ...overrides.ema };
    }
    if (overrides.rsi) {
      merged.rsi = { ...merged.rsi, ...overrides.rsi };
    }
    if (overrides.atr) {
      merged.atr = { ...merged.atr, ...overrides.atr };
    }
    if (overrides.volume) {
      merged.volume = { ...merged.volume, ...overrides.volume };
    }
    if (overrides.stochastic) {
      merged.stochastic = { ...merged.stochastic, ...overrides.stochastic };
    }
    if (overrides.bollingerBands) {
      merged.bollingerBands = { ...merged.bollingerBands, ...overrides.bollingerBands };
    }

    return merged;
  }

  /**
   * Merge filter overrides
   *
   * Example:
   * - config: { blindZone: { minSignalsForLong: 5, minSignalsForShort: 4 } }
   * - override: { blindZone: { minSignalsForLong: 2 } }
   * - result: { blindZone: { minSignalsForLong: 2, minSignalsForShort: 4 } }
   */
  private mergeFilters(original: any, overrides: any): any {
    const merged = { ...original };

    if (overrides.blindZone) {
      merged.blindZone = { ...merged.blindZone, ...overrides.blindZone };
    }
    if (overrides.btcCorrelation) {
      merged.btcCorrelation = {
        ...merged.btcCorrelation,
        ...overrides.btcCorrelation,
      };
    }
    if (overrides.nightTrading) {
      merged.nightTrading = { ...merged.nightTrading, ...overrides.nightTrading };
    }
    if (overrides.atr) {
      merged.atr = { ...merged.atr, ...overrides.atr };
    }
    if (overrides.volatilityRegime) {
      merged.volatilityRegime = {
        ...merged.volatilityRegime,
        ...overrides.volatilityRegime,
      };
    }

    return merged;
  }

  /**
   * Merge risk management overrides
   */
  private mergeRiskManagement(original: any, overrides: any): any {
    const merged = { ...original };

    if (overrides.stopLoss) {
      merged.stopLoss = { ...merged.stopLoss, ...overrides.stopLoss };
    }
    if (overrides.takeProfits) {
      // Replace entire TP array
      merged.takeProfits = overrides.takeProfits;
    }
    if (overrides.trailing) {
      merged.trailing = { ...merged.trailing, ...overrides.trailing };
    }
    if (overrides.breakeven) {
      merged.breakeven = { ...merged.breakeven, ...overrides.breakeven };
    }
    if (overrides.timeBasedExit) {
      merged.timeBasedExit = { ...merged.timeBasedExit, ...overrides.timeBasedExit };
    }

    return merged;
  }

  /**
   * Get a specific config value with strategy override support
   *
   * @param mainConfig - Main configuration
   * @param strategy - Strategy with overrides
   * @param path - Path like "filters.blindZone.minSignalsForLong"
   * @returns Value from strategy override or main config
   */
  getConfigValue(mainConfig: ConfigNew, strategy: StrategyConfig, path: string): any {
    const merged = this.mergeConfigs(mainConfig, strategy);
    const keys = path.split('.');
    let value: any = merged;

    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Compare original and merged values (useful for debugging)
   */
  getChangeReport(mainConfig: ConfigNew, strategy: StrategyConfig): ChangeReport {
    const merged = this.mergeConfigs(mainConfig, strategy);
    const changes: ConfigChange[] = [];

    // Check indicators
    if (strategy.indicators) {
      this.findChanges(mainConfig.indicators, merged.indicators, 'indicators', changes);
    }

    // Check filters
    if (strategy.filters) {
      this.findChanges(mainConfig.filters, merged.filters, 'filters', changes);
    }

    // Check risk management
    if (strategy.riskManagement) {
      this.findChanges(
        mainConfig.riskManagement,
        merged.riskManagement,
        'riskManagement',
        changes,
      );
    }

    return {
      strategyName: strategy.metadata.name,
      changesCount: changes.length,
      changes,
    };
  }

  private findChanges(original: any, merged: any, prefix: string, changes: ConfigChange[]) {
    for (const key in merged) {
      if (typeof merged[key] === 'object' && merged[key] !== null) {
        this.findChanges(original[key], merged[key], `${prefix}.${key}`, changes);
      } else {
        if (original[key] !== merged[key]) {
          changes.push({
            path: `${prefix}.${key}`,
            original: original[key],
            overridden: merged[key],
          });
        }
      }
    }
  }
}

export interface ChangeReport {
  strategyName: string;
  changesCount: number;
  changes: ConfigChange[];
}

export interface ConfigChange {
  path: string;
  original: any;
  overridden: any;
}
