/**
 * Filter & Strategy Comprehensive Tests (Phase 13.2)
 *
 * Real tests that verify:
 * - Signal filtering accuracy (not just "does it run")
 * - Event routing to correct strategies (with isolation checks)
 * - Error handling & recovery
 * - Performance under realistic conditions
 */

import { StrategyEventFilterService } from '../../services/multi-strategy/event-filter.service';
import { LoggerService } from '../../services/logger.service';
import { LogLevel } from '../../types';

class TestLogger extends LoggerService {
  constructor() {
    super(LogLevel.INFO, './logs', false);
  }
}

describe('StrategyEventFilterService - Real Scenario Tests', () => {
  let eventFilter: StrategyEventFilterService;
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
    eventFilter = new StrategyEventFilterService(logger);
  });

  describe('Event Isolation Between Strategies', () => {
    it('should NOT route strategy-a signal to strategy-b listener', () => {
      const listenerB = jest.fn();
      eventFilter.onStrategyEvent('strategy-b', 'SIGNAL_NEW', listenerB);

      const eventA = {
        type: 'SIGNAL_NEW',
        timestamp: Date.now(),
        data: { confidence: 75 },
        strategyId: 'strategy-a',
      };

      eventFilter.routeStrategyEvent(eventA);

      // CRITICAL: Strategy B should NOT receive Strategy A signal
      expect(listenerB).not.toHaveBeenCalled();
    });

    it('should route ONLY to matching strategy when multiple listeners exist', () => {
      const listenerA = jest.fn();
      const listenerB = jest.fn();
      const listenerA2 = jest.fn();

      eventFilter.onStrategyEvent('strategy-a', 'SIGNAL_NEW', listenerA);
      eventFilter.onStrategyEvent('strategy-b', 'SIGNAL_NEW', listenerB);
      eventFilter.onStrategyEvent('strategy-a', 'SIGNAL_NEW', listenerA2);

      const eventA = { type: 'SIGNAL_NEW', timestamp: Date.now(), data: {}, strategyId: 'strategy-a' };
      eventFilter.routeStrategyEvent(eventA);

      // Only strategy-a listeners should be called
      expect(listenerA).toHaveBeenCalledTimes(1);
      expect(listenerA2).toHaveBeenCalledTimes(1);
      expect(listenerB).not.toHaveBeenCalled();
    });

    it('should maintain complete isolation when switching between strategies', () => {
      const aSignalCount = { count: 0 };
      const bSignalCount = { count: 0 };

      const listenerA = jest.fn(() => { aSignalCount.count++; });
      const listenerB = jest.fn(() => { bSignalCount.count++; });

      eventFilter.onStrategyEvent('strategy-a', 'SIGNAL_NEW', listenerA);
      eventFilter.onStrategyEvent('strategy-b', 'SIGNAL_NEW', listenerB);

      // Send signals for both strategies in alternating pattern
      for (let i = 0; i < 10; i++) {
        eventFilter.routeStrategyEvent({
          type: 'SIGNAL_NEW',
          timestamp: Date.now(),
          data: {},
          strategyId: 'strategy-a',
        });
        eventFilter.routeStrategyEvent({
          type: 'SIGNAL_NEW',
          timestamp: Date.now(),
          data: {},
          strategyId: 'strategy-b',
        });
      }

      // Each should have received exactly 10, no spillover
      expect(aSignalCount.count).toBe(10);
      expect(bSignalCount.count).toBe(10);
      expect(listenerA).toHaveBeenCalledTimes(10);
      expect(listenerB).toHaveBeenCalledTimes(10);
    });
  });

  describe('Event Type Filtering', () => {
    it('should NOT call SIGNAL_NEW listener for POSITION_OPENED events', () => {
      const signalListener = jest.fn();
      const positionListener = jest.fn();

      eventFilter.onStrategyEvent('strategy-a', 'SIGNAL_NEW', signalListener);
      eventFilter.onStrategyEvent('strategy-a', 'POSITION_OPENED', positionListener);

      // Send POSITION_OPENED event
      eventFilter.routeStrategyEvent({
        type: 'POSITION_OPENED',
        timestamp: Date.now(),
        data: {},
        strategyId: 'strategy-a',
      });

      // SIGNAL_NEW listener should NOT be called
      expect(signalListener).not.toHaveBeenCalled();
      expect(positionListener).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple event types per strategy without mixing', () => {
      const signalListener = jest.fn();
      const positionListener = jest.fn();
      const closedListener = jest.fn();

      eventFilter.onStrategyEvent('strategy-a', 'SIGNAL_NEW', signalListener);
      eventFilter.onStrategyEvent('strategy-a', 'POSITION_OPENED', positionListener);
      eventFilter.onStrategyEvent('strategy-a', 'POSITION_CLOSED', closedListener);

      const signal = { type: 'SIGNAL_NEW', timestamp: Date.now(), data: {}, strategyId: 'strategy-a' };
      const opened = { type: 'POSITION_OPENED', timestamp: Date.now(), data: {}, strategyId: 'strategy-a' };
      const closed = { type: 'POSITION_CLOSED', timestamp: Date.now(), data: {}, strategyId: 'strategy-a' };

      eventFilter.routeStrategyEvent(signal);
      eventFilter.routeStrategyEvent(opened);
      eventFilter.routeStrategyEvent(closed);

      // Each listener called exactly once
      expect(signalListener).toHaveBeenCalledTimes(1);
      expect(positionListener).toHaveBeenCalledTimes(1);
      expect(closedListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('Broadcasting (System-Wide Events)', () => {
    it('should deliver broadcast to ALL strategies', () => {
      const listeners = [jest.fn(), jest.fn(), jest.fn()];
      const strategyIds = ['strategy-a', 'strategy-b', 'strategy-c'];

      strategyIds.forEach((id, idx) => {
        eventFilter.onStrategyEvent(id, 'POSITION_OPENED', listeners[idx]);
      });

      // Broadcast system event (no strategyId)
      eventFilter.broadcastStrategyEvent({
        type: 'POSITION_OPENED',
        timestamp: Date.now(),
        data: { event: 'system' },
      });

      // ALL listeners should receive broadcast
      listeners.forEach(listener => {
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({ data: { event: 'system' } })
        );
      });
    });

    it('should NOT call routed-strategy listener during broadcast with different strategyId', () => {
      const broadcastListener = jest.fn();
      const routedListener = jest.fn();

      eventFilter.onStrategyEvent('strategy-a', 'POSITION_OPENED', broadcastListener);
      eventFilter.onStrategyEvent('strategy-b', 'POSITION_OPENED', routedListener);

      // Broadcast to all (no strategyId)
      eventFilter.broadcastStrategyEvent({
        type: 'POSITION_OPENED',
        timestamp: Date.now(),
        data: {},
      });

      // Both get broadcast
      expect(broadcastListener).toHaveBeenCalled();
      expect(routedListener).toHaveBeenCalled();

      broadcastListener.mockClear();
      routedListener.mockClear();

      // Now route to strategy-b only
      eventFilter.routeStrategyEvent({
        type: 'POSITION_OPENED',
        timestamp: Date.now(),
        data: {},
        strategyId: 'strategy-b',
      });

      // Only strategy-b gets routed
      expect(routedListener).toHaveBeenCalledTimes(1);
      expect(broadcastListener).not.toHaveBeenCalled();
    });
  });

  describe('Listener Cleanup & Removal', () => {
    it('should completely remove listener after offStrategyEvent', () => {
      const listener = jest.fn();
      eventFilter.onStrategyEvent('strategy-a', 'SIGNAL_NEW', listener);

      // Fire event - should be called
      eventFilter.routeStrategyEvent({
        type: 'SIGNAL_NEW',
        timestamp: Date.now(),
        data: {},
        strategyId: 'strategy-a',
      });
      expect(listener).toHaveBeenCalledTimes(1);

      // Remove listener
      eventFilter.offStrategyEvent('strategy-a', 'SIGNAL_NEW', listener);

      // Fire again - should NOT be called
      eventFilter.routeStrategyEvent({
        type: 'SIGNAL_NEW',
        timestamp: Date.now(),
        data: {},
        strategyId: 'strategy-a',
      });
      expect(listener).toHaveBeenCalledTimes(1); // Still only 1
    });

    it('should not affect OTHER listeners when removing one', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      eventFilter.onStrategyEvent('strategy-a', 'SIGNAL_NEW', listener1);
      eventFilter.onStrategyEvent('strategy-a', 'SIGNAL_NEW', listener2);

      // Remove listener1
      eventFilter.offStrategyEvent('strategy-a', 'SIGNAL_NEW', listener1);

      // Fire event - only listener2 should get it
      eventFilter.routeStrategyEvent({
        type: 'SIGNAL_NEW',
        timestamp: Date.now(),
        data: {},
        strategyId: 'strategy-a',
      });

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should cleanup strategy completely when all listeners removed', () => {
      const listener = jest.fn();
      eventFilter.onStrategyEvent('strategy-a', 'SIGNAL_NEW', listener);

      const strategiesBefore = eventFilter.getStrategies();
      expect(strategiesBefore).toContain('strategy-a');

      // Clear the strategy
      eventFilter.clearStrategyListeners('strategy-a');

      const strategiesAfter = eventFilter.getStrategies();
      expect(strategiesAfter).not.toContain('strategy-a');
    });
  });

  describe('Statistics & Monitoring', () => {
    it('should accurately count listeners per strategy and event type', () => {
      eventFilter.onStrategyEvent('strategy-a', 'SIGNAL_NEW', jest.fn());
      eventFilter.onStrategyEvent('strategy-a', 'SIGNAL_NEW', jest.fn());
      eventFilter.onStrategyEvent('strategy-a', 'POSITION_OPENED', jest.fn());
      eventFilter.onStrategyEvent('strategy-b', 'SIGNAL_NEW', jest.fn());

      const countA = eventFilter.getListenerCount('strategy-a');
      const countASignal = eventFilter.getListenerCount('strategy-a', 'SIGNAL_NEW');
      const countAPosition = eventFilter.getListenerCount('strategy-a', 'POSITION_OPENED');
      const countB = eventFilter.getListenerCount('strategy-b');

      expect(countA).toBe(3);
      expect(countASignal).toBe(2);
      expect(countAPosition).toBe(1);
      expect(countB).toBe(1);
    });

    it('should provide accurate strategy listing', () => {
      eventFilter.onStrategyEvent('strategy-x', 'SIGNAL_NEW', jest.fn());
      eventFilter.onStrategyEvent('strategy-y', 'POSITION_OPENED', jest.fn());
      eventFilter.onStrategyEvent('strategy-z', 'SIGNAL_NEW', jest.fn());

      const strategies = eventFilter.getStrategies();

      expect(strategies).toHaveLength(3);
      expect(strategies).toContain('strategy-x');
      expect(strategies).toContain('strategy-y');
      expect(strategies).toContain('strategy-z');
    });

    it('should list event types per strategy', () => {
      eventFilter.onStrategyEvent('strategy-a', 'SIGNAL_NEW', jest.fn());
      eventFilter.onStrategyEvent('strategy-a', 'POSITION_OPENED', jest.fn());
      eventFilter.onStrategyEvent('strategy-a', 'POSITION_CLOSED', jest.fn());
      eventFilter.onStrategyEvent('strategy-a', 'SIGNAL_NEW', jest.fn()); // duplicate

      const eventTypes = eventFilter.getEventTypes('strategy-a');

      expect(eventTypes).toHaveLength(3);
      expect(eventTypes).toContain('SIGNAL_NEW');
      expect(eventTypes).toContain('POSITION_OPENED');
      expect(eventTypes).toContain('POSITION_CLOSED');
    });
  });

  describe('Error Handling & Resilience', () => {
    it('should NOT stop routing when one listener throws error', () => {
      const errorListener = jest.fn(() => {
        throw new Error('Intentional test error');
      });
      const normalListener = jest.fn();

      eventFilter.onStrategyEvent('strategy-a', 'SIGNAL_NEW', errorListener);
      eventFilter.onStrategyEvent('strategy-a', 'SIGNAL_NEW', normalListener);

      const event = { type: 'SIGNAL_NEW', timestamp: Date.now(), data: {}, strategyId: 'strategy-a' };

      // Should not throw
      expect(() => eventFilter.routeStrategyEvent(event)).not.toThrow();

      // Normal listener should still be called
      expect(normalListener).toHaveBeenCalledTimes(1);
    });

    it('should handle missing strategyId gracefully', () => {
      const listener = jest.fn();
      eventFilter.onStrategyEvent('strategy-a', 'SIGNAL_NEW', listener);

      // Event without strategyId - should not match
      const event = { type: 'SIGNAL_NEW', timestamp: Date.now(), data: {} };

      expect(() => eventFilter.routeStrategyEvent(event)).not.toThrow();
      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle invalid strategyId registration gracefully', () => {
      const listener = jest.fn();

      // These should not throw
      expect(() => {
        eventFilter.onStrategyEvent('', 'SIGNAL_NEW', listener);
      }).not.toThrow();

      expect(() => {
        eventFilter.onStrategyEvent('strategy-a', '', listener);
      }).not.toThrow();
    });
  });

  describe('High-Frequency Event Handling', () => {
    it('should handle rapid events without dropping any', () => {
      const listener = jest.fn();
      eventFilter.onStrategyEvent('strategy-a', 'SIGNAL_NEW', listener);

      // Fire 500 events rapidly
      for (let i = 0; i < 500; i++) {
        eventFilter.routeStrategyEvent({
          type: 'SIGNAL_NEW',
          timestamp: Date.now() + i,
          data: { index: i },
          strategyId: 'strategy-a',
        });
      }

      // All events should be delivered
      expect(listener).toHaveBeenCalledTimes(500);

      // Verify some events by checking call arguments
      expect(listener).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ data: { index: 0 } })
      );
      expect(listener).toHaveBeenNthCalledWith(
        500,
        expect.objectContaining({ data: { index: 499 } })
      );
    });

    it('should maintain order of events', () => {
      const events: number[] = [];
      const listener = jest.fn((event) => {
        events.push(event.data.index);
      });

      eventFilter.onStrategyEvent('strategy-a', 'SIGNAL_NEW', listener);

      // Fire 100 numbered events
      for (let i = 0; i < 100; i++) {
        eventFilter.routeStrategyEvent({
          type: 'SIGNAL_NEW',
          timestamp: Date.now(),
          data: { index: i },
          strategyId: 'strategy-a',
        });
      }

      // Events should be in order
      expect(events).toEqual(Array.from({ length: 100 }, (_, i) => i));
    });
  });
});
