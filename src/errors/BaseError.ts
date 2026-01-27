/**
 * Abstract base class for all trading system errors
 * Provides consistent error structure, metadata, and serialization
 *
 * All trading errors should inherit from this class to ensure:
 * - Consistent error codes and domains
 * - Stack trace preservation
 * - Error context for diagnostics
 * - Type-safe recovery decisions
 */

export enum ErrorDomain {
  TRADING = 'TRADING',
  EXCHANGE = 'EXCHANGE',
  POSITION = 'POSITION',
  ORDER = 'ORDER',
  CONFIGURATION = 'CONFIGURATION',
  INTERNAL = 'INTERNAL',
  PERFORMANCE = 'PERFORMANCE',
}

export enum ErrorSeverity {
  CRITICAL = 'CRITICAL', // Stops bot (wallet empty, critical validation failed)
  HIGH = 'HIGH', // Prevents trading (API down, exchange unavailable)
  MEDIUM = 'MEDIUM', // Degraded service (one analyzer fails, one position fails)
  LOW = 'LOW', // Informational (cache miss, slow operation)
}

export interface ErrorMetadata {
  /** Unique error code for classification (e.g., 'EXCHANGE_API_ERROR') */
  code: string;

  /** Error domain for routing and categorization */
  domain: ErrorDomain;

  /** Severity level (determines response strategy) */
  severity: ErrorSeverity;

  /** Timestamp when error occurred */
  timestamp: number;

  /** Optional context object for error-specific data */
  context?: Record<string, unknown>;

  /** Whether this error can be recovered from */
  recoverable: boolean;

  /** Whether this error can be retried */
  retryable: boolean;
}

export type ErrorContext = Record<string, unknown>;

/**
 * Abstract base class for all trading errors
 * Ensures consistent error handling across the application
 */
export abstract class TradingError extends Error {
  /** Metadata describing the error */
  readonly metadata: ErrorMetadata;

  /** Original error that caused this one (if chained) */
  readonly originalError?: Error;

  /**
   * Create a new TradingError
   *
   * @param message - Human-readable error message
   * @param code - Unique error code for classification
   * @param domain - Error domain for routing
   * @param severity - Error severity level
   * @param originalError - Optional original error (for error chaining)
   * @param context - Optional context object for error-specific data
   */
  constructor(
    message: string,
    code: string,
    domain: ErrorDomain,
    severity: ErrorSeverity,
    originalError?: Error,
    context?: ErrorContext,
  ) {
    super(message);

    // Set prototype to enable instanceof checks for this class
    Object.setPrototypeOf(this, TradingError.prototype);

    this.originalError = originalError;
    this.metadata = {
      code,
      domain,
      severity,
      timestamp: Date.now(),
      context,
      recoverable: severity !== ErrorSeverity.CRITICAL,
      retryable: this.isRetryableCode(code),
    };
  }

  /**
   * Determine if an error with this code can be retried
   * Override in subclasses for custom retry logic
   */
  private isRetryableCode(code: string): boolean {
    const retryableCodes = [
      'EXCHANGE_API_ERROR',
      'EXCHANGE_CONNECTION_ERROR',
      'EXCHANGE_RATE_LIMIT',
      'ORDER_TIMEOUT',
      'ORDER_RETRY',
      'TEMPORARY_FAILURE',
    ];
    return retryableCodes.includes(code);
  }

  /**
   * Serialize error to JSON for logging/telemetry
   */
  toJSON() {
    return {
      name: this.constructor.name,
      message: this.message,
      metadata: this.metadata,
      stack: this.stack,
      originalError: this.originalError?.message,
    };
  }

  /**
   * Get detailed error information for diagnostics
   */
  toDiagnosticString(): string {
    const parts: string[] = [];
    parts.push(`[${this.metadata.code}] ${this.message}`);
    parts.push(`Domain: ${this.metadata.domain} | Severity: ${this.metadata.severity}`);
    if (this.metadata.context) {
      parts.push(`Context: ${JSON.stringify(this.metadata.context)}`);
    }
    if (this.originalError) {
      parts.push(`Caused by: ${this.originalError.message}`);
    }
    return parts.join('\n');
  }

  /**
   * Check if error is recoverable (not CRITICAL)
   */
  isRecoverable(): boolean {
    return this.metadata.recoverable;
  }

  /**
   * Check if error can be retried
   */
  isRetryable(): boolean {
    return this.metadata.retryable;
  }
}

/**
 * Generic TradingError for wrapping unknown errors
 */
export class UnknownTradingError extends TradingError {
  constructor(message: string, originalError?: Error, context?: ErrorContext) {
    super(
      message,
      'UNKNOWN_ERROR',
      ErrorDomain.INTERNAL,
      ErrorSeverity.MEDIUM,
      originalError,
      context,
    );
    Object.setPrototypeOf(this, UnknownTradingError.prototype);
  }
}
