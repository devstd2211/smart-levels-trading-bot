/**
 * Tests for PositionExitingService
 *
 * Covers:
 * - executeExitAction() routing
 * - closePartialPosition()
 * - closeFullPosition()
 * - updateStopLoss()
 * - activateTrailingStop()
 * - recordPositionCloseInJournal()
 * - Error handling and edge cases
 */

import { PositionExitingService } from '../../services/position-exiting.service';
import { ExitActionDTO } from '../../types/architecture.types';
import {
  Position,
  PositionSide,
  TakeProfit,
  ExitType,
  ExitAction,
  RiskManagementConfig,
  TradingConfig,
  Config,
} from '../../types';

const createMockLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
});

const createMockBybitService = () => ({
  closePosition: jest.fn().mockResolvedValue(true),
  cancelAllConditionalOrders: jest.fn().mockResolvedValue(true),
  updateStopLoss: jest.fn().mockResolvedValue(true),
  placeTakeProfitLevels: jest.fn().mockResolvedValue(['TP1', 'TP2', 'TP3']),
  openPosition: jest.fn().mockResolvedValue('ORDER_123'),
});

const createMockTelegramService = () => ({
  sendAlert: jest.fn().mockResolvedValue(true),
  notifyPositionOpened: jest.fn().mockResolvedValue(true),
  notifyTakeProfitHit: jest.fn().mockResolvedValue(true),
});

const createMockJournalService = () => ({
  recordTradeOpen: jest.fn().mockResolvedValue(true),
  recordTradeClose: jest.fn().mockResolvedValue(true),
});

const createMockSessionStatsService = () => ({
  updateTradeExit: jest.fn().mockResolvedValue(true),
});

const createMockTakeProfitManager = () => ({
  recordPartialClose: jest.fn(),
  calculateFinalPnL: jest.fn().mockReturnValue({
    totalPnL: {
      pnlNet: 100,
      fees: 10,
    },
  }),
  getTpLevelsHit: jest.fn().mockReturnValue([1, 2]),
});

const createMockPositionManager = (takeProfitManager: any) => ({
  getTakeProfitManager: jest.fn().mockReturnValue(takeProfitManager),
});

const createMockTradingConfig = (): TradingConfig => ({
  leverage: 10,
  riskPercent: 2,
  maxPositions: 1,
  tradingCycleIntervalMs: 1000,
  orderType: 'LIMIT' as any,
  tradingFeeRate: 0.0002,
  favorableMovementThresholdPercent: 0.1,
});

const createMockRiskConfig = (): RiskManagementConfig => ({
  takeProfits: [
    { level: 1, percent: 5, sizePercent: 33 },
    { level: 2, percent: 10, sizePercent: 33 },
    { level: 3, percent: 15, sizePercent: 34 },
  ],
  stopLossPercent: 5,
  minStopLossPercent: 1.0,
  breakevenOffsetPercent: 0.3,
  trailingStopEnabled: true,
  trailingStopPercent: 2,
  trailingStopActivationLevel: 2,
  positionSizeUsdt: 100,
});

const createMockFullConfig = (): Config => ({
  exchange: { symbol: 'APEXUSDT' } as any,
  timeframes: {},
  trading: createMockTradingConfig(),
  strategies: {} as any,
  strategy: {} as any,
  indicators: {} as any,
  riskManagement: createMockRiskConfig(),
  logging: {} as any,
  system: {} as any,
  dataSubscriptions: { candles: { enabled: true, calculateIndicators: true }, orderbook: { enabled: false, updateIntervalMs: 5000 }, ticks: { enabled: false, calculateDelta: false } },
  entryConfig: {
    divergenceDetector: { minStrength: 0.3, priceDiffPercent: 0.2 },
    rsiPeriod: 14,
    rsiOversold: 30,
    rsiOverbought: 70,
    fastEmaPeriod: 9,
    slowEmaPeriod: 21,
    zigzagDepth: 2,
  },
  entryConfirmation: {} as any,
});

const createMockPosition = (overrides?: Partial<Position>): Position => ({
  id: 'APEXUSDT_Buy',
  journalId: 'APEXUSDT_Buy_123456',
  symbol: 'APEXUSDT',
  side: PositionSide.LONG,
  quantity: 10,
  entryPrice: 100,
  leverage: 10,
  marginUsed: 100,
  stopLoss: {
    price: 95,
    initialPrice: 95,
    orderId: undefined,
    isBreakeven: false,
    isTrailing: false,
    updatedAt: Date.now(),
  },
  takeProfits: [
    { level: 1, percent: 5, sizePercent: 33, price: 105, hit: false } as TakeProfit,
    { level: 2, percent: 10, sizePercent: 33, price: 110, hit: false } as TakeProfit,
    { level: 3, percent: 15, sizePercent: 34, price: 115, hit: false } as TakeProfit,
  ],
  openedAt: Date.now() - 60000, // 1 minute ago
  unrealizedPnL: 0,
  orderId: 'ORD_123',
  reason: 'Position opened',
  protectionVerifiedOnce: true,
  status: 'OPEN' as const,
  ...overrides,
});

describe('PositionExitingService', () => {
  let service: PositionExitingService;
  let mockLogger: any;
  let mockBybit: any;
  let mockTelegram: any;
  let mockJournal: any;
  let mockSessionStats: any;
  let mockTakeProfitManager: any;
  let mockPositionManager: any;
  let tradingConfig: TradingConfig;
  let riskConfig: RiskManagementConfig;
  let fullConfig: Config;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockBybit = createMockBybitService();
    mockTelegram = createMockTelegramService();
    mockJournal = createMockJournalService();
    mockSessionStats = createMockSessionStatsService();
    mockTakeProfitManager = createMockTakeProfitManager();
    mockPositionManager = createMockPositionManager(mockTakeProfitManager);
    tradingConfig = createMockTradingConfig();
    riskConfig = createMockRiskConfig();
    fullConfig = createMockFullConfig();

    service = new PositionExitingService(
      mockBybit,
      mockTelegram,
      mockLogger,
      mockJournal,
      tradingConfig,
      riskConfig,
      fullConfig,
      mockSessionStats,
      mockPositionManager,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeExitAction()', () => {
    it('should route CLOSE_PERCENT action to closePartialPosition', async () => {
      const position = createMockPosition();
      const action: ExitActionDTO = { action: ExitAction.CLOSE_PERCENT, percent: 50 };

      const result = await service.executeExitAction(
        position,
        action,
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(result).toBe(true);
      expect(mockBybit.closePosition).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: 'APEXUSDT_Buy',
          percentage: 50,
        })
      );
    });

    it('should route CLOSE_ALL action to closeFullPosition', async () => {
      const position = createMockPosition();
      const action: ExitActionDTO = { action: ExitAction.CLOSE_ALL };

      const result = await service.executeExitAction(
        position,
        action,
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(result).toBe(true);
      expect(mockBybit.closePosition).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: 'APEXUSDT_Buy',
          percentage: 100,
        })
      );
      expect(position.status).toBe('CLOSED');
    });

    it('should route UPDATE_SL action to updateStopLoss', async () => {
      const position = createMockPosition();
      const action: ExitActionDTO = { action: ExitAction.UPDATE_SL, newStopLoss: 101 };

      const result = await service.executeExitAction(
        position,
        action,
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(result).toBe(true);
      expect(mockBybit.updateStopLoss).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: 'APEXUSDT_Buy',
          newPrice: 101,
        })
      );
      expect(position.stopLoss.price).toBe(101);
    });

    it('should route ACTIVATE_TRAILING action to activateTrailingStop', async () => {
      const position = createMockPosition();
      const action: ExitActionDTO = { action: ExitAction.ACTIVATE_TRAILING, trailingPercent: 2 };

      const result = await service.executeExitAction(
        position,
        action,
        110,
        'TP2_HIT',
        ExitType.TAKE_PROFIT_2,
      );

      expect(result).toBe(true);
      expect(position.stopLoss.isTrailing).toBe(true);
    });

    it('should return false for unknown action', async () => {
      const position = createMockPosition();
      const action: ExitActionDTO = { action: 'UNKNOWN_ACTION' as any };

      const result = await service.executeExitAction(
        position,
        action,
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Unknown exit action', expect.any(Object));
    });

    it('should skip action if position already closed', async () => {
      const position = createMockPosition({ status: 'CLOSED' });
      const action: ExitActionDTO = { action: ExitAction.CLOSE_PERCENT, percent: 50 };

      const result = await service.executeExitAction(
        position,
        action,
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(result).toBe(false);
      expect(mockBybit.closePosition).not.toHaveBeenCalled();
    });

    it('should handle null position gracefully', async () => {
      const action: ExitActionDTO = { action: ExitAction.CLOSE_ALL };

      const result = await service.executeExitAction(
        null as any,
        action,
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('closePartialPosition()', () => {
    it('should close correct percentage and update quantity', async () => {
      const position = createMockPosition();

      const result = await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_PERCENT, percent: 50 },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(result).toBe(true);
      expect(mockBybit.closePosition).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: 'APEXUSDT_Buy',
          percentage: 50,
        })
      );
      expect(position.quantity).toBe(5); // 50% of 10
    });

    it('should close 25% correctly', async () => {
      const position = createMockPosition();

      await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_PERCENT, percent: 25 },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(mockBybit.closePosition).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: 'APEXUSDT_Buy',
          percentage: 25,
        })
      );
      expect(position.quantity).toBe(7.5);
    });

    it('should record partial close in TakeProfitManager', async () => {
      const position = createMockPosition();

      await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_PERCENT, percent: 50 },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      // Closing 50% of 10 = 5 quantity. Price 105 matches TP1 (level=1).
      expect(mockTakeProfitManager.recordPartialClose).toHaveBeenCalledWith(1, 5, 105);
    });

    it('should send Telegram alert on partial close', async () => {
      const position = createMockPosition();

      await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_PERCENT, percent: 50 },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(mockTelegram.sendAlert).toHaveBeenCalled();
    });

    it('should calculate PnL correctly for LONG partial close', async () => {
      const position = createMockPosition({
        side: PositionSide.LONG,
        quantity: 10,
        entryPrice: 100,
      });

      await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_PERCENT, percent: 50 },
        110, // +10 price
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      // Price diff = 10, quantity = 5, leverage = 10
      // pnlGross = 10 * 5 * 10 = 500
      expect(mockTelegram.sendAlert).toHaveBeenCalled();
      const callArg = mockTelegram.sendAlert.mock.calls[0][0];
      expect(callArg).toContain('Partial Close');
    });

    it('should handle exchange error gracefully', async () => {
      const position = createMockPosition();
      mockBybit.closePosition.mockRejectedValueOnce(new Error('Exchange error'));

      const result = await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_PERCENT, percent: 50 },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('closeFullPosition()', () => {
    it('should close entire position', async () => {
      const position = createMockPosition();

      const result = await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(result).toBe(true);
      expect(mockBybit.closePosition).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: 'APEXUSDT_Buy',
          percentage: 100,
        })
      );
      expect(position.status).toBe('CLOSED');
    });

    it('should mark position as CLOSED before async operations', async () => {
      const position = createMockPosition({ status: 'OPEN' });

      const result = await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(position.status).toBe('CLOSED');
    });

    it('should cancel conditional orders after close', async () => {
      const position = createMockPosition();

      await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(mockBybit.cancelAllConditionalOrders).toHaveBeenCalled();
    });

    it('should record in journal with full details', async () => {
      const position = createMockPosition();

      await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(mockJournal.recordTradeClose).toHaveBeenCalled();
    });

    it('should update session stats', async () => {
      const position = createMockPosition();

      await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(mockSessionStats.updateTradeExit).toHaveBeenCalledWith(
        position.journalId,
        expect.objectContaining({
          exitPrice: 105,
          pnl: expect.any(Number),
        }),
      );
    });

    it('should send exit notification', async () => {
      const position = createMockPosition();

      await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(mockTelegram.sendAlert).toHaveBeenCalled();
      const callArg = mockTelegram.sendAlert.mock.calls[0][0];
      expect(callArg).toContain('Position Closed');
    });

    it('should use TakeProfitManager PnL if available', async () => {
      const position = createMockPosition();

      await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        115,
        'TP3_HIT',
        ExitType.TAKE_PROFIT_3,
      );

      expect(mockTakeProfitManager.calculateFinalPnL).toHaveBeenCalled();
      expect(mockTakeProfitManager.getTpLevelsHit).toHaveBeenCalled();
    });

    it('should calculate simple PnL without TakeProfitManager', async () => {
      service = new PositionExitingService(
        mockBybit,
        mockTelegram,
        mockLogger,
        mockJournal,
        tradingConfig,
        riskConfig,
        fullConfig,
        mockSessionStats,
        undefined, // No TakeProfitManager
      );

      const position = createMockPosition();

      const result = await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(result).toBe(true);
      expect(mockJournal.recordTradeClose).toHaveBeenCalled();
    });

    it('should handle close of already closed position gracefully', async () => {
      const position = createMockPosition({ status: 'CLOSED' });

      const result = await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(result).toBe(false);
      expect(mockBybit.closePosition).not.toHaveBeenCalled();
    });

    it('should handle cancellation failure gracefully', async () => {
      const position = createMockPosition();
      mockBybit.cancelAllConditionalOrders.mockRejectedValueOnce(new Error('Cancel failed'));

      const result = await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(result).toBe(true); // Should still succeed
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should skip session stats update without journalId', async () => {
      const position = createMockPosition({ journalId: undefined });

      await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(mockSessionStats.updateTradeExit).not.toHaveBeenCalled();
    });
  });

  describe('updateStopLoss()', () => {
    it('should update SL to higher price for LONG position', async () => {
      const position = createMockPosition({
        side: PositionSide.LONG,
        stopLoss: { ...createMockPosition().stopLoss, price: 95 },
      });

      const result = await service.executeExitAction(
        position,
        { action: ExitAction.UPDATE_SL, newStopLoss: 101 },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(result).toBe(true);
      expect(mockBybit.updateStopLoss).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: 'APEXUSDT_Buy',
          newPrice: 101,
        })
      );
      expect(position.stopLoss.price).toBe(101);
    });

    it('should update SL to lower price for SHORT position', async () => {
      const position = createMockPosition({
        side: PositionSide.SHORT,
        stopLoss: { ...createMockPosition().stopLoss, price: 105 },
      });

      const result = await service.executeExitAction(
        position,
        { action: ExitAction.UPDATE_SL, newStopLoss: 99 },
        95,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(result).toBe(true);
      expect(mockBybit.updateStopLoss).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: 'APEXUSDT_Buy',
          newPrice: 99,
        })
      );
      expect(position.stopLoss.price).toBe(99);
    });

    it('should reject unfavorable SL update for LONG (lower price)', async () => {
      const position = createMockPosition({
        side: PositionSide.LONG,
        stopLoss: { ...createMockPosition().stopLoss, price: 95 },
      });

      const result = await service.executeExitAction(
        position,
        { action: ExitAction.UPDATE_SL, newStopLoss: 90 },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(result).toBe(false);
      expect(mockBybit.updateStopLoss).not.toHaveBeenCalled();
    });

    it('should reject unfavorable SL update for SHORT (higher price)', async () => {
      const position = createMockPosition({
        side: PositionSide.SHORT,
        stopLoss: { ...createMockPosition().stopLoss, price: 105 },
      });

      const result = await service.executeExitAction(
        position,
        { action: ExitAction.UPDATE_SL, newStopLoss: 110 },
        95,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(result).toBe(false);
      expect(mockBybit.updateStopLoss).not.toHaveBeenCalled();
    });

    it('should update timestamp on SL change', async () => {
      const position = createMockPosition();
      const beforeTime = position.stopLoss.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));

      await service.executeExitAction(
        position,
        { action: ExitAction.UPDATE_SL, newStopLoss: 101 },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(position.stopLoss.updatedAt).toBeGreaterThan(beforeTime);
    });

    it('should handle exchange error gracefully', async () => {
      const position = createMockPosition();
      mockBybit.updateStopLoss.mockRejectedValueOnce(new Error('Exchange error'));

      const result = await service.executeExitAction(
        position,
        { action: ExitAction.UPDATE_SL, newStopLoss: 101 },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('activateTrailingStop()', () => {
    it('should activate trailing stop for LONG position', async () => {
      const position = createMockPosition({
        side: PositionSide.LONG,
        stopLoss: { ...createMockPosition().stopLoss, isTrailing: false },
      });

      const result = await service.executeExitAction(
        position,
        { action: ExitAction.ACTIVATE_TRAILING, trailingPercent: 2 },
        110,
        'TP2_HIT',
        ExitType.TAKE_PROFIT_2,
      );

      expect(result).toBe(true);
      expect(position.stopLoss.isTrailing).toBe(true);
      expect(position.stopLoss.price).toBe(108); // 110 - 2
    });

    it('should activate trailing stop for SHORT position', async () => {
      const position = createMockPosition({
        side: PositionSide.SHORT,
        stopLoss: { ...createMockPosition().stopLoss, isTrailing: false },
      });

      const result = await service.executeExitAction(
        position,
        { action: ExitAction.ACTIVATE_TRAILING, trailingPercent: 2 },
        90,
        'TP2_HIT',
        ExitType.TAKE_PROFIT_2,
      );

      expect(result).toBe(true);
      expect(position.stopLoss.isTrailing).toBe(true);
      expect(position.stopLoss.price).toBe(92); // 90 + 2
    });

    it('should update trailing timestamp', async () => {
      const position = createMockPosition();
      const beforeTime = position.stopLoss.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));

      await service.executeExitAction(
        position,
        { action: ExitAction.ACTIVATE_TRAILING, trailingPercent: 2 },
        110,
        'TP2_HIT',
        ExitType.TAKE_PROFIT_2,
      );

      expect(position.stopLoss.updatedAt).toBeGreaterThan(beforeTime);
    });

    it('should handle exchange error gracefully', async () => {
      const position = createMockPosition();
      mockBybit.updateStopLoss.mockRejectedValueOnce(new Error('Exchange error'));

      const result = await service.executeExitAction(
        position,
        { action: ExitAction.ACTIVATE_TRAILING, trailingPercent: 2 },
        110,
        'TP2_HIT',
        ExitType.TAKE_PROFIT_2,
      );

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('recordPositionCloseInJournal()', () => {
    it('should skip recording without journalId', async () => {
      const position = createMockPosition({ journalId: undefined });

      await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(mockJournal.recordTradeClose).not.toHaveBeenCalled();
    });

    it('should record with complete exit details', async () => {
      const position = createMockPosition();

      await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(mockJournal.recordTradeClose).toHaveBeenCalledWith(
        expect.objectContaining({
          id: position.journalId,
          exitPrice: 105,
          exitCondition: expect.objectContaining({
            exitType: ExitType.TAKE_PROFIT_1,
            price: 105,
            reason: 'TP1_HIT',
          }),
        }),
      );
    });

    it('should calculate holding time in minutes and hours', async () => {
      const position = createMockPosition({
        openedAt: Date.now() - 3600000, // 1 hour ago
      });

      await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(mockJournal.recordTradeClose).toHaveBeenCalledWith(
        expect.objectContaining({
          exitCondition: expect.objectContaining({
            holdingTimeMs: expect.any(Number),
            holdingTimeMinutes: expect.any(Number),
            holdingTimeHours: expect.any(Number),
          }),
        }),
      );
    });

    it('should mark stoppedOut true for STOP_LOSS exits', async () => {
      const position = createMockPosition();

      await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        94,
        'SL_HIT',
        ExitType.STOP_LOSS,
      );

      expect(mockJournal.recordTradeClose).toHaveBeenCalledWith(
        expect.objectContaining({
          exitCondition: expect.objectContaining({
            stoppedOut: true,
          }),
        }),
      );
    });

    it('should record breakeven SL movement', async () => {
      const position = createMockPosition({
        stopLoss: { ...createMockPosition().stopLoss, isBreakeven: true },
      });

      await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(mockJournal.recordTradeClose).toHaveBeenCalledWith(
        expect.objectContaining({
          exitCondition: expect.objectContaining({
            slMovedToBreakeven: true,
          }),
        }),
      );
    });

    it('should record trailing stop activation', async () => {
      const position = createMockPosition({
        stopLoss: { ...createMockPosition().stopLoss, isTrailing: true },
      });

      await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        115,
        'TP3_HIT',
        ExitType.TAKE_PROFIT_3,
      );

      expect(mockJournal.recordTradeClose).toHaveBeenCalledWith(
        expect.objectContaining({
          exitCondition: expect.objectContaining({
            trailingStopActivated: true,
          }),
        }),
      );
    });

    it('should track TP levels hit', async () => {
      const position = createMockPosition();

      await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        115,
        'TP3_HIT',
        ExitType.TAKE_PROFIT_3,
      );

      expect(mockJournal.recordTradeClose).toHaveBeenCalledWith(
        expect.objectContaining({
          exitCondition: expect.objectContaining({
            tpLevelsHit: expect.any(Array),
            tpLevelsHitCount: expect.any(Number),
          }),
        }),
      );
    });

    it('should handle journal recording error gracefully', async () => {
      const position = createMockPosition();
      mockJournal.recordTradeClose.mockRejectedValueOnce(new Error('Journal error'));

      const result = await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(result).toBe(true); // Close still succeeds
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle SHORT position close correctly', async () => {
      const position = createMockPosition({
        side: PositionSide.SHORT,
        quantity: 10,
        entryPrice: 100,
        stopLoss: { ...createMockPosition().stopLoss, price: 105 },
      });

      const result = await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        95, // Price went down (profitable for SHORT)
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(result).toBe(true);
      expect(mockBybit.closePosition).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: 'APEXUSDT_Buy',
          percentage: 100,
        })
      );
    });

    it('should handle very small position sizes', async () => {
      const position = createMockPosition({ quantity: 0.001 });

      const result = await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_PERCENT, percent: 50 },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );

      expect(result).toBe(true);
      expect(position.quantity).toBeCloseTo(0.0005, 5);
    });

    it('should handle large price movements without errors', async () => {
      const position = createMockPosition({ entryPrice: 100 });

      const result = await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        200, // 100% gain
        'TP3_HIT',
        ExitType.TAKE_PROFIT_3,
      );

      expect(result).toBe(true);
    });

    it('should handle negative price differences gracefully', async () => {
      const position = createMockPosition({ entryPrice: 100 });

      const result = await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        50, // 50% loss
        'SL_HIT',
        ExitType.STOP_LOSS,
      );

      expect(result).toBe(true);
      expect(position.status).toBe('CLOSED');
    });

    it('should handle sequential exit actions', async () => {
      const position = createMockPosition();

      // First: Close 50%
      let result = await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_PERCENT, percent: 50 },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );
      expect(result).toBe(true);
      expect(position.quantity).toBe(5);

      // Then: Update SL
      result = await service.executeExitAction(
        position,
        { action: ExitAction.UPDATE_SL, newStopLoss: 101 },
        105,
        'TP1_HIT',
        ExitType.TAKE_PROFIT_1,
      );
      expect(result).toBe(true);

      // Finally: Close remaining
      result = await service.executeExitAction(
        position,
        { action: ExitAction.CLOSE_ALL },
        110,
        'TP2_HIT',
        ExitType.TAKE_PROFIT_2,
      );
      expect(result).toBe(true);
      expect(position.status).toBe('CLOSED');
    });
  });
});
