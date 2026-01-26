/**
 * Journal File Repository Tests - Phase 6.1
 *
 * Tests for file-based journal repository
 */

import * as fs from 'fs';
import * as path from 'path';
import { JournalFileRepository } from '../journal.file-repository';
import { TradeRecord, SessionRecord } from '../../interfaces/IRepository';
import { LoggerService } from '../../services/logger.service';

/**
 * Create mock logger
 */
function createMockLogger(): LoggerService {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as any;
}

/**
 * Create mock trade
 */
function createMockTrade(overrides?: Partial<TradeRecord>): TradeRecord {
  return {
    id: 'trade_123',
    symbol: 'XRPUSDT',
    side: 'LONG',
    entryPrice: 0.5,
    entryTime: Date.now(),
    quantity: 100,
    leverage: 10,
    pnl: 10,
    pnlPercent: 1.0,
    reason: 'TEST_SIGNAL',
    confidence: 0.85,
    ...overrides,
  };
}

/**
 * Create mock session
 */
function createMockSession(overrides?: Partial<SessionRecord>): SessionRecord {
  return {
    id: 'session_123',
    startTime: Date.now() - 3600000, // 1 hour ago
    trades: 5,
    wins: 3,
    losses: 2,
    totalPnL: 50,
    totalPnLPercent: 5.0,
    winRate: 0.6,
    averageWin: 20,
    averageLoss: 10,
    maxDrawdown: 5,
    ...overrides,
  };
}

describe('JournalFileRepository - Phase 6.1', () => {
  let repo: JournalFileRepository;
  let testDir: string;
  let logger: LoggerService;

  beforeEach(() => {
    logger = createMockLogger();
    testDir = path.join(__dirname, 'test_data_' + Date.now());
    repo = new JournalFileRepository(logger, testDir);
  });

  afterEach(async () => {
    // Cleanup test data
    if (fs.existsSync(testDir)) {
      const files = fs.readdirSync(testDir);
      for (const file of files) {
        fs.unlinkSync(path.join(testDir, file));
      }
      fs.rmdirSync(testDir);
    }
  });

  describe('Trade Persistence', () => {
    test('T1: Should record trade', async () => {
      const trade = createMockTrade();
      await repo.recordTrade(trade);

      const retrieved = await repo.getTrade(trade.id);
      expect(retrieved).toEqual(trade);
    });

    test('T2: Should get all trades', async () => {
      const trade1 = createMockTrade({ id: 'trade_1' });
      const trade2 = createMockTrade({ id: 'trade_2' });

      await repo.recordTrade(trade1);
      await repo.recordTrade(trade2);

      const allTrades = await repo.getAllTrades();
      expect(allTrades.length).toBe(2);
    });

    test('T3: Should query trades by symbol', async () => {
      const trade1 = createMockTrade({ id: 'trade_1', symbol: 'XRPUSDT' });
      const trade2 = createMockTrade({ id: 'trade_2', symbol: 'BTCUSDT' });

      await repo.recordTrade(trade1);
      await repo.recordTrade(trade2);

      const xrpTrades = await repo.getTrades({ symbol: 'XRPUSDT' });
      expect(xrpTrades.length).toBe(1);
      expect(xrpTrades[0].symbol).toBe('XRPUSDT');
    });

    test('T4: Should query trades by side', async () => {
      const longTrade = createMockTrade({ id: 'trade_1', side: 'LONG' });
      const shortTrade = createMockTrade({ id: 'trade_2', side: 'SHORT' });

      await repo.recordTrade(longTrade);
      await repo.recordTrade(shortTrade);

      const longTrades = await repo.getTrades({ side: 'LONG' });
      expect(longTrades.length).toBe(1);
      expect(longTrades[0].side).toBe('LONG');
    });

    test('T5: Should update trade', async () => {
      const trade = createMockTrade();
      await repo.recordTrade(trade);

      await repo.updateTrade(trade.id, { exitPrice: 0.55, pnl: 50 });

      const updated = await repo.getTrade(trade.id);
      expect(updated?.exitPrice).toBe(0.55);
      expect(updated?.pnl).toBe(50);
    });

    test('T6: Should delete trade', async () => {
      const trade = createMockTrade();
      await repo.recordTrade(trade);

      await repo.deleteTrade(trade.id);

      const deleted = await repo.getTrade(trade.id);
      expect(deleted).toBeNull();
    });
  });

  describe('Session Persistence', () => {
    test('T7: Should save and retrieve session', async () => {
      const session = createMockSession();
      await repo.saveSession(session);

      const retrieved = await repo.getSession(session.id);
      expect(retrieved).toEqual(session);
    });

    test('T8: Should get all sessions', async () => {
      const session1 = createMockSession({ id: 'session_1' });
      const session2 = createMockSession({ id: 'session_2' });

      await repo.saveSession(session1);
      await repo.saveSession(session2);

      const allSessions = await repo.getAllSessions();
      expect(allSessions.length).toBe(2);
    });

    test('T9: Should update session', async () => {
      const session = createMockSession();
      await repo.saveSession(session);

      await repo.updateSession(session.id, { totalPnL: 100, totalPnLPercent: 10 });

      const updated = await repo.getSession(session.id);
      expect(updated?.totalPnL).toBe(100);
      expect(updated?.totalPnLPercent).toBe(10);
    });

    test('T10: Should calculate session PnL', async () => {
      const now = Date.now();
      const session = createMockSession({ id: 'session_1', startTime: now - 3600000 });
      const trade1 = createMockTrade({ id: 'trade_1', entryTime: now, pnl: 20 });
      const trade2 = createMockTrade({ id: 'trade_2', entryTime: now, pnl: 30 });

      await repo.saveSession(session);
      await repo.recordTrade(trade1);
      await repo.recordTrade(trade2);

      const pnl = await repo.calculateSessionPnL('session_1');
      expect(pnl).toBe(50);
    });

    test('T11: Should calculate session win rate', async () => {
      const now = Date.now();
      const session = createMockSession({ id: 'session_1', startTime: now - 3600000 });
      const winTrade = createMockTrade({ id: 'trade_1', entryTime: now, pnl: 20 });
      const lossTrade = createMockTrade({ id: 'trade_2', entryTime: now, pnl: -10 });

      await repo.saveSession(session);
      await repo.recordTrade(winTrade);
      await repo.recordTrade(lossTrade);

      const winRate = await repo.calculateWinRate('session_1');
      expect(winRate).toBe(0.5); // 1 win out of 2
    });
  });

  describe('Data Persistence', () => {
    test('T12: Should save and get data', async () => {
      const data = { test: 'value', number: 42 };
      await repo.saveData('test_key', data);

      const retrieved = await repo.getData('test_key');
      expect(retrieved).toEqual(data);
    });

    test('T13: Should check if data exists', async () => {
      await repo.saveData('existing', { value: 1 });

      const exists = await repo.hasData('existing');
      const notExists = await repo.hasData('non_existing');

      expect(exists).toBe(true);
      expect(notExists).toBe(false);
    });

    test('T14: Should delete data', async () => {
      await repo.saveData('to_delete', { value: 1 });
      await repo.deleteData('to_delete');

      const deleted = await repo.getData('to_delete');
      expect(deleted).toBeNull();
    });
  });

  describe('Maintenance', () => {
    test('T15: Should clear all data', async () => {
      const trade = createMockTrade();
      const session = createMockSession();

      await repo.recordTrade(trade);
      await repo.saveSession(session);

      await repo.clear();

      const trades = await repo.getAllTrades();
      const sessions = await repo.getAllSessions();

      expect(trades.length).toBe(0);
      expect(sessions.length).toBe(0);
    });

    test('T16: Should get repository size', async () => {
      const trade = createMockTrade();
      await repo.recordTrade(trade);

      const size = await repo.getSize();
      expect(size).toBeGreaterThan(0);
    });

    test('T17: Should perform health check', async () => {
      const trade = createMockTrade();
      await repo.recordTrade(trade);

      const healthy = await repo.healthCheck();
      expect(healthy).toBe(true);
    });

    test('T18: Should have name property', () => {
      expect(repo.name).toBe('JournalFileRepository');
    });
  });
});
