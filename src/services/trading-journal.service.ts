import { DECIMAL_PLACES, TIME_UNITS, TIME_MULTIPLIERS, EXCHANGE_FEES } from '../constants';
import { JSON_INDENT } from '../constants/technical.constants';
/**
 * Trading Journal Service
 * Records all trades with complete entry/exit conditions for ML analysis
 *
 * Now integrated with:
 * - TradeHistoryService: permanent CSV storage with dynamic schema
 * - VirtualBalanceService: virtual balance tracking for compound interest
 * - Phase 6.2: IJournalRepository for data access abstraction
 */

import * as fs from 'fs';
import * as path from 'path';
import { TradeRecord, EntryCondition, ExitCondition, PositionSide, LoggerService, TradeHistoryConfig } from '../types';
import { TradeHistoryService, TradeRecord as CSVTradeRecord } from './trade-history.service';
import { VirtualBalanceService } from './virtual-balance.service';
import { IJournalRepository } from '../repositories/IRepositories';
import { ErrorHandler, RecoveryStrategy } from '../errors/ErrorHandler';
import {
  JournalReadError,
  JournalWriteError,
  TradeRecordValidationError,
  CSVExportError,
} from '../errors/DomainErrors';
const DATA_DIR = 'data';
const JOURNAL_FILE = 'trade-journal.json';
const CSV_FILE = 'trade-journal.csv';

export class TradingJournalService {
  private trades: Map<string, TradeRecord> = new Map();
  private readonly journalPath: string;
  private readonly dataDir: string;

  // NEW: Permanent storage and virtual balance
  private tradeHistory?: TradeHistoryService;
  private virtualBalance?: VirtualBalanceService;
  private sessionVersion: string = 'v2.6';

  constructor(
    private readonly logger: LoggerService,
    dataPath?: string,
    private tradeHistoryConfig?: TradeHistoryConfig,
    private baseDeposit?: number,
    private readonly journalRepository?: IJournalRepository, // Phase 6.2: Repository pattern
    private readonly errorHandler?: ErrorHandler, // Phase 8.9.2: ErrorHandler integration
  ) {
    this.dataDir = dataPath || path.join(process.cwd(), DATA_DIR);
    this.journalPath = path.join(this.dataDir, JOURNAL_FILE);

    // Create directory if not exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    // Initialize trade history (permanent CSV)
    if (tradeHistoryConfig?.enabled) {
      this.tradeHistory = new TradeHistoryService(logger, tradeHistoryConfig.dataDir || this.dataDir);

      // Initialize virtual balance
      if (baseDeposit && baseDeposit > 0) {
        this.virtualBalance = new VirtualBalanceService(logger, baseDeposit, tradeHistoryConfig.dataDir || this.dataDir);

        // Sync virtual balance from history on startup
        this.syncVirtualBalanceAsync();
      }
    }

    // Load existing journal
    this.loadJournal();
  }

  /**
   * Sync virtual balance from trade history (async)
   */
  private async syncVirtualBalanceAsync(): Promise<void> {
    if (!this.virtualBalance || !this.tradeHistory) {
      return;
    }

    try {
      const allTrades = await this.tradeHistory.readAllTrades();
      await this.virtualBalance.syncFromHistory(
        allTrades.map(t => ({ id: t.id, netPnl: t.netPnl })),
      );
    } catch (error: unknown) {
      this.logger.error('❌ Failed to sync virtual balance', { error, errorMessage: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Load journal from file with ErrorHandler integration
   * Strategy: GRACEFUL_DEGRADE for file read/parse errors
   */
  private loadJournal(): void {
    try {
      if (!fs.existsSync(this.journalPath)) {
        this.logger.info('📖 Trade journal file not found, creating new', {
          path: this.journalPath,
        });
        return;
      }

      const data = fs.readFileSync(this.journalPath, 'utf-8');

      // Try parsing JSON
      let entries: TradeRecord[];
      try {
        entries = JSON.parse(data) as TradeRecord[];
      } catch (parseError) {
        // JSON parse error - gracefully degrade with backup
        this.logger.warn('⚠️ Corrupted journal file, starting with empty journal', {
          path: this.journalPath,
          backupPath: this.journalPath + '.corrupted',
          reason: parseError instanceof Error ? parseError.message : 'JSON parse error',
        });

        // Backup corrupted file for manual recovery
        try {
          fs.copyFileSync(this.journalPath, this.journalPath + '.corrupted');
        } catch (backupError) {
          this.logger.error('Failed to backup corrupted journal', {
            error: backupError instanceof Error ? backupError.message : String(backupError),
          });
        }

        return;
      }

      // Load entries into trades map
      for (const entry of entries) {
        this.trades.set(entry.id, entry);
      }

      this.logger.info('📖 Trade journal loaded', {
        entriesCount: this.trades.size,
        path: this.journalPath,
      });
    } catch (error) {
      // File read error - degrade gracefully
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to load trade journal', {
        error: errorMsg,
        path: this.journalPath,
      });
      // Service continues with empty journal
    }
  }

  /**
   * Save journal to file with ErrorHandler integration
   * Strategy: RETRY for transient file I/O errors, then GRACEFUL_DEGRADE
   */
  private saveJournal(): void {
    const entries = Array.from(this.trades.values());
    const data = JSON.stringify(entries, null, JSON_INDENT);

    if (this.errorHandler) {
      // Use ErrorHandler with RETRY → GRACEFUL_DEGRADE
      const retryConfig = {
        maxAttempts: 3,
        initialDelayMs: 100,
        backoffMultiplier: 2,
        maxDelayMs: 500,
      };

      this.errorHandler.wrapSync(
        () => {
          fs.writeFileSync(this.journalPath, data, 'utf-8');
        },
        {
          strategy: RecoveryStrategy.RETRY,
          context: 'TradingJournalService.saveJournal',
          retryConfig,
          onRetry: (attempt: number, error: Error) => {
            this.logger.warn(`⚠️ Journal save retry ${attempt}/${retryConfig.maxAttempts}`, {
              error: error.message,
              path: this.journalPath,
            });
          },
          onRecover: () => {
            this.logger.debug('💾 Trade journal saved after retry', {
              entriesCount: entries.length,
            });
          },
          onFailure: (error: Error) => {
            // Graceful degrade: Log error but don't crash
            this.logger.error('❌ CRITICAL: Failed to save journal after retries', {
              error: error.message,
              entries: entries.length,
              path: this.journalPath,
            });
          },
        },
      );
      return;
    }

    // No error handler - use old behavior
    try {
      fs.writeFileSync(this.journalPath, data, 'utf-8');
      this.logger.debug('💾 Trade journal saved', { entriesCount: entries.length });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to save trade journal', { error: errorMsg });
    }
  }

  /**
   * Record trade opening - simplified to serialize entire objects
   * Strategy: THROW for validation errors (fail fast on duplicates)
   */
  recordTradeOpen(params: {
    id: string;
    symbol: string;
    side: PositionSide;
    entryPrice: number;
    quantity: number;
    leverage: number;
    entryCondition: EntryCondition;
  }): void {
    // Validation: Empty trade ID
    if (!params.id || params.id.length === 0) {
      throw new TradeRecordValidationError('Trade ID is required', {
        field: 'id',
        value: params.id,
        reason: 'Empty or missing trade ID',
      });
    }

    // Validation: Duplicate trade ID
    if (this.trades.has(params.id)) {
      throw new TradeRecordValidationError(
        `Trade ${params.id} already exists in journal`,
        {
          field: 'id',
          value: params.id,
          reason: 'Duplicate trade ID',
          tradeId: params.id,
        },
      );
    }

    const trade: TradeRecord = {
      id: params.id,
      symbol: params.symbol,
      side: params.side,
      entryPrice: params.entryPrice,
      quantity: params.quantity,
      leverage: params.leverage,
      entryCondition: params.entryCondition,
      openedAt: Date.now(),
      status: 'OPEN',
    };

    // Phase 6.2: Store in Map (repository type compatibility pending)
    // TODO: Adapt TradeRecord type for full repository integration
    this.trades.set(params.id, trade);
    this.saveJournal();

    if (this.journalRepository) {
      this.logger.debug('[Phase 6.2] Repository available (type adaptation pending)', { tradeId: trade.id });
    }

    this.logger.info('📝 Trade entry recorded', {
      id: trade.id,
      symbol: trade.symbol,
      side: trade.side,
      entryPrice: trade.entryPrice.toFixed(DECIMAL_PLACES.PRICE),
      signal: params.entryCondition.signal.reason,
      type: params.entryCondition.signal.type,
      confidence: params.entryCondition.signal.confidence,
    });
  }

  /**
   * [P1] Create snapshot of trade state before update
   */
  private snapshotTradeState(tradeId: string): TradeRecord | null {
    const trade = this.trades.get(tradeId);
    return trade ? { ...trade } : null;
  }

  /**
   * Record trade closing with rollback capability
   * Returns rollback function for transactional failure handling
   */
  recordTradeClose(params: {
    id: string;
    exitPrice: number;
    exitCondition: ExitCondition;
    realizedPnL: number;
  }): { rollback: () => void } {
    const trade = this.trades.get(params.id);

    if (trade === undefined) {
      throw new Error(`Trade ${params.id} not found`);
    }

    // [P1] Snapshot state BEFORE update
    const snapshot = this.snapshotTradeState(params.id);
    if (!snapshot) {
      throw new Error(`Failed to snapshot trade state for ${params.id}`);
    }

    // Get virtual balance BEFORE update
    const balanceBefore = this.virtualBalance?.getCurrentBalance() || 0;

    // Update trade in memory
    trade.exitPrice = params.exitPrice;
    trade.exitCondition = params.exitCondition;
    trade.realizedPnL = params.realizedPnL;
    trade.closedAt = Date.now();
    trade.status = 'CLOSED';

    this.trades.set(params.id, trade);
    this.saveJournal();

    // Calculate fees (Bybit: 0.06% taker for market orders)
    const positionValue = trade.quantity * trade.entryPrice;
    const entryFee = positionValue * EXCHANGE_FEES.BYBIT_TAKER_FEE_PERCENT; // 0.06% entry
    const exitFee = positionValue * EXCHANGE_FEES.BYBIT_TAKER_FEE_PERCENT; // 0.06% exit
    const totalFees = entryFee + exitFee;
    const netPnL = params.realizedPnL - totalFees;

    // Update virtual balance with NET PnL
    if (this.virtualBalance) {
      this.virtualBalance.updateBalance(netPnL, params.id);
    }

    const balanceAfter = this.virtualBalance?.getCurrentBalance() || balanceBefore;

    // Append to permanent CSV history with SKIP strategy
    if (this.tradeHistory && this.tradeHistoryConfig?.enabled) {
      const md = (trade.entryCondition.signal.marketData || {}) as Record<string, unknown>;
      const duration = this.formatDuration(trade.closedAt - trade.openedAt);

      const csvRecord: CSVTradeRecord = {
        // Core fields
        timestamp: new Date(trade.openedAt).toISOString(),
        id: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        strategy: trade.entryCondition.signal.type,
        entryPrice: trade.entryPrice,
        exitPrice: params.exitPrice,
        quantity: trade.quantity,
        leverage: trade.leverage,
        pnl: params.realizedPnL,
        fees: totalFees,
        netPnl: netPnL,
        duration: duration,
        exitType: params.exitCondition.exitType,
        confidence: trade.entryCondition.signal.confidence,
        virtualBalanceBefore: balanceBefore,
        virtualBalanceAfter: balanceAfter,
        sessionVersion: this.sessionVersion,
        notes: trade.entryCondition.signal.reason,

        // Dynamic indicator fields (from marketData)
        rsi: md.rsi,
        rsiEntry: md.rsiEntry,
        rsiTrend1: md.rsiTrend1,
        ema: md.ema,
        emaEntry: md.emaEntry,
        distanceToLevel: md.distanceToLevel,
        distanceToEma: md.distanceToEma,
        volumeRatio: md.volumeRatio,
        swingHighsCount: md.swingHighsCount,
        swingLowsCount: md.swingLowsCount,
        trend: md.trend,
        atr: md.atr,
        btcCorrelation: md.btcCorrelation,
        // NEW: Stochastic indicator data
        stochasticK: (md.stochastic as Record<string, unknown>)?.k,
        stochasticD: (md.stochastic as Record<string, unknown>)?.d,
        stochasticOversold: (md.stochastic as Record<string, unknown>)?.isOversold,
        stochasticOverbought: (md.stochastic as Record<string, unknown>)?.isOverbought,
        // NEW: Bollinger Bands data
        bollingerUpper: (md.bollingerBands as Record<string, unknown>)?.upper,
        bollingerMiddle: (md.bollingerBands as Record<string, unknown>)?.middle,
        bollingerLower: (md.bollingerBands as Record<string, unknown>)?.lower,
        bollingerWidth: (md.bollingerBands as Record<string, unknown>)?.width,
        bollingerPercentB: (md.bollingerBands as Record<string, unknown>)?.percentB,
        bollingerSqueeze: (md.bollingerBands as Record<string, unknown>)?.isSqueeze,

        // Exit condition details
        exitReason: params.exitCondition.reason,
        tpLevelsHit: params.exitCondition.tpLevelsHit.join(';'),
        tpLevelsHitCount: params.exitCondition.tpLevelsHitCount,
        stoppedOut: params.exitCondition.stoppedOut,
        slMovedToBreakeven: params.exitCondition.slMovedToBreakeven,
        trailingStopActivated: params.exitCondition.trailingStopActivated,
        maxProfitPercent: params.exitCondition.maxProfitPercent,
        maxDrawdownPercent: params.exitCondition.maxDrawdownPercent,
        holdingTimeMinutes: params.exitCondition.holdingTimeMinutes,
        pnlPercent: params.exitCondition.pnlPercent,
      };

      this.tradeHistory.appendTrade(csvRecord).catch((error: unknown) => {
        if (this.errorHandler) {
          this.errorHandler.wrapSync(
            () => {
              throw error;
            },
            {
              strategy: RecoveryStrategy.SKIP,
              context: 'TradingJournalService.recordTradeClose[tradeHistory]',
            },
          );
        }
        this.logger.error('❌ Failed to append to CSV history', {
          error: error instanceof Error ? error.message : String(error),
          tradeId: params.id,
        });
      });
    }

    this.logger.info('📝 Trade exit recorded', {
      id: trade.id,
      symbol: trade.symbol,
      exitType: params.exitCondition.exitType,
      realizedPnL: params.realizedPnL.toFixed(DECIMAL_PLACES.PERCENT) + ' USDT',
      netPnL: netPnL.toFixed(DECIMAL_PLACES.PERCENT) + ' USDT',
      fees: totalFees.toFixed(DECIMAL_PLACES.PERCENT) + ' USDT',
      pnlPercent: params.exitCondition.pnlPercent.toFixed(DECIMAL_PLACES.PERCENT) + '%',
      holdingTime: params.exitCondition.holdingTimeMinutes.toFixed(1) + ' min',
      tpHit: params.exitCondition.tpLevelsHit.join(', ') || 'none',
      virtualBalance: balanceAfter.toFixed(DECIMAL_PLACES.PERCENT) + ' USDT',
    });

    // [P1] Return rollback function for transactional error handling
    return {
      rollback: () => {
        if (!snapshot) {
          this.logger.error('❌ CRITICAL: Cannot rollback - snapshot missing');
          return;
        }

        // Restore trade state
        this.trades.set(snapshot.id, snapshot);
        this.saveJournal();

        // Restore virtual balance if it was updated
        const balanceAfterUpdate = this.virtualBalance?.getCurrentBalance() || 0;
        if (balanceAfterUpdate !== balanceBefore) {
          const balanceDiff = balanceAfterUpdate - balanceBefore;
          if (this.virtualBalance) {
            this.virtualBalance.updateBalance(-balanceDiff, `ROLLBACK_${params.id}`);
          }
        }

        this.logger.info('✅ Journal rollback complete', {
          tradeId: params.id,
          balanceRestored: balanceBefore,
        });
      },
    };
  }

  /**
   * Get trade by ID
   */
  getTrade(id: string): TradeRecord | undefined {
    return this.trades.get(id);
  }

  /**
   * Get all trades
   * Phase 6.2: Uses repository if available, fallback to in-memory Map
   */
  getAllTrades(): TradeRecord[] {
    // For now, return from in-memory Map (repository is async, we're sync)
    // Repository sync happens in background when trades are recorded
    if (this.journalRepository) {
      this.logger.debug('[Phase 6.2] getAllTrades called - repository available but using sync Map for compatibility');
    }
    return Array.from(this.trades.values());
  }

  /**
   * Get open trades
   */
  getOpenTrades(): TradeRecord[] {
    return this.getAllTrades().filter((t) => t.status === 'OPEN');
  }

  /**
   * Get open position by symbol
   * Used for restoring position state from WebSocket
   */
  getOpenPositionBySymbol(symbol: string): TradeRecord | undefined {
    return this.getOpenTrades().find((t) => t.symbol === symbol);
  }

  /**
   * Get closed trades
   */
  getClosedTrades(): TradeRecord[] {
    return this.getAllTrades().filter((t) => t.status === 'CLOSED');
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalTrades: number;
    openTrades: number;
    closedTrades: number;
    winningTrades: number;
    losingTrades: number;
    totalPnL: number;
    averagePnL: number;
    winRate: number;
    averageHoldingTimeMinutes: number;
    } {
    const closed = this.getClosedTrades();
    const winning = closed.filter((t) => t.realizedPnL && t.realizedPnL > 0);
    const losing = closed.filter((t) => t.realizedPnL && t.realizedPnL <= 0);

    const totalPnL = closed.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);

    const averageHoldingTime =
      closed.reduce(
        (sum, t) => sum + (t.exitCondition?.holdingTimeMinutes || 0),
        0,
      ) / (closed.length > 0 ? closed.length : 1);

    return {
      totalTrades: this.trades.size,
      openTrades: this.getOpenTrades().length,
      closedTrades: closed.length,
      winningTrades: winning.length,
      losingTrades: losing.length,
      totalPnL,
      averagePnL: closed.length > 0 ? totalPnL / closed.length : 0,
      winRate: closed.length > 0 ? winning.length / closed.length : 0,
      averageHoldingTimeMinutes: averageHoldingTime,
    };
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(durationMs: number): string {
    const minutes = Math.floor(durationMs / TIME_UNITS.MINUTE);
    const hours = Math.floor(minutes / TIME_MULTIPLIERS.MINUTES_PER_HOUR);
    const days = Math.floor(hours / TIME_MULTIPLIERS.HOURS_PER_DAY);

    if (days > 0) {
      return `${days}d ${hours % TIME_MULTIPLIERS.HOURS_PER_DAY}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % TIME_MULTIPLIERS.MINUTES_PER_HOUR}m`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Get virtual balance (for compound interest calculation)
   */
  getVirtualBalance(): number {
    return this.virtualBalance?.getCurrentBalance() || 0;
  }

  /**
   * Get virtual balance service (for external access)
   */
  getVirtualBalanceService(): VirtualBalanceService | undefined {
    return this.virtualBalance;
  }

  /**
   * Export to CSV for ML analysis
   * Strategy: GRACEFUL_DEGRADE for CSV export (non-critical operation)
   */
  exportToCSV(outputPath?: string): void {
    const csvPath = outputPath || path.join(this.dataDir, CSV_FILE);

    try {
      const entries = Array.from(this.trades.values());

      // CSV header
      const header = [
        'ID',
        'Symbol',
        'Side',
        'Entry Price',
        'Exit Price',
        'Quantity',
        'Leverage',
        // Entry conditions
        'Signal Type',
        'Signal Reason',
        'Confidence',
        'RSI',
        'RSI Entry',
        'RSI Trend1',
        'EMA',
        'EMA Entry',
        'Distance to Level %',
        'Distance to EMA %',
        'Volume Multiplier',
        'Swing Highs',
        'Swing Lows',
        'Trend',
        'Market Condition',
        // Exit conditions
        'Exit Type',
        'Exit Reason',
        'Realized PnL USDT',
        'PnL %',
        'Holding Time Min',
        'TP Levels Hit',
        'TP Count',
        'Stopped Out',
        'SL to Breakeven',
        'Trailing Activated',
        'Max Profit %',
        'Max Drawdown %',
        // Timestamps
        'Opened At',
        'Closed At',
        'Status',
      ].join(',');

      // CSV rows - simplified to work with new structure
      const rows = entries.map((t) => {
        const ec = t.entryCondition;
        const ex = t.exitCondition;
        const sig = ec.signal;
        const md = (sig.marketData || {}) as Record<string, unknown>;

        return [
          t.id,
          t.symbol,
          t.side,
          t.entryPrice.toFixed(DECIMAL_PLACES.PRICE),
          t.exitPrice?.toFixed(DECIMAL_PLACES.PRICE) || '',
          t.quantity,
          t.leverage,
          // Entry - from Signal object
          sig.type,
          `"${sig.reason}"`,
          sig.confidence,
          typeof md.rsi === 'number' ? md.rsi.toFixed(DECIMAL_PLACES.PERCENT) : '',
          typeof md.rsiEntry === 'number' ? md.rsiEntry.toFixed(DECIMAL_PLACES.PERCENT) : '',
          typeof md.rsiTrend1 === 'number' ? md.rsiTrend1.toFixed(DECIMAL_PLACES.PERCENT) : '',
          typeof md.ema === 'number' ? md.ema.toFixed(DECIMAL_PLACES.PRICE) : '',
          typeof md.emaEntry === 'number' ? md.emaEntry.toFixed(DECIMAL_PLACES.PRICE) : '',
          typeof md.distanceToLevel === 'number' ? md.distanceToLevel.toFixed(DECIMAL_PLACES.PERCENT) : '',
          typeof md.distanceToEma === 'number' ? md.distanceToEma.toFixed(DECIMAL_PLACES.PERCENT) : '',
          typeof md.volumeRatio === 'number' ? md.volumeRatio.toFixed(DECIMAL_PLACES.PERCENT) : '',
          md.swingHighsCount || '',
          md.swingLowsCount || '',
          md.trend || '',
          md.trend || '', // marketCondition
          // Exit
          ((ex?.exitType) != null) || '',
          ex ? `"${ex.reason}"` : '',
          t.realizedPnL?.toFixed(DECIMAL_PLACES.PERCENT) || '',
          ex?.pnlPercent.toFixed(DECIMAL_PLACES.PERCENT) || '',
          ex?.holdingTimeMinutes.toFixed(1) || '',
          ex?.tpLevelsHit.join(';') || '',
          ex?.tpLevelsHitCount || 0,
          ex?.stoppedOut || false,
          ex?.slMovedToBreakeven || false,
          ex?.trailingStopActivated || false,
          ex?.maxProfitPercent?.toFixed(DECIMAL_PLACES.PERCENT) || '',
          ex?.maxDrawdownPercent?.toFixed(DECIMAL_PLACES.PERCENT) || '',
          // Timestamps
          new Date(t.openedAt).toISOString(),
          t.closedAt ? new Date(t.closedAt).toISOString() : '',
          t.status,
        ].join(',');
      });

      const csv = [header, ...rows].join('\n');
      fs.writeFileSync(csvPath, csv, 'utf-8');

      this.logger.info('📊 Trade journal exported to CSV', {
        path: csvPath,
        entries: entries.length,
      });
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.wrapSync(
          () => {
            throw new CSVExportError('Failed to export journal to CSV', {
              filePath: csvPath,
              reason: error instanceof Error ? error.message : 'Unknown error',
              recordsCount: this.trades.size,
            });
          },
          {
            strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
            context: 'TradingJournalService.exportToCSV',
          },
        );
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to export trade journal to CSV', {
        error: errorMsg,
        path: csvPath,
      });
    }
  }

  /**
   * Clear all trades (for testing)
   */
  clear(): void {
    this.trades.clear();
    this.saveJournal();
  }
}
