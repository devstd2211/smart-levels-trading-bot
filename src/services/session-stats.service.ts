import { DECIMAL_PLACES, PERCENT_MULTIPLIER } from '../constants';
import { TIME_MULTIPLIERS, INTEGER_MULTIPLIERS } from '../constants/technical.constants';
/**
 * Session Statistics Service
 *
 * Manages persistent session-based trading statistics for performance analysis.
 * Tracks all trades with full entry context (indicators, patterns, levels, context)
 * and generates comparative analysis across different configurations.
 *
 * Phase 6.2: Integrated with IJournalRepository for persistent storage
 * Version: v3.4.0
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  LoggerService,
  Session,
  SessionDatabase,
  SessionTradeRecord,
  SessionSummary,
  StrategyStats,
  DirectionStats,
  SignalDirection,
  ExitType,
  Config,
} from '../types';
import { IJournalRepository } from '../repositories/IRepositories';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_DATA_DIR = './data';
const SESSION_STATS_FILE = 'session-stats.json';
const BOT_VERSION = 'v3.4.0';

// ============================================================================
// SESSION STATS SERVICE
// ============================================================================

export class SessionStatsService {
  private readonly logger: LoggerService;
  private readonly dataDir: string;
  private readonly filePath: string;

  private database: SessionDatabase = { sessions: [] };
  private currentSession: Session | null = null;

  constructor(
    logger: LoggerService,
    private readonly journalRepository?: IJournalRepository, // Phase 6.2: Repository pattern
    dataDir: string = DEFAULT_DATA_DIR,
  ) {
    this.logger = logger;
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, SESSION_STATS_FILE);

    // Load existing database
    this.load();
  }

  // ==========================================================================
  // SESSION LIFECYCLE
  // ==========================================================================

  /**
   * Start a new trading session
   * @param config - Full bot configuration snapshot
   * @param symbol - Trading symbol (e.g., "APEXUSDT")
   * @returns Session ID
   */
  startSession(config: Config, symbol: string): string {
    // Close previous session if exists
    if (this.currentSession !== null) {
      this.logger.warn('Previous session not closed, closing now');
      this.endSession();
    }

    // Generate session ID
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const sessionId = `session_${timestamp}`;

    // Create new session
    this.currentSession = {
      sessionId,
      startTime: new Date().toISOString(),
      endTime: null,
      version: BOT_VERSION,
      symbol,
      config,
      trades: [],
      summary: this.createEmptySummary(),
    };

    // Add to database
    this.database.sessions.push(this.currentSession);

    this.logger.info('📊 Trading session started', {
      sessionId,
      symbol,
      version: BOT_VERSION,
    });

    this.save();

    return sessionId;
  }

  /**
   * End current trading session
   */
  endSession(): void {
    if (this.currentSession === null) {
      this.logger.warn('No active session to end');
      return;
    }

    // Update session end time
    this.currentSession.endTime = new Date().toISOString();

    // Recalculate summary with all trades
    this.currentSession.summary = this.calculateSummary(this.currentSession.trades);

    this.logger.info('📊 Trading session ended', {
      sessionId: this.currentSession.sessionId,
      totalTrades: this.currentSession.trades.length,
      winRate: this.currentSession.summary.winRate.toFixed(1) + '%',
      totalPnl: this.currentSession.summary.totalPnl.toFixed(DECIMAL_PLACES.PERCENT),
      duration: this.calculateDuration(this.currentSession.startTime, this.currentSession.endTime),
    });

    this.save();
    this.currentSession = null;
  }

  /**
   * Get current active session
   */
  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  // ==========================================================================
  // TRADE RECORDING
  // ==========================================================================

  /**
   * Record trade entry
   * @param trade - Trade record with entry condition
   */
  recordTradeEntry(trade: SessionTradeRecord): void {
    if (this.currentSession === null) {
      this.logger.error('Cannot record trade - no active session');
      return;
    }

    // Add trade to current session
    this.currentSession.trades.push(trade);

    this.logger.debug('📝 Trade entry recorded', {
      sessionId: this.currentSession.sessionId,
      tradeId: trade.tradeId,
      direction: trade.direction,
      strategy: trade.entryCondition.signal.type,
    });

    // Update summary incrementally
    this.currentSession.summary = this.calculateSummary(this.currentSession.trades);

    this.save();
  }

  /**
   * Update trade exit
   * @param tradeId - Trade ID to update
   * @param exitData - Exit data (price, PnL, exitType, etc.)
   */
  updateTradeExit(
    tradeId: string,
    exitData: {
      exitPrice: number;
      pnl: number;
      pnlPercent: number;
      exitType: ExitType;
      tpHitLevels: number[];
      holdingTimeMs: number;
      stopLoss: {
        initial: number;
        final: number;
        movedToBreakeven: boolean;
        trailingActivated: boolean;
      };
    },
  ): void {
    if (this.currentSession === null) {
      this.logger.warn('Cannot update trade - no active session (session may have ended)');
      return;
    }

    // Find trade by ID
    const trade = this.currentSession.trades.find((t) => t.tradeId === tradeId);
    if (trade === undefined) {
      // GRACEFUL DEGRADATION: Don't error for missing trades (may be restored positions)
      this.logger.warn('Trade not found in session (may be restored position without journalId)', {
        tradeId,
        sessionId: this.currentSession.sessionId,
      });
      return;
    }

    // Update trade exit data
    trade.exitPrice = exitData.exitPrice;
    trade.pnl = exitData.pnl;
    trade.pnlPercent = exitData.pnlPercent;
    trade.exitType = exitData.exitType;
    trade.tpHitLevels = exitData.tpHitLevels;
    trade.holdingTimeMs = exitData.holdingTimeMs;
    trade.stopLoss = exitData.stopLoss;

    this.logger.debug('📝 Trade exit updated', {
      sessionId: this.currentSession.sessionId,
      tradeId,
      exitType: exitData.exitType,
      pnl: exitData.pnl.toFixed(DECIMAL_PLACES.PERCENT),
    });

    // Recalculate summary
    this.currentSession.summary = this.calculateSummary(this.currentSession.trades);

    this.save();
  }

  // ==========================================================================
  // ANALYSIS
  // ==========================================================================

  /**
   * Get session by ID
   * @param sessionId - Session ID
   * @returns Session or null if not found
   */
  getSession(sessionId: string): Session | null {
    return this.database.sessions.find((s) => s.sessionId === sessionId) || null;
  }

  /**
   * Get all sessions
   * @returns All sessions sorted by start time (newest first)
   */
  getAllSessions(): Session[] {
    return [...this.database.sessions].sort((a, b) =>
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    );
  }

  /**
   * Get session summary
   * @param sessionId - Session ID
   * @returns Session summary or null if not found
   */
  getSessionSummary(sessionId: string): SessionSummary | null {
    const session = this.getSession(sessionId);
    return session ? session.summary : null;
  }

  // ==========================================================================
  // SUMMARY CALCULATION
  // ==========================================================================

  /**
   * Calculate summary statistics from trades
   */
  private calculateSummary(trades: SessionTradeRecord[]): SessionSummary {
    if (trades.length === 0) {
      return this.createEmptySummary();
    }

    // Overall statistics
    const wins = trades.filter((t) => t.pnl > 0);
    const losses = trades.filter((t) => t.pnl <= 0);
    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length : 0;
    const wlRatio = avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : 0;

    // Stop-out rate
    const stopOuts = losses.filter((t) => t.exitType === ExitType.STOP_LOSS).length;
    const stopOutRate = losses.length > 0 ? (stopOuts / losses.length) * PERCENT_MULTIPLIER : 0;

    // Average holding time
    const avgHoldingTimeMs = trades.reduce((sum, t) => sum + t.holdingTimeMs, 0) / trades.length;

    // By strategy
    const byStrategy: Record<string, StrategyStats> = {};
    for (const trade of trades) {
      const strategyType = trade.entryCondition.signal.type;
      if (byStrategy[strategyType] === undefined) {
        byStrategy[strategyType] = {
          count: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          totalPnl: 0,
        };
      }

      byStrategy[strategyType].count++;
      byStrategy[strategyType].totalPnl += trade.pnl;

      if (trade.pnl > 0) {
        byStrategy[strategyType].wins++;
      } else {
        byStrategy[strategyType].losses++;
      }
    }

    // Calculate win rates for strategies
    for (const strategyType in byStrategy) {
      const stats = byStrategy[strategyType];
      stats.winRate = (stats.wins / stats.count) * PERCENT_MULTIPLIER;
    }

    // By direction
    const byDirection: Record<string, DirectionStats> = {};
    for (const direction of [SignalDirection.LONG, SignalDirection.SHORT]) {
      const dirTrades = trades.filter((t) => t.direction === direction);
      const dirWins = dirTrades.filter((t) => t.pnl > 0);
      const dirLosses = dirTrades.filter((t) => t.pnl <= 0);

      byDirection[direction] = {
        count: dirTrades.length,
        wins: dirWins.length,
        losses: dirLosses.length,
        winRate: dirTrades.length > 0 ? (dirWins.length / dirTrades.length) * PERCENT_MULTIPLIER : 0,
        totalPnl: dirTrades.reduce((sum, t) => sum + t.pnl, 0),
      };
    }

    return {
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: (wins.length / trades.length) * PERCENT_MULTIPLIER,
      totalPnl,
      avgWin,
      avgLoss,
      wlRatio,
      stopOutRate,
      avgHoldingTimeMs,
      byStrategy,
      byDirection,
    };
  }

  /**
   * Create empty summary for new session
   */
  private createEmptySummary(): SessionSummary {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnl: 0,
      avgWin: 0,
      avgLoss: 0,
      wlRatio: 0,
      stopOutRate: 0,
      avgHoldingTimeMs: 0,
      byStrategy: {},
      byDirection: {},
    };
  }

  /**
   * Calculate duration between two timestamps
   */
  private calculateDuration(startTime: string, endTime: string | null): string {
    if (endTime === null) {
      return 'ACTIVE';
    }

    const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
    const hours = Math.floor(durationMs / (TIME_MULTIPLIERS.MILLISECONDS_PER_SECOND * INTEGER_MULTIPLIERS.SIXTY * INTEGER_MULTIPLIERS.SIXTY));
    const minutes = Math.floor((durationMs % (TIME_MULTIPLIERS.MILLISECONDS_PER_SECOND * INTEGER_MULTIPLIERS.SIXTY * INTEGER_MULTIPLIERS.SIXTY)) / (TIME_MULTIPLIERS.MILLISECONDS_PER_SECOND * INTEGER_MULTIPLIERS.SIXTY));

    return `${hours}h ${minutes}m`;
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  /**
   * Save database to file
   */
  private save(): void {
    try {
      // Ensure data directory exists
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }

      // Write to file
      fs.writeFileSync(this.filePath, JSON.stringify(this.database, null, 2), 'utf-8');

      this.logger.debug('Session stats saved', { path: this.filePath });
    } catch (error) {
      this.logger.error('Failed to save session stats', { error: String(error) });
    }
  }

  /**
   * Load database from file
   */
  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.logger.info('Session stats file not found, creating new database');
        this.database = { sessions: [] };
        return;
      }

      const data = fs.readFileSync(this.filePath, 'utf-8');
      this.database = JSON.parse(data) as SessionDatabase;

      this.logger.info('Session stats loaded', {
        totalSessions: this.database.sessions.length,
        path: this.filePath,
      });

      // Resume last session if it was not closed
      const lastSession = this.database.sessions[this.database.sessions.length - 1];
      if (lastSession !== undefined && lastSession.endTime === null) {
        this.currentSession = lastSession;
        this.logger.info('Resumed active session', {
          sessionId: lastSession.sessionId,
          startTime: lastSession.startTime,
        });
      }
    } catch (error) {
      this.logger.error('Failed to load session stats', { error: String(error) });
      this.database = { sessions: [] };
    }
  }
}
