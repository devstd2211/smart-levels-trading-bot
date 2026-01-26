/**
 * Position Memory Repository Tests - Phase 6.1
 *
 * Tests for in-memory position repository
 */

import { PositionMemoryRepository } from '../position.memory-repository';
import { Position, PositionSide } from '../../types';

/**
 * Create a mock position for testing
 */
function createMockPosition(overrides?: Partial<Position>): Position {
  return {
    id: 'pos_123',
    symbol: 'XRPUSDT',
    side: 'LONG' as PositionSide,
    entryPrice: 0.5,
    quantity: 100,
    leverage: 10,
    marginUsed: 500,
    stopLoss: {
      price: 0.48,
      initialPrice: 0.48,
      isBreakeven: false,
      isTrailing: false,
      updatedAt: Date.now(),
    },
    takeProfits: [
      { level: 1, percent: 100, sizePercent: 60, price: 0.51, hit: false },
      { level: 2, percent: 200, sizePercent: 30, price: 0.52, hit: false },
      { level: 3, percent: 300, sizePercent: 10, price: 0.53, hit: false },
    ],
    openedAt: Date.now(),
    unrealizedPnL: 10,
    orderId: 'order_123',
    reason: 'TEST_SIGNAL',
    status: 'OPEN',
    ...overrides,
  };
}

describe('PositionMemoryRepository - Phase 6.1', () => {
  let repo: PositionMemoryRepository;

  beforeEach(() => {
    repo = new PositionMemoryRepository();
  });

  describe('Current Position Management', () => {
    test('T1: Should return null when no position is open', () => {
      expect(repo.getCurrentPosition()).toBeNull();
    });

    test('T2: Should set and get current position', () => {
      const pos = createMockPosition();
      repo.setCurrentPosition(pos);

      expect(repo.getCurrentPosition()).toEqual(pos);
    });

    test('T3: Should clear current position', () => {
      const pos = createMockPosition();
      repo.setCurrentPosition(pos);
      expect(repo.getCurrentPosition()).not.toBeNull();

      repo.setCurrentPosition(null);
      expect(repo.getCurrentPosition()).toBeNull();
    });

    test('T4: Should move closed position to history', () => {
      const pos = createMockPosition();
      repo.setCurrentPosition(pos);

      // Close position (set to null)
      repo.setCurrentPosition(null);

      // Position should be in history
      const history = repo.getHistory();
      expect(history.length).toBe(1);
      expect(history[0]).toEqual(pos);
    });
  });

  describe('History Management', () => {
    test('T5: Should add position to history', () => {
      const pos1 = createMockPosition({ id: 'pos_1' });
      const pos2 = createMockPosition({ id: 'pos_2' });

      repo.addToHistory(pos1);
      repo.addToHistory(pos2);

      const history = repo.getHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toEqual(pos2); // Newest first
      expect(history[1]).toEqual(pos1);
    });

    test('T6: Should limit history to max size (LRU eviction)', () => {
      // Add 150 positions (max is 100)
      for (let i = 0; i < 150; i++) {
        const pos = createMockPosition({ id: `pos_${i}` });
        repo.addToHistory(pos);
      }

      const history = repo.getHistory();
      expect(history.length).toBe(100);
      // Oldest positions should be evicted
      expect(history[0].id).toBe('pos_149'); // Newest
      expect(history[99].id).toBe('pos_50'); // Oldest remaining
    });

    test('T7: Should return history with limit', () => {
      for (let i = 0; i < 10; i++) {
        repo.addToHistory(createMockPosition({ id: `pos_${i}` }));
      }

      const limited = repo.getHistory(3);
      expect(limited.length).toBe(3);
    });

    test('T8: Should clear history', () => {
      repo.addToHistory(createMockPosition());
      repo.addToHistory(createMockPosition({ id: 'pos_2' }));

      repo.clearHistory();
      expect(repo.getHistory().length).toBe(0);
    });
  });

  describe('Query Operations', () => {
    test('T9: Should find position by ID in current', () => {
      const pos = createMockPosition({ id: 'search_test' });
      repo.setCurrentPosition(pos);

      const found = repo.findPosition('search_test');
      expect(found).toEqual(pos);
    });

    test('T10: Should find position by ID in history', () => {
      const pos = createMockPosition({ id: 'history_search' });
      repo.addToHistory(pos);

      const found = repo.findPosition('history_search');
      expect(found).toEqual(pos);
    });

    test('T11: Should return null for non-existent position', () => {
      const found = repo.findPosition('non_existent');
      expect(found).toBeNull();
    });

    test('T12: Should get all positions (current + history)', () => {
      const current = createMockPosition({ id: 'current' });
      repo.setCurrentPosition(current);

      repo.addToHistory(createMockPosition({ id: 'history_1' }));
      repo.addToHistory(createMockPosition({ id: 'history_2' }));

      const all = repo.getAllPositions();
      expect(all.length).toBe(3);
      expect(all[0]).toEqual(current); // Current first
    });
  });

  describe('Maintenance', () => {
    test('T13: Should clear all data', () => {
      const pos = createMockPosition();
      repo.setCurrentPosition(pos);
      repo.addToHistory(createMockPosition({ id: 'h1' }));

      repo.clear();

      expect(repo.getCurrentPosition()).toBeNull();
      expect(repo.getHistory().length).toBe(0);
      expect(repo.getAllPositions().length).toBe(0);
    });

    test('T14: Should calculate repository size', () => {
      const pos = createMockPosition();
      repo.setCurrentPosition(pos);

      const size = repo.getSize();
      expect(size).toBeGreaterThan(0);
      expect(typeof size).toBe('number');
    });

    test('T15: Should get repository statistics', () => {
      repo.setCurrentPosition(createMockPosition());
      repo.addToHistory(createMockPosition({ id: 'h1' }));

      const stats = repo.getStats();
      expect(stats.currentPosition).toBe(true);
      expect(stats.historySize).toBe(1);
      expect(stats.maxHistorySize).toBe(100);
      expect(stats.totalSize).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    test('T16: Should handle multiple position updates', () => {
      const pos1 = createMockPosition({ id: 'pos_1' });
      const pos2 = createMockPosition({ id: 'pos_2' });

      repo.setCurrentPosition(pos1);
      repo.setCurrentPosition(pos2); // Closes pos1, opens pos2

      expect(repo.getCurrentPosition()?.id).toBe('pos_2');
      const history = repo.getHistory();
      expect(history.length).toBe(1);
      expect(history[0]?.id).toBe('pos_1');
    });

    test('T17: Should handle null → position → null cycle', () => {
      expect(repo.getCurrentPosition()).toBeNull();

      const pos = createMockPosition();
      repo.setCurrentPosition(pos);
      expect(repo.getCurrentPosition()).not.toBeNull();

      repo.setCurrentPosition(null);
      expect(repo.getCurrentPosition()).toBeNull();
      expect(repo.getHistory().length).toBe(1);
    });
  });

  describe('Performance', () => {
    test('T18: Should handle 100 history items efficiently', () => {
      const startTime = Date.now();

      // Add 100 positions
      for (let i = 0; i < 100; i++) {
        repo.addToHistory(createMockPosition({ id: `pos_${i}` }));
      }

      // Query operations
      const history = repo.getHistory();
      const found = repo.findPosition('pos_50');
      const all = repo.getAllPositions();

      const elapsed = Date.now() - startTime;

      expect(history.length).toBe(100);
      expect(found).not.toBeNull();
      expect(all.length).toBe(100);
      expect(elapsed).toBeLessThan(100); // Should be fast
    });
  });
});
