/**
 * MULTI-STRATEGY SUPPORT TYPES
 *
 * Type definitions for Phase 10: Multi-Strategy Support
 * Enables running multiple strategies simultaneously with isolated state
 */

import type { ConfigNew } from './config-new.types';
import type { StrategyConfig } from './strategy-config.types';
import type { Position } from './position.types';
import type { TradeEntry } from './trade-entry.types';
import type { PerformanceMetrics } from './performance-metrics.types';
import type { IAnalyzer } from './analyzer.interface';
import type { IExchange } from '../interfaces/IExchange';

/**
 * Metadata for a loaded strategy
 */
export interface StrategyMetadata {
  /** Unique strategy identifier (e.g., "strategy-level-trading-1") */
  id: string;

  /** Strategy name (e.g., "level-trading", "scalping") */
  name: string;

  /** Strategy version (from strategy.json) */
  version: string;

  /** Trading symbol for this strategy (e.g., "BTCUSDT") */
  symbol?: string;

  /** Is this strategy currently active for trading */
  isActive: boolean;

  /** When was this strategy loaded */
  loadedAt: Date;

  /** Configuration overrides specific to this instance */
  configOverrides?: Record<string, any>;
}

/**
 * Snapshot of strategy state for persistence/recovery
 */
export interface StrategyStateSnapshot {
  /** Strategy identifier */
  strategyId: string;

  /** Strategy name */
  strategyName: string;

  /** All open positions */
  positions: Position[];

  /** Trade history/journal */
  journal: TradeEntry[];

  /** Performance metrics at snapshot time */
  metrics: PerformanceMetrics;

  /** Timestamp of snapshot */
  timestamp: Date;

  /** Bot state that was active */
  lastCandleTime?: Date;

  /** Risk monitor state */
  riskMonitorState?: Record<string, any>;
}

/**
 * Statistics for a single strategy
 */
export interface StrategyStats {
  strategyId: string;
  strategyName: string;
  symbol?: string;
  isActive: boolean;
  loadedAt: Date;

  // Position stats
  openPositions: number;
  closedPositions: number;
  totalTrades: number;

  // Performance metrics
  totalPnL: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;

  // Time stats
  avgHoldTime: number;
  lastTradeTime?: Date;
  uptime: number; // milliseconds
}

/**
 * Aggregated statistics across all strategies
 */
export interface SystemStats {
  totalStrategies: number;
  activeStrategies: number;
  inactiveStrategies: number;

  // Combined metrics
  totalOpenPositions: number;
  totalClosedPositions: number;
  totalTrades: number;
  combinedPnL: number;
  overallWinRate: number;
  overallMaxDrawdown: number;

  // Per-strategy breakdown
  strategiesByPnL: StrategyStats[];

  // System health
  memoryUsage: number;
  uptime: number;
  lastUpdated: Date;
}

/**
 * Configuration for a strategy instance
 */
export interface StrategyInstanceConfig {
  /** Strategy identifier */
  id: string;

  /** Strategy JSON file name */
  strategyName: string;

  /** Trading symbol override (if different from config.json) */
  symbol?: string;

  /** Config overrides for this instance */
  configOverrides?: Partial<ConfigNew>;

  /** Performance tracking settings */
  enablePerformanceTracking?: boolean;

  /** Risk monitoring settings */
  enableRiskMonitoring?: boolean;
}

/**
 * Context for isolated strategy execution
 */
export interface IsolatedStrategyContext {
  // Identification
  strategyId: string;
  strategyName: string;
  symbol: string;

  // Configuration
  config: ConfigNew;
  strategy: StrategyConfig;

  // Service instances (all isolated per strategy)
  exchange: IExchange;
  analyzers: IAnalyzer[];

  // State metadata
  createdAt: Date;
  lastTradedAt?: Date;
  lastCandleTime?: Date;
  isActive: boolean;

  // State management
  getSnapshot(): StrategyStateSnapshot;
  restoreFromSnapshot(snapshot: StrategyStateSnapshot): Promise<void>;

  // Cleanup
  cleanup(): Promise<void>;
}

/**
 * Result of strategy validation
 */
export interface StrategyValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  checkedAt: Date;
}

/**
 * Result of config update validation
 */
export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  conflictsWith?: string[]; // Other strategies this conflicts with
}

/**
 * Changes made during config merge
 */
export interface ConfigMergeChange {
  path: string; // e.g., "orchestration.entry.minConfidenceThreshold"
  from: any;
  to: any;
}

/**
 * P&L metrics for a strategy
 */
export interface PnLMetrics {
  strategyId: string;
  strategyName: string;

  // Current state
  openPositionsPnL: number;
  realizedPnL: number;
  unrealizedPnL: number;
  totalPnL: number;

  // Historical
  bestTrade: number;
  worstTrade: number;
  avgWinSize: number;
  avgLossSize: number;

  // Dates
  firstTradeDate?: Date;
  lastTradeDate?: Date;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Strategy event types
 */
export enum StrategyEventType {
  STRATEGY_LOADED = 'STRATEGY_LOADED',
  STRATEGY_ACTIVATED = 'STRATEGY_ACTIVATED',
  STRATEGY_DEACTIVATED = 'STRATEGY_DEACTIVATED',
  STRATEGY_UNLOADED = 'STRATEGY_UNLOADED',
  STRATEGY_CONFIG_UPDATED = 'STRATEGY_CONFIG_UPDATED',
  STRATEGY_SWITCHED = 'STRATEGY_SWITCHED',
  STRATEGY_STATE_SAVED = 'STRATEGY_STATE_SAVED',
  STRATEGY_STATE_RESTORED = 'STRATEGY_STATE_RESTORED',
  STRATEGY_ERROR = 'STRATEGY_ERROR',
}

/**
 * Strategy event
 */
export interface StrategyEvent {
  type: StrategyEventType;
  strategyId: string;
  strategyName: string;
  timestamp: Date;
  data?: Record<string, any>;
  error?: string;
}

/**
 * Cache key for strategy context
 */
export interface StrategyContextCacheKey {
  strategyId: string;
  timestamp: number;
}

/**
 * Configuration for strategy persistence
 */
export interface StrategyPersistenceConfig {
  /** Directory where strategy states are stored */
  stateDir: string;

  /** Whether to persist on every change or on demand */
  autoPersist: boolean;

  /** Interval for auto-persistence (ms) */
  persistInterval: number;

  /** Number of snapshots to keep per strategy */
  maxSnapshots: number;

  /** Whether to compress snapshots */
  compressSnapshots: boolean;
}

/**
 * Configuration for strategy registry
 */
export interface StrategyRegistryConfig {
  /** Maximum number of strategies to hold in registry */
  maxStrategies: number;

  /** Whether to track history of strategy changes */
  trackHistory: boolean;

  /** Whether to validate strategies on registration */
  validateOnRegister: boolean;

  /** Allowed strategy types/names (if empty, all allowed) */
  allowedStrategies?: string[];
}

/**
 * Validation rules for strategy config
 */
export interface StrategyValidationRules {
  /** Minimum confidence threshold (0-100) */
  minConfidenceRange: [number, number];

  /** Valid analyzer weight ranges */
  analyzerWeightRange: [number, number];

  /** Reserved field names (cannot be overridden) */
  reservedFields: string[];

  /** Required fields that must exist */
  requiredFields: string[];

  /** Custom validators */
  customValidators?: ((config: StrategyConfig) => StrategyValidationResult)[];
}

/**
 * Configuration for strategy factory
 */
export interface StrategyFactoryConfig {
  /** Base configuration (merged with each strategy) */
  baseConfig: ConfigNew;

  /** Persistence configuration */
  persistence: StrategyPersistenceConfig;

  /** Registry configuration */
  registry: StrategyRegistryConfig;

  /** Validation rules */
  validationRules: StrategyValidationRules;

  /** Whether to auto-load previous state on creation */
  autoRestorePreviousState: boolean;
}

/**
 * Strategy removal options
 */
export interface StrategyRemovalOptions {
  /** Whether to save final state before removal */
  saveFinalState: boolean;

  /** Whether to close all open positions */
  closePositions: boolean;

  /** Whether to persist final metrics */
  persistMetrics: boolean;

  /** Graceful shutdown timeout (ms) */
  shutdownTimeout: number;
}

/**
 * Strategy loading options
 */
export interface StrategyLoadingOptions {
  /** Whether to restore previous state if available */
  restorePreviousState: boolean;

  /** Whether to validate before loading */
  validate: boolean;

  /** Config overrides for this load */
  configOverrides?: Partial<ConfigNew>;

  /** Custom symbol (overrides config.json) */
  symbol?: string;
}

/**
 * Result of strategy switching
 */
export interface StrategySwitchResult {
  success: boolean;
  fromStrategyId: string;
  toStrategyId: string;
  switchTime: number; // milliseconds
  error?: string;
  savedState?: StrategyStateSnapshot;
}

/**
 * Strategy health status
 */
export enum StrategyHealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Health check result for a strategy
 */
export interface StrategyHealthCheckResult {
  strategyId: string;
  status: StrategyHealthStatus;
  timestamp: Date;

  // Health indicators
  isResponsive: boolean;
  hasOpenPositions: boolean;
  lastActivityTime?: Date;
  memoryUsage: number;
  errorCount: number;
  lastError?: string;

  // Recommendations
  recommendations: string[];
}

/**
 * Concurrent strategy execution mode
 */
export enum ConcurrencyMode {
  /** Single strategy active at a time */
  EXCLUSIVE = 'EXCLUSIVE',

  /** Multiple strategies share one symbol */
  PARALLEL = 'PARALLEL',

  /** Multiple strategies on different symbols */
  DISTRIBUTED = 'DISTRIBUTED',
}

/**
 * Configuration for concurrent strategy execution
 */
export interface ConcurrencyConfig {
  mode: ConcurrencyMode;

  /** Maximum strategies per symbol (PARALLEL mode) */
  maxPerSymbol: number;

  /** Maximum strategies total (DISTRIBUTED mode) */
  maxStrategies: number;

  /** Whether to share order book data */
  shareOrderBook: boolean;

  /** Whether to coordinate risk limits */
  coordinateRiskLimits: boolean;

  /** Total account risk limit (%) */
  totalRiskLimit: number;

  /** Per-strategy risk limit (%) */
  perStrategyRiskLimit: number;
}
