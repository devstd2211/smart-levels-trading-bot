/**
 * Position Exiting Service
 * Single Responsibility: Execute position exit actions from ExitOrchestrator
 *
 * Extracted from PositionLifecycleService.closeFullPosition(), closePartialPosition(), etc:
 * - Execute partial/full closes
 * - Update stop-loss and trailing stops
 * - Record exit in journal with PnL calculation
 * - Send Telegram notifications
 * - Update session stats
 * - Handle state cleanup
 *
 * Dependencies:
 * - BybitService (for exchange operations)
 * - TradingJournalService (for recording)
 * - TelegramService (for notifications)
 * - SessionStatsService (for session tracking)
 * - LoggerService (for logging)
 * - PositionLifecycleService (for accessing TakeProfitManager)
 */

import {
  LoggerService,
  Position,
  ExitType,
  ExitAction,
  PositionSide,
  TradingConfig,
  RiskManagementConfig,
  Config,
} from '../types';
import { ExitActionDTO } from '../types/architecture.types';
import type { IExchange } from '../interfaces/IExchange';
import { TelegramService } from './telegram.service';
import { TradingJournalService } from './trading-journal.service';
import { SessionStatsService } from './session-stats.service';
import { PositionLifecycleService } from './position-lifecycle.service';
import { RealityCheckService } from './reality-check.service';
import { DECIMAL_PLACES, PERCENT_MULTIPLIER, TIME_UNITS, TIME_MULTIPLIERS } from '../constants';
import { ErrorHandler, RecoveryStrategy } from '../errors';

// ============================================================================
// POSITION EXITING SERVICE
// ============================================================================

export class PositionExitingService {
  // [P3] Atomic lock pattern: prevent concurrent close attempts on same position
  // Maps positionId → Promise of close operation in progress
  private readonly closeOperationLock = new Map<string, Promise<void>>();

  constructor(
    private readonly bybitService: IExchange,
    private readonly telegram: TelegramService,
    private readonly logger: LoggerService,
    private readonly journal: TradingJournalService,
    private readonly tradingConfig: TradingConfig,
    private readonly riskConfig: RiskManagementConfig,
    private readonly fullConfig: Config,
    private readonly sessionStats?: SessionStatsService,
    private readonly positionManager?: PositionLifecycleService, // For accessing takeProfitManager
    private readonly realityCheck?: RealityCheckService, // For analyzing trades when they close
  ) {}

  /**
   * Execute exit action (partial or full close)
   * This is called by TradingOrchestrator in response to ExitOrchestrator decisions
   *
   * @param position - Current position to close/reduce
   * @param action - Exit action to execute (CLOSE_PERCENT, UPDATE_SL, etc.)
   * @param exitPrice - Current market price for exit
   * @param exitReason - Reason for exit (TP1_HIT, SL_HIT, etc.)
   * @param exitType - Exit type (TAKE_PROFIT, STOP_LOSS, etc.)
   * @returns true if action executed successfully
   */
  async executeExitAction(
    position: Position,
    action: ExitActionDTO,
    exitPrice: number,
    exitReason: string,
    exitType: ExitType,
  ): Promise<boolean> {
    try {
      // Validate inputs
      if (!position) {
        throw new Error('Position required for exit action');
      }

      if (position.status === 'CLOSED') {
        this.logger.debug('Position already closed, skipping action', { positionId: position.id });
        return false;
      }

      // Route action to appropriate handler
      switch (action.action) {
        case ExitAction.CLOSE_PERCENT:
          return await this.closePartialPosition(position, action.percent, exitPrice, exitReason, exitType);

        case ExitAction.CLOSE_ALL:
          return await this.closeFullPosition(position, exitPrice, exitReason, exitType);

        case ExitAction.UPDATE_SL:
          return await this.updateStopLoss(position, action.newStopLoss);

        case ExitAction.ACTIVATE_TRAILING:
          return await this.activateTrailingStop(position, (action as any).trailingPercent, exitPrice);

        default:
          this.logger.warn('Unknown exit action', { action: action.action });
          return false;
      }
    } catch (error) {
      this.logger.error('Failed to execute exit action', {
        error: error instanceof Error ? error.message : String(error),
        positionId: position?.id,
        action: action?.action,
      });
      return false;
    }
  }

  /**
   * Close partial position (e.g., 50% on TP1)
   *
   * @param position - Current position
   * @param closePercent - Percentage to close (0-100)
   * @param exitPrice - Exit price
   * @param exitReason - Reason for exit
   * @param exitType - Exit type
   */
  private async closePartialPosition(
    position: Position,
    closePercent: number,
    exitPrice: number,
    exitReason: string,
    exitType: ExitType,
  ): Promise<boolean> {
    try {
      const quantityToClose = (position.quantity * closePercent) / 100;

      this.logger.info('📉 Closing partial position', {
        positionId: position.id,
        closePercent,
        quantityToClose: quantityToClose.toFixed(8),
        remainingQuantity: (position.quantity - quantityToClose).toFixed(8),
      });

      // Close on exchange using IExchange interface
      // Calculate percentage to close (quantityToClose is the amount, position.quantity is total)
      const percentageToClose = (quantityToClose / position.quantity) * 100;
      await this.bybitService.closePosition({
        positionId: position.id,
        percentage: percentageToClose,
      });

      // Update position quantity
      position.quantity -= quantityToClose;

      // Record partial close in TakeProfitManager if available
      const takeProfitManager = this.positionManager?.getTakeProfitManager();
      if (takeProfitManager) {
        // GUARD: Validate quantityToClose is a valid number before recording
        if (quantityToClose && typeof quantityToClose === 'number' && !isNaN(quantityToClose) && isFinite(quantityToClose)) {
          // Find TP level that matches this exit price (within tolerance)
          const matchedTP = position.takeProfits.find(tp =>
            Math.abs(tp.price - exitPrice) / exitPrice < 0.01 // 1% tolerance
          );
          if (matchedTP) {
            takeProfitManager.recordPartialClose(matchedTP.level, quantityToClose, exitPrice);
          }
        } else {
          this.logger.error('❌ Invalid quantityToClose for recording partial close', {
            positionId: position.id,
            quantityToClose,
            type: typeof quantityToClose,
          });
        }
      }

      // Calculate PnL for this partial close
      const priceDiff = exitPrice - position.entryPrice;
      const isLong = position.side === PositionSide.LONG;
      const pnlMultiplier = isLong ? 1 : -1;
      const partialPnL = priceDiff * quantityToClose * pnlMultiplier * this.tradingConfig.leverage;
      const partialFees = (position.entryPrice * quantityToClose + exitPrice * quantityToClose) * this.tradingConfig.tradingFeeRate;

      this.logger.info('💰 Partial close PnL', {
        partialPnL: partialPnL.toFixed(DECIMAL_PLACES.PRICE),
        fees: partialFees.toFixed(DECIMAL_PLACES.PRICE),
        netPnL: (partialPnL - partialFees).toFixed(DECIMAL_PLACES.PRICE),
      });

      // Send notification
      await this.telegram.sendAlert(
        `📉 Partial Close (${closePercent}%)\nExit: ${exitPrice.toFixed(8)}\nPnL: ${partialPnL.toFixed(4)} USDT`,
      );

      return true;
    } catch (error) {
      this.logger.error('Failed to close partial position', {
        error: error instanceof Error ? error.message : String(error),
        positionId: position.id,
      });
      return false;
    }
  }

  /**
   * Close full position and record in journal with ErrorHandler integration
   * Uses atomic lock pattern to prevent concurrent close race conditions
   *
   * @param position - Current position
   * @param exitPrice - Exit price
   * @param exitReason - Reason for exit
   * @param exitType - Exit type
   */
  async closeFullPosition(
    position: Position | null | undefined,
    exitPrice: number,
    exitReason: string,
    exitType: ExitType,
  ): Promise<boolean> {
    try {
      // [P3] Idempotent close: gracefully handle missing position
      if (!position) {
        this.logger.warn('❌ closeFullPosition called with null/undefined position', {
          exitReason,
          exitType,
        });
        return false;
      }

      // [P3] Atomic lock: prevent concurrent close attempts on same position
      if (this.closeOperationLock.has(position.id)) {
        this.logger.warn('⚠️ Close operation already in progress for position', {
          positionId: position.id,
        });
        // Wait for concurrent operation to complete, then return false (already handled)
        await this.closeOperationLock.get(position.id);
        return false;
      }

      // Mark as CLOSED BEFORE any async operations (prevent race conditions)
      const wasAlreadyClosed = position.status === 'CLOSED';
      position.status = 'CLOSED';

      if (wasAlreadyClosed) {
        this.logger.debug('Position already marked closed, skipping', {
          positionId: position.id,
        });
        return false;
      }

      this.logger.info('📍 Closing full position', {
        positionId: position.id,
        quantity: position.quantity,
        exitPrice,
        exitReason,
      });

      // [P3] Create atomic lock promise for this close operation
      const closePromise = this.executeAtomicClose(position, exitPrice, exitReason, exitType)
        .finally(() => {
          // [P3] Clean up lock after operation completes
          this.closeOperationLock.delete(position.id);
        });

      // Store promise in lock map
      this.closeOperationLock.set(position.id, closePromise);

      // Wait for operation to complete
      await closePromise;
      return true;
    } catch (error) {
      this.logger.error('Failed to close full position', {
        error: error instanceof Error ? error.message : String(error),
        positionId: position?.id || 'UNKNOWN',
      });
      if (position) {
        position.status = 'OPEN'; // Revert status on any error
        this.closeOperationLock.delete(position.id); // Clean up lock
      }
      return false;
    }
  }

  /**
   * [P3] Execute atomic close operation within lock
   * Called within atomic lock to prevent concurrent modifications
   */
  private async executeAtomicClose(
    position: Position,
    exitPrice: number,
    exitReason: string,
    exitType: ExitType,
  ): Promise<void> {
    // Phase 8: ErrorHandler integration - RETRY strategy for exchange operations
    try {
      await this.closePositionWithRetry(position, exitPrice);
    } catch (closeError) {
      const errorMsg = closeError instanceof Error ? closeError.message : String(closeError);
      // If position is already zero, this is expected (closed by SL/TP on exchange)
      if (errorMsg.includes('position is zero') || errorMsg.includes('reduce-only')) {
        this.logger.info('📝 Position already closed on exchange (SL/TP triggered)', {
          positionId: position.id,
        });
      } else {
        // Re-throw unexpected errors
        throw closeError;
      }
    }

    // Cancel any remaining SL/TP orders
    this.logger.debug('🧹 Cancelling conditional orders after close');
    try {
      await this.bybitService.cancelAllConditionalOrders();
    } catch (error) {
      this.logger.warn('Failed to cancel orders after close', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Calculate final PnL
    const holdingTimeMs = Date.now() - position.openedAt;
    const holdingTimeMinutes = holdingTimeMs / TIME_UNITS.MINUTE;

    let realizedPnL: number;
    let tpLevelsHit: number[] = [];

    const takeProfitManager = this.positionManager?.getTakeProfitManager?.();
    if (takeProfitManager) {
      const finalPnL = takeProfitManager.calculateFinalPnL(exitPrice);
      realizedPnL = finalPnL.totalPnL.pnlNet;
      tpLevelsHit = takeProfitManager.getTpLevelsHit?.() || [];

      this.logger.info('📊 Final PnL calculated (with partial closes)', {
        totalPnL: realizedPnL.toFixed(DECIMAL_PLACES.PRICE),
        fees: finalPnL.totalPnL.fees.toFixed(DECIMAL_PLACES.PRICE),
        tpLevelsHit: tpLevelsHit.length,
      });
    } else {
      // Simple PnL calculation without partial closes
      const priceDiff = exitPrice - position.entryPrice;
      const isLong = position.side === PositionSide.LONG;
      const pnlMultiplier = isLong ? 1 : -1;

      const pnlGross = priceDiff * position.quantity * pnlMultiplier * this.tradingConfig.leverage;
      const tradingFees = (position.entryPrice * position.quantity + exitPrice * position.quantity) * this.tradingConfig.tradingFeeRate;

      realizedPnL = pnlGross - tradingFees;

      this.logger.info('📊 PnL calculated (simple)', {
        pnlGross: pnlGross.toFixed(DECIMAL_PLACES.PRICE),
        fees: tradingFees.toFixed(DECIMAL_PLACES.PRICE),
        netPnL: realizedPnL.toFixed(DECIMAL_PLACES.PRICE),
      });
    }

    // Phase 8: ErrorHandler integration - FALLBACK strategy for journal
    let journalResult: { rollback: () => void } | null = null;
    try {
      journalResult = await this.recordPositionCloseInJournalWithFallback(position, exitPrice, realizedPnL, exitReason, exitType, tpLevelsHit, holdingTimeMs);
    } catch (journalError) {
      // [P1] Journal recording failed - log error but don't fail close
      // Position is already marked CLOSED, journal will be retried later
      this.logger.error('❌ Journal recording failed', {
        error: journalError instanceof Error ? journalError.message : String(journalError),
        positionId: position.id,
      });
      // Continue with stats update since position close succeeded on exchange
    }

    // [P1] Update session stats with error handling (rollback on failure)
    if (this.sessionStats && position.journalId) {
      const priceDiff = exitPrice - position.entryPrice;
      const isLong = position.side === PositionSide.LONG;
      const pnlMultiplier = isLong ? 1 : -1;
      const pnlPercent = (priceDiff / position.entryPrice) * PERCENT_MULTIPLIER * pnlMultiplier;

      try {
        this.sessionStats.updateTradeExit(position.journalId, {
          exitPrice,
          pnl: realizedPnL,
          pnlPercent,
          exitType,
          tpHitLevels: tpLevelsHit,
          holdingTimeMs,
          stopLoss: {
            initial: position.stopLoss.initialPrice || position.stopLoss.price,
            final: position.stopLoss.price,
            movedToBreakeven: position.stopLoss.isBreakeven,
            trailingActivated: position.stopLoss.isTrailing,
          },
        });
      } catch (statsError) {
        // [P1] CRITICAL: Session stats update failed - rollback journal
        this.logger.error('❌ CRITICAL: Session stats update failed - rolling back journal', {
          error: statsError instanceof Error ? statsError.message : String(statsError),
          journalId: position.journalId,
        });

        // Rollback journal if we have rollback function
        if (journalResult?.rollback) {
          journalResult.rollback();
        }

        position.status = 'OPEN'; // Revert status
        throw statsError; // Propagate to outer catch
      }
    }

    // Phase 8: ErrorHandler integration - SKIP strategy for Telegram notifications
    const priceDiff = exitPrice - position.entryPrice;
    const isLong = position.side === PositionSide.LONG;
    const pnlMultiplier = isLong ? 1 : -1;
    const pnlPercent = (priceDiff / position.entryPrice) * PERCENT_MULTIPLIER * pnlMultiplier;

    await this.sendExitNotificationWithSkip(position, exitType, exitPrice, realizedPnL, pnlPercent);
  }

  /**
   * [P3] Close position on exchange with RETRY strategy
   * Implements exponential backoff for transient API errors
   */
  private async closePositionWithRetry(position: Position, exitPrice: number): Promise<void> {
    const maxAttempts = 3;
    const initialDelayMs = 500;
    const backoffMultiplier = 2;
    const maxDelayMs = 5000;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.bybitService.closePosition({
          positionId: position.id,
          percentage: 100, // Close fully
        });
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxAttempts) {
          // Calculate exponential backoff delay
          const delayMs = Math.min(initialDelayMs * Math.pow(backoffMultiplier, attempt - 1), maxDelayMs);

          this.logger.warn(`🔄 Retrying close position (attempt ${attempt}/${maxAttempts})`, {
            positionId: position.id,
            delayMs,
            error: lastError.message,
          });

          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    // All retries exhausted - use ErrorHandler to classify the error
    const handled = await ErrorHandler.handle(lastError, {
      strategy: RecoveryStrategy.RETRY,
      logger: this.logger,
      context: 'PositionExitingService.closePositionWithRetry',
      retryConfig: {
        maxAttempts,
        initialDelayMs,
        backoffMultiplier,
        maxDelayMs,
      },
    });

    if (!handled.success) {
      throw lastError || new Error('Failed to close position after retries');
    }
  }

  /**
   * Phase 8: Record position close with FALLBACK strategy
   * If journal fails, gracefully degrade to empty rollback function
   */
  private async recordPositionCloseInJournalWithFallback(
    position: Position,
    exitPrice: number,
    realizedPnL: number,
    exitReason: string,
    exitType: ExitType,
    tpLevelsHit: number[],
    holdingTimeMs: number,
  ): Promise<{ rollback: () => void }> {
    try {
      // Try to record in journal
      return await this.recordPositionCloseInJournal(position, exitPrice, realizedPnL, exitReason, exitType, tpLevelsHit, holdingTimeMs);
    } catch (error) {
      // Journal recording failed - use ErrorHandler with FALLBACK strategy
      const handled = await ErrorHandler.handle(error, {
        strategy: RecoveryStrategy.FALLBACK,
        logger: this.logger,
        context: 'PositionExitingService.recordPositionCloseInJournal',
        onRecover: () => {
          this.logger.warn('⚠️ Journal recording failed, using fallback (no-op rollback)', {
            positionId: position.id,
          });
        },
      });

      // Return empty rollback function - graceful degradation
      return { rollback: () => {} };
    }
  }

  /**
   * Phase 8: Send exit notification with SKIP strategy
   * If telegram fails, don't fail the entire close operation
   */
  private async sendExitNotificationWithSkip(
    position: Position,
    exitType: ExitType,
    exitPrice: number,
    realizedPnL: number,
    pnlPercent: number,
  ): Promise<void> {
    try {
      await this.telegram.sendAlert(
        `🏁 Position Closed\nExit Type: ${exitType}\nExit: ${exitPrice.toFixed(8)}\nPnL: ${realizedPnL.toFixed(4)} USDT (${pnlPercent.toFixed(2)}%)`,
      );
    } catch (error) {
      // Notification failed - use ErrorHandler with SKIP strategy
      const handled = await ErrorHandler.handle(error, {
        strategy: RecoveryStrategy.SKIP,
        logger: this.logger,
        context: 'PositionExitingService.sendExitNotification',
        onRecover: () => {
          this.logger.warn('⚠️ Exit notification failed, skipping notification', {
            positionId: position.id,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      });

      // Continue without throwing - SKIP means we log and continue
    }
  }

  /**
   * Update stop-loss price
   *
   * @param position - Current position
   * @param newStopLoss - New SL price
   */
  private async updateStopLoss(position: Position, newStopLoss: number): Promise<boolean> {
    try {
      // Validate SL update is in favorable direction
      const isLong = position.side === PositionSide.LONG;
      const shouldUpdate = isLong ? newStopLoss > position.stopLoss.price : newStopLoss < position.stopLoss.price;

      if (!shouldUpdate) {
        this.logger.debug('SL update not favorable, skipping', {
          side: isLong ? 'LONG' : 'SHORT',
          currentSL: position.stopLoss.price.toFixed(8),
          newSL: newStopLoss.toFixed(8),
        });
        return false;
      }

      this.logger.info('📍 Updating stop-loss', {
        side: isLong ? 'LONG' : 'SHORT',
        currentSL: position.stopLoss.price.toFixed(8),
        newSL: newStopLoss.toFixed(8),
      });

      await this.bybitService.updateStopLoss({
        positionId: position.id,
        newPrice: newStopLoss,
      });
      position.stopLoss.price = newStopLoss;
      position.stopLoss.updatedAt = Date.now();

      return true;
    } catch (error) {
      this.logger.error('Failed to update stop-loss', {
        error: error instanceof Error ? error.message : String(error),
        positionId: position.id,
      });
      return false;
    }
  }

  /**
   * Activate trailing stop for final position leg
   *
   * @param position - Current position
   * @param trailingDistance - Distance for trailing (in price units)
   * @param currentPrice - Current market price
   */
  private async activateTrailingStop(position: Position, trailingDistance: number, currentPrice: number): Promise<boolean> {
    try {
      const isLong = position.side === PositionSide.LONG;
      const trailingPrice = isLong ? currentPrice - trailingDistance : currentPrice + trailingDistance;

      this.logger.info('🔄 Activating trailing stop', {
        side: isLong ? 'LONG' : 'SHORT',
        currentPrice: currentPrice.toFixed(8),
        trailingDistance: trailingDistance.toFixed(8),
        initialTrailingPrice: trailingPrice.toFixed(8),
      });

      await this.bybitService.updateStopLoss({
        positionId: position.id,
        newPrice: trailingPrice,
      });

      position.stopLoss.price = trailingPrice;
      position.stopLoss.isTrailing = true;
      position.stopLoss.updatedAt = Date.now();

      return true;
    } catch (error) {
      this.logger.error('Failed to activate trailing stop', {
        error: error instanceof Error ? error.message : String(error),
        positionId: position.id,
      });
      return false;
    }
  }

  /**
   * [P1] Record position close in journal with full details
   * Returns rollback function for transactional error handling
   *
   * @private
   */
  private async recordPositionCloseInJournal(
    position: Position,
    exitPrice: number,
    realizedPnL: number,
    exitReason: string,
    exitType: ExitType,
    tpLevelsHit: number[],
    holdingTimeMs: number,
  ): Promise<{ rollback: () => void }> {
    try {
      // Skip if position has no journalId (restored from WebSocket without journal entry)
      if (!position.journalId) {
        this.logger.warn('Skipping journal recording - position has no journalId', {
          positionId: position.id,
        });
        return { rollback: () => {} }; // No-op rollback if no journalId
      }

      const holdingTimeMinutes = holdingTimeMs / TIME_UNITS.MINUTE;
      const priceDiff = exitPrice - position.entryPrice;
      const isLong = position.side === PositionSide.LONG;
      const pnlMultiplier = isLong ? 1 : -1;
      const pnlPercent = (priceDiff / position.entryPrice) * PERCENT_MULTIPLIER * pnlMultiplier;

      // [P1] Get rollback function from journal
      const journalResult = this.journal.recordTradeClose({
        id: position.journalId,
        exitPrice,
        realizedPnL,
        exitCondition: {
          exitType,
          price: exitPrice,
          timestamp: Date.now(),
          reason: exitReason,
          pnlUsdt: realizedPnL,
          pnlPercent,
          realizedPnL,
          tpLevelsHit,
          tpLevelsHitCount: tpLevelsHit.length,
          holdingTimeMs,
          holdingTimeMinutes,
          holdingTimeHours: holdingTimeMinutes / TIME_MULTIPLIERS.SECONDS_PER_MINUTE,
          stoppedOut: exitType === ExitType.STOP_LOSS,
          slMovedToBreakeven: position.stopLoss.isBreakeven,
          trailingStopActivated: position.stopLoss.isTrailing,
          maxProfitPercent: pnlPercent > 0 ? pnlPercent : 0,
          maxDrawdownPercent: pnlPercent < 0 ? Math.abs(pnlPercent) : 0,
        },
      });

      this.logger.info('📝 Position close recorded in journal', {
        journalId: position.journalId,
        exitType,
        pnl: realizedPnL.toFixed(DECIMAL_PLACES.PRICE),
        pnlPercent: pnlPercent.toFixed(DECIMAL_PLACES.PERCENT) + '%',
        holdingTime: `${holdingTimeMinutes.toFixed(1)}m`,
      });

      // [P1] Return rollback function for caller to use if needed
      return journalResult;
    } catch (error) {
      this.logger.error('Failed to record position close in journal', {
        error: error instanceof Error ? error.message : String(error),
        journalId: position.journalId,
      });
      // Return empty rollback function if journal fails (graceful degradation)
      return { rollback: () => {} };
    }
  }

  /**
   * Handle take-profit hit event
   * Called when TP1, TP2, or TP3 is hit on exchange
   *
   * @param position - Position with TP that was hit
   * @param tpLevel - TP level (1, 2, or 3)
   * @param currentPrice - Current market price
   */
  async onTakeProfitHit(position: Position, tpLevel: number, currentPrice: number): Promise<void> {
    try {
      if (!position) {
        this.logger.error('onTakeProfitHit called with null position');
        return;
      }

      // Check if TP already hit (prevent duplicate processing)
      const tpConfig = position.takeProfits.find((tp) => tp.level === tpLevel);
      if (!tpConfig || tpConfig.hit) {
        this.logger.debug('TP event ignored - already hit or not found', {
          tpLevel,
          alreadyHit: tpConfig?.hit,
          positionId: position.id,
        });
        return;
      }

      // Record partial close in TakeProfitManager
      const takeProfitManager = this.positionManager?.getTakeProfitManager();
      if (takeProfitManager) {
        // GUARD: Validate position.quantity is a valid number before calculation
        if (!position.quantity || typeof position.quantity !== 'number' || isNaN(position.quantity)) {
          this.logger.error('❌ Invalid position.quantity for partial close', {
            positionId: position.id,
            quantity: position.quantity,
            type: typeof position.quantity,
          });
        } else {
          const partialQuantity = (position.quantity * tpConfig.sizePercent) / PERCENT_MULTIPLIER;

          // Validate calculated partialQuantity is valid number
          if (isNaN(partialQuantity) || !isFinite(partialQuantity)) {
            this.logger.error('❌ Calculated partialQuantity is NaN', {
              positionId: position.id,
              quantity: position.quantity,
              sizePercent: tpConfig.sizePercent,
              partialQuantity,
            });
          } else {
            takeProfitManager.recordPartialClose(tpLevel, partialQuantity, currentPrice);
          }
        }
      }

      // Mark TP as hit
      tpConfig.hit = true;
      tpConfig.hitAt = Date.now();

      // Clear orderId to prevent Smart TP3 from trying to update filled order
      if (tpConfig.orderId) {
        tpConfig.orderId = undefined;
      }

      this.logger.info('✅ TP hit recorded', {
        positionId: position.id,
        tpLevel,
        hitPrice: currentPrice.toFixed(DECIMAL_PLACES.PRICE),
      });

      // Activate breakeven after TP1
      if (tpLevel === 1) {
        await this.handleTP1Hit(position, currentPrice);
      }

      // Activate trailing after TP2
      if (tpLevel === this.riskConfig.trailingStopActivationLevel) {
        await this.handleTP2Hit(position, currentPrice);
      }
    } catch (error) {
      this.logger.error('Failed to handle TP hit', {
        error: error instanceof Error ? error.message : String(error),
        positionId: position?.id,
        tpLevel,
      });
    }
  }

  /**
   * Handle TP1 hit - activate Smart Breakeven or move SL to breakeven
   *
   * GRACEFUL HANDLING: If entryPrice is invalid (NaN/undefined), use fallback
   * instead of throwing error that could cause position to be orphaned
   */
  private async handleTP1Hit(position: Position, currentPrice: number): Promise<void> {
    if (position.stopLoss.isBreakeven) {
      return; // Already in breakeven
    }

    try {
      // VALIDATION: Check if entry price is valid
      if (!position.entryPrice || isNaN(position.entryPrice) || position.entryPrice <= 0) {
        this.logger.error('❌ CRITICAL: Invalid entry price for breakeven calculation', {
          positionId: position.id,
          entryPrice: position.entryPrice,
          isNaN: isNaN(position.entryPrice),
          currentPrice,
          currentSL: position.stopLoss.price,
        });

        // FALLBACK: Use current SL + small offset instead of throwing
        // This prevents position from being orphaned
        const fallbackBreakevenPrice = this.calculateFallbackBreakevenPrice(position, currentPrice);

        this.logger.warn('⚠️ Using fallback breakeven SL', {
          positionId: position.id,
          reason: 'Invalid entry price',
          fallbackSL: fallbackBreakevenPrice.toFixed(DECIMAL_PLACES.PRICE),
        });

        await this.bybitService.updateStopLoss({
          positionId: position.id,
          newPrice: fallbackBreakevenPrice,
        });
        position.stopLoss.price = fallbackBreakevenPrice;
        position.stopLoss.isBreakeven = true;
        position.stopLoss.updatedAt = Date.now();

        await this.telegram.sendAlert(
          `⚠️ Breakeven activated (with fallback due to data issue)\nSL: ${fallbackBreakevenPrice.toFixed(8)}`,
        );
        return;
      }

      // VALIDATION: Check breakevenOffsetPercent is valid before calculating
      if (!this.riskConfig.breakevenOffsetPercent ||
          typeof this.riskConfig.breakevenOffsetPercent !== 'number' ||
          isNaN(this.riskConfig.breakevenOffsetPercent) ||
          !isFinite(this.riskConfig.breakevenOffsetPercent)) {
        this.logger.error('❌ CRITICAL: Invalid breakevenOffsetPercent in riskConfig', {
          breakevenOffsetPercent: this.riskConfig.breakevenOffsetPercent,
          type: typeof this.riskConfig.breakevenOffsetPercent,
          isNaN: isNaN(this.riskConfig.breakevenOffsetPercent),
        });

        // FALLBACK: Use fallback breakeven SL instead of throwing
        const fallbackBreakevenPrice = this.calculateFallbackBreakevenPrice(position, currentPrice);
        this.logger.warn('⚠️ Using fallback breakeven SL (invalid config)', {
          positionId: position.id,
          reason: 'Invalid breakevenOffsetPercent in riskConfig',
          fallbackSL: fallbackBreakevenPrice.toFixed(DECIMAL_PLACES.PRICE),
        });

        await this.bybitService.updateStopLoss({
          positionId: position.id,
          newPrice: fallbackBreakevenPrice,
        });
        position.stopLoss.price = fallbackBreakevenPrice;
        position.stopLoss.isBreakeven = true;
        position.stopLoss.updatedAt = Date.now();

        await this.telegram.sendAlert(
          `⚠️ Breakeven activated (with fallback due to config issue)\nSL: ${fallbackBreakevenPrice.toFixed(8)}`,
        );
        return;
      }

      const breakevenPrice = this.calculateBreakevenPrice(position, this.riskConfig.breakevenOffsetPercent);

      // Double-check result is valid
      if (isNaN(breakevenPrice)) {
        throw new Error(`calculateBreakevenPrice returned NaN (entry=${position.entryPrice})`);
      }

      this.logger.info('🎯 Moving SL to breakeven after TP1', {
        positionId: position.id,
        currentSL: position.stopLoss.price.toFixed(DECIMAL_PLACES.PRICE),
        newSL: breakevenPrice.toFixed(DECIMAL_PLACES.PRICE),
      });

      await this.bybitService.updateStopLoss({
        positionId: position.id,
        newPrice: breakevenPrice,
      });
      position.stopLoss.price = breakevenPrice;
      position.stopLoss.isBreakeven = true;
      position.stopLoss.updatedAt = Date.now();

      await this.telegram.sendAlert(
        `🎯 Breakeven Activated\nSL moved to: ${breakevenPrice.toFixed(8)}`,
      );
    } catch (error) {
      this.logger.error('Failed to move SL to breakeven', {
        error: error instanceof Error ? error.message : String(error),
        positionId: position.id,
        entryPrice: position.entryPrice,
        currentPrice,
      });

      // CRITICAL: Don't rethrow - position must remain managed
      // Log for debugging but allow position to continue
      await this.telegram.sendAlert(
        `⚠️ Failed to move SL to breakeven. Position will be managed with current SL.`,
      );
    }
  }

  /**
   * Handle TP2 hit - activate trailing stop
   */
  private async handleTP2Hit(position: Position, currentPrice: number): Promise<void> {
    if (position.stopLoss.isTrailing || position.stopLoss.isBreakeven) {
      this.logger.info('⏭️  Trailing activation skipped - SL already in breakeven or trailing', {
        positionId: position.id,
      });
      return;
    }

    this.logger.info('🚀 Activating trailing stop on TP2', {
      positionId: position.id,
      activationPrice: currentPrice.toFixed(DECIMAL_PLACES.PRICE),
    });

    // Activate trailing on exchange (optional method)
    if (this.bybitService.setTrailingStop) {
      await this.bybitService.setTrailingStop({
        side: position.side === PositionSide.LONG ? 'Buy' : 'Sell',
        activationPrice: currentPrice,
        trailingPercent: this.riskConfig.trailingStopPercent,
      });
    }

    // Update position state
    position.stopLoss.isTrailing = true;
    position.stopLoss.trailingPercent = this.riskConfig.trailingStopPercent;
    position.stopLoss.trailingActivationPrice = currentPrice;
    position.stopLoss.updatedAt = Date.now();

    const trailingStopPrice = this.calculateTrailingStopPrice(
      position,
      currentPrice,
      this.riskConfig.trailingStopPercent,
    );

    await this.telegram.sendAlert(
      `🚀 Trailing Stop Activated\nSL now trails at ${this.riskConfig.trailingStopPercent}%`,
    );
  }

  /**
   * Update SmartTrailingV2 - continuous update of trailing stop
   */
  async updateSmartTrailingV2(position: Position, currentPrice: number): Promise<void> {
    if (!position.stopLoss.isTrailing) {
      return; // Trailing not active
    }

    try {
      // Calculate new trailing stop distance
      const trailingStop = this.calculateTrailingStopPrice(
        position,
        currentPrice,
        this.riskConfig.trailingStopPercent,
      );

      // Only update if it's more favorable
      const isLong = position.side === PositionSide.LONG;
      const shouldUpdate = isLong ? trailingStop > position.stopLoss.price : trailingStop < position.stopLoss.price;

      if (!shouldUpdate) {
        return;
      }

      await this.bybitService.updateStopLoss({
        positionId: position.id,
        newPrice: trailingStop,
      });
      position.stopLoss.price = trailingStop;
      position.stopLoss.updatedAt = Date.now();

      this.logger.debug('📊 Trailing stop updated', {
        positionId: position.id,
        newSL: trailingStop.toFixed(DECIMAL_PLACES.PRICE),
      });
    } catch (error) {
      this.logger.error('Failed to update trailing stop', {
        error: error instanceof Error ? error.message : String(error),
        positionId: position.id,
      });
    }
  }

  /**
   * Update Smart TP3 - move TP3 by ticks as price moves favorably
   */
  async updateSmartTP3(position: Position, currentPrice: number): Promise<void> {
    if (!position.stopLoss.isTrailing) {
      return; // Trailing not active
    }

    const tp3 = position.takeProfits.find((tp) => tp.level === 3);
    if (!tp3 || tp3.hit || !tp3.orderId) {
      return; // TP3 not active or already hit
    }

    try {
      const smartTP3 = this.riskConfig.smartTP3;
      if (!smartTP3?.enabled) {
        return;
      }

      // Calculate favorable TP3 movement
      const isLong = position.side === PositionSide.LONG;
      const tickSize = (smartTP3.tickSizePercent / PERCENT_MULTIPLIER) * currentPrice;
      const maxMove = tickSize * smartTP3.maxTicks;

      let newTP3Price: number;
      if (isLong) {
        newTP3Price = Math.min(tp3.price + maxMove, currentPrice + maxMove);
      } else {
        newTP3Price = Math.max(tp3.price - maxMove, currentPrice - maxMove);
      }

      // Only update if moved favorably
      const moved = isLong ? newTP3Price > tp3.price : newTP3Price < tp3.price;
      if (!moved) {
        return;
      }

      if (this.bybitService.updateTakeProfit) {
        await this.bybitService.updateTakeProfit(tp3.orderId, newTP3Price);
      }
      tp3.price = newTP3Price;

      this.logger.debug('📈 TP3 updated', {
        positionId: position.id,
        newTP3: newTP3Price.toFixed(DECIMAL_PLACES.PRICE),
      });
    } catch (error) {
      this.logger.error('Failed to update TP3', {
        error: error instanceof Error ? error.message : String(error),
        positionId: position.id,
      });
    }
  }

  /**
   * Update Bollinger Band trailing stop
   */
  async updateBBTrailingStop(position: Position, candles: any[]): Promise<void> {
    if (!position.stopLoss.isTrailing || candles.length < 20) {
      return; // Need 20+ candles for BB
    }

    try {
      // Calculate Bollinger Bands
      const closes = candles.slice(-20).map((c) => c.close);
      const avg = closes.reduce((a, b) => a + b, 0) / closes.length;
      const variance = closes.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / closes.length;
      const stdDev = Math.sqrt(variance);

      const upperBand = avg + 2 * stdDev;
      const lowerBand = avg - 2 * stdDev;

      // Use lower band for LONG, upper band for SHORT
      const isLong = position.side === PositionSide.LONG;
      const bbStop = isLong ? lowerBand : upperBand;

      // Only update if more favorable
      const shouldUpdate = isLong ? bbStop > position.stopLoss.price : bbStop < position.stopLoss.price;

      if (!shouldUpdate) {
        return;
      }

      await this.bybitService.updateStopLoss({
        positionId: position.id,
        newPrice: bbStop,
      });
      position.stopLoss.price = bbStop;
      position.stopLoss.updatedAt = Date.now();

      this.logger.debug('📊 BB trailing stop updated', {
        positionId: position.id,
        newSL: bbStop.toFixed(DECIMAL_PLACES.PRICE),
      });
    } catch (error) {
      this.logger.error('Failed to update BB trailing stop', {
        error: error instanceof Error ? error.message : String(error),
        positionId: position.id,
      });
    }
  }

  /**
   * Calculate breakeven price
   */
  private calculateBreakevenPrice(position: Position, offsetPercent: number): number {
    // GUARD: Validate offsetPercent is a valid number
    if (!offsetPercent || typeof offsetPercent !== 'number' || isNaN(offsetPercent) || !isFinite(offsetPercent)) {
      this.logger.error('❌ Invalid breakevenOffsetPercent', {
        offsetPercent,
        type: typeof offsetPercent,
        isNaN: isNaN(offsetPercent),
      });
      // FALLBACK: Use safe default of 0.3%
      const safeOffsetPercent = 0.3;
      const offset = (position.entryPrice * safeOffsetPercent) / PERCENT_MULTIPLIER;
      const isLong = position.side === PositionSide.LONG;
      return isLong ? position.entryPrice + offset : position.entryPrice - offset;
    }

    const offset = (position.entryPrice * offsetPercent) / PERCENT_MULTIPLIER;
    const isLong = position.side === PositionSide.LONG;
    return isLong ? position.entryPrice + offset : position.entryPrice - offset;
  }

  /**
   * FALLBACK: Calculate breakeven when entry price is corrupted
   * Uses current SL as anchor point instead of entry price
   * This prevents position from being orphaned
   */
  private calculateFallbackBreakevenPrice(position: Position, currentPrice: number): number {
    const isLong = position.side === PositionSide.LONG;
    const safeOffsetPercent = 0.1; // 0.1% offset (smaller than regular 0.3%)

    // Use current SL as the base, move it slightly in favorable direction
    if (isLong) {
      // LONG: Move SL up by 0.1% from current SL
      return position.stopLoss.price * (1 + safeOffsetPercent / PERCENT_MULTIPLIER);
    } else {
      // SHORT: Move SL down by 0.1% from current SL
      return position.stopLoss.price * (1 - safeOffsetPercent / PERCENT_MULTIPLIER);
    }
  }

  /**
   * Calculate trailing stop price
   */
  private calculateTrailingStopPrice(position: Position, currentPrice: number, trailingPercent: number): number {
    const trailingDistance = (currentPrice * trailingPercent) / PERCENT_MULTIPLIER;
    const isLong = position.side === PositionSide.LONG;
    return isLong ? currentPrice - trailingDistance : currentPrice + trailingDistance;
  }
}
