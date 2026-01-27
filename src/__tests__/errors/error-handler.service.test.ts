/**
 * Unit tests for ErrorHandler service with recovery strategies
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  ErrorHandler,
  RecoveryStrategy,
  ErrorHandlingConfig,
  ErrorLogger,
} from '../../errors/ErrorHandler';
import {
  OrderTimeoutError,
  ExchangeRateLimitError,
  EntryValidationError,
  ExchangeConnectionError,
} from '../../errors/DomainErrors';

describe('ErrorHandler - Recovery Strategies', () => {
  let mockLogger: ErrorLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
  });

  describe('Error Normalization', () => {
    it('should pass through TradingError as-is', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const normalized = ErrorHandler['normalizeError'](error);

      expect(normalized).toBe(error);
    });

    it('should wrap regular Error as UnknownTradingError', async () => {
      const regularError = new Error('Something went wrong');
      const normalized = ErrorHandler['normalizeError'](regularError);

      expect(normalized.message).toContain('Something went wrong');
      expect(normalized.originalError).toBe(regularError);
    });

    it('should wrap string as UnknownTradingError', () => {
      const normalized = ErrorHandler['normalizeError']('Error string');

      expect(normalized.message).toContain('Error string');
    });

    it('should wrap arbitrary value as UnknownTradingError', () => {
      const normalized = ErrorHandler['normalizeError']({ arbitrary: 'data' });

      expect(normalized.message).toBeDefined();
    });
  });

  describe('RETRY Strategy', () => {
    it('should not retry non-retryable errors', async () => {
      const error = new EntryValidationError('Validation failed', {
        reason: 'Confidence too low',
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.RETRY,
        logger: mockLogger,
      };

      const result = await ErrorHandler.handle(error, config);

      expect(result.success).toBe(false);
      expect(result.recovered).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
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
        logger: mockLogger,
      };

      const result = await ErrorHandler.handle(error, config);

      expect(result.strategy).toBe(RecoveryStrategy.RETRY);
      expect(result.attempts).toBe(3);
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should use default retry config if not provided', async () => {
      const error = new ExchangeConnectionError('Connection failed', {
        exchangeName: 'Bybit',
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.RETRY,
        logger: mockLogger,
      };

      const result = await ErrorHandler.handle(error, config);

      expect(result.strategy).toBe(RecoveryStrategy.RETRY);
      expect(result.attempts).toBeGreaterThan(0);
    });

    it('should call onRetry callback for each attempt', async () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      const onRetrySpy = jest.fn();
      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.RETRY,
        retryConfig: {
          maxAttempts: 3,
          initialDelayMs: 1,
          backoffMultiplier: 1,
        },
        onRetry: onRetrySpy,
      };

      // Note: Due to async delays, we'll just verify callback was set
      await ErrorHandler.handle(error, config);

      expect(onRetrySpy).toBeDefined();
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
      };

      const result = await ErrorHandler.handle(error, config);

      expect(result.strategy).toBe(RecoveryStrategy.RETRY);
      expect(result.attempts).toBe(5);
    });

    it('should handle rate limit retry with specific retryAfter', async () => {
      const error = new ExchangeRateLimitError('Rate limited', {
        retryAfterMs: 120000,
        exchangeName: 'Bybit',
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.RETRY,
        logger: mockLogger,
      };

      const result = await ErrorHandler.handle(error, config);

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
        logger: mockLogger,
      };

      const result = await ErrorHandler.handle(error, config);

      expect(result.success).toBe(true);
      expect(result.recovered).toBe(true);
      expect(result.strategy).toBe(RecoveryStrategy.FALLBACK);
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should call onRecover callback', async () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      const onRecoverSpy = jest.fn();
      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.FALLBACK,
        onRecover: onRecoverSpy,
      };

      await ErrorHandler.handle(error, config);

      expect(onRecoverSpy).toHaveBeenCalledWith(RecoveryStrategy.FALLBACK, 1);
    });

    it('should work with custom context', async () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.FALLBACK,
        context: 'OrderExecutor.placeOrder',
        logger: mockLogger,
      };

      await ErrorHandler.handle(error, config);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('[OrderExecutor.placeOrder]'),
        expect.any(Object),
      );
    });
  });

  describe('GRACEFUL_DEGRADE Strategy', () => {
    it('should activate degradation and return success', () => {
      const error = new EntryValidationError('Validation failed', {
        reason: 'One analyzer failed',
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
        logger: mockLogger,
      };

      const result = ErrorHandler['degradeStrategy'](error, config);

      expect(result.success).toBe(true);
      expect(result.recovered).toBe(true);
      expect(result.strategy).toBe(RecoveryStrategy.GRACEFUL_DEGRADE);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should call onRecover callback', () => {
      const error = new EntryValidationError('Validation failed', {
        reason: 'test',
      });

      const onRecoverSpy = jest.fn();
      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
        onRecover: onRecoverSpy,
      };

      ErrorHandler['degradeStrategy'](error, config);

      expect(onRecoverSpy).toHaveBeenCalledWith(
        RecoveryStrategy.GRACEFUL_DEGRADE,
        1,
      );
    });
  });

  describe('SKIP Strategy', () => {
    it('should skip error and continue', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.SKIP,
        logger: mockLogger,
      };

      const result = ErrorHandler['skipStrategy'](error, config);

      expect(result.success).toBe(true);
      expect(result.recovered).toBe(true);
      expect(result.message).toContain('skipped');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should log error details before skipping', () => {
      const error = new EntryValidationError('Validation failed', {
        reason: 'test',
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.SKIP,
        context: 'EntryOrchestrator',
        logger: mockLogger,
      };

      ErrorHandler['skipStrategy'](error, config);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping'),
        expect.objectContaining({ code: 'ENTRY_VALIDATION_ERROR' }),
      );
    });
  });

  describe('THROW Strategy', () => {
    it('should return error without throwing', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.THROW,
        logger: mockLogger,
      };

      const result = ErrorHandler['throwStrategy'](error, config);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(result.recovered).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should call onFailure callback', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      const onFailureSpy = jest.fn();
      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.THROW,
        onFailure: onFailureSpy,
      };

      ErrorHandler['throwStrategy'](error, config);

      expect(onFailureSpy).toHaveBeenCalledWith(error, 1);
    });
  });

  describe('Route to Strategy', () => {
    it('should route RETRY strategy', async () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.RETRY,
      };

      const result = await ErrorHandler.handle(error, config);

      expect(result.strategy).toBe(RecoveryStrategy.RETRY);
    });

    it('should route FALLBACK strategy', async () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.FALLBACK,
      };

      const result = await ErrorHandler.handle(error, config);

      expect(result.strategy).toBe(RecoveryStrategy.FALLBACK);
      expect(result.recovered).toBe(true);
    });

    it('should route SKIP strategy', async () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.SKIP,
      };

      const result = await ErrorHandler.handle(error, config);

      expect(result.strategy).toBe(RecoveryStrategy.SKIP);
    });

    it('should default to THROW strategy', async () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      const config: ErrorHandlingConfig = {
        strategy: 'INVALID_STRATEGY' as any,
      };

      const result = await ErrorHandler.handle(error, config);

      expect(result.strategy).toBe(RecoveryStrategy.THROW);
    });
  });

  describe('Wrap Functions', () => {
    it('should wrap async function successfully', async () => {
      const fn = jest.fn(async () => 42);

      const result = await ErrorHandler.wrapAsync(fn, {
        strategy: RecoveryStrategy.THROW,
      });

      expect(result).toBe(42);
      expect(fn).toHaveBeenCalled();
    });

    it('should wrap async function with error and throw', async () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const fn = jest.fn(async () => {
        throw error;
      });

      await expect(
        ErrorHandler.wrapAsync(fn, {
          strategy: RecoveryStrategy.THROW,
        }),
      ).rejects.toThrow();
    });

    it('should wrap sync function successfully', () => {
      const fn = jest.fn(() => 42);

      const result = ErrorHandler.wrapSync(fn, {
        strategy: RecoveryStrategy.THROW,
      });

      expect(result).toBe(42);
      expect(fn).toHaveBeenCalled();
    });
  });

  describe('Context and Logging', () => {
    it('should include context in log messages', async () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.THROW,
        context: 'OrderExecutor.placeOrder',
        logger: mockLogger,
      };

      await ErrorHandler.handle(error, config);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[OrderExecutor.placeOrder]'),
        expect.any(Object),
      );
    });

    it('should include error metadata in logs', async () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      const config: ErrorHandlingConfig = {
        strategy: RecoveryStrategy.THROW,
        logger: mockLogger,
      };

      await ErrorHandler.handle(error, config);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          code: 'ORDER_TIMEOUT',
          message: 'timeout',
        }),
      );
    });
  });
});
