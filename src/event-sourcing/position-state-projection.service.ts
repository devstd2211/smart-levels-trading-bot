/**
 * PositionStateProjection Service
 * Rebuilds position state from event stream
 *
 * Features:
 * - Deterministic state reconstruction from events
 * - Temporal queries (state at time T)
 * - Event validation
 */

import { Position, TakeProfit } from '../types/core';
import {
  AnyPositionEvent,
  PositionEventType,
  PositionOpenedEvent,
  TakeProfitHitEvent,
  StopLossHitEvent,
  StopLossUpdatedEvent,
  StopLossToBreakEvenEvent,
  TrailingStopActivatedEvent,
  PartialClosedEvent,
  PositionClosedEvent,
} from './position.events';
import { IPositionStateProjection } from './position-state-projection.interface';
import { IPositionEventStore } from './position-event-store.interface';

export class PositionStateProjection implements IPositionStateProjection {
  constructor(private eventStore: IPositionEventStore) {}

  /**
   * Rebuild current position from events
   */
  async projectPosition(positionId: string): Promise<Position | null> {
    const events = await this.eventStore.getPositionEvents(positionId);

    if (events.length === 0) {
      return null;
    }

    // Find the POSITION_OPENED event (required to exist)
    const openedEvent = events.find((e) => e.type === PositionEventType.POSITION_OPENED);
    if (!openedEvent || openedEvent.type !== PositionEventType.POSITION_OPENED) {
      return null;
    }

    // Create initial position from opened event
    const position = this.initializePositionFromEvent(openedEvent as PositionOpenedEvent);

    // Apply all remaining events in order
    return this.applyEvents(position, events);
  }

  /**
   * Rebuild position state at specific time
   */
  async projectPositionAtTime(positionId: string, timestamp: number): Promise<Position | null> {
    const events = await this.eventStore.getPositionEvents(positionId);

    if (events.length === 0) {
      return null;
    }

    // Filter events up to timestamp
    const eventsUntilTime = events.filter((e) => e.timestamp <= timestamp);

    if (eventsUntilTime.length === 0) {
      return null;
    }

    // Find the POSITION_OPENED event
    const openedEvent = eventsUntilTime.find((e) => e.type === PositionEventType.POSITION_OPENED);
    if (!openedEvent || openedEvent.type !== PositionEventType.POSITION_OPENED) {
      return null;
    }

    // Create initial position
    const position = this.initializePositionFromEvent(openedEvent as PositionOpenedEvent);

    // Apply events
    return this.applyEvents(position, eventsUntilTime);
  }

  /**
   * Rebuild all positions for symbol
   */
  async projectSymbolPositions(symbol: string): Promise<Map<string, Position>> {
    const symbolEvents = await this.eventStore.getSymbolEvents(symbol);
    const positions = new Map<string, Position>();

    // Group events by position ID
    const eventsByPosition = new Map<string, AnyPositionEvent[]>();
    for (const event of symbolEvents) {
      if (!eventsByPosition.has(event.positionId)) {
        eventsByPosition.set(event.positionId, []);
      }
      eventsByPosition.get(event.positionId)!.push(event);
    }

    // Rebuild each position
    for (const [positionId, positionEvents] of eventsByPosition) {
      const position = await this.projectPosition(positionId);
      if (position) {
        positions.set(positionId, position);
      }
    }

    return positions;
  }

  /**
   * Apply events to position (core logic)
   */
  applyEvents(initialPosition: Position, events: AnyPositionEvent[]): Position {
    let position = { ...initialPosition };

    for (const event of events) {
      // Skip the POSITION_OPENED event (already applied in initialization)
      if (event.type === PositionEventType.POSITION_OPENED) {
        continue;
      }

      position = this.applyEvent(position, event);
    }

    return position;
  }

  /**
   * Apply single event to position
   */
  private applyEvent(position: Position, event: AnyPositionEvent): Position {
    switch (event.type) {
      case PositionEventType.TAKE_PROFIT_HIT:
        return this.applyTakeProfitHit(position, event as TakeProfitHitEvent);

      case PositionEventType.STOP_LOSS_HIT:
        return this.applyStopLossHit(position, event as StopLossHitEvent);

      case PositionEventType.STOP_LOSS_UPDATED:
        return this.applyStopLossUpdated(position, event as StopLossUpdatedEvent);

      case PositionEventType.STOP_LOSS_TO_BREAKEVEN:
        return this.applyStopLossToBreakeven(position, event as StopLossToBreakEvenEvent);

      case PositionEventType.TRAILING_STOP_ACTIVATED:
        return this.applyTrailingActivated(position, event as TrailingStopActivatedEvent);

      case PositionEventType.PARTIAL_CLOSED:
        return this.applyPartialClosed(position, event as PartialClosedEvent);

      case PositionEventType.POSITION_CLOSED:
        return this.applyPositionClosed(position, event as PositionClosedEvent);

      case PositionEventType.POSITION_UPDATED:
        // Generic update - applied implicitly
        return position;

      default:
        return position;
    }
  }

  /**
   * Apply TAKE_PROFIT_HIT event
   */
  private applyTakeProfitHit(position: Position, event: TakeProfitHitEvent): Position {
    const pos = { ...position };

    // Mark TP as hit
    if (pos.takeProfits[event.tpIndex]) {
      pos.takeProfits[event.tpIndex].hit = true;
    }

    // Update quantity (reduce by closed amount)
    pos.quantity = event.remainingQuantity;

    // Apply SL/trailing changes
    if (event.actions.movedSLToBreakeven) {
      pos.stopLoss.price = pos.entryPrice;
      pos.stopLoss.isBreakeven = true;
    }

    if (event.actions.activatedTrailing) {
      pos.stopLoss.isTrailing = true;
    }

    return pos;
  }

  /**
   * Apply STOP_LOSS_HIT event
   */
  private applyStopLossHit(position: Position, event: StopLossHitEvent): Position {
    const pos = { ...position };

    pos.quantity = 0; // Fully closed
    pos.status = 'CLOSED';
    // Note: closePrice and realizedPnL are stored in TradingJournal, not Position

    return pos;
  }

  /**
   * Apply STOP_LOSS_UPDATED event
   */
  private applyStopLossUpdated(position: Position, event: StopLossUpdatedEvent): Position {
    const pos = { ...position };
    pos.stopLoss.price = event.newSlPrice;

    // Mark as breakeven if moved to entry
    if (event.newSlPrice === pos.entryPrice) {
      pos.stopLoss.isBreakeven = true;
    }

    // Mark as trailing if that's the reason
    if (event.reason === 'TRAILING') {
      pos.stopLoss.isTrailing = true;
    }

    return pos;
  }

  /**
   * Apply STOP_LOSS_TO_BREAKEVEN event
   */
  private applyStopLossToBreakeven(position: Position, event: StopLossToBreakEvenEvent): Position {
    const pos = { ...position };
    pos.stopLoss.price = event.newSlPrice;
    pos.stopLoss.isBreakeven = true;
    return pos;
  }

  /**
   * Apply TRAILING_STOP_ACTIVATED event
   */
  private applyTrailingActivated(position: Position, event: TrailingStopActivatedEvent): Position {
    const pos = { ...position };
    pos.stopLoss.isTrailing = true;
    pos.stopLoss.price = event.slPrice;
    return pos;
  }

  /**
   * Apply PARTIAL_CLOSED event
   */
  private applyPartialClosed(position: Position, event: PartialClosedEvent): Position {
    const pos = { ...position };
    pos.quantity = event.remainingQuantity;
    return pos;
  }

  /**
   * Apply POSITION_CLOSED event
   */
  private applyPositionClosed(position: Position, event: PositionClosedEvent): Position {
    const pos = { ...position };
    pos.status = 'CLOSED';
    pos.quantity = 0;
    // Note: closePrice and realizedPnL are stored in TradingJournal, not Position
    return pos;
  }

  /**
   * Create initial position from POSITION_OPENED event
   */
  private initializePositionFromEvent(event: PositionOpenedEvent): Position {
    const takeProfits: TakeProfit[] = event.takeProfits.map((tp, index) => ({
      level: index, // TP level (0, 1, 2)
      percent: tp.percent,
      sizePercent: tp.percent, // Percentage of position to close
      price: tp.price,
      hit: tp.hit,
    }));

    // Map side: 'LONG' | 'SHORT' → PositionSide
    const positionSide = event.side === 'LONG' ? 'LONG' : 'SHORT';

    return {
      id: event.positionId,
      symbol: event.symbol,
      status: 'OPEN',
      side: positionSide as any, // Type mismatch but structurally compatible
      quantity: event.quantity,
      entryPrice: event.entryPrice,
      leverage: event.leverage,
      marginUsed: 0, // Will be updated by PositionLifecycleService
      stopLoss: {
        price: event.initialStopLoss.price,
        initialPrice: event.initialStopLoss.price,
        isBreakeven: false,
        isTrailing: false,
        updatedAt: event.timestamp,
      },
      takeProfits,
      openedAt: event.timestamp,
      unrealizedPnL: 0,
      orderId: '', // Will be set by PositionLifecycleService
      reason: 'Event sourced position',
      confidence: event.confidence,
    };
  }

  /**
   * Get position status from events
   */
  async getPositionStatus(positionId: string): Promise<'OPEN' | 'CLOSED' | 'INVALID'> {
    const events = await this.eventStore.getPositionEvents(positionId);

    if (events.length === 0) {
      return 'INVALID';
    }

    // Check if POSITION_CLOSED exists
    const hasClosed = events.some((e) => e.type === PositionEventType.POSITION_CLOSED);

    return hasClosed ? 'CLOSED' : 'OPEN';
  }

  /**
   * Validate event sequence for a position
   */
  async validateEventSequence(positionId: string): Promise<{ valid: boolean; errors?: string[] }> {
    const events = await this.eventStore.getPositionEvents(positionId);

    if (events.length === 0) {
      return { valid: true }; // Empty sequence is valid
    }

    const errors: string[] = [];

    // First event must be POSITION_OPENED
    if (events[0].type !== PositionEventType.POSITION_OPENED) {
      errors.push('First event must be POSITION_OPENED');
    }

    // Last event can be POSITION_CLOSED or something else
    const hasClosedEvent = events.some((e) => e.type === PositionEventType.POSITION_CLOSED);

    // Check for duplicate POSITION_OPENED events
    const openedCount = events.filter((e) => e.type === PositionEventType.POSITION_OPENED).length;
    if (openedCount > 1) {
      errors.push('Multiple POSITION_OPENED events found');
    }

    // Check for events after POSITION_CLOSED
    if (hasClosedEvent) {
      const closedIndex = events.findIndex((e) => e.type === PositionEventType.POSITION_CLOSED);
      if (closedIndex < events.length - 1) {
        errors.push('Events found after POSITION_CLOSED');
      }
    }

    // Check for duplicate SL/TP hits
    const slHits = events.filter((e) => e.type === PositionEventType.STOP_LOSS_HIT);
    if (slHits.length > 1) {
      errors.push('Multiple STOP_LOSS_HIT events found (max 1 allowed)');
    }

    // Validate timestamps are monotonically increasing
    for (let i = 1; i < events.length; i++) {
      if (events[i].timestamp < events[i - 1].timestamp) {
        errors.push(`Event ${i} has earlier timestamp than event ${i - 1}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
