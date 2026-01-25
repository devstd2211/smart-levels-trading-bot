/**
 * Event Handlers Tests
 *
 * Tests the extracted event handlers:
 * - PositionEventHandler
 * - WebSocketEventHandler
 */

import { PositionEventHandler } from '../services/handlers/position.handler';
import { WebSocketEventHandler } from '../services/handlers/websocket.handler';
import { Position, LoggerService, ExitType } from '../types';
import { StopLossHitEvent, TakeProfitHitEvent, TimeBasedExitEvent } from '../types';

// Mock services
const createMockLogger = (): Partial<LoggerService> => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  getLogFilePath: jest.fn().mockReturnValue('/mock/log/path'),
});

const createMockPosition = (): Position => ({
  id: 'pos-123',
  journalId: 'j-123',
  side: 'Buy' as any,
  symbol: 'XRPUSDT',
  entryPrice: 2.0,
  quantity: 100,
  leverage: 10,
  openedAt: Date.now() - 3600000,
  unrealizedPnL: 100,
  takeProfits: [
    { level: 1, percent: 0.6, price: 2.012, sizePercent: 25, hit: false, orderId: 'tp1-order' },
    { level: 2, percent: 1.2, price: 2.024, sizePercent: 35, hit: false, orderId: 'tp2-order' },
    { level: 3, percent: 2.0, price: 2.04, sizePercent: 40, hit: false, orderId: 'tp3-order' },
  ],
  stopLoss: { price: 1.96, isTrailing: false } as any,
  status: 'OPEN',
} as any);

describe('PositionEventHandler', () => {
  let handler: PositionEventHandler;
  let mockLogger: Partial<LoggerService>;
  let mockPositionManager: any;
  let mockPositionExitingService: any;
  let mockBybitService: any;
  let mockTelegram: any;

  beforeEach(() => {
    mockLogger = createMockLogger();

    mockPositionManager = {
      clearPosition: jest.fn().mockResolvedValue(undefined),
      recordPositionClose: jest.fn().mockResolvedValue(undefined),
    };

    mockPositionExitingService = {
      closeFullPosition: jest.fn().mockResolvedValue(undefined),
    };

    mockBybitService = {
      closePosition: jest.fn().mockResolvedValue({}),
      getCurrentPrice: jest.fn().mockResolvedValue(2.05),
    };

    mockTelegram = {
      sendAlert: jest.fn().mockResolvedValue(undefined),
    };

    handler = new PositionEventHandler(
      mockPositionManager as any,
      mockPositionExitingService as any,
      mockBybitService as any,
      mockTelegram as any,
      mockLogger as LoggerService,
    );
  });

  describe('handleStopLossHit', () => {
    it('should log stop loss hit event', async () => {
      const position = createMockPosition();
      const event: StopLossHitEvent = {
        reason: 'Price below stop loss',
        currentPrice: 1.95,
        position,
      };

      await handler.handleStopLossHit(event);

      expect(mockLogger.warn).toHaveBeenCalledWith('🛑 STOP LOSS HIT (backup price detection)', expect.any(Object));
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should not call recordPositionClose on SL hit', async () => {
      const position = createMockPosition();
      const event: StopLossHitEvent = {
        reason: 'Price below stop loss',
        currentPrice: 1.95,
        position,
      };

      await handler.handleStopLossHit(event);

      expect(mockPositionManager.recordPositionClose).not.toHaveBeenCalled();
    });
  });

  describe('handleTakeProfitHit', () => {
    it('should log take profit hit event', async () => {
      const position = createMockPosition();
      const event: TakeProfitHitEvent = {
        reason: 'Price reached TP1',
        tpLevel: 1,
        currentPrice: 2.012,
        position,
      };

      await handler.handleTakeProfitHit(event);

      expect(mockLogger.info).toHaveBeenCalledWith('TAKE PROFIT 1 HIT', expect.any(Object));
    });

    it('should log different TP levels', async () => {
      const position = createMockPosition();

      for (let level = 1; level <= 3; level++) {
        const event: TakeProfitHitEvent = {
          reason: `Price reached TP${level}`,
          tpLevel: level,
          currentPrice: 2.0 + (level * 0.012),
          position,
        };

        await handler.handleTakeProfitHit(event);

        expect(mockLogger.info).toHaveBeenCalledWith(`TAKE PROFIT ${level} HIT`, expect.any(Object));
      }
    });
  });

  describe('handlePositionClosedExternally', () => {
    it('should clear position and send telegram alert', async () => {
      const position = createMockPosition();

      await handler.handlePositionClosedExternally(position);

      expect(mockPositionManager.clearPosition).toHaveBeenCalled();
      expect(mockTelegram.sendAlert).toHaveBeenCalledWith(expect.stringContaining('FALLBACK'));
    });

    it('should log warning about external closure', async () => {
      const position = createMockPosition();

      await handler.handlePositionClosedExternally(position);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Position closed externally'),
        expect.any(Object),
      );
    });
  });

  describe('handleTimeBasedExit', () => {
    it('should close position on exchange', async () => {
      const position = createMockPosition();
      const event: TimeBasedExitEvent = {
        reason: 'Position open > 24 hours',
        openedMinutes: 1440,
        pnlPercent: 2.5,
        position: {
          id: position.id,
          side: 'Buy' as any,
          quantity: position.quantity,
          entryPrice: position.entryPrice,
        },
      };

      await handler.handleTimeBasedExit(event);

      expect(mockBybitService.closePosition).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('closed on exchange'), expect.any(Object));
    });

    it('should record close on exchange failure (fallback)', async () => {
      mockBybitService.closePosition.mockRejectedValueOnce(new Error('Exchange error'));

      const position = createMockPosition();
      const event: TimeBasedExitEvent = {
        reason: 'Position open > 24 hours',
        openedMinutes: 1440,
        pnlPercent: 2.5,
        position: {
          id: position.id,
          side: 'Buy' as any,
          quantity: position.quantity,
          entryPrice: position.entryPrice,
        },
      };

      await handler.handleTimeBasedExit(event);

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to close position for time-based exit', expect.any(Object));
      expect(mockPositionExitingService.closeFullPosition).toHaveBeenCalled();
      expect(mockPositionManager.clearPosition).toHaveBeenCalled();
    });

    it('should log time-based exit warning', async () => {
      const position = createMockPosition();
      const event: TimeBasedExitEvent = {
        reason: 'Position open > 24 hours',
        openedMinutes: 1440,
        pnlPercent: 2.5,
        position: {
          id: position.id,
          side: 'Buy' as any,
          quantity: position.quantity,
          entryPrice: position.entryPrice,
        },
      };

      await handler.handleTimeBasedExit(event);

      expect(mockLogger.warn).toHaveBeenCalledWith('⏰ TIME-BASED EXIT triggered', expect.any(Object));
    });
  });

  describe('handleMonitorError', () => {
    it('should log monitor error', async () => {
      const error = new Error('Monitor error');

      await handler.handleMonitorError(error);

      expect(mockLogger.error).toHaveBeenCalledWith('Position Monitor error', expect.any(Object));
    });
  });
});

describe('WebSocketEventHandler', () => {
  let handler: WebSocketEventHandler;
  let mockLogger: Partial<LoggerService>;
  let mockPositionManager: any;
  let mockPositionExitingService: any;
  let mockBybitService: any;
  let mockWebSocketManager: any;
  let mockJournal: any;
  let mockTelegram: any;

  beforeEach(() => {
    mockLogger = createMockLogger();

    mockPositionManager = {
      syncWithWebSocket: jest.fn(),
      getCurrentPosition: jest.fn().mockReturnValue(createMockPosition()),
      clearPosition: jest.fn().mockResolvedValue(undefined),
      recordPositionClose: jest.fn().mockResolvedValue(undefined),
      onTakeProfitHit: jest.fn().mockResolvedValue(undefined),
      closePositionWithAtomicLock: jest.fn().mockImplementation(async (reason: string, callback?: () => Promise<void>) => {
        // Execute callback if provided (like WebSocket handler would)
        if (callback) {
          await callback();
        }
        // Otherwise just clear position (like timeout close)
        return mockPositionManager.clearPosition();
      }),
    };

    mockPositionExitingService = {
      onTakeProfitHit: jest.fn().mockResolvedValue(undefined),
      closeFullPosition: jest.fn().mockResolvedValue(undefined),
    };

    mockBybitService = {
      getCurrentPrice: jest.fn().mockResolvedValue(2.05),
    };

    mockWebSocketManager = {
      getLastCloseReason: jest.fn().mockReturnValue(null),
      resetLastCloseReason: jest.fn(),
    };

    mockJournal = {
      getTrade: jest.fn().mockReturnValue(null),
    };

    mockTelegram = {
      notifyPositionClosed: jest.fn().mockResolvedValue(undefined),
    };

    handler = new WebSocketEventHandler(
      mockPositionManager as any,
      mockPositionExitingService as any,
      mockBybitService as any,
      mockWebSocketManager as any,
      mockJournal as any,
      mockTelegram as any,
      mockLogger as LoggerService,
    );
  });

  describe('handlePositionUpdate', () => {
    it('should sync position with position manager', async () => {
      const position = createMockPosition();

      await handler.handlePositionUpdate(position);

      expect(mockPositionManager.syncWithWebSocket).toHaveBeenCalledWith(position);
    });

    it('should log position update', async () => {
      const position = createMockPosition();

      await handler.handlePositionUpdate(position);

      expect(mockLogger.debug).toHaveBeenCalledWith('WebSocket: Position update received');
    });
  });

  describe('handlePositionClosed', () => {
    it('should clear position on close', async () => {
      await handler.handlePositionClosed();

      // [P3] Now uses atomic lock which calls callback internally
      expect(mockPositionManager.closePositionWithAtomicLock).toHaveBeenCalled();
    });

    it('should record position close', async () => {
      mockWebSocketManager.getLastCloseReason.mockReturnValue('TP');

      await handler.handlePositionClosed();

      expect(mockPositionExitingService.closeFullPosition).toHaveBeenCalled();
    });

    it('should skip duplicate closes (already in journal)', async () => {
      mockJournal.getTrade.mockReturnValue({
        status: 'CLOSED',
        exitCondition: { exitType: ExitType.TAKE_PROFIT_1 },
      });

      await handler.handlePositionClosed();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('already closed in journal'),
        expect.any(Object),
      );
      expect(mockPositionExitingService.closeFullPosition).not.toHaveBeenCalled();
    });

    it('should determine exitType from lastCloseReason (TP)', async () => {
      mockWebSocketManager.getLastCloseReason.mockReturnValue('TP');
      const position = createMockPosition();
      position.takeProfits[0].hit = true;
      mockPositionManager.getCurrentPosition.mockReturnValue(position);

      await handler.handlePositionClosed();

      expect(mockPositionExitingService.closeFullPosition).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Number),
        expect.any(String),
        ExitType.TAKE_PROFIT_1,
      );
    });

    it('should determine exitType from lastCloseReason (TRAILING)', async () => {
      mockWebSocketManager.getLastCloseReason.mockReturnValue('TRAILING');

      await handler.handlePositionClosed();

      expect(mockPositionExitingService.closeFullPosition).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Number),
        expect.any(String),
        ExitType.TRAILING_STOP,
      );
    });

    it('should determine exitType from lastCloseReason (SL)', async () => {
      mockWebSocketManager.getLastCloseReason.mockReturnValue('SL');

      await handler.handlePositionClosed();

      expect(mockPositionExitingService.closeFullPosition).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Number),
        expect.any(String),
        ExitType.STOP_LOSS,
      );
    });

    it('should reset lastCloseReason after processing', async () => {
      await handler.handlePositionClosed();

      expect(mockWebSocketManager.resetLastCloseReason).toHaveBeenCalled();
    });

    it('should send telegram notification', async () => {
      await handler.handlePositionClosed();

      expect(mockTelegram.notifyPositionClosed).toHaveBeenCalled();
    });

    it('should not send telegram if no active position', async () => {
      mockPositionManager.getCurrentPosition.mockReturnValue(null);

      await handler.handlePositionClosed();

      expect(mockTelegram.notifyPositionClosed).not.toHaveBeenCalled();
    });
  });

  describe('handleOrderFilled', () => {
    it('should log order filled event', async () => {
      const order = {
        orderId: 'order-123',
        price: 2.01,
        quantity: 50,
      };

      await handler.handleOrderFilled(order as any);

      expect(mockLogger.info).toHaveBeenCalledWith('WebSocket: Order filled', { orderId: 'order-123' });
    });
  });

  describe('handleTakeProfitFilled', () => {
    it('should match TP by OrderID (method 1 - most reliable)', async () => {
      const event = {
        orderId: 'tp1-order',
        avgPrice: 2.012,
        cumExecQty: 25,
      };

      await handler.handleTakeProfitFilled(event as any);

      expect(mockLogger.info).toHaveBeenCalledWith('✅ Matched TP by OrderID (RELIABLE)', expect.any(Object));
      expect(mockPositionExitingService.onTakeProfitHit).toHaveBeenCalledWith(expect.any(Object), 1, 2.012);
    });

    it('should match TP by price (method 2 - fallback)', async () => {
      const event = {
        orderId: 'unknown-order',
        avgPrice: 2.0121, // Within 0.3% of 2.012
        cumExecQty: 25,
      };

      await handler.handleTakeProfitFilled(event as any);

      expect(mockLogger.warn).toHaveBeenCalledWith('⚠️ Matched TP by price (fallback)', expect.any(Object));
      expect(mockPositionExitingService.onTakeProfitHit).toHaveBeenCalledWith(expect.any(Object), 1, expect.closeTo(2.0121, 0.01));
    });

    it('should match TP by quantity (method 3 - fallback)', async () => {
      const event = {
        orderId: 'unknown-order',
        avgPrice: 0, // Unknown price
        cumExecQty: 25, // Should match TP1 (25% sizePercent)
      };

      await handler.handleTakeProfitFilled(event as any);

      expect(mockLogger.warn).toHaveBeenCalledWith('⚠️ Matched TP by quantity (fallback)', expect.any(Object));
      expect(mockPositionExitingService.onTakeProfitHit).toHaveBeenCalledWith(expect.any(Object), 1, expect.any(Number));
    });

    it('should handle case with no active position', async () => {
      mockPositionManager.getCurrentPosition.mockReturnValue(null);

      const event = {
        orderId: 'tp1-order',
        avgPrice: 2.012,
        cumExecQty: 25,
      };

      await handler.handleTakeProfitFilled(event as any);

      expect(mockLogger.warn).toHaveBeenCalledWith('Take Profit filled but no active position');
      expect(mockPositionManager.onTakeProfitHit).not.toHaveBeenCalled();
    });

    it('should log critical error if TP level cannot be determined', async () => {
      const position = createMockPosition();
      position.takeProfits = []; // No TPs defined
      mockPositionManager.getCurrentPosition.mockReturnValue(position);

      const event = {
        orderId: 'unknown-order',
        avgPrice: 3.0, // Doesn't match any TP
        cumExecQty: 50,
      };

      await handler.handleTakeProfitFilled(event as any);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Could not determine ANY TP level'),
        expect.any(Object),
      );
      expect(mockPositionManager.onTakeProfitHit).not.toHaveBeenCalled();
    });
  });

  describe('handleStopLossFilled', () => {
    it('should log stop loss filled event', async () => {
      const event = {
        orderId: 'sl-order',
        avgPrice: 1.96,
        cumExecQty: 100,
      };

      await handler.handleStopLossFilled(event as any);

      expect(mockLogger.info).toHaveBeenCalledWith('WebSocket: Stop Loss filled', expect.any(Object));
    });

    it('should not call recordPositionClose (wait for positionClosed event)', async () => {
      const event = {
        orderId: 'sl-order',
        avgPrice: 1.96,
        cumExecQty: 100,
      };

      await handler.handleStopLossFilled(event as any);

      expect(mockPositionManager.recordPositionClose).not.toHaveBeenCalled();
    });
  });

  describe('handleError', () => {
    it('should log WebSocket error', async () => {
      const error = new Error('WebSocket connection lost');

      await handler.handleError(error);

      expect(mockLogger.error).toHaveBeenCalledWith('WebSocket error', expect.any(Object));
    });
  });
});
