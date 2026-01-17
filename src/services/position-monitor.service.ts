import { DECIMAL_PLACES, TIME_UNITS } from '../constants';
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
import type { IExchange } from '../interfaces/IExchange';
import { PositionLifecycleService } from './position-lifecycle.service';
import { Position, PositionSide, RiskManagementConfig, LoggerService } from '../types';
import { isCriticalApiError } from '../utils/error-helper';
import { TelegramService } from './telegram.service';
import { ExitTypeDetectorService } from './exit-type-detector.service';
import { PositionPnLCalculatorService } from './position-pnl-calculator.service';
import { PositionSyncService } from './position-sync.service';

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
    private readonly bybitService: IExchange,
    private readonly positionManager: PositionLifecycleService,
    private readonly riskConfig: RiskManagementConfig,
    private readonly telegram: TelegramService,
    private readonly logger: LoggerService,
    private readonly exitTypeDetectorService: ExitTypeDetectorService,
    private readonly pnlCalculator: PositionPnLCalculatorService,
    private readonly positionSyncService: PositionSyncService,
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
      const exchangePosition = await this.bybitService.getPosition(currentPosition.id);

      if (exchangePosition === null || exchangePosition.quantity === POSITION_SIZE_ZERO) {
        // Double-check: position might have been closed by WebSocket during async call
        const pos = this.positionManager.getCurrentPosition();
        if (pos === null || pos.status === 'CLOSED') {
          this.logger.debug('Position closed by WebSocket during monitor check, skipping external event');
          return;
        }

        // Position closed on exchange but WebSocket event missed - sync state
        await this.positionSyncService.syncClosedPosition(currentPosition);
        return;
      }

      // 🚨 CRITICAL: Verify TP/SL protection is active
      // BUT only check ONCE after position open (not every cycle!)
      // After first successful verification, we rely on trailing stop or manual management
      if (!currentPosition.protectionVerifiedOnce) {
        this.logger.debug('🔍 Initial protection verification check...');
        // Convert PositionSide enum to string format for IExchange interface
        const sideStr = currentPosition.side === PositionSide.LONG ? 'Buy' : 'Sell';

        if (!this.bybitService.verifyProtectionSet) {
          this.logger.warn('⚠️ verifyProtectionSet not available, skipping protection check');
          return;
        }

        const protection = await this.bybitService.verifyProtectionSet(sideStr);

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
            await this.bybitService.closePosition({ positionId: currentPosition.id, percentage: 100 });

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
    const pnlPercent = this.pnlCalculator.calculatePnL(position, currentPrice);

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

  // ==========================================================================
  // SAFETY MONITOR: SYNC WITH EXCHANGE
  // ==========================================================================


  // ==========================================================================
  // DEEP SYNC CHECK (Level 2 Safety)
  // ==========================================================================

  /**
   * Deep sync check - runs every 30s for positions > 2 minutes old
   * Delegates to PositionSyncService for verification logic
   */
  private async deepSyncCheck(): Promise<void> {
    try {
      const position = this.positionManager.getCurrentPosition();
      await this.positionSyncService.deepSyncCheck(position);
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
