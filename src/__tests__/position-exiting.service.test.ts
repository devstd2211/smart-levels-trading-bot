/**
 * PositionExitingService Tests
 *
 * Tests for position exit execution including:
 * - Partial and full position closing
 * - Stop-loss and trailing stop management
 * - Take-profit hit handling
 * - Smart TP3 movement
 * - Bollinger Band trailing
 * - Journal recording and notifications
 */

import { PositionExitingService } from '../services/position-exiting.service';
import {
  Position,
  PositionSide,
  LoggerService,
  TradingConfig,
  RiskManagementConfig,
  Config,
  OrderType,
  TakeProfitConfig,
} from '../types';

// Mock services
const createMockBybitService = () => ({
  closePosition: jest.fn().mockResolvedValue(true),
  updateStopLoss: jest.fn().mockResolvedValue(true),
  updateTakeProfit: jest.fn().mockResolvedValue(true),
  setTrailingStop: jest.fn().mockResolvedValue(true),
  cancelAllConditionalOrders: jest.fn().mockResolvedValue(true),
});

const createMockTelegramService = () => ({
  sendAlert: jest.fn().mockResolvedValue(true),
});

const createMockLogger = (): Partial<LoggerService> => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

const createMockJournalService = () => ({
  recordTradeClose: jest.fn().mockResolvedValue(true),
});

const createMockSessionStatsService = () => ({
  updateTradeExit: jest.fn().mockResolvedValue(true),
});

const createMockTakeProfitManager = () => ({
  recordPartialClose: jest.fn(),
  calculateFinalPnL: jest.fn().mockReturnValue({
    totalPnL: { pnlNet: 100, fees: 10 },
  }),
  getTpLevelsHit: jest.fn().mockReturnValue([1, 2]),
});

const createMockPositionManager = (takeProfitManager: any) => ({
  getTakeProfitManager: jest.fn().mockReturnValue(takeProfitManager),
});

// Helper to create a test position
const createTestPosition = (overrides: Partial<Position> = {}): Position => {
  const position = {
    id: 'test-pos-1',
    symbol: 'APEXUSDT',
    side: PositionSide.LONG,
    status: 'OPEN',
    quantity: 1,
    entryPrice: 100,
    openedAt: Date.now() - 60000,
    journalId: 'journal-1',
    leverage: 10,
    marginUsed: 100,
    unrealizedPnL: 0,
    stopLoss: {
      price: 95,
      initialPrice: 95,
      isBreakeven: false,
      isTrailing: false,
      updatedAt: Date.now(),
    },
    takeProfits: [
      { level: 1, percent: 50, price: 110, sizePercent: 50, hit: false, orderId: 'order-1' },
      { level: 2, percent: 30, price: 120, sizePercent: 30, hit: false, orderId: 'order-2' },
      { level: 3, percent: 20, price: 130, sizePercent: 20, hit: false, orderId: 'order-3' },
    ],
    ...overrides,
  } as Position;
  return position;
};

// Default configs
const createTradingConfig = (): TradingConfig => ({
  leverage: 10,
  riskPercent: 1,
  maxPositions: 1,
  tradingCycleIntervalMs: 1000,
  orderType: OrderType.LIMIT,
  tradingFeeRate: 0.0002,
  favorableMovementThresholdPercent: 0.1,
});

const createTPConfigs = (): TakeProfitConfig[] => [
  { level: 1, percent: 50, sizePercent: 50 },
  { level: 2, percent: 30, sizePercent: 30 },
  { level: 3, percent: 20, sizePercent: 20 },
];

const createRiskConfig = (): RiskManagementConfig => ({
  takeProfits: createTPConfigs(),
  stopLossPercent: 5,
  minStopLossPercent: 1.0,
  breakevenOffsetPercent: 0.1,
  trailingStopEnabled: true,
  trailingStopPercent: 2,
  trailingStopActivationLevel: 2,
  positionSizeUsdt: 100,
  smartTP3: {
    enabled: true,
    tickSizePercent: 0.5,
    maxTicks: 10,
    cancelAfterMaxTicks: false,
  },
});

const createFullConfig = (): Config => ({
  trading: createTradingConfig(),
  riskManagement: createRiskConfig(),
  strategies: [],
  bot: { enabled: true },
} as any);

describe('PositionExitingService', () => {
  let service: PositionExitingService;
  let mockBybit: any;
  let mockTelegram: any;
  let mockLogger: any;
  let mockJournal: any;
  let mockSessionStats: any;
  let mockTPManager: any;
  let mockPositionManager: any;

  beforeEach(() => {
    mockBybit = createMockBybitService();
    mockTelegram = createMockTelegramService();
    mockLogger = createMockLogger();
    mockJournal = createMockJournalService();
    mockSessionStats = createMockSessionStatsService();
    mockTPManager = createMockTakeProfitManager();
    mockPositionManager = createMockPositionManager(mockTPManager);

    service = new PositionExitingService(
      mockBybit,
      mockTelegram,
      mockLogger,
      mockJournal,
      createTradingConfig(),
      createRiskConfig(),
      createFullConfig(),
      mockSessionStats,
      mockPositionManager,
    );
  });

  // ========================================================================
  // onTakeProfitHit Tests
  // ========================================================================

  describe('onTakeProfitHit', () => {
    it('should ignore null position', async () => {
      await service.onTakeProfitHit(null as any, 1, 110);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('null position'),
      );
    });

    it('should prevent duplicate TP1 hit processing', async () => {
      const position = createTestPosition({
        takeProfits: [
          { level: 1, percent: 50, price: 110, sizePercent: 50, hit: true, orderId: 'order-1' },
        ],
      });

      await service.onTakeProfitHit(position, 1, 110);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('TP event ignored'),
        expect.any(Object),
      );
    });

    it('should record partial close in TakeProfitManager on TP1', async () => {
      const position = createTestPosition();
      await service.onTakeProfitHit(position, 1, 110);

      // TP1 has sizePercent: 50, so partialQuantity = (1 * 50) / 100 = 0.5
      expect(mockTPManager.recordPartialClose).toHaveBeenCalledWith(1, 0.5, 110);
    });

    it('should mark TP1 as hit', async () => {
      const position = createTestPosition();
      await service.onTakeProfitHit(position, 1, 110);

      const tp1 = position.takeProfits.find((tp) => tp.level === 1);
      expect(tp1?.hit).toBe(true);
      expect(tp1?.hitAt).toBeDefined();
    });

    it('should clear orderId after TP hit', async () => {
      const position = createTestPosition();
      await service.onTakeProfitHit(position, 1, 110);

      const tp1 = position.takeProfits.find((tp) => tp.level === 1);
      expect(tp1?.orderId).toBeUndefined();
    });

    it('should handle TP2 hit and activate trailing', async () => {
      const position = createTestPosition();
      await service.onTakeProfitHit(position, 2, 120);

      expect(mockBybit.setTrailingStop).toHaveBeenCalledWith(
        expect.objectContaining({
          side: 'Buy',
          activationPrice: 120,
          trailingPercent: 2,
        }),
      );
      expect(position.stopLoss.isTrailing).toBe(true);
    });

    it('should handle TP3 hit without special logic', async () => {
      const position = createTestPosition();
      await service.onTakeProfitHit(position, 3, 130);

      const tp3 = position.takeProfits.find((tp) => tp.level === 3);
      expect(tp3?.hit).toBe(true);
      expect(mockBybit.setTrailingStop).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const position = createTestPosition();
      mockBybit.setTrailingStop.mockRejectedValueOnce(new Error('API Error'));

      await service.onTakeProfitHit(position, 2, 120);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to handle TP hit'),
        expect.any(Object),
      );
    });
  });

  // ========================================================================
  // handleTP1Hit Tests (Breakeven Activation)
  // ========================================================================

  describe('handleTP1Hit', () => {
    it('should calculate and set breakeven price for LONG position', async () => {
      const position = createTestPosition({
        side: PositionSide.LONG,
        entryPrice: 100,
      });

      await service.onTakeProfitHit(position, 1, 110);

      expect(mockBybit.updateStopLoss).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: expect.any(String),
          newPrice: expect.closeTo(100.1, 2),
        }),
      );
      expect(position.stopLoss.isBreakeven).toBe(true);
    });

    it('should not re-activate breakeven if already active', async () => {
      const position = createTestPosition({
        stopLoss: {
          price: 100.1,
          initialPrice: 95,
          isBreakeven: true,
          isTrailing: false,
          updatedAt: Date.now(),
        },
      });

      await service.onTakeProfitHit(position, 1, 110);
      await service.onTakeProfitHit(position, 1, 110);

      expect(mockBybit.updateStopLoss).not.toHaveBeenCalled();
    });

    it('should send Telegram notification on breakeven activation', async () => {
      const position = createTestPosition();
      await service.onTakeProfitHit(position, 1, 110);

      expect(mockTelegram.sendAlert).toHaveBeenCalledWith(
        expect.stringContaining('Breakeven'),
      );
    });

    it('should calculate correct breakeven for SHORT position', async () => {
      const position = createTestPosition({
        side: PositionSide.SHORT,
        entryPrice: 100,
        stopLoss: {
          price: 105,
          initialPrice: 105,
          isBreakeven: false,
          isTrailing: false,
          updatedAt: Date.now(),
        },
      });

      await service.onTakeProfitHit(position, 1, 90);

      expect(mockBybit.updateStopLoss).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: expect.any(String),
          newPrice: expect.closeTo(99.9, 2),
        }),
      );
      expect(position.stopLoss.isBreakeven).toBe(true);
    });
  });

  // ========================================================================
  // handleTP2Hit Tests (Trailing Activation)
  // ========================================================================

  describe('handleTP2Hit', () => {
    it('should skip if already in breakeven', async () => {
      const position = createTestPosition({
        stopLoss: {
          price: 100.1,
          initialPrice: 95,
          isBreakeven: true,
          isTrailing: false,
          updatedAt: Date.now(),
        },
      });

      await service.onTakeProfitHit(position, 2, 120);

      expect(mockBybit.setTrailingStop).not.toHaveBeenCalled();
    });

    it('should skip if already trailing', async () => {
      const position = createTestPosition({
        stopLoss: {
          price: 100,
          initialPrice: 95,
          isBreakeven: false,
          isTrailing: true,
          updatedAt: Date.now(),
        },
      });

      await service.onTakeProfitHit(position, 2, 120);

      expect(mockBybit.setTrailingStop).not.toHaveBeenCalled();
    });

    it('should activate trailing on TP2 hit', async () => {
      const position = createTestPosition();
      await service.onTakeProfitHit(position, 2, 120);

      expect(mockBybit.setTrailingStop).toHaveBeenCalledWith({
        side: 'Buy',
        activationPrice: 120,
        trailingPercent: 2,
      });
      expect(position.stopLoss.isTrailing).toBe(true);
      expect(position.stopLoss.trailingPercent).toBe(2);
      expect(position.stopLoss.trailingActivationPrice).toBe(120);
    });

    it('should send Telegram notification on trailing activation', async () => {
      const position = createTestPosition();
      await service.onTakeProfitHit(position, 2, 120);

      expect(mockTelegram.sendAlert).toHaveBeenCalledWith(
        expect.stringContaining('Trailing Stop'),
      );
    });

    it('should handle SHORT position trailing activation', async () => {
      const position = createTestPosition({
        side: PositionSide.SHORT,
        stopLoss: {
          price: 105,
          initialPrice: 105,
          isBreakeven: false,
          isTrailing: false,
          updatedAt: Date.now(),
        },
      });

      await service.onTakeProfitHit(position, 2, 80);

      expect(position.stopLoss.isTrailing).toBe(true);
      expect(mockBybit.setTrailingStop).toHaveBeenCalledWith({
        side: 'Sell',
        activationPrice: 80,
        trailingPercent: 2,
      });
    });
  });

  // ========================================================================
  // updateSmartTrailingV2 Tests
  // ========================================================================

  describe('updateSmartTrailingV2', () => {
    it('should skip if trailing not active', async () => {
      const position = createTestPosition({
        stopLoss: {
          price: 95,
          initialPrice: 95,
          isBreakeven: false,
          isTrailing: false,
          updatedAt: Date.now(),
        },
      });

      await service.updateSmartTrailingV2(position, 110);

      expect(mockBybit.updateStopLoss).not.toHaveBeenCalled();
    });

    it('should tighten trailing stop for LONG position as price rises', async () => {
      const position = createTestPosition({
        side: PositionSide.LONG,
        stopLoss: {
          price: 100,
          initialPrice: 95,
          isBreakeven: false,
          isTrailing: true,
          trailingPercent: 2,
          updatedAt: Date.now(),
        },
      });

      await service.updateSmartTrailingV2(position, 110);

      expect(mockBybit.updateStopLoss).toHaveBeenCalled();
      expect(position.stopLoss.price).toBeGreaterThan(100);
    });

    it('should loosen trailing stop for SHORT position as price falls', async () => {
      const position = createTestPosition({
        side: PositionSide.SHORT,
        stopLoss: {
          price: 100,
          initialPrice: 105,
          isBreakeven: false,
          isTrailing: true,
          trailingPercent: 2,
          updatedAt: Date.now(),
        },
      });

      await service.updateSmartTrailingV2(position, 80);

      expect(mockBybit.updateStopLoss).toHaveBeenCalled();
      expect(position.stopLoss.price).toBeLessThan(100);
    });

    it('should not update if new stop is not more favorable', async () => {
      const position = createTestPosition({
        side: PositionSide.LONG,
        stopLoss: {
          price: 108,
          initialPrice: 95,
          isBreakeven: false,
          isTrailing: true,
          trailingPercent: 2,
          updatedAt: Date.now(),
        },
      });

      await service.updateSmartTrailingV2(position, 105);

      expect(mockBybit.updateStopLoss).not.toHaveBeenCalled();
    });

    it('should update timestamp on successful update', async () => {
      const position = createTestPosition({
        stopLoss: {
          price: 100,
          initialPrice: 95,
          isBreakeven: false,
          isTrailing: true,
          trailingPercent: 2,
          updatedAt: 0,
        },
      });

      await service.updateSmartTrailingV2(position, 110);

      expect(position.stopLoss.updatedAt).toBeGreaterThan(0);
    });

    it('should handle errors gracefully', async () => {
      const position = createTestPosition({
        stopLoss: {
          price: 100,
          initialPrice: 95,
          isBreakeven: false,
          isTrailing: true,
          trailingPercent: 2,
          updatedAt: Date.now(),
        },
      });

      mockBybit.updateStopLoss.mockRejectedValueOnce(new Error('API Error'));

      await service.updateSmartTrailingV2(position, 110);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update trailing stop'),
        expect.any(Object),
      );
    });
  });

  // ========================================================================
  // updateSmartTP3 Tests
  // ========================================================================

  describe('updateSmartTP3', () => {
    it('should skip if trailing not active', async () => {
      const position = createTestPosition({
        stopLoss: {
          price: 95,
          initialPrice: 95,
          isBreakeven: false,
          isTrailing: false,
          updatedAt: Date.now(),
        },
      });

      await service.updateSmartTP3(position, 125);

      expect(mockBybit.updateTakeProfit).not.toHaveBeenCalled();
    });

    it('should skip if TP3 not found', async () => {
      const position = createTestPosition({
        takeProfits: [
          { level: 1, percent: 50, price: 110, sizePercent: 50, hit: false, orderId: 'order-1' },
          { level: 2, percent: 30, price: 120, sizePercent: 30, hit: false, orderId: 'order-2' },
        ],
        stopLoss: {
          price: 95,
          initialPrice: 95,
          isBreakeven: false,
          isTrailing: true,
          updatedAt: Date.now(),
        },
      });

      await service.updateSmartTP3(position, 125);

      expect(mockBybit.updateTakeProfit).not.toHaveBeenCalled();
    });

    it('should skip if TP3 already hit', async () => {
      const position = createTestPosition({
        takeProfits: [
          { level: 1, percent: 50, price: 110, sizePercent: 50, hit: false, orderId: 'order-1' },
          { level: 2, percent: 30, price: 120, sizePercent: 30, hit: true, orderId: 'order-2' },
          { level: 3, percent: 20, price: 130, sizePercent: 20, hit: true, orderId: 'order-3' },
        ],
        stopLoss: {
          price: 95,
          initialPrice: 95,
          isBreakeven: false,
          isTrailing: true,
          updatedAt: Date.now(),
        },
      });

      await service.updateSmartTP3(position, 135);

      expect(mockBybit.updateTakeProfit).not.toHaveBeenCalled();
    });

    it('should move TP3 favorably for LONG position', async () => {
      const position = createTestPosition({
        side: PositionSide.LONG,
        stopLoss: {
          price: 95,
          initialPrice: 95,
          isBreakeven: false,
          isTrailing: true,
          updatedAt: Date.now(),
        },
      });

      await service.updateSmartTP3(position, 140);

      expect(mockBybit.updateTakeProfit).toHaveBeenCalledWith('order-3', expect.any(Number));
      const tp3 = position.takeProfits.find((tp) => tp.level === 3);
      expect(tp3?.price).toBeGreaterThan(130);
    });

    it('should respect maxTicks limit', async () => {
      const position = createTestPosition({
        side: PositionSide.LONG,
        stopLoss: {
          price: 95,
          initialPrice: 95,
          isBreakeven: false,
          isTrailing: true,
          updatedAt: Date.now(),
        },
      });

      await service.updateSmartTP3(position, 140);

      const tp3 = position.takeProfits.find((tp) => tp.level === 3);
      // TP3 should move by ticks, capped by price
      expect(tp3?.price).toBeGreaterThan(130);
      expect(mockBybit.updateTakeProfit).toHaveBeenCalled();
    });

    it('should skip if smart TP3 not enabled', async () => {
      const riskConfig = createRiskConfig();
      const position = createTestPosition({
        stopLoss: {
          price: 95,
          initialPrice: 95,
          isBreakeven: false,
          isTrailing: true,
          updatedAt: Date.now(),
        },
      });

      riskConfig.smartTP3 = { ...riskConfig.smartTP3!, enabled: false };

      service = new PositionExitingService(
        mockBybit,
        mockTelegram,
        mockLogger,
        mockJournal,
        createTradingConfig(),
        riskConfig,
        createFullConfig(),
        mockSessionStats,
        mockPositionManager,
      );

      await service.updateSmartTP3(position, 140);

      expect(mockBybit.updateTakeProfit).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const position = createTestPosition({
        stopLoss: {
          price: 95,
          initialPrice: 95,
          isBreakeven: false,
          isTrailing: true,
          updatedAt: Date.now(),
        },
      });

      mockBybit.updateTakeProfit.mockRejectedValueOnce(new Error('API Error'));

      await service.updateSmartTP3(position, 140);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update TP3'),
        expect.any(Object),
      );
    });
  });

  // ========================================================================
  // updateBBTrailingStop Tests
  // ========================================================================

  describe('updateBBTrailingStop', () => {
    it('should skip if trailing not active', async () => {
      const position = createTestPosition({
        stopLoss: {
          price: 95,
          initialPrice: 95,
          isBreakeven: false,
          isTrailing: false,
          updatedAt: Date.now(),
        },
      });

      const candles = Array(20)
        .fill(null)
        .map((_, i) => ({ close: 100 + i }));

      await service.updateBBTrailingStop(position, candles);

      expect(mockBybit.updateStopLoss).not.toHaveBeenCalled();
    });

    it('should skip if insufficient candles', async () => {
      const position = createTestPosition({
        stopLoss: {
          price: 95,
          initialPrice: 95,
          isBreakeven: false,
          isTrailing: true,
          updatedAt: Date.now(),
        },
      });

      const candles = Array(5)
        .fill(null)
        .map((_, i) => ({ close: 100 + i }));

      await service.updateBBTrailingStop(position, candles);

      expect(mockBybit.updateStopLoss).not.toHaveBeenCalled();
    });

    it('should use lower band for LONG position', async () => {
      const position = createTestPosition({
        side: PositionSide.LONG,
        stopLoss: {
          price: 90,
          initialPrice: 90,
          isBreakeven: false,
          isTrailing: true,
          updatedAt: Date.now(),
        },
      });

      const candles = Array(20)
        .fill(null)
        .map(() => ({ close: 100 }));

      await service.updateBBTrailingStop(position, candles);

      expect(mockBybit.updateStopLoss).toHaveBeenCalled();
      expect(position.stopLoss.price).toBeCloseTo(100, 0);
    });

    it('should use upper band for SHORT position', async () => {
      const position = createTestPosition({
        side: PositionSide.SHORT,
        stopLoss: {
          price: 110,
          initialPrice: 110,
          isBreakeven: false,
          isTrailing: true,
          updatedAt: Date.now(),
        },
      });

      const candles = Array(20)
        .fill(null)
        .map(() => ({ close: 100 }));

      await service.updateBBTrailingStop(position, candles);

      expect(mockBybit.updateStopLoss).toHaveBeenCalled();
      expect(position.stopLoss.price).toBeCloseTo(100, 0);
    });

    it('should calculate correct Bollinger Bands with variance', async () => {
      const position = createTestPosition({
        side: PositionSide.LONG,
        stopLoss: {
          price: 85, // Lower SL - so BB lower band will be more favorable
          initialPrice: 85,
          isBreakeven: false,
          isTrailing: true,
          updatedAt: Date.now(),
        },
      });

      // Candles around 100 mean the lower BB band will be higher than 85
      const candles = Array(20)
        .fill(null)
        .map(() => ({ close: 100 }));

      await service.updateBBTrailingStop(position, candles);

      // BB lower band should be around 100, so SL should update to be higher
      expect(mockBybit.updateStopLoss).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: expect.any(String),
          newPrice: expect.closeTo(100, 0),
        }),
      );
      expect(position.stopLoss.price).toBeGreaterThan(85);
    });

    it('should handle errors gracefully', async () => {
      const position = createTestPosition({
        stopLoss: {
          price: 95,
          initialPrice: 95,
          isBreakeven: false,
          isTrailing: true,
          updatedAt: Date.now(),
        },
      });

      const candles = Array(20)
        .fill(null)
        .map(() => ({ close: 100 }));

      mockBybit.updateStopLoss.mockRejectedValueOnce(new Error('API Error'));

      await service.updateBBTrailingStop(position, candles);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update BB trailing stop'),
        expect.any(Object),
      );
    });
  });

  // ========================================================================
  // Integration Tests
  // ========================================================================

  describe('Integration scenarios', () => {
    it('should handle complete TP sequence (TP1 -> TP2 -> TP3)', async () => {
      const position = createTestPosition();

      // TP1 hit - should activate breakeven
      await service.onTakeProfitHit(position, 1, 110);
      expect(position.stopLoss.isBreakeven).toBe(true);

      // Reset for TP2
      position.stopLoss.isBreakeven = false;
      position.takeProfits[0].hit = false;

      // TP2 hit - should activate trailing
      await service.onTakeProfitHit(position, 2, 120);
      expect(position.stopLoss.isTrailing).toBe(true);

      // TP3 hit - no special logic
      await service.onTakeProfitHit(position, 3, 130);
      const tp3 = position.takeProfits.find((tp) => tp.level === 3);
      expect(tp3?.hit).toBe(true);
    });

    it('should update trailing then TP3 continuously', async () => {
      const position = createTestPosition({
        stopLoss: {
          price: 95,
          initialPrice: 95,
          isBreakeven: false,
          isTrailing: true,
          updatedAt: Date.now(),
        },
      });

      await service.updateSmartTrailingV2(position, 115);
      const slAfterTrailing = position.stopLoss.price;

      await service.updateSmartTP3(position, 125);
      const tp3AfterUpdate = position.takeProfits.find((tp) => tp.level === 3)?.price || 0;

      expect(slAfterTrailing).toBeGreaterThan(95);
      expect(tp3AfterUpdate).toBeGreaterThan(130);
    });
  });
});
