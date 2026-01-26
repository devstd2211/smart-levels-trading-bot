/**
 * Journal File Repository - Phase 6.1
 *
 * Persists trades to disk (JSON file)
 * Features:
 * - File-based persistence
 * - Query by filters
 * - In-memory cache for performance
 * - Session tracking
 * - No background writes (synchronous)
 */

import * as fs from 'fs';
import * as path from 'path';
import { IJournalRepository } from './IRepositories';
import { TradeRecord, SessionRecord } from '../interfaces/IRepository';
import { LoggerService } from '../services/logger.service';

/**
 * File-based journal repository
 * Persists trades to JSON file with in-memory cache
 */
export class JournalFileRepository implements IJournalRepository {
  private trades: Map<string, TradeRecord> = new Map();
  private sessions: Map<string, SessionRecord> = new Map();
  private generalData: Map<string, any> = new Map();

  private readonly journalFile: string;
  private readonly sessionsFile: string;
  private readonly dataDir: string;
  private readonly logger: LoggerService;
  private loaded = false;

  constructor(
    logger: LoggerService,
    dataDir: string = './data',
  ) {
    this.logger = logger;
    this.dataDir = dataDir;
    this.journalFile = path.join(dataDir, 'trades.json');
    this.sessionsFile = path.join(dataDir, 'sessions.json');

    this.ensureDirectory();
    this.load();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Ensure data directory exists
   */
  private ensureDirectory(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * Load data from disk
   */
  private load(): void {
    if (this.loaded) return;

    // Load trades
    if (fs.existsSync(this.journalFile)) {
      try {
        const tradesData = JSON.parse(fs.readFileSync(this.journalFile, 'utf-8'));
        if (Array.isArray(tradesData)) {
          for (const trade of tradesData) {
            this.trades.set(trade.id, trade);
          }
        }
      } catch (error) {
        this.logger.warn('Failed to load trades.json', { error: error instanceof Error ? error.message : String(error) });
      }
    }

    // Load sessions
    if (fs.existsSync(this.sessionsFile)) {
      try {
        const sessionsData = JSON.parse(fs.readFileSync(this.sessionsFile, 'utf-8'));
        if (Array.isArray(sessionsData)) {
          for (const session of sessionsData) {
            this.sessions.set(session.id, session);
          }
        }
      } catch (error) {
        this.logger.warn('Failed to load sessions.json', { error: error instanceof Error ? error.message : String(error) });
      }
    }

    this.loaded = true;
  }

  // ============================================================================
  // SAVE TO DISK
  // ============================================================================

  /**
   * Save trades to disk
   */
  private saveTrades(): void {
    try {
      const tradesArray = Array.from(this.trades.values());
      fs.writeFileSync(this.journalFile, JSON.stringify(tradesArray, null, 2));
    } catch (error) {
      this.logger.error('Failed to save trades', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Save sessions to disk
   */
  private saveSessions(): void {
    try {
      const sessionsArray = Array.from(this.sessions.values());
      fs.writeFileSync(this.sessionsFile, JSON.stringify(sessionsArray, null, 2));
    } catch (error) {
      this.logger.error('Failed to save sessions', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  // ============================================================================
  // TRADE PERSISTENCE
  // ============================================================================

  async recordTrade(trade: TradeRecord): Promise<void> {
    this.trades.set(trade.id, trade);
    this.saveTrades();
  }

  async getTrade(tradeId: string): Promise<TradeRecord | null> {
    return this.trades.get(tradeId) || null;
  }

  async getAllTrades(): Promise<TradeRecord[]> {
    return Array.from(this.trades.values());
  }

  async getTrades(filter: {
    symbol?: string;
    side?: 'LONG' | 'SHORT';
    startTime?: number;
    endTime?: number;
    strategy?: string;
  }): Promise<TradeRecord[]> {
    let results = Array.from(this.trades.values());

    if (filter.symbol) {
      results = results.filter(t => t.symbol === filter.symbol);
    }

    if (filter.side) {
      results = results.filter(t => t.side === filter.side);
    }

    if (filter.startTime) {
      results = results.filter(t => t.entryTime >= filter.startTime!);
    }

    if (filter.endTime) {
      results = results.filter(t => t.entryTime <= filter.endTime!);
    }

    if (filter.strategy) {
      results = results.filter(t => t.strategy === filter.strategy);
    }

    return results;
  }

  async updateTrade(tradeId: string, updates: Partial<TradeRecord>): Promise<void> {
    const trade = this.trades.get(tradeId);
    if (!trade) return;

    this.trades.set(tradeId, { ...trade, ...updates });
    this.saveTrades();
  }

  async deleteTrade(tradeId: string): Promise<void> {
    this.trades.delete(tradeId);
    this.saveTrades();
  }

  // ============================================================================
  // SESSION PERSISTENCE
  // ============================================================================

  async saveSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, session);
    this.saveSessions();
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    return this.sessions.get(sessionId) || null;
  }

  async getAllSessions(): Promise<SessionRecord[]> {
    return Array.from(this.sessions.values());
  }

  async updateSession(sessionId: string, updates: Partial<SessionRecord>): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.sessions.set(sessionId, { ...session, ...updates });
    this.saveSessions();
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  async calculateSessionPnL(sessionId: string): Promise<number> {
    const trades = Array.from(this.trades.values()).filter(t => {
      // Find trades in this session (created after session start)
      const session = this.sessions.get(sessionId);
      if (!session) return false;
      return t.entryTime >= session.startTime && (!session.endTime || t.entryTime <= session.endTime);
    });

    return trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  }

  async calculateWinRate(sessionId: string): Promise<number> {
    const trades = Array.from(this.trades.values()).filter(t => {
      const session = this.sessions.get(sessionId);
      if (!session) return false;
      return t.entryTime >= session.startTime && (!session.endTime || t.entryTime <= session.endTime);
    });

    if (trades.length === 0) return 0;

    const wins = trades.filter(t => (t.pnl || 0) > 0).length;
    return wins / trades.length;
  }

  // ============================================================================
  // GENERIC PERSISTENCE
  // ============================================================================

  async saveData(key: string, data: any): Promise<void> {
    this.generalData.set(key, data);
    // Could persist to separate file if needed
  }

  async getData(key: string): Promise<any | null> {
    return this.generalData.get(key) || null;
  }

  async deleteData(key: string): Promise<void> {
    this.generalData.delete(key);
  }

  async hasData(key: string): Promise<boolean> {
    return this.generalData.has(key);
  }

  // ============================================================================
  // MAINTENANCE
  // ============================================================================

  async clear(): Promise<void> {
    this.trades.clear();
    this.sessions.clear();
    this.generalData.clear();

    // Remove files
    if (fs.existsSync(this.journalFile)) {
      fs.unlinkSync(this.journalFile);
    }
    if (fs.existsSync(this.sessionsFile)) {
      fs.unlinkSync(this.sessionsFile);
    }
  }

  async getSize(): Promise<number> {
    let size = 0;

    if (fs.existsSync(this.journalFile)) {
      size += fs.statSync(this.journalFile).size;
    }

    if (fs.existsSync(this.sessionsFile)) {
      size += fs.statSync(this.sessionsFile).size;
    }

    return size;
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Verify we can read files
      if (fs.existsSync(this.journalFile)) {
        fs.readFileSync(this.journalFile);
      }
      if (fs.existsSync(this.sessionsFile)) {
        fs.readFileSync(this.sessionsFile);
      }
      return true;
    } catch {
      return false;
    }
  }

  readonly name = 'JournalFileRepository';
}
