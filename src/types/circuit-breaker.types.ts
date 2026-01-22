/**
 * CIRCUIT BREAKER TYPES
 *
 * Type definitions for per-strategy circuit breaker pattern.
 * Provides state management and configuration for circuit breakers.
 *
 * Phase 11: Per-Strategy Circuit Breakers
 */

/**
 * Circuit breaker states
 */
export enum CircuitBreakerStatus {
  CLOSED = 'CLOSED',       // Normal operation
  OPEN = 'OPEN',           // Too many errors, fast fail
  HALF_OPEN = 'HALF_OPEN', // Testing recovery
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /**
   * How many consecutive errors before opening circuit
   * @default 5
   */
  failureThreshold: number;

  /**
   * How long to keep circuit open before attempting recovery (ms)
   * @default 30000 (30 seconds)
   */
  timeout: number;

  /**
   * Base delay for exponential backoff (multiplier)
   * @default 2
   */
  backoffBase: number;

  /**
   * Maximum delay for exponential backoff (ms)
   * @default 300000 (5 minutes)
   */
  maxBackoff: number;

  /**
   * How many successful attempts in half-open before closing
   * @default 3
   */
  halfOpenAttempts: number;
}

/**
 * Circuit breaker state snapshot
 */
export interface CircuitBreakerState {
  strategyId: string;
  status: CircuitBreakerStatus;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  nextRetryTime: number | null;
  recoveryAttempts: number;
  totalFailures: number;
  totalSuccesses: number;
}

/**
 * Error information stored in circuit breaker
 */
export interface CircuitBreakerError {
  message: string;
  code: string;
  timestamp: number;
  stackTrace?: string;
}

/**
 * Metrics for a strategy's circuit breaker
 */
export interface CircuitBreakerMetrics {
  strategyId: string;
  currentStatus: CircuitBreakerStatus;
  totalFailures: number;
  totalSuccesses: number;
  failureRate: number;  // 0-1
  lastFailure: CircuitBreakerError | null;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  timeInCurrentState: number;  // ms
  recoveryAttempts: number;
  averageRecoveryTime: number;  // ms
}

/**
 * Event emitted when circuit breaker state changes
 */
export interface CircuitBreakerEvent {
  strategyId: string;
  type: 'OPENED' | 'CLOSED' | 'HALF_OPEN' | 'SUCCESS' | 'FAILURE';
  previousStatus?: CircuitBreakerStatus;
  currentStatus: CircuitBreakerStatus;
  failureCount?: number;
  error?: CircuitBreakerError;
  timestamp: number;
}

/**
 * Configuration for circuit breaker service
 */
export interface CircuitBreakerServiceConfig {
  /**
   * Default config for all circuit breakers
   */
  defaultConfig?: Partial<CircuitBreakerConfig>;

  /**
   * Per-strategy overrides
   */
  overrides?: Record<string, Partial<CircuitBreakerConfig>>;

  /**
   * Enable metrics collection
   * @default true
   */
  metricsEnabled?: boolean;

  /**
   * Max circuit breakers to track
   * @default 100
   */
  maxBreakers?: number;
}

/**
 * Statistics for circuit breaker service
 */
export interface CircuitBreakerServiceStats {
  totalBreakers: number;
  breakersOpen: number;
  breakersHalfOpen: number;
  breakersClosed: number;
  totalFailures: number;
  totalSuccesses: number;
  averageFailureRate: number;
  breakersByStatus: Record<CircuitBreakerStatus, number>;
  oldestCircuitBreaker: { strategyId: string; createdAt: number } | null;
}
