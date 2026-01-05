/**
 * Tests for PositionManagerService
 *
 * Critical service - manages position lifecycle:
 * - Opening positions with TP/SL
 * - Take profit handling (breakeven, trailing)
 * - Position closing
 * - Journal recording
 */

import { PositionManagerService } from '../../services/position-manager.service';
import { BybitService } from '../../services/bybit';
import { TelegramService } from '../../services/telegram.service';
import { TradingJournalService } from '../../services/trading-journal.service';
import {
  LoggerService,
  LogLevel,
  Signal,
  SignalDirection,
  SignalType,
  PositionSide,
  TradingConfig,
  RiskManagementConfig,
} from '../../types';

// ============================================================================
// HELPERS
// ============================================================================

const createTestConfig = (): {
  trading: TradingConfig;
  risk: RiskManagementConfig;
} => ({
  trading: {
    leverage: 10,
    forceOpenPosition: { enabled: false },
  } as TradingConfig,
  risk: {
    positionSizeUsdt: 10,
    stopLossPercent: 2,
    minStopLossPercent: 1.0,
    takeProfits: [
      { level: 1, percent: 1.0, sizePercent: 50 },
      { level: 2, percent: 2.0, sizePercent: 30 },
      { level: 3, percent: 3.0, sizePercent: 20 },
    ],
    breakevenOffsetPercent: 0.1,
    trailingStopEnabled: true,
    trailingStopActivationLevel: 2,
    trailingStopPercent: 1.0,
  },
});

const createTestSignal = (direction: SignalDirection, price: number): Signal => ({
  type: SignalType.TREND_FOLLOWING,
  direction,
  price,
  stopLoss: direction === SignalDirection.LONG ? price * 0.98 : price * 1.02,
  takeProfits: [
    { level: 1, price: direction === SignalDirection.LONG ? price * 1.01 : price * 0.99, sizePercent: 50, percent: 1.0, hit: false },
    { level: 2, price: direction === SignalDirection.LONG ? price * 1.02 : price * 0.98, sizePercent: 30, percent: 2.0, hit: false },
    { level: 3, price: direction === SignalDirection.LONG ? price * 1.03 : price * 0.97, sizePercent: 20, percent: 3.0, hit: false },
  ],
  confidence: 85,
  reason: 'Test signal',
  timestamp: Date.now(),
  marketData: {
    rsi: 40,
    ema: 100,
    atr: 0.5,
    volumeRatio: 1.2,
    swingHighsCount: 3,
    swingLowsCount: 2,
  },
});

// ============================================================================
// TESTS
// ============================================================================

describe('PositionManagerService', () => {
  let positionManager: PositionManagerService;
  let mockBybitService: jest.Mocked<BybitService>;
  let mockTelegram: jest.Mocked<TelegramService>;
  let mockJournal: jest.Mocked<TradingJournalService>;
  let logger: LoggerService;
  let config: { trading: TradingConfig; risk: RiskManagementConfig };

  beforeEach(() => {
    config = createTestConfig();
    logger = new LoggerService(LogLevel.ERROR, './logs', false);

    // Mock BybitService
    mockBybitService = {
      openPosition: jest.fn().mockResolvedValue('order-123'),
      placeTakeProfitLevels: jest.fn().mockResolvedValue(['tp1-id', 'tp2-id', 'tp3-id']),
      placeStopLoss: jest.fn().mockResolvedValue('sl-id'),
      cancelAllConditionalOrders: jest.fn().mockResolvedValue(undefined),
      updateStopLoss: jest.fn().mockResolvedValue(undefined),
      cancelStopLoss: jest.fn().mockResolvedValue(undefined),
      getCurrentPrice: jest.fn().mockResolvedValue(100),
      verifyProtectionSet: jest.fn().mockResolvedValue({
        hasStopLoss: true,
        hasTakeProfit: true,
        stopLossPrice: 100,
        takeProfitPrices: [102, 104, 106],
        activeOrders: 4,
        verified: true,
      }),
      cancelTakeProfit: jest.fn().mockResolvedValue(undefined),
      setTrailingStop: jest.fn().mockResolvedValue(undefined),
      closePosition: jest.fn().mockResolvedValue(undefined),
      getExchangeLimits: jest.fn().mockReturnValue({
        qtyStep: '0.1',
        tickSize: '0.0001',
        minOrderQty: '0.1',
      }),
      symbol: 'APTUSDT',
    } as any;

    // Mock TelegramService
    mockTelegram = {
      notifyPositionOpened: jest.fn().mockResolvedValue(undefined),
      notifyBreakeven: jest.fn().mockResolvedValue(undefined),
      notifyTrailingActivated: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Mock TradingJournalService
    mockJournal = {
      recordTradeOpen: jest.fn(),
      recordTradeClose: jest.fn(),
      getOpenPositionBySymbol: jest.fn(),
    } as any;

    const mockEventBus = {
      emit: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    } as any;

    positionManager = new PositionManagerService(
      mockBybitService,
      config.trading,
      config.risk,
      mockTelegram,
      logger,
      mockJournal,
      { long: { enabled: true, expirySeconds: 120 }, short: { enabled: false, expirySeconds: 120 } }, // Entry confirmation config
      config as any, // Full config (mock)
      mockEventBus,
    );
  });

  describe('openPosition', () => {
    it('should open LONG position successfully', async () => {
      const signal = createTestSignal(SignalDirection.LONG, 100);

      const position = await positionManager.openPosition(signal);

      expect(position).toBeDefined();
      expect(position.side).toBe(PositionSide.LONG);
      expect(position.entryPrice).toBe(100);
      expect(position.quantity).toBe(1); // (10 USDT * 10 leverage) / 100 price = 1
      expect(position.takeProfits).toHaveLength(3);
      expect(position.stopLoss.price).toBe(98);

      // Should cancel hanging orders first
      expect(mockBybitService.cancelAllConditionalOrders).toHaveBeenCalled();

      // Should open position
      expect(mockBybitService.openPosition).toHaveBeenCalledWith({
        side: PositionSide.LONG,
        quantity: 1,
        leverage: 10,
      });

      // Should place TPs and SL (using position-level SL, not conditional)
      expect(mockBybitService.placeTakeProfitLevels).toHaveBeenCalled();
      expect(mockBybitService.updateStopLoss).toHaveBeenCalled();

      // Should notify Telegram
      expect(mockTelegram.notifyPositionOpened).toHaveBeenCalled();

      // Should record in journal
      expect(mockJournal.recordTradeOpen).toHaveBeenCalled();
    });

    it('should open SHORT position successfully', async () => {
      const signal = createTestSignal(SignalDirection.SHORT, 100);

      const position = await positionManager.openPosition(signal);

      expect(position.side).toBe(PositionSide.SHORT);
      expect(position.stopLoss.price).toBe(102);
    });

    it('should throw error if position already exists', async () => {
      const signal = createTestSignal(SignalDirection.LONG, 100);

      await positionManager.openPosition(signal);

      await expect(positionManager.openPosition(signal)).rejects.toThrow(
        'Position already exists',
      );
    });

    it('should calculate quantity correctly (10 USDT * 10x / price)', async () => {
      const signal = createTestSignal(SignalDirection.LONG, 50); // Lower price = more quantity

      const position = await positionManager.openPosition(signal);

      expect(position.quantity).toBe(2); // (10 * 10) / 50 = 2
    });

    it('should round quantity to 3 decimal places', async () => {
      const signal = createTestSignal(SignalDirection.LONG, 33.333);

      const position = await positionManager.openPosition(signal);

      expect(position.quantity).toBe(3.0); // (10 * 10) / 33.333 = 3.0
    });
  });

  describe('getCurrentPosition', () => {
    it('should return null when no position', () => {
      expect(positionManager.getCurrentPosition()).toBeNull();
    });

    it('should return current position', async () => {
      const signal = createTestSignal(SignalDirection.LONG, 100);
      await positionManager.openPosition(signal);

      const position = positionManager.getCurrentPosition();
      expect(position).toBeDefined();
      expect(position?.side).toBe(PositionSide.LONG);
    });
  });

  describe('syncWithWebSocket', () => {
    it('should update quantity and PnL', async () => {
      const signal = createTestSignal(SignalDirection.LONG, 100);
      await positionManager.openPosition(signal);

      const wsPosition = {
        ...positionManager.getCurrentPosition()!,
        quantity: 0.5, // Partially closed
        unrealizedPnL: 5,
      };

      positionManager.syncWithWebSocket(wsPosition);

      const position = positionManager.getCurrentPosition();
      expect(position?.quantity).toBe(0.5);
      expect(position?.unrealizedPnL).toBe(5);
    });

    it('should update entryPrice if current is 0 and WS sends valid price', async () => {
      const signal = createTestSignal(SignalDirection.LONG, 100);
      await positionManager.openPosition(signal);

      // Simulate entryPrice = 0 (market order not filled yet)
      const position = positionManager.getCurrentPosition()!;
      position.entryPrice = 0;

      const wsPosition = { ...position, entryPrice: 100.5 };
      positionManager.syncWithWebSocket(wsPosition);

      expect(positionManager.getCurrentPosition()?.entryPrice).toBe(100.5);
    });

    it('should NOT overwrite valid entryPrice', async () => {
      const signal = createTestSignal(SignalDirection.LONG, 100);
      await positionManager.openPosition(signal);

      const wsPosition = {
        ...positionManager.getCurrentPosition()!,
        entryPrice: 0, // WS sends 0
      };

      positionManager.syncWithWebSocket(wsPosition);

      expect(positionManager.getCurrentPosition()?.entryPrice).toBe(100); // Preserved from signal
    });

    it('should create position if none exists', () => {
      const position = {
        id: 'test',
        symbol: 'APTUSDT',
        side: PositionSide.LONG,
        quantity: 1,
        entryPrice: 100,
        leverage: 10,
        marginUsed: 10,
        stopLoss: {
          price: 98,
          initialPrice: 98,
          orderId: 'sl-id',
          isBreakeven: false,
          isTrailing: false,
          updatedAt: Date.now(),
        },
        takeProfits: [],
        openedAt: Date.now(),
        unrealizedPnL: 0,
        orderId: 'order-123',
        reason: 'Test',
        confidence: 85,
        strategy: SignalType.TREND_FOLLOWING,
        status: 'OPEN' as const,
      };

      positionManager.syncWithWebSocket(position);

      expect(positionManager.getCurrentPosition()).toEqual(position);
    });
  });

  describe('clearPosition', () => {
    it('should clear position and cancel orders', async () => {
      const signal = createTestSignal(SignalDirection.LONG, 100);
      await positionManager.openPosition(signal);

      await positionManager.clearPosition();

      expect(positionManager.getCurrentPosition()).toBeNull();
      expect(mockBybitService.cancelAllConditionalOrders).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // SESSION #60: POSITION LIFECYCLE TESTS (v3.5.0 - status field + idempotency)
  // ============================================================================

  describe('Position Lifecycle (Session #60)', () => {
    it('should set status to OPEN after openPosition()', async () => {
      const signal = createTestSignal(SignalDirection.LONG, 100);

      const position = await positionManager.openPosition(signal);

      expect(position.status).toBe('OPEN');
    });

    it('getCurrentPosition() should return null after clearPosition()', async () => {
      const signal = createTestSignal(SignalDirection.LONG, 100);
      await positionManager.openPosition(signal);

      expect(positionManager.getCurrentPosition()).not.toBeNull();

      await positionManager.clearPosition();

      expect(positionManager.getCurrentPosition()).toBeNull();
    });
  });
});
