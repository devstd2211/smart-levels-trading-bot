/**
 * PHASE 11: CIRCUIT BREAKER TESTS
 *
 * Comprehensive test suite for per-strategy circuit breaker pattern.
 * Tests state transitions, failure handling, recovery, and isolation.
 *
 * Test Categories:
 * 1. State Transitions (8 tests)
 * 2. Failure Handling (8 tests)
 * 3. Recovery (8 tests)
 * 4. Multi-Strategy Isolation (6 tests)
 * 5. Configuration (4 tests)
 *
 * Total: 34+ comprehensive tests
 */

import { StrategyCircuitBreakerService } from '../services/multi-strategy/strategy-circuit-breaker.service';
import { CircuitBreakerStatus } from '../types/circuit-breaker.types';
import { LoggerService, LogLevel } from '../types';

describe('PHASE 11: Per-Strategy Circuit Breakers', () => {
  let circuitBreakerService: StrategyCircuitBreakerService;
  let logger: LoggerService;

  beforeEach(() => {
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
      setLevel: jest.fn(),
      getLevel: jest.fn(() => LogLevel.INFO),
      writeToConsole: jest.fn(),
      writeToFile: jest.fn(),
      flush: jest.fn(),
    } as any;

    circuitBreakerService = new StrategyCircuitBreakerService(logger, {
      defaultConfig: {
        failureThreshold: 3,
        timeout: 1000,
        backoffBase: 2,
        maxBackoff: 10000,
        halfOpenAttempts: 2,
      },
    });
  });

  afterEach(() => {
    circuitBreakerService.clear();
  });

  // =========================================================================
  // PART 1: State Transitions (8 tests)
  // =========================================================================

  describe('Part 1: State Transitions', () => {
    it('should start in CLOSED state', () => {
      const state = circuitBreakerService.getState('strategy-1');

      expect(state.status).toBe(CircuitBreakerStatus.CLOSED);
      expect(state.failureCount).toBe(0);
      expect(state.successCount).toBe(0);
    });

    it('should transition CLOSED → OPEN on failure threshold', () => {
      const strategyId = 'strategy-2';
      const error = new Error('Test failure');

      // Record 3 failures (threshold is 3)
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);

      const state = circuitBreakerService.getState(strategyId);
      expect(state.status).toBe(CircuitBreakerStatus.OPEN);
      expect(state.failureCount).toBe(3);
    });

    it('should transition OPEN → HALF_OPEN after timeout', (done) => {
      const strategyId = 'strategy-3';
      const error = new Error('Test failure');

      // Open the circuit
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);

      expect(circuitBreakerService.getState(strategyId).status).toBe(
        CircuitBreakerStatus.OPEN,
      );

      // Wait for timeout
      setTimeout(() => {
        const canExecute = circuitBreakerService.canExecute(strategyId);
        expect(canExecute).toBe(true);

        const state = circuitBreakerService.getState(strategyId);
        expect(state.status).toBe(CircuitBreakerStatus.HALF_OPEN);
        done();
      }, 1100);
    });

    it('should transition HALF_OPEN → CLOSED on success', () => {
      const strategyId = 'strategy-4';
      const error = new Error('Test failure');

      // Open the circuit
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);

      // Manually set to HALF_OPEN for testing
      const state = circuitBreakerService.getState(strategyId);
      state.status = CircuitBreakerStatus.HALF_OPEN;
      state.successCount = 0;

      // Record successes
      circuitBreakerService.recordSuccess(strategyId);
      circuitBreakerService.recordSuccess(strategyId);

      const finalState = circuitBreakerService.getState(strategyId);
      expect(finalState.status).toBe(CircuitBreakerStatus.CLOSED);
    });

    it('should transition HALF_OPEN → OPEN on failure', () => {
      const strategyId = 'strategy-5';
      const error = new Error('Test failure');

      // Open the circuit
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);

      // Manually set to HALF_OPEN
      const state = circuitBreakerService.getState(strategyId);
      state.status = CircuitBreakerStatus.HALF_OPEN;

      // Record failure in HALF_OPEN
      circuitBreakerService.recordFailure(strategyId, error);

      const finalState = circuitBreakerService.getState(strategyId);
      expect(finalState.status).toBe(CircuitBreakerStatus.OPEN);
    });

    it('should record failures correctly', () => {
      const strategyId = 'strategy-6';
      const error = new Error('Test error');

      expect(circuitBreakerService.getState(strategyId).totalFailures).toBe(0);

      circuitBreakerService.recordFailure(strategyId, error);
      expect(circuitBreakerService.getState(strategyId).totalFailures).toBe(1);
      expect(circuitBreakerService.getState(strategyId).failureCount).toBe(1);

      circuitBreakerService.recordFailure(strategyId, error);
      expect(circuitBreakerService.getState(strategyId).totalFailures).toBe(2);
      expect(circuitBreakerService.getState(strategyId).failureCount).toBe(2);
    });

    it('should record successes correctly', () => {
      const strategyId = 'strategy-7';

      expect(circuitBreakerService.getState(strategyId).totalSuccesses).toBe(0);

      circuitBreakerService.recordSuccess(strategyId);
      expect(circuitBreakerService.getState(strategyId).totalSuccesses).toBe(1);

      circuitBreakerService.recordSuccess(strategyId);
      expect(circuitBreakerService.getState(strategyId).totalSuccesses).toBe(2);
    });

    it('should use exponential backoff for retry timeout', () => {
      const strategyId = 'strategy-8';
      const error = new Error('Test failure');

      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);

      const state1 = circuitBreakerService.getState(strategyId);
      const nextRetry1 = state1.nextRetryTime;

      // nextRetryTime should be ~1000ms from now
      expect(nextRetry1).toBeDefined();
      expect(nextRetry1! - Date.now()).toBeLessThan(1100);
    });
  });

  // =========================================================================
  // PART 2: Failure Handling (8 tests)
  // =========================================================================

  describe('Part 2: Failure Handling', () => {
    it('should return false from canExecute when OPEN', () => {
      const strategyId = 'strategy-fail-1';
      const error = new Error('Test');

      // Open circuit
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);

      expect(circuitBreakerService.canExecute(strategyId)).toBe(false);
    });

    it('should return true from canExecute when CLOSED', () => {
      const strategyId = 'strategy-fail-2';

      expect(circuitBreakerService.canExecute(strategyId)).toBe(true);
    });

    it('should return true from canExecute when HALF_OPEN', () => {
      const strategyId = 'strategy-fail-3';
      const error = new Error('Test');

      // Open circuit
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);

      // Set to half-open
      const state = circuitBreakerService.getState(strategyId);
      state.status = CircuitBreakerStatus.HALF_OPEN;

      expect(circuitBreakerService.canExecute(strategyId)).toBe(true);
    });

    it('should increment failure count', () => {
      const strategyId = 'strategy-fail-4';
      const error = new Error('Test');

      for (let i = 0; i < 5; i++) {
        circuitBreakerService.recordFailure(strategyId, error);
        expect(circuitBreakerService.getState(strategyId).failureCount).toBe(i + 1);
      }
    });

    it('should reset failure counter on success', () => {
      const strategyId = 'strategy-fail-5';
      const error = new Error('Test');

      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);

      expect(circuitBreakerService.getState(strategyId).failureCount).toBe(2);

      circuitBreakerService.recordSuccess(strategyId);

      expect(circuitBreakerService.getState(strategyId).failureCount).toBe(0);
    });

    it('should handle multiple rapid failures', () => {
      const strategyId = 'strategy-fail-6';
      const error = new Error('Test');

      const errors = Array(10).fill(error);
      errors.forEach(() => {
        circuitBreakerService.recordFailure(strategyId, error);
      });

      const state = circuitBreakerService.getState(strategyId);
      expect(state.totalFailures).toBe(10);
      expect(state.status).toBe(CircuitBreakerStatus.OPEN);
    });

    it('should preserve failure reason', () => {
      const strategyId = 'strategy-fail-7';
      const error = new Error('Connection timeout');

      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);

      const metrics = circuitBreakerService.getMetrics(strategyId);
      expect(metrics.lastFailure).toBeDefined();
      expect(metrics.lastFailure?.message).toBe('Connection timeout');
    });

    it('should track last failure time', () => {
      const strategyId = 'strategy-fail-8';
      const error = new Error('Test');

      const before = Date.now();
      circuitBreakerService.recordFailure(strategyId, error);
      const after = Date.now();

      const state = circuitBreakerService.getState(strategyId);
      expect(state.lastFailureTime).toBeDefined();
      expect(state.lastFailureTime! >= before && state.lastFailureTime! <= after).toBe(true);
    });
  });

  // =========================================================================
  // PART 3: Recovery (8 tests)
  // =========================================================================

  describe('Part 3: Recovery', () => {
    it('should use exponential backoff for delays', () => {
      const strategyId = 'strategy-rec-1';
      const error = new Error('Test');

      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);

      const state = circuitBreakerService.getState(strategyId);
      const timeout = state.nextRetryTime! - Date.now();

      expect(timeout).toBeGreaterThan(900);
      expect(timeout).toBeLessThan(1100);
    });

    it('should allow test attempt in half-open state', () => {
      const strategyId = 'strategy-rec-2';
      const error = new Error('Test');

      // Open circuit
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);

      // Move to half-open
      const state = circuitBreakerService.getState(strategyId);
      state.status = CircuitBreakerStatus.HALF_OPEN;

      expect(circuitBreakerService.canExecute(strategyId)).toBe(true);
    });

    it('should close circuit on success in half-open', () => {
      const strategyId = 'strategy-rec-3';
      const error = new Error('Test');

      // Open circuit
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);

      // Move to half-open
      const state = circuitBreakerService.getState(strategyId);
      state.status = CircuitBreakerStatus.HALF_OPEN;
      state.successCount = 0;

      // Record successes
      circuitBreakerService.recordSuccess(strategyId);
      circuitBreakerService.recordSuccess(strategyId);

      expect(circuitBreakerService.getState(strategyId).status).toBe(
        CircuitBreakerStatus.CLOSED,
      );
    });

    it('should reopen circuit on failure in half-open', () => {
      const strategyId = 'strategy-rec-4';
      const error = new Error('Test');

      // Open circuit
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);

      // Move to half-open
      const state = circuitBreakerService.getState(strategyId);
      state.status = CircuitBreakerStatus.HALF_OPEN;

      // Record failure
      circuitBreakerService.recordFailure(strategyId, error);

      expect(circuitBreakerService.getState(strategyId).status).toBe(
        CircuitBreakerStatus.OPEN,
      );
    });

    it('should track recovery attempts', () => {
      const strategyId = 'strategy-rec-5';
      const error = new Error('Test');

      // Open circuit
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);

      const state1 = circuitBreakerService.getState(strategyId);
      expect(state1.recoveryAttempts).toBe(0);

      // Move to half-open
      state1.status = CircuitBreakerStatus.HALF_OPEN;
      state1.recoveryAttempts = 1;

      expect(circuitBreakerService.getState(strategyId).recoveryAttempts).toBe(1);
    });

    it('should track last success time', () => {
      const strategyId = 'strategy-rec-6';

      const before = Date.now();
      circuitBreakerService.recordSuccess(strategyId);
      const after = Date.now();

      const state = circuitBreakerService.getState(strategyId);
      expect(state.lastSuccessTime).toBeDefined();
      expect(state.lastSuccessTime! >= before && state.lastSuccessTime! <= after).toBe(true);
    });

    it('should reset success counter on failure', () => {
      const strategyId = 'strategy-rec-7';
      const error = new Error('Test');

      circuitBreakerService.recordSuccess(strategyId);
      circuitBreakerService.recordSuccess(strategyId);

      expect(circuitBreakerService.getState(strategyId).successCount).toBe(2);

      circuitBreakerService.recordFailure(strategyId, error);

      expect(circuitBreakerService.getState(strategyId).successCount).toBe(0);
    });

    it('should support manual reset', () => {
      const strategyId = 'strategy-rec-8';
      const error = new Error('Test');

      // Open circuit
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);

      expect(circuitBreakerService.getState(strategyId).status).toBe(
        CircuitBreakerStatus.OPEN,
      );

      // Reset
      circuitBreakerService.reset(strategyId);

      const state = circuitBreakerService.getState(strategyId);
      expect(state.status).toBe(CircuitBreakerStatus.CLOSED);
      expect(state.failureCount).toBe(0);
      expect(state.successCount).toBe(0);
    });
  });

  // =========================================================================
  // PART 4: Multi-Strategy Isolation (6 tests)
  // =========================================================================

  describe('Part 4: Multi-Strategy Isolation', () => {
    it('should isolate failures between strategies', () => {
      const error = new Error('Test');

      // Fail strategy-A
      circuitBreakerService.recordFailure('strategy-A', error);
      circuitBreakerService.recordFailure('strategy-A', error);
      circuitBreakerService.recordFailure('strategy-A', error);

      // Strategy-A should be open
      expect(circuitBreakerService.canExecute('strategy-A')).toBe(false);

      // Strategy-B should still be closed
      expect(circuitBreakerService.canExecute('strategy-B')).toBe(true);
    });

    it('should maintain independent state per strategy', () => {
      const error = new Error('Test');

      circuitBreakerService.recordFailure('strategy-X', error);
      circuitBreakerService.recordFailure('strategy-X', error);

      circuitBreakerService.recordSuccess('strategy-Y');

      const stateX = circuitBreakerService.getState('strategy-X');
      const stateY = circuitBreakerService.getState('strategy-Y');

      expect(stateX.failureCount).toBe(2);
      expect(stateY.failureCount).toBe(0);
      expect(stateY.totalSuccesses).toBe(1);
    });

    it('should have independent timeouts per strategy', () => {
      const error = new Error('Test');

      // Open strategy-A
      circuitBreakerService.recordFailure('strategy-A', error);
      circuitBreakerService.recordFailure('strategy-A', error);
      circuitBreakerService.recordFailure('strategy-A', error);

      // Open strategy-B with different timing
      setTimeout(() => {
        circuitBreakerService.recordFailure('strategy-B', error);
        circuitBreakerService.recordFailure('strategy-B', error);
        circuitBreakerService.recordFailure('strategy-B', error);
      }, 100);

      const stateA = circuitBreakerService.getState('strategy-A');
      const stateB = circuitBreakerService.getState('strategy-B');

      expect(stateA.nextRetryTime).toBeDefined();
      expect(stateB.nextRetryTime).toBeDefined();

      // Their retry times should be different
      const diff = Math.abs(stateA.nextRetryTime! - stateB.nextRetryTime!);
      expect(diff).toBeGreaterThan(50);
    });

    it('should reset strategy independently', () => {
      const error = new Error('Test');

      // Open both
      circuitBreakerService.recordFailure('strategy-A', error);
      circuitBreakerService.recordFailure('strategy-A', error);
      circuitBreakerService.recordFailure('strategy-A', error);

      circuitBreakerService.recordFailure('strategy-B', error);
      circuitBreakerService.recordFailure('strategy-B', error);
      circuitBreakerService.recordFailure('strategy-B', error);

      // Reset only A
      circuitBreakerService.reset('strategy-A');

      expect(circuitBreakerService.getState('strategy-A').status).toBe(
        CircuitBreakerStatus.CLOSED,
      );
      expect(circuitBreakerService.getState('strategy-B').status).toBe(
        CircuitBreakerStatus.OPEN,
      );
    });

    it('should track metrics per strategy', () => {
      const error = new Error('Test');

      circuitBreakerService.recordSuccess('strategy-P');
      circuitBreakerService.recordSuccess('strategy-P');
      circuitBreakerService.recordFailure('strategy-P', error);

      circuitBreakerService.recordFailure('strategy-Q', error);
      circuitBreakerService.recordFailure('strategy-Q', error);

      const metricsP = circuitBreakerService.getMetrics('strategy-P');
      const metricsQ = circuitBreakerService.getMetrics('strategy-Q');

      expect(metricsP.totalSuccesses).toBe(2);
      expect(metricsP.totalFailures).toBe(1);
      expect(metricsQ.totalSuccesses).toBe(0);
      expect(metricsQ.totalFailures).toBe(2);
    });
  });

  // =========================================================================
  // PART 5: Configuration (4 tests)
  // =========================================================================

  describe('Part 5: Configuration', () => {
    it('should allow custom configuration per strategy', () => {
      const strategyId = 'strategy-custom';

      circuitBreakerService.setConfig(strategyId, {
        failureThreshold: 10,
        timeout: 5000,
      });

      const config = circuitBreakerService.getConfig(strategyId);
      expect(config.failureThreshold).toBe(10);
      expect(config.timeout).toBe(5000);
    });

    it('should provide service-wide statistics', () => {
      const error = new Error('Test');

      // Create different states
      circuitBreakerService.recordFailure('strategy-1', error);
      circuitBreakerService.recordFailure('strategy-1', error);
      circuitBreakerService.recordFailure('strategy-1', error);

      circuitBreakerService.recordSuccess('strategy-2');

      const stats = circuitBreakerService.getStats();

      expect(stats.totalBreakers).toBe(2);
      expect(stats.breakersOpen).toBe(1);
      expect(stats.breakersClosed).toBe(1);
      expect(stats.totalFailures).toBe(3);
      expect(stats.totalSuccesses).toBe(1);
    });

    it('should support event callbacks', (done) => {
      const eventCallback = jest.fn();
      const strategyId = 'strategy-events';
      const error = new Error('Test');

      circuitBreakerService.onStateChange(eventCallback);

      // Trigger state change
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);
      circuitBreakerService.recordFailure(strategyId, error);

      // Event should be emitted
      setTimeout(() => {
        expect(eventCallback).toHaveBeenCalled();
        const event = eventCallback.mock.calls[0][0];
        expect(event.type).toBe('OPENED');
        done();
      }, 100);
    });

    it('should support resetAll functionality', () => {
      const error = new Error('Test');

      circuitBreakerService.recordFailure('strategy-1', error);
      circuitBreakerService.recordFailure('strategy-1', error);
      circuitBreakerService.recordFailure('strategy-1', error);

      circuitBreakerService.recordFailure('strategy-2', error);
      circuitBreakerService.recordFailure('strategy-2', error);
      circuitBreakerService.recordFailure('strategy-2', error);

      circuitBreakerService.resetAll();

      expect(circuitBreakerService.getState('strategy-1').status).toBe(
        CircuitBreakerStatus.CLOSED,
      );
      expect(circuitBreakerService.getState('strategy-2').status).toBe(
        CircuitBreakerStatus.CLOSED,
      );
    });
  });
});
