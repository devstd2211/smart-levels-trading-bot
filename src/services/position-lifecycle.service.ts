/**
 * Position Lifecycle Service
 * Consolidated from 8 separate position services:
 * - PositionManagerService (orchestration)
 * - PositionOpeningService (opening workflow)
 * - PositionSyncService (WebSocket sync)
 * - PositionCalculatorService (quantity math)
 * - PositionInitializationService (Position object creation)
 * - PositionExecutionService (exchange execution)
 * - PositionProtectionService (SL/TP setup)
 * - PositionSizingService (size calculation)
 *
 * UNIFIED RESPONSIBILITY: Manage position lifecycle from open → close
 * - Open positions with atomic SL/TP protection
 * - Sync positions with WebSocket on bot restart
 * - Track position state (currentPosition, takeProfitManager)
 * - Manage entry confirmation for signals requiring candle confirmation
 *
 * CRITICAL: SL and TP are set ATOMICALLY with position opening via Bybit
 * No separate verification service needed - handled by BybitService.openPosition()
 */

import { DECIMAL_PLACES, PERCENT_MULTIPLIER } from '../constants';
import { TIMING_CONSTANTS } from '../constants/technical.constants';

import {
  Position,
  Signal,
  SignalDirection,
  TradingConfig,
  RiskManagementConfig,
  LoggerService,
  EntryConfirmationConfig,
  SessionEntryCondition,
  Config,
  SmartBreakevenConfig,
  SignalType,
  PositionSide,
  ExitType,
  SessionTradeRecord,
} from '../types';
import type { IExchange } from '../interfaces/IExchange';
import { BotEventBus } from './event-bus';
import { TelegramService } from './telegram.service';
import { TradingJournalService } from './trading-journal.service';
import { TakeProfitManagerService } from './take-profit-manager.service';
import { EntryConfirmationManager } from './entry-confirmation.service';
import { CompoundInterestCalculatorService } from './compound-interest-calculator.service';
import { SessionStatsService } from './session-stats.service';

// ============================================================================
// CONSTANTS
// ============================================================================

const PERCENT_TO_DECIMAL = PERCENT_MULTIPLIER;

// ============================================================================
// POSITION LIFECYCLE SERVICE
// ============================================================================

export class PositionLifecycleService {
  // State
  private currentPosition: Position | null = null;
  private isOpeningPosition: boolean = false; // Prevent duplicate position opening
  private takeProfitManager: TakeProfitManagerService | null = null;
  private entryConfirmation: EntryConfirmationManager;

  constructor(
    private readonly bybitService: IExchange,
    private readonly tradingConfig: TradingConfig,
    private readonly riskConfig: RiskManagementConfig,
    private readonly telegram: TelegramService,
    private readonly logger: LoggerService,
    private readonly journal: TradingJournalService,
    private readonly entryConfirmationConfig: EntryConfirmationConfig,
    private readonly fullConfig: Config,
    private readonly eventBus: BotEventBus,
    private readonly compoundInterestCalculator?: CompoundInterestCalculatorService,
    private readonly sessionStats?: SessionStatsService,
  ) {
    this.entryConfirmation = new EntryConfirmationManager(entryConfirmationConfig, logger);
  }

  // =========================================================================
  // PUBLIC API: Core Lifecycle
  // =========================================================================

  /**
   * Open a new position based on signal
   * CRITICAL: SL and TP are set ATOMICALLY with position opening
   *
   * @param signal - Trading signal with entry/SL/TP levels
   * @param entrySnapshot - Optional session entry snapshot for stats
   * @returns Position object if successful
   * @throws Error if position already exists or opening fails
   */
  async openPosition(signal: Signal, entrySnapshot?: SessionEntryCondition): Promise<Position> {
    // Prevent duplicate position opening
    if (this.currentPosition !== null) {
      throw new Error('Position already exists. Close existing position first.');
    }

    if (this.isOpeningPosition) {
      throw new Error('Position opening already in progress. Preventing duplicate.');
    }

    this.isOpeningPosition = true;

    try {
      // ===================================================================
      // STEP 1: Calculate position size (with compound interest support)
      // ===================================================================
      const sizingResult = await this.calculatePositionSize(signal);

      this.logger.info('📐 Position sizing completed', {
        quantity: sizingResult.quantity,
        marginUsed: sizingResult.marginUsed.toFixed(DECIMAL_PLACES.PERCENT),
        notionalValue: sizingResult.notionalValue.toFixed(DECIMAL_PLACES.PERCENT),
        sizingChain: sizingResult.sizingChain.join(' → '),
      });

      // ===================================================================
      // STEP 2: Cancel any hanging conditional orders from previous position
      // ===================================================================
      this.logger.debug('🧹 Cancelling any hanging conditional orders before opening...');
      try {
        await this.bybitService.cancelAllConditionalOrders();
      } catch (error) {
        this.logger.warn('Failed to cancel hanging orders', {
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue anyway - don't fail the position opening
      }

      // ===================================================================
      // STEP 3: Calculate SL with price recalculation
      // ===================================================================
      const isLong = signal.direction === SignalDirection.LONG;
      const side = isLong ? PositionSide.LONG : PositionSide.SHORT;
      const slDistance = this.calculateSLDistance(signal.price, signal.stopLoss);
      const currentPrice = await this.bybitService.getCurrentPrice();
      const actualStopLoss = this.calculateActualStopLoss(isLong, currentPrice, slDistance);

      this.logger.info('📊 Stop-loss calculated', {
        signalPrice: signal.price,
        currentPrice,
        slDistancePercent: (slDistance / currentPrice * PERCENT_MULTIPLIER).toFixed(2) + '%',
        actualStopLoss: actualStopLoss.toFixed(DECIMAL_PLACES.PERCENT),
      });

      // ===================================================================
      // STEP 4: ATOMIC POSITION OPENING - SL+TP in ONE call (CRITICAL)
      // This prevents race condition liquidations by setting SL atomically
      // ===================================================================
      this.logger.info('🚀 Opening position on exchange with atomic SL/TP protection', {
        side: side === PositionSide.LONG ? 'LONG' : 'SHORT',
        quantity: sizingResult.quantity,
        entry: signal.price,
        sl: actualStopLoss,
        leverage: this.tradingConfig.leverage,
      });

      let orderId: string | undefined;
      let tpOrderIds: (string | undefined)[] = [];

      try {
        // Convert PositionSide to IExchange side format
        const exchangeSide: 'Buy' | 'Sell' = side === PositionSide.LONG ? 'Buy' : 'Sell';

        // Get all TP levels for IExchange interface
        const tpPrices = signal.takeProfits && signal.takeProfits.length > 0
          ? signal.takeProfits.map(tp => tp.price)
          : [];

        // Open position WITH atomic SL and TP protection
        const openedPosition = await this.bybitService.openPosition({
          symbol: this.bybitService.getSymbol?.() || 'UNKNOWN',
          side: exchangeSide,
          quantity: sizingResult.quantity,
          leverage: this.tradingConfig.leverage,
          stopLoss: actualStopLoss, // CRITICAL: SL set atomically with position
          takeProfits: tpPrices, // All TPs set atomically (IExchange expects array)
        });

        // Extract orderId from the returned Position object
        orderId = openedPosition.id;

        this.logger.info('✅ Position opened WITH atomic SL/TP protection', {
          orderId,
          side: side === PositionSide.LONG ? 'LONG' : 'SHORT',
          quantity: sizingResult.quantity,
          slSet: true,
          tpSet: tpPrices.length > 0,
        });

        // Store first TP order ID if TPs were set
        if (tpPrices.length > 0) {
          tpOrderIds.push(orderId);
        }

        // Set additional TP levels (if more than 1)
        if (signal.takeProfits && signal.takeProfits.length > 1) {
          this.logger.info('📋 Setting additional TP levels', {
            additionalLevels: signal.takeProfits.length - 1,
          });

          for (let i = 1; i < signal.takeProfits.length; i++) {
            const tp = signal.takeProfits[i];
            const tpSize = sizingResult.quantity / signal.takeProfits.length;

            try {
              if (this.bybitService.updateTakeProfitPartial) {
                await this.bybitService.updateTakeProfitPartial({
                  price: tp.price,
                  size: tpSize,
                  index: i,
                });
              }

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

      // ===================================================================
      // STEP 5: Create Position object
      // ===================================================================
      const timestamp = Date.now();
      const sideName = side === PositionSide.LONG ? 'Buy' : 'Sell';
      const symbol = this.bybitService.getSymbol?.() || 'UNKNOWN';
      const exchangeId = `${symbol}_${sideName}`;
      const journalId = `${exchangeId}_${timestamp}`;

      const position: Position = {
        id: exchangeId,
        journalId,
        symbol: symbol,
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
        takeProfits: (signal.takeProfits || []).map((tp, i) => ({
          ...tp,
          orderId: tpOrderIds[i] || undefined,
          hit: false,
        })),
        openedAt: timestamp,
        unrealizedPnL: 0,
        orderId,
        reason: 'Position opened',
        protectionVerifiedOnce: true,
        status: 'OPEN' as const,
      };

      // Store position IMMEDIATELY to prevent race condition
      this.currentPosition = position;

      // Emit position-opened event
      this.logger.info('📢 Emitting position-opened event', { positionId: position.id });
      this.eventBus.emit('position-opened', { position });
      console.log('[EVENT] position-opened emitted:', position.id);

      // Initialize TakeProfitManager for partial close tracking
      this.takeProfitManager = new TakeProfitManagerService(
        {
          positionId: position.id,
          symbol: position.symbol,
          side: position.side,
          entryPrice: signal.price,
          totalQuantity: position.quantity,
          leverage: this.tradingConfig.leverage,
        },
        this.logger,
      );

      // ===================================================================
      // STEP 6: Send notifications and record
      // ===================================================================
      try {
        await this.telegram.notifyPositionOpened(position);
      } catch (error) {
        this.logger.warn('Failed to send Telegram notification', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Record trade opening in journal
      this.journal.recordTradeOpen({
        id: journalId,
        symbol: position.symbol,
        side,
        entryPrice: signal.price,
        quantity: sizingResult.quantity,
        leverage: this.tradingConfig.leverage,
        entryCondition: {
          signal,
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
    } catch (error) {
      this.logger.error('Failed to open position', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.isOpeningPosition = false;
    }
  }

  /**
   * Get current position
   */
  getCurrentPosition(): Position | null {
    return this.currentPosition;
  }

  /**
   * Get all open positions from journal
   * @returns Array of Position objects currently open
   */
  getOpenPositions(): Position[] {
    if (!this.journal || !this.currentPosition) {
      return [];
    }

    // Return only the current position (single open position per symbol)
    return [this.currentPosition];
  }

  /**
   * Sync position from WebSocket update
   * Handles both position restoration (after bot restart) and state updates
   */
  syncWithWebSocket(wsPosition: Position): void {
    if (this.currentPosition === null) {
      // Restore position after bot restart
      this.currentPosition = this.restorePositionFromWebSocket(wsPosition);
    } else {
      // Update existing position state
      this.currentPosition = this.updatePositionState(this.currentPosition, wsPosition);
    }
  }

  /**
   * Clear position (called when WebSocket reports position closed)
   */
  async clearPosition(): Promise<void> {
    const closedPosition = this.currentPosition;

    // Cancel any remaining conditional orders
    this.logger.debug('🧹 Cancelling conditional orders after position close...');
    try {
      await this.bybitService.cancelAllConditionalOrders();
    } catch (error) {
      this.logger.warn('Failed to cancel orders', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Clear state
    this.currentPosition = null;
    this.takeProfitManager = null;
    this.isOpeningPosition = false;

    // Emit position-closed event
    if (closedPosition) {
      this.eventBus.emit('position-closed', { position: closedPosition });
    }
  }

  // =========================================================================
  // PUBLIC API: Entry Confirmation
  // =========================================================================

  /**
   * Check if confirmation is enabled for direction
   */
  isConfirmationEnabled(direction: SignalDirection): boolean {
    return this.entryConfirmation.isEnabled(direction);
  }

  /**
   * Add pending signal waiting for candle confirmation
   */
  addPendingSignal(signal: Signal, keyLevel: number): string {
    return this.entryConfirmation.addPending({
      symbol: this.bybitService.getSymbol?.() || 'UNKNOWN',
      direction: signal.direction,
      keyLevel,
      detectedAt: Date.now(),
      signalData: signal as unknown as Record<string, unknown>,
    });
  }

  /**
   * Check pending signals for confirmation
   */
  checkPendingConfirmations(currentCandleClose: number): Signal | null {
    const allPending = this.entryConfirmation.getAllPending();

    for (const pending of allPending) {
      const result = this.entryConfirmation.checkConfirmation(pending.id, currentCandleClose);

      if (result.confirmed) {
        const levelType = pending.direction === SignalDirection.LONG ? 'support' : 'resistance';

        this.logger.info(`✅ ${pending.direction} signal confirmed - ready to enter`, {
          pendingId: pending.id,
          direction: pending.direction,
          [`${levelType}Level`]: pending.keyLevel.toFixed(DECIMAL_PLACES.PRICE),
          candleClose: currentCandleClose.toFixed(DECIMAL_PLACES.PRICE),
        });

        return pending.signalData as unknown as Signal;
      }

      // Log rejections
      if (!result.confirmed) {
        if (pending.direction === SignalDirection.LONG && result.reason.includes('below support')) {
          this.logger.info('❌ LONG signal rejected - falling knife avoided', {
            pendingId: pending.id,
            supportLevel: pending.keyLevel.toFixed(DECIMAL_PLACES.PRICE),
            candleClose: currentCandleClose.toFixed(DECIMAL_PLACES.PRICE),
          });
        } else if (pending.direction === SignalDirection.SHORT && result.reason.includes('above resistance')) {
          this.logger.info('❌ SHORT signal rejected - pump continues', {
            pendingId: pending.id,
            resistanceLevel: pending.keyLevel.toFixed(DECIMAL_PLACES.PRICE),
            candleClose: currentCandleClose.toFixed(DECIMAL_PLACES.PRICE),
          });
        }
      }
    }

    // Cleanup expired entries
    this.entryConfirmation.cleanupExpired();

    return null;
  }

  /**
   * Get count of pending signals
   */
  getPendingCount(direction?: SignalDirection): number {
    return this.entryConfirmation.getPendingCount(direction);
  }

  // =========================================================================
  // PUBLIC API: State Access
  // =========================================================================

  /**
   * Get the current TakeProfitManager (if position is open)
   * Used by PositionExitingService to track TP hits
   */
  getTakeProfitManager(): TakeProfitManagerService | null {
    return this.takeProfitManager;
  }

  // =========================================================================
  // PRIVATE HELPERS: Position Sizing
  // =========================================================================

  /**
   * Calculate final position size with compound interest support
   */
  private async calculatePositionSize(signal: Signal): Promise<{
    quantity: number;
    marginUsed: number;
    notionalValue: number;
    sizingChain: string[];
  }> {
    const sizingChain: string[] = [];
    let positionSizeUsdt: number;

    // Priority 1: Compound Interest (highest priority if enabled)
    if (this.compoundInterestCalculator?.isEnabled?.()) {
      const compoundResult = await this.compoundInterestCalculator.calculatePositionSize();
      positionSizeUsdt = compoundResult.positionSize;
      sizingChain.push('COMPOUND_INTEREST');

      this.logger.info('💰 Position sizing: Compound interest', {
        currentBalance: compoundResult.currentBalance,
        totalProfit: compoundResult.totalProfit,
        positionSize: positionSizeUsdt,
      });
    } else {
      // Priority 2: Fixed position size from config
      positionSizeUsdt = this.riskConfig.positionSizeUsdt;
      sizingChain.push('FIXED');
    }

    // Calculate quantity with leverage
    const rawQuantity = (positionSizeUsdt * this.tradingConfig.leverage) / signal.price;
    const quantity = Math.floor(rawQuantity * 100) / 100; // Simple rounding down
    const marginUsed = positionSizeUsdt;
    const notionalValue = quantity * signal.price;

    return {
      quantity,
      marginUsed,
      notionalValue,
      sizingChain,
    };
  }

  /**
   * Calculate stop-loss distance in absolute price
   */
  private calculateSLDistance(entryPrice: number, signalStopLoss: number): number {
    return Math.abs(signalStopLoss - entryPrice);
  }

  /**
   * Calculate actual stop-loss price accounting for market movement
   */
  private calculateActualStopLoss(
    isLong: boolean,
    currentPrice: number,
    slDistance: number,
  ): number {
    return isLong ? currentPrice - slDistance : currentPrice + slDistance;
  }

  // =========================================================================
  // PRIVATE HELPERS: WebSocket Sync
  // =========================================================================

  /**
   * Restore position from WebSocket after bot restart
   */
  private restorePositionFromWebSocket(position: Position): Position {
    // Try to find matching open trade in journal by symbol
    const openTrade = this.journal.getOpenPositionBySymbol(position.symbol);

    if (openTrade) {
      // Restore journalId from open trade
      position.journalId = openTrade.id;
      this.logger.info('✅ Position restored from WebSocket with journal ID', {
        exchangeId: position.id,
        journalId: position.journalId,
        symbol: position.symbol,
      });
    } else {
      // No open trade in journal - DO NOT create journal entry
      this.logger.warn('⚠️ Position restored from WebSocket but not found in journal - IGNORING from statistics', {
        exchangeId: position.id,
        symbol: position.symbol,
        entryPrice: position.entryPrice,
        quantity: position.quantity,
        note: 'This position will be managed (TP/SL) but NOT recorded in journal.',
      });

      position.journalId = undefined;
    }

    // Initialize status for restored positions
    if (!position.status) {
      position.status = 'OPEN';
    }

    return position;
  }

  /**
   * Update existing position state with WebSocket data
   */
  private updatePositionState(currentPosition: Position, wsPosition: Position): Position {
    // Update quantity and PnL from WebSocket
    currentPosition.quantity = wsPosition.quantity;
    currentPosition.unrealizedPnL = wsPosition.unrealizedPnL;

    // CRITICAL: Only update entryPrice if it's valid (> 0) and current is 0
    // Bybit sends entryPrice=0 for MARKET orders before they're filled
    if (wsPosition.entryPrice > 0 && currentPosition.entryPrice === 0) {
      currentPosition.entryPrice = wsPosition.entryPrice;
      this.logger.info('✅ Entry price updated from WebSocket', {
        positionId: currentPosition.id,
        entryPrice: wsPosition.entryPrice,
      });
    }

    return currentPosition;
  }
}
