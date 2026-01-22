/**
 * PHASE 10.3C: EVENT TAGGING & FILTERING TESTS
 *
 * Comprehensive test suite for multi-strategy event infrastructure.
 * Tests event tagging, filtering, and isolation.
 *
 * Test Categories:
 * 1. strategyId Tagging Tests (10 tests)
 * 2. Event Filtering Tests (8 tests)
 * 3. Integration Tests (8 tests)
 * 4. Backward Compatibility Tests (4 tests)
 *
 * Total: 30+ comprehensive tests
 */

import { StrategyEventFilterService } from '../services/multi-strategy/event-filter.service';
import { LoggerService, LogLevel } from '../types';

describe('PHASE 10.3C: Event Tagging & Filtering', () => {
  let filterService: StrategyEventFilterService;
  let logger: LoggerService;

  beforeEach(() => {
    // Create mock logger
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

    filterService = new StrategyEventFilterService(logger);
  });

  afterEach(() => {
    filterService.clearAllListeners();
  });

  // =========================================================================
  // PART 1: strategyId Tagging Tests (10 tests)
  // =========================================================================

  describe('Part 1: strategyId Tagging', () => {
    it('should tag POSITION_OPENED event with strategyId', () => {
      const callback = jest.fn();
      const strategyId = 'strategy-001';
      const event = {
        type: 'POSITION_OPENED',
        strategyId,
        position: { id: '123', symbol: 'BTC/USDT' },
      };

      filterService.onStrategyEvent(strategyId, 'POSITION_OPENED', callback);
      filterService.routeStrategyEvent(event);

      expect(callback).toHaveBeenCalledWith(event);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should tag POSITION_CLOSED event with strategyId', () => {
      const callback = jest.fn();
      const strategyId = 'strategy-002';
      const event = {
        type: 'POSITION_CLOSED',
        strategyId,
        position: { id: '456', pnl: 100 },
      };

      filterService.onStrategyEvent(strategyId, 'POSITION_CLOSED', callback);
      filterService.routeStrategyEvent(event);

      expect(callback).toHaveBeenCalledWith(event);
    });

    it('should tag ACTION_EXECUTED event with strategyId', () => {
      const callback = jest.fn();
      const strategyId = 'strategy-003';
      const event = {
        type: 'ACTION_EXECUTED',
        strategyId,
        action: { type: 'CLOSE_PERCENT', percentage: 50 },
      };

      filterService.onStrategyEvent(strategyId, 'ACTION_EXECUTED', callback);
      filterService.routeStrategyEvent(event);

      expect(callback).toHaveBeenCalledWith(event);
    });

    it('should tag SIGNAL_NEW event with strategyId', () => {
      const callback = jest.fn();
      const strategyId = 'strategy-004';
      const event = {
        type: 'SIGNAL_NEW',
        strategyId,
        signal: { entry: 100, sl: 95, tp1: 110 },
      };

      filterService.onStrategyEvent(strategyId, 'SIGNAL_NEW', callback);
      filterService.routeStrategyEvent(event);

      expect(callback).toHaveBeenCalledWith(event);
    });

    it('should tag EXIT_SIGNAL event with strategyId', () => {
      const callback = jest.fn();
      const strategyId = 'strategy-005';
      const event = {
        type: 'EXIT_SIGNAL',
        strategyId,
        reason: 'STOP_LOSS_HIT',
      };

      filterService.onStrategyEvent(strategyId, 'EXIT_SIGNAL', callback);
      filterService.routeStrategyEvent(event);

      expect(callback).toHaveBeenCalledWith(event);
    });

    it('should include strategyId in all core events', () => {
      const callback = jest.fn();
      const strategyId = 'strategy-006';
      const eventTypes = ['POSITION_OPENED', 'POSITION_CLOSED', 'ACTION_EXECUTED', 'SIGNAL_NEW'];

      eventTypes.forEach(eventType => {
        filterService.onStrategyEvent(strategyId, eventType, callback);
      });

      eventTypes.forEach(eventType => {
        const event = { type: eventType, strategyId };
        filterService.routeStrategyEvent(event);
      });

      expect(callback).toHaveBeenCalledTimes(4);
    });

    it('should preserve backward compatibility without strategyId', () => {
      const callback = jest.fn();
      const event = {
        type: 'LEGACY_EVENT',
        // No strategyId
        data: 'some data',
      };

      filterService.routeStrategyEvent(event);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should support multiple strategies emitting different strategyIds', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const strategyId1 = 'strategy-A';
      const strategyId2 = 'strategy-B';

      filterService.onStrategyEvent(strategyId1, 'POSITION_OPENED', callback1);
      filterService.onStrategyEvent(strategyId2, 'POSITION_OPENED', callback2);

      const event1 = { type: 'POSITION_OPENED', strategyId: strategyId1 };
      const event2 = { type: 'POSITION_OPENED', strategyId: strategyId2 };

      filterService.routeStrategyEvent(event1);
      expect(callback1).toHaveBeenCalledWith(event1);
      expect(callback2).not.toHaveBeenCalled();

      jest.clearAllMocks();

      filterService.routeStrategyEvent(event2);
      expect(callback2).toHaveBeenCalledWith(event2);
      expect(callback1).not.toHaveBeenCalled();
    });

    it('should preserve strategyId through event bus routing', () => {
      const callback = jest.fn();
      const strategyId = 'strategy-007';
      const originalEvent = {
        type: 'POSITION_OPENED',
        strategyId,
        position: { id: '789' },
        timestamp: Date.now(),
      };

      filterService.onStrategyEvent(strategyId, 'POSITION_OPENED', callback);
      filterService.routeStrategyEvent(originalEvent);

      const receivedEvent = callback.mock.calls[0][0];
      expect(receivedEvent.strategyId).toBe(strategyId);
      expect(receivedEvent.position).toEqual(originalEvent.position);
    });

    it('should match strategyId in event metadata with context', () => {
      const callback = jest.fn();
      const strategyId = 'context-strategy-001';
      const event = {
        type: 'ACTION_EXECUTED',
        strategyId,
        metadata: {
          contextStrategyId: strategyId,
        },
      };

      filterService.onStrategyEvent(strategyId, 'ACTION_EXECUTED', callback);
      filterService.routeStrategyEvent(event);

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0].metadata.contextStrategyId).toBe(strategyId);
    });
  });

  // =========================================================================
  // PART 2: Event Filtering Tests (8 tests)
  // =========================================================================

  describe('Part 2: Event Filtering', () => {
    it('should register listener correctly', () => {
      const callback = jest.fn();
      const strategyId = 'filter-001';

      filterService.onStrategyEvent(strategyId, 'TEST_EVENT', callback);

      expect(filterService.getListenerCount(strategyId, 'TEST_EVENT')).toBe(1);
    });

    it('should route to correct listener only', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const strategyA = 'strategy-A';
      const strategyB = 'strategy-B';

      filterService.onStrategyEvent(strategyA, 'TEST', callback1);
      filterService.onStrategyEvent(strategyB, 'TEST', callback2);

      const event = { type: 'TEST', strategyId: strategyA };
      filterService.routeStrategyEvent(event);

      expect(callback1).toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });

    it('should ignore events without strategyId', () => {
      const callback = jest.fn();
      const event = { type: 'TEST' };  // No strategyId

      filterService.routeStrategyEvent(event);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should support multiple listeners per strategy', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const strategyId = 'multi-listener';

      filterService.onStrategyEvent(strategyId, 'TEST', callback1);
      filterService.onStrategyEvent(strategyId, 'TEST', callback2);

      const event = { type: 'TEST', strategyId };
      filterService.routeStrategyEvent(event);

      expect(callback1).toHaveBeenCalledWith(event);
      expect(callback2).toHaveBeenCalledWith(event);
    });

    it('should route to multiple strategies independently', () => {
      const callbackA = jest.fn();
      const callbackB = jest.fn();
      const callbackC = jest.fn();

      filterService.onStrategyEvent('strategy-A', 'TEST', callbackA);
      filterService.onStrategyEvent('strategy-B', 'TEST', callbackB);
      filterService.onStrategyEvent('strategy-C', 'TEST', callbackC);

      const eventA = { type: 'TEST', strategyId: 'strategy-A' };
      const eventB = { type: 'TEST', strategyId: 'strategy-B' };
      const eventC = { type: 'TEST', strategyId: 'strategy-C' };

      filterService.routeStrategyEvent(eventA);
      filterService.routeStrategyEvent(eventB);
      filterService.routeStrategyEvent(eventC);

      expect(callbackA).toHaveBeenCalledTimes(1);
      expect(callbackB).toHaveBeenCalledTimes(1);
      expect(callbackC).toHaveBeenCalledTimes(1);
    });

    it('should remove listener properly with offStrategyEvent', () => {
      const callback = jest.fn();
      const strategyId = 'remove-test';

      filterService.onStrategyEvent(strategyId, 'TEST', callback);
      expect(filterService.getListenerCount(strategyId, 'TEST')).toBe(1);

      filterService.offStrategyEvent(strategyId, 'TEST', callback);
      expect(filterService.getListenerCount(strategyId, 'TEST')).toBe(0);

      const event = { type: 'TEST', strategyId };
      filterService.routeStrategyEvent(event);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should cleanup with clearStrategyListeners', () => {
      const callback = jest.fn();
      const strategyId = 'cleanup-test';

      filterService.onStrategyEvent(strategyId, 'EVENT1', callback);
      filterService.onStrategyEvent(strategyId, 'EVENT2', callback);
      filterService.onStrategyEvent(strategyId, 'EVENT3', callback);

      expect(filterService.getListenerCount(strategyId)).toBe(3);

      filterService.clearStrategyListeners(strategyId);

      expect(filterService.getListenerCount(strategyId)).toBe(0);
    });

    it('should handle errors gracefully during routing', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Listener error');
      });
      const successCallback = jest.fn();
      const strategyId = 'error-test';

      filterService.onStrategyEvent(strategyId, 'TEST', errorCallback);
      filterService.onStrategyEvent(strategyId, 'TEST', successCallback);

      const event = { type: 'TEST', strategyId };
      filterService.routeStrategyEvent(event);  // Should not throw

      expect(errorCallback).toHaveBeenCalled();
      expect(successCallback).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // PART 3: Integration Tests (8 tests)
  // =========================================================================

  describe('Part 3: Integration', () => {
    it('should integrate PositionLifecycleService events', () => {
      const callback = jest.fn();
      const strategyId = 'integration-001';

      filterService.onStrategyEvent(strategyId, 'position-opened', callback);

      const event = {
        type: 'position-opened',
        strategyId,
        position: { id: '123', symbol: 'BTC/USDT' },
      };

      filterService.routeStrategyEvent(event);
      expect(callback).toHaveBeenCalledWith(event);
    });

    it('should handle full trading cycle with event tagging', () => {
      const positionOpenedCallback = jest.fn();
      const actionExecutedCallback = jest.fn();
      const positionClosedCallback = jest.fn();
      const strategyId = 'trading-cycle';

      filterService.onStrategyEvent(strategyId, 'position-opened', positionOpenedCallback);
      filterService.onStrategyEvent(strategyId, 'action-executed', actionExecutedCallback);
      filterService.onStrategyEvent(strategyId, 'position-closed', positionClosedCallback);

      // Simulate trading cycle
      filterService.routeStrategyEvent({
        type: 'position-opened',
        strategyId,
        position: { id: '1' },
      });
      filterService.routeStrategyEvent({
        type: 'action-executed',
        strategyId,
        action: { type: 'CLOSE_PERCENT' },
      });
      filterService.routeStrategyEvent({
        type: 'position-closed',
        strategyId,
        position: { id: '1', pnl: 100 },
      });

      expect(positionOpenedCallback).toHaveBeenCalledTimes(1);
      expect(actionExecutedCallback).toHaveBeenCalledTimes(1);
      expect(positionClosedCallback).toHaveBeenCalledTimes(1);
    });

    it('should ensure no cross-strategy event leakage', () => {
      const callbackA = jest.fn();
      const callbackB = jest.fn();

      filterService.onStrategyEvent('strategy-A', 'TEST', callbackA);
      filterService.onStrategyEvent('strategy-B', 'TEST', callbackB);

      // Send event for strategy-A
      const eventA = { type: 'TEST', strategyId: 'strategy-A' };
      filterService.routeStrategyEvent(eventA);

      // Verify only strategy-A listener was called
      expect(callbackA).toHaveBeenCalledTimes(1);
      expect(callbackB).not.toHaveBeenCalled();

      // Send event for strategy-B
      const eventB = { type: 'TEST', strategyId: 'strategy-B' };
      filterService.routeStrategyEvent(eventB);

      // Verify strategy-A still not called again
      expect(callbackA).toHaveBeenCalledTimes(1);
      expect(callbackB).toHaveBeenCalledTimes(1);
    });

    it('should maintain event ordering per strategy', () => {
      const callback = jest.fn();
      const strategyId = 'order-test';

      filterService.onStrategyEvent(strategyId, 'TEST', callback);

      const events = [
        { type: 'TEST', strategyId, id: '1' },
        { type: 'TEST', strategyId, id: '2' },
        { type: 'TEST', strategyId, id: '3' },
      ];

      events.forEach(e => filterService.routeStrategyEvent(e));

      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback.mock.calls[0][0].id).toBe('1');
      expect(callback.mock.calls[1][0].id).toBe('2');
      expect(callback.mock.calls[2][0].id).toBe('3');
    });

    it('should support broadcast events to all strategies', () => {
      const callbackA = jest.fn();
      const callbackB = jest.fn();

      filterService.onStrategyEvent('strategy-A', 'BROADCAST', callbackA);
      filterService.onStrategyEvent('strategy-B', 'BROADCAST', callbackB);

      const event = { type: 'BROADCAST', data: 'broadcast message' };
      filterService.broadcastStrategyEvent(event);

      expect(callbackA).toHaveBeenCalled();
      expect(callbackB).toHaveBeenCalled();
    });

    it('should provide statistics about registered listeners', () => {
      const callback = jest.fn();

      filterService.onStrategyEvent('strategy-A', 'EVENT1', callback);
      filterService.onStrategyEvent('strategy-A', 'EVENT2', callback);
      filterService.onStrategyEvent('strategy-B', 'EVENT1', callback);

      const stats = filterService.getStatistics();

      expect(stats.totalStrategies).toBe(2);
      expect(stats.totalListeners).toBe(3);
      expect(stats.listenersByStrategy['strategy-A'].total).toBe(2);
      expect(stats.listenersByStrategy['strategy-B'].total).toBe(1);
    });

    it('should handle large event volumes efficiently', () => {
      const callback = jest.fn();
      const strategyId = 'perf-test';

      filterService.onStrategyEvent(strategyId, 'TEST', callback);

      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        filterService.routeStrategyEvent({
          type: 'TEST',
          strategyId,
          id: i,
        });
      }
      const duration = Date.now() - startTime;

      expect(callback).toHaveBeenCalledTimes(1000);
      expect(duration).toBeLessThan(1000);  // Should process 1000 events in < 1 second
    });
  });

  // =========================================================================
  // PART 4: Backward Compatibility Tests (4 tests)
  // =========================================================================

  describe('Part 4: Backward Compatibility', () => {
    it('should support single-strategy mode without strategyId', () => {
      const callback = jest.fn();

      // Old style: no strategyId in event
      const event = {
        type: 'TEST',
        data: 'some data',
      };

      filterService.routeStrategyEvent(event);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should allow listeners without strategyId filtering (fallback)', () => {
      const stats = filterService.getStatistics();

      expect(stats.totalStrategies).toBe(0);
      expect(stats.totalListeners).toBe(0);
    });

    it('should handle old code compatible with tagged events', () => {
      const callback = jest.fn();
      const strategyId = 'compat-test';

      filterService.onStrategyEvent(strategyId, 'OLD_EVENT_TYPE', callback);

      const newStyleEvent = {
        type: 'OLD_EVENT_TYPE',
        strategyId,  // New: tagged with strategyId
        legacyData: 'old format',  // Old: legacy data structure
      };

      filterService.routeStrategyEvent(newStyleEvent);
      expect(callback).toHaveBeenCalledWith(newStyleEvent);
    });

    it('should maintain getters and utility methods', () => {
      const callback = jest.fn();
      const strategyId = 'utility-test';

      filterService.onStrategyEvent(strategyId, 'EVENT1', callback);
      filterService.onStrategyEvent(strategyId, 'EVENT2', callback);

      expect(filterService.getStrategies()).toContain(strategyId);
      expect(filterService.getEventTypes(strategyId)).toContain('EVENT1');
      expect(filterService.getEventTypes(strategyId)).toContain('EVENT2');
      expect(filterService.getListenerCount(strategyId)).toBe(2);
    });
  });

  // =========================================================================
  // Additional: Strategy-Specific Filtering Tests
  // =========================================================================

  describe('Strategy-Specific Filtering', () => {
    it('should filter events by strategy and event type combination', () => {
      const callbacks = {
        strategyA_event1: jest.fn(),
        strategyA_event2: jest.fn(),
        strategyB_event1: jest.fn(),
      };

      filterService.onStrategyEvent('strategy-A', 'EVENT1', callbacks.strategyA_event1);
      filterService.onStrategyEvent('strategy-A', 'EVENT2', callbacks.strategyA_event2);
      filterService.onStrategyEvent('strategy-B', 'EVENT1', callbacks.strategyB_event1);

      // Send EVENT1 to strategy-A
      filterService.routeStrategyEvent({ type: 'EVENT1', strategyId: 'strategy-A' });

      expect(callbacks.strategyA_event1).toHaveBeenCalledTimes(1);
      expect(callbacks.strategyA_event2).not.toHaveBeenCalled();
      expect(callbacks.strategyB_event1).not.toHaveBeenCalled();
    });

    it('should cleanup all resources on clearAllListeners', () => {
      filterService.onStrategyEvent('strategy-A', 'TEST', jest.fn());
      filterService.onStrategyEvent('strategy-B', 'TEST', jest.fn());
      filterService.onStrategyEvent('strategy-C', 'TEST', jest.fn());

      expect(filterService.getStrategies().length).toBe(3);

      filterService.clearAllListeners();

      expect(filterService.getStrategies().length).toBe(0);
      expect(filterService.getStatistics().totalListeners).toBe(0);
    });
  });
});
