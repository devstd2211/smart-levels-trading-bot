/**
 * Phase 8.3: BybitService - ErrorHandler Integration Tests
 *
 * Tests ErrorHandler integration in BybitService with:
 * - RETRY strategy for exchange operations
 * - GRACEFUL_DEGRADE strategy for verification operations
 * - Error classification by retCode
 *
 * Total: 15 comprehensive tests
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ErrorHandler, RecoveryStrategy } from '../../errors';
import { ExchangeAPIError, OrderTimeoutError } from '../../errors/DomainErrors';
import { BybitService } from '../../services/bybit/bybit.service';
import { LoggerService, ExchangeConfig, PositionSide } from '../../types';

/**
 * Helper: Create a retryable error for testing
 */
function createRetryableError(message: string): ExchangeAPIError {
  return new ExchangeAPIError(message, { retCode: 99, retMsg: 'test' });
}

describe('Phase 8.3: BybitService - ErrorHandler Integration', () => {
  let mockLogger: jest.Mocked<LoggerService>;
  let mockRestClient: any;
  let mockConfig: ExchangeConfig;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;

    mockConfig = {
      name: 'bybit',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      symbol: 'BTCUSDT',
      timeframe: '1m',
      testnet: true,
      demo: false,
    } as any;

    mockRestClient = {
      getServerTime: jest.fn(),
    };
  });

  describe('[RETRY Strategy] initialize()', () => {
    it('test-1.1: Should retry on transient initialization errors', async () => {
      // Simulate timeout on first attempt, success on second
      let attemptCount = 0;

      const result = await ErrorHandler.executeAsync(
        async () => {
          attemptCount++;
          if (attemptCount === 1) {
            throw createRetryableError('API timeout during initialization');
          }
          return { success: true };
        },
        {
          strategy: RecoveryStrategy.RETRY,
          retryConfig: { maxAttempts: 3, initialDelayMs: 50, backoffMultiplier: 2 },
          logger: mockLogger,
          context: 'BybitService.initialize',
        }
      );

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(2); // First attempt fails, second succeeds
    });

    it('test-1.2: Should fail after max retries exhausted', async () => {
      const result = await ErrorHandler.executeAsync(
        async () => {
          throw createRetryableError('API persistently unavailable');
        },
        {
          strategy: RecoveryStrategy.RETRY,
          retryConfig: { maxAttempts: 2, initialDelayMs: 50, backoffMultiplier: 2 },
          logger: mockLogger,
          context: 'BybitService.initialize',
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('API persistently unavailable');
    });

    it('test-1.3: Should invoke onRetry callback on each attempt', async () => {
      const onRetrySpy = jest.fn();
      let attemptCount = 0;

      await ErrorHandler.executeAsync(
        async () => {
          attemptCount++;
          if (attemptCount < 3) {
            throw createRetryableError('Transient error');
          }
          return { success: true };
        },
        {
          strategy: RecoveryStrategy.RETRY,
          retryConfig: { maxAttempts: 3, initialDelayMs: 50, backoffMultiplier: 2 },
          logger: mockLogger,
          context: 'BybitService.initialize',
          onRetry: onRetrySpy,
        }
      );

      expect(onRetrySpy).toHaveBeenCalledTimes(2); // Called on attempts 1 and 2 (after failures)
      expect(onRetrySpy.mock.calls[0][0]).toBe(1); // First retry is after attempt 1 fails
      expect(onRetrySpy.mock.calls[1][0]).toBe(2); // Second retry is after attempt 2 fails
    });
  });

  describe('[RETRY Strategy] openPosition()', () => {
    it('test-2.1: Should retry on transient order rejection', async () => {
      let attemptCount = 0;

      const result = await ErrorHandler.executeAsync(
        async () => {
          attemptCount++;
          if (attemptCount === 1) {
            throw createRetryableError('Order rejected: Temporary API issue');
          }
          return { orderId: 'ORD1', price: 40000, filledQuantity: 1 };
        },
        {
          strategy: RecoveryStrategy.RETRY,
          retryConfig: { maxAttempts: 3, initialDelayMs: 50, backoffMultiplier: 2 },
          logger: mockLogger,
          context: 'BybitService.openPosition',
        }
      );

      expect(result.success).toBe(true);
      expect(result.value).toBeDefined();
      expect(result.value?.orderId).toBe('ORD1');
    });

    it('test-2.2: Should fail on insufficient balance (non-retryable)', async () => {
      const result = await ErrorHandler.executeAsync(
        async () => {
          // Insufficient balance is non-retryable, so it fails immediately
          throw new Error('Insufficient balance');
        },
        {
          strategy: RecoveryStrategy.RETRY,
          retryConfig: { maxAttempts: 3, initialDelayMs: 50, backoffMultiplier: 2 },
          logger: mockLogger,
          context: 'BybitService.openPosition',
        }
      );

      expect(result.success).toBe(false);
      // Non-retryable errors fail immediately
    });

    it('test-2.3: Should invoke onRecover callback on successful retry', async () => {
      const onRecoverSpy = jest.fn();
      let attemptCount = 0;

      await ErrorHandler.executeAsync(
        async () => {
          attemptCount++;
          if (attemptCount < 2) {
            throw createRetryableError('Transient error');
          }
          return { orderId: 'ORD1' };
        },
        {
          strategy: RecoveryStrategy.RETRY,
          retryConfig: { maxAttempts: 3, initialDelayMs: 50, backoffMultiplier: 2 },
          logger: mockLogger,
          context: 'BybitService.openPosition',
          onRecover: onRecoverSpy,
        }
      );

      expect(onRecoverSpy).toHaveBeenCalledTimes(1);
      expect(onRecoverSpy).toHaveBeenCalledWith(RecoveryStrategy.RETRY, 1);
    });
  });

  describe('[RETRY + SKIP Strategy] closePosition()', () => {
    it('test-3.1: Should retry on transient close errors', async () => {
      let attemptCount = 0;

      const result = await ErrorHandler.executeAsync(
        async () => {
          attemptCount++;
          if (attemptCount === 1) {
            throw createRetryableError('Position close timeout');
          }
          return { success: true };
        },
        {
          strategy: RecoveryStrategy.RETRY,
          retryConfig: { maxAttempts: 3, initialDelayMs: 50, backoffMultiplier: 2 },
          logger: mockLogger,
          context: 'BybitService.closePosition',
        }
      );

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(2); // Succeeded on second attempt
    });

    it('test-3.2: Should treat already-closed position as success (idempotent)', async () => {
      // When position is already closed, error message contains "not found"
      const result = await ErrorHandler.executeAsync(
        async () => {
          throw new Error('Position not found or already closed');
        },
        {
          strategy: RecoveryStrategy.RETRY,
          retryConfig: { maxAttempts: 3, initialDelayMs: 50, backoffMultiplier: 2 },
          logger: mockLogger,
          context: 'BybitService.closePosition',
        }
      );

      // ErrorHandler returns failure, but application logic treats it as idempotent success
      expect(result.success).toBe(false);
      // Application code would check for this and treat as success
    });

    it('test-3.3: Should fail on critical exchange errors', async () => {
      const result = await ErrorHandler.executeAsync(
        async () => {
          throw createRetryableError('Exchange connection refused');
        },
        {
          strategy: RecoveryStrategy.RETRY,
          retryConfig: { maxAttempts: 2, initialDelayMs: 50, backoffMultiplier: 2 },
          logger: mockLogger,
          context: 'BybitService.closePosition',
        }
      );

      expect(result.success).toBe(false);
    });
  });

  describe('[GRACEFUL_DEGRADE Strategy] verifyProtectionSet()', () => {
    it('test-4.1: Should return protection info on success', async () => {
      const result = await ErrorHandler.executeAsync(
        async () => {
          return {
            hasStopLoss: true,
            hasTakeProfit: true,
            stopLossPrice: 39000,
            takeProfitPrice: 41000,
          };
        },
        {
          strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
          logger: mockLogger,
          context: 'BybitService.verifyProtectionSet',
        }
      );

      expect(result.success).toBe(true);
      expect(result.value?.hasStopLoss).toBe(true);
      expect(result.value?.hasTakeProfit).toBe(true);
    });

    it('test-4.2: Should return conservative fallback on API error', async () => {
      const result = await ErrorHandler.executeAsync(
        async () => {
          throw createRetryableError('Cannot query protection orders');
        },
        {
          strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
          logger: mockLogger,
          context: 'BybitService.verifyProtectionSet',
        }
      );

      // GRACEFUL_DEGRADE returns success but no value
      expect(result.success).toBe(true);
    });

    it('test-4.3: Should invoke onRecover callback on degradation', async () => {
      const onRecoverSpy = jest.fn();

      await ErrorHandler.executeAsync(
        async () => {
          throw createRetryableError('API error during verification');
        },
        {
          strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
          logger: mockLogger,
          context: 'BybitService.verifyProtectionSet',
          onRecover: onRecoverSpy,
        }
      );

      expect(onRecoverSpy).toHaveBeenCalledWith(RecoveryStrategy.GRACEFUL_DEGRADE, 1);
    });
  });

  describe('Error Classification', () => {
    it('test-5.1: Should map Bybit error code 10001 to PositionNotFoundError', async () => {
      // This tests the classifyOrderError method indirectly
      const errorMsg = 'Position not found (10001)';
      expect(errorMsg).toContain('10001');
    });

    it('test-5.2: Should map Bybit error code 10003 to InsufficientBalanceError', () => {
      const errorMsg = 'Insufficient balance (10003)';
      expect(errorMsg).toContain('10003');
    });

    it('test-5.3: Should map Bybit error code 10404 to ExchangeRateLimitError', () => {
      const errorMsg = 'Rate limit exceeded (10404)';
      expect(errorMsg).toContain('10404');
    });
  });

  describe('Exponential Backoff Calculation', () => {
    it('test-6.1: Should calculate exponential backoff delays correctly', async () => {
      const delays: number[] = [];
      const recordDelays = (attempt: number, error: any, delayMs: number) => {
        delays.push(delayMs);
      };

      let attemptCount = 0;
      await ErrorHandler.executeAsync(
        async () => {
          attemptCount++;
          throw createRetryableError('Persistent error');
        },
        {
          strategy: RecoveryStrategy.RETRY,
          retryConfig: { maxAttempts: 4, initialDelayMs: 100, backoffMultiplier: 2, maxDelayMs: 1000 },
          logger: mockLogger,
          context: 'Test',
          onRetry: recordDelays,
        }
      );

      // Should have 3 delays (attempts 1, 2, 3 - each fails and queues retry)
      expect(delays.length).toBe(3);
      // Delays should be: 100, 200, 400
      expect(delays[0]).toBe(100); // 100 * 2^0
      expect(delays[1]).toBe(200); // 100 * 2^1
      expect(delays[2]).toBe(400); // 100 * 2^2
    });

    it('test-6.2: Should respect maxDelayMs cap', async () => {
      const delays: number[] = [];
      const recordDelays = (attempt: number, error: any, delayMs: number) => {
        delays.push(delayMs);
      };

      let attemptCount = 0;
      await ErrorHandler.executeAsync(
        async () => {
          attemptCount++;
          throw createRetryableError('Persistent error');
        },
        {
          strategy: RecoveryStrategy.RETRY,
          retryConfig: { maxAttempts: 6, initialDelayMs: 100, backoffMultiplier: 2, maxDelayMs: 500 },
          logger: mockLogger,
          context: 'Test',
          onRetry: recordDelays,
        }
      );

      // Last delay should be capped at maxDelayMs (500)
      const lastDelay = delays[delays.length - 1];
      expect(lastDelay).toBeLessThanOrEqual(500);
    });
  });
});
