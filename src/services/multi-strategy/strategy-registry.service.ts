/**
 * STRATEGY REGISTRY SERVICE
 *
 * Tracks all loaded and active strategies in the system.
 * Single source of truth for strategy metadata and lifecycle.
 *
 * Responsibilities:
 * 1. Register strategies when loaded
 * 2. Track active/inactive status
 * 3. Prevent duplicate strategy IDs
 * 4. Provide strategy lookup
 * 5. Validate no conflicts
 *
 * Design Pattern: Singleton Registry
 * Usage: Injected into StrategyOrchestrator
 */

import type { StrategyMetadata, StrategyRegistryConfig } from '../../types/multi-strategy-types';

export class StrategyRegistryService {
  private strategies = new Map<string, StrategyMetadata>();
  private activeStrategyId: string | null = null;
  private history: Array<{ timestamp: Date; action: string; strategyId: string }> = [];

  constructor(private config: StrategyRegistryConfig = getDefaultConfig()) {
    this.validateConfig();
  }

  /**
   * Register a new strategy in the registry
   *
   * @throws Error if strategy ID already exists or max strategies reached
   */
  registerStrategy(id: string, metadata: StrategyMetadata): void {
    // Validation
    if (this.strategies.has(id)) {
      throw new Error(
        `[StrategyRegistry] Strategy already registered with ID: ${id}`,
      );
    }

    if (this.strategies.size >= this.config.maxStrategies) {
      throw new Error(
        `[StrategyRegistry] Maximum strategies (${this.config.maxStrategies}) reached`,
      );
    }

    if (
      this.config.allowedStrategies &&
      this.config.allowedStrategies.length > 0
    ) {
      if (!this.config.allowedStrategies.includes(metadata.name)) {
        throw new Error(
          `[StrategyRegistry] Strategy "${metadata.name}" not in allowed list`,
        );
      }
    }

    // Register
    this.strategies.set(id, metadata);

    // Track history
    if (this.config.trackHistory) {
      this.history.push({
        timestamp: new Date(),
        action: 'REGISTER',
        strategyId: id,
      });
    }

    console.log(
      `[StrategyRegistry] ✅ Registered strategy: ${id} (${metadata.name})`,
    );
  }

  /**
   * Get a registered strategy by ID
   *
   * @throws Error if strategy not found
   */
  getStrategy(id: string): StrategyMetadata {
    const strategy = this.strategies.get(id);
    if (!strategy) {
      throw new Error(
        `[StrategyRegistry] Strategy not found with ID: ${id}`,
      );
    }
    return strategy;
  }

  /**
   * Check if a strategy is registered
   */
  hasStrategy(id: string): boolean {
    return this.strategies.has(id);
  }

  /**
   * List all registered strategies
   */
  listStrategies(): StrategyMetadata[] {
    return Array.from(this.strategies.values());
  }

  /**
   * List only active strategies
   */
  listActiveStrategies(): StrategyMetadata[] {
    return Array.from(this.strategies.values()).filter((s) => s.isActive);
  }

  /**
   * List only inactive strategies
   */
  listInactiveStrategies(): StrategyMetadata[] {
    return Array.from(this.strategies.values()).filter((s) => !s.isActive);
  }

  /**
   * Get the currently active trading strategy
   *
   * @returns Active strategy metadata or null if none
   */
  getActiveStrategy(): StrategyMetadata | null {
    if (!this.activeStrategyId) return null;
    return this.strategies.get(this.activeStrategyId) || null;
  }

  /**
   * Get active strategy ID
   */
  getActiveStrategyId(): string | null {
    return this.activeStrategyId;
  }

  /**
   * Set a strategy as active for trading
   *
   * @throws Error if strategy not found or invalid
   */
  setActive(id: string, active: boolean): void {
    if (!this.strategies.has(id)) {
      throw new Error(
        `[StrategyRegistry] Cannot activate: strategy not found with ID: ${id}`,
      );
    }

    const strategy = this.strategies.get(id)!;

    if (active) {
      // Deactivate previous active strategy
      if (this.activeStrategyId && this.activeStrategyId !== id) {
        const previous = this.strategies.get(this.activeStrategyId);
        if (previous) {
          previous.isActive = false;
        }
      }

      strategy.isActive = true;
      this.activeStrategyId = id;

      if (this.config.trackHistory) {
        this.history.push({
          timestamp: new Date(),
          action: 'ACTIVATE',
          strategyId: id,
        });
      }

      console.log(`[StrategyRegistry] ✅ Activated strategy: ${id}`);
    } else {
      strategy.isActive = false;

      if (this.activeStrategyId === id) {
        this.activeStrategyId = null;
      }

      if (this.config.trackHistory) {
        this.history.push({
          timestamp: new Date(),
          action: 'DEACTIVATE',
          strategyId: id,
        });
      }

      console.log(`[StrategyRegistry] ✅ Deactivated strategy: ${id}`);
    }
  }

  /**
   * Unregister a strategy
   *
   * @throws Error if strategy not found
   */
  unregisterStrategy(id: string): void {
    if (!this.strategies.has(id)) {
      throw new Error(
        `[StrategyRegistry] Cannot unregister: strategy not found with ID: ${id}`,
      );
    }

    if (this.activeStrategyId === id) {
      this.activeStrategyId = null;
    }

    this.strategies.delete(id);

    if (this.config.trackHistory) {
      this.history.push({
        timestamp: new Date(),
        action: 'UNREGISTER',
        strategyId: id,
      });
    }

    console.log(`[StrategyRegistry] ✅ Unregistered strategy: ${id}`);
  }

  /**
   * Update strategy metadata
   */
  updateStrategy(id: string, updates: Partial<StrategyMetadata>): void {
    const strategy = this.getStrategy(id);

    // Prevent ID changes
    if (updates.id && updates.id !== id) {
      throw new Error('[StrategyRegistry] Cannot change strategy ID');
    }

    // Update allowed fields
    if (updates.isActive !== undefined) {
      strategy.isActive = updates.isActive;
    }
    if (updates.configOverrides !== undefined) {
      strategy.configOverrides = updates.configOverrides;
    }

    // Don't allow changing name or version
    if (updates.name && updates.name !== strategy.name) {
      console.warn(
        `[StrategyRegistry] Ignoring attempt to change strategy name from ${strategy.name} to ${updates.name}`,
      );
    }

    if (this.config.trackHistory) {
      this.history.push({
        timestamp: new Date(),
        action: 'UPDATE',
        strategyId: id,
      });
    }
  }

  /**
   * Validate a strategy against conflicts
   *
   * Returns validation result with any conflicts detected
   */
  validateStrategy(id: string): { valid: boolean; conflicts: string[] } {
    if (!this.strategies.has(id)) {
      return {
        valid: false,
        conflicts: ['Strategy not registered'],
      };
    }

    const strategy = this.getStrategy(id);
    const conflicts: string[] = [];

    // Check for symbol conflicts if configured
    if (strategy.symbol) {
      const otherStrategiesOnSymbol = Array.from(this.strategies.values()).filter(
        (s) => s.id !== id && s.symbol === strategy.symbol && s.isActive,
      );

      if (otherStrategiesOnSymbol.length > 0) {
        conflicts.push(
          `Symbol ${strategy.symbol} already in use by: ${otherStrategiesOnSymbol.map((s) => s.id).join(', ')}`,
        );
      }
    }

    return {
      valid: conflicts.length === 0,
      conflicts,
    };
  }

  /**
   * Clear all strategies (useful for testing)
   */
  clear(): void {
    this.strategies.clear();
    this.activeStrategyId = null;
    this.history = [];

    if (this.config.trackHistory) {
      this.history.push({
        timestamp: new Date(),
        action: 'CLEAR',
        strategyId: 'all',
      });
    }

    console.log('[StrategyRegistry] ✅ Cleared all strategies');
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalStrategies: number;
    activeStrategies: number;
    inactiveStrategies: number;
    hasActiveStrategy: boolean;
    registrySize: number;
  } {
    const strategies = this.listStrategies();
    return {
      totalStrategies: strategies.length,
      activeStrategies: strategies.filter((s) => s.isActive).length,
      inactiveStrategies: strategies.filter((s) => !s.isActive).length,
      hasActiveStrategy: this.activeStrategyId !== null,
      registrySize: this.strategies.size,
    };
  }

  /**
   * Get change history (if tracking enabled)
   */
  getHistory(): Array<{ timestamp: Date; action: string; strategyId: string }> {
    if (!this.config.trackHistory) {
      return [];
    }
    return [...this.history];
  }

  /**
   * Validate registry configuration
   */
  private validateConfig(): void {
    if (this.config.maxStrategies < 1) {
      throw new Error('[StrategyRegistry] maxStrategies must be >= 1');
    }
  }
}

/**
 * Get default registry configuration
 */
function getDefaultConfig(): StrategyRegistryConfig {
  return {
    maxStrategies: 10,
    trackHistory: true,
    validateOnRegister: true,
    allowedStrategies: [], // Empty means all allowed
  };
}
