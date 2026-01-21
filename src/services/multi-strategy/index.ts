/**
 * MULTI-STRATEGY MODULE EXPORTS
 *
 * Central export point for all multi-strategy support services
 * Phase 10: Multi-Strategy Support - Complete Implementation
 */

// Core Services
export { StrategyRegistryService } from './strategy-registry.service';
export { StrategyFactoryService } from './strategy-factory.service';
export { StrategyStateManagerService } from './strategy-state-manager.service';
export { StrategyOrchestratorService } from './strategy-orchestrator.service';
export { DynamicConfigManagerService } from './dynamic-config-manager.service';

// Re-export types
export type {
  StrategyMetadata,
  StrategyStateSnapshot,
  StrategyStats,
  SystemStats,
  StrategyInstanceConfig,
  IsolatedStrategyContext,
  StrategyValidationResult,
  ConfigValidationResult,
  ConfigMergeChange,
  PnLMetrics,
  StrategyEvent,
  StrategyContextCacheKey,
  StrategyPersistenceConfig,
  StrategyRegistryConfig,
  StrategyValidationRules,
  StrategyFactoryConfig,
  StrategyRemovalOptions,
  StrategyLoadingOptions,
  StrategySwitchResult,
  StrategyHealthCheckResult,
  ConcurrencyConfig,
} from '../../types/multi-strategy-types';

// Re-export enums
export { StrategyEventType, StrategyHealthStatus, ConcurrencyMode } from '../../types/multi-strategy-types';
