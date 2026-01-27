/**
 * Unit tests for ErrorRegistry telemetry and classification
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ErrorRegistry } from '../../errors/ErrorRegistry';
import {
  OrderTimeoutError,
  EntryValidationError,
  ExchangeConnectionError,
  ExchangeRateLimitError,
  PositionNotFoundError,
} from '../../errors/DomainErrors';
import { ErrorDomain, ErrorSeverity } from '../../errors/BaseError';

describe('ErrorRegistry - Telemetry and Classification', () => {
  beforeEach(() => {
    ErrorRegistry.clear();
  });

  describe('Error Recording', () => {
    it('should record error occurrence', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      ErrorRegistry.record(error);

      const stats = ErrorRegistry.getStats();
      expect(stats.length).toBeGreaterThan(0);
      expect(stats[0].code).toBe('ORDER_TIMEOUT');
      expect(stats[0].count).toBe(1);
    });

    it('should increment count on repeated errors', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      ErrorRegistry.record(error);
      ErrorRegistry.record(error);
      ErrorRegistry.record(error);

      const stats = ErrorRegistry.getStats();
      expect(stats[0].count).toBe(3);
    });

    it('should track recovery attempts', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      ErrorRegistry.record(error, true, 100);
      ErrorRegistry.record(error, false);
      ErrorRegistry.record(error, true, 150);

      const stats = ErrorRegistry.getStats();
      expect(stats[0].count).toBe(3);
      expect(stats[0].recoveredCount).toBe(2);
      expect(stats[0].recoveryRate).toBe(2 / 3);
    });

    it('should calculate average recovery time', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      ErrorRegistry.record(error, true, 100);
      ErrorRegistry.record(error, true, 200);
      ErrorRegistry.record(error, true, 300);

      const stats = ErrorRegistry.getStats();
      expect(stats[0].averageRecoveryMs).toBe(200);
    });

    it('should track first and last occurrence', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      const before = Date.now();
      ErrorRegistry.record(error);
      const after = Date.now();

      const stats = ErrorRegistry.getStats();
      expect(stats[0].firstOccurrence).toBeGreaterThanOrEqual(before);
      expect(stats[0].firstOccurrence).toBeLessThanOrEqual(after);
      expect(stats[0].lastOccurrence).toBeGreaterThanOrEqual(before);
    });
  });

  describe('Error Classification', () => {
    it('should classify errors by code', () => {
      const timeoutError = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const validationError = new EntryValidationError('Validation failed', {
        reason: 'test',
      });

      ErrorRegistry.record(timeoutError);
      ErrorRegistry.record(validationError);

      const stats = ErrorRegistry.getStats();
      expect(stats.length).toBe(2);
      expect(stats.find(s => s.code === 'ORDER_TIMEOUT')).toBeDefined();
      expect(stats.find(s => s.code === 'ENTRY_VALIDATION_ERROR')).toBeDefined();
    });

    it('should classify errors by domain', () => {
      const orderError = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const tradingError = new EntryValidationError('Validation failed', {
        reason: 'test',
      });

      ErrorRegistry.record(orderError);
      ErrorRegistry.record(tradingError);

      const orderStats = ErrorRegistry.getStatsByDomain(ErrorDomain.ORDER);
      const tradingStats = ErrorRegistry.getStatsByDomain(ErrorDomain.TRADING);

      expect(orderStats.length).toBe(1);
      expect(tradingStats.length).toBe(1);
    });

    it('should classify errors by severity', () => {
      const highError = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const mediumError = new EntryValidationError('Validation failed', {
        reason: 'test',
      });

      ErrorRegistry.record(highError);
      ErrorRegistry.record(mediumError);

      const highStats = ErrorRegistry.getStatsBySeverity(ErrorSeverity.HIGH);
      const mediumStats = ErrorRegistry.getStatsBySeverity(ErrorSeverity.MEDIUM);

      expect(highStats.length).toBeGreaterThan(0);
      expect(mediumStats.length).toBeGreaterThan(0);
    });
  });

  describe('Statistics and Querying', () => {
    it('should get stats by code', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      ErrorRegistry.record(error);
      ErrorRegistry.record(error);

      const stats = ErrorRegistry.getStatsByCode('ORDER_TIMEOUT');
      expect(stats).toBeDefined();
      expect(stats?.count).toBe(2);
    });

    it('should return undefined for non-existent code', () => {
      const stats = ErrorRegistry.getStatsByCode('NON_EXISTENT');

      expect(stats).toBeUndefined();
    });

    it('should generate summary', () => {
      const orderError = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const tradingError = new EntryValidationError('Validation failed', {
        reason: 'test',
      });

      ErrorRegistry.record(orderError, true);
      ErrorRegistry.record(tradingError, false);
      ErrorRegistry.record(orderError, false);

      const summary = ErrorRegistry.getSummary();

      expect(summary.totalErrors).toBe(3);
      expect(summary.uniqueCodes).toBe(2);
      expect(summary.recoveryRate).toBe(1 / 3);
    });

    it('should group by domain in summary', () => {
      const orderError = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const tradingError = new EntryValidationError('Validation failed', {
        reason: 'test',
      });

      ErrorRegistry.record(orderError);
      ErrorRegistry.record(tradingError);
      ErrorRegistry.record(tradingError);

      const summary = ErrorRegistry.getSummary();

      expect(summary.byDomain[ErrorDomain.ORDER]).toBe(1);
      expect(summary.byDomain[ErrorDomain.TRADING]).toBe(2);
    });

    it('should group by severity in summary', () => {
      const highError = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const mediumError = new EntryValidationError('Validation failed', {
        reason: 'test',
      });

      ErrorRegistry.record(highError);
      ErrorRegistry.record(mediumError);

      const summary = ErrorRegistry.getSummary();

      expect(summary.bySeverity[ErrorSeverity.HIGH]).toBe(1);
      expect(summary.bySeverity[ErrorSeverity.MEDIUM]).toBe(1);
    });

    it('should provide top errors', () => {
      const errorA = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const errorB = new EntryValidationError('Validation failed', {
        reason: 'test',
      });

      // A occurs 5 times, B occurs 3 times
      for (let i = 0; i < 5; i++) ErrorRegistry.record(errorA);
      for (let i = 0; i < 3; i++) ErrorRegistry.record(errorB);

      const summary = ErrorRegistry.getSummary();
      expect(summary.topErrors[0].code).toBe('ORDER_TIMEOUT');
      expect(summary.topErrors[0].count).toBe(5);
      expect(summary.topErrors[1].count).toBe(3);
    });

    it('should calculate average recovery time in summary', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      ErrorRegistry.record(error, true, 100);
      ErrorRegistry.record(error, true, 200);

      const summary = ErrorRegistry.getSummary();
      expect(summary.averageRecoveryMs).toBe(150);
    });
  });

  describe('Health Checks', () => {
    it('should report healthy when no errors', () => {
      expect(ErrorRegistry.isHealthy()).toBe(true);
    });

    it('should report healthy above recovery threshold', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      // 8 recovered out of 10 = 80% recovery rate
      for (let i = 0; i < 8; i++) {
        ErrorRegistry.record(error, true);
      }
      for (let i = 0; i < 2; i++) {
        ErrorRegistry.record(error, false);
      }

      expect(ErrorRegistry.isHealthy(0.75)).toBe(true);
    });

    it('should report unhealthy below recovery threshold', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      // 2 recovered out of 10 = 20% recovery rate
      for (let i = 0; i < 2; i++) {
        ErrorRegistry.record(error, true);
      }
      for (let i = 0; i < 8; i++) {
        ErrorRegistry.record(error, false);
      }

      expect(ErrorRegistry.isHealthy(0.5)).toBe(false);
    });

    it('should identify critical errors', () => {
      const goodError = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const badError = new EntryValidationError('Validation failed', {
        reason: 'test',
      });

      // Good error: 90% recovery
      for (let i = 0; i < 9; i++) {
        ErrorRegistry.record(goodError, true);
      }
      ErrorRegistry.record(goodError, false);

      // Bad error: 10% recovery
      for (let i = 0; i < 9; i++) {
        ErrorRegistry.record(badError, false);
      }
      ErrorRegistry.record(badError, true);

      const critical = ErrorRegistry.getCriticalErrors();
      const hasBadError = critical.some(s => s.code === 'ENTRY_VALIDATION_ERROR');

      expect(hasBadError).toBe(true);
    });
  });

  describe('Trend Analysis', () => {
    it('should get recent errors within time window', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      ErrorRegistry.record(error);

      const recent = ErrorRegistry.getRecentErrors(1000);
      expect(recent.length).toBeGreaterThan(0);
    });

    it('should exclude old errors from recent window', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      ErrorRegistry.record(error);

      // Window of 1ms should not include the error recorded now
      const recent = ErrorRegistry.getRecentErrors(0);
      expect(recent.length).toBe(0);
    });
  });

  describe('Memory Management', () => {
    it('should maintain bounded memory with MAX_TRACKED_ERRORS', () => {
      // Create more errors than MAX_TRACKED_ERRORS
      for (let i = 0; i < 1100; i++) {
        const error = new OrderTimeoutError(`timeout-${i}`, {
          orderId: `O${i}`,
          symbol: 'BTC',
          timeoutMs: 1000,
        });
        // Hack to make each error unique
        (error as any).metadata.code = `ERROR_${i}`;
        ErrorRegistry.record(error);
      }

      const stats = ErrorRegistry.getStats();
      // Should be bounded by MAX_TRACKED_ERRORS (1000)
      expect(stats.length).toBeLessThanOrEqual(1010); // Some tolerance
    });

    it('should clear all tracked errors', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      ErrorRegistry.record(error);
      expect(ErrorRegistry.getStats().length).toBeGreaterThan(0);

      ErrorRegistry.clear();
      expect(ErrorRegistry.getStats().length).toBe(0);
    });
  });

  describe('Reporting', () => {
    it('should generate diagnostic report', () => {
      const orderError = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const tradingError = new EntryValidationError('Validation failed', {
        reason: 'test',
      });

      ErrorRegistry.record(orderError);
      ErrorRegistry.record(tradingError);
      ErrorRegistry.record(tradingError);

      const report = ErrorRegistry.generateReport();

      expect(report).toContain('ERROR REGISTRY REPORT');
      expect(report).toContain('Total Errors: 3');
      expect(report).toContain('Recovery Rate:');
      expect(report).toContain('ORDER_TIMEOUT');
      expect(report).toContain('ENTRY_VALIDATION_ERROR');
    });

    it('should include critical errors in report', () => {
      const error = new EntryValidationError('Validation failed', {
        reason: 'test',
      });

      // 20% recovery rate = critical
      for (let i = 0; i < 4; i++) {
        ErrorRegistry.record(error, false);
      }
      ErrorRegistry.record(error, true);

      const report = ErrorRegistry.generateReport();

      expect(report).toContain('Critical Errors');
      expect(report).toContain('ENTRY_VALIDATION_ERROR');
    });
  });

  describe('Edge Cases', () => {
    it('should handle summary for empty registry', () => {
      const summary = ErrorRegistry.getSummary();

      expect(summary.totalErrors).toBe(0);
      expect(summary.uniqueCodes).toBe(0);
      expect(summary.recoveryRate).toBe(0);
    });

    it('should handle recovery rate calculation', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      ErrorRegistry.record(error, true);
      ErrorRegistry.record(error, true);
      ErrorRegistry.record(error, false);

      const stats = ErrorRegistry.getStats();
      expect(stats[0].recoveryRate).toBe(2 / 3);
    });

    it('should get raw map', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });

      ErrorRegistry.record(error);

      const raw = ErrorRegistry.getRaw();
      expect(raw instanceof Map).toBe(true);
      expect(raw.size).toBeGreaterThan(0);
    });
  });
});
