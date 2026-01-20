/**
 * IPositionEventStore Interface
 * Defines the contract for position event storage
 */

import { AnyPositionEvent, PositionEventRecord } from './position.events';

export interface IPositionEventStore {
  /**
   * Append an event to the store
   * Immutable - events cannot be modified once stored
   */
  appendEvent(event: AnyPositionEvent): Promise<PositionEventRecord>;

  /**
   * Get all events for a position (in chronological order)
   */
  getPositionEvents(positionId: string): Promise<AnyPositionEvent[]>;

  /**
   * Get events for all positions in a symbol
   */
  getSymbolEvents(symbol: string): Promise<AnyPositionEvent[]>;

  /**
   * Get all events in store
   */
  getAllEvents(): Promise<AnyPositionEvent[]>;

  /**
   * Get events in a time range
   */
  getEventsByTimeRange(
    startTime: number,
    endTime: number
  ): Promise<AnyPositionEvent[]>;

  /**
   * Check if position exists in store
   */
  positionExists(positionId: string): Promise<boolean>;

  /**
   * Get event count for a position
   */
  getEventCount(positionId: string): Promise<number>;

  /**
   * Clear all events (CAUTION: for testing only)
   */
  clear(): Promise<void>;
}
