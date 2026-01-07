/**
 * Event Deduplication Service
 * Generic event deduplication with cache cleanup
 *
 * Responsibilities:
 * - Track processed events to prevent duplicates
 * - Cleanup expired events from cache
 * - Support configurable cache size and TTL
 */

import { TIME_UNITS, INTEGER_MULTIPLIERS } from '../constants';
import { LoggerService } from '../types';

/**
 * Event Deduplication Service
 * Tracks processed events to prevent handling duplicates
 * Useful for WebSocket events where duplicates can occur
 */
export class EventDeduplicationService {
  private processedEvents = new Map<string, number>(); // eventKey → timestamp
  private readonly cacheSize: number;
  private readonly cacheTtlMs: number;

  constructor(
    cacheSize: number = INTEGER_MULTIPLIERS.ONE_HUNDRED,
    cacheTtlMs: number = TIME_UNITS.MINUTE, // 1 minute TTL
    private readonly logger?: LoggerService,
  ) {
    this.cacheSize = cacheSize;
    this.cacheTtlMs = cacheTtlMs;
  }

  /**
   * Check if event is duplicate
   * @param eventType - Type of event (e.g., 'TP', 'SL', 'TRAILING')
   * @param eventId - Unique event identifier (orderId, etc.)
   * @param timestamp - Event timestamp (for TTL-based cleanup)
   * @returns true if event was already processed, false if new
   */
  public isDuplicate(eventType: string, eventId: string, timestamp: number): boolean {
    const eventKey = `${eventType}_${eventId}_${timestamp}`;

    // Check if event already processed
    if (this.processedEvents.has(eventKey)) {
      this.logger?.debug('Duplicate event ignored', { eventKey });
      return true;
    }

    // Store event with current time for TTL-based cleanup
    this.processedEvents.set(eventKey, Date.now());

    // Cleanup old events if cache exceeds size limit
    if (this.processedEvents.size > this.cacheSize) {
      this.cleanup();
    }

    return false;
  }

  /**
   * Clear all cached events
   */
  public clear(): void {
    this.processedEvents.clear();
  }

  /**
   * Cleanup expired events from cache
   * Removes events older than cacheTtlMs
   */
  private cleanup(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, time] of this.processedEvents.entries()) {
      if (now - time > this.cacheTtlMs) {
        this.processedEvents.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.logger?.debug('Cleaned up expired events from deduplication cache', {
        removedCount,
        cacheSize: this.processedEvents.size,
      });
    }
  }
}
