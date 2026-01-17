/**
 * Position Event Handler
 *
 * Handles all position-related events:
 * - Stop Loss hits (backup price detection)
 * - Take Profit hits (TP level tracking)
 * - Position closed externally (fallback recovery)
 * - Time-based exit (duration limits)
 * - Position monitor errors
 *
 * Extracted from bot.ts setupMonitorHandlers() lines 502-599
 */

import { LoggerService, Position, ExitType, PositionSide } from '../../types';
import type { IExchange } from '../../interfaces/IExchange';
import { PositionLifecycleService } from '../position-lifecycle.service';
import { PositionExitingService } from '../position-exiting.service';
import { TelegramService } from '../telegram.service';
import { StopLossHitEvent, TakeProfitHitEvent, TimeBasedExitEvent } from '../../types';

const DECIMAL_PLACES = {
  PERCENT: 2,
};

/**
 * Handles position-related events from PositionMonitor service
 *
 * Responsibilities:
 * - Log stop loss hits (backup detection)
 * - Log take profit hits
 * - Handle external position closures (fallback recovery)
 * - Handle time-based exits
 * - Log monitor errors
 */
export class PositionEventHandler {
  constructor(
    private positionManager: PositionLifecycleService,
    private positionExitingService: PositionExitingService,
    private bybitService: IExchange,
    private telegram: TelegramService,
    private logger: LoggerService,
  ) {}

  /**
   * Handle stop loss hit event
   *
   * NOTE: This is a BACKUP DETECTION (price-based)
   * Real SL is triggered on exchange via WebSocket 'positionClosed'
   *
   * @param event - Stop loss hit event
   */
  async handleStopLossHit(event: StopLossHitEvent): Promise<void> {
    this.logger.warn('🛑 STOP LOSS HIT (backup price detection)', {
      reason: event.reason,
      positionId: event.position.id,
      loss: event.position.unrealizedPnL,
    });

    // Don't call recordPositionClose() here - let positionClosed event handle it
    // This avoids duplicate recording if both price-check and WebSocket fire

    // Just log that SL was detected
    this.logger.info('SL hit detected via price check - waiting for WebSocket confirmation');
  }

  /**
   * Handle take profit hit event
   *
   * @param event - Take profit hit event
   */
  async handleTakeProfitHit(event: TakeProfitHitEvent): Promise<void> {
    this.logger.info(`TAKE PROFIT ${event.tpLevel} HIT`, {
      reason: event.reason,
      positionId: event.position.id,
      profit: event.position.unrealizedPnL,
    });
  }

  /**
   * Handle position closed externally event
   *
   * NOTE: FALLBACK ONLY - syncClosedPosition() handles recording + cleanup automatically
   * This handler only triggers if syncClosedPosition() throws and emits fallback event
   *
   * @param position - Position that was closed
   */
  async handlePositionClosedExternally(position: Position): Promise<void> {
    this.logger.warn('⚠️ FALLBACK: Position closed externally (syncClosedPosition failed)', {
      positionId: position.id,
      finalPnL: position.unrealizedPnL,
    });

    // Only clearPosition - recordPositionClose already called by syncClosedPosition
    // or will be called by positionClosed WebSocket event
    await this.positionManager.clearPosition();

    // Send basic Telegram notification
    await this.telegram.sendAlert(
      '⚠️ FALLBACK: Position closed externally\n' +
      `Position: ${position.id}\n` +
      `Entry: ${position.entryPrice}\n` +
      'Reason: Sync failed, manual cleanup triggered',
    );
  }

  /**
   * Handle time-based exit event
   *
   * NOTE: BOT INITIATED CLOSE
   * Records close only if exchange close fails (fallback)
   *
   * @param event - Time-based exit event
   */
  async handleTimeBasedExit(event: TimeBasedExitEvent): Promise<void> {
    this.logger.warn('⏰ TIME-BASED EXIT triggered', {
      reason: event.reason,
      openedMinutes: event.openedMinutes?.toFixed(1),
      pnlPercent: event.pnlPercent?.toFixed(DECIMAL_PLACES.PERCENT) + '%',
      positionId: event.position.id,
    });

    // Close position on exchange - let positionClosed event handle recording
    try {
      // Use IExchange interface to close position (100% close)
      await this.bybitService.closePosition({
        positionId: event.position.id,
        percentage: 100,
      });

      this.logger.info('⏰ Time-based exit: Position closed on exchange', {
        positionId: event.position.id,
        reason: event.reason,
      });

      // WebSocket 'positionClosed' will trigger and record the close automatically
      // No need to call recordPositionClose() here - avoid duplicates
    } catch (error) {
      this.logger.error('Failed to close position for time-based exit', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback: record close anyway if exchange close fails
      const currentPrice = event.position.currentPrice || 0;
      const exitReason = `Time-based exit: ${event.reason} (fallback - exchange close failed)`;

      await this.positionExitingService.closeFullPosition(
        event.position as unknown as Position,
        currentPrice,
        exitReason,
        ExitType.TIME_BASED_EXIT,
      );

      await this.positionManager.clearPosition();
    }
  }

  /**
   * Handle position monitor error
   *
   * @param error - Error that occurred in position monitor
   */
  async handleMonitorError(error: Error): Promise<void> {
    this.logger.error('Position Monitor error', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
