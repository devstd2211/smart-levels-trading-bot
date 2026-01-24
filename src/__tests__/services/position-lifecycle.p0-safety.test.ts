/**
 * Phase 9.P0 Safety Tests: Atomic Lock & Snapshots
 *
 * Tests for:
 * - P0.1: Atomic lock for position close (prevent timeout ↔ close race)
 * - P0.3: Atomic snapshots for concurrent reads (prevent WebSocket ↔ monitor race)
 *
 * Total: 9 tests
 */

import { PositionLifecycleService } from '../../services/position-lifecycle.service';
import { PositionSide } from '../../types';
import { Position, TradingConfig, RiskManagementConfig, EntryConfirmationConfig, Config, LoggerService } from '../../types';
import { BotEventBus } from '../../services/event-bus';
import { TelegramService } from '../../services/telegram.service';
import { TradingJournalService } from '../../services/trading-journal.service';
import { IExchange } from '../../interfaces/IExchange';

// Mock dependencies
const mockExchange: any = {
  closePosition: jest.fn().mockResolvedValue(undefined),
  placeOrder: jest.fn(),
  cancelOrder: jest.fn(),
  cancelAllOrders: jest.fn(),
  cancelAllConditionalOrders: jest.fn(),
  getSymbols: jest.fn().mockResolvedValue([]),
  getBalance: jest.fn().mockResolvedValue({}),
  getTicker: jest.fn(),
  getKlines: jest.fn(),
  getOrderHistory: jest.fn(),
  getOpenOrders: jest.fn(),
  getPositions: jest.fn(),
  getTradingPairs: jest.fn(),
  subscribeToTicker: jest.fn(),
  subscribeToPositions: jest.fn(),
  subscribeToOrders: jest.fn(),
  unsubscribeTicker: jest.fn(),
};

const mockLogger: any = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
};

const mockEventBus: any = {
  emit: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  publishSync: jest.fn(),
  publish: jest.fn(),
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
};

const mockTelegram: any = {
  sendMessage: jest.fn(),
};

const mockJournal: any = {
  recordTrade: jest.fn(),
};

const createMockPosition = (): Position => ({
  id: 'BTCUSDT_Buy',
  symbol: 'BTCUSDT',
  side: PositionSide.LONG,
  quantity: 1.0,
  entryPrice: 45000,
  leverage: 10,
  marginUsed: 4500,
  unrealizedPnL: 500,
  status: 'OPEN',
  openedAt: Date.now() - 3600000,
  orderId: 'order-123',
  reason: 'Test entry',
  takeProfits: [
    { level: 1, percent: 0.5, sizePercent: 50, price: 45225, hit: false },
  ],
  stopLoss: {
    price: 44000,
    initialPrice: 44000,
    isBreakeven: false,
    isTrailing: false,
    updatedAt: Date.now(),
  },
});

describe('PositionLifecycleService - P0 Safety Tests', () => {
  let service: PositionLifecycleService;
  let position: Position;

  const mockConfig: TradingConfig = {
    leverage: 10,
    positionSize: 100,
  } as any;

  const mockRiskConfig: RiskManagementConfig = {
    dailyLossLimit: 1000,
    maxConsecutiveLosses: 3,
  } as any;

  const mockEntryConfig: EntryConfirmationConfig = {
    enabled: false,
  } as any;

  const mockFullConfig: Config = {
    trading: mockConfig,
    riskManagement: mockRiskConfig,
    entryConfirmation: mockEntryConfig,
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new PositionLifecycleService(
      mockExchange,
      mockConfig,
      mockRiskConfig,
      mockTelegram,
      mockLogger,
      mockJournal,
      mockEntryConfig,
      mockFullConfig,
      mockEventBus
    );

    position = createMockPosition();
  });

  // =========================================================================
  // P0.1: ATOMIC LOCK TESTS
  // =========================================================================

  describe('P0.1: Atomic Lock for Position Close', () => {
    test('AL1: First close attempt succeeds', async () => {
      // Set position in service
      (service as any).currentPosition = position;

      await service.closePositionWithAtomicLock(position.id, 'Test close');

      // Position should be cleared after closing
      expect((service as any).currentPosition).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('[P0.1] Position closed successfully')
      );
    });

    test('AL2: Concurrent close attempts wait for first', async () => {
      (service as any).currentPosition = position;

      // Start two concurrent closes
      const promise1 = service.closePositionWithAtomicLock(position.id, 'Close 1');
      const promise2 = service.closePositionWithAtomicLock(position.id, 'Close 2');

      await Promise.all([promise1, promise2]);

      // Position should be cleared only once (atomic lock prevented second)
      expect((service as any).currentPosition).toBeNull();

      // Both should complete - second should warn about already closing
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[P0.1] Position already closing')
      );
    });

    test('AL3: Lock released after successful close', async () => {
      (service as any).currentPosition = position;

      await service.closePositionWithAtomicLock(position.id, 'Close 1');

      // Lock should be cleaned up
      const positionClosing = (service as any).positionClosing;
      expect(positionClosing.has(position.id)).toBe(false);
    });

    test('AL4: Lock released after failed close', async () => {
      (service as any).currentPosition = position;
      mockExchange.closePosition.mockRejectedValueOnce(new Error('Exchange error'));

      try {
        await service.closePositionWithAtomicLock(position.id, 'Close fail');
      } catch {
        // Expected
      }

      // Lock should still be cleaned up even on error
      const positionClosing = (service as any).positionClosing;
      expect(positionClosing.has(position.id)).toBe(false);
    });

    test('AL5: Null reference check on stale position', async () => {
      (service as any).currentPosition = null; // Position already cleared

      await service.closePositionWithAtomicLock(position.id, 'Stale position');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('[P0.1] Position already closed or not found')
      );
      expect(mockExchange.closePosition).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // P0.3: ATOMIC SNAPSHOT TESTS
  // =========================================================================

  describe('P0.3: Atomic Position Snapshots', () => {
    test('AS1: Snapshot is deep copy, not reference', () => {
      (service as any).currentPosition = position;

      const snapshot = service.getPositionSnapshot();

      // Snapshot should not be same object reference
      expect(snapshot).not.toBe(position);
      expect(snapshot).toEqual(position); // But content should be same
    });

    test('AS2: Modifying snapshot doesn\'t affect original', () => {
      (service as any).currentPosition = position;
      const originalPnL = position.unrealizedPnL;

      const snapshot = service.getPositionSnapshot();
      if (snapshot) {
        snapshot.unrealizedPnL = 999999; // Modify snapshot
      }

      // Original should be unchanged
      expect(position.unrealizedPnL).toBe(originalPnL);
    });

    test('AS3: WebSocket changes don\'t affect in-flight snapshot', async () => {
      (service as any).currentPosition = position;

      // Get snapshot
      const snapshot = service.getPositionSnapshot();

      // Simulate WebSocket update
      const updated = createMockPosition();
      updated.unrealizedPnL = 9000; // Large change
      (service as any).currentPosition = updated;

      // Snapshot should still have original PnL
      expect(snapshot?.unrealizedPnL).toBe(500);

      // Current position should have new PnL
      expect(service.getCurrentPosition()?.unrealizedPnL).toBe(9000);
    });

    test('AS4: Multiple snapshots are independent', () => {
      (service as any).currentPosition = position;

      const snapshot1 = service.getPositionSnapshot();
      const snapshot2 = service.getPositionSnapshot();

      if (snapshot1 && snapshot2) {
        snapshot1.unrealizedPnL = 111;
        snapshot2.unrealizedPnL = 222;

        // Should be different
        expect(snapshot1.unrealizedPnL).toBe(111);
        expect(snapshot2.unrealizedPnL).toBe(222);
      }
    });

    test('AS5: Null position returns null snapshot', () => {
      (service as any).currentPosition = null;

      const snapshot = service.getPositionSnapshot();

      expect(snapshot).toBeNull();
    });

    test('AS6: Snapshot preserves all fields', () => {
      (service as any).currentPosition = position;

      const snapshot = service.getPositionSnapshot();

      expect(snapshot?.id).toBe(position.id);
      expect(snapshot?.symbol).toBe(position.symbol);
      expect(snapshot?.quantity).toBe(position.quantity);
      expect(snapshot?.entryPrice).toBe(position.entryPrice);
      expect(snapshot?.leverage).toBe(position.leverage);
      expect(snapshot?.unrealizedPnL).toBe(position.unrealizedPnL);
      expect(snapshot?.takeProfits).toEqual(position.takeProfits);
      expect(snapshot?.stopLoss).toEqual(position.stopLoss);
    });

    test('AS7: Snapshot can be used safely for calculations', () => {
      (service as any).currentPosition = position;

      const snapshot = service.getPositionSnapshot();

      // Simulate Phase 9 service calculations
      if (snapshot) {
        const pnlPercent = (snapshot.unrealizedPnL / snapshot.marginUsed) * 100;
        expect(pnlPercent).toBeCloseTo(11.11, 1); // 500 / 4500 * 100
      }
    });

    test('AS8: Concurrent snapshot reads are safe', async () => {
      (service as any).currentPosition = position;

      // Multiple concurrent snapshot reads
      const promises = [
        Promise.resolve(service.getPositionSnapshot()),
        Promise.resolve(service.getPositionSnapshot()),
        Promise.resolve(service.getPositionSnapshot()),
      ];

      const snapshots = await Promise.all(promises);

      // All should be valid and independent
      expect(snapshots).toHaveLength(3);
      expect(snapshots[0]).toEqual(position);
      expect(snapshots[1]).toEqual(position);
      expect(snapshots[2]).toEqual(position);
      expect(snapshots[0]).not.toBe(snapshots[1]); // Different objects
    });
  });

  // =========================================================================
  // P0.1 + P0.3 INTEGRATION TESTS
  // =========================================================================

  describe('P0.1 + P0.3 Integration', () => {
    test('INT1: Atomic lock + snapshots prevent race condition', async () => {
      (service as any).currentPosition = position;

      // Simulate: Health monitor gets snapshot while close happens
      const snapshotPromise = Promise.resolve(service.getPositionSnapshot());
      const closePromise = service.closePositionWithAtomicLock(position.id, 'Race test');

      const [snapshot] = await Promise.all([snapshotPromise]);

      // Snapshot should be valid even though close is happening
      expect(snapshot?.id).toBe(position.id);
      expect(snapshot?.unrealizedPnL).toBe(500);

      // Close should complete
      await closePromise;
      expect(service.getCurrentPosition()).toBeNull();
    });
  });
});
