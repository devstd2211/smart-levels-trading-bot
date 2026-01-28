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
import { IPositionRepository } from '../repositories/IRepositories';
import { ErrorHandler, RecoveryStrategy } from '../errors';

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

  // PHASE 9.P0: Atomic lock for position close (prevent timeout ↔ close race)
  private positionClosing = new Map<string, Promise<void>>();

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
    private readonly strategyId?: string,  // Phase 10.3c: Strategy identifier for event tagging
    private readonly positionRepository?: IPositionRepository, // Phase 6.2: Repository pattern
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
      // Phase 8.7: ErrorHandler integration with RETRY strategy
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

      // Convert PositionSide to IExchange side format
      const exchangeSide: 'Buy' | 'Sell' = side === PositionSide.LONG ? 'Buy' : 'Sell';

      // Get all TP levels for IExchange interface
      const tpPrices = signal.takeProfits && signal.takeProfits.length > 0
        ? signal.takeProfits.map(tp => tp.price)
        : [];

      // Phase 8.7: Retry exchange operation with exponential backoff
      const openResult = await ErrorHandler.executeAsync(
        () => this.bybitService.openPosition({
          symbol: this.bybitService.getSymbol?.() || 'UNKNOWN',
          side: exchangeSide,
          quantity: sizingResult.quantity,
          leverage: this.tradingConfig.leverage,
          stopLoss: actualStopLoss,
          takeProfits: tpPrices,
        }),
        {
          strategy: RecoveryStrategy.RETRY,
          retryConfig: {
            maxAttempts: 3,
            initialDelayMs: 500,
            backoffMultiplier: 2,
            maxDelayMs: 5000,
          },
          logger: this.logger,
          context: 'PositionLifecycleService.openPosition',
          onRetry: (attempt, error, delayMs) => {
            this.logger.warn(`🔄 Retrying position open (attempt ${attempt}/3)`, {
              delayMs,
              error: error.message,
            });
          },
        }
      );

      if (!openResult.success || !openResult.value) {
        throw openResult.error || new Error('Failed to open position on exchange');
      }

      const openedPosition = openResult.value;

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

      // Phase 8.7: SKIP strategy for additional TP levels (non-critical)
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
            // Continue with other TPs - SKIP strategy for non-critical operation
          }
        }
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
      // Phase 6.2: Use repository if available, fallback to direct storage
      if (this.positionRepository) {
        this.positionRepository.setCurrentPosition(position);
        this.logger.debug('[Phase 6.2] Position stored in repository', { positionId: position.id });
      } else {
        this.currentPosition = position;
      }

      // Emit position-opened event
      this.logger.info('📢 Emitting position-opened event', { positionId: position.id });
      this.eventBus.emit('position-opened', {
        position,
        strategyId: this.strategyId,  // Phase 10.3c: Include strategyId for multi-strategy filtering
      });
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
      // Phase 8.7: SKIP strategy for Telegram (non-critical)
      // ===================================================================
      await ErrorHandler.executeAsync(
        () => this.telegram.notifyPositionOpened(position),
        {
          strategy: RecoveryStrategy.SKIP,
          logger: this.logger,
          context: 'PositionLifecycleService.notifyPositionOpened',
          onRecover: () => {
            this.logger.info('Telegram notification skipped due to error');
          },
        }
      );

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
   * Phase 6.2: Read from repository if available, fallback to direct storage
   */
  getCurrentPosition(): Position | null {
    if (this.positionRepository) {
      return this.positionRepository.getCurrentPosition();
    }
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
   * Phase 8.7: GRACEFUL_DEGRADE if journal lookup fails
   */
  syncWithWebSocket(wsPosition: Position): void {
    if (this.currentPosition === null) {
      // Restore position after bot restart
      // Phase 8.7: GRACEFUL_DEGRADE - continue without journalId if journal unavailable
      try {
        this.currentPosition = this.restorePositionFromWebSocket(wsPosition);
      } catch (error) {
        this.logger.warn('Position restoration encountered error, degrading gracefully', {
          error: error instanceof Error ? error.message : String(error),
        });
        // Degrade: use wsPosition directly without journal lookup
        this.currentPosition = wsPosition;
        this.logger.warn('Using WebSocket position directly without journal verification', {
          positionId: wsPosition.id,
        });
      }
    } else {
      // Update existing position state
      this.currentPosition = this.updatePositionState(this.currentPosition, wsPosition);
    }
  }

  /**
   * Clear position (called when WebSocket reports position closed)
   * Phase 6.2: Clear from repository if available
   * Phase 8.7: ErrorHandler integration for order cancellation
   */
  async clearPosition(): Promise<void> {
    // Get position before clearing (for event emission)
    const closedPosition = this.positionRepository
      ? this.positionRepository.getCurrentPosition()
      : this.currentPosition;

    // Phase 8.7: Cancel with RETRY strategy, then SKIP if exhausted
    this.logger.debug('🧹 Cancelling conditional orders after position close...');
    await ErrorHandler.executeAsync(
      () => this.bybitService.cancelAllConditionalOrders(),
      {
        strategy: RecoveryStrategy.RETRY,
        retryConfig: {
          maxAttempts: 3,
          initialDelayMs: 200,
          backoffMultiplier: 2,
          maxDelayMs: 2000,
        },
        logger: this.logger,
        context: 'PositionLifecycleService.cancelAllConditionalOrders',
        onRetry: (attempt, error, delayMs) => {
          this.logger.warn(`🔄 Retrying order cancellation (attempt ${attempt}/3)`, {
            delayMs,
            error: error.message,
          });
        },
        onFailure: () => {
          this.logger.warn('Failed to cancel orders - proceeding with position clear');
        },
      }
    );

    // Clear state
    // Phase 6.2: Use repository if available
    if (this.positionRepository && closedPosition) {
      this.positionRepository.setCurrentPosition(null);
      this.logger.debug('[Phase 6.2] Position cleared from repository', { positionId: closedPosition.id });
    } else {
      this.currentPosition = null;
    }
    this.takeProfitManager = null;
    this.isOpeningPosition = false;

    // Emit position-closed event
    if (closedPosition) {
      this.eventBus.emit('position-closed', {
        position: closedPosition,
        strategyId: this.strategyId,  // Phase 10.3c: Include strategyId for multi-strategy filtering
      });
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
   * Phase 8.7: FALLBACK strategy if compound calculation fails
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
      try {
        const compoundResult = await this.compoundInterestCalculator.calculatePositionSize();
        positionSizeUsdt = compoundResult.positionSize;
        sizingChain.push('COMPOUND_INTEREST');

        this.logger.info('💰 Position sizing: Compound interest', {
          currentBalance: compoundResult.currentBalance,
          totalProfit: compoundResult.totalProfit,
          positionSize: positionSizeUsdt,
        });
      } catch (error) {
        // Phase 8.7: FALLBACK to fixed size if compound fails
        this.logger.warn('Compound interest calculation failed, falling back to fixed size', {
          error: error instanceof Error ? error.message : String(error),
        });
        positionSizeUsdt = this.riskConfig.positionSizeUsdt;
        sizingChain.push('COMPOUND_INTEREST_FAILED');
        sizingChain.push('FALLBACK_FIXED');
      }
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
   * Phase 8.7: GRACEFUL_DEGRADE - continue without journalId if journal unavailable
   */
  private restorePositionFromWebSocket(position: Position): Position {
    // Phase 8.7: Try to find matching open trade in journal with graceful degradation
    try {
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
        // No open trade in journal - DO NOT create journal entry (graceful degrade)
        this.logger.warn('⚠️ Position restored from WebSocket but not found in journal - IGNORING from statistics', {
          exchangeId: position.id,
          symbol: position.symbol,
          entryPrice: position.entryPrice,
          quantity: position.quantity,
          note: 'This position will be managed (TP/SL) but NOT recorded in journal.',
        });

        position.journalId = undefined;
      }
    } catch (error) {
      // Journal lookup failed - graceful degrade (continue without journalId)
      this.logger.warn('Journal lookup failed during position restoration - proceeding without journalId', {
        error: error instanceof Error ? error.message : String(error),
        positionId: position.id,
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

  // =========================================================================
  // PHASE 9.P0: Safety Guards for Live Trading Integration
  // =========================================================================

  /**
   * P0.1: Close position with atomic guarantee
   * Prevents timeout ↔ close race condition by using atomic lock
   *
   * Returns early if position already closing (returns same promise)
   * Multiple concurrent calls to same position wait for first close to complete
   */
  /**
   * [P0.1 + P3] Close position with atomic lock
   * Prevents race conditions between timeout close, WebSocket close, and local close
   *
   * @param reason - Reason for close ('EXTERNAL_CLOSE', 'TIMEOUT', etc)
   * @param onCloseInternal - Optional callback to execute within the lock (e.g., WebSocket handler)
   */
  async closePositionWithAtomicLock(
    reason: string,
    onCloseInternal?: () => Promise<void>,
  ): Promise<void> {
    const position = this.getCurrentPosition();
    const positionId = position?.id || 'UNKNOWN';

    // Check if already closing this position
    if (this.positionClosing.has(positionId)) {
      this.logger.warn(`[P0.1 + P3] Position already closing: ${positionId}`, { reason });
      return this.positionClosing.get(positionId)!; // Wait for in-progress close
    }

    // Create close promise
    const closePromise = this.performClose(positionId, reason, onCloseInternal);
    this.positionClosing.set(positionId, closePromise);

    try {
      await closePromise;
    } finally {
      // Clean up lock
      this.positionClosing.delete(positionId);
    }
  }

  /**
   * [P0.1 + P3] Perform actual close operation within atomic lock
   * If onCloseInternal is provided, it executes within the lock (for WebSocket handler)
   * Otherwise, just clears the position (for timeout-based close)
   */
  private async performClose(
    positionId: string,
    reason: string,
    onCloseInternal?: () => Promise<void>,
  ): Promise<void> {
    const position = this.getCurrentPosition();
    if (!position) {
      this.logger.info(`[P0.1 + P3] Position already closed or not found: ${positionId}`, {
        reason,
      });
      return;
    }

    try {
      this.logger.info(`[P0.1 + P3] Closing position with atomic lock: ${positionId}`, {
        reason,
        hasCloseHandler: !!onCloseInternal,
      });

      // If custom close handler provided (e.g., WebSocket), execute it within the lock
      if (onCloseInternal) {
        await onCloseInternal();
      } else {
        // Standard timeout-based close: just clear position
        await this.clearPosition();
      }

      this.logger.info(`[P0.1 + P3] Position closed successfully: ${positionId}`, {
        reason,
      });
    } catch (error) {
      this.logger.error(`[P0.1 + P3] Failed to close position: ${positionId}`, {
        error: error instanceof Error ? error.message : String(error),
        reason,
      });
      throw error;
    }
  }

  /**
   * P0.3: Get atomic snapshot of current position
   * Prevents WebSocket updates from changing fields mid-calculation
   * Used by Phase 9 services for concurrent-safe position reads
   *
   * Returns deep copy so concurrent WebSocket updates don't affect snapshot
   */
  getPositionSnapshot(): Position | null {
    const position = this.getCurrentPosition();
    if (!position) return null;

    // Deep copy = atomic read (WebSocket changes won't affect copy)
    try {
      return JSON.parse(JSON.stringify(position));
    } catch (error) {
      this.logger.error('[P0.3] Failed to create position snapshot', { error });
      return position; // Fallback to reference if copy fails
    }
  }
}
