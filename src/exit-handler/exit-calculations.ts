/**
 * Exit Calculations - Pure Helper Functions
 *
 * Stateless calculations for exit strategy:
 * - Calculate breakeven SL price
 * - Calculate trailing stop distance
 * - Verify TP hits
 * - Verify SL hits
 *
 * NO side effects, NO dependencies on services
 * All inputs as parameters, all outputs as return values
 */

import { Position } from '../types/core';
import { PositionSide } from '../types/enums';
import { TPLevelConfig, TrailingConfig, BreakEvenConfig, ExitCalculationContext } from '../types/exit-strategy.types';

// ============================================================================
// BREAKEVEN CALCULATIONS
// ============================================================================

/**
 * Calculate breakeven SL price
 * Moves SL to entry price + small profit margin
 *
 * @param position - Position to calculate BE for
 * @param beMarginPercent - Offset from entry in % (e.g., 0.1%)
 * @returns New SL price (breakeven)
 *
 * PURE FUNCTION - no side effects
 */
export function calculateBreakevenSL(
  position: Position,
  beMarginPercent: number,
): number {
  const isLong = position.side === PositionSide.LONG;
  const marginAbsolute = (position.entryPrice * beMarginPercent) / 100;

  return isLong
    ? position.entryPrice + marginAbsolute
    : position.entryPrice - marginAbsolute;
}

/**
 * Verify breakeven is valid (SL is on correct side of entry)
 *
 * @param position - Position to check
 * @param beSL - Proposed BE SL price
 * @returns true if BE is valid
 *
 * PURE FUNCTION - no side effects
 */
export function isBreakevenValid(position: Position, beSL: number): boolean {
  const isLong = position.side === PositionSide.LONG;

  // For LONG: BE must be >= entry (we only profit)
  // For SHORT: BE must be <= entry (we only profit)
  if (isLong) {
    return beSL >= position.entryPrice;
  } else {
    return beSL <= position.entryPrice;
  }
}

// ============================================================================
// TRAILING STOP CALCULATIONS
// ============================================================================

/**
 * Calculate trailing stop distance
 * Base distance from entry price, optionally adjusted by ATR
 *
 * @param position - Position for trailing stop
 * @param distancePercent - Base distance in % from entry
 * @param atrPercent - Optional ATR % (overrides base if provided)
 * @param atrMultiplier - Multiply ATR by this factor
 * @returns Trailing distance in absolute price units
 *
 * PURE FUNCTION - no side effects
 */
export function calculateTrailingDistance(
  position: Position,
  distancePercent: number,
  atrPercent?: number,
  atrMultiplier: number = 1.0,
): number {
  const MIN_DISTANCE_PERCENT = 0.1;  // Minimum 0.1%
  const MAX_DISTANCE_PERCENT = 5.0;  // Maximum 5%

  let finalDistancePercent = distancePercent;

  // If ATR provided, use it (with multiplier)
  if (atrPercent !== undefined && atrPercent > 0) {
    finalDistancePercent = atrPercent * atrMultiplier;
  }

  // Cap the distance
  finalDistancePercent = Math.max(finalDistancePercent, MIN_DISTANCE_PERCENT);
  finalDistancePercent = Math.min(finalDistancePercent, MAX_DISTANCE_PERCENT);

  // Convert % to absolute price units
  const distanceAbsolute = (position.entryPrice * finalDistancePercent) / 100;

  return distanceAbsolute;
}

/**
 * Calculate current trailing stop price given current market price
 * Used to track trailing SL as price moves
 *
 * @param position - Position with trailing stop
 * @param currentPrice - Current market price
 * @param trailingDistance - Trailing distance (in absolute units)
 * @returns Current trailing SL price
 *
 * PURE FUNCTION - no side effects
 */
export function calculateCurrentTrailingSL(
  position: Position,
  currentPrice: number,
  trailingDistance: number,
): number {
  const isLong = position.side === PositionSide.LONG;

  // For LONG: SL is below current price
  // For SHORT: SL is above current price
  return isLong
    ? currentPrice - trailingDistance
    : currentPrice + trailingDistance;
}

/**
 * Should trailing SL be updated?
 * For LONG: update if price moved higher and new SL > old SL
 * For SHORT: update if price moved lower and new SL < old SL
 *
 * @param position - Position
 * @param currentPrice - Current market price
 * @param lastTrailingPrice - Last price where SL was updated
 * @param trailingDistance - Trailing distance
 * @returns true if SL should be updated
 *
 * PURE FUNCTION - no side effects
 */
export function shouldUpdateTrailingSL(
  position: Position,
  currentPrice: number,
  lastTrailingPrice: number,
  trailingDistance: number,
): boolean {
  const isLong = position.side === PositionSide.LONG;

  if (isLong) {
    // LONG: Only update if price went higher
    return currentPrice > lastTrailingPrice;
  } else {
    // SHORT: Only update if price went lower
    return currentPrice < lastTrailingPrice;
  }
}

// ============================================================================
// TP HIT VERIFICATION
// ============================================================================

/**
 * Check if TP level was hit
 *
 * @param position - Position to check
 * @param currentPrice - Current market price
 * @param tpPrice - TP price level to check against
 * @returns true if TP was hit
 *
 * PURE FUNCTION - no side effects
 */
export function isTPHit(
  position: Position,
  currentPrice: number,
  tpPrice: number,
): boolean {
  const isLong = position.side === PositionSide.LONG;

  // For LONG: TP hit if price >= TP price
  // For SHORT: TP hit if price <= TP price
  return isLong ? currentPrice >= tpPrice : currentPrice <= tpPrice;
}

/**
 * Calculate TP price from % profit target
 * Converts "1.5% profit" to absolute price
 *
 * @param position - Position
 * @param profitPercent - Profit target in %
 * @returns Absolute TP price
 *
 * PURE FUNCTION - no side effects
 */
export function calculateTPPrice(
  position: Position,
  profitPercent: number,
): number {
  const isLong = position.side === PositionSide.LONG;
  const absoluteProfit = (position.entryPrice * profitPercent) / 100;

  return isLong
    ? position.entryPrice + absoluteProfit
    : position.entryPrice - absoluteProfit;
}

// ============================================================================
// STOP LOSS VERIFICATION
// ============================================================================

/**
 * Check if SL was hit
 *
 * @param position - Position to check
 * @param currentPrice - Current market price
 * @returns true if SL was hit
 *
 * PURE FUNCTION - no side effects
 */
export function isStopLossHit(
  position: Position,
  currentPrice: number,
): boolean {
  const isLong = position.side === PositionSide.LONG;
  const slPrice = position.stopLoss.price;

  // For LONG: SL hit if price <= SL
  // For SHORT: SL hit if price >= SL
  return isLong ? currentPrice <= slPrice : currentPrice >= slPrice;
}

// ============================================================================
// TP CONFIG RESOLUTION
// ============================================================================

/**
 * Get TP config for a specific level
 *
 * @param tpLevels - Array of TP configs
 * @param level - Level number to find
 * @returns TP config or undefined
 *
 * PURE FUNCTION - no side effects
 */
export function getTpConfigForLevel(
  tpLevels: TPLevelConfig[],
  level: number,
): TPLevelConfig | undefined {
  return tpLevels.find((tp) => tp.level === level);
}

/**
 * Get all TP levels in order
 *
 * @param tpLevels - Array of TP configs
 * @returns Sorted array by level
 *
 * PURE FUNCTION - no side effects
 */
export function sortTPLevels(tpLevels: TPLevelConfig[]): TPLevelConfig[] {
  return [...tpLevels].sort((a, b) => a.level - b.level);
}

// ============================================================================
// PROFIT CALCULATIONS
// ============================================================================

/**
 * Calculate profit for a position at current price
 *
 * @param position - Position
 * @param currentPrice - Current market price
 * @returns Profit in USDT
 *
 * PURE FUNCTION - no side effects
 */
export function calculatePnL(
  position: Position,
  currentPrice: number,
): number {
  const isLong = position.side === PositionSide.LONG;
  const priceDiff = currentPrice - position.entryPrice;

  return isLong
    ? priceDiff * position.quantity
    : (position.entryPrice - currentPrice) * position.quantity;
}

/**
 * Calculate profit % for a position at current price
 *
 * @param position - Position
 * @param currentPrice - Current market price
 * @returns Profit in %
 *
 * PURE FUNCTION - no side effects
 */
export function calculatePnLPercent(
  position: Position,
  currentPrice: number,
): number {
  const isLong = position.side === PositionSide.LONG;
  const priceDiff = currentPrice - position.entryPrice;
  const percentChange = (priceDiff / position.entryPrice) * 100;

  return isLong ? percentChange : -percentChange;
}

/**
 * Calculate unrealized profit at specific exit price
 *
 * @param position - Position
 * @param exitPrice - Price at which we would exit
 * @returns { pnl: USDT, pnlPercent: % }
 *
 * PURE FUNCTION - no side effects
 */
export function calculateExitPnL(
  position: Position,
  exitPrice: number,
): { pnl: number; pnlPercent: number } {
  const pnl = calculatePnL(position, exitPrice);
  const pnlPercent = calculatePnLPercent(position, exitPrice);

  return { pnl, pnlPercent };
}

// ============================================================================
// SIZE CALCULATIONS
// ============================================================================

/**
 * Calculate absolute size to close at a specific TP level
 *
 * @param position - Position
 * @param tpConfig - TP level config
 * @returns Size to close (in contracts)
 *
 * PURE FUNCTION - no side effects
 */
export function calculateSizeToClose(
  position: Position,
  tpConfig: TPLevelConfig,
): number {
  return (position.quantity * tpConfig.sizePercent) / 100;
}

/**
 * Calculate remaining position size after closing at TP
 *
 * @param position - Position
 * @param sizeToClose - Size being closed
 * @returns Remaining size
 *
 * PURE FUNCTION - no side effects
 */
export function calculateRemainingSize(
  position: Position,
  sizeToClose: number,
): number {
  return Math.max(0, position.quantity - sizeToClose);
}
