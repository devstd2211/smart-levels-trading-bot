/**
 * Unit tests for domain-specific error classes
 */

import { describe, it, expect } from '@jest/globals';
import {
  EntryValidationError,
  ExitExecutionError,
  PositionNotFoundError,
  PositionStateError,
  PositionSizingError,
  ExchangeConnectionError,
  ExchangeRateLimitError,
  ExchangeAPIError,
  OrderRejectedError,
  OrderTimeoutError,
  OrderSlippageError,
  OrderValidationError,
  OrderCancellationError,
  InsufficientBalanceError,
  RiskLimitExceededError,
  StrategyExecutionError,
  LeverageValidationError,
} from '../../errors/DomainErrors';
import { ErrorDomain, ErrorSeverity, TradingError } from '../../errors/BaseError';

describe('Domain-Specific Errors', () => {
  describe('Trading Domain Errors', () => {
    it('should create EntryValidationError with signal context', () => {
      const context = {
        reason: 'Confidence too low',
        confidence: 0.75,
      };

      const error = new EntryValidationError(
        'Entry signal rejected',
        context as any,
      );

      expect(error.message).toBe('Entry signal rejected');
      expect(error.metadata.code).toBe('ENTRY_VALIDATION_ERROR');
      expect(error.metadata.domain).toBe(ErrorDomain.TRADING);
      expect(error.metadata.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.metadata.context?.reason).toBe('Confidence too low');
    });

    it('should create ExitExecutionError with position details', () => {
      const context = {
        positionId: 'POS123',
        exitAction: 'CLOSE_ALL',
        reason: 'WebSocket disconnected',
        pnl: 150,
      };

      const error = new ExitExecutionError(
        'Exit execution failed',
        context,
      );

      expect(error.metadata.code).toBe('EXIT_EXECUTION_ERROR');
      expect(error.metadata.severity).toBe(ErrorSeverity.HIGH);
      expect(error.metadata.context?.positionId).toBe('POS123');
      expect(error.metadata.context?.pnl).toBe(150);
    });

    it('should create StrategyExecutionError', () => {
      const error = new StrategyExecutionError(
        'Strategy failed',
        {
          strategyId: 'STRAT1',
          phase: 'EntryOrchestrator',
          reason: 'Signal aggregation failed',
        },
      );

      expect(error.metadata.code).toBe('STRATEGY_EXECUTION_ERROR');
      expect(error.metadata.severity).toBe(ErrorSeverity.MEDIUM);
    });

    it('should create RiskLimitExceededError', () => {
      const error = new RiskLimitExceededError(
        'Daily loss limit exceeded',
        {
          limitType: 'MAX_DAILY_LOSS',
          currentValue: 1500,
          limit: 1000,
        },
      );

      expect(error.metadata.code).toBe('RISK_LIMIT_EXCEEDED');
      expect(error.metadata.severity).toBe(ErrorSeverity.HIGH);
      expect(error.metadata.context?.currentValue).toBe(1500);
    });

    it('should create InsufficientBalanceError as CRITICAL', () => {
      const error = new InsufficientBalanceError(
        'Not enough balance',
        {
          required: 1000,
          available: 500,
          currency: 'USDT',
        },
      );

      expect(error.metadata.code).toBe('INSUFFICIENT_BALANCE');
      expect(error.metadata.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.metadata.recoverable).toBe(false);
    });
  });

  describe('Exchange Domain Errors', () => {
    it('should create ExchangeConnectionError', () => {
      const error = new ExchangeConnectionError(
        'Failed to connect to exchange',
        { exchangeName: 'Bybit', endpoint: 'https://api.bybit.com' },
      );

      expect(error.metadata.code).toBe('EXCHANGE_CONNECTION_ERROR');
      expect(error.metadata.domain).toBe(ErrorDomain.EXCHANGE);
      expect(error.metadata.severity).toBe(ErrorSeverity.HIGH);
      expect(error.metadata.context?.exchangeName).toBe('Bybit');
    });

    it('should create ExchangeRateLimitError with retryAfter', () => {
      const error = new ExchangeRateLimitError(
        'Rate limit exceeded',
        { retryAfterMs: 120000, exchangeName: 'Bybit' },
      );

      expect(error.metadata.code).toBe('EXCHANGE_RATE_LIMIT');
      expect(error.metadata.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.retryAfterMs).toBe(120000);
      expect(error.metadata.retryable).toBe(true);
    });

    it('should use default retryAfterMs if not provided', () => {
      const error = new ExchangeRateLimitError('Rate limit');

      expect(error.retryAfterMs).toBe(60000);
    });

    it('should create ExchangeAPIError', () => {
      const error = new ExchangeAPIError(
        'API returned error',
        { exchangeName: 'Bybit', statusCode: 500 },
      );

      expect(error.metadata.code).toBe('EXCHANGE_API_ERROR');
      expect(error.metadata.retryable).toBe(true);
    });

    it('should create OrderRejectedError', () => {
      const error = new OrderRejectedError(
        'Order was rejected',
        {
          orderId: 'ORD123',
          reason: 'Insufficient leverage',
          details: { leverage: 11, maxLeverage: 10 },
        },
      );

      expect(error.metadata.code).toBe('ORDER_REJECTED');
      expect(error.metadata.domain).toBe(ErrorDomain.EXCHANGE);
    });
  });

  describe('Position Domain Errors', () => {
    it('should create PositionNotFoundError', () => {
      const error = new PositionNotFoundError(
        'Position does not exist',
        { positionId: 'POS123', symbol: 'BTCUSDT' },
      );

      expect(error.metadata.code).toBe('POSITION_NOT_FOUND');
      expect(error.metadata.domain).toBe(ErrorDomain.POSITION);
      expect(error.metadata.severity).toBe(ErrorSeverity.HIGH);
    });

    it('should create PositionStateError', () => {
      const error = new PositionStateError(
        'Position in wrong state',
        {
          positionId: 'POS123',
          currentState: 'CLOSED',
          expectedState: 'OPEN',
        },
      );

      expect(error.metadata.code).toBe('POSITION_STATE_ERROR');
      expect(error.metadata.severity).toBe(ErrorSeverity.HIGH);
    });

    it('should create PositionSizingError', () => {
      const error = new PositionSizingError(
        'Invalid position size',
        {
          requestedSize: 50,
          minSize: 1,
          maxSize: 10,
          reason: 'Exceeds maximum position size',
        },
      );

      expect(error.metadata.code).toBe('POSITION_SIZING_ERROR');
      expect(error.metadata.severity).toBe(ErrorSeverity.MEDIUM);
    });

    it('should create LeverageValidationError', () => {
      const error = new LeverageValidationError(
        'Leverage exceeds limit',
        {
          requestedLeverage: 15,
          maxLeverage: 10,
          symbol: 'BTCUSDT',
        },
      );

      expect(error.metadata.code).toBe('LEVERAGE_VALIDATION_ERROR');
      expect(error.metadata.severity).toBe(ErrorSeverity.MEDIUM);
    });
  });

  describe('Order Domain Errors', () => {
    it('should create OrderTimeoutError with timeout duration', () => {
      const error = new OrderTimeoutError(
        'Order did not fill in time',
        {
          orderId: 'ORD123',
          symbol: 'BTCUSDT',
          timeoutMs: 5000,
        },
      );

      expect(error.metadata.code).toBe('ORDER_TIMEOUT');
      expect(error.metadata.domain).toBe(ErrorDomain.ORDER);
      expect(error.metadata.severity).toBe(ErrorSeverity.HIGH);
      expect(error.timeoutMs).toBe(5000);
      expect(error.metadata.retryable).toBe(true);
    });

    it('should create OrderSlippageError', () => {
      const error = new OrderSlippageError(
        'Slippage exceeded threshold',
        {
          orderId: 'ORD123',
          expectedPrice: 100,
          actualPrice: 101.5,
          slippagePercent: 1.5,
          maxSlippagePercent: 1.0,
        },
      );

      expect(error.metadata.code).toBe('ORDER_SLIPPAGE_ERROR');
      expect(error.metadata.severity).toBe(ErrorSeverity.MEDIUM);
    });

    it('should create OrderCancellationError', () => {
      const error = new OrderCancellationError(
        'Failed to cancel order',
        {
          orderId: 'ORD123',
          reason: 'Order already filled',
        },
      );

      expect(error.metadata.code).toBe('ORDER_CANCELLATION_ERROR');
    });

    it('should create OrderValidationError', () => {
      const error = new OrderValidationError(
        'Invalid order parameters',
        {
          field: 'quantity',
          value: -10,
          reason: 'Quantity must be positive',
        },
      );

      expect(error.metadata.code).toBe('ORDER_VALIDATION_ERROR');
      expect(error.metadata.severity).toBe(ErrorSeverity.MEDIUM);
    });
  });

  describe('Error Chaining', () => {
    it('should preserve original error in chain', () => {
      const originalError = new Error('Network timeout');
      const tradingError = new ExchangeConnectionError(
        'Failed to connect',
        { exchangeName: 'Bybit' },
        originalError,
      );

      expect(tradingError.originalError).toBe(originalError);
      expect(tradingError.originalError?.message).toBe('Network timeout');
    });

    it('should serialize error chain in toJSON', () => {
      const originalError = new Error('Root cause');
      const error = new ExitExecutionError(
        'Exit failed',
        { positionId: 'P1', exitAction: 'CLOSE', reason: 'Error' },
        originalError,
      );

      const json = error.toJSON();
      expect(json.originalError).toBe('Root cause');
    });
  });

  describe('Inheritance and instanceof', () => {
    it('all domain errors should inherit from TradingError', () => {
      const errors = [
        new EntryValidationError('msg', { reason: 'test' }),
        new ExchangeConnectionError('msg', { exchangeName: 'Bybit' }),
        new PositionNotFoundError('msg'),
        new OrderTimeoutError('msg', { orderId: 'O1', symbol: 'BTC', timeoutMs: 1000 }),
        new InsufficientBalanceError('msg', { required: 100, available: 50, currency: 'USDT' }),
      ];

      errors.forEach(error => {
        expect(error instanceof TradingError).toBe(true);
        expect(error instanceof Error).toBe(true);
      });
    });
  });

  describe('Severity Classification', () => {
    it('should classify CRITICAL errors correctly', () => {
      const error = new InsufficientBalanceError(
        'msg',
        { required: 100, available: 50, currency: 'USDT' },
      );

      expect(error.metadata.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.metadata.recoverable).toBe(false);
    });

    it('should classify HIGH severity errors', () => {
      const errors = [
        new ExitExecutionError('msg', {
          positionId: 'P1',
          exitAction: 'CLOSE',
          reason: 'test',
        }),
        new ExchangeConnectionError('msg', { exchangeName: 'Bybit' }),
        new PositionNotFoundError('msg'),
        new OrderTimeoutError('msg', { orderId: 'O1', symbol: 'BTC', timeoutMs: 1000 }),
      ];

      errors.forEach(error => {
        expect(error.metadata.severity).toBe(ErrorSeverity.HIGH);
        expect(error.metadata.recoverable).toBe(true);
      });
    });

    it('should classify MEDIUM severity errors', () => {
      const errors = [
        new EntryValidationError('msg', { reason: 'test' }),
        new ExchangeRateLimitError('msg'),
        new OrderSlippageError('msg', {
          orderId: 'O1',
          expectedPrice: 100,
          actualPrice: 102,
          slippagePercent: 2,
          maxSlippagePercent: 1,
        }),
      ];

      errors.forEach(error => {
        expect(error.metadata.severity).toBe(ErrorSeverity.MEDIUM);
        expect(error.metadata.recoverable).toBe(true);
      });
    });
  });
});
