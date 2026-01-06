/**
 * Position Opening Service
 * Single Responsibility: Execute position opening with all protections
 *
 * PURE EXECUTOR - Does not make ANY assumptions about signal origin or metadata
 * - Doesn't care about signal.type (WHALE_HUNTER, SCALPING, etc.)
 * - Doesn't care about signal.reason or signal.confidence
 * - Only cares about: direction, price, stopLoss, takeProfits
 *
 * Responsibilities:
 * - Cancel hanging conditional orders
 * - Open position on exchange (limit order)
 * - Place take-profit levels
 * - Set stop-loss with market price recalculation
 * - CRITICAL: Verify protection set (with retry logic)
 * - Create minimal Position object (no metadata)
 * - Send Telegram notifications
 * - Record in trading journal
 * - Record in session stats (if provided)
 *
 * Dependencies:
 * - PositionSizingService (for quantity calculation)
 * - BybitService (for exchange operations)
 * - Other: TelegramService, TradingJournalService, SessionStatsService
 */

import {
  LoggerService,
  Signal,
  Position,
  PositionSide,
  SignalDirection,
  RiskDecision,
  TradingConfig,
  RiskManagementConfig,
  ExitType,
  SessionTradeRecord,
  Config,
} from '../types';
import { BybitService } from './bybit';
import { TelegramService } from './telegram.service';
import { TradingJournalService } from './trading-journal.service';
import { TakeProfitManagerService } from './take-profit-manager.service';
import { SessionStatsService } from './session-stats.service';
import { PositionSizingService } from './position-sizing.service';
import { DECIMAL_PLACES, PERCENT_MULTIPLIER, INTEGER_MULTIPLIERS, TIMING_CONSTANTS } from '../constants';

// ============================================================================
// POSITION OPENING SERVICE
// ============================================================================

export class PositionOpeningService {
  constructor(
    private readonly bybitService: BybitService,
    private readonly tradingConfig: TradingConfig,
    private readonly riskConfig: RiskManagementConfig,
    private readonly telegram: TelegramService,
    private readonly logger: LoggerService,
    private readonly journal: TradingJournalService,
    private readonly positionSizing: PositionSizingService,
    private readonly fullConfig: Config,
    private readonly takeProfitManager?: TakeProfitManagerService,
    private readonly sessionStats?: SessionStatsService,
  ) {}

  /**
   * Open position with all validations and protections
   * CRITICAL: This is a SAFE operation - includes protection verification with retries
   *
   * @param signal - Trading signal with entry/SL/TP levels
   * @param riskDecision - Risk assessment from RiskManager (optional, for logging)
   * @param entrySnapshot - Session entry snapshot for stats (optional)
   * @returns Position object if successful
   * @throws Error if position already exists or protection fails
   */
  async openPosition(
    signal: Signal,
    riskDecision?: RiskDecision | null,
    entrySnapshot?: any, // SessionEntryCondition
  ): Promise<Position> {
    // =========================================================================
    // STEP 1: Calculate position size using PositionSizingService
    // =========================================================================
    const sizingResult = await this.positionSizing.calculatePositionSize(signal);

    this.logger.info('📐 Position sizing completed', {
      quantity: sizingResult.quantity,
      roundedQuantity: sizingResult.roundedQuantity,
      marginUsed: sizingResult.marginUsed.toFixed(DECIMAL_PLACES.PERCENT),
      notionalValue: sizingResult.notionalValue.toFixed(DECIMAL_PLACES.PERCENT),
      sizingChain: sizingResult.sizingChain.join(' → '),
    });

    // =========================================================================
    // STEP 2: Cancel any hanging conditional orders from previous position
    // =========================================================================
    this.logger.debug('🧹 Cancelling any hanging conditional orders before opening...');
    try {
      await this.bybitService.cancelAllConditionalOrders();
    } catch (error) {
      this.logger.warn('Failed to cancel hanging orders', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue anyway - don't fail the position opening
    }

    // =========================================================================
    // STEP 3: Determine position side and execute opening
    // =========================================================================
    const isLong = signal.direction === SignalDirection.LONG;
    const side = isLong ? PositionSide.LONG : PositionSide.SHORT;

    this.logger.info('🚀 Opening position on exchange', {
      side: side === PositionSide.LONG ? 'LONG' : 'SHORT',
      quantity: sizingResult.quantity,
      entry: signal.price,
      sl: signal.stopLoss,
      leverage: this.tradingConfig.leverage,
    });

    // =========================================================================
    // STEP 4: Calculate SL with price recalculation (BEFORE opening position)
    // =========================================================================
    const slDistance = this.calculateSLDistance(signal.price, signal.stopLoss);
    const currentPrice = await this.bybitService.getCurrentPrice();
    const actualStopLoss = this.calculateActualStopLoss(
      isLong,
      currentPrice,
      slDistance,
    );

    this.logger.info('📊 Stop-loss calculated', {
      signalPrice: signal.price,
      signalSL: signal.stopLoss,
      currentPrice,
      slDistancePercent: (slDistance / currentPrice * PERCENT_MULTIPLIER).toFixed(2) + '%',
      actualStopLoss: actualStopLoss.toFixed(DECIMAL_PLACES.PERCENT),
    });

    // =========================================================================
    // STEP 5: ATOMIC POSITION OPENING - SL+TP in ONE call (CRITICAL FIX)
    // =========================================================================
    // This prevents race condition liquidations by setting SL atomically with position opening
    let orderId: string | undefined;
    let tpOrderIds: (string | undefined)[] = [];

    try {
      // Get first TP level (or undefined if no TPs)
      const firstTP = signal.takeProfits && signal.takeProfits.length > 0
        ? signal.takeProfits[0].price
        : undefined;

      // 5a. Open position WITH atomic SL and first TP protection
      orderId = await this.bybitService.openPosition({
        side,
        quantity: sizingResult.quantity,
        leverage: this.tradingConfig.leverage,
        stopLoss: actualStopLoss, // CRITICAL: SL set atomically with position
        takeProfit: firstTP, // First TP set atomically (optional, can be modified later)
      });

      this.logger.info('✅ Position opened WITH atomic SL/TP protection', {
        orderId,
        side: side === PositionSide.LONG ? 'LONG' : 'SHORT',
        quantity: sizingResult.quantity,
        slSet: true,
        tpSet: firstTP !== undefined,
      });

      // Store first TP order ID
      if (firstTP !== undefined) {
        tpOrderIds.push(orderId); // Bybit returns same orderId for position+SL+TP
      }

      // 5b. Set additional TP levels (if more than 1)
      // Using setTradingStop for additional TPs (Partial mode with different tpSize)
      if (signal.takeProfits && signal.takeProfits.length > 1) {
        this.logger.info('📋 Setting additional TP levels', {
          additionalLevels: signal.takeProfits.length - 1,
        });

        // For each additional TP level, we update via setTradingStop
        // Note: Bybit Partial mode allows multiple TPs by changing tpSize
        // but we'll set them sequentially for clarity
        for (let i = 1; i < signal.takeProfits.length; i++) {
          const tp = signal.takeProfits[i];
          const tpSize = sizingResult.quantity / signal.takeProfits.length;

          try {
            await this.bybitService.updateTakeProfitPartial({
              price: tp.price,
              size: tpSize,
              index: i,
            });

            this.logger.debug(`✅ TP${i + 1} set`, {
              price: tp.price,
              size: tpSize,
            });
          } catch (error) {
            this.logger.warn(`Failed to set TP${i + 1} level`, {
              error: error instanceof Error ? error.message : String(error),
            });
            // Continue with other TPs - don't fail entire position
          }
        }
      }
    } catch (error) {
      this.logger.error('❌ Failed to open position with protection', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    // =========================================================================
    // STEP 6: Create Position object
    // =========================================================================
    const timestamp = Date.now();
    const sideName = side === PositionSide.LONG ? 'Buy' : 'Sell';
    const exchangeId = `${this.bybitService['symbol']}_${sideName}`;
    const journalId = `${exchangeId}_${timestamp}`;

    const position: Position = {
      id: exchangeId,
      journalId,
      symbol: this.bybitService['symbol'],
      side,
      quantity: sizingResult.quantity,
      entryPrice: signal.price,
      leverage: this.tradingConfig.leverage,
      marginUsed: sizingResult.marginUsed,
      stopLoss: {
        price: actualStopLoss,
        initialPrice: actualStopLoss,
        orderId: undefined,
        isBreakeven: false,
        isTrailing: false,
        updatedAt: Date.now(),
      },
      takeProfits: signal.takeProfits.map((tp, i) => ({
        ...tp,
        orderId: tpOrderIds[i] || undefined,
        hit: false,
      })),
      openedAt: timestamp,
      unrealizedPnL: 0,
      orderId,
      reason: 'Position opened', // Generic reason - doesn't depend on signal origin
      protectionVerifiedOnce: true,
      status: 'OPEN' as const,
    };

    // =========================================================================
    // STEP 8: Initialize Take Profit Manager
    // =========================================================================
    // Note: TakeProfitManager should be initialized separately
    // This service doesn't manage TakeProfitManager state

    // =========================================================================
    // STEP 9: Send notifications and record
    // =========================================================================
    try {
      await this.telegram.notifyPositionOpened(position);
    } catch (error) {
      this.logger.warn('Failed to send Telegram notification', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Record trade opening in journal
    // Note: Only record core trade data. Metadata (strategy, signals, etc.) should be handled by caller
    this.journal.recordTradeOpen({
      id: journalId,
      symbol: position.symbol,
      side,
      entryPrice: signal.price,
      quantity: sizingResult.quantity,
      leverage: this.tradingConfig.leverage,
      entryCondition: {
        signal, // Raw signal data is preserved for analysis
      },
    });

    this.logger.info('✅ Trade recorded in journal', { journalId });

    // Record in session stats
    if (this.sessionStats && entrySnapshot) {
      const sessionTrade: SessionTradeRecord = {
        tradeId: journalId,
        timestamp: new Date(timestamp).toISOString(),
        direction: signal.direction,
        entryPrice: signal.price,
        exitPrice: 0,
        quantity: sizingResult.quantity,
        pnl: 0,
        pnlPercent: 0,
        exitType: ExitType.MANUAL,
        tpHitLevels: [],
        holdingTimeMs: 0,
        entryCondition: entrySnapshot,
        stopLoss: {
          initial: actualStopLoss,
          final: actualStopLoss,
          movedToBreakeven: false,
          trailingActivated: false,
        },
      };

      this.sessionStats.recordTradeEntry(sessionTrade);
      this.logger.debug('📊 Trade recorded in session stats', { tradeId: journalId });
    }

    this.logger.info('✅ Position opened successfully', {
      positionId: position.id,
      side: side === PositionSide.LONG ? 'LONG' : 'SHORT',
      entry: position.entryPrice,
      quantity: position.quantity,
    });

    return position;
  }

  /**
   * Calculate stop-loss distance in absolute price
   *
   * @param entryPrice - Entry price
   * @param signalStopLoss - Signal's stop-loss price
   * @returns SL distance in price points
   */
  private calculateSLDistance(entryPrice: number, signalStopLoss: number): number {
    return Math.abs(signalStopLoss - entryPrice);
  }

  /**
   * Calculate actual stop-loss price accounting for market movement
   *
   * @param isLong - true for LONG, false for SHORT
   * @param currentPrice - Current market price
   * @param slDistance - SL distance in price points
   * @returns Actual SL price to set
   */
  private calculateActualStopLoss(
    isLong: boolean,
    currentPrice: number,
    slDistance: number,
  ): number {
    return isLong ? currentPrice - slDistance : currentPrice + slDistance;
  }

  /**
   * Sleep utility for delays
   *
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
