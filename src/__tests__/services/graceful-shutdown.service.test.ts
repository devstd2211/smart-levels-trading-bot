/**
 * Graceful Shutdown Service Tests
 * PHASE 13.1a: Tests for cancelAllPendingOrders() implementation
 */

import { GracefulShutdownManager } from '../../services/graceful-shutdown.service';
import { PositionLifecycleService } from '../../services/position-lifecycle.service';
import { ActionQueueService } from '../../services/action-queue.service';
import { BotEventBus } from '../../services/event-bus';
import { LoggerService } from '../../services/logger.service';
import { IExchange } from '../../interfaces/IExchange';
import { Position, PositionSide } from '../../types';

describe('GracefulShutdownManager', () => {
  let shutdownManager: GracefulShutdownManager;
  let mockPositionLifecycleService: jest.Mocked<PositionLifecycleService>;
  let mockActionQueue: jest.Mocked<ActionQueueService>;
  let mockExchange: jest.Mocked<IExchange>;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockEventBus: jest.Mocked<BotEventBus>;

  const mockConfig = {
    enabled: true,
    shutdownTimeoutSeconds: 30,
    cancelOrdersOnShutdown: true,
    closePositionsOnShutdown: true,
    persistStateOnShutdown: true,
  };

  const mockPosition: Position = {
    id: 'pos-123',
    symbol: 'BTCUSDT',
    side: PositionSide.LONG,
    quantity: 0.1,
    entryPrice: 45000,
    leverage: 10,
    marginUsed: 450,
    unrealizedPnL: 500,
    stopLoss: {
      price: 44000,
      initialPrice: 44000,
      isBreakeven: false,
      isTrailing: false,
      updatedAt: Date.now(),
    },
    takeProfits: [
      { level: 1, percent: 50, sizePercent: 50, price: 46000, hit: false },
      { level: 2, percent: 30, sizePercent: 30, price: 47000, hit: false },
      { level: 3, percent: 20, sizePercent: 20, price: 48000, hit: false },
    ],
    status: 'OPEN',
    openedAt: Date.now() - 3600000,
    orderId: 'order-123',
    reason: 'signal',
  };

  beforeEach(() => {
    // Create mocks
    mockPositionLifecycleService = {
      getCurrentPosition: jest.fn().mockReturnValue(mockPosition),
    } as any;

    mockActionQueue = {
      enqueue: jest.fn(),
      waitEmpty: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockExchange = {
      cancelAllOrders: jest.fn().mockResolvedValue(undefined),
      cancelAllConditionalOrders: jest.fn().mockResolvedValue(undefined),
      name: 'bybit',
    } as any;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;

    mockEventBus = {} as any;

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

  describe('cancelAllPendingOrders', () => {
    it('should cancel all orders when position exists', async () => {
      // Call private method via reflection
      const result = await (shutdownManager as any).cancelAllPendingOrders();

      // Verify exchange methods were called
      expect(mockExchange.cancelAllOrders).toHaveBeenCalledWith('BTCUSDT');
      expect(mockExchange.cancelAllConditionalOrders).toHaveBeenCalled();

      // Verify logger was called
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Cancelled hanging orders')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Cancelled all conditional orders')
      );

      // Verify return value
      expect(result).toBe(2); // Count of cancellation attempts
    });

    it('should return 0 when no position exists', async () => {
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(null);

      const result = await (shutdownManager as any).cancelAllPendingOrders();

      // Should not call exchange methods
      expect(mockExchange.cancelAllOrders).not.toHaveBeenCalled();
      expect(mockExchange.cancelAllConditionalOrders).not.toHaveBeenCalled();

      // Should log info about no position
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('No open position')
      );

      // Return value should be 0
      expect(result).toBe(0);
    });

    it('should handle error when cancelling hanging orders', async () => {
      const error = new Error('API Error');
      mockExchange.cancelAllOrders.mockRejectedValue(error);

      const result = await (shutdownManager as any).cancelAllPendingOrders();

      // Should still try to cancel conditional orders
      expect(mockExchange.cancelAllConditionalOrders).toHaveBeenCalled();

      // Should log warning
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error cancelling hanging orders')
      );

      // Should still return at least 1 (from conditional orders)
      expect(result).toBe(1);
    });

    it('should handle error when cancelling conditional orders', async () => {
      const error = new Error('API Error');
      mockExchange.cancelAllConditionalOrders.mockRejectedValue(error);

      const result = await (shutdownManager as any).cancelAllPendingOrders();

      // Should still try to cancel hanging orders
      expect(mockExchange.cancelAllOrders).toHaveBeenCalled();

      // Should log warning
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error cancelling conditional orders')
      );

      // Should still return at least 1 (from hanging orders)
      expect(result).toBe(1);
    });

    it('should handle both orders and conditional orders failing', async () => {
      mockExchange.cancelAllOrders.mockRejectedValue(new Error('API Error'));
      mockExchange.cancelAllConditionalOrders.mockRejectedValue(new Error('API Error'));

      const result = await (shutdownManager as any).cancelAllPendingOrders();

      // Should log warnings for both
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);

      // Should return 0 since both failed
      expect(result).toBe(0);
    });

    it('should use correct symbol from position', async () => {
      const customPosition = { ...mockPosition, symbol: 'ETHUSD' };
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(customPosition);

      await (shutdownManager as any).cancelAllPendingOrders();

      // Verify correct symbol was passed to exchange
      expect(mockExchange.cancelAllOrders).toHaveBeenCalledWith('ETHUSD');
    });

    it('should handle unexpected errors gracefully', async () => {
      const error = new Error('Unexpected error');
      mockPositionLifecycleService.getCurrentPosition.mockImplementation(() => {
        throw error;
      });

      const result = await (shutdownManager as any).cancelAllPendingOrders();

      // Should log error
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Unexpected error')
      );

      // Should return 0
      expect(result).toBe(0);
    });
  });

  describe('registerShutdownHandlers', () => {
    it('should register SIGINT handler', () => {
      const spy = jest.spyOn(process, 'on');

      shutdownManager.registerShutdownHandlers();

      // Verify process.on was called for SIGINT and SIGTERM
      expect(spy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(spy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));

      spy.mockRestore();
    });
  });
});
