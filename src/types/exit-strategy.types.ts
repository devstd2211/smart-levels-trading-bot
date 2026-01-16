/**
 * Exit Strategy Types (Config-Driven)
 *
 * Defines all types for config-driven exit strategy:
 * - TP levels (can be 1, 2, 10, or any number)
 * - Trailing stop configuration
 * - Breakeven configuration
 * - Exit events (TP hit, position closed)
 *
 * Loaded from strategy.json -> riskManagement section
 */

import { Position } from './core';

// ============================================================================
// CONFIG TYPES (from strategy.json -> riskManagement)
// ============================================================================

/**
 * Single TP level configuration
 * Each TP can have different behavior on hit
 */
export interface TPLevelConfig {
  // Basic config
  level: number;              // 1, 2, 3, ...
  percent: number;            // Profit target in %
  sizePercent: number;        // How much of position to close (%)

  // What to do when this TP hits
  onHit?: 'CLOSE' | 'MOVE_SL_TO_BREAKEVEN' | 'ACTIVATE_TRAILING' | 'CUSTOM';

  // For MOVE_SL_TO_BREAKEVEN
  beMargin?: number;          // % above entry (from config)

  // For ACTIVATE_TRAILING
  trailingConfig?: TrailingConfig;

  // For custom logic
  customHandler?: string;     // Name of custom handler
}

/**
 * Trailing stop configuration
 */
export interface TrailingConfig {
  enabled: boolean;
  percent: number;            // Base distance in % from entry price
  useATR?: boolean;           // Use ATR for dynamic distance
  atrMultiplier?: number;     // Multiply ATR by this
  activationLevel?: number;   // Activate after this TP level hits (2 = after TP2)
}

/**
 * Breakeven configuration
 */
export interface BreakEvenConfig {
  enabled: boolean;
  offsetPercent: number;      // Profit lock in % (e.g., 0.1%)
}

/**
 * Stop Loss configuration (for reference in exit handler)
 */
export interface StopLossConfig {
  percent: number;
  atrMultiplier: number;
  minDistancePercent: number;
}

/**
 * Complete exit strategy configuration
 * Loaded from strategy.json -> riskManagement
 */
export interface ExitStrategyConfig {
  stopLoss: StopLossConfig;
  takeProfits: TPLevelConfig[];
  trailing?: TrailingConfig;
  breakeven?: BreakEvenConfig;
}

// ============================================================================
// EVENT TYPES (from exchange/position manager)
// ============================================================================

/**
 * Base exit event interface
 * All exit events extend this
 */
export interface IExitEvent {
  symbol: string;
  position: Position;
  currentPrice: number;
  timestamp: number;
}

/**
 * TP hit event
 * Triggered when a specific TP level is hit
 */
export interface ITPHitEvent extends IExitEvent {
  type: 'TP_HIT';
  tpLevel: number;            // Which TP level (1, 2, 3, ...)
  tpPrice: number;            // The TP price that was hit
  indicators?: {
    atrPercent?: number;
    atrValue?: number;
    currentVolume?: number;
    avgVolume?: number;
    ema20?: number;
    rsi?: number;
  };
}

/**
 * Position closed event
 * Triggered when position is closed (by SL, TP, trailing, or manual)
 */
export interface IPositionClosedEvent extends IExitEvent {
  type: 'POSITION_CLOSED';
  reason: 'SL_HIT' | 'TP_HIT' | 'TRAILING_HIT' | 'MANUAL' | 'LIQUIDATION';
  closedAt: number;           // Timestamp of closure
  closedSize: number;         // How much was closed (contracts)
  closedPercent?: number;     // Percentage of position closed
  pnl?: number;               // PnL in USDT
  pnlPercent?: number;        // PnL in %
  closingPrice?: number;      // Price at which it was closed
}

/**
 * Union type of all possible exit events
 */
export type AnyExitEvent = ITPHitEvent | IPositionClosedEvent;

// ============================================================================
// RESULT TYPES (from handler)
// ============================================================================

/**
 * Result of handling a TP hit event
 */
export interface TPHitResult {
  success: boolean;
  action: 'MOVE_SL_TO_BREAKEVEN' | 'ACTIVATE_TRAILING' | 'CLOSE' | 'NONE';
  newSlPrice?: number;        // If moving SL
  trailingDistance?: number;  // If activating trailing
  reason: string;
  error?: string;
}

/**
 * Result of handling position closed event
 */
export interface PositionClosedResult {
  success: boolean;
  removed: boolean;           // Was position removed from memory
  reason: string;
  error?: string;
}

/**
 * Result of any exit event handling
 */
export type ExitHandlerResult = TPHitResult | PositionClosedResult;

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Calculation context for exit calculations
 */
export interface ExitCalculationContext {
  position: Position;
  currentPrice: number;
  config: ExitStrategyConfig;
  indicators?: {
    atrPercent?: number;
    atrValue?: number;
    currentVolume?: number;
    avgVolume?: number;
  };
}

/**
 * TP Hit context for handler
 */
export interface TPHitContext {
  position: Position;
  tpLevel: number;
  tpPrice: number;
  tpConfig: TPLevelConfig;
  currentPrice: number;
  indicators?: {
    atrPercent?: number;
    currentVolume?: number;
    avgVolume?: number;
  };
}
