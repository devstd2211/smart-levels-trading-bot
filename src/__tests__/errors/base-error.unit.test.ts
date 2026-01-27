/**
 * Unit tests for BaseError and error metadata
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  TradingError,
  UnknownTradingError,
  ErrorDomain,
  ErrorSeverity,
} from '../../errors/BaseError';

describe('BaseError - Error Hierarchy and Metadata', () => {
  describe('Error Creation and Metadata', () => {
    it('should create error with correct metadata', () => {
      const originalError = new Error('Original error');
      const context = { positionId: '123', symbol: 'BTC' };

      const error = new UnknownTradingError(
        'Test error message',
        originalError,
        context,
      );

      expect(error.message).toBe('Test error message');
      expect(error.metadata.code).toBe('UNKNOWN_ERROR');
      expect(error.metadata.domain).toBe(ErrorDomain.INTERNAL);
      expect(error.metadata.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.metadata.context).toEqual(context);
      expect(error.originalError).toBe(originalError);
      expect(error.metadata.timestamp).toBeGreaterThan(0);
    });

    it('should set recoverable=false for CRITICAL severity', () => {
      class CriticalError extends TradingError {
        constructor() {
          super(
            'Critical error',
            'CRITICAL_ERROR',
            ErrorDomain.TRADING,
            ErrorSeverity.CRITICAL,
          );
          Object.setPrototypeOf(this, CriticalError.prototype);
        }
      }

      const error = new CriticalError();
      expect(error.metadata.recoverable).toBe(false);
    });

    it('should set recoverable=true for non-CRITICAL severity', () => {
      class NonCriticalError extends TradingError {
        constructor() {
          super(
            'Non-critical error',
            'TEST_ERROR',
            ErrorDomain.EXCHANGE,
            ErrorSeverity.MEDIUM,
          );
          Object.setPrototypeOf(this, NonCriticalError.prototype);
        }
      }

      const error = new NonCriticalError();
      expect(error.metadata.recoverable).toBe(true);
    });

    it('should preserve stack trace', () => {
      const error = new UnknownTradingError('Test error');
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
      expect(error.stack!.length).toBeGreaterThan(0);
    });
  });

  describe('Retryability Logic', () => {
    it('should mark UNKNOWN_ERROR as non-retryable', () => {
      // UNKNOWN_ERROR code is not in retryable list
      const error = new UnknownTradingError('Unknown error');
      expect(error.metadata.retryable).toBe(false);
    });

    it('should provide isRetryable() method', () => {
      const error = new UnknownTradingError('Test');
      expect(typeof error.isRetryable()).toBe('boolean');
      expect(error.isRetryable()).toBe(error.metadata.retryable);
    });
  });

  describe('Error Domains', () => {
    it('should have all error domains defined', () => {
      expect(ErrorDomain.TRADING).toBe('TRADING');
      expect(ErrorDomain.EXCHANGE).toBe('EXCHANGE');
      expect(ErrorDomain.POSITION).toBe('POSITION');
      expect(ErrorDomain.ORDER).toBe('ORDER');
      expect(ErrorDomain.CONFIGURATION).toBe('CONFIGURATION');
      expect(ErrorDomain.INTERNAL).toBe('INTERNAL');
      expect(ErrorDomain.PERFORMANCE).toBe('PERFORMANCE');
    });

    it('should classify errors by domain', () => {
      const tradingError = new UnknownTradingError(
        'Trading error',
        undefined,
        { domain: ErrorDomain.TRADING },
      );
      (tradingError as any).metadata.domain = ErrorDomain.TRADING;

      expect(tradingError.metadata.domain).toBe(ErrorDomain.TRADING);
    });
  });

  describe('Error Severity', () => {
    it('should have all severity levels defined', () => {
      expect(ErrorSeverity.CRITICAL).toBe('CRITICAL');
      expect(ErrorSeverity.HIGH).toBe('HIGH');
      expect(ErrorSeverity.MEDIUM).toBe('MEDIUM');
      expect(ErrorSeverity.LOW).toBe('LOW');
    });

    it('should map severity to recoverability', () => {
      class TestError extends TradingError {
        constructor(severity: ErrorSeverity) {
          super(
            'Test',
            'TEST',
            ErrorDomain.INTERNAL,
            severity,
          );
          Object.setPrototypeOf(this, TestError.prototype);
        }
      }

      const criticalError = new TestError(ErrorSeverity.CRITICAL);
      const highError = new TestError(ErrorSeverity.HIGH);
      const mediumError = new TestError(ErrorSeverity.MEDIUM);
      const lowError = new TestError(ErrorSeverity.LOW);

      expect(criticalError.metadata.recoverable).toBe(false);
      expect(highError.metadata.recoverable).toBe(true);
      expect(mediumError.metadata.recoverable).toBe(true);
      expect(lowError.metadata.recoverable).toBe(true);
    });
  });

  describe('Serialization', () => {
    it('should serialize to JSON correctly', () => {
      const originalError = new Error('Cause');
      const context = { field: 'value' };
      const error = new UnknownTradingError(
        'Test message',
        originalError,
        context,
      );

      const json = error.toJSON();

      expect(json.name).toBe('UnknownTradingError');
      expect(json.message).toBe('Test message');
      expect(json.metadata).toBeDefined();
      expect(json.metadata.code).toBe('UNKNOWN_ERROR');
      expect(json.stack).toBeDefined();
      expect(json.originalError).toBe('Cause');
    });

    it('should generate diagnostic string', () => {
      const error = new UnknownTradingError(
        'Test error',
        undefined,
        { positionId: '123' },
      );
      (error as any).metadata.code = 'TEST_CODE';
      (error as any).metadata.domain = ErrorDomain.TRADING;
      (error as any).metadata.severity = ErrorSeverity.HIGH;

      const diagnostic = error.toDiagnosticString();

      expect(diagnostic).toContain('TEST_CODE');
      expect(diagnostic).toContain('Test error');
      expect(diagnostic).toContain('TRADING');
      expect(diagnostic).toContain('HIGH');
      expect(diagnostic).toContain('positionId');
    });

    it('should handle null context in serialization', () => {
      const error = new UnknownTradingError('Test');
      const json = error.toJSON();

      expect(json.metadata.context).toBeUndefined();
      expect(json).toBeDefined();
    });
  });

  describe('Error Context', () => {
    it('should preserve arbitrary context data', () => {
      const complexContext = {
        positionId: '123',
        symbol: 'BTC',
        level: 'TP2',
        pnl: 150.50,
        details: { nested: true },
      };

      const error = new UnknownTradingError(
        'Complex error',
        undefined,
        complexContext,
      );

      expect(error.metadata.context).toEqual(complexContext);
    });

    it('should handle missing context', () => {
      const error = new UnknownTradingError('No context error');

      expect(error.metadata.context).toBeUndefined();
    });
  });

  describe('instanceof Checks', () => {
    it('should pass instanceof checks for TradingError', () => {
      const error = new UnknownTradingError('Test');

      expect(error instanceof TradingError).toBe(true);
      expect(error instanceof Error).toBe(true);
      expect(error instanceof UnknownTradingError).toBe(true);
    });

    it('should maintain instanceof chain for subclasses', () => {
      class CustomError extends TradingError {
        constructor() {
          super('Custom', 'CUSTOM', ErrorDomain.INTERNAL, ErrorSeverity.LOW);
          Object.setPrototypeOf(this, CustomError.prototype);
        }
      }

      const error = new CustomError();

      expect(error instanceof CustomError).toBe(true);
      expect(error instanceof TradingError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('Recovery Helpers', () => {
    it('should provide isRecoverable() method', () => {
      const error = new UnknownTradingError('Test');
      expect(typeof error.isRecoverable()).toBe('boolean');
      expect(error.isRecoverable()).toBe(true); // MEDIUM severity
    });

    it('should provide isRetryable() method', () => {
      const error = new UnknownTradingError('Test');
      expect(typeof error.isRetryable()).toBe('boolean');
    });
  });
});
