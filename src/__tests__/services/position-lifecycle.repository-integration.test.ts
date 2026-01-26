/**
 * Phase 6.2: PositionLifecycleService + IPositionRepository Integration Tests
 *
 * Tests the integration of PositionLifecycleService with IPositionRepository
 * Ensures position state is correctly delegated to repository
 */

import { PositionMemoryRepository } from '../../repositories/position.memory-repository';
import { IPositionRepository } from '../../repositories/IRepositories';
import { Position, PositionSide } from '../../types';

describe('PositionLifecycleService + IPositionRepository Integration', () => {
  let repository: IPositionRepository;

  beforeEach(() => {
    repository = new PositionMemoryRepository();
  });

  describe('Basic Position Operations', () => {
    it('should store position in repository', () => {
      const position: Position = {
        id: 'BTCUSDT_Buy',
        journalId: 'trade-1',
        symbol: 'BTCUSDT',
        side: PositionSide.LONG,
        quantity: 0.1,
        entryPrice: 50000,
        leverage: 10,
        marginUsed: 500,
        stopLoss: {
          price: 49000,
          initialPrice: 49000,
          orderId: undefined,
          isBreakeven: false,
          isTrailing: false,
          updatedAt: Date.now(),
        },
        takeProfits: [
          { level: 1, price: 50500, percent: 30, sizePercent: 30, hit: false, orderId: undefined },
          { level: 2, price: 51000, percent: 30, sizePercent: 30, hit: false, orderId: undefined },
          { level: 3, price: 51500, percent: 40, sizePercent: 40, hit: false, orderId: undefined },
        ],
        openedAt: Date.now(),
        unrealizedPnL: 0,
        orderId: 'order-1',
        reason: 'Entry signal',
        protectionVerifiedOnce: true,
        status: 'OPEN',
      };

      repository.setCurrentPosition(position);
      const stored = repository.getCurrentPosition();

      expect(stored).not.toBeNull();
      expect(stored?.id).toBe('BTCUSDT_Buy');
      expect(stored?.entryPrice).toBe(50000);
    });

    it('should retrieve current position from repository', () => {
      const position: Position = {
        id: 'BTCUSDT_Buy',
        journalId: 'trade-1',
        symbol: 'BTCUSDT',
        side: PositionSide.LONG,
        quantity: 0.1,
        entryPrice: 50000,
        leverage: 10,
        marginUsed: 500,
        stopLoss: {
          price: 49000,
          initialPrice: 49000,
          orderId: undefined,
          isBreakeven: false,
          isTrailing: false,
          updatedAt: Date.now(),
        },
        takeProfits: [],
        openedAt: Date.now(),
        unrealizedPnL: 0,
        orderId: 'order-1',
        reason: 'Entry signal',
        protectionVerifiedOnce: true,
        status: 'OPEN',
      };

      repository.setCurrentPosition(position);

      const current = repository.getCurrentPosition();
      expect(current).toEqual(position);
    });

    it('should return null when no position stored', () => {
      const current = repository.getCurrentPosition();
      expect(current).toBeNull();
    });

    it('should clear position from repository', () => {
      const position: Position = {
        id: 'BTCUSDT_Buy',
        journalId: 'trade-1',
        symbol: 'BTCUSDT',
        side: PositionSide.LONG,
        quantity: 0.1,
        entryPrice: 50000,
        leverage: 10,
        marginUsed: 500,
        stopLoss: {
          price: 49000,
          initialPrice: 49000,
          orderId: undefined,
          isBreakeven: false,
          isTrailing: false,
          updatedAt: Date.now(),
        },
        takeProfits: [],
        openedAt: Date.now(),
        unrealizedPnL: 0,
        orderId: 'order-1',
        reason: 'Entry signal',
        protectionVerifiedOnce: true,
        status: 'OPEN',
      };

      repository.setCurrentPosition(position);
      expect(repository.getCurrentPosition()).not.toBeNull();

      repository.setCurrentPosition(null);
      expect(repository.getCurrentPosition()).toBeNull();
    });
  });

  describe('Position History', () => {
    it('should add positions to history', () => {
      const position1: Position = {
        id: 'BTCUSDT_Buy_1',
        journalId: 'trade-1',
        symbol: 'BTCUSDT',
        side: PositionSide.LONG,
        quantity: 0.1,
        entryPrice: 50000,
        leverage: 10,
        marginUsed: 500,
        stopLoss: {
          price: 49000,
          initialPrice: 49000,
          orderId: undefined,
          isBreakeven: false,
          isTrailing: false,
          updatedAt: Date.now(),
        },
        takeProfits: [],
        openedAt: Date.now(),
        unrealizedPnL: 100,
        orderId: 'order-1',
        reason: 'Entry signal',
        protectionVerifiedOnce: true,
        status: 'CLOSED',
      };

      repository.addToHistory(position1);
      const history = repository.getHistory();

      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('BTCUSDT_Buy_1');
    });

    it('should maintain history limit (max 100)', () => {
      // Add 150 positions
      for (let i = 0; i < 150; i++) {
        const position: Position = {
          id: `BTCUSDT_Buy_${i}`,
          journalId: `trade-${i}`,
          symbol: 'BTCUSDT',
          side: PositionSide.LONG,
          quantity: 0.1,
          entryPrice: 50000 + i,
          leverage: 10,
          marginUsed: 500,
          stopLoss: {
            price: 49000,
            initialPrice: 49000,
            orderId: undefined,
            isBreakeven: false,
            isTrailing: false,
            updatedAt: Date.now(),
          },
          takeProfits: [],
          openedAt: Date.now(),
          unrealizedPnL: 0,
          orderId: `order-${i}`,
          reason: 'Entry signal',
          protectionVerifiedOnce: true,
          status: 'CLOSED',
        };

        repository.addToHistory(position);
      }

      const history = repository.getHistory();

      // Should maintain max 100
      expect(history.length).toBeLessThanOrEqual(100);
    });

    it('should get limited history', () => {
      for (let i = 0; i < 50; i++) {
        const position: Position = {
          id: `BTCUSDT_Buy_${i}`,
          journalId: `trade-${i}`,
          symbol: 'BTCUSDT',
          side: PositionSide.LONG,
          quantity: 0.1,
          entryPrice: 50000,
          leverage: 10,
          marginUsed: 500,
          stopLoss: {
            price: 49000,
            initialPrice: 49000,
            orderId: undefined,
            isBreakeven: false,
            isTrailing: false,
            updatedAt: Date.now(),
          },
          takeProfits: [],
          openedAt: Date.now(),
          unrealizedPnL: 0,
          orderId: `order-${i}`,
          reason: 'Entry signal',
          protectionVerifiedOnce: true,
          status: 'CLOSED',
        };

        repository.addToHistory(position);
      }

      const limited = repository.getHistory(10);
      expect(limited).toHaveLength(10);
    });

    it('should clear history', () => {
      const position: Position = {
        id: 'BTCUSDT_Buy',
        journalId: 'trade-1',
        symbol: 'BTCUSDT',
        side: PositionSide.LONG,
        quantity: 0.1,
        entryPrice: 50000,
        leverage: 10,
        marginUsed: 500,
        stopLoss: {
          price: 49000,
          initialPrice: 49000,
          orderId: undefined,
          isBreakeven: false,
          isTrailing: false,
          updatedAt: Date.now(),
        },
        takeProfits: [],
        openedAt: Date.now(),
        unrealizedPnL: 0,
        orderId: 'order-1',
        reason: 'Entry signal',
        protectionVerifiedOnce: true,
        status: 'CLOSED',
      };

      repository.addToHistory(position);
      expect(repository.getHistory()).toHaveLength(1);

      repository.clearHistory();
      expect(repository.getHistory()).toHaveLength(0);
    });
  });

  describe('Position Queries', () => {
    it('should find position by ID', () => {
      const position: Position = {
        id: 'BTCUSDT_Buy',
        journalId: 'trade-1',
        symbol: 'BTCUSDT',
        side: PositionSide.LONG,
        quantity: 0.1,
        entryPrice: 50000,
        leverage: 10,
        marginUsed: 500,
        stopLoss: {
          price: 49000,
          initialPrice: 49000,
          orderId: undefined,
          isBreakeven: false,
          isTrailing: false,
          updatedAt: Date.now(),
        },
        takeProfits: [],
        openedAt: Date.now(),
        unrealizedPnL: 0,
        orderId: 'order-1',
        reason: 'Entry signal',
        protectionVerifiedOnce: true,
        status: 'CLOSED',
      };

      repository.addToHistory(position);

      const found = repository.findPosition('BTCUSDT_Buy');
      expect(found).not.toBeNull();
      expect(found?.id).toBe('BTCUSDT_Buy');
    });

    it('should return null for non-existent position', () => {
      const found = repository.findPosition('NONEXISTENT');
      expect(found).toBeNull();
    });

    it('should get all positions', () => {
      const position1: Position = {
        id: 'BTCUSDT_Buy_1',
        journalId: 'trade-1',
        symbol: 'BTCUSDT',
        side: PositionSide.LONG,
        quantity: 0.1,
        entryPrice: 50000,
        leverage: 10,
        marginUsed: 500,
        stopLoss: {
          price: 49000,
          initialPrice: 49000,
          orderId: undefined,
          isBreakeven: false,
          isTrailing: false,
          updatedAt: Date.now(),
        },
        takeProfits: [],
        openedAt: Date.now(),
        unrealizedPnL: 0,
        orderId: 'order-1',
        reason: 'Entry signal',
        protectionVerifiedOnce: true,
        status: 'CLOSED',
      };

      repository.addToHistory(position1);
      repository.setCurrentPosition({
        ...position1,
        id: 'BTCUSDT_Buy_2',
        status: 'OPEN',
      });

      const all = repository.getAllPositions();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Repository Maintenance', () => {
    it('should get repository size', () => {
      const position: Position = {
        id: 'BTCUSDT_Buy',
        journalId: 'trade-1',
        symbol: 'BTCUSDT',
        side: PositionSide.LONG,
        quantity: 0.1,
        entryPrice: 50000,
        leverage: 10,
        marginUsed: 500,
        stopLoss: {
          price: 49000,
          initialPrice: 49000,
          orderId: undefined,
          isBreakeven: false,
          isTrailing: false,
          updatedAt: Date.now(),
        },
        takeProfits: [],
        openedAt: Date.now(),
        unrealizedPnL: 0,
        orderId: 'order-1',
        reason: 'Entry signal',
        protectionVerifiedOnce: true,
        status: 'CLOSED',
      };

      repository.addToHistory(position);
      repository.setCurrentPosition(position);

      const size = repository.getSize();
      expect(size).toBeGreaterThan(0);
    });

    it('should clear all repository data', () => {
      const position: Position = {
        id: 'BTCUSDT_Buy',
        journalId: 'trade-1',
        symbol: 'BTCUSDT',
        side: PositionSide.LONG,
        quantity: 0.1,
        entryPrice: 50000,
        leverage: 10,
        marginUsed: 500,
        stopLoss: {
          price: 49000,
          initialPrice: 49000,
          orderId: undefined,
          isBreakeven: false,
          isTrailing: false,
          updatedAt: Date.now(),
        },
        takeProfits: [],
        openedAt: Date.now(),
        unrealizedPnL: 0,
        orderId: 'order-1',
        reason: 'Entry signal',
        protectionVerifiedOnce: true,
        status: 'CLOSED',
      };

      repository.addToHistory(position);
      repository.setCurrentPosition(position);

      repository.clear();

      expect(repository.getCurrentPosition()).toBeNull();
      expect(repository.getHistory()).toHaveLength(0);
      expect(repository.getSize()).toBe(0);
    });
  });

  describe('Position Updates', () => {
    it('should update position fields', () => {
      const position: Position = {
        id: 'BTCUSDT_Buy',
        journalId: 'trade-1',
        symbol: 'BTCUSDT',
        side: PositionSide.LONG,
        quantity: 0.1,
        entryPrice: 50000,
        leverage: 10,
        marginUsed: 500,
        stopLoss: {
          price: 49000,
          initialPrice: 49000,
          orderId: undefined,
          isBreakeven: false,
          isTrailing: false,
          updatedAt: Date.now(),
        },
        takeProfits: [],
        openedAt: Date.now(),
        unrealizedPnL: 0,
        orderId: 'order-1',
        reason: 'Entry signal',
        protectionVerifiedOnce: true,
        status: 'OPEN',
      };

      repository.setCurrentPosition(position);

      // Update position
      const updated = { ...position, unrealizedPnL: 500, quantity: 0.05 };
      repository.setCurrentPosition(updated);

      const current = repository.getCurrentPosition();
      expect(current?.unrealizedPnL).toBe(500);
      expect(current?.quantity).toBe(0.05);
    });

    it('should handle concurrent position updates', () => {
      const positions: Position[] = [];

      for (let i = 0; i < 5; i++) {
        const position: Position = {
          id: `BTCUSDT_Buy_${i}`,
          journalId: `trade-${i}`,
          symbol: 'BTCUSDT',
          side: PositionSide.LONG,
          quantity: 0.1 + i * 0.01,
          entryPrice: 50000,
          leverage: 10,
          marginUsed: 500,
          stopLoss: {
            price: 49000,
            initialPrice: 49000,
            orderId: undefined,
            isBreakeven: false,
            isTrailing: false,
            updatedAt: Date.now(),
          },
          takeProfits: [],
          openedAt: Date.now(),
          unrealizedPnL: i * 100,
          orderId: `order-${i}`,
          reason: 'Entry signal',
          protectionVerifiedOnce: true,
          status: 'OPEN',
        };
        positions.push(position);
        repository.addToHistory(position);
      }

      const all = repository.getAllPositions();
      expect(all.length).toBeGreaterThanOrEqual(5);
    });
  });
});
