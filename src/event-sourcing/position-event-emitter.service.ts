/**
 * PositionEventEmitter Service
 * High-level API for emitting position events
 *
 * Provides convenient methods to emit specific position events
 * without needing to know the event structure details
 */

import { IPositionEventStore } from './position-event-store.interface';
import {
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

export class PositionEventEmitter {
  constructor(private eventStore: IPositionEventStore) {}

  /**
   * Emit position opened event
   */
  async emitPositionOpened(
    positionId: string,
    symbol: string,
    entryPrice: number,
    quantity: number,
    leverage: number,
    side: 'LONG' | 'SHORT',
    initialStopLoss: { price: number; distance: number },
    takeProfits: Array<{ price: number; percent: number }>,
    confidence: number,
    indicators: string[]
  ): Promise<void> {
    const event: PositionOpenedEvent = {
      type: PositionEventType.POSITION_OPENED,
      positionId,
      symbol,
      timestamp: Date.now(),
      source: 'system',
      entryPrice,
      quantity,
      leverage,
      side,
      initialStopLoss: {
        price: initialStopLoss.price,
        distance: initialStopLoss.distance,
        hit: false,
      },
      takeProfits: takeProfits.map((tp) => ({
        price: tp.price,
        percent: tp.percent,
        hit: false,
      })),
      confidence,
      indicators,
    };

    await this.eventStore.appendEvent(event);
  }

  /**
   * Emit TP hit event
   */
  async emitTakeProfitHit(
    positionId: string,
    symbol: string,
    tpIndex: number,
    tpPrice: number,
    closedAtPrice: number,
    closedQuantity: number,
    remainingQuantity: number,
    movedSLToBreakeven: boolean = false,
    activatedTrailing: boolean = false
  ): Promise<void> {
    const event: TakeProfitHitEvent = {
      type: PositionEventType.TAKE_PROFIT_HIT,
      positionId,
      symbol,
      timestamp: Date.now(),
      source: 'system',
      tpIndex,
      tpPrice,
      closedAtPrice,
      closedQuantity,
      remainingQuantity,
      actions: {
        movedSLToBreakeven,
        activatedTrailing,
      },
    };

    await this.eventStore.appendEvent(event);
  }

  /**
   * Emit SL hit event
   */
  async emitStopLossHit(
    positionId: string,
    symbol: string,
    slPrice: number,
    closedAtPrice: number,
    closedQuantity: number,
    unrealizedPnL: number,
    realizedPnL: number,
    pnlPercent: number
  ): Promise<void> {
    const event: StopLossHitEvent = {
      type: PositionEventType.STOP_LOSS_HIT,
      positionId,
      symbol,
      timestamp: Date.now(),
      source: 'system',
      slPrice,
      closedAtPrice,
      closedQuantity,
      unrealizedPnL,
      realizedPnL,
      pnlPercent,
    };

    await this.eventStore.appendEvent(event);
  }

  /**
   * Emit SL updated event
   */
  async emitStopLossUpdated(
    positionId: string,
    symbol: string,
    oldSlPrice: number,
    newSlPrice: number,
    reason: 'MANUAL' | 'TRAILING' | 'BREAKEVEN' | 'BOLLINGER_BANDS'
  ): Promise<void> {
    const event: StopLossUpdatedEvent = {
      type: PositionEventType.STOP_LOSS_UPDATED,
      positionId,
      symbol,
      timestamp: Date.now(),
      source: 'system',
      oldSlPrice,
      newSlPrice,
      reason,
    };

    await this.eventStore.appendEvent(event);
  }

  /**
   * Emit SL to breakeven event
   */
  async emitStopLossToBreakeven(
    positionId: string,
    symbol: string,
    entryPrice: number,
    oldSlPrice: number,
    tpIndexThatTriggered: number
  ): Promise<void> {
    const event: StopLossToBreakEvenEvent = {
      type: PositionEventType.STOP_LOSS_TO_BREAKEVEN,
      positionId,
      symbol,
      timestamp: Date.now(),
      source: 'system',
      entryPrice,
      oldSlPrice,
      newSlPrice: entryPrice,
      tpIndexThatTriggered,
    };

    await this.eventStore.appendEvent(event);
  }

  /**
   * Emit trailing stop activated event
   */
  async emitTrailingStopActivated(
    positionId: string,
    symbol: string,
    trailingDistance: number,
    highPrice: number,
    slPrice: number,
    tpIndexThatTriggered?: number
  ): Promise<void> {
    const event: TrailingStopActivatedEvent = {
      type: PositionEventType.TRAILING_STOP_ACTIVATED,
      positionId,
      symbol,
      timestamp: Date.now(),
      source: 'system',
      trailingDistance,
      highPrice,
      slPrice,
      tpIndexThatTriggered,
    };

    await this.eventStore.appendEvent(event);
  }

  /**
   * Emit partial closed event
   */
  async emitPartialClosed(
    positionId: string,
    symbol: string,
    closedQuantity: number,
    remainingQuantity: number,
    closedAtPrice: number,
    percentClosed: number,
    reason: 'MANUAL' | 'SIGNAL' | 'TIMEOUT' | 'OTHER' = 'SIGNAL',
    pnlOnThisClose: number = 0
  ): Promise<void> {
    const event: PartialClosedEvent = {
      type: PositionEventType.PARTIAL_CLOSED,
      positionId,
      symbol,
      timestamp: Date.now(),
      source: 'system',
      closedQuantity,
      remainingQuantity,
      closedAtPrice,
      percentClosed,
      reason,
      pnlOnThisClose,
    };

    await this.eventStore.appendEvent(event);
  }

  /**
   * Emit position closed event
   */
  async emitPositionClosed(
    positionId: string,
    symbol: string,
    finalClosedAtPrice: number,
    finalClosedQuantity: number,
    totalDurationMs: number,
    totalTakeProfitsClosed: number,
    finalPnL: number,
    pnlPercent: number,
    closedReason: 'TP' | 'SL' | 'MANUAL' | 'TIMEOUT'
  ): Promise<void> {
    const event: PositionClosedEvent = {
      type: PositionEventType.POSITION_CLOSED,
      positionId,
      symbol,
      timestamp: Date.now(),
      source: 'system',
      finalClosedAtPrice,
      finalClosedQuantity,
      totalDurationMs,
      totalTakeProfitsClosed,
      finalPnL,
      pnlPercent,
      closedReason,
    };

    await this.eventStore.appendEvent(event);
  }
}
