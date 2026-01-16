/**
 * Exit Event Handler - Unit Tests
 *
 * Tests for event handling with mocked dependencies
 */

import { ExitEventHandler, IExchangeService, IPositionManager } from '../../exit-handler/exit-event-handler';
import {
  ITPHitEvent,
  IPositionClosedEvent,
  ExitStrategyConfig,
} from '../../types/exit-strategy.types';
import { Position } from '../../types/core';
import { PositionSide } from '../../types/enums';
import { LoggerService } from '../../types';

// ============================================================================
// MOCKS
// ============================================================================

class MockExchange implements IExchangeService {
  updateStopLoss = jest.fn().mockResolvedValue(undefined);
  setTrailingStop = jest.fn().mockResolvedValue(undefined);
}

class MockPositionManager implements IPositionManager {
  remove = jest.fn().mockResolvedValue(undefined);
}

class MockLogger implements Partial<LoggerService> {
  debug = jest.fn();
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
  trace = jest.fn();
  minLevel = 'debug' as any;
  logDir = '';
  logToFile = false;
  logs = [] as any[];
}

// ============================================================================
// HELPERS
// ============================================================================

function createTestPosition(overrides?: Partial<Position>): Position {
  return {
    id: 'TEST_BTCUSDT',
    symbol: 'BTCUSDT',
    side: PositionSide.LONG,
    quantity: 1.0,
    entryPrice: 100,
    leverage: 10,
    marginUsed: 10,
    stopLoss: { price: 98, initialPrice: 98, orderId: '1', isBreakeven: false, isTrailing: false, updatedAt: Date.now() },
    takeProfits: [
      { level: 1, percent: 1.5, sizePercent: 50, price: 101.5, hit: false },
      { level: 2, percent: 3.0, sizePercent: 30, price: 103, hit: false },
      { level: 3, percent: 5.0, sizePercent: 20, price: 105, hit: false },
    ],
    openedAt: Date.now(),
    unrealizedPnL: 0,
    orderId: 'entry_order',
    reason: 'Test',
    status: 'OPEN',
    ...overrides,
  };
}

function createTestConfig(): ExitStrategyConfig {
  return {
    stopLoss: { percent: 2.0, atrMultiplier: 1.5, minDistancePercent: 0.5 },
    takeProfits: [
      { level: 1, percent: 1.5, sizePercent: 50, onHit: 'MOVE_SL_TO_BREAKEVEN', beMargin: 0.1 },
      { level: 2, percent: 3.0, sizePercent: 30, onHit: 'ACTIVATE_TRAILING' },
      { level: 3, percent: 5.0, sizePercent: 20, onHit: 'CLOSE' },
    ],
    trailing: {
      enabled: true,
      percent: 0.5,
      activationLevel: 2,
    },
    breakeven: {
      enabled: true,
      offsetPercent: 0.1,
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('ExitEventHandler', () => {
  let exchange: MockExchange;
  let positionManager: MockPositionManager;
  let logger: MockLogger;
  let handler: ExitEventHandler;
  let config: ExitStrategyConfig;
  let position: Position;

  beforeEach(() => {
    exchange = new MockExchange();
    positionManager = new MockPositionManager();
    logger = new MockLogger();
    config = createTestConfig();
    position = createTestPosition();
    handler = new ExitEventHandler(exchange, positionManager, config, logger as any);
  });

  // ==========================================================================
  // TP HIT - MOVE SL TO BREAKEVEN
  // ==========================================================================

  describe('TP Hit - Move SL to Breakeven', () => {
    it('should move SL to breakeven on TP1 hit', async () => {
      const event: ITPHitEvent = {
        type: 'TP_HIT',
        symbol: 'BTCUSDT',
        position,
        currentPrice: 101.5,
        tpLevel: 1,
        tpPrice: 101.5,
        timestamp: Date.now(),
      };

      const result = await handler.handle(event);

      expect(result.success).toBe(true);
      expect((result as any).action).toBe('MOVE_SL_TO_BREAKEVEN');
      expect((result as any).newSlPrice).toBe(100.1); // entry + 0.1%
      expect(exchange.updateStopLoss).toHaveBeenCalledWith('BTCUSDT', 100.1);
    });

    it('should log TP hit event', async () => {
      const event: ITPHitEvent = {
        type: 'TP_HIT',
        symbol: 'BTCUSDT',
        position,
        currentPrice: 101.5,
        tpLevel: 1,
        tpPrice: 101.5,
        timestamp: Date.now(),
      };

      await handler.handle(event);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('TP HIT'),
        expect.any(Object)
      );
    });

    it('should handle error when updating SL fails', async () => {
      exchange.updateStopLoss.mockRejectedValueOnce(new Error('Exchange error'));

      const event: ITPHitEvent = {
        type: 'TP_HIT',
        symbol: 'BTCUSDT',
        position,
        currentPrice: 101.5,
        tpLevel: 1,
        tpPrice: 101.5,
        timestamp: Date.now(),
      };

      const result = await handler.handle(event);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Exchange error');
    });
  });

  // ==========================================================================
  // TP HIT - ACTIVATE TRAILING
  // ==========================================================================

  describe('TP Hit - Activate Trailing', () => {
    it('should activate trailing on TP2 hit', async () => {
      const event: ITPHitEvent = {
        type: 'TP_HIT',
        symbol: 'BTCUSDT',
        position,
        currentPrice: 103,
        tpLevel: 2,
        tpPrice: 103,
        timestamp: Date.now(),
      };

      const result = await handler.handle(event);

      expect(result.success).toBe(true);
      expect((result as any).action).toBe('ACTIVATE_TRAILING');
      expect((result as any).trailingDistance).toBeDefined();
      expect(exchange.setTrailingStop).toHaveBeenCalledWith('BTCUSDT', expect.any(Number));
    });

    it('should use ATR for trailing if provided', async () => {
      const event: ITPHitEvent = {
        type: 'TP_HIT',
        symbol: 'BTCUSDT',
        position,
        currentPrice: 103,
        tpLevel: 2,
        tpPrice: 103,
        timestamp: Date.now(),
        indicators: { atrPercent: 1.5 },
      };

      await handler.handle(event);

      // Should use 1.5 from indicators, not 0.5 from config
      expect(exchange.setTrailingStop).toHaveBeenCalledWith('BTCUSDT', expect.any(Number));
    });
  });

  // ==========================================================================
  // TP HIT - CLOSE
  // ==========================================================================

  describe('TP Hit - Close', () => {
    it('should close on TP3 hit', async () => {
      const event: ITPHitEvent = {
        type: 'TP_HIT',
        symbol: 'BTCUSDT',
        position,
        currentPrice: 105,
        tpLevel: 3,
        tpPrice: 105,
        timestamp: Date.now(),
      };

      const result = await handler.handle(event);

      expect(result.success).toBe(true);
      expect((result as any).action).toBe('CLOSE');
      expect((result as any).reason).toContain('closing');
    });
  });

  // ==========================================================================
  // TP HIT - UNKNOWN TP LEVEL
  // ==========================================================================

  describe('TP Hit - Unknown Level', () => {
    it('should handle unknown TP level', async () => {
      const event: ITPHitEvent = {
        type: 'TP_HIT',
        symbol: 'BTCUSDT',
        position,
        currentPrice: 110,
        tpLevel: 99,
        tpPrice: 110,
        timestamp: Date.now(),
      };

      const result = await handler.handle(event);

      expect(result.success).toBe(false);
      expect((result as any).reason).toContain('No config');
    });
  });

  // ==========================================================================
  // POSITION CLOSED - LOG AND CLEANUP
  // ==========================================================================

  describe('Position Closed', () => {
    it('should log and cleanup when position closed', async () => {
      const event: IPositionClosedEvent = {
        type: 'POSITION_CLOSED',
        symbol: 'BTCUSDT',
        position,
        currentPrice: 105,
        timestamp: Date.now(),
        reason: 'TP_HIT',
        closedAt: Date.now(),
        closedSize: 1.0,
        pnl: 5,
        pnlPercent: 5,
      };

      const result = await handler.handle(event);

      expect(result.success).toBe(true);
      expect((result as any).removed).toBe(true);
      expect(positionManager.remove).toHaveBeenCalledWith('BTCUSDT');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('POSITION CLOSED'),
        expect.any(Object)
      );
    });

    it('should handle cleanup failure gracefully', async () => {
      positionManager.remove.mockRejectedValueOnce(new Error('DB error'));

      const event: IPositionClosedEvent = {
        type: 'POSITION_CLOSED',
        symbol: 'BTCUSDT',
        position,
        currentPrice: 105,
        timestamp: Date.now(),
        reason: 'TP_HIT',
        closedAt: Date.now(),
        closedSize: 1.0,
        pnl: 5,
        pnlPercent: 5,
      };

      const result = await handler.handle(event);

      // Should succeed even if cleanup fails
      expect(result.success).toBe(true);
      expect((result as any).removed).toBe(false);
    });

    it('should handle different close reasons', async () => {
      const reasons: Array<'SL_HIT' | 'TP_HIT' | 'TRAILING_HIT' | 'MANUAL' | 'LIQUIDATION'> = [
        'SL_HIT',
        'TP_HIT',
        'TRAILING_HIT',
        'MANUAL',
        'LIQUIDATION',
      ];

      for (const reason of reasons) {
        const event: IPositionClosedEvent = {
          type: 'POSITION_CLOSED',
          symbol: 'BTCUSDT',
          position,
          currentPrice: 105,
          timestamp: Date.now(),
          reason,
          closedAt: Date.now(),
          closedSize: 1.0,
        };

        const result = await handler.handle(event);

        expect(result.success).toBe(true);
        expect(logger.info).toHaveBeenCalled();
      }
    });
  });

  // ==========================================================================
  // SHORT POSITIONS
  // ==========================================================================

  describe('Short Positions', () => {
    it('should handle SHORT TP hits correctly', async () => {
      const shortPosition = createTestPosition({
        side: PositionSide.SHORT,
        entryPrice: 100,
        takeProfits: [
          { level: 1, percent: 1.5, sizePercent: 50, price: 98.5, hit: false },
        ],
      });

      const event: ITPHitEvent = {
        type: 'TP_HIT',
        symbol: 'BTCUSDT',
        position: shortPosition,
        currentPrice: 98.5,
        tpLevel: 1,
        tpPrice: 98.5,
        timestamp: Date.now(),
      };

      const result = await handler.handle(event);

      expect(result.success).toBe(true);
      expect((result as any).action).toBe('MOVE_SL_TO_BREAKEVEN');
      // For SHORT: BE should be below entry
      expect((result as any).newSlPrice).toBe(99.9); // 100 - 0.1
    });
  });

  // ==========================================================================
  // CONFIG VARIATIONS
  // ==========================================================================

  describe('Config Variations', () => {
    it('should respect disabled trailing', async () => {
      const configNoTrailing: ExitStrategyConfig = {
        ...config,
        trailing: { ...config.trailing!, enabled: false },
      };

      handler = new ExitEventHandler(exchange, positionManager, configNoTrailing, logger as any);

      const event: ITPHitEvent = {
        type: 'TP_HIT',
        symbol: 'BTCUSDT',
        position,
        currentPrice: 103,
        tpLevel: 2,
        tpPrice: 103,
        timestamp: Date.now(),
      };

      const result = await handler.handle(event);

      expect((result as any).action).toBe('NONE');
      expect(exchange.setTrailingStop).not.toHaveBeenCalled();
    });

    it('should handle TP with custom handler', async () => {
      const configCustom: ExitStrategyConfig = {
        ...config,
        takeProfits: [
          {
            level: 1,
            percent: 1.5,
            sizePercent: 50,
            onHit: 'CUSTOM',
            customHandler: 'myCustomLogic',
          },
        ],
      };

      handler = new ExitEventHandler(exchange, positionManager, configCustom, logger as any);

      const event: ITPHitEvent = {
        type: 'TP_HIT',
        symbol: 'BTCUSDT',
        position,
        currentPrice: 101.5,
        tpLevel: 1,
        tpPrice: 101.5,
        timestamp: Date.now(),
      };

      const result = await handler.handle(event);

      expect((result as any).action).toBe('NONE');
      expect((result as any).reason).toContain('Custom handler');
    });
  });

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  describe('Error Handling', () => {
    it('should handle exchange errors gracefully on SL update', async () => {
      // Mock exchange to throw error
      exchange.updateStopLoss.mockRejectedValueOnce(new Error('Network timeout'));

      const event: ITPHitEvent = {
        type: 'TP_HIT',
        symbol: 'BTCUSDT',
        position,
        currentPrice: 101.5,
        tpLevel: 1,
        tpPrice: 101.5,
        timestamp: Date.now(),
      };

      const result = await handler.handle(event);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network timeout');
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
