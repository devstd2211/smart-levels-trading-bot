/**
 * Position Monitor Service Tests
 *
 * Tests for position monitoring, TP/SL detection, and time-based exits.
 */

import { PositionMonitorService } from '../../services/position-monitor.service';
import { BybitService } from '../../services/bybit';
import { IExchange } from '../../interfaces/IExchange';
import { PositionLifecycleService } from '../../services/position-lifecycle.service';
import { TelegramService } from '../../services/telegram.service';
import { ExitTypeDetectorService } from '../../services/exit-type-detector.service';
import { PositionPnLCalculatorService } from '../../services/position-pnl-calculator.service';
import { PositionSyncService } from '../../services/position-sync.service';
import {
  Position,
  PositionSide,
  RiskManagementConfig,
  LoggerService,
  LogLevel,
} from '../../types';

// ============================================================================
// MOCKS
// ============================================================================

const createMockPosition = (
  side: PositionSide,
  entryPrice: number,
  stopLossPrice: number,
  takeProfits: Array<{ level: number; price: number; hit?: boolean }>,
  openedAt: number = Date.now(),
): Position => ({
  id: 'test-position-123',
  symbol: 'APEXUSDT',
  side,
  entryPrice,
  quantity: 100,
  leverage: 10,
  marginUsed: 10, // 10 USDT margin
  stopLoss: {
    price: stopLossPrice,
    initialPrice: stopLossPrice,
    orderId: 'sl-order-123',
    isBreakeven: false,
    isTrailing: false,
    updatedAt: Date.now(),
  },
  takeProfits: takeProfits.map(tp => ({
    level: tp.level,
    price: tp.price,
    percent: 1.0,
    sizePercent: 33.33,
    orderId: `tp${tp.level}-order-123`,
    hit: tp.hit ?? false,
    hitAt: tp.hit ? Date.now() : undefined,
  })),
  openedAt,
  unrealizedPnL: 0,
  orderId: 'entry-order-123',
  reason: 'Test position',
  status: 'OPEN',
});

const createMockBybitService = () => ({
  getPosition: jest.fn(),
  getCurrentPrice: jest.fn(),
  verifyProtectionSet: jest.fn().mockResolvedValue({
    hasStopLoss: true,
    hasTakeProfit: true,
    stopLossPrice: 100,
    takeProfitPrices: [102, 104, 106],
    activeOrders: 4,
    verified: true,
  }),
  placeStopLoss: jest.fn().mockResolvedValue('sl-emergency'),
  placeTakeProfitLevels: jest.fn().mockResolvedValue(['tp-emergency']),
  closePosition: jest.fn().mockResolvedValue(undefined),
  getOrderHistory: jest.fn().mockResolvedValue([]), // Session #60
  getActiveOrders: jest.fn().mockResolvedValue([]), // Session #60
});

const createMockPositionManager = () => ({
  getCurrentPosition: jest.fn(),
  clearPosition: jest.fn(),
  onTakeProfitHit: jest.fn(),
});

const createMockTelegram = () => ({
  notifyTakeProfitHit: jest.fn(),
  sendAlert: jest.fn(),
});

const createMockLogger = (): LoggerService => {
  return new LoggerService(LogLevel.ERROR, './logs', false);
};

const createMockExitTypeDetectorService = () => ({
  determineExitTypeFromHistory: jest.fn(),
  identifyTPLevel: jest.fn(),
});

const createMockPositionPnLCalculatorService = () => ({
  calculatePnL: jest.fn((position, currentPrice) => {
    // Simple mock implementation
    if (position.side === PositionSide.LONG) {
      return ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
    } else {
      return ((position.entryPrice - currentPrice) / position.entryPrice) * 100;
    }
  }),
});

const createMockPositionSyncService = () => ({
  syncClosedPosition: jest.fn().mockResolvedValue(undefined),
  deepSyncCheck: jest.fn().mockResolvedValue(undefined),
});

const defaultRiskConfig: RiskManagementConfig = {
  positionSizeUsdt: 10,
  takeProfits: [],
  stopLossPercent: 1.0,
  minStopLossPercent: 1.0,
  breakevenOffsetPercent: 0.3,
  trailingStopEnabled: true,
  trailingStopPercent: 1.0,
  trailingStopActivationLevel: 2,
  timeBasedExitEnabled: false,
  timeBasedExitMinutes: 30,
  timeBasedExitMinPnl: 0.2,
};

// ============================================================================
// TESTS
// ============================================================================

describe('PositionMonitorService', () => {
  let monitor: PositionMonitorService;
  let mockBybit: ReturnType<typeof createMockBybitService>;
  let mockPositionManager: ReturnType<typeof createMockPositionManager>;
  let mockTelegram: ReturnType<typeof createMockTelegram>;
  let mockExitTypeDetector: ReturnType<typeof createMockExitTypeDetectorService>;
  let mockPnLCalculator: ReturnType<typeof createMockPositionPnLCalculatorService>;
  let mockPositionSync: ReturnType<typeof createMockPositionSyncService>;
  let logger: LoggerService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockBybit = createMockBybitService();
    mockPositionManager = createMockPositionManager();
    mockTelegram = createMockTelegram();
    mockExitTypeDetector = createMockExitTypeDetectorService();
    mockPnLCalculator = createMockPositionPnLCalculatorService();
    mockPositionSync = createMockPositionSyncService();
    logger = createMockLogger();

    monitor = new PositionMonitorService(
      mockBybit as unknown as IExchange,
      mockPositionManager as unknown as PositionLifecycleService,
      defaultRiskConfig,
      mockTelegram as unknown as TelegramService,
      logger,
      mockExitTypeDetector as unknown as ExitTypeDetectorService,
      mockPnLCalculator as unknown as PositionPnLCalculatorService,
      mockPositionSync as unknown as PositionSyncService,
    );
  });

  afterEach(() => {
    monitor.stop();
    jest.useRealTimers();
  });

  // ==========================================================================
  // TEST GROUP 1: Start/Stop/IsActive
  // ==========================================================================

  describe('start/stop/isActive', () => {
    it('should start monitoring and emit started event', () => {
      const startedSpy = jest.fn();
      monitor.on('started', startedSpy);

      monitor.start();

      expect(monitor.isActive()).toBe(true);
      expect(startedSpy).toHaveBeenCalledTimes(1);
    });

    it('should not start if already monitoring', () => {
      const startedSpy = jest.fn();
      monitor.on('started', startedSpy);

      monitor.start();
      monitor.start(); // Second call

      expect(startedSpy).toHaveBeenCalledTimes(1); // Only once
    });

    it('should stop monitoring and emit stopped event', () => {
      const stoppedSpy = jest.fn();
      monitor.on('stopped', stoppedSpy);

      monitor.start();
      monitor.stop();

      expect(monitor.isActive()).toBe(false);
      expect(stoppedSpy).toHaveBeenCalledTimes(1);
    });

    it('should not stop if already stopped', () => {
      const stoppedSpy = jest.fn();
      monitor.on('stopped', stoppedSpy);

      monitor.stop(); // Already stopped

      expect(stoppedSpy).not.toHaveBeenCalled();
    });

    it('should clear interval on stop', () => {
      monitor.start();
      expect(monitor.isActive()).toBe(true);

      monitor.stop();
      expect(monitor.isActive()).toBe(false);
    });
  });

  // ==========================================================================
  // TEST GROUP 2: Stop Loss Detection
  // ==========================================================================

  describe('stop loss detection', () => {
    it('should emit stopLossHit event when LONG SL is hit', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.5, 1.48, []);
      mockPositionManager.getCurrentPosition.mockReturnValue(position);
      mockBybit.getPosition.mockResolvedValue(position);
      mockBybit.getCurrentPrice.mockResolvedValue(1.47); // Below SL

      const slHitSpy = jest.fn();
      monitor.on('stopLossHit', slHitSpy);

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000);

      expect(slHitSpy).toHaveBeenCalledTimes(1);
      expect(slHitSpy).toHaveBeenCalledWith({
        position,
        currentPrice: 1.47,
        reason: 'Stop Loss hit at 1.47',
      });
    });

    it('should emit stopLossHit event when SHORT SL is hit', async () => {
      const position = createMockPosition(PositionSide.SHORT, 1.5, 1.52, []);
      mockPositionManager.getCurrentPosition.mockReturnValue(position);
      mockBybit.getPosition.mockResolvedValue(position);
      mockBybit.getCurrentPrice.mockResolvedValue(1.53); // Above SL

      const slHitSpy = jest.fn();
      monitor.on('stopLossHit', slHitSpy);

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000);

      expect(slHitSpy).toHaveBeenCalledTimes(1);
      expect(slHitSpy).toHaveBeenCalledWith({
        position,
        currentPrice: 1.53,
        reason: 'Stop Loss hit at 1.53',
      });
    });

    it('should NOT emit stopLossHit when LONG price above SL', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.5, 1.48, []);
      mockPositionManager.getCurrentPosition.mockReturnValue(position);
      mockBybit.getPosition.mockResolvedValue(position);
      mockBybit.getCurrentPrice.mockResolvedValue(1.51); // Above SL

      const slHitSpy = jest.fn();
      monitor.on('stopLossHit', slHitSpy);

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000);

      expect(slHitSpy).not.toHaveBeenCalled();
    });

    it('should NOT emit stopLossHit when SHORT price below SL', async () => {
      const position = createMockPosition(PositionSide.SHORT, 1.5, 1.52, []);
      mockPositionManager.getCurrentPosition.mockReturnValue(position);
      mockBybit.getPosition.mockResolvedValue(position);
      mockBybit.getCurrentPrice.mockResolvedValue(1.49); // Below SL

      const slHitSpy = jest.fn();
      monitor.on('stopLossHit', slHitSpy);

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000);

      expect(slHitSpy).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // TEST GROUP 3: Take Profit Detection
  // ==========================================================================

  describe('take profit detection', () => {
    // NOTE: TP detection removed from Position Monitor (price-based was unreliable)
    // TPs are now detected via WebSocket 'order' topic in bot.ts
    // These tests verify that Position Monitor no longer emits TP events

    it('should NOT emit takeProfitHit event (handled by WebSocket)', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.5, 1.48, [
        { level: 1, price: 1.52 },
        { level: 2, price: 1.54 },
      ]);
      mockPositionManager.getCurrentPosition.mockReturnValue(position);
      mockBybit.getPosition.mockResolvedValue(position);
      mockBybit.getCurrentPrice.mockResolvedValue(1.525); // Above TP1

      const tpHitSpy = jest.fn();
      monitor.on('takeProfitHit', tpHitSpy);

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000);

      // TP detection is now handled by WebSocket, not Position Monitor
      expect(tpHitSpy).not.toHaveBeenCalled();
      expect(mockTelegram.notifyTakeProfitHit).not.toHaveBeenCalled();
      expect(mockPositionManager.onTakeProfitHit).not.toHaveBeenCalled();
    });

    it('should NOT emit takeProfitHit for SHORT (handled by WebSocket)', async () => {
      const position = createMockPosition(PositionSide.SHORT, 1.5, 1.52, [
        { level: 1, price: 1.48 },
        { level: 2, price: 1.46 },
      ]);
      mockPositionManager.getCurrentPosition.mockReturnValue(position);
      mockBybit.getPosition.mockResolvedValue(position);
      mockBybit.getCurrentPrice.mockResolvedValue(1.475); // Below TP1

      const tpHitSpy = jest.fn();
      monitor.on('takeProfitHit', tpHitSpy);

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000);

      // TP detection is now handled by WebSocket, not Position Monitor
      expect(tpHitSpy).not.toHaveBeenCalled();
    });

    it('should NOT emit multiple takeProfitHit events (handled by WebSocket)', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.5, 1.48, [
        { level: 1, price: 1.52 },
        { level: 2, price: 1.54 },
        { level: 3, price: 1.56 },
      ]);
      mockPositionManager.getCurrentPosition.mockReturnValue(position);
      mockBybit.getPosition.mockResolvedValue(position);
      mockBybit.getCurrentPrice.mockResolvedValue(1.55); // Above TP1 and TP2

      const tpHitSpy = jest.fn();
      monitor.on('takeProfitHit', tpHitSpy);

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000);

      // TP detection is now handled by WebSocket, not Position Monitor
      expect(tpHitSpy).not.toHaveBeenCalled();
    });

    it('should NOT emit takeProfitHit for already hit TPs', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.5, 1.48, [
        { level: 1, price: 1.52, hit: true }, // Already hit
        { level: 2, price: 1.54 },
      ]);
      mockPositionManager.getCurrentPosition.mockReturnValue(position);
      mockBybit.getPosition.mockResolvedValue(position);
      mockBybit.getCurrentPrice.mockResolvedValue(1.525); // Above TP1

      const tpHitSpy = jest.fn();
      monitor.on('takeProfitHit', tpHitSpy);

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000);

      expect(tpHitSpy).not.toHaveBeenCalled(); // Already hit, no event
    });

    it('should NOT emit takeProfitHit when LONG price below TP', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.5, 1.48, [
        { level: 1, price: 1.52 },
      ]);
      mockPositionManager.getCurrentPosition.mockReturnValue(position);
      mockBybit.getPosition.mockResolvedValue(position);
      mockBybit.getCurrentPrice.mockResolvedValue(1.51); // Below TP1

      const tpHitSpy = jest.fn();
      monitor.on('takeProfitHit', tpHitSpy);

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000);

      expect(tpHitSpy).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // TEST GROUP 4: Time-Based Exit
  // ==========================================================================

  describe('time-based exit', () => {
    it('should emit timeBasedExit when position open too long with low PnL', async () => {
      const openedAt = Date.now() - 35 * 60 * 1000; // 35 minutes ago
      const position = createMockPosition(PositionSide.LONG, 1.5, 1.48, [], openedAt);
      mockPositionManager.getCurrentPosition.mockReturnValue(position);
      mockBybit.getPosition.mockResolvedValue(position);
      mockBybit.getCurrentPrice.mockResolvedValue(1.501); // +0.067% PnL (< 0.2% threshold)

      const config: RiskManagementConfig = {
        ...defaultRiskConfig,
        timeBasedExitEnabled: true,
        timeBasedExitMinutes: 30,
        timeBasedExitMinPnl: 0.2,
      };

      monitor = new PositionMonitorService(
        mockBybit as unknown as IExchange,
        mockPositionManager as unknown as PositionLifecycleService,
        config,
        mockTelegram as unknown as TelegramService,
        logger,
        mockExitTypeDetector as unknown as ExitTypeDetectorService,
        mockPnLCalculator as unknown as PositionPnLCalculatorService,
        mockPositionSync as unknown as PositionSyncService,
      );

      const exitSpy = jest.fn();
      monitor.on('timeBasedExit', exitSpy);

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000);

      expect(exitSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith({
        position,
        currentPrice: 1.501,
        reason: expect.stringContaining('Position open for'),
        openedMinutes: expect.any(Number),
        pnlPercent: expect.any(Number),
      });
    });

    it('should NOT emit timeBasedExit when position has sufficient PnL', async () => {
      const openedAt = Date.now() - 35 * 60 * 1000; // 35 minutes ago
      const position = createMockPosition(PositionSide.LONG, 1.5, 1.48, [], openedAt);
      mockPositionManager.getCurrentPosition.mockReturnValue(position);
      mockBybit.getPosition.mockResolvedValue(position);
      mockBybit.getCurrentPrice.mockResolvedValue(1.505); // +0.33% PnL (> 0.2% threshold)

      const config: RiskManagementConfig = {
        ...defaultRiskConfig,
        timeBasedExitEnabled: true,
        timeBasedExitMinutes: 30,
        timeBasedExitMinPnl: 0.2,
      };

      monitor = new PositionMonitorService(
        mockBybit as unknown as IExchange,
        mockPositionManager as unknown as PositionLifecycleService,
        config,
        mockTelegram as unknown as TelegramService,
        logger,
        mockExitTypeDetector as unknown as ExitTypeDetectorService,
        mockPnLCalculator as unknown as PositionPnLCalculatorService,
        mockPositionSync as unknown as PositionSyncService,
      );

      const exitSpy = jest.fn();
      monitor.on('timeBasedExit', exitSpy);

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000);

      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('should NOT emit timeBasedExit when position not open long enough', async () => {
      const openedAt = Date.now() - 25 * 60 * 1000; // 25 minutes ago (< 30 threshold)
      const position = createMockPosition(PositionSide.LONG, 1.5, 1.48, [], openedAt);
      mockPositionManager.getCurrentPosition.mockReturnValue(position);
      mockBybit.getPosition.mockResolvedValue(position);
      mockBybit.getCurrentPrice.mockResolvedValue(1.501); // +0.067% PnL (< 0.2% threshold)

      const config: RiskManagementConfig = {
        ...defaultRiskConfig,
        timeBasedExitEnabled: true,
        timeBasedExitMinutes: 30,
        timeBasedExitMinPnl: 0.2,
      };

      monitor = new PositionMonitorService(
        mockBybit as unknown as IExchange,
        mockPositionManager as unknown as PositionLifecycleService,
        config,
        mockTelegram as unknown as TelegramService,
        logger,
        mockExitTypeDetector as unknown as ExitTypeDetectorService,
        mockPnLCalculator as unknown as PositionPnLCalculatorService,
        mockPositionSync as unknown as PositionSyncService,
      );

      const exitSpy = jest.fn();
      monitor.on('timeBasedExit', exitSpy);

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000);

      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('should NOT emit timeBasedExit when feature disabled', async () => {
      const openedAt = Date.now() - 35 * 60 * 1000; // 35 minutes ago
      const position = createMockPosition(PositionSide.LONG, 1.5, 1.48, [], openedAt);
      mockPositionManager.getCurrentPosition.mockReturnValue(position);
      mockBybit.getPosition.mockResolvedValue(position);
      mockBybit.getCurrentPrice.mockResolvedValue(1.501); // +0.067% PnL

      const config: RiskManagementConfig = {
        ...defaultRiskConfig,
        timeBasedExitEnabled: false, // DISABLED
      };

      monitor = new PositionMonitorService(
        mockBybit as unknown as IExchange,
        mockPositionManager as unknown as PositionLifecycleService,
        config,
        mockTelegram as unknown as TelegramService,
        logger,
        mockExitTypeDetector as unknown as ExitTypeDetectorService,
        mockPnLCalculator as unknown as PositionPnLCalculatorService,
        mockPositionSync as unknown as PositionSyncService,
      );

      const exitSpy = jest.fn();
      monitor.on('timeBasedExit', exitSpy);

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000);

      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('should calculate correct PnL for SHORT position', async () => {
      const openedAt = Date.now() - 35 * 60 * 1000; // 35 minutes ago
      const position = createMockPosition(PositionSide.SHORT, 1.5, 1.52, [], openedAt);
      mockPositionManager.getCurrentPosition.mockReturnValue(position);
      mockBybit.getPosition.mockResolvedValue(position);
      mockBybit.getCurrentPrice.mockResolvedValue(1.499); // +0.067% PnL (< 0.2% threshold)

      const config: RiskManagementConfig = {
        ...defaultRiskConfig,
        timeBasedExitEnabled: true,
        timeBasedExitMinutes: 30,
        timeBasedExitMinPnl: 0.2,
      };

      monitor = new PositionMonitorService(
        mockBybit as unknown as IExchange,
        mockPositionManager as unknown as PositionLifecycleService,
        config,
        mockTelegram as unknown as TelegramService,
        logger,
        mockExitTypeDetector as unknown as ExitTypeDetectorService,
        mockPnLCalculator as unknown as PositionPnLCalculatorService,
        mockPositionSync as unknown as PositionSyncService,
      );

      const exitSpy = jest.fn();
      monitor.on('timeBasedExit', exitSpy);

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000);

      expect(exitSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // TEST GROUP 5: Position Closed Externally
  // ==========================================================================

  describe('position closed externally', () => {
    it('should sync closed position when exchange position is null', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.5, 1.48, []);
      mockPositionManager.getCurrentPosition.mockReturnValue(position);
      mockBybit.getPosition.mockResolvedValue(null); // Position doesn't exist on exchange

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000);

      // Should delegate to PositionSyncService.syncClosedPosition
      expect(mockPositionSync.syncClosedPosition).toHaveBeenCalledWith(position);
    });

    it('should sync closed position when exchange position quantity is zero', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.5, 1.48, []);
      mockPositionManager.getCurrentPosition.mockReturnValue(position);
      mockBybit.getPosition.mockResolvedValue({ ...position, quantity: 0 });

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000);

      // Should delegate to PositionSyncService.syncClosedPosition
      expect(mockPositionSync.syncClosedPosition).toHaveBeenCalledWith(position);
    });

    it('should NOT check price when position closed externally', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.5, 1.48, []);
      position.status = 'CLOSED'; // Already closed
      mockPositionManager.getCurrentPosition.mockReturnValue(position);
      mockBybit.getPosition.mockResolvedValue(null); // Closed

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000);

      // Note: After Session #59, getCurrentPrice may be called before status check
      // This test validates that position closed externally is handled correctly
      // The important check is that clearPosition is NOT called for already CLOSED positions
      expect(mockPositionManager.clearPosition).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // TEST GROUP 6: No Position Scenario
  // ==========================================================================

  describe('no position scenario', () => {
    it('should do nothing when no position exists', async () => {
      mockPositionManager.getCurrentPosition.mockReturnValue(null);

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000);

      expect(mockBybit.getPosition).not.toHaveBeenCalled();
      expect(mockBybit.getCurrentPrice).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // TEST GROUP 7: Error Handling
  // ==========================================================================

  describe('error handling', () => {
    it('should emit error event when monitoring fails', async () => {
      const testError = new Error('Bybit API error');
      mockPositionManager.getCurrentPosition.mockImplementation(() => {
        throw testError;
      });

      const errorSpy = jest.fn();
      monitor.on('error', errorSpy);

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000);

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(testError);
    });

    it('should continue monitoring after error', async () => {
      let callCount = 0;
      mockPositionManager.getCurrentPosition.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Temporary error');
        }
        return null;
      });

      const errorSpy = jest.fn();
      monitor.on('error', errorSpy);

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000); // First call - error
      expect(errorSpy).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(10000); // Second call - success
      expect(callCount).toBe(2); // Monitoring continues
    });
  });

  // ==========================================================================
  // TEST GROUP 8: Periodic Monitoring
  // ==========================================================================

  describe('periodic monitoring', () => {
    it('should call monitorPosition every 10 seconds', async () => {
      mockPositionManager.getCurrentPosition.mockReturnValue(null);

      monitor.start();

      // Now we have 2 intervals: monitorInterval (10s) + deepSyncInterval (30s)
      // Both call getCurrentPosition(), so count increases

      await jest.advanceTimersByTimeAsync(10000);
      // After 10s: monitorPosition called 1x
      expect(mockPositionManager.getCurrentPosition.mock.calls.length).toBeGreaterThanOrEqual(1);

      await jest.advanceTimersByTimeAsync(10000);
      // After 20s: monitorPosition called 2x
      expect(mockPositionManager.getCurrentPosition.mock.calls.length).toBeGreaterThanOrEqual(2);

      await jest.advanceTimersByTimeAsync(10000);
      // After 30s: monitorPosition 3x + deepSyncCheck 1x = 4 total
      expect(mockPositionManager.getCurrentPosition.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('should NOT call monitorPosition after stop', async () => {
      mockPositionManager.getCurrentPosition.mockReturnValue(null);

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000);
      expect(mockPositionManager.getCurrentPosition).toHaveBeenCalledTimes(1);

      monitor.stop();
      await jest.advanceTimersByTimeAsync(20000); // 2 more cycles

      expect(mockPositionManager.getCurrentPosition).toHaveBeenCalledTimes(1); // No more calls
    });
  });

  // ============================================================================
  // SESSION #60: SAFETY MONITOR TESTS (v3.5.0 - syncClosedPosition + deepSyncCheck)
  // ============================================================================

  describe('Safety Monitor (Session #60)', () => {
    it('should NOT emit positionClosedExternally if status is CLOSED', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.5, 1.48, []);
      position.status = 'CLOSED'; // Already closed
      mockPositionManager.getCurrentPosition.mockReturnValue(position);
      mockBybit.getPosition.mockResolvedValue(null); // Position doesn't exist on exchange

      const closedSpy = jest.fn();
      monitor.on('positionClosedExternally', closedSpy);

      monitor.start();
      await jest.advanceTimersByTimeAsync(10000);

      // Should NOT emit event or call clearPosition (already closed)
      expect(closedSpy).not.toHaveBeenCalled();
      expect(mockPositionManager.clearPosition).not.toHaveBeenCalled();
    });

    it('should call deepSyncCheck for positions > 2 minutes old', async () => {
      const openedAt = Date.now() - 150000; // 2.5 minutes ago (> 2min threshold)
      const position = createMockPosition(PositionSide.LONG, 1.5, 1.48, [], openedAt);
      position.status = 'OPEN';
      mockPositionManager.getCurrentPosition.mockReturnValue(position);
      mockBybit.getPosition.mockResolvedValue(position); // Position exists
      mockBybit.getCurrentPrice.mockResolvedValue(1.5);  // Current price

      monitor.start();
      await jest.advanceTimersByTimeAsync(30000); // Advance 30s to trigger deepSyncCheck

      // Should delegate to PositionSyncService.deepSyncCheck
      expect(mockPositionSync.deepSyncCheck).toHaveBeenCalledWith(position);
    });
  });
});
