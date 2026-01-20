/**
 * Exit Decisions - Pure Decision Functions (Phase 5)
 *
 * Extracted decision logic from ExitOrchestrator.evaluateExit()
 * Pure functions with NO side effects:
 * - No logger calls
 * - No service dependencies
 * - All inputs as parameters
 * - Deterministic output
 * - Testable in isolation
 *
 * PATTERN: Follows entry-decisions.ts structure for consistency
 */

import { Position, PositionState, ExitAction, PositionSide } from '../types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Optional indicators context for exit decisions
 */
export interface ExitIndicators {
  atrPercent?: number;
  currentVolume?: number;
  avgVolume?: number;
  ema20?: number;
}

/**
 * Context for exit decision - all data needed to decide state transitions
 */
export interface ExitDecisionContext {
  // Position being evaluated
  position: Position;

  // Current market price
  currentPrice: number;

  // Current position state (tracked externally)
  currentState: PositionState;

  // Optional indicators for advanced features
  indicators?: ExitIndicators;

  // Configuration parameters
  config?: {
    beMarginPercent?: number;
    minSLDistancePercent?: number;
    trailingDistancePercent?: number;
    useAdaptiveTP3?: boolean;
  };
}

/**
 * Exit action details
 */
export interface ExitActionDetail {
  action: ExitAction;
  percent?: number;
  newStopLoss?: number;
  trailingDistance?: number;
}

/**
 * Result of exit decision
 */
export interface ExitDecisionResult {
  // New state after this decision
  state: PositionState;

  // Actions to execute (may be multiple per decision)
  actions: ExitActionDetail[];

  // Human-readable reason for decision
  reason: string;

  // State transition description for logging
  stateTransition: string;

  // Optional metadata for advanced strategies
  metadata?: {
    closureReason?: string;
    profitPercent?: number;
    profitAbsolute?: number;
    triggerPrice?: number;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Default configuration values
const DEFAULT_BE_MARGIN_PERCENT = 0.1;
const DEFAULT_MIN_SL_DISTANCE_PERCENT = 0.1;
const DEFAULT_TRAILING_DISTANCE_PERCENT = 1.5;

// Smart breakeven settings
const PRE_BE_MAX_CANDLES = 5;
const PRE_BE_PROFIT_LOCK = 0.1;

// Trailing stop settings
const SMART_TRAILING_MIN_ATR = 1.5;
const SMART_TRAILING_MAX_ATR = 3.0;
const SMART_TRAILING_VOLUME_THRESHOLD = 1.2;

// Adaptive TP3 settings
const ADAPTIVE_TP3_MIN_PROFIT = 2.0;
const ADAPTIVE_TP3_MAX_PROFIT = 5.0;
const ADAPTIVE_TP3_HIGH_VOLUME_BONUS = 0.5;

// ============================================================================
// PURE DECISION FUNCTION
// ============================================================================

/**
 * PURE FUNCTION: Evaluate exit conditions and decide state transitions
 *
 * Extracted from ExitOrchestrator.evaluateExit()
 * Contains ONLY decision logic, NO side effects
 *
 * Decision process:
 * 1. Validate inputs (FAST FAIL)
 * 2. Check Stop Loss hit (closes position from ANY state)
 * 3. Get current position state
 * 4. Check TP progression based on state:
 *    - OPEN: Check TP1 hit → Move to TP1_HIT (move SL to breakeven)
 *    - TP1_HIT: Check TP2 hit → Move to TP2_HIT (activate trailing)
 *    - TP2_HIT: Check TP3 hit → Move to TP3_HIT (close remaining)
 *    - TP3_HIT: Wait for SL or manual close
 * 5. Return final decision
 *
 * State persistence and logger calls are NOT included here.
 * Those are orchestrator responsibilities.
 */
export function evaluateExit(context: ExitDecisionContext): ExitDecisionResult {
  // =====================================================================
  // STEP 0: Validate inputs (FAST FAIL)
  // =====================================================================
  const validationError = validateExitInputs(context);
  if (validationError) {
    return {
      state: PositionState.CLOSED,
      actions: [{ action: ExitAction.CLOSE_ALL }],
      reason: validationError,
      stateTransition: `ERROR → CLOSED (${validationError})`,
    };
  }

  const { position, currentPrice, currentState, indicators, config } = context;

  // =====================================================================
  // STEP 1: Check if Stop Loss hit (ANY state → CLOSED) - PRIORITY 1
  // =====================================================================
  if (checkStopLossHit(position, currentPrice)) {
    const slPnL = calculatePnL(position, currentPrice);
    return {
      state: PositionState.CLOSED,
      actions: [{ action: ExitAction.CLOSE_ALL }],
      reason: `Stop Loss triggered at ${currentPrice.toFixed(8)}`,
      stateTransition: `${currentState} → CLOSED (SL HIT)`,
      metadata: {
        closureReason: 'SL_HIT',
        profitPercent: slPnL,
        triggerPrice: currentPrice,
      },
    };
  }

  // =====================================================================
  // STEP 2: Get current position state (validation)
  // =====================================================================
  if (!isValidState(currentState)) {
    return {
      state: PositionState.CLOSED,
      actions: [{ action: ExitAction.CLOSE_ALL }],
      reason: `Invalid current state: ${currentState}`,
      stateTransition: `INVALID → CLOSED`,
    };
  }

  // =====================================================================
  // STEP 3: Check TP progression based on current state - PRIORITY 2-5
  // =====================================================================

  if (currentState === PositionState.OPEN) {
    // Check TP1 hit (first target)
    if (checkTPHit(position, currentPrice, 0)) {
      const beMargin = config?.beMarginPercent ?? DEFAULT_BE_MARGIN_PERCENT;
      const newSL = calculateBreakevenSL(position, beMargin);
      const tp1PnL = calculatePnL(position, currentPrice);

      return {
        state: PositionState.TP1_HIT,
        actions: [
          { action: ExitAction.CLOSE_PERCENT, percent: 50 },
          { action: ExitAction.UPDATE_SL, newStopLoss: newSL },
        ],
        reason: `TP1 hit at ${currentPrice.toFixed(8)} - moving SL to breakeven (${newSL.toFixed(8)})`,
        stateTransition: `OPEN → TP1_HIT`,
        metadata: {
          closureReason: 'TP1_HIT',
          profitPercent: tp1PnL,
          triggerPrice: currentPrice,
        },
      };
    }
  } else if (currentState === PositionState.TP1_HIT) {
    // Check TP2 hit (second target)
    if (checkTPHit(position, currentPrice, 1)) {
      const trailingDist = calculateSmartTrailingDistance(
        position,
        currentPrice,
        indicators,
        config
      );
      const tp2PnL = calculatePnL(position, currentPrice);

      return {
        state: PositionState.TP2_HIT,
        actions: [
          { action: ExitAction.CLOSE_PERCENT, percent: 30 },
          { action: ExitAction.ACTIVATE_TRAILING, trailingDistance: trailingDist },
        ],
        reason: `TP2 hit at ${currentPrice.toFixed(8)} - activating trailing stop (distance: ${trailingDist.toFixed(
          8
        )})`,
        stateTransition: `TP1_HIT → TP2_HIT`,
        metadata: {
          closureReason: 'TP2_HIT',
          profitPercent: tp2PnL,
          triggerPrice: currentPrice,
        },
      };
    }
  } else if (currentState === PositionState.TP2_HIT) {
    // Check TP3 hit (third target)
    if (checkTPHit(position, currentPrice, 2)) {
      const tp3PnL = calculatePnL(position, currentPrice);

      return {
        state: PositionState.TP3_HIT,
        actions: [{ action: ExitAction.CLOSE_PERCENT, percent: 20 }],
        reason: `TP3 hit at ${currentPrice.toFixed(8)} - closing remaining position`,
        stateTransition: `TP2_HIT → TP3_HIT`,
        metadata: {
          closureReason: 'TP3_HIT',
          profitPercent: tp3PnL,
          triggerPrice: currentPrice,
        },
      };
    }
  } else if (currentState === PositionState.TP3_HIT) {
    // All TPs hit, wait for SL or manual close
    return {
      state: PositionState.TP3_HIT,
      actions: [],
      reason: `All TPs hit - awaiting SL or manual close`,
      stateTransition: `TP3_HIT → HOLDING`,
    };
  }

  // =====================================================================
  // STEP 4: No state change
  // =====================================================================
  return {
    state: currentState,
    actions: [],
    reason: `No exit conditions met - holding position`,
    stateTransition: `${currentState} → NO_CHANGE`,
  };
}

// ============================================================================
// HELPER FUNCTIONS (PURE)
// ============================================================================

/**
 * Validate exit decision inputs
 * Returns error message if invalid, null if valid
 * @private
 */
function validateExitInputs(context: ExitDecisionContext): string | null {
  if (!context.position) {
    return 'Position is required';
  }

  if (context.currentPrice === undefined || context.currentPrice === null) {
    return 'Current price is required';
  }

  if (context.currentPrice <= 0) {
    return `Invalid current price: ${context.currentPrice}`;
  }

  if (!context.currentState) {
    return 'Current state is required';
  }

  // Note: takeProfits array may be empty (position can close via SL or manual action)
  if (!Array.isArray(context.position.takeProfits)) {
    return 'Position must have takeProfits array';
  }

  return null;
}

/**
 * Check if Stop Loss has been hit
 * Returns true if SL breached
 * @private
 */
function checkStopLossHit(position: Position, currentPrice: number): boolean {
  const isLong = position.side === PositionSide.LONG;
  const slPrice = position.stopLoss?.price ?? position.entryPrice;

  if (isLong) {
    return currentPrice <= slPrice;
  } else {
    return currentPrice >= slPrice;
  }
}

/**
 * Check if Take Profit level has been hit
 * @param position - Position to check
 * @param currentPrice - Current price
 * @param tpIndex - Which TP level (0=TP1, 1=TP2, 2=TP3)
 * @returns true if TP hit
 * @private
 */
function checkTPHit(
  position: Position,
  currentPrice: number,
  tpIndex: number
): boolean {
  if (
    !position.takeProfits ||
    !position.takeProfits[tpIndex] ||
    !position.takeProfits[tpIndex].price
  ) {
    return false;
  }

  const tpPrice = position.takeProfits[tpIndex].price;
  const isLong = position.side === PositionSide.LONG;

  if (isLong) {
    return currentPrice >= tpPrice;
  } else {
    return currentPrice <= tpPrice;
  }
}

/**
 * Calculate breakeven stop loss price
 * Moves SL to entry price + small profit margin
 * @private
 */
function calculateBreakevenSL(
  position: Position,
  beMarginPercent: number
): number {
  const isLong = position.side === PositionSide.LONG;
  const marginAbsolute = (position.entryPrice * beMarginPercent) / 100;

  return isLong
    ? position.entryPrice + marginAbsolute
    : position.entryPrice - marginAbsolute;
}

/**
 * Calculate smart trailing stop distance
 * Uses ATR if available, falls back to percentage
 * @private
 */
function calculateSmartTrailingDistance(
  position: Position,
  currentPrice: number,
  indicators?: ExitIndicators,
  config?: { trailingDistancePercent?: number }
): number {
  const baseDistance = config?.trailingDistancePercent ?? DEFAULT_TRAILING_DISTANCE_PERCENT;

  // If ATR available, use smart calculation
  if (indicators?.atrPercent && indicators.atrPercent > 0) {
    const atrPercent = Math.max(
      SMART_TRAILING_MIN_ATR,
      Math.min(indicators.atrPercent, SMART_TRAILING_MAX_ATR)
    );

    // Adjust for volume if available
    let finalATR = atrPercent;
    if (
      indicators.currentVolume &&
      indicators.avgVolume &&
      indicators.avgVolume > 0
    ) {
      const volumeRatio = indicators.currentVolume / indicators.avgVolume;
      if (volumeRatio > SMART_TRAILING_VOLUME_THRESHOLD) {
        // High volume: tighten trailing
        finalATR = atrPercent * 0.8;
      }
    }

    return (currentPrice * finalATR) / 100;
  }

  // Fallback to percentage-based
  return (currentPrice * baseDistance) / 100;
}

/**
 * Calculate P&L percentage for position at given price
 * @private
 */
function calculatePnL(position: Position, currentPrice: number): number {
  const isLong = position.side === PositionSide.LONG;

  if (isLong) {
    return ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
  } else {
    return ((position.entryPrice - currentPrice) / position.entryPrice) * 100;
  }
}

/**
 * Check if state is valid
 * @private
 */
function isValidState(state: PositionState): boolean {
  return [
    PositionState.OPEN,
    PositionState.TP1_HIT,
    PositionState.TP2_HIT,
    PositionState.TP3_HIT,
    PositionState.CLOSED,
  ].includes(state);
}
