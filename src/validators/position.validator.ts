/**
 * Phase 9.P0.2: Position Validator
 *
 * Validates Position objects have all required fields for Phase 9 monitoring
 * Prevents NaN crashes from type mismatches (empty string entryPrice, undefined unrealizedPnL, etc.)
 *
 * Used by all Phase 9 services:
 * - RealTimeRiskMonitor (before health calculation)
 * - TradingLifecycleManager (before position tracking)
 * - OrderExecutionPipeline (before order placement)
 */

import { Position, PositionSide, LoggerService } from '../types';

export class PositionValidator {
  constructor(private logger: LoggerService) {}

  /**
   * Validate position has all required fields for Phase 9 monitoring
   * Throws if validation fails with detailed error message
   *
   * CRITICAL: Must pass before any Phase 9 service processes position
   */
  validateForPhase9Monitoring(position: Position | null | undefined): void {
    const errors: string[] = [];

    // NULL CHECK
    if (!position) {
      errors.push('Position is null or undefined');
    } else {
      // REQUIRED FIELDS: ID and Symbol
      if (!position.id || typeof position.id !== 'string') {
        errors.push(`Invalid id: ${position.id} (must be non-empty string)`);
      }
      if (!position.symbol || typeof position.symbol !== 'string') {
        errors.push(`Invalid symbol: ${position.symbol} (must be non-empty string)`);
      }

      // NUMERIC FIELDS: Must be valid numbers, not empty string or NaN
      if (this.isInvalidNumber(position.entryPrice)) {
        errors.push(
          `Invalid entryPrice: ${position.entryPrice} (must be valid number, not "" or NaN)`
        );
      }
      if (this.isInvalidNumber(position.quantity)) {
        errors.push(`Invalid quantity: ${position.quantity} (must be valid number)`);
      }
      if (typeof position.unrealizedPnL !== 'number' || isNaN(position.unrealizedPnL)) {
        errors.push(`Invalid unrealizedPnL: ${position.unrealizedPnL} (must be valid number)`);
      }
      if (typeof position.leverage !== 'number' || isNaN(position.leverage)) {
        errors.push(`Invalid leverage: ${position.leverage} (must be valid number)`);
      }

      // OPTIONAL BUT TYPED FIELDS
      if (position.takeProfits !== undefined && !Array.isArray(position.takeProfits)) {
        errors.push(`Invalid takeProfits: not an array`);
      }
      if (position.stopLoss !== undefined) {
        if (typeof position.stopLoss !== 'object') {
          errors.push(`Invalid stopLoss: not an object`);
        } else if (typeof position.stopLoss.price !== 'number' || isNaN(position.stopLoss.price)) {
          errors.push(`Invalid stopLoss.price: ${position.stopLoss.price}`);
        }
      }

      // SIDE VALIDATION (PositionSide is enum with numeric values)
      if (position.side !== undefined) {
        if (position.side !== PositionSide.LONG && position.side !== PositionSide.SHORT) {
          errors.push(`Invalid side: ${position.side} (must be LONG or SHORT)`);
        }
      }

      // TIMESTAMP FIELDS
      if (position.openedAt !== undefined && typeof position.openedAt !== 'number') {
        errors.push(`Invalid openedAt: ${position.openedAt} (must be timestamp)`);
      }
    }

    // Throw if ANY errors
    if (errors.length > 0) {
      const message = `Position validation failed:\n  - ${errors.join('\n  - ')}`;
      this.logger.error(`[P0.2] ${message}`);
      throw new Error(message);
    }

    // SUCCESS
    this.logger.debug(`[P0.2] Position validated successfully: ${position?.id}`);
  }

  /**
   * Helper: Check if value is invalid number
   * Rejects: null, undefined, "", string, NaN
   */
  private isInvalidNumber(value: any): boolean {
    // Reject: null, undefined
    if (value === null || value === undefined) return true;

    // Reject: empty string or any string
    if (value === '' || typeof value === 'string') return true;

    // Reject: non-number types
    if (typeof value !== 'number') return true;

    // Reject: NaN
    if (isNaN(value)) return true;

    return false; // Valid number
  }

  /**
   * Fill missing fields for backward compatibility with old positions
   * Old positions (pre-Phase 9) may lack unrealizedPnL field
   *
   * NOTE: This is defensive - ideally positions should come fully formed
   */
  fillMissingFields(position: Position, currentPrice: number): Position {
    // If unrealizedPnL missing, calculate it
    if (typeof position.unrealizedPnL !== 'number') {
      const isLong = position.side === PositionSide.LONG;
      const pnl = isLong
        ? (currentPrice - position.entryPrice) * position.quantity
        : (position.entryPrice - currentPrice) * position.quantity;

      this.logger.info(`[P0.2] Filled missing unrealizedPnL: ${pnl}`, {
        positionId: position.id,
      });

      position.unrealizedPnL = pnl;
    }

    // If marginUsed missing, estimate it
    if (!position.marginUsed || position.marginUsed === 0) {
      position.marginUsed = (position.quantity * position.entryPrice) / position.leverage;
      this.logger.debug(`[P0.2] Estimated marginUsed: ${position.marginUsed}`, {
        positionId: position.id,
      });
    }

    return position;
  }
}
