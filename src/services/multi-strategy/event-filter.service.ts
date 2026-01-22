/**
 * STRATEGY EVENT FILTER SERVICE
 *
 * Routes events to strategy-specific listeners.
 * Enables per-strategy event filtering and isolation.
 *
 * Responsibilities:
 * 1. Register strategy-specific event listeners
 * 2. Route events to correct strategy listeners
 * 3. Prevent cross-strategy event leakage
 * 4. Support multiple event types per strategy
 * 5. Handle listener cleanup
 *
 * Design Pattern: Event Filter + Observer
 * Phase: 10.3c (Event Tagging & Filtering)
 */

import { LoggerService } from '../../types';

export type StrategyEventCallback = (event: any) => void;

export class StrategyEventFilterService {
  private strategyListeners = new Map<
    string,  // strategyId
    Map<string, Set<StrategyEventCallback>>  // eventType -> callbacks
  >();

  constructor(private logger?: LoggerService) {}

  /**
   * Register listener for specific strategy + event type
   * @param strategyId - Strategy identifier
   * @param eventType - Event type to listen for
   * @param callback - Handler function
   */
  onStrategyEvent(
    strategyId: string,
    eventType: string,
    callback: StrategyEventCallback,
  ): void {
    if (!strategyId || !eventType) {
      if (this.logger) {
        this.logger.warn('[StrategyEventFilter] Invalid strategyId or eventType', {
          strategyId,
          eventType,
        });
      }
      return;
    }

    if (!this.strategyListeners.has(strategyId)) {
      this.strategyListeners.set(strategyId, new Map());
    }

    const strategyEvents = this.strategyListeners.get(strategyId)!;
    if (!strategyEvents.has(eventType)) {
      strategyEvents.set(eventType, new Set());
    }

    strategyEvents.get(eventType)!.add(callback);

    if (this.logger) {
      this.logger.debug('[StrategyEventFilter] Registered listener', {
        strategyId,
        eventType,
        callbackCount: strategyEvents.get(eventType)!.size,
      });
    }
  }

  /**
   * Remove strategy listener
   * @param strategyId - Strategy identifier
   * @param eventType - Event type
   * @param callback - Handler to remove
   */
  offStrategyEvent(
    strategyId: string,
    eventType: string,
    callback: StrategyEventCallback,
  ): void {
    const strategyEvents = this.strategyListeners.get(strategyId);
    if (!strategyEvents) {
      return;
    }

    const callbacks = strategyEvents.get(eventType);
    if (callbacks) {
      callbacks.delete(callback);

      // Clean up empty structures
      if (callbacks.size === 0) {
        strategyEvents.delete(eventType);
      }
      if (strategyEvents.size === 0) {
        this.strategyListeners.delete(strategyId);
      }
    }

    if (this.logger) {
      this.logger.debug('[StrategyEventFilter] Unregistered listener', {
        strategyId,
        eventType,
      });
    }
  }

  /**
   * Route event to strategy-specific listeners
   * @param event - Event with strategyId field
   */
  routeStrategyEvent(event: any): void {
    if (!event) {
      return;
    }

    // Only route events with strategyId (backward compatibility)
    if (!event.strategyId) {
      return;
    }

    const strategyEvents = this.strategyListeners.get(event.strategyId);
    if (!strategyEvents) {
      // No listeners registered for this strategy
      return;
    }

    const callbacks = strategyEvents.get(event.type);
    if (!callbacks || callbacks.size === 0) {
      // No listeners for this event type
      return;
    }

    // Execute all callbacks for this event
    callbacks.forEach(cb => {
      try {
        cb(event);
      } catch (error) {
        if (this.logger) {
          this.logger.error('[StrategyEventFilter] Error in event handler', {
            strategyId: event.strategyId,
            eventType: event.type,
            error: String(error),
          });
        }
      }
    });
  }

  /**
   * Route event to all strategy listeners (broadcast)
   * @param event - Event to broadcast
   */
  broadcastStrategyEvent(event: any): void {
    if (!event) {
      return;
    }

    // Broadcast to all strategies that have listeners
    for (const [strategyId, strategyEvents] of this.strategyListeners) {
      const callbacks = strategyEvents.get(event.type);
      if (callbacks && callbacks.size > 0) {
        callbacks.forEach(cb => {
          try {
            cb({ ...event, targetStrategyId: strategyId });
          } catch (error) {
            if (this.logger) {
              this.logger.error('[StrategyEventFilter] Error in broadcast handler', {
                strategyId,
                eventType: event.type,
                error: String(error),
              });
            }
          }
        });
      }
    }
  }

  /**
   * Clear all listeners for strategy
   * @param strategyId - Strategy identifier
   */
  clearStrategyListeners(strategyId: string): void {
    const had = this.strategyListeners.has(strategyId);
    this.strategyListeners.delete(strategyId);

    if (had && this.logger) {
      this.logger.debug('[StrategyEventFilter] Cleared listeners', {
        strategyId,
      });
    }
  }

  /**
   * Clear all listeners for all strategies
   */
  clearAllListeners(): void {
    this.strategyListeners.clear();
    if (this.logger) {
      this.logger.debug('[StrategyEventFilter] Cleared all listeners');
    }
  }

  /**
   * Get listener count for strategy + event type
   */
  getListenerCount(strategyId: string, eventType?: string): number {
    const strategyEvents = this.strategyListeners.get(strategyId);
    if (!strategyEvents) {
      return 0;
    }

    if (eventType) {
      return strategyEvents.get(eventType)?.size ?? 0;
    }

    // Total listeners for strategy
    let total = 0;
    for (const callbacks of strategyEvents.values()) {
      total += callbacks.size;
    }
    return total;
  }

  /**
   * Get all registered strategies
   */
  getStrategies(): string[] {
    return Array.from(this.strategyListeners.keys());
  }

  /**
   * Get all event types for strategy
   */
  getEventTypes(strategyId: string): string[] {
    const strategyEvents = this.strategyListeners.get(strategyId);
    if (!strategyEvents) {
      return [];
    }
    return Array.from(strategyEvents.keys());
  }

  /**
   * Get statistics about registered listeners
   */
  getStatistics(): {
    totalStrategies: number;
    totalEventTypes: number;
    totalListeners: number;
    listenersByStrategy: Record<string, { total: number; byType: Record<string, number> }>;
  } {
    let totalEventTypes = 0;
    let totalListeners = 0;
    const listenersByStrategy: Record<
      string,
      { total: number; byType: Record<string, number> }
    > = {};

    for (const [strategyId, strategyEvents] of this.strategyListeners) {
      let strategyTotal = 0;
      const byType: Record<string, number> = {};

      for (const [eventType, callbacks] of strategyEvents) {
        const count = callbacks.size;
        byType[eventType] = count;
        strategyTotal += count;
        totalEventTypes = Math.max(totalEventTypes, Object.keys(byType).length);
      }

      listenersByStrategy[strategyId] = {
        total: strategyTotal,
        byType,
      };
      totalListeners += strategyTotal;
    }

    return {
      totalStrategies: this.strategyListeners.size,
      totalEventTypes,
      totalListeners,
      listenersByStrategy,
    };
  }
}
