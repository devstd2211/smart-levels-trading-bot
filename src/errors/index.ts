/**
 * Error handling system exports
 * Provides all error classes, result types, and utilities for type-safe error handling
 */

// Base error class and types
export {
  TradingError,
  UnknownTradingError,
  ErrorDomain,
  ErrorSeverity,
  ErrorMetadata,
  ErrorContext,
} from './BaseError';

// Domain-specific errors
export {
  // Trading domain
  EntryValidationError,
  ExitExecutionError,
  StrategyExecutionError,
  RiskLimitExceededError,
  InsufficientBalanceError,
  // Exchange domain
  ExchangeConnectionError,
  ExchangeRateLimitError,
  ExchangeAPIError,
  OrderRejectedError,
  // Position domain
  PositionNotFoundError,
  PositionStateError,
  PositionSizingError,
  LeverageValidationError,
  // Order domain
  OrderTimeoutError,
  OrderSlippageError,
  OrderCancellationError,
  OrderValidationError,
  // Configuration domain
  ConfigurationError,
  // Performance domain
  PerformanceError,
} from './DomainErrors';

// Result type for type-safe error handling
export {
  Result,
  Ok,
  Err,
  ok,
  err,
  tryAsync,
  trySync,
  combine,
  combineAll,
} from './ErrorResult';

// Error handler with recovery strategies
export {
  ErrorHandler,
  RecoveryStrategy,
  RetryConfig,
  ErrorLogger,
  ErrorHandlingConfig,
  ErrorHandlingResult,
} from './ErrorHandler';

// Error registry for telemetry
export {
  ErrorRegistry,
  ErrorStats,
  ErrorSummary,
} from './ErrorRegistry';
