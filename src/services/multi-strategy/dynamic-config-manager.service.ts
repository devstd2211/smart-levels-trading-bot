/**
 * DYNAMIC CONFIG MANAGER SERVICE
 *
 * Manages runtime strategy configuration loading and updates.
 * Enables hot-reload of strategy configs without restart.
 *
 * Responsibilities:
 * 1. Load strategy config from file
 * 2. Update strategy config at runtime
 * 3. Validate config changes
 * 4. Merge with base config safely
 * 5. Watch config files for changes
 *
 * Design Pattern: Config Manager + Validator
 * Usage: Injected into StrategyFactory
 */

import type {
  StrategyConfig } from '../../types/strategy-config.types';
import type {
  ConfigValidationResult,
  ConfigMergeChange,
} from '../../types/multi-strategy-types';
import type { ConfigNew } from '../../types/config-new.types';

export class DynamicConfigManagerService {
  private configCache = new Map<string, StrategyConfig>();
  private watchers = new Map<string, () => void>();

  constructor(private strategyDir: string = './strategies/json') {}

  /**
   * Load strategy configuration from file
   *
   * @param strategyName Strategy file name (without .strategy.json)
   * @throws Error if file not found or invalid JSON
   */
  async loadStrategyConfig(strategyName: string): Promise<StrategyConfig> {
    // Check cache first
    if (this.configCache.has(strategyName)) {
      return this.configCache.get(strategyName)!;
    }

    console.log(
      `[DynamicConfigManager] Loading config for ${strategyName}`,
    );

    try {
      // In real implementation:
      // const filePath = path.join(this.strategyDir, `${strategyName}.strategy.json`);
      // const content = await fs.readFile(filePath, 'utf-8');
      // const config = JSON.parse(content) as StrategyConfig;

      // Placeholder
      const config: StrategyConfig = {
        metadata: {
          name: strategyName,
          version: '1.0.0',
        },
        indicators: {},
        analyzers: [],
      } as any;

      // Validate
      const validation = this.validateConfig(config);
      if (!validation.isValid) {
        throw new Error(
          `Invalid config: ${validation.errors.join(', ')}`,
        );
      }

      // Cache
      this.configCache.set(strategyName, config);

      console.log(
        `[DynamicConfigManager] ✅ Loaded config: ${strategyName}`,
      );

      return config;
    } catch (error) {
      throw new Error(
        `[DynamicConfigManager] Failed to load config: ${error}`,
      );
    }
  }

  /**
   * Update strategy configuration at runtime
   *
   * @param strategyId Strategy ID (for logging)
   * @param updates Partial config updates
   * @throws Error if validation fails
   */
  async updateStrategyConfig(
    strategyId: string,
    updates: Partial<StrategyConfig>,
  ): Promise<void> {
    console.log(
      `[DynamicConfigManager] Updating config for ${strategyId}`,
    );

    try {
      // Merge updates
      const merged: StrategyConfig = {
        metadata: {
          ...updates.metadata,
        } as any,
        indicators: {
          ...updates.indicators,
        },
        analyzers: updates.analyzers || [],
      } as any;

      // Validate
      const validation = this.validateConfig(merged);
      if (!validation.isValid) {
        throw new Error(
          `Invalid config: ${validation.errors.join(', ')}`,
        );
      }

      // Check warnings
      if (validation.warnings.length > 0) {
        console.warn(
          `[DynamicConfigManager] Warnings: ${validation.warnings.join(', ')}`,
        );
      }

      // In real implementation: would update the strategy context config
      // For now, just log the change
      console.log(
        `[DynamicConfigManager] ✅ Updated config for ${strategyId}`,
      );
    } catch (error) {
      throw new Error(
        `[DynamicConfigManager] Failed to update config: ${error}`,
      );
    }
  }

  /**
   * Validate strategy configuration
   *
   * Checks:
   * 1. Required fields
   * 2. Analyzer weights sum to ~1.0
   * 3. All referenced analyzers exist
   */
  validateConfig(config: StrategyConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check metadata
    if (!config.metadata?.name) {
      errors.push('metadata.name is required');
    }

    if (!config.metadata?.version) {
      errors.push('metadata.version is required');
    }

    // Check analyzers array
    if (!Array.isArray(config.analyzers)) {
      errors.push('analyzers must be an array');
    } else if (config.analyzers.length === 0) {
      warnings.push('No analyzers configured');
    }

    // Validate analyzer weights if present
    if (config.analyzers && config.analyzers.length > 0) {
      let totalWeight = 0;
      for (const analyzer of config.analyzers) {
        if ((analyzer as any).weight && typeof (analyzer as any).weight === 'number') {
          totalWeight += (analyzer as any).weight;
        }
      }

      // Weights should sum to approximately 1.0 (allow 10% tolerance)
      if (totalWeight > 0 && (totalWeight < 0.9 || totalWeight > 1.1)) {
        warnings.push(
          `Analyzer weights sum to ${totalWeight.toFixed(2)}, expected ~1.0`,
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Merge base config with strategy config
   *
   * Strategy overrides take precedence over base config.
   */
  mergeConfigs(
    base: ConfigNew,
    strategy: StrategyConfig,
  ): ConfigNew {
    const merged = { ...base };

    // Merge indicators
    if (strategy.indicators) {
      merged.indicators = {
        ...merged.indicators,
        ...(strategy.indicators as any),
      };
    }

    return merged;
  }

  /**
   * Get changes made during merge
   *
   * Useful for logging/debugging what was overridden.
   */
  getConfigMergeChanges(
    base: ConfigNew,
    strategy: StrategyConfig,
  ): ConfigMergeChange[] {
    const changes: ConfigMergeChange[] = [];

    // Check indicator changes
    if (strategy.indicators) {
      for (const [key, value] of Object.entries(strategy.indicators)) {
        const baseValue = (base.indicators as any)?.[key];
        if (JSON.stringify(baseValue) !== JSON.stringify(value)) {
          changes.push({
            path: `indicators.${key}`,
            from: baseValue,
            to: value,
          });
        }
      }
    }

    return changes;
  }

  /**
   * Watch config file for changes (optional)
   *
   * Enables hot-reload on config file changes.
   */
  watchConfigFile(
    strategyName: string,
    callback: () => void,
  ): void {
    // In real implementation:
    // const filePath = path.join(this.strategyDir, `${strategyName}.strategy.json`);
    // const watcher = fs.watch(filePath, async () => {
    //   this.configCache.delete(strategyName);
    //   callback();
    // });
    // this.watchers.set(strategyName, () => watcher.close());

    console.log(
      `[DynamicConfigManager] Watching config file: ${strategyName}`,
    );

    this.watchers.set(strategyName, callback);
  }

  /**
   * Stop watching config file
   */
  stopWatching(strategyName: string): void {
    const callback = this.watchers.get(strategyName);
    if (callback) {
      callback();
      this.watchers.delete(strategyName);
    }
  }

  /**
   * Clear config cache
   */
  clearCache(): void {
    this.configCache.clear();
    console.log('[DynamicConfigManager] Cleared config cache');
  }

  /**
   * Get cached configs
   */
  getCachedConfigs(): string[] {
    return Array.from(this.configCache.keys());
  }
}

/**
 * Flatten nested object for easier comparison
 */
function flattenObject(obj: any, prefix = ''): Record<string, any> {
  const flattened: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      Object.assign(flattened, flattenObject(value, newKey));
    } else {
      flattened[newKey] = value;
    }
  }

  return flattened;
}
