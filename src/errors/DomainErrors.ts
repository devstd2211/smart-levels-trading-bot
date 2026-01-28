/**
 * Domain-specific error classes for the trading system
 * Each domain has specialized error types with relevant properties
 *
 * Domains:
 * - TRADING: Entry/exit logic errors
 * - EXCHANGE: API and connectivity errors
 * - POSITION: Position state and management errors
 * - ORDER: Order execution and lifecycle errors
 */

import { TradingError, ErrorDomain, ErrorSeverity, ErrorContext } from './BaseError';
import { Signal, Position } from '../types';

// ============================================================================
// TRADING DOMAIN ERRORS
// ============================================================================

/**
 * Entry signal validation failed
 * Indicates that an entry signal was rejected due to validation rules
 */
export class EntryValidationError extends TradingError {
  constructor(
    message: string,
    context: {
      signal?: Signal;
      reason: string;
      confidence?: number;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'ENTRY_VALIDATION_ERROR',
      ErrorDomain.TRADING,
      ErrorSeverity.MEDIUM,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, EntryValidationError.prototype);
  }
}

/**
 * Exit signal execution failed
 * Indicates that an exit action could not be executed
 */
export class ExitExecutionError extends TradingError {
  constructor(
    message: string,
    context: {
      positionId: string;
      exitAction: string;
      reason: string;
      pnl?: number;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'EXIT_EXECUTION_ERROR',
      ErrorDomain.TRADING,
      ErrorSeverity.HIGH,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, ExitExecutionError.prototype);
  }
}

/**
 * Strategy execution error
 * Indicates failure during strategy coordination/execution
 */
export class StrategyExecutionError extends TradingError {
  constructor(
    message: string,
    context: {
      strategyId?: string;
      phase: string;
      reason: string;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'STRATEGY_EXECUTION_ERROR',
      ErrorDomain.TRADING,
      ErrorSeverity.MEDIUM,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, StrategyExecutionError.prototype);
  }
}

/**
 * Risk limit exceeded
 * Position/trade would exceed configured risk limits
 */
export class RiskLimitExceededError extends TradingError {
  constructor(
    message: string,
    context: {
      limitType: string; // e.g., 'MAX_POSITION_SIZE', 'MAX_DAILY_LOSS'
      currentValue: number;
      limit: number;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'RISK_LIMIT_EXCEEDED',
      ErrorDomain.TRADING,
      ErrorSeverity.HIGH,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, RiskLimitExceededError.prototype);
  }
}

/**
 * Insufficient balance for operation
 */
export class InsufficientBalanceError extends TradingError {
  constructor(
    message: string,
    context: {
      required: number;
      available: number;
      currency: string;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'INSUFFICIENT_BALANCE',
      ErrorDomain.TRADING,
      ErrorSeverity.CRITICAL,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, InsufficientBalanceError.prototype);
  }
}

// ============================================================================
// EXCHANGE DOMAIN ERRORS
// ============================================================================

/**
 * Exchange API connection error
 * Network connectivity issue or API unavailable
 */
export class ExchangeConnectionError extends TradingError {
  constructor(
    message: string,
    context: { exchangeName: string; endpoint?: string; [key: string]: unknown },
    originalError?: Error,
  ) {
    super(
      message,
      'EXCHANGE_CONNECTION_ERROR',
      ErrorDomain.EXCHANGE,
      ErrorSeverity.HIGH,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, ExchangeConnectionError.prototype);
  }
}

/**
 * Exchange rate limit error
 * API rate limit exceeded, retry after specified duration
 */
export class ExchangeRateLimitError extends TradingError {
  readonly retryAfterMs: number;

  constructor(
    message: string,
    context: {
      retryAfterMs?: number;
      exchangeName?: string;
      [key: string]: unknown;
    } = {},
    originalError?: Error,
  ) {
    const retryAfterMs = context.retryAfterMs || 60000;
    super(
      message,
      'EXCHANGE_RATE_LIMIT',
      ErrorDomain.EXCHANGE,
      ErrorSeverity.MEDIUM,
      originalError,
      context,
    );
    this.retryAfterMs = retryAfterMs;
    Object.setPrototypeOf(this, ExchangeRateLimitError.prototype);
  }
}

/**
 * Exchange API error
 * Generic API error returned by exchange
 */
export class ExchangeAPIError extends TradingError {
  constructor(
    message: string,
    context: {
      exchangeName?: string;
      endpoint?: string;
      statusCode?: number;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'EXCHANGE_API_ERROR',
      ErrorDomain.EXCHANGE,
      ErrorSeverity.HIGH,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, ExchangeAPIError.prototype);
  }
}

/**
 * Exchange order rejected
 * Order was rejected by exchange due to validation or other reasons
 */
export class OrderRejectedError extends TradingError {
  constructor(
    message: string,
    context: {
      orderId?: string;
      reason: string;
      details?: unknown;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'ORDER_REJECTED',
      ErrorDomain.EXCHANGE,
      ErrorSeverity.HIGH,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, OrderRejectedError.prototype);
  }
}

// ============================================================================
// POSITION DOMAIN ERRORS
// ============================================================================

/**
 * Position not found
 * Requested position does not exist
 */
export class PositionNotFoundError extends TradingError {
  constructor(
    message: string,
    context: {
      positionId?: string;
      symbol?: string;
      [key: string]: unknown;
    } = {},
    originalError?: Error,
  ) {
    super(
      message,
      'POSITION_NOT_FOUND',
      ErrorDomain.POSITION,
      ErrorSeverity.HIGH,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, PositionNotFoundError.prototype);
  }
}

/**
 * Position state error
 * Position is not in the expected state for this operation
 */
export class PositionStateError extends TradingError {
  constructor(
    message: string,
    context: {
      positionId: string;
      currentState: string;
      expectedState?: string;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'POSITION_STATE_ERROR',
      ErrorDomain.POSITION,
      ErrorSeverity.HIGH,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, PositionStateError.prototype);
  }
}

/**
 * Position sizing error
 * Position size is invalid or violates constraints
 */
export class PositionSizingError extends TradingError {
  constructor(
    message: string,
    context: {
      requestedSize: number;
      minSize?: number;
      maxSize?: number;
      reason: string;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'POSITION_SIZING_ERROR',
      ErrorDomain.POSITION,
      ErrorSeverity.MEDIUM,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, PositionSizingError.prototype);
  }
}

/**
 * Leverage validation error
 * Leverage exceeds allowed limits
 */
export class LeverageValidationError extends TradingError {
  constructor(
    message: string,
    context: {
      requestedLeverage: number;
      maxLeverage: number;
      symbol?: string;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'LEVERAGE_VALIDATION_ERROR',
      ErrorDomain.POSITION,
      ErrorSeverity.MEDIUM,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, LeverageValidationError.prototype);
  }
}

// ============================================================================
// ORDER DOMAIN ERRORS
// ============================================================================

/**
 * Order timeout
 * Order was not filled within expected time
 */
export class OrderTimeoutError extends TradingError {
  readonly timeoutMs: number;

  constructor(
    message: string,
    context: {
      orderId?: string;
      symbol?: string;
      timeoutMs: number;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    const { timeoutMs } = context;
    super(
      message,
      'ORDER_TIMEOUT',
      ErrorDomain.ORDER,
      ErrorSeverity.HIGH,
      originalError,
      context,
    );
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, OrderTimeoutError.prototype);
  }
}

/**
 * Order slippage exceeded
 * Fill price exceeded acceptable slippage threshold
 */
export class OrderSlippageError extends TradingError {
  constructor(
    message: string,
    context: {
      orderId?: string;
      expectedPrice: number;
      actualPrice: number;
      slippagePercent: number;
      maxSlippagePercent: number;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'ORDER_SLIPPAGE_ERROR',
      ErrorDomain.ORDER,
      ErrorSeverity.MEDIUM,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, OrderSlippageError.prototype);
  }
}

/**
 * Order cancellation error
 * Failed to cancel order
 */
export class OrderCancellationError extends TradingError {
  constructor(
    message: string,
    context: {
      orderId?: string;
      reason: string;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'ORDER_CANCELLATION_ERROR',
      ErrorDomain.ORDER,
      ErrorSeverity.MEDIUM,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, OrderCancellationError.prototype);
  }
}

/**
 * Order validation error
 * Order parameters are invalid
 */
export class OrderValidationError extends TradingError {
  constructor(
    message: string,
    context: {
      field: string;
      value: unknown;
      reason: string;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'ORDER_VALIDATION_ERROR',
      ErrorDomain.ORDER,
      ErrorSeverity.MEDIUM,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, OrderValidationError.prototype);
  }
}

// ============================================================================
// CONFIGURATION DOMAIN ERRORS
// ============================================================================

/**
 * Configuration error
 * Invalid or missing configuration
 */
export class ConfigurationError extends TradingError {
  constructor(
    message: string,
    context: {
      configKey: string;
      issue: string;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'CONFIGURATION_ERROR',
      ErrorDomain.CONFIGURATION,
      ErrorSeverity.CRITICAL,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

// ============================================================================
// PERFORMANCE DOMAIN ERRORS
// ============================================================================

/**
 * Performance threshold exceeded
 * Operation took longer than acceptable
 */
export class PerformanceError extends TradingError {
  constructor(
    message: string,
    context: {
      operation: string;
      durationMs: number;
      thresholdMs: number;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'PERFORMANCE_ERROR',
      ErrorDomain.PERFORMANCE,
      ErrorSeverity.LOW,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, PerformanceError.prototype);
  }
}

// ============================================================================
// WEBSOCKET DOMAIN ERRORS (Phase 8.8)
// ============================================================================

/**
 * WebSocket connection error
 * Indicates failure to establish or maintain WebSocket connection
 */
export class WebSocketConnectionError extends TradingError {
  constructor(
    message: string,
    context?: {
      url?: string;
      attemptNumber?: number;
      lastError?: string;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'WEBSOCKET_CONNECTION_ERROR',
      ErrorDomain.EXCHANGE,
      ErrorSeverity.HIGH,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, WebSocketConnectionError.prototype);
  }
}

/**
 * WebSocket authentication error
 * Indicates failure to authenticate WebSocket connection
 */
export class WebSocketAuthenticationError extends TradingError {
  constructor(
    message: string,
    context?: {
      reason?: string;
      apiKeyMissing?: boolean;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'WEBSOCKET_AUTH_ERROR',
      ErrorDomain.EXCHANGE,
      ErrorSeverity.HIGH,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, WebSocketAuthenticationError.prototype);
  }
}

/**
 * WebSocket subscription error
 * Indicates failure to subscribe to required topics
 */
export class WebSocketSubscriptionError extends TradingError {
  constructor(
    message: string,
    context?: {
      topic?: string;
      failedTopics?: string[];
      successfulTopics?: string[];
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'WEBSOCKET_SUBSCRIPTION_ERROR',
      ErrorDomain.EXCHANGE,
      ErrorSeverity.MEDIUM,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, WebSocketSubscriptionError.prototype);
  }
}

// ============================================================================
// RISK MANAGEMENT DOMAIN ERRORS
// ============================================================================

/**
 * Risk validation error
 * Indicates that a trade was rejected due to risk validation failures
 */
export class RiskValidationError extends TradingError {
  constructor(
    message: string,
    context?: {
      signal?: Signal;
      reason?: string;
      signalPrice?: number;
      confidence?: number;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'RISK_VALIDATION_ERROR',
      ErrorDomain.TRADING,
      ErrorSeverity.MEDIUM,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, RiskValidationError.prototype);
  }
}

/**
 * Risk calculation error
 * Indicates that risk calculations failed (NaN, Infinity, etc.)
 */
export class RiskCalculationError extends TradingError {
  constructor(
    message: string,
    context?: {
      operation?: string;
      inputValues?: Record<string, unknown>;
      result?: number | string;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'RISK_CALCULATION_ERROR',
      ErrorDomain.TRADING,
      ErrorSeverity.MEDIUM,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, RiskCalculationError.prototype);
  }
}

/**
 * Insufficient account balance error
 * Indicates that account balance is insufficient or invalid for trading
 */
export class InsufficientAccountBalanceError extends TradingError {
  constructor(
    message: string,
    context?: {
      currentBalance?: number;
      requiredBalance?: number;
      reason?: string;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'INSUFFICIENT_ACCOUNT_BALANCE_ERROR',
      ErrorDomain.TRADING,
      ErrorSeverity.HIGH,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, InsufficientAccountBalanceError.prototype);
  }
}

// ============================================================================
// PERSISTENCE DOMAIN ERRORS
// ============================================================================

/**
 * Journal read error
 * Failed to load journal from disk (file missing, corrupted, or parse error)
 */
export class JournalReadError extends TradingError {
  constructor(
    message: string,
    context: {
      filePath: string;
      operation: 'read' | 'parse' | 'corrupt';
      reason: string;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'JOURNAL_READ_ERROR',
      ErrorDomain.PERSISTENCE,
      ErrorSeverity.MEDIUM,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, JournalReadError.prototype);
  }
}

/**
 * Journal write error
 * Failed to save journal to disk (write error, disk full, permission)
 */
export class JournalWriteError extends TradingError {
  constructor(
    message: string,
    context: {
      filePath: string;
      operation: 'write' | 'serialize' | 'directory';
      reason: string;
      entriesCount?: number;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'JOURNAL_WRITE_ERROR',
      ErrorDomain.PERSISTENCE,
      ErrorSeverity.HIGH,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, JournalWriteError.prototype);
  }
}

/**
 * Trade record validation error
 * Invalid trade ID, duplicate, or missing required fields
 */
export class TradeRecordValidationError extends TradingError {
  constructor(
    message: string,
    context: {
      field: string;
      value: unknown;
      reason: string;
      tradeId?: string;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'TRADE_RECORD_VALIDATION_ERROR',
      ErrorDomain.TRADING,
      ErrorSeverity.HIGH,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, TradeRecordValidationError.prototype);
  }
}

/**
 * CSV export error
 * Non-critical failure during CSV history export
 */
export class CSVExportError extends TradingError {
  constructor(
    message: string,
    context: {
      filePath: string;
      reason: string;
      recordsCount?: number;
      [key: string]: unknown;
    },
    originalError?: Error,
  ) {
    super(
      message,
      'CSV_EXPORT_ERROR',
      ErrorDomain.PERSISTENCE,
      ErrorSeverity.LOW,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, CSVExportError.prototype);
  }
}
