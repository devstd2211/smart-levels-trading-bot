import { DECIMAL_PLACES, PERCENT_MULTIPLIER, TIME_UNITS } from '../constants';
import { TIME_MULTIPLIERS, INTEGER_MULTIPLIERS, POSITION_MONITOR_INTERVAL_MS } from '../constants/technical.constants';
/**
 * Position Monitor Service
 * Monitors open positions for TP/SL hits via WebSocket events
 *
 * Responsibilities:
 * 1. Listen to WebSocket order execution events
 * 2. Detect TP hits and trigger breakeven/trailing logic
 * 3. Periodic sync check with exchange
 *
 * Single Responsibility: Position monitoring and TP/SL event handling
 */

import { EventEmitter } from 'events';
import { BybitService } from './bybit';
import { PositionManagerService } from './position-manager.service';
import { Position, PositionSide, RiskManagementConfig, LoggerService, ExitType, BybitOrder, isStopLossOrder, isTakeProfitOrder } from '../types';
import { isCriticalApiError } from '../utils/error-helper';
import { TelegramService } from './telegram.service';

// ============================================================================
// CONSTANTS
// ============================================================================

const POSITION_SIZE_ZERO = INTEGER_MULTIPLIERS.ZERO;

// ============================================================================
// POSITION MONITOR SERVICE
// ============================================================================

export class PositionMonitorService extends EventEmitter {
  private monitorInterval: NodeJS.Timeout | null = null;
  private deepSyncInterval: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;
  private criticalErrorEmitted = false; // Prevent duplicate critical error handling

  constructor(
    private readonly bybitService: BybitService,
    private readonly positionManager: PositionManagerService,
    private readonly riskConfig: RiskManagementConfig,
    private readonly telegram: TelegramService,
    private readonly logger: LoggerService,
    private readonly positionExitingService?: any, // PositionExitingService (optional for now)
  ) {
    super();
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Start monitoring positions
   */
  start(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;

    // Level 1: Position consistency check (every 10s)
    this.monitorInterval = setInterval(() => {
      void this.monitorPosition();
    }, POSITION_MONITOR_INTERVAL_MS);

    // Level 2: Deep sync check (every 30s)
    this.deepSyncInterval = setInterval(() => {
      void this.deepSyncCheck();
    }, 30000); // 30 seconds

    this.emit('started');
  }

  /**
   * Stop monitoring positions
   */
  stop(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.monitorInterval !== null) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    if (this.deepSyncInterval !== null) {
      clearInterval(this.deepSyncInterval);
      this.deepSyncInterval = null;
    }

    this.emit('stopped');
  }

  /**
   * Check if monitoring is active
   */
  isActive(): boolean {
    return this.isMonitoring;
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Monitor position (called periodically)
   * This is a safety check - main logic is driven by WebSocket events
   */
  private async monitorPosition(): Promise<void> {
    try {
      // 1. Get current position from memory
      const currentPosition = this.positionManager.getCurrentPosition();

      if (currentPosition === null) {
        return;
      }

      // FIX: Skip monitoring if position already closed (prevents duplicate external close events)
      if (currentPosition.status === 'CLOSED') {
        this.logger.debug('Position already closed, skipping monitor check');
        return;
      }

      // 2. SAFETY CHECK: Verify position exists on exchange
      const exchangePosition = await this.bybitService.getPosition();

      if (exchangePosition === null || exchangePosition.quantity === POSITION_SIZE_ZERO) {
        // Double-check: position might have been closed by WebSocket during async call
        const pos = this.positionManager.getCurrentPosition();
        if (pos === null || pos.status === 'CLOSED') {
          this.logger.debug('Position closed by WebSocket during monitor check, skipping external event');
          return;
        }

        // Position closed on exchange but WebSocket event missed - sync state
        await this.syncClosedPosition(currentPosition);
        return;
      }

      // 🚨 CRITICAL: Verify TP/SL protection is active
      // BUT only check ONCE after position open (not every cycle!)
      // After first successful verification, we rely on trailing stop or manual management
      if (!currentPosition.protectionVerifiedOnce) {
        this.logger.debug('🔍 Initial protection verification check...');
        const protection = await this.bybitService.verifyProtectionSet(currentPosition.side);

        if (!protection.verified) {
          this.logger.error('🚨 UNPROTECTED POSITION DETECTED - CLOSING IMMEDIATELY!', {
            positionId: currentPosition.id,
            side: currentPosition.side,
            entryPrice: currentPosition.entryPrice,
            hasStopLoss: protection.hasStopLoss,
            hasTakeProfit: protection.hasTakeProfit,
            hasTrailingStop: protection.hasTrailingStop,
            activeOrders: protection.activeOrders,
          });

          // Close position immediately - no emergency protection attempts
          try {
            await this.bybitService.closePosition(currentPosition.side, currentPosition.quantity);

            await this.telegram.sendAlert(
              '🚨 UNPROTECTED POSITION CLOSED @ market price!\n' +
              `Side: ${currentPosition.side}\n` +
              `Entry: ${currentPosition.entryPrice}\n` +
              'Reason: No SL/TP protection detected',
            );

            this.emit('positionClosedEmergency', currentPosition);
            await this.positionManager.clearPosition();

            this.logger.warn('✅ Unprotected position closed successfully');
            return; // Exit monitoring - position closed
          } catch (closeError) {
            this.logger.error('🚨🚨🚨 CRITICAL: Failed to close unprotected position!', {
              error: closeError instanceof Error ? closeError.message : String(closeError),
            });

            await this.telegram.sendAlert(
              '🚨🚨🚨 CRITICAL ALERT 🚨🚨🚨\n' +
              `Position ${currentPosition.id} is UNPROTECTED and CANNOT BE CLOSED!\n` +
              'MANUAL INTERVENTION REQUIRED IMMEDIATELY!\n' +
              `Side: ${currentPosition.side}\n` +
              `Entry: ${currentPosition.entryPrice}\n` +
              `Quantity: ${currentPosition.quantity}`,
            );
            return; // Exit monitoring - manual intervention needed
          }
        } else {
          // Protection verified - set flag to skip future checks
          currentPosition.protectionVerifiedOnce = true;
          this.logger.info('✅ Protection verified - no further checks needed', {
            positionId: currentPosition.id,
            hasTrailingStop: protection.hasTrailingStop,
          });
        }
      }

      // 3. Get current price
      let currentPrice: number;
      try {
        currentPrice = await this.bybitService.getCurrentPrice();
      } catch (priceError) {
        this.logger.warn('Failed to get current price', {
          error: priceError instanceof Error ? priceError.message : String(priceError),
        });
        return; // Skip this monitoring cycle
      }

      // Race condition check: position might have closed during API call
      if (this.positionManager.getCurrentPosition() === null) {
        this.logger.debug('Position closed during price fetch, skipping checks');
        return;
      }

      // 4. Check if SL hit (safety backup - primary detection via WebSocket)
      const slHit = this.checkStopLoss(currentPosition, currentPrice);
      if (slHit) {
        this.emit('stopLossHit', {
          position: currentPosition,
          currentPrice,
          reason: `Stop Loss hit at ${currentPrice}`,
        });
      }

      // 5. TP detection now handled via WebSocket 'order' topic
      // No more price-based TP checking - WebSocket provides real-time TP fills

      // 6. Check time-based exit (if enabled)
      let timeBasedExit;
      try {
        timeBasedExit = this.checkTimeBasedExit(currentPosition, currentPrice);
      } catch (timeExitError) {
        this.logger.warn('Failed to check time-based exit', {
          error: timeExitError instanceof Error ? timeExitError.message : String(timeExitError),
        });
        return; // Skip this monitoring cycle
      }

      if (timeBasedExit.shouldExit) {
        this.emit('timeBasedExit', {
          position: currentPosition,
          currentPrice,
          reason: timeBasedExit.reason,
          openedMinutes: timeBasedExit.openedMinutes,
          pnlPercent: timeBasedExit.pnlPercent,
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Check if this is a critical API error (e.g., API key expired)
      if (isCriticalApiError(error)) {
        // Prevent duplicate handling
        if (this.criticalErrorEmitted) {
          return;
        }
        this.criticalErrorEmitted = true;

        this.logger.error('🚨🚨🚨 CRITICAL: API error requires IMMEDIATE shutdown! 🚨🚨🚨', {
          message: errorMessage,
          stack: errorStack,
          isCritical: true,
        });

        // Stop monitoring immediately
        this.stop();
        this.logger.error('✅ Position monitor stopped immediately');

        // Send alert (don't await to avoid delays)
        this.telegram.sendAlert(
          '🚨🚨🚨 CRITICAL: API Authentication Failed 🚨🚨🚨\n' +
          `Error: ${errorMessage}\n` +
          'Bot will shutdown immediately.',
        ).catch((telegramError) => {
          this.logger.error('Failed to send Telegram alert', {
            error: telegramError instanceof Error ? telegramError.message : String(telegramError),
          });
        });

        // Emit critical error event - bot should handle this and shutdown
        // Use setImmediate to ensure it's processed as soon as possible
        setImmediate(() => {
          this.emit('critical-error', error);
        });
      } else {
        this.logger.error('Position Monitor caught error', {
          message: errorMessage,
          stack: errorStack,
        });
        this.emit('error', error);
      }
    }
  }

  /**
   * Check if stop-loss is hit
   */
  private checkStopLoss(position: Position, currentPrice: number): boolean {
    if (position.side === PositionSide.LONG) {
      return currentPrice <= position.stopLoss.price;
    } else {
      return currentPrice >= position.stopLoss.price;
    }
  }

  // REMOVED: checkTakeProfits() - TP detection now handled via WebSocket 'order' topic
  // Price-based TP checking was unreliable (missed TPs when price retraced before next check)
  // Real-time TP fills now detected through WebSocket events

  /**
   * Check time-based exit conditions
   * Exit if position is open for too long without significant profit
   *
   * @param position - Current position
   * @param currentPrice - Current market price
   * @returns Exit decision with reason
   */
  private checkTimeBasedExit(
    position: Position,
    currentPrice: number,
  ): {
    shouldExit: boolean;
    reason?: string;
    openedMinutes?: number;
    pnlPercent?: number;
  } {
    // Check if time-based exit is enabled
    const enabled = this.riskConfig.timeBasedExitEnabled ?? false;
    if (!enabled) {
      return { shouldExit: false };
    }

    // Get config (with defaults)
    const maxMinutes = this.riskConfig.timeBasedExitMinutes ?? 30;
    const minPnlPercent = this.riskConfig.timeBasedExitMinPnl ?? 0.2;

    // Calculate how long position has been open (in minutes)
    const openedMs = Date.now() - position.openedAt;
    const openedMinutes = openedMs / TIME_MULTIPLIERS.MILLISECONDS_PER_SECOND / INTEGER_MULTIPLIERS.SIXTY;

    // Calculate current PnL %
    const pnlPercent = this.calculatePnL(position, currentPrice);

    // Log current state (debug)
    if (openedMinutes > maxMinutes / 2) {
      // Log when position is open for more than half the max time
      this.logger.debug('Time-based exit check', {
        openedMinutes: openedMinutes.toFixed(1),
        maxMinutes,
        pnlPercent: pnlPercent.toFixed(DECIMAL_PLACES.PERCENT),
        minPnlPercent,
      });
    }

    // Check if should exit
    if (openedMinutes > maxMinutes && pnlPercent < minPnlPercent) {
      return {
        shouldExit: true,
        reason: `Position open for ${openedMinutes.toFixed(0)} min with low PnL (${pnlPercent.toFixed(DECIMAL_PLACES.PERCENT)}%)`,
        openedMinutes,
        pnlPercent,
      };
    }

    return { shouldExit: false };
  }

  /**
   * Calculate current PnL percentage
   *
   * @param position - Current position
   * @param currentPrice - Current market price
   * @returns PnL in percentage
   */
  private calculatePnL(position: Position, currentPrice: number): number {
    if (position.side === PositionSide.LONG) {
      return ((currentPrice - position.entryPrice) / position.entryPrice) * PERCENT_MULTIPLIER;
    } else {
      return ((position.entryPrice - currentPrice) / position.entryPrice) * PERCENT_MULTIPLIER;
    }
  }

  // ==========================================================================
  // SAFETY MONITOR: SYNC WITH EXCHANGE
  // ==========================================================================

  /**
   * Sync closed position state when WebSocket event was missed
   * Queries order history to determine correct exitType
   */
  private async syncClosedPosition(position: Position): Promise<void> {
    this.logger.warn('⚠️ Position closed on exchange but WebSocket event missed', {
      positionId: position.id,
      entryPrice: position.entryPrice,
      side: position.side,
    });

    try {
      // Get order history to determine exitType
      const orderHistory = await this.bybitService.getOrderHistory(20);
      const exitType = this.determineExitTypeFromHistory(orderHistory, position);

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

      // Fallback: emit external close event
      this.emit('positionClosedExternally', position);
      await this.positionManager.clearPosition();
    }
  }

  /**
   * Determine exitType from order history
   * Analyzes filled orders to understand how position was closed
   */
  private determineExitTypeFromHistory(orderHistory: BybitOrder[], position: Position): ExitType {
    // Find filled orders for this symbol
    const filledOrders = orderHistory
      .filter((o) => o.symbol === position.symbol && o.orderStatus === 'Filled')
      .sort((a, b) => {
        const aTime = (a as Record<string, unknown>).updatedTime as number;
        const bTime = (b as Record<string, unknown>).updatedTime as number;
        return bTime - aTime;
      }); // Most recent first

    if (filledOrders.length === 0) {
      this.logger.warn('No filled orders found in history, assuming MANUAL close');
      return ExitType.MANUAL;
    }

    // Check last filled order
    const lastOrder = filledOrders[0];

    // Stop Loss: triggerPrice exists + reduceOnly + side matches close direction
    if (lastOrder.stopOrderType === 'Stop' || lastOrder.stopOrderType === 'StopLoss') {
      return ExitType.STOP_LOSS;
    }

    // Trailing Stop
    if (lastOrder.stopOrderType === 'TrailingStop') {
      return ExitType.TRAILING_STOP;
    }

    // Take Profit: Limit order + reduceOnly
    if (lastOrder.orderType === 'Limit' && lastOrder.reduceOnly === true) {
      // Try to determine TP level from price
      const tpLevel = this.identifyTPLevel(parseFloat(lastOrder.price), position);
      if (tpLevel === 1) {
        return ExitType.TAKE_PROFIT_1;
      }
      if (tpLevel === 2) {
        return ExitType.TAKE_PROFIT_2;
      }
      if (tpLevel === 3) {
        return ExitType.TAKE_PROFIT_3;
      }
      return ExitType.TAKE_PROFIT_1; // Fallback
    }

    // Market order + reduceOnly = likely manual close
    if (lastOrder.orderType === 'Market' && lastOrder.reduceOnly === true) {
      return ExitType.MANUAL;
    }

    this.logger.warn('Could not determine exitType from order history', {
      lastOrderType: lastOrder.orderType,
      stopOrderType: lastOrder.stopOrderType,
      reduceOnly: lastOrder.reduceOnly,
    });

    return ExitType.MANUAL; // Fallback
  }

  /**
   * Identify TP level from price
   * Returns 1, 2, or 3 based on which TP level price is closest to
   */
  private identifyTPLevel(price: number, position: Position): number {
    const tpLevels = position.takeProfits;

    if (tpLevels.length === 0) {
      return 1; // Default
    }

    // Find closest TP level
    let closestLevel = 1;
    let closestDistance = Math.abs(price - tpLevels[0].price);

    for (let i = 1; i < tpLevels.length; i++) {
      const distance = Math.abs(price - tpLevels[i].price);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestLevel = i + 1;
      }
    }

    return closestLevel;
  }

  // ==========================================================================
  // DEEP SYNC CHECK (Level 2 Safety)
  // ==========================================================================

  /**
   * Deep sync check - runs every 30s for positions > 2 minutes old
   * Verifies:
   * 1. TP/SL orders still active on exchange
   * 2. Stop Loss not missing (emergency close if missing)
   * 3. Position quantity matches exchange
   */
  private async deepSyncCheck(): Promise<void> {
    try {
      const position = this.positionManager.getCurrentPosition();

      // No position or already closed
      if (position === null || position.status === 'CLOSED') {
        return;
      }

      const positionAgeMs = Date.now() - position.openedAt;

      // Only run deep check if position > 2 minutes old
      if (positionAgeMs < 120000) {
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

      // Check if this is a critical API error
      if (isCriticalApiError(error)) {
        // Prevent duplicate handling
        if (this.criticalErrorEmitted) {
          return;
        }
        this.criticalErrorEmitted = true;

        this.logger.error('🚨🚨🚨 CRITICAL: API error during deep sync check - IMMEDIATE shutdown! 🚨🚨🚨', {
          error: errorMessage,
          isCritical: true,
        });

        // Stop monitoring immediately
        this.stop();
        this.logger.error('✅ Position monitor stopped immediately (deep sync)');

        // Send alert (don't await to avoid delays)
        this.telegram.sendAlert(
          '🚨🚨🚨 CRITICAL: API Authentication Failed (Deep Sync) 🚨🚨🚨\n' +
          `Error: ${errorMessage}\n` +
          'Bot will shutdown immediately.',
        ).catch((telegramError) => {
          this.logger.error('Failed to send Telegram alert', {
            error: telegramError instanceof Error ? telegramError.message : String(telegramError),
          });
        });

        // Emit critical error event - bot should handle this and shutdown
        setImmediate(() => {
          this.emit('critical-error', error);
        });
      } else {
        this.logger.error('Deep sync check failed', {
          error: errorMessage,
        });
      }
    }
  }
}
