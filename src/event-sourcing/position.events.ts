/**
 * Position Event Sourcing
 * Immutable event definitions for all position state changes
 *
 * Used for:
 * - Complete audit trail of position lifecycle
 * - Deterministic state reconstruction
 * - Temporal queries (what was state at time T?)
 * - Backtesting and replay
 */

export enum PositionEventType {
  // Lifecycle events
  POSITION_OPENED = 'POSITION_OPENED',
  POSITION_CLOSED = 'POSITION_CLOSED',

  // TP/SL events
  TAKE_PROFIT_HIT = 'TAKE_PROFIT_HIT',
  STOP_LOSS_HIT = 'STOP_LOSS_HIT',

  // SL management
  STOP_LOSS_UPDATED = 'STOP_LOSS_UPDATED',
  STOP_LOSS_TO_BREAKEVEN = 'STOP_LOSS_TO_BREAKEVEN',
  TRAILING_STOP_ACTIVATED = 'TRAILING_STOP_ACTIVATED',

  // Partial closes
  PARTIAL_CLOSED = 'PARTIAL_CLOSED',

  // Position updates
  POSITION_UPDATED = 'POSITION_UPDATED',
}

/**
 * Base event interface - all events must extend this
 */
export interface PositionEvent {
  type: PositionEventType;
  positionId: string;
  symbol: string;
  timestamp: number; // Unix timestamp in ms

  // Event metadata
  source: 'system' | 'user' | 'webhook'; // Where the event originated
  correlationId?: string; // Link related events
}

/**
 * POSITION_OPENED: Initial position entry
 * Emitted: Once per position, at entry
 * Terminal: No, can be followed by TP hits, SL update, or SL hit
 */
export interface PositionOpenedEvent extends PositionEvent {
  type: PositionEventType.POSITION_OPENED;

  entryPrice: number;
  quantity: number;
  leverage: number;
  side: 'LONG' | 'SHORT';

  // Initial SL and TPs
  initialStopLoss: {
    price: number;
    distance: number; // ATR or % based
    hit: boolean;
  };

  takeProfits: Array<{
    price: number;
    percent: number; // % of position to close at this TP
    hit: boolean;
  }>;

  // Context
  confidence: number; // Entry signal confidence (0-100)
  indicators: string[]; // Indicators that triggered entry
}

/**
 * TAKE_PROFIT_HIT: TP level reached and partial position closed
 * Emitted: When price touches TP level (can be 0-3 times)
 * Terminal: No, position can continue to next TP or SL
 */
export interface TakeProfitHitEvent extends PositionEvent {
  type: PositionEventType.TAKE_PROFIT_HIT;

  tpIndex: number; // Which TP hit (0-2 for TP1, TP2, TP3)
  tpPrice: number;
  closedAtPrice: number;
  closedQuantity: number; // Amount closed at this TP
  remainingQuantity: number;

  // Actions triggered by this TP hit
  actions: {
    movedSLToBreakeven?: boolean;
    activatedTrailing?: boolean;
  };
}

/**
 * STOP_LOSS_HIT: SL breached - position forced closed
 * Emitted: When price breaches SL (0-1 times per position)
 * Terminal: Yes, position is closed
 */
export interface StopLossHitEvent extends PositionEvent {
  type: PositionEventType.STOP_LOSS_HIT;

  slPrice: number;
  closedAtPrice: number;
  closedQuantity: number; // Full remaining position

  unrealizedPnL: number;
  realizedPnL: number;
  pnlPercent: number;
}

/**
 * STOP_LOSS_UPDATED: Manual SL adjustment
 * Emitted: When SL is moved (can be 0-N times)
 * Terminal: No, SL can be moved again or hit
 */
export interface StopLossUpdatedEvent extends PositionEvent {
  type: PositionEventType.STOP_LOSS_UPDATED;

  oldSlPrice: number;
  newSlPrice: number;
  reason: 'MANUAL' | 'TRAILING' | 'BREAKEVEN' | 'BOLLINGER_BANDS';

  // Context for why SL was moved
  context?: {
    trailingDistance?: number; // For trailing stop
    highPrice?: number; // For trailing calculation
    bbBand?: number; // For Bollinger Bands reason
  };
}

/**
 * STOP_LOSS_TO_BREAKEVEN: Special case of SL update - move to entry
 * Emitted: When first TP hits and SL moved to entry price
 * Terminal: No, can be followed by trailing or more SL updates
 */
export interface StopLossToBreakEvenEvent extends PositionEvent {
  type: PositionEventType.STOP_LOSS_TO_BREAKEVEN;

  entryPrice: number;
  oldSlPrice: number;
  newSlPrice: number; // Should equal entryPrice
  tpIndexThatTriggered: number; // Which TP hit caused this
}

/**
 * TRAILING_STOP_ACTIVATED: Trailing stop mode activated
 * Emitted: When position transitions to trailing stop (usually after 2nd TP)
 * Terminal: No, position can still be hit
 */
export interface TrailingStopActivatedEvent extends PositionEvent {
  type: PositionEventType.TRAILING_STOP_ACTIVATED;

  trailingDistance: number; // Distance from high in ATR or %
  highPrice: number; // Current high for trailing calculation
  slPrice: number; // Current SL price after activation

  tpIndexThatTriggered?: number; // Which TP triggered trailing
}

/**
 * PARTIAL_CLOSED: Position partially closed (NOT via TP)
 * Emitted: When position is manually closed or closed by other means
 * Terminal: No, can be followed by more closes or SL hit
 */
export interface PartialClosedEvent extends PositionEvent {
  type: PositionEventType.PARTIAL_CLOSED;

  closedQuantity: number;
  remainingQuantity: number;
  closedAtPrice: number;
  percentClosed: number;

  reason: 'MANUAL' | 'SIGNAL' | 'TIMEOUT' | 'OTHER';
  pnlOnThisClose: number;
}

/**
 * POSITION_CLOSED: Final close - position fully closed
 * Emitted: Once per position, when last bit is closed
 * Terminal: Yes, no more events for this position
 */
export interface PositionClosedEvent extends PositionEvent {
  type: PositionEventType.POSITION_CLOSED;

  finalClosedAtPrice: number;
  finalClosedQuantity: number; // Remaining quantity

  totalDurationMs: number; // From entry to close
  totalTakeProfitsClosed: number; // How many TPs hit
  finalPnL: number;
  pnlPercent: number;

  closedReason: 'TP' | 'SL' | 'MANUAL' | 'TIMEOUT';
}

/**
 * POSITION_UPDATED: Generic position update
 * Used for fields that don't fit other events (unrealized PnL, etc)
 * Emitted: Periodically or on significant changes
 * Terminal: No
 */
export interface PositionUpdatedEvent extends PositionEvent {
  type: PositionEventType.POSITION_UPDATED;

  changes: {
    unrealizedPnL?: number;
    unrealizedPnLPercent?: number;
    currentPrice?: number;
    quantity?: number;
    // Add other updatable fields as needed
  };
}

/**
 * Union type for all position events
 */
export type AnyPositionEvent =
  | PositionOpenedEvent
  | TakeProfitHitEvent
  | StopLossHitEvent
  | StopLossUpdatedEvent
  | StopLossToBreakEvenEvent
  | TrailingStopActivatedEvent
  | PartialClosedEvent
  | PositionClosedEvent
  | PositionUpdatedEvent;

/**
 * Event store record - includes metadata about storage
 */
export interface PositionEventRecord {
  id: string; // Unique event ID (timestamp + hash or UUID)
  event: AnyPositionEvent;
  storedAt: number; // When event was persisted
  version: number; // Event store version for compatibility
}
