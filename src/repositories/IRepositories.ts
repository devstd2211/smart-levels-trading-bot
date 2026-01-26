/**
 * Specialized Repository Interfaces - Phase 6.1
 *
 * Extends generic IRepository with domain-specific repositories
 * Each repository manages specific data with tailored methods
 */

import { Position, Candle } from '../types';
import { TradeRecord, SessionRecord } from '../interfaces/IRepository';

/**
 * Position Repository - Manage current and historical positions
 */
export interface IPositionRepository {
  // Current position
  getCurrentPosition(): Position | null;
  setCurrentPosition(position: Position | null): void;

  // Position history
  addToHistory(position: Position): void;
  getHistory(limit?: number): Position[];
  clearHistory(): void;

  // Query
  findPosition(id: string): Position | null;
  getAllPositions(): Position[];

  // Maintenance
  clear(): void;
  getSize(): number;
}

/**
 * Journal Repository - Trade persistence and querying
 */
export interface IJournalRepository {
  // Save trades
  recordTrade(trade: TradeRecord): Promise<void>;
  updateTrade(tradeId: string, updates: Partial<TradeRecord>): Promise<void>;

  // Query trades
  getTrade(tradeId: string): Promise<TradeRecord | null>;
  getAllTrades(): Promise<TradeRecord[]>;
  getTrades(filter: {
    symbol?: string;
    side?: 'LONG' | 'SHORT';
    startTime?: number;
    endTime?: number;
    strategy?: string;
  }): Promise<TradeRecord[]>;

  // Sessions
  saveSession(session: SessionRecord): Promise<void>;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  getAllSessions(): Promise<SessionRecord[]>;

  // Statistics
  calculateSessionPnL(sessionId: string): Promise<number>;
  calculateWinRate(sessionId: string): Promise<number>;

  // Maintenance
  clear(): Promise<void>;
  getSize(): Promise<number>;
}

/**
 * Market Data Repository - Candles and indicators caching
 */
export interface IMarketDataRepository {
  // Candle management
  saveCandles(symbol: string, timeframe: string, candles: Candle[]): void;
  getCandles(symbol: string, timeframe: string, limit?: number): Candle[];
  getLatestCandle(symbol: string, timeframe: string): Candle | null;
  getCandlesSince(symbol: string, timeframe: string, timestamp: number): Candle[];

  // Indicator caching (TTL-based)
  cacheIndicator(
    key: string, // e.g., "RSI-14-1h"
    value: any,
    ttlMs?: number,
  ): void;
  getIndicator(key: string): any | null;
  hasIndicator(key: string): boolean;

  // Cache maintenance
  clearExpiredIndicators(): number; // Returns count cleared
  clearExpiredCandles(): number; // Returns count cleared
  clear(): void;

  // Statistics
  getSize(): number;
  getStats(): {
    candleCount: number;
    indicatorCount: number;
    sizeBytes: number;
  };
}

/**
 * Account Repository - Account state and balance
 */
export interface IAccountRepository {
  // Balance
  getBalance(): number;
  updateBalance(newBalance: number): void;
  recordTrade(pnl: number, pnlPercent: number): void;

  // Risk tracking
  getDailyLoss(): number;
  getLossStreak(): number;
  resetDailyStats(): void;

  // History
  getBalanceHistory(limit?: number): Array<{ timestamp: number; balance: number }>;
  getTradeStats(): {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
  };
}
