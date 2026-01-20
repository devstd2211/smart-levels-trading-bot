/**
 * Position State Machine - Unified Position Lifecycle Management
 * PHASE 4.5: Single source of truth for position state
 *
 * Purpose:
 * - Prevent invalid state transitions
 * - Persist state across bot restarts
 * - Eliminate divergence between Position.status and PositionState enum
 * - Track advanced exit modes (pre-BE, trailing, BB trailing)
 *
 * Architecture:
 * - Immutable state store (JSONL format, similar to event sourcing)
 * - State projection (rebuild from disk on restart)
 * - Transition validation (prevent impossible states)
 * - Atomic state updates
 */

import { PositionState } from './enums';

// ============================================================================
// STATE MACHINE TYPES
// ============================================================================

/**
 * Pre-Breakeven mode tracking
 * Used when position has small profit but not yet ready for BE activation
 */
export interface PreBEMode {
  activatedAt: number; // Timestamp when pre-BE mode started
  candlesWaited: number; // Number of candles waited so far
  candleCount: number; // Target candle count before BE activation
}

/**
 * Trailing stop mode tracking
 * Used when position has reached TP2 and trailing stop is active
 */
export interface TrailingMode {
  isTrailing: boolean; // Whether trailing is currently active
  currentTrailingPrice: number; // Current trailing stop price
  lastUpdatePrice: number; // Last price used for trailing calculation
}

/**
 * Bollinger Band trailing mode tracking
 * Used when position uses BB trailing for final leg (after TP3)
 */
export interface BBTrailingMode {
  bbLower: number; // Bollinger Band lower value
  bbUpper: number; // Bollinger Band upper value
  activatedAt: number; // When BB trailing was activated
}

/**
 * Complete position state in the state machine
 * This is what gets persisted to disk
 */
export interface PositionStateMachineState {
  symbol: string;
  positionId: string; // Exchange position ID
  currentState: PositionState; // OPEN, TP1_HIT, TP2_HIT, TP3_HIT, CLOSED
  stateChangedAt: number; // When current state was entered
  preBEMode?: PreBEMode; // Active when moving to TP1_HIT
  trailingMode?: TrailingMode; // Active when moving to TP2_HIT
  bbTrailingMode?: BBTrailingMode; // Active when moving to TP3_HIT
  createdAt: number; // When position was opened
  closedAt?: number; // When position was fully closed (terminal)
  reason?: string; // Why position was closed

  // Closure details (when CLOSED)
  closureReason?: 'SL_HIT' | 'TP1_HIT' | 'TP2_HIT' | 'TP3_HIT' | 'TRAILING_STOP' | 'MANUAL' | 'OTHER';
  closurePrice?: number; // Price at which position was closed
  closurePnL?: number; // PnL when closed
}

/**
 * State transition request
 * Used to validate and execute state changes
 */
export interface StateTransitionRequest {
  symbol: string;
  positionId: string;
  targetState: PositionState;
  reason: string;
  metadata?: {
    preBEMode?: PreBEMode;
    trailingMode?: TrailingMode;
    bbTrailingMode?: BBTrailingMode;
  };
  // Closure details (if transitioning to CLOSED)
  closureReason?: 'SL_HIT' | 'TP1_HIT' | 'TP2_HIT' | 'TP3_HIT' | 'TRAILING_STOP' | 'MANUAL' | 'OTHER';
  closurePrice?: number;
  closurePnL?: number;
}

/**
 * State transition result
 * Returns whether transition was valid and current state
 */
export interface StateTransitionResult {
  allowed: boolean; // Whether transition is valid
  currentState: PositionState;
  previousState?: PositionState;
  error?: string; // Error reason if not allowed
  stateChange: string; // Telemetry: "OPEN → TP1_HIT"
}

/**
 * Position State Machine Service Interface
 */
export interface IPositionStateMachine {
  /**
   * Initialize state machine and recover states from disk
   */
  initialize(): Promise<void>;

  /**
   * Get current state for a position
   */
  getState(symbol: string, positionId: string): PositionState | null;

  /**
   * Get full state with metadata
   */
  getFullState(symbol: string, positionId: string): PositionStateMachineState | null;

  /**
   * Get all states for a symbol (all open positions)
   */
  getStatesBySymbol(symbol: string): Map<string, PositionStateMachineState>;

  /**
   * Validate and execute state transition
   */
  transitionState(request: StateTransitionRequest): StateTransitionResult;

  /**
   * Update advanced exit modes without changing state
   */
  updateExitMode(
    symbol: string,
    positionId: string,
    mode: {
      preBEMode?: PreBEMode;
      trailingMode?: TrailingMode;
      bbTrailingMode?: BBTrailingMode;
    }
  ): void;

  /**
   * Close position (terminal state)
   * @param symbol - Trading pair symbol (BTCUSDT)
   * @param positionId - Position ID
   * @param reason - Text reason for close
   * @param closureDetails - Optional: SL_HIT, TP_HIT, TRAILING_STOP, MANUAL, etc.
   */
  closePosition(
    symbol: string,
    positionId: string,
    reason: string,
    closureDetails?: {
      closureReason?: 'SL_HIT' | 'TP1_HIT' | 'TP2_HIT' | 'TP3_HIT' | 'TRAILING_STOP' | 'MANUAL' | 'OTHER';
      closurePrice?: number;
      closurePnL?: number;
    }
  ): StateTransitionResult;

  /**
   * Get statistics about state machine
   */
  getStatistics(): {
    totalPositions: number;
    byState: Record<string, number>;
    averageStateHoldTime: number; // milliseconds
  };

  /**
   * Clear state for a position (used after close is confirmed)
   */
  clearState(symbol: string, positionId: string): void;

  /**
   * Get state transition history (for debugging)
   */
  getTransitionHistory(symbol: string, positionId: string, limit?: number): StateTransitionRequest[];
}

// ============================================================================
// VALIDATION RULES
// ============================================================================

/**
 * Valid state transitions
 * Maps current state to allowed next states
 */
export const VALID_STATE_TRANSITIONS: Record<PositionState, PositionState[]> = {
  [PositionState.OPEN]: [
    PositionState.TP1_HIT, // TP1 hit
    PositionState.CLOSED, // SL hit or manual close
  ],
  [PositionState.TP1_HIT]: [
    PositionState.TP2_HIT, // TP2 hit
    PositionState.CLOSED, // SL hit or manual close
  ],
  [PositionState.TP2_HIT]: [
    PositionState.TP3_HIT, // TP3 hit
    PositionState.CLOSED, // SL hit or manual close
  ],
  [PositionState.TP3_HIT]: [
    PositionState.CLOSED, // SL hit or manual close
  ],
  [PositionState.CLOSED]: [], // Terminal state - no transitions
};

/**
 * Advanced exit modes active per state
 * Defines which exit modes can be active in each position state
 */
export const ACTIVE_EXIT_MODES_BY_STATE: Record<PositionState, string[]> = {
  [PositionState.OPEN]: [], // No advanced modes initially
  [PositionState.TP1_HIT]: ['PRE_BE', 'BE_ACTIVE'], // Breakeven mode active
  [PositionState.TP2_HIT]: ['TRAILING'], // Trailing stop active
  [PositionState.TP3_HIT]: ['BB_TRAILING'], // Bollinger Band trailing active
  [PositionState.CLOSED]: [], // Terminal state
};
