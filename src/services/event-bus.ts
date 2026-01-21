/**
 * BotEventBus - Centralized Event Bus
 *
 * Unified event handling abstraction that replaces 3 separate event handler methods.
 * Provides:
 * - Type-safe event publishing
 * - Consistent error handling and recovery
 * - Performance metrics tracking
 * - Middleware support for cross-cutting concerns
 */

import { EventEmitter } from 'events';
import { LoggerService } from '../types';

/**
 * Standard bot event structure
 */
export interface BotEvent {
  type: string;
  timestamp: number;
  data: any;
  strategyId?: string; // [Phase 10.2] Optional: which strategy does this event belong to?
}

/**
 * Event handler function signature
 */
export type EventHandler = (data: any) => Promise<void> | void;

/**
 * Performance metrics for event processing
 */
interface EventMetrics {
  eventType: string;
  duration: number;
  status: 'success' | 'failure';
  timestamp: number;
  error?: string;
}

/**
 * Centralized event bus for all bot events
 *
 * Replaces scattered event handling in:
 * - setupWebSocketHandlers() (lines 271-500)
 * - setupMonitorHandlers() (lines 502-603)
 * - setupPublicWebSocketHandlers() (lines 604-793)
 *
 * @example
 * // Old: scattered event handlers
 * this.webSocketManager.on('positionUpdate', ...);
 * this.positionMonitor.on('stopLossHit', ...);
 * this.publicWebSocket.on('candleClosed', ...);
 *
 * // New: unified event bus
 * this.eventBus.subscribe('positionUpdate', handler);
 * this.eventBus.subscribe('stopLossHit', handler);
 * this.eventBus.subscribe('candleClosed', handler);
 */
export class BotEventBus extends EventEmitter {
  private metrics: Map<string, EventMetrics[]> = new Map();
  private readonly MAX_METRICS_PER_EVENT = 100;

  constructor(private logger: LoggerService) {
    super();
    this.setMaxListeners(50); // Increase from default 10 for multiple handlers
  }

  /**
   * Subscribe to an event with automatic error handling
   *
   * @param eventType - Type of event to subscribe to
   * @param handler - Handler function to execute when event fires
   * @returns Unsubscribe function (call to remove listener)
   *
   * @example
   * const unsubscribe = bus.subscribe('positionClosed', async (data) => {
   *   console.log('Position closed at', data.price);
   * });
   * unsubscribe(); // Remove listener
   */
  subscribe(eventType: string, handler: EventHandler): () => void {
    const wrappedHandler = async (data: any) => {
      const startTime = performance.now();

      try {
        // Handle both sync and async handlers
        const result = handler(data);
        if (result instanceof Promise) {
          await result;
        }

        const duration = performance.now() - startTime;
        this.recordMetric(eventType, duration, 'success');

        this.logger.debug(`✅ Event handler executed`, {
          event: eventType,
          duration: `${duration.toFixed(2)}ms`,
        });
      } catch (error) {
        const duration = performance.now() - startTime;
        this.recordMetric(eventType, duration, 'failure', error);

        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`❌ Event handler failed`, {
          event: eventType,
          duration: `${duration.toFixed(2)}ms`,
          error: errorMessage,
        });

        // Publish error event for error recovery
        this.publishSync({
          type: 'eventBusError',
          timestamp: Date.now(),
          data: {
            originalEvent: eventType,
            error: errorMessage,
            errorTime: duration,
          },
        });
      }
    };

    // Register listener with EventEmitter
    this.on(eventType, wrappedHandler);

    // Return unsubscribe function
    return () => {
      this.off(eventType, wrappedHandler);
      this.logger.debug(`Event listener removed`, { event: eventType });
    };
  }

  /**
   * Publish event asynchronously
   *
   * @param event - Event to publish
   *
   * @example
   * await bus.publish({
   *   type: 'positionOpened',
   *   timestamp: Date.now(),
   *   data: { position, entryPrice: 1.5 }
   * });
   */
  async publish(event: BotEvent): Promise<void> {
    this.logger.debug(`📢 Publishing event`, {
      type: event.type,
      timestamp: new Date(event.timestamp).toISOString(),
    });

    // Emit asynchronously
    this.emit(event.type, event.data);

    // Give event loop a chance to process
    await new Promise((resolve) => setImmediate(resolve));
  }

  /**
   * Publish event synchronously (for performance-critical paths)
   *
   * @param event - Event to publish
   */
  publishSync(event: BotEvent): void {
    this.logger.debug(`📢 Publishing event (sync)`, {
      type: event.type,
      timestamp: new Date(event.timestamp).toISOString(),
    });

    this.emit(event.type, event.data);
  }

  /**
   * Record performance metrics for event processing
   *
   * @internal
   */
  private recordMetric(eventType: string, duration: number, status: 'success' | 'failure', error?: unknown): void {
    const metric: EventMetrics = {
      eventType,
      duration,
      status,
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : undefined,
    };

    // Initialize metrics array if needed
    if (!this.metrics.has(eventType)) {
      this.metrics.set(eventType, []);
    }

    const eventMetrics = this.metrics.get(eventType)!;
    eventMetrics.push(metric);

    // Keep only last N metrics per event type (avoid memory leak)
    if (eventMetrics.length > this.MAX_METRICS_PER_EVENT) {
      eventMetrics.shift();
    }
  }

  /**
   * Get performance metrics for all events
   *
   * Useful for monitoring event bus health and performance.
   *
   * @returns Metrics summary with event counts, error rates, and durations
   */
  getMetrics(): Record<string, any> {
    const summary: Record<string, any> = {};

    for (const [eventType, metrics] of this.metrics.entries()) {
      if (metrics.length === 0) continue;

      const successes = metrics.filter((m) => m.status === 'success').length;
      const failures = metrics.filter((m) => m.status === 'failure').length;
      const durations = metrics.map((m) => m.duration);
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

      summary[eventType] = {
        total: metrics.length,
        successes,
        failures,
        errorRate: ((failures / metrics.length) * 100).toFixed(2) + '%',
        avgDuration: avgDuration.toFixed(2) + 'ms',
        minDuration: Math.min(...durations).toFixed(2) + 'ms',
        maxDuration: Math.max(...durations).toFixed(2) + 'ms',
      };
    }

    return summary;
  }

  /**
   * Clear all listeners and metrics
   *
   * Useful for cleanup during tests or shutdown.
   */
  clear(): void {
    this.removeAllListeners();
    this.metrics.clear();
    this.logger.info('Event bus cleared - all listeners removed');
  }

  /**
   * Get listener count for specific event
   *
   * @param eventType - Event type to check
   * @returns Number of listeners
   */
  getListenerCount(eventType: string): number {
    return this.listenerCount(eventType);
  }
}
