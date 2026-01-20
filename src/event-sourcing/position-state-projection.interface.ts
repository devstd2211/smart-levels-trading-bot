/**
 * IPositionStateProjection Interface
 * Rebuilds position state from event stream
 */

import { Position } from '../types/core';
import { AnyPositionEvent } from './position.events';

export interface IPositionStateProjection {
  /**
   * Rebuild current position state from all events for a positionId
   * Returns null if position doesn't exist or was never opened
   */
  projectPosition(positionId: string): Promise<Position | null>;

  /**
   * Rebuild position state at a specific point in time
   * Useful for temporal queries and debugging
   */
  projectPositionAtTime(positionId: string, timestamp: number): Promise<Position | null>;

  /**
   * Rebuild all positions for a symbol
   * Returns map of positionId -> Position state
   */
  projectSymbolPositions(symbol: string): Promise<Map<string, Position>>;

  /**
   * Apply events to a position and return updated state
   * Used internally and for testing
   */
  applyEvents(initialPosition: Position, events: AnyPositionEvent[]): Position;

  /**
   * Get position status based on events
   * Returns: 'OPEN' | 'CLOSED' | 'INVALID'
   */
  getPositionStatus(positionId: string): Promise<'OPEN' | 'CLOSED' | 'INVALID'>;

  /**
   * Validate event sequence for a position
   * Checks for logical inconsistencies
   */
  validateEventSequence(positionId: string): Promise<{ valid: boolean; errors?: string[] }>;
}
