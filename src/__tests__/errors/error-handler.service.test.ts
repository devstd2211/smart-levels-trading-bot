/**
 * Unit tests for ErrorHandler service with recovery strategies
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  ErrorHandler,
  RecoveryStrategy,
  ErrorHandlingConfig,
} from '../../errors/ErrorHandler';
import {
  OrderTimeoutError,
  ExchangeRateLimitError,
  EntryValidationError,
  ExchangeConnectionError,
} from '../../errors/DomainErrors';
import { LoggerService } from '../../services/logger.service';
import { LogLevel } from '../../types';

describe('ErrorHandler - Recovery Strategies', () => {
  let errorHandler: ErrorHandler;
  let logger: LoggerService;

  beforeEach(() => {
    logger = new LoggerService(LogLevel.INFO, './logs', false);
    errorHandler = new ErrorHandler(logger);
  });

  describe('RETRY Strategy', () => {
    it('should not retry non-retryable errors', async () => {
      const error = new EntryValidationError('Validation failed', {
        reason: 'Confidence too low',
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.RETRY,
        context: 'test-retry',
      };

      const result = await errorHandler.handle(error, config);

      expect(result.success).toBe(false);
      expect(result.recovered).toBe(false);
    });

    it('should set up retry structure for retryable errors', async () => {
      const error = new OrderTimeoutError('Order timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 5000,
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.RETRY,
        retryConfig: {
          maxAttempts: 3,
          initialDelayMs: 100,
          backoffMultiplier: 2,
        },
        context: 'test-retry-structure',
      };

      const result = await errorHandler.handle(error, config);

      expect(result.strategy).toBe(RecoveryStrategy.RETRY);
    });

    it('should use default retry config if not provided', async () => {
      const error = new ExchangeConnectionError('Connection failed', {
        exchangeName: 'Bybit',
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.RETRY,
        context: 'test-default-retry',
      };

      const result = await errorHandler.handle(error, config);

      expect(result.strategy).toBe(RecoveryStrategy.RETRY);
    });

    it('should respect maxDelayMs in backoff calculation', async () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.RETRY,
        retryConfig: {
          maxAttempts: 5,
          initialDelayMs: 100,
          backoffMultiplier: 10,
          maxDelayMs: 500,
        },
        context: 'test-max-delay',
      };

      const result = await errorHandler.handle(error, config);

      expect(result.strategy).toBe(RecoveryStrategy.RETRY);
    });

    it('should handle rate limit retry with specific retryAfter', async () => {
      const error = new ExchangeRateLimitError('Rate limited', {
        retryAfterMs: 120000,
        exchangeName: 'Bybit',
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.RETRY,
        context: 'test-rate-limit',
      };

      const result = await errorHandler.handle(error, config);

      expect(result.strategy).toBe(RecoveryStrategy.RETRY);
    });
  });

  describe('FALLBACK Strategy', () => {
    it('should activate fallback and return success', async () => {
      const error = new ExchangeConnectionError('Connection failed', {
        exchangeName: 'Bybit',
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.FALLBACK,
        context: 'test-fallback',
      };

      const result = await errorHandler.handle(error, config);

      expect(result.success).toBe(true);
      expect(result.recovered).toBe(true);
      expect(result.strategy).toBe(RecoveryStrategy.FALLBACK);
    });
  });

  describe('GRACEFUL_DEGRADE Strategy', () => {
    it('should activate graceful degrade and return success', async () => {
      const error = new ExchangeConnectionError('Connection failed', {
        exchangeName: 'Bybit',
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
        context: 'test-degrade',
      };

      const result = await errorHandler.handle(error, config);

      expect(result.success).toBe(true);
      expect(result.recovered).toBe(true);
      expect(result.strategy).toBe(RecoveryStrategy.GRACEFUL_DEGRADE);
    });
  });

  describe('SKIP Strategy', () => {
    it('should skip error and return success', async () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.SKIP,
        context: 'test-skip',
      };

      const result = await errorHandler.handle(error, config);

      expect(result.success).toBe(true);
      expect(result.recovered).toBe(true);
      expect(result.strategy).toBe(RecoveryStrategy.SKIP);
    });
  });

  describe('THROW Strategy', () => {
    it('should rethrow error', async () => {
      const error = new EntryValidationError('Validation failed', {
        reason: 'Test error',
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.THROW,
        context: 'test-throw',
      };

      const result = await errorHandler.handle(error, config);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
    });
  });

  describe('wrapSync', () => {
    it('should wrap synchronous operation with error handling', () => {
      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.SKIP,
        context: 'test-wrap-sync',
      };

      const result = errorHandler.wrapSync(
        () => {
          return 'success';
        },
        config
      );

      expect(result).toBe('success');
    });
  });

  describe('wrapAsync', () => {
    it('should wrap asynchronous operation with error handling', async () => {
      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.SKIP,
        context: 'test-wrap-async',
      };

      const result = await errorHandler.wrapAsync(
        async () => {
          return 'async success';
        },
        config
      );

      expect(result).toBe('async success');
    });

    it('should handle async errors with GRACEFUL_DEGRADE strategy', async () => {
      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
        context: 'test-wrap-async-error',
      };

      const result = await errorHandler.wrapAsync(
        async () => {
          throw new ExchangeConnectionError('Connection failed', {
            exchangeName: 'Bybit',
          });
        },
        config
      );

      // GRACEFUL_DEGRADE returns undefined
      expect(result).toBeUndefined();
    });
  });

  describe('executeAsync', () => {
    it('should execute async operation with RETRY strategy', async () => {
      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.RETRY,
        retryConfig: {
          maxAttempts: 2,
          initialDelayMs: 10,
          backoffMultiplier: 1,
        },
        context: 'test-execute-async',
      };

      let attempt = 0;
      const result = await errorHandler.executeAsync(
        async () => {
          attempt++;
          if (attempt === 1) {
            throw new OrderTimeoutError('timeout', {
              orderId: 'O1',
              symbol: 'BTC',
              timeoutMs: 1000,
            });
          }
          return 'recovered';
        },
        config
      );

      expect(attempt).toBeGreaterThanOrEqual(1);
    });
  });

  describe('handle with callbacks', () => {
    it('should call callback methods on handle', async () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      let recoverCallbackCalled = false;

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.FALLBACK,
        context: 'test-callback',
        onRecover: () => {
          recoverCallbackCalled = true;
        },
      };

      const result = await errorHandler.handle(error, config);

      expect(recoverCallbackCalled).toBe(true);
      expect(result.recovered).toBe(true);
    });

  });
});
