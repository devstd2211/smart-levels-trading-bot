/**
 * Position Sync Service
 * Handles position synchronization with exchange
 *
 * Responsibilities:
 * - Detect and handle missed WebSocket close events
 * - Deep sync check for protection verification
 * - Handle emergency position closes
 */

import { Position, PositionSide, LoggerService, BybitOrder, isStopLossOrder, isTakeProfitOrder, ExitType } from '../types';
import { BybitService } from './bybit';
import { PositionLifecycleService } from './position-lifecycle.service';
import { ExitTypeDetectorService } from './exit-type-detector.service';
import { TelegramService } from './telegram.service';
import { DECIMAL_PLACES, TIME_UNITS } from '../constants';
import { INTEGER_MULTIPLIERS } from '../constants/technical.constants';

// ============================================================================
// CONSTANTS
// ============================================================================

const POSITION_SIZE_ZERO = INTEGER_MULTIPLIERS.ZERO;
const DEEP_SYNC_MIN_AGE_MS = 120000; // 2 minutes

// ============================================================================
// POSITION SYNC SERVICE
// ============================================================================

export class PositionSyncService {
  constructor(
    private readonly bybitService: BybitService,
    private readonly positionManager: PositionLifecycleService,
    private readonly exitTypeDetectorService: ExitTypeDetectorService,
    private readonly telegram: TelegramService,
    private readonly logger: LoggerService,
    private readonly positionExitingService: any, // PositionExitingService (optional for now)
  ) {}

  /**
   * Sync closed position state when WebSocket event was missed
   * Queries order history to determine correct exitType
   */
  public async syncClosedPosition(position: Position): Promise<void> {
    this.logger.warn('⚠️ Position closed on exchange but WebSocket event missed', {
      positionId: position.id,
      entryPrice: position.entryPrice,
      side: position.side,
    });

    try {
      // Get order history to determine exitType (optional method)
      let orderHistory: any[] = [];
      if (this.bybitService.getOrderHistory) {
        orderHistory = await this.bybitService.getOrderHistory(20);
      }
      const exitType = this.exitTypeDetectorService.determineExitTypeFromHistory(orderHistory, position);

      // Get current price for PnL calculation
      const currentPrice = await this.bybitService.getCurrentPrice();

      // Record close with correct exitType (NOT MANUAL unless truly manual)
      const exitReason = `Position closed on exchange (WebSocket event missed) - ${exitType}`;

      await this.positionExitingService.closeFullPosition(
        position,
        currentPrice,
        exitReason,
        exitType,
      );

      // Send alert
      await this.telegram.sendAlert(
        '⚠️ SYNC: Position closed on exchange\n' +
        `Exit Type: ${exitType}\n` +
        `Entry: ${position.entryPrice}\n` +
        `Exit: ${currentPrice.toFixed(DECIMAL_PLACES.PRICE)}\n` +
        'Reason: WebSocket event missed',
      );

      // Clear position
      await this.positionManager.clearPosition();

      this.logger.info('✅ Position state synced with exchange', {
        positionId: position.id,
        exitType,
      });
    } catch (error) {
      this.logger.error('Failed to sync closed position', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback: clear position anyway
      await this.positionManager.clearPosition();
    }
  }

  /**
   * Deep sync check - verifies protection is still active
   * Checks:
   * 1. TP/SL orders still active on exchange
   * 2. Stop Loss not missing (emergency close if missing)
   * 3. Position quantity matches exchange
   *
   * Only runs for positions > 2 minutes old
   */
  public async deepSyncCheck(position: Position | null): Promise<void> {
    try {
      // No position or already closed
      if (position === null || position.status === 'CLOSED') {
        return;
      }

      const positionAgeMs = Date.now() - position.openedAt;

      // Only run deep check if position > 2 minutes old
      if (positionAgeMs < DEEP_SYNC_MIN_AGE_MS) {
        return;
      }

      this.logger.debug('🔍 Running deep sync check', {
        positionId: position.id,
        ageMinutes: Math.floor(positionAgeMs / TIME_UNITS.MINUTE),
      });

      // 1. Verify position still exists on exchange
      const exchangePos = await this.bybitService.getPosition();

      if (exchangePos === null || exchangePos.quantity === POSITION_SIZE_ZERO) {
        // Position closed on exchange - already handled by syncClosedPosition
        this.logger.debug('Deep sync: Position closed on exchange (will be handled by monitor)');
        return;
      }

      // 2. Verify TP/SL orders still active
      const activeOrders = await this.bybitService.getActiveOrders();

      // Check for Stop Loss order
      const hasStopLoss = activeOrders.some((order: BybitOrder) => {
        const isSL = isStopLossOrder(order);

        const correctSide = position.side === PositionSide.LONG
          ? order.side === 'Sell'
          : order.side === 'Buy';

        return isSL && correctSide;
      });

      // Check for Take Profit orders
      const hasTakeProfit = activeOrders.some((order: BybitOrder) => {
        const isTP = isTakeProfitOrder(order);

        const correctSide = position.side === PositionSide.LONG
          ? order.side === 'Sell'
          : order.side === 'Buy';

        return isTP && correctSide;
      });

      // Check for Trailing Stop via position info
      let hasTrailingStop = false;
      if (position.stopLoss.isTrailing) {
        hasTrailingStop = true;
        this.logger.debug('Deep sync: Trailing stop active (position flag set)');
      }

      // 🚨 CRITICAL: Stop Loss missing!
      if (!hasStopLoss && !hasTrailingStop) {
        this.logger.error('🚨 CRITICAL: Stop Loss order missing!', {
          positionId: position.id,
          hasTrailing: hasTrailingStop,
          activeOrders: activeOrders.length,
        });

        // FIX: Verify position still exists before emergency close (race condition)
        const preClosePos = await this.bybitService.getPosition();
        if (preClosePos === null || preClosePos.quantity === POSITION_SIZE_ZERO) {
          // Position already closed on exchange during deep sync check
          this.logger.warn('⚠️ Position already closed on exchange (race condition avoided)', {
            positionId: position.id,
          });
          return;
        }

        await this.telegram.sendAlert(
          '🚨 CRITICAL: Stop Loss missing!\n' +
          `Position: ${position.id}\n` +
          `Side: ${position.side}\n` +
          `Entry: ${position.entryPrice}\n` +
          `Age: ${Math.floor(positionAgeMs / TIME_UNITS.MINUTE)} minutes\n` +
          'Action: Closing position immediately',
        );

        // Emergency close
        try {
          await this.bybitService.closePosition(position.side, position.quantity);
          this.logger.warn('✅ Unprotected position closed successfully (deep sync)');
        } catch (closeError) {
          // Check if error is due to zero position (race condition)
          const errorMsg = closeError instanceof Error ? closeError.message : String(closeError);
          if (errorMsg.includes('current position is zero') || errorMsg.includes('zero position')) {
            this.logger.warn('⚠️ Position became zero during close attempt (race condition)', {
              positionId: position.id,
              error: errorMsg,
            });
            return;
          }

          this.logger.error('🚨🚨🚨 CRITICAL: Failed to close unprotected position!', {
            error: errorMsg,
          });

          await this.telegram.sendAlert(
            '🚨🚨🚨 CRITICAL ALERT 🚨🚨🚨\n' +
            `Position ${position.id} is UNPROTECTED and CANNOT BE CLOSED!\n` +
            'MANUAL INTERVENTION REQUIRED IMMEDIATELY!',
          );
        }
        return;
      }

      // 3. Sync position quantity mismatch
      if (Math.abs(exchangePos.quantity - position.quantity) > 0.01) {
        this.logger.warn('Position quantity mismatch - syncing', {
          local: position.quantity,
          exchange: exchangePos.quantity,
          difference: Math.abs(exchangePos.quantity - position.quantity),
        });

        // Update local position quantity
        this.positionManager.syncWithWebSocket(exchangePos);

        await this.telegram.sendAlert(
          '⚠️ Position quantity synced\n' +
          `Position: ${position.id}\n` +
          `Local: ${position.quantity}\n` +
          `Exchange: ${exchangePos.quantity}\n` +
          'Updated to match exchange',
        );
      }

      this.logger.debug('✅ Deep sync check passed', {
        hasStopLoss,
        hasTakeProfit,
        hasTrailingStop,
        quantityMatch: Math.abs(exchangePos.quantity - position.quantity) < 0.01,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Deep sync check failed', {
        error: errorMessage,
      });
      // Re-throw to let caller handle
      throw error;
    }
  }
}
