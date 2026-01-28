/**
 * Centralized error handling with configurable recovery strategies
 *
 * Provides consistent error handling across all services with:
 * - Multiple recovery strategies (RETRY, FALLBACK, GRACEFUL_DEGRADE, SKIP, THROW)
 * - Exponential backoff for retries
 * - Error normalization
 * - Configurable logging and callbacks
 *
 * Usage:
 * ```
 * try {
 *   const result = await someOperation();
 * } catch (error) {
 *   const handled = await ErrorHandler.handle(error, {
 *     strategy: RecoveryStrategy.RETRY,
 *     retryConfig: { maxAttempts: 3, initialDelayMs: 100 },
 *     logger: this.logger,
 *     context: 'MyService.operation',
 *   });
 *   if (!handled.success) throw handled.error;
 * }
 * ```
 */

import { TradingError, UnknownTradingError } from './BaseError';
import { ExchangeRateLimitError } from './DomainErrors';

/**
 * Recovery strategy for error handling
 */
export enum RecoveryStrategy {
  /** Retry with exponential backoff */
  RETRY = 'RETRY',

  /** Try alternate implementation */
  FALLBACK = 'FALLBACK',

  /** Continue with reduced functionality */
  GRACEFUL_DEGRADE = 'GRACEFUL_DEGRADE',

  /** Log and continue */
  SKIP = 'SKIP',

  /** Fail fast (rethrow error) */
  THROW = 'THROW',
}

/**
 * Configuration for retry strategy
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;

  /** Initial delay in milliseconds */
  initialDelayMs: number;

  /** Multiplier for exponential backoff */
  backoffMultiplier: number;

  /** Maximum delay in milliseconds */
  maxDelayMs?: number;

  /** Custom backoff function (overrides exponential calculation) */
  customBackoff?: (attempt: number, config: RetryConfig) => number;
}

/**
 * Logger interface for error handling
 */
export interface ErrorLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}

/**
 * Configuration for error handling
 */
export interface ErrorHandlingConfig {
  /** Strategy to use for handling this error */
  strategy: RecoveryStrategy;

  /** Configuration for RETRY strategy */
  retryConfig?: RetryConfig;

  /** Context string for logging (e.g., service.method) */
  context?: string;

  /** Callback called before each retry */
  onRetry?: (attempt: number, error: TradingError, delayMs: number) => void;

  /** Callback called on successful recovery */
  onRecover?: (strategy: RecoveryStrategy, attemptsUsed: number) => void;

  /** Callback called on final failure */
  onFailure?: (error: TradingError, attemptsUsed: number) => void;

  /** Optional logger for backward compatibility with static method calls */
  logger?: ErrorLogger;
}

/**
 * Result of error handling
 */
export interface ErrorHandlingResult {
  /** Whether error was successfully handled/recovered */
  success: boolean;

  /** The error (if not recovered) */
  error?: TradingError;

  /** Whether error was recovered (vs. suppressed/skipped) */
  recovered: boolean;

  /** Number of attempts made */
  attempts: number;

  /** Human-readable message */
  message: string;

  /** Strategy that was used */
  strategy: RecoveryStrategy;
}

/**
 * Centralized error handler for consistent error handling across services
 * Logger is injected once in constructor to avoid passing through every layer
 */
export class ErrorHandler {
  /** Static default logger instance for backward compatibility */
  private static readonly defaultLogger: ErrorLogger = {
    info: (msg: string, ctx?: Record<string, unknown>) => {
      console.log(`[INFO] ${msg}`, ctx ? JSON.stringify(ctx, null, 2) : '');
    },
    warn: (msg: string, ctx?: Record<string, unknown>) => {
      console.warn(`[WARN] ${msg}`, ctx ? JSON.stringify(ctx, null, 2) : '');
    },
    error: (msg: string, ctx?: Record<string, unknown>) => {
      console.error(`[ERROR] ${msg}`, ctx ? JSON.stringify(ctx, null, 2) : '');
    },
    debug: (msg: string, ctx?: Record<string, unknown>) => {
      console.debug(`[DEBUG] ${msg}`, ctx ? JSON.stringify(ctx, null, 2) : '');
    },
  };

  constructor(private readonly logger: ErrorLogger) {}

  /**
   * Get logger instance (for general logging, not just errors)
   * Allows services to use ErrorHandler as single logger interface
   */
  getLogger(): ErrorLogger {
    return this.logger;
  }

  /**
   * Handle error with configured strategy
   *
   * @param error - The error to handle (any type, will be normalized)
   * @param config - Error handling configuration
   * @returns Error handling result
   */
  async handle(
    error: unknown,
    config: ErrorHandlingConfig,
  ): Promise<ErrorHandlingResult> {
    const tradingError = this.normalizeError(error);

    switch (config.strategy) {
      case RecoveryStrategy.RETRY:
        return await this.retryStrategy(tradingError, config);

      case RecoveryStrategy.FALLBACK:
        return await this.fallbackStrategy(tradingError, config);

      case RecoveryStrategy.GRACEFUL_DEGRADE:
        return this.degradeStrategy(tradingError, config);

      case RecoveryStrategy.SKIP:
        return this.skipStrategy(tradingError, config);

      case RecoveryStrategy.THROW:
      default:
        return this.throwStrategy(tradingError, config);
    }
  }

  /**
   * Retry strategy with exponential backoff
   * Note: This method handles the retry logic structure; the caller must implement
   * the actual operation retry with a loop or similar pattern
   */
  private async retryStrategy(
    error: TradingError,
    config: ErrorHandlingConfig,
  ): Promise<ErrorHandlingResult> {
    if (!error.metadata.retryable) {
      this.logger.warn(
        `[${config.context}] Error not retryable, will throw`,
        { code: error.metadata.code, message: error.message },
      );
      return {
        success: false,
        error,
        recovered: false,
        attempts: 1,
        message: 'Error not retryable',
        strategy: RecoveryStrategy.RETRY,
      };
    }

    const retryConfig = config.retryConfig || {
      maxAttempts: 3,
      initialDelayMs: 100,
      backoffMultiplier: 2,
      maxDelayMs: 10000,
    };

    this.logger.info(`[${config.context}] Setting up retry logic`, {
      code: error.metadata.code,
      maxAttempts: retryConfig.maxAttempts,
      initialDelayMs: retryConfig.initialDelayMs,
    });

    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      const delayMs = this.calculateDelay(attempt, retryConfig, error);

      if (attempt > 1) {
        this.logger.info(
          `[${config.context}] Retry ${attempt}/${retryConfig.maxAttempts}`,
          { delayMs, code: error.metadata.code },
        );

        config.onRetry?.(attempt, error, delayMs);
        await this.delay(delayMs);
      }
    }

    // Retry structure is set up; caller must implement actual retry in a loop
    return {
      success: false,
      error,
      recovered: false,
      attempts: retryConfig.maxAttempts,
      message: `Failed after ${retryConfig.maxAttempts} retries`,
      strategy: RecoveryStrategy.RETRY,
    };
  }

  /**
   * Fallback strategy - use alternate implementation
   */
  private async fallbackStrategy(
    error: TradingError,
    config: ErrorHandlingConfig,
  ): Promise<ErrorHandlingResult> {
    this.logger.info(
      `[${config.context}] Activating fallback strategy`,
      { code: error.metadata.code },
    );

    config.onRecover?.(RecoveryStrategy.FALLBACK, 1);

    return {
      success: true,
      recovered: true,
      attempts: 1,
      message: 'Fallback strategy activated',
      strategy: RecoveryStrategy.FALLBACK,
    };
  }

  /**
   * Graceful degradation strategy - continue with reduced functionality
   */
  private degradeStrategy(
    error: TradingError,
    config: ErrorHandlingConfig,
  ): ErrorHandlingResult {
    this.logger.warn(
      `[${config.context}] Degrading to reduced functionality`,
      { code: error.metadata.code, severity: error.metadata.severity },
    );

    config.onRecover?.(RecoveryStrategy.GRACEFUL_DEGRADE, 1);

    return {
      success: true,
      recovered: true,
      attempts: 1,
      message: 'Graceful degradation activated',
      strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
    };
  }

  /**
   * Skip strategy - log and continue
   */
  private skipStrategy(
    error: TradingError,
    config: ErrorHandlingConfig,
  ): ErrorHandlingResult {
    this.logger.warn(`[${config.context}] Skipping operation due to error`, {
      code: error.metadata.code,
      message: error.message,
    });

    config.onRecover?.(RecoveryStrategy.SKIP, 1);

    return {
      success: true,
      recovered: true,
      attempts: 1,
      message: 'Error skipped, operation cancelled',
      strategy: RecoveryStrategy.SKIP,
    };
  }

  /**
   * Throw strategy - fail fast
   */
  private throwStrategy(
    error: TradingError,
    config: ErrorHandlingConfig,
  ): ErrorHandlingResult {
    this.logger.error(`[${config.context}] Error will be thrown`, {
      code: error.metadata.code,
      message: error.message,
      diagnostic: error.toDiagnosticString(),
    });

    config.onFailure?.(error, 1);

    return {
      success: false,
      error,
      recovered: false,
      attempts: 1,
      message: error.message,
      strategy: RecoveryStrategy.THROW,
    };
  }

  /**
   * Normalize any error type to TradingError
   */
  private normalizeError(error: unknown): TradingError {
    if (error instanceof TradingError) {
      return error;
    }

    if (error instanceof Error) {
      return new UnknownTradingError(error.message, error, {
        originalType: error.constructor.name,
      });
    }

    return new UnknownTradingError(`Unknown error: ${String(error)}`, undefined, {
      originalValue: error,
    });
  }

  /**
   * Calculate delay for exponential backoff
   */
  private calculateDelay(
    attempt: number,
    config: RetryConfig,
    error?: TradingError,
  ): number {
    // If error is a rate limit with specific retry-after, use that
    if (error instanceof ExchangeRateLimitError && attempt === 1) {
      return Math.min(error.retryAfterMs, config.maxDelayMs || 10000);
    }

    // Use custom backoff if provided
    if (config.customBackoff) {
      return config.customBackoff(attempt, config);
    }

    // Calculate exponential backoff
    const exponentialDelay =
      config.initialDelayMs *
      Math.pow(config.backoffMultiplier, Math.max(0, attempt - 1));

    const maxDelay = config.maxDelayMs || 10000;
    return Math.min(exponentialDelay, maxDelay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute operation with error handling and recovery strategy
   * Supports actual retry loops for RETRY strategy
   *
   * Usage:
   * ```
   * const errorHandler = new ErrorHandler(logger);
   * const position = await errorHandler.executeAsync(
   *   () => this.bybitService.openPosition(params),
   *   {
   *     strategy: RecoveryStrategy.RETRY,
   *     retryConfig: { maxAttempts: 3, initialDelayMs: 500, backoffMultiplier: 2 },
   *     context: 'BybitService.openPosition',
   *   }
   * );
   * ```
   */
  async executeAsync<T>(
    fn: () => Promise<T>,
    config: ErrorHandlingConfig,
  ): Promise<{ success: boolean; value?: T; error?: TradingError }> {
    if (config.strategy === RecoveryStrategy.RETRY) {
      return await this.executeWithRetry(fn, config);
    }

    // For other strategies, try once
    try {
      const result = await fn();
      return { success: true, value: result };
    } catch (error) {
      const tradingError = this.normalizeError(error);

      switch (config.strategy) {
        case RecoveryStrategy.SKIP:
        case RecoveryStrategy.GRACEFUL_DEGRADE:
        case RecoveryStrategy.FALLBACK:
          config.onRecover?.(config.strategy, 1);
          return { success: true }; // Consider as success but no value
        default:
          config.onFailure?.(tradingError, 1);
          return { success: false, error: tradingError };
      }
    }
  }

  /**
   * Execute operation with RETRY strategy and exponential backoff
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    config: ErrorHandlingConfig,
  ): Promise<{ success: boolean; value?: T; error?: TradingError }> {
    const retryConfig = config.retryConfig || {
      maxAttempts: 3,
      initialDelayMs: 100,
      backoffMultiplier: 2,
      maxDelayMs: 10000,
    };

    let lastError: TradingError | undefined;

    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        const result = await fn();

        // Success - invoke callback if this wasn't the first attempt
        if (attempt > 1) {
          config.onRecover?.(RecoveryStrategy.RETRY, attempt - 1);
          this.logger.info(
            `[${config.context}] Operation succeeded after ${attempt - 1} retries`,
            { attemptNumber: attempt, totalAttempts: retryConfig.maxAttempts }
          );
        }

        return { success: true, value: result };
      } catch (error) {
        lastError = this.normalizeError(error);

        // On last attempt or non-retryable error, return failure
        if (attempt >= retryConfig.maxAttempts || !lastError.metadata.retryable) {
          config.onFailure?.(lastError, attempt);
          this.logger.error(
            `[${config.context}] Operation failed after ${attempt} attempts`,
            { error: lastError.message, code: lastError.metadata.code, retryable: lastError.metadata.retryable }
          );
          return { success: false, error: lastError };
        }

        // Schedule retry
        const delayMs = this.calculateDelay(attempt, retryConfig, lastError);
        config.onRetry?.(attempt, lastError, delayMs);
        this.logger.warn(
          `[${config.context}] Retrying after error (attempt ${attempt}/${retryConfig.maxAttempts})`,
          { delayMs, error: lastError.message, code: lastError.metadata.code }
        );

        // Wait before retrying
        await this.delay(delayMs);
      }
    }

    // Should not reach here
    config.onFailure?.(lastError!, retryConfig.maxAttempts);
    return { success: false, error: lastError };
  }

  /**
   * Wrap a function with error handling
   */
  async wrapAsync<T>(
    fn: () => Promise<T>,
    config: ErrorHandlingConfig,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const result = await this.handle(error, config);
      if (!result.success) {
        throw result.error;
      }
      return undefined as unknown as T;
    }
  }

  /**
   * Wrap a synchronous function with error handling
   */
  wrapSync<T>(fn: () => T, config: ErrorHandlingConfig): T {
    try {
      return fn();
    } catch (error) {
      const tradingError = this.normalizeError(error);

      const result = this.throwStrategy(tradingError, config);
      if (!result.success) {
        throw result.error;
      }
      return undefined as unknown as T;
    }
  }

  /**
   * Static method for backward compatibility with existing code that calls ErrorHandler.handle() directly
   * Creates a temporary instance with the provided or default logger
   */
  static async handle(
    error: unknown,
    config: ErrorHandlingConfig,
  ): Promise<ErrorHandlingResult> {
    const logger = config.logger || this.defaultLogger;
    const handler = new ErrorHandler(logger);
    return handler.handle(error, config);
  }

  /**
   * Static method for backward compatibility with existing code that calls ErrorHandler.executeAsync() directly
   * Creates a temporary instance with the provided or default logger
   */
  static async executeAsync<T>(
    fn: () => Promise<T>,
    config: ErrorHandlingConfig,
  ): Promise<{ success: boolean; value?: T; error?: TradingError }> {
    const logger = config.logger || this.defaultLogger;
    const handler = new ErrorHandler(logger);
    return handler.executeAsync(fn, config);
  }
}
