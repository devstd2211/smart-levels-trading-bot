/**
 * File Watcher Service
 *
 * Monitors journal and session files for changes and notifies WebSocket clients
 */

import { EventEmitter } from 'events';
import { watch, FSWatcher } from 'chokidar';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface JournalEntry {
  id: string;
  timestamp: number;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  strategy: string;
  exitReason: string;
}

export interface SessionStats {
  sessionId: string;
  startTime: number;
  endTime?: number;
  trades: JournalEntry[];
  totalPnL: number;
  winRate: number;
  winCount: number;
  lossCount: number;
  totalTrades: number;
}

export class FileWatcherService extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private journalPath: string;
  private sessionsPath: string;
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceDelay = 500; // 500ms debounce

  constructor(
    journalPath: string = './data/trade-journal.json',
    sessionsPath: string = './data/session-stats.json',
  ) {
    super();
    this.journalPath = journalPath;
    this.sessionsPath = sessionsPath;
  }

  /**
   * Start watching for file changes
   */
  start() {
    try {
      this.watcher = watch([this.journalPath, this.sessionsPath], {
        ignored: /(^|[\/\\])\../, // Ignore dotfiles
        persistent: true,
        awaitWriteFinish: {
          stabilityThreshold: 200,
          pollInterval: 100,
        },
      });

      this.watcher.on('change', (filePath) => {
        this.handleFileChange(filePath);
      });

      this.watcher.on('error', (error) => {
        console.error('File watcher error:', error);
        this.emit('error', error);
      });

      this.emit('ready');
      console.log('File watcher started');
    } catch (error) {
      console.error('Failed to start file watcher:', error);
      this.emit('error', error);
    }
  }

  /**
   * Stop watching for file changes
   */
  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    console.log('File watcher stopped');
  }

  /**
   * Handle file change with debounce
   */
  private handleFileChange(filePath: string) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      try {
        if (filePath.includes('trade-journal')) {
          await this.handleJournalChange();
        } else if (filePath.includes('session-stats')) {
          await this.handleSessionChange();
        }
      } catch (error) {
        console.error('Error handling file change:', error);
        this.emit('error', error);
      }
    }, this.debounceDelay);
  }

  /**
   * Handle trade journal file change
   */
  private async handleJournalChange() {
    try {
      const journal = await this.readJournal();
      this.emit('journal:updated', journal);
      console.log(`Journal updated: ${journal.length} trades`);
    } catch (error) {
      console.error('Error reading journal:', error);
    }
  }

  /**
   * Handle session stats file change
   */
  private async handleSessionChange() {
    try {
      const sessions = await this.readSessions();
      this.emit('session:updated', sessions);
      console.log(`Sessions updated: ${sessions?.length ?? 0} sessions`);
    } catch (error) {
      console.error('Error reading sessions:', error);
    }
  }

  /**
   * Read trade journal from file
   */
  async readJournal(): Promise<JournalEntry[]> {
    try {
      const data = await fs.readFile(this.journalPath, 'utf-8');
      return JSON.parse(data) || [];
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Read sessions from file
   */
  async readSessions(): Promise<SessionStats[]> {
    try {
      const data = await fs.readFile(this.sessionsPath, 'utf-8');
      const parsed = JSON.parse(data);
      // Handle both formats: { sessions: [...] } and [...]
      return (parsed?.sessions || parsed) || [];
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get paginated journal entries
   */
  async getJournalPaginated(page: number = 1, limit: number = 50): Promise<{
    entries: JournalEntry[];
    total: number;
    page: number;
    pages: number;
  }> {
    const journal = await this.readJournal();
    const total = journal.length;
    const pages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const end = start + limit;

    return {
      entries: journal.slice(start, end),
      total,
      page,
      pages,
    };
  }

  /**
   * Get journal entries from last N hours
   */
  async getJournalFromLastHours(hours: number = 24): Promise<JournalEntry[]> {
    const journal = await this.readJournal();
    const cutoffTime = Date.now() - hours * 60 * 60 * 1000;

    return journal.filter((entry) => entry.timestamp > cutoffTime);
  }

  /**
   * Calculate journal statistics
   */
  async getJournalStats(): Promise<{
    totalTrades: number;
    totalPnL: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    winLossRatio: number;
    longWinRate: number;
    shortWinRate: number;
  }> {
    const journal = await this.readJournal();

    if (journal.length === 0) {
      return {
        totalTrades: 0,
        totalPnL: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        winLossRatio: 0,
        longWinRate: 0,
        shortWinRate: 0,
      };
    }

    const wins = journal.filter((e) => e.pnl > 0);
    const losses = journal.filter((e) => e.pnl < 0);
    const longs = journal.filter((e) => e.direction === 'LONG');
    const longWins = longs.filter((e) => e.pnl > 0);
    const shorts = journal.filter((e) => e.direction === 'SHORT');
    const shortWins = shorts.filter((e) => e.pnl > 0);

    const totalPnL = journal.reduce((sum, e) => sum + e.pnl, 0);
    const avgWin = wins.length > 0 ? wins.reduce((sum, e) => sum + e.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((sum, e) => sum + e.pnl, 0) / losses.length : 0;

    return {
      totalTrades: journal.length,
      totalPnL,
      winRate: (wins.length / journal.length) * 100,
      avgWin,
      avgLoss: Math.abs(avgLoss),
      winLossRatio: avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0,
      longWinRate: longs.length > 0 ? (longWins.length / longs.length) * 100 : 0,
      shortWinRate: shorts.length > 0 ? (shortWins.length / shorts.length) * 100 : 0,
    };
  }

  /**
   * Get strategy performance breakdown
   */
  async getStrategyPerformance(): Promise<
    Array<{
      strategy: string;
      trades: number;
      winRate: number;
      totalPnL: number;
      avgPnL: number;
      wins: number;
      losses: number;
    }>
  > {
    const journal = await this.readJournal();
    const strategies = new Map<
      string,
      {
        trades: number;
        wins: number;
        totalPnL: number;
      }
    >();

    journal.forEach((entry) => {
      const strategy = entry.strategy || 'Unknown';
      const existing = strategies.get(strategy) || { trades: 0, wins: 0, totalPnL: 0 };

      strategies.set(strategy, {
        trades: existing.trades + 1,
        wins: existing.wins + (entry.pnl > 0 ? 1 : 0),
        totalPnL: existing.totalPnL + entry.pnl,
      });
    });

    return Array.from(strategies.entries()).map(([strategy, stats]) => ({
      strategy,
      trades: stats.trades,
      winRate: (stats.wins / stats.trades) * 100,
      totalPnL: stats.totalPnL,
      avgPnL: stats.totalPnL / stats.trades,
      wins: stats.wins,
      losses: stats.trades - stats.wins,
    }));
  }

  /**
   * Compare two sessions
   */
  async comparesessions(
    sessionId1: string,
    sessionId2: string,
  ): Promise<{
    session1: SessionStats | null;
    session2: SessionStats | null;
    comparison: {
      tradesDiff: number;
      pnlDiff: number;
      winRateDiff: number;
    };
  }> {
    const sessions = await this.readSessions();
    const session1 = sessions.find((s) => s.sessionId === sessionId1);
    const session2 = sessions.find((s) => s.sessionId === sessionId2);

    return {
      session1: session1 || null,
      session2: session2 || null,
      comparison: {
        tradesDiff: (session2?.totalTrades || 0) - (session1?.totalTrades || 0),
        pnlDiff: (session2?.totalPnL || 0) - (session1?.totalPnL || 0),
        winRateDiff: (session2?.winRate || 0) - (session1?.winRate || 0),
      },
    };
  }
}
