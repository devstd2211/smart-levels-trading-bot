/**
 * Phase 9.1: GracefulShutdownManager Unit Tests
 *
 * Test Coverage:
 * - Signal handler registration (SIGINT/SIGTERM)
 * - Shutdown sequence and orchestration
 * - Position closure via ActionQueue
 * - Order cancellation via IExchange
 * - State persistence to disk
 * - State recovery from disk
 * - Timeout protection
 * - Error handling and edge cases
 *
 * Total: 16 tests
 */

import { GracefulShutdownManager } from '../../services/graceful-shutdown.service';
import { PositionLifecycleService } from '../../services/position-lifecycle.service';
import { ActionQueueService } from '../../services/action-queue.service';
import { BotEventBus } from '../../services/event-bus';
import { LoggerService, PositionSide, Position, TakeProfit, StopLossConfig } from '../../types';
import { IExchange } from '../../interfaces/IExchange';
import {
  GracefulShutdownConfig,
  EmergencyCloseReason,
  LiveTradingEventType,
} from '../../types/live-trading.types';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs and path modules
jest.mock('fs');
jest.mock('path', () => ({
  ...jest.requireActual('path'),
  join: jest.fn((...args) => args.join('/')),
}));

// Mock process.exit - throw error to prevent further execution
const mockExit = jest.fn(() => {
  throw new Error('Process exit called');
});
jest.spyOn(process, 'exit').mockImplementation(mockExit as any);

describe('GracefulShutdownManager', () => {
  let shutdownManager: GracefulShutdownManager;
  let mockPositionLifecycleService: jest.Mocked<PositionLifecycleService>;
  let mockActionQueue: jest.Mocked<ActionQueueService>;
  let mockExchange: jest.Mocked<IExchange>;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockEventBus: jest.Mocked<BotEventBus>;

  const mockConfig: GracefulShutdownConfig = {
    shutdownTimeoutSeconds: 30,
    cancelOrdersOnShutdown: true,
    closePositionsOnShutdown: true,
    persistStateOnShutdown: true,
  };

  const createMockPosition = (): Position => ({
    id: 'pos-123',
    symbol: 'BTCUSDT',
    side: PositionSide.LONG,
    quantity: 0.1,
    entryPrice: 45000,
    leverage: 10,
    marginUsed: 450,
    unrealizedPnL: 500,
    status: 'OPEN',
    openedAt: Date.now() - 3600000,
    orderId: 'order-123',
    reason: 'shutdown-test',
    takeProfits: [
      { level: 1, percent: 0.5, sizePercent: 50, price: 46000, hit: false },
    ],
    stopLoss: {
      price: 44000,
      initialPrice: 44000,
      isBreakeven: false,
      isTrailing: false,
      updatedAt: Date.now(),
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mocks
    mockPositionLifecycleService = {
      getCurrentPosition: jest.fn().mockReturnValue(createMockPosition()),
      getPositionHistory: jest.fn().mockReturnValue([]),
      updatePosition: jest.fn(),
    } as any;

    mockActionQueue = {
      enqueue: jest.fn(),
      waitEmpty: jest.fn().mockResolvedValue(undefined),
      getQueueSize: jest.fn().mockReturnValue(0),
      clear: jest.fn(),
    } as any;

    mockExchange = {
      cancelAllOrders: jest.fn().mockResolvedValue(undefined),
      cancelAllConditionalOrders: jest.fn().mockResolvedValue(undefined),
      getSymbols: jest.fn().mockResolvedValue([]),
      getBalance: jest.fn().mockResolvedValue({}),
      placeOrder: jest.fn(),
      cancelOrder: jest.fn(),
      getOrderHistory: jest.fn(),
      getOpenOrders: jest.fn(),
      getPositions: jest.fn(),
      getTradingPairs: jest.fn(),
      getTicker: jest.fn(),
      getKlines: jest.fn(),
      subscribeToTicker: jest.fn(),
      subscribeToPositions: jest.fn(),
      subscribeToOrders: jest.fn(),
      unsubscribeTicker: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
    } as any;

    mockEventBus = {
      publishSync: jest.fn(),
      publish: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    } as any;

    // Mock fs functions
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
    (fs.readFileSync as jest.Mock).mockReturnValue('{}');

    // Create shutdown manager with mocks
    shutdownManager = new GracefulShutdownManager(
      mockConfig,
      mockPositionLifecycleService,
      mockActionQueue,
      mockExchange,
      mockLogger,
      mockEventBus,
      './test-shutdown-state'
    );
  });

  describe('Signal Handler Registration', () => {
    it('should register SIGINT and SIGTERM handlers', () => {
      const spy = jest.spyOn(process, 'on');

      shutdownManager.registerShutdownHandlers();

      expect(spy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(spy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[GracefulShutdownManager] Signal handlers registered'
      );

      spy.mockRestore();
    });

    it('should handle SIGINT signal', async () => {
      const spy = jest.spyOn(process, 'on');
      shutdownManager.registerShutdownHandlers();

      const sigintHandler = spy.mock.calls.find((call) => call[0] === 'SIGINT')![1];
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(null);

      await sigintHandler();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('[GracefulShutdownManager] Received SIGINT')
      );

      spy.mockRestore();
    });

    it('should handle SIGTERM signal', async () => {
      const spy = jest.spyOn(process, 'on');
      shutdownManager.registerShutdownHandlers();

      const sigtermHandler = spy.mock.calls.find((call) => call[0] === 'SIGTERM')![1] as Function;
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(null);

      await sigtermHandler();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('[GracefulShutdownManager] Received SIGTERM')
      );

      spy.mockRestore();
    });
  });

  describe('Shutdown Sequence', () => {
    beforeEach(() => {
      // Mock process.exit to not actually exit in tests
      (mockExit as jest.Mock).mockImplementation(() => {
        // Don't throw, just mock it
      });
    });

    it('should prevent multiple simultaneous shutdowns', async () => {
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(null);

      // Make waitEmpty never resolve to keep shutdown in progress
      mockActionQueue.waitEmpty.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      // Create a new manager
      const manager1 = new GracefulShutdownManager(
        mockConfig,
        mockPositionLifecycleService,
        mockActionQueue,
        mockExchange,
        mockLogger,
        mockEventBus,
        './test-shutdown-state'
      );

      // Start first shutdown (won't complete due to mocked waitEmpty)
      const promise1 = manager1.initiateShutdown('First');

      // Immediately try second shutdown - this should return early
      const result2 = await manager1.initiateShutdown('Second');

      // Second shutdown should fail immediately
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('Shutdown already in progress');

      // Clean up: reset the mock
      mockActionQueue.waitEmpty.mockResolvedValue(undefined);
    });

    it('should emit shutdown-started event with reason', async () => {
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(null);

      // Use a separate manager instance for this test
      const manager = new GracefulShutdownManager(
        mockConfig,
        mockPositionLifecycleService,
        mockActionQueue,
        mockExchange,
        mockLogger,
        mockEventBus,
        './test-shutdown-state'
      );

      try {
        await manager.initiateShutdown('User interrupt');
      } catch {
        // Ignore any errors
      }

      const startedEvent = mockEventBus.publishSync.mock.calls.find(
        (call) => call[0].type === LiveTradingEventType.SHUTDOWN_STARTED
      );

      expect(startedEvent).toBeDefined();
      expect(startedEvent![0].data.reason).toBe('User interrupt');
    });

    it('should wait for action queue to empty', async () => {
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(null);

      const manager = new GracefulShutdownManager(
        mockConfig,
        mockPositionLifecycleService,
        mockActionQueue,
        mockExchange,
        mockLogger,
        mockEventBus,
        './test-shutdown-state'
      );

      try {
        await manager.initiateShutdown('Queue test');
      } catch {
        // Ignore
      }

      expect(mockActionQueue.waitEmpty).toHaveBeenCalled();
    });

    it('should emit shutdown-completed event before exit', async () => {
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(null);

      const manager = new GracefulShutdownManager(
        mockConfig,
        mockPositionLifecycleService,
        mockActionQueue,
        mockExchange,
        mockLogger,
        mockEventBus,
        './test-shutdown-state'
      );

      try {
        await manager.initiateShutdown('Test');
      } catch {
        // Ignore
      }

      expect(mockEventBus.publishSync).toHaveBeenCalledWith(
        expect.objectContaining({
          type: LiveTradingEventType.SHUTDOWN_COMPLETED,
        })
      );
    });
  });

  describe('Order Cancellation', () => {
    it('should cancel all orders when position exists', async () => {
      const result = await (shutdownManager as any).cancelAllPendingOrders();

      expect(mockExchange.cancelAllOrders).toHaveBeenCalledWith('BTCUSDT');
      expect(mockExchange.cancelAllConditionalOrders).toHaveBeenCalled();
      expect(result).toBe(2); // Count of cancel attempts
    });

    it('should return 0 when no position exists', async () => {
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(null);

      const result = await (shutdownManager as any).cancelAllPendingOrders();

      expect(mockExchange.cancelAllOrders).not.toHaveBeenCalled();
      expect(result).toBe(0);
    });

    it('should handle error when cancelling hanging orders', async () => {
      mockExchange.cancelAllOrders.mockRejectedValue(new Error('API Error'));

      const result = await (shutdownManager as any).cancelAllPendingOrders();

      // Should still try conditional orders
      expect(mockExchange.cancelAllConditionalOrders).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error cancelling hanging orders')
      );
      expect(result).toBe(1);
    });

    it('should handle error when cancelling conditional orders', async () => {
      mockExchange.cancelAllConditionalOrders.mockRejectedValue(new Error('API Error'));

      const result = await (shutdownManager as any).cancelAllPendingOrders();

      // Should still try hanging orders
      expect(mockExchange.cancelAllOrders).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error cancelling conditional orders')
      );
      expect(result).toBe(1);
    });

    it('should skip cancellation if disabled in config', async () => {
      const noCancelConfig = { ...mockConfig, cancelOrdersOnShutdown: false };
      const noCancelManager = new GracefulShutdownManager(
        noCancelConfig,
        mockPositionLifecycleService,
        mockActionQueue,
        mockExchange,
        mockLogger,
        mockEventBus,
        './test-shutdown-state'
      );

      await noCancelManager.initiateShutdown('No cancel');

      expect(mockExchange.cancelAllOrders).not.toHaveBeenCalled();
    });
  });

  describe('Position Closure', () => {
    it('should close positions via action queue', async () => {
      const position = createMockPosition();
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(position);

      await shutdownManager.closeAllPositions(EmergencyCloseReason.BOT_SHUTDOWN);

      expect(mockActionQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CLOSE_PERCENT',
          metadata: expect.objectContaining({
            positionId: 'pos-123',
            percent: 100,
            reason: EmergencyCloseReason.BOT_SHUTDOWN,
          }),
        })
      );
    });

    it('should skip closure if no position', async () => {
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(null);

      await shutdownManager.closeAllPositions(EmergencyCloseReason.BOT_SHUTDOWN);

      expect(mockActionQueue.enqueue).not.toHaveBeenCalled();
    });

    it('should skip closure if disabled in config', async () => {
      const noCloseConfig = { ...mockConfig, closePositionsOnShutdown: false };
      const noCloseManager = new GracefulShutdownManager(
        noCloseConfig,
        mockPositionLifecycleService,
        mockActionQueue,
        mockExchange,
        mockLogger,
        mockEventBus,
        './test-shutdown-state'
      );

      const position = createMockPosition();
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(position);

      await noCloseManager.initiateShutdown('No close test');

      expect(mockActionQueue.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('State Persistence', () => {
    it('should persist bot state to disk', async () => {
      const position = createMockPosition();
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(position);

      await shutdownManager.persistState();

      expect(fs.writeFileSync).toHaveBeenCalled();
      const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      expect(writeCall[0]).toContain('bot-state.json');

      const savedData = JSON.parse(writeCall[1]);
      expect(savedData.positions).toHaveLength(1);
      expect(savedData.positions[0].symbol).toBe('BTCUSDT');
    });

    it('should save empty positions when no position', async () => {
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(null);

      await shutdownManager.persistState();

      const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      const savedData = JSON.parse(writeCall[1]);
      expect(savedData.positions).toHaveLength(0);
    });

    it('should emit state-persisted event', async () => {
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(null);

      await shutdownManager.persistState();

      expect(mockEventBus.publishSync).toHaveBeenCalledWith(
        expect.objectContaining({
          type: LiveTradingEventType.STATE_PERSISTED,
        })
      );
    });

    it('should skip persistence if disabled in config', async () => {
      const noPersistConfig = { ...mockConfig, persistStateOnShutdown: false };
      const noPersistManager = new GracefulShutdownManager(
        noPersistConfig,
        mockPositionLifecycleService,
        mockActionQueue,
        mockExchange,
        mockLogger,
        mockEventBus,
        './test-shutdown-state'
      );

      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(null);

      await noPersistManager.initiateShutdown('No persist');

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('State Recovery', () => {
    it('should recover state from disk', async () => {
      const savedState = {
        snapshotTime: Date.now(),
        positions: [
          {
            positionId: 'pos-1',
            symbol: 'BTCUSDT',
            direction: 'LONG',
            quantity: 1,
            entryPrice: 45000,
            entryTime: Date.now(),
            currentPnL: 1000,
            openOrders: [],
            state: 'OPEN',
          },
        ],
        sessionMetrics: { totalTrades: 5, totalPnL: 2500, startTime: Date.now() },
        riskMetrics: { dailyPnL: 2500, consecutiveLosses: 0, totalExposure: 45000 },
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(savedState));

      const metadata = await shutdownManager.recoverState();

      expect(metadata).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Recovering state from')
      );
    });

    it('should return null when no saved state exists', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const metadata = await shutdownManager.recoverState();

      expect(metadata).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('No saved state found')
      );
    });

    it('should emit state-recovered event', async () => {
      const savedState = {
        snapshotTime: Date.now(),
        positions: [],
        sessionMetrics: { totalTrades: 0, totalPnL: 0, startTime: Date.now() },
        riskMetrics: { dailyPnL: 0, consecutiveLosses: 0, totalExposure: 0 },
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(savedState));

      await shutdownManager.recoverState();

      expect(mockEventBus.publishSync).toHaveBeenCalledWith(
        expect.objectContaining({
          type: LiveTradingEventType.STATE_RECOVERED,
        })
      );
    });

    it('should handle invalid saved state gracefully', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('invalid json');

      const metadata = await shutdownManager.recoverState();

      expect(metadata).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error recovering state')
      );
    });
  });

  describe('Shutdown Status and Utilities', () => {
    it('should return shutdown in progress flag', () => {
      expect(shutdownManager.isShutdownInProgress()).toBe(false);
    });

    it('should return state directory path', () => {
      const dir = shutdownManager.getStateDirectory();
      expect(dir).toBe('./test-shutdown-state');
    });

    it('should check if saved state exists', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      expect(shutdownManager.hasSavedState()).toBe(true);

      (fs.existsSync as jest.Mock).mockReturnValue(false);
      expect(shutdownManager.hasSavedState()).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle state persistence errors', async () => {
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(null);
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Disk write failed');
      });

      try {
        await shutdownManager.persistState();
      } catch (error) {
        expect(error).toBeDefined();
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error persisting state')
      );
    });

    it('should handle action queue timeout gracefully', async () => {
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(null);
      mockActionQueue.waitEmpty.mockRejectedValue(new Error('Queue timeout'));

      const manager = new GracefulShutdownManager(
        mockConfig,
        mockPositionLifecycleService,
        mockActionQueue,
        mockExchange,
        mockLogger,
        mockEventBus,
        './test-shutdown-state'
      );

      try {
        await manager.initiateShutdown('Queue timeout');
      } catch {
        // Ignore exit error
      }

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Action queue did not empty')
      );
    });
  });
});
