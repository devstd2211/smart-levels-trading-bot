/**
 * WebSocket Event Handler
 *
 * Handles all WebSocket-related events:
 * - Position updates from WebSocket
 * - Position closed events
 * - Order filled events
 * - Take Profit filled events (with 3-method detection)
 * - Stop Loss filled events
 * - WebSocket errors
 *
 * Extracted from bot.ts setupWebSocketHandlers() lines 271-497
 */

import { LoggerService, Position, ExitType, OrderFilledEvent, TakeProfitFilledEvent, StopLossFilledEvent } from '../../types';
import type { IExchange } from '../../interfaces/IExchange';
import { PositionLifecycleService } from '../position-lifecycle.service';
import { PositionExitingService } from '../position-exiting.service';
import { WebSocketManagerService } from '../websocket-manager.service';
import { TradingJournalService } from '../trading-journal.service';
import { TelegramService } from '../telegram.service';
import { INTEGER_MULTIPLIERS } from '../../constants';
import { ErrorHandler, RecoveryStrategy } from '../../errors/ErrorHandler';
import { PositionNotFoundError, OrderValidationError } from '../../errors/DomainErrors';

const DECIMAL_PLACES = {
  PERCENT: 2,
};

const PRICE_TOLERANCE = {
  BOT_PRICE_MATCHING: 0.003, // 0.3%
};

/**
 * Handles WebSocket events from exchange
 *
 * Responsibilities:
 * - Sync position updates from WebSocket
 * - Handle position closed events with journal deduplication
 * - Track order fills
 * - Detect TP level fills (3-method matching: OrderID → Price → Quantity)
 * - Track SL fills
 * - Handle WebSocket errors
 */
export class WebSocketEventHandler {
  constructor(
    private positionManager: PositionLifecycleService,
    private positionExitingService: PositionExitingService,
    private bybitService: IExchange,
    private webSocketManager: WebSocketManagerService,
    private journal: TradingJournalService,
    private telegram: TelegramService,
    private logger: LoggerService,
  ) {}

  /**
   * Validate position data for required fields and valid values
   * @private
   */
  private validatePositionData(position: any): boolean {
    if (!position) return false;
    if (!position.symbol || typeof position.symbol !== 'string') return false;
    if (!position.id || typeof position.id !== 'string') return false;
    if (typeof position.entryPrice !== 'number' || isNaN(position.entryPrice) || position.entryPrice <= 0) return false;
    if (typeof position.quantity !== 'number' || isNaN(position.quantity) || position.quantity <= 0) return false;
    return true;
  }

  /**
   * Validate Take Profit event data
   * @private
   */
  private validateTakeProfitEvent(event: TakeProfitFilledEvent): boolean {
    if (!event || !event.orderId) return false;
    if (event.avgPrice !== undefined) {
      const price = parseFloat(String(event.avgPrice));
      if (isNaN(price) || price < 0) return false;
    }
    if (event.cumExecQty !== undefined) {
      const qty = parseFloat(String(event.cumExecQty));
      if (isNaN(qty) || qty < 0) return false;
    }
    return true;
  }

  /**
   * Get current price with fallback to entry price on failure
   * @private
   */
  private async getCurrentPriceWithFallback(fallbackPrice: number): Promise<number> {
    try {
      const price = await this.bybitService.getCurrentPrice();
      if (isNaN(price) || price <= 0) {
        throw new OrderValidationError('Invalid price from API', {
          field: 'currentPrice',
          value: price,
          reason: 'Price validation failed',
        });
      }
      return price;
    } catch (error) {
      await ErrorHandler.handle(error, {
        strategy: RecoveryStrategy.FALLBACK,
        logger: this.logger,
        context: 'WebSocketEventHandler.getCurrentPrice',
        onRecover: () => {
          this.logger.warn('⚠️ getCurrentPrice failed, using fallback entry price', {
            fallback: fallbackPrice,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      });
      return fallbackPrice;
    }
  }

  /**
   * Handle position update from WebSocket
   *
   * @param position - Updated position
   */
  async handlePositionUpdate(position: Position): Promise<void> {
    // Validate position data
    if (!this.validatePositionData(position)) {
      await ErrorHandler.handle(
        new PositionNotFoundError('Invalid position data from WebSocket', {
          positionId: position?.id || 'unknown',
          symbol: position?.symbol || 'unknown',
          hasSymbol: !!position?.symbol,
          hasEntryPrice: typeof position?.entryPrice === 'number',
        }),
        {
          strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
          logger: this.logger,
          context: 'WebSocketEventHandler.handlePositionUpdate',
          onRecover: () => {
            this.logger.warn('⚠️ Invalid position data, skipping update', {
              positionId: position?.id,
              hasSymbol: !!position?.symbol,
              hasEntryPrice: typeof position?.entryPrice === 'number',
            });
          },
        }
      );
      return; // SKIP invalid update
    }

    this.logger.debug('WebSocket: Position update received');
    this.positionManager.syncWithWebSocket(position);
  }

  /**
   * Handle position closed event from WebSocket
   *
   * NOTE: Position can be closed by:
   * - Take Profit hit (TP/TRAILING)
   * - Stop Loss hit (SL)
   * - Manual close
   * - Exchange liquidation
   */
  async handlePositionClosed(): Promise<void> {
    this.logger.info('WebSocket: Position closed');

    // [P3] Use atomic lock to prevent concurrent close attempts
    // This prevents the race condition where:
    // 1. WebSocket triggers position close (this handler)
    // 2. Timeout handler simultaneously tries to close the position
    // 3. Both try to clearPosition() → "Position not found" error
    await this.positionManager.closePositionWithAtomicLock(
      'EXTERNAL_CLOSE', // reason: closed externally by WebSocket
      () => this._handlePositionClosedInternal(), // Callback to execute within lock
    );
  }

  /**
   * [P3] Internal: Handle position close using atomic lock
   * Called by closePositionWithAtomicLock from PositionLifecycleService
   * This executes within the atomic lock to prevent race conditions
   *
   * @private
   */
  async _handlePositionClosedInternal(): Promise<void> {
    const position = this.positionManager.getCurrentPosition();
    if (!position) {
      this.logger.debug('No position to close (already cleared)');
      return;
    }

    // Check if position was already closed by another handler (e.g., TIME_BASED_EXIT)
    // Use journalId if available, fallback to exchange id for backward compatibility
    const journalId = position.journalId || position.id;
    const journalEntry = this.journal.getTrade(journalId);
    if (journalEntry?.status === 'CLOSED') {
      this.logger.debug('🧹 Position already closed in journal, skipping duplicate record', {
        positionId: position.id,
        journalId,
        exitType: journalEntry.exitCondition?.exitType,
      });
      return;
    }

    // Position closed by exchange (SL/TP/Trailing) - record it
    const currentPrice = await this.getCurrentPriceWithFallback(position.entryPrice);
    const pnl = position.unrealizedPnL || 0;
    const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * INTEGER_MULTIPLIERS.ONE_HUNDRED;

    // Record position close in journal
    const tpHits = position.takeProfits.filter(tp => tp.hit).map(tp => tp.level);

    // Determine exitType based on actual close reason from WebSocket
    const lastCloseReason = this.webSocketManager.getLastCloseReason();
    let exitType: ExitType;

    if (lastCloseReason === 'TP') {
      // Position closed by TP - use last TP hit
      exitType = tpHits.length > 0
        ? (ExitType[`TAKE_PROFIT_${tpHits[tpHits.length - 1]}` as 'TAKE_PROFIT_1' | 'TAKE_PROFIT_2' | 'TAKE_PROFIT_3'])
        : ExitType.STOP_LOSS; // Fallback (shouldn't happen)
    } else if (lastCloseReason === 'TRAILING') {
      exitType = ExitType.TRAILING_STOP;
    } else if (lastCloseReason === 'SL') {
      exitType = ExitType.STOP_LOSS;
    } else {
      // Fallback to old logic if lastCloseReason is null (shouldn't happen)
      exitType = tpHits.length > 0
        ? (ExitType[`TAKE_PROFIT_${tpHits[tpHits.length - 1]}` as 'TAKE_PROFIT_1' | 'TAKE_PROFIT_2' | 'TAKE_PROFIT_3'])
        : (position.stopLoss?.isTrailing ? ExitType.TRAILING_STOP : ExitType.STOP_LOSS);
    }

    // Reset lastCloseReason for next position
    this.webSocketManager.resetLastCloseReason();

    // Record position close in journal using PositionExitingService
    await this.positionExitingService.closeFullPosition(
      position,
      currentPrice,
      'Position closed (SL/TP/Trailing)',
      exitType,
    );

    // Send Telegram notification before clearing position
    void this.telegram.notifyPositionClosed(
      position,
      'Position closed (SL/TP/Trailing)',
      currentPrice,
      pnl,
      pnlPercent,
    );

    // NOTE: DO NOT cancel conditional orders here!
    // When position closes on exchange, all associated orders (TP/SL) are automatically cancelled by Bybit
    // Calling cleanup here creates a race condition: if a new position opens quickly after,
    // the fetch() for active orders completes AFTER TP orders for the new position are placed,
    // and cleanup incorrectly deletes the NEW position's TP orders thinking they're orphaned
    // See: Session #33 ticket - microwall position closed TP level 1 was deleted

    // CRITICAL: Clear position ONLY within atomic lock to prevent race conditions
    await this.positionManager.clearPosition();
  }

  /**
   * Handle order filled event
   *
   * @param order - Order fill event
   */
  async handleOrderFilled(order: OrderFilledEvent): Promise<void> {
    this.logger.info('WebSocket: Order filled', { orderId: order.orderId });
  }

  /**
   * Handle take profit filled event
   *
   * Uses 3-method detection to determine TP level:
   * 1. OrderID matching (most reliable)
   * 2. Price matching (fallback, within 0.3% tolerance)
   * 3. Quantity matching (for position size change events)
   * 4. First unhit TP (last resort)
   *
   * @param event - Take profit filled event
   */
  async handleTakeProfitFilled(event: TakeProfitFilledEvent): Promise<void> {
    // Validate event data
    if (!this.validateTakeProfitEvent(event)) {
      await ErrorHandler.handle(
        new OrderValidationError('Invalid TakeProfitFilled event data', {
          field: 'takeProfitEvent',
          value: event?.orderId || 'missing',
          reason: 'Missing or invalid event fields',
          hasAvgPrice: event?.avgPrice !== undefined,
          hasCumExecQty: event?.cumExecQty !== undefined,
        }),
        {
          strategy: RecoveryStrategy.SKIP,
          logger: this.logger,
          context: 'WebSocketEventHandler.handleTakeProfitFilled',
          onRecover: () => {
            this.logger.warn('⚠️ Invalid TP event, skipping processing', { orderId: event?.orderId });
          },
        }
      );
      return; // SKIP invalid event
    }

    this.logger.info('WebSocket: Take Profit filled', {
      orderId: event.orderId,
      price: event.avgPrice,
      qty: event.cumExecQty,
    });

    const position = this.positionManager.getCurrentPosition();
    if (!position) {
      this.logger.warn('Take Profit filled but no active position');
      return;
    }

    // Determine which TP level was hit
    let tpLevel = 0;
    const fillPrice = event.avgPrice !== undefined ? parseFloat(String(event.avgPrice)) : 0;
    const qtyFilled = event.cumExecQty !== undefined ? parseFloat(String(event.cumExecQty)) : 0;

    // Method 1: BEST - Try to match by OrderID (most reliable)
    if (event.orderId && position.takeProfits.length > 0) {
      for (const tp of position.takeProfits) {
        if (tp.orderId === event.orderId) {
          tpLevel = tp.level;
          this.logger.info('✅ Matched TP by OrderID (RELIABLE)', {
            orderId: event.orderId,
            tpLevel,
            price: tp.price,
          });
          break;
        }
      }
    }

    // Fallback Method 2: Try to determine by price (if orderId didn't match)
    if (tpLevel === 0 && fillPrice > 0) {
      for (const tp of position.takeProfits) {
        const priceDiff = Math.abs(fillPrice - tp.price) / tp.price;
        if (priceDiff <= PRICE_TOLERANCE.BOT_PRICE_MATCHING) {
          tpLevel = tp.level;
          this.logger.warn('⚠️ Matched TP by price (fallback)', {
            orderId: event.orderId,
            tpLevel,
            expectedPrice: tp.price,
            actualPrice: fillPrice,
            tolerance: PRICE_TOLERANCE.BOT_PRICE_MATCHING,
          });
          break;
        }
      }
    }

    // Fallback Method 3: Determine by quantity filled (for position size decrease events)
    if (tpLevel === 0 && qtyFilled > 0) {
      const initialQuantity = position.quantity + qtyFilled; // Reconstruct initial size
      const percentFilled = (qtyFilled / initialQuantity) * INTEGER_MULTIPLIERS.ONE_HUNDRED;

      this.logger.debug('Determining TP level by quantity (fallback)', {
        qtyFilled,
        initialQuantity,
        percentFilled: percentFilled.toFixed(DECIMAL_PLACES.PERCENT) + '%',
      });

      // Find the TP level that hasn't been hit yet and matches the percentage
      for (const tp of position.takeProfits) {
        if (!tp.hit) {
          const expectedPercent = tp.sizePercent;
          const tolerance = INTEGER_MULTIPLIERS.FIVE; // 5% tolerance
          if (Math.abs(percentFilled - expectedPercent) <= tolerance) {
            tpLevel = tp.level;
            this.logger.warn('⚠️ Matched TP by quantity (fallback)', {
              orderId: event.orderId,
              tpLevel,
              percentFilled: percentFilled.toFixed(DECIMAL_PLACES.PERCENT) + '%',
              expectedPercent: expectedPercent + '%',
            });
            break;
          }
        }
      }
    }

    // Last resort: If still unknown, use first unhit TP
    if (tpLevel === 0) {
      for (const tp of position.takeProfits) {
        if (!tp.hit) {
          tpLevel = tp.level;
          this.logger.error('🚨 Using first unhit TP level - GUESSWORK (should not happen)', {
            orderId: event.orderId,
            tpLevel,
            reason: 'Could not match by OrderID, price, or quantity',
          });
          break;
        }
      }
    }

    if (tpLevel === 0) {
      this.logger.error('🚨 CRITICAL: Could not determine ANY TP level', {
        orderId: event.orderId,
        fillPrice,
        qtyFilled,
        tpPrices: position.takeProfits.map(tp => ({ level: tp.level, price: tp.price, orderId: tp.orderId, hit: tp.hit })),
      });
      return;
    }

    this.logger.info(`✅ TAKE PROFIT ${tpLevel} FILLED (WebSocket)`, {
      level: tpLevel,
      fillPrice: fillPrice || 'unknown',
      qty: event.cumExecQty,
    });

    // Handle TP hit with PositionExitingService (position is guaranteed to exist from earlier check)
    const priceForBreakeven = fillPrice > 0 ? fillPrice : position.entryPrice;
    await this.positionExitingService.onTakeProfitHit(position, tpLevel, priceForBreakeven);
  }

  /**
   * Handle stop loss filled event
   *
   * NOTE: Position will be closed by 'positionClosed' event
   * This handler just logs the stop loss execution
   *
   * @param event - Stop loss filled event
   */
  async handleStopLossFilled(event: StopLossFilledEvent): Promise<void> {
    this.logger.info('WebSocket: Stop Loss filled', {
      orderId: event.orderId,
      price: event.avgPrice,
      qty: event.cumExecQty,
    });

    // Position will be closed by 'positionClosed' event
    // Just log the stop loss execution here
  }

  /**
   * Handle WebSocket error
   *
   * @param error - Error from WebSocket
   */
  async handleError(error: Error): Promise<void> {
    this.logger.error('WebSocket error', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
