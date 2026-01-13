/**
 * Repository Interface for Persistence
 *
 * Abstracts persistence layer (files, database, etc.)
 * Implementations: FileRepository, DatabaseRepository, MockRepository
 */

import type { Position } from '../types/core';

// ============================================================================
// TRADE RECORD
// ============================================================================

/**
 * Complete trade record for journal
 */
export interface TradeRecord {
  id: string; // journalId
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  entryTime: number;
  exitPrice?: number;
  exitTime?: number;
  quantity: number;
  leverage: number;
  pnl?: number;
  pnlPercent?: number;
  exitType?: string; // TAKE_PROFIT_1, STOP_LOSS, etc
  reason: string;
  confidence: number;
  strategy?: string;
  notes?: string;
}

/**
 * Session statistics record
 */
export interface SessionRecord {
  id: string;
  startTime: number;
  endTime?: number;
  trades: number;
  wins: number;
  losses: number;
  totalPnL: number;
  totalPnLPercent: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  maxDrawdown: number;
  notes?: string;
}

// ============================================================================
// REPOSITORY INTERFACE
// ============================================================================

/**
 * Repository interface for persistence
 * Implementations can use files, databases, or other storage
 */
export interface IRepository {
  // ============================================================================
  // TRADE PERSISTENCE
  // ============================================================================

  /**
   * Save trade record
   */
  saveTrade(trade: TradeRecord): Promise<void>;

  /**
   * Get trade record
   */
  getTrade(tradeId: string): Promise<TradeRecord | null>;

  /**
   * Get all trades
   */
  getAllTrades(): Promise<TradeRecord[]>;

  /**
   * Get trades by filter
   */
  getTrades(filter: {
    symbol?: string;
    side?: 'LONG' | 'SHORT';
    startTime?: number;
    endTime?: number;
    strategy?: string;
  }): Promise<TradeRecord[]>;

  /**
   * Update trade record (e.g., when position closes and we get exit price)
   */
  updateTrade(tradeId: string, updates: Partial<TradeRecord>): Promise<void>;

  /**
   * Delete trade record
   */
  deleteTrade(tradeId: string): Promise<void>;

  // ============================================================================
  // SESSION PERSISTENCE
  // ============================================================================

  /**
   * Save session record
   */
  saveSession(session: SessionRecord): Promise<void>;

  /**
   * Get session record
   */
  getSession(sessionId: string): Promise<SessionRecord | null>;

  /**
   * Get all sessions
   */
  getAllSessions(): Promise<SessionRecord[]>;

  /**
   * Update session record
   */
  updateSession(sessionId: string, updates: Partial<SessionRecord>): Promise<void>;

  // ============================================================================
  // GENERAL PERSISTENCE
  // ============================================================================

  /**
   * Save arbitrary JSON data
   */
  saveData(key: string, data: any): Promise<void>;

  /**
   * Get arbitrary JSON data
   */
  getData(key: string): Promise<any | null>;

  /**
   * Delete data
   */
  deleteData(key: string): Promise<void>;

  /**
   * Check if data exists
   */
  hasData(key: string): Promise<boolean>;

  // ============================================================================
  // MAINTENANCE
  // ============================================================================

  /**
   * Clear all data
   */
  clear(): Promise<void>;

  /**
   * Get repository size in bytes
   */
  getSize(): Promise<number>;

  /**
   * Health check
   */
  healthCheck(): Promise<boolean>;

  /**
   * Get repository name
   */
  readonly name: string;
}
