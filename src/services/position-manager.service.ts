import { DECIMAL_PLACES, PERCENT_MULTIPLIER } from '../constants';
import { TIMING_CONSTANTS } from '../constants/technical.constants';
/**
 * Position Manager Service
 * Manages trading positions for futures with TP/SL
 *
 * Features:
 * - Open positions with multiple take-profit levels
 * - Automatic stop-loss and take-profit order placement
 * - Breakeven stop-loss after TP1
 * - Trailing stop activation after TP2
 * - Position size calculation based on fixed USDT amount
 *
 * Risk Management:
 * - Fixed position size in USDT (e.g., 10 USDT)
 * - Quantity calculation via PositionCalculatorService
 *   Example: (10 USDT * 10x) / 1.20 = 83.33 coins
 *   This gives total position notional = 100 USDT, margin used = 10 USDT
 * - Multiple TP levels with partial closes
 * - Automatic SL management
 */

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
} from '../types';
import { BybitService } from './bybit';
import { BotEventBus } from './event-bus';
import { TelegramService } from './telegram.service';
import { TradingJournalService } from './trading-journal.service';
import { TakeProfitManagerService } from './take-profit-manager.service';
import { EntryConfirmationManager } from './entry-confirmation.service';
import { PositionCalculatorService } from './position-calculator.service';
import { CompoundInterestCalculatorService } from './compound-interest-calculator.service';
import { SessionStatsService } from './session-stats.service';
import { PositionProtectionService } from './position-protection.service';
import { PositionSyncService } from './position-sync.service';
import { PositionInitializationService } from './position-initialization.service';
import { PositionExecutionService } from './position-execution.service';
import { PositionOpeningService } from './position-opening.service';
import { PositionSizingService } from './position-sizing.service';
// SmartBreakevenService archived to src/archive/phase4-week3/ (consolidated into ExitOrchestrator)
// SmartTrailingV2Service archived to src/archive/phase4-week3/ (consolidated into ExitOrchestrator)
// AdaptiveTP3Service archived to src/archive/phase4-week3/ (consolidated into ExitOrchestrator)

// ============================================================================
// CONSTANTS
// ============================================================================

const PERCENT_TO_DECIMAL = PERCENT_MULTIPLIER;
const MAX_VERIFICATION_RETRIES = TIMING_CONSTANTS.MAX_VERIFICATION_RETRIES;

// ============================================================================
// POSITION MANAGER SERVICE
// ============================================================================

export class PositionManagerService {
  private currentPosition: Position | null = null;
  private isOpeningPosition: boolean = false; // FIX: Prevent duplicate position opening
  private takeProfitManager: TakeProfitManagerService | null = null;
  private entryConfirmation: EntryConfirmationManager;
  private readonly positionCalculator: PositionCalculatorService;
  private readonly compoundInterestCalculator?: CompoundInterestCalculatorService;
  private readonly sessionStats?: SessionStatsService;
  private protectionService!: PositionProtectionService;
  private syncService!: PositionSyncService;
  private initializationService!: PositionInitializationService;
  private executionService!: PositionExecutionService;
  private positionOpeningService!: PositionOpeningService;

  constructor(
    private readonly bybitService: BybitService,
    private readonly tradingConfig: TradingConfig,
    private readonly riskConfig: RiskManagementConfig,
    private readonly telegram: TelegramService,
    private readonly logger: LoggerService,
    private readonly journal: TradingJournalService,
    private readonly entryConfirmationConfig: EntryConfirmationConfig,
    private readonly fullConfig: Config,
    private readonly eventBus: BotEventBus,
    compoundInterestCalculator?: CompoundInterestCalculatorService,
    sessionStats?: SessionStatsService,
  ) {
    this.entryConfirmation = new EntryConfirmationManager(entryConfirmationConfig, logger);
    this.positionCalculator = new PositionCalculatorService(logger);
    this.compoundInterestCalculator = compoundInterestCalculator;
    this.sessionStats = sessionStats;

    // Initialize decomposed services
    this.protectionService = new PositionProtectionService(bybitService, telegram, logger);
    this.syncService = new PositionSyncService(bybitService, journal, logger);
    this.initializationService = new PositionInitializationService(journal, sessionStats, logger);
    this.executionService = new PositionExecutionService(bybitService, logger);
    this.positionOpeningService = new PositionOpeningService(
      bybitService,
      tradingConfig,
      riskConfig,
      telegram,
      logger,
      journal,
      new PositionSizingService(
        bybitService,
        this.positionCalculator,
        logger,
        tradingConfig,
        riskConfig,
        fullConfig,
      ),
      fullConfig,
      undefined, // takeProfitManager is optional
      sessionStats,
    );
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Get strategy-specific SmartBreakeven config
   * Falls back to global config if strategy doesn't have specific config
   */
  private getStrategySmartBreakevenConfig(strategyType?: string): SmartBreakevenConfig | undefined {
    if (!strategyType) {
      return this.fullConfig.smartBreakeven;
    }

    // Map strategy type to config
    switch (strategyType) {
    case SignalType.SCALPING_MICRO_WALL:
      return this.fullConfig.scalpingMicroWall?.smartBreakeven || this.fullConfig.smartBreakeven;
    case SignalType.SCALPING_TICK_DELTA:
      return this.fullConfig.scalpingTickDelta?.smartBreakeven || this.fullConfig.smartBreakeven;
    case SignalType.SCALPING_ORDER_FLOW:
      return this.fullConfig.scalpingOrderFlow?.smartBreakeven || this.fullConfig.smartBreakeven;
    case SignalType.SCALPING_LIMIT_ORDER:
      return this.fullConfig.scalpingLimitOrder?.smartBreakeven || this.fullConfig.smartBreakeven;
    case SignalType.SCALPING_LADDER_TP:
      return this.fullConfig.scalpingLadderTp?.smartBreakeven || this.fullConfig.smartBreakeven;
    case SignalType.WHALE_HUNTER:
    case SignalType.WHALE_HUNTER_FOLLOW:
      return this.fullConfig.whaleHunter?.smartBreakeven || this.fullConfig.smartBreakeven;
    default:
      // For basic strategies (TrendFollowing, LevelBased, CounterTrend), use global config
      return this.fullConfig.smartBreakeven;
    }
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Get the current TakeProfitManager (if position is open)
   * Used by PositionExitingService to track TP hits
   */
  getTakeProfitManager(): TakeProfitManagerService | null {
    return this.takeProfitManager;
  }

  /**
   * Open a new position based on signal
   * Thin wrapper that delegates all opening logic to PositionOpeningService
   * @param signal - Trading signal with entry details
   * @param entrySnapshot - Optional full entry condition snapshot for session stats
   */
  async openPosition(signal: Signal, entrySnapshot?: SessionEntryCondition): Promise<Position> {
    // FIX: Prevent opening position when one already exists
    if (this.currentPosition !== null) {
      throw new Error('Position already exists. Close existing position first.');
    }

    // FIX: Prevent duplicate position opening from concurrent WebSocket events
    if (this.isOpeningPosition) {
      throw new Error('Position opening already in progress. Preventing duplicate.');
    }

    this.isOpeningPosition = true;

    try {
      // Delegate all opening logic to PositionOpeningService
      const position = await this.positionOpeningService.openPosition(signal, undefined, entrySnapshot);

      // CRITICAL: Store position IMMEDIATELY to prevent race condition
      // Between this point and setting currentPosition, periodic cleanup might cancel new TP/SL orders
      // By setting it immediately, we signal that position is under management
      this.currentPosition = position;

      // Emit position-opened event for dashboard and other listeners
      this.eventBus.emit('position-opened', { position });

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
   * Check if confirmation is enabled for direction
   */
  isConfirmationEnabled(direction: SignalDirection): boolean {
    return this.entryConfirmation.isEnabled(direction);
  }

  /**
   * Add pending signal waiting for candle confirmation
   * @param signal - Signal to be confirmed
   * @param keyLevel - Support (LONG) or Resistance (SHORT) level price
   * @returns Pending entry ID
   */
  addPendingSignal(signal: Signal, keyLevel: number): string {
    return this.entryConfirmation.addPending({
      symbol: this.bybitService['symbol'],
      direction: signal.direction,
      keyLevel,
      detectedAt: Date.now(),
      signalData: signal as unknown as Record<string, unknown>,
    });
  }

  /**
   * Check pending signals for confirmation
   * Called every trading cycle with latest 1m candle close price
   * @param currentCandleClose - Current 1m candle close price
   * @returns Confirmed signal or null
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

        // Return the confirmed signal
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
   * @param direction - Optional: filter by direction
   */
  getPendingCount(direction?: SignalDirection): number {
    return this.entryConfirmation.getPendingCount(direction);
  }

  /**
   * Sync position from WebSocket update
   * Delegates to PositionSyncService for restoration and state updates
   */
  syncWithWebSocket(position: Position): void {
    this.currentPosition = this.syncService.syncWithWebSocket(this.currentPosition, position);
  }

  /**
   * Clear position (called when WebSocket reports position closed)
   * Delegates to PositionSyncService for cleanup
   */
  async clearPosition(): Promise<void> {
    const closedPosition = this.currentPosition;
    await this.syncService.clearPosition(this.currentPosition);
    this.currentPosition = null;
    this.takeProfitManager = null;
    this.isOpeningPosition = false; // FIX: Reset flag when clearing position

    // Emit position-closed event for dashboard and other listeners
    if (closedPosition) {
      this.eventBus.emit('position-closed', { position: closedPosition });
    }
  }
}
