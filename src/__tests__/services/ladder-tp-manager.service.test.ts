/**
 * Tests for LadderTpManagerService (Phase 3)
 *
 * Coverage:
 * - Create ladder levels (LONG/SHORT)
 * - Check TP hit detection
 * - Execute partial closes
 * - Move to breakeven after TP1
 * - Move trailing SL after TP2
 * - Config validation
 */

import { LadderTpManagerService } from '../../services/ladder-tp-manager.service';
import { BybitService } from '../../services/bybit/bybit.service';
import { IExchange } from '../../interfaces/IExchange';
import {
  LoggerService,
  LogLevel,
  SignalDirection,
  PositionSide,
  LadderTpManagerConfig,
  LadderTpLevel,
  Position,
} from '../../types';

// ============================================================================
// MOCKS
// ============================================================================

const createMockBybitService = (): jest.Mocked<IExchange> => {
  return {
    closePosition: jest.fn(),
    updateStopLoss: jest.fn(),
  } as any;
};

const createMockPosition = (
  side: PositionSide,
  entryPrice: number,
  quantity: number,
  openedAt: number = Date.now(),
): Position => {
  const slPrice = side === PositionSide.LONG ? entryPrice * 0.998 : entryPrice * 1.002;
  return {
    id: 'APEXUSDT_' + side,
    symbol: 'APEXUSDT',
    side,
    entryPrice,
    quantity,
    stopLoss: {
      price: slPrice,
      initialPrice: slPrice,
      isBreakeven: false,
      isTrailing: false,
      updatedAt: Date.now(),
    },
    takeProfits: [],
    leverage: 10,
    marginUsed: 100,
    openedAt,
    unrealizedPnL: 0,
    orderId: 'ORDER_123',
    reason: 'Test',
    status: 'OPEN',
  };
};

// ============================================================================
// TEST SUITE
// ============================================================================

describe('LadderTpManagerService', () => {
  let service: LadderTpManagerService;
  let bybitService: jest.Mocked<IExchange>;
  let logger: LoggerService;
  let config: LadderTpManagerConfig;

  beforeEach(() => {
    logger = new LoggerService(LogLevel.ERROR, './logs', false);
    bybitService = createMockBybitService();

    // Default config: 3 levels (0.08%, 0.15%, 0.25%) with 33%, 33%, 34% closes
    config = {
      levels: [
        { pricePercent: 0.08, closePercent: 33 },
        { pricePercent: 0.15, closePercent: 33 },
        { pricePercent: 0.25, closePercent: 34 },
      ],
      moveToBreakevenAfterTP1: true,
      trailingAfterTP2: true,
      minPartialClosePercent: 10,
      maxPartialClosePercent: 90,
      trailingDistancePercent: 0.05,
    };

    service = new LadderTpManagerService(config, bybitService, logger);
  });

  // ==========================================================================
  // CREATE LADDER LEVELS
  // ==========================================================================

  describe('createLadderLevels', () => {
    it('should create 3 ladder levels for LONG position', () => {
      const entry = 1.0;
      const direction = SignalDirection.LONG;

      const levels = service.createLadderLevels(entry, direction);

      expect(levels).toHaveLength(3);

      // TP1: 0.08% above entry
      expect(levels[0]).toEqual({
        level: 1,
        pricePercent: 0.08,
        closePercent: 33,
        targetPrice: 1.0008, // 1.0 * 1.0008
        hit: false,
      });

      // TP2: 0.15% above entry
      expect(levels[1]).toEqual({
        level: 2,
        pricePercent: 0.15,
        closePercent: 33,
        targetPrice: 1.0015, // 1.0 * 1.0015
        hit: false,
      });

      // TP3: 0.25% above entry
      expect(levels[2]).toEqual({
        level: 3,
        pricePercent: 0.25,
        closePercent: 34,
        targetPrice: 1.0025, // 1.0 * 1.0025
        hit: false,
      });
    });

    it('should create 3 ladder levels for SHORT position', () => {
      const entry = 1.0;
      const direction = SignalDirection.SHORT;

      const levels = service.createLadderLevels(entry, direction);

      expect(levels).toHaveLength(3);

      // TP1: 0.08% below entry
      expect(levels[0]).toEqual({
        level: 1,
        pricePercent: 0.08,
        closePercent: 33,
        targetPrice: 0.9992, // 1.0 * 0.9992
        hit: false,
      });

      // TP2: 0.15% below entry
      expect(levels[1]).toEqual({
        level: 2,
        pricePercent: 0.15,
        closePercent: 33,
        targetPrice: 0.9985, // 1.0 * 0.9985
        hit: false,
      });

      // TP3: 0.25% below entry
      expect(levels[2]).toEqual({
        level: 3,
        pricePercent: 0.25,
        closePercent: 34,
        targetPrice: 0.9975, // 1.0 * 0.9975
        hit: false,
      });
    });

    it('should create levels with different percentages', () => {
      const customConfig: LadderTpManagerConfig = {
        levels: [
          { pricePercent: 0.1, closePercent: 50 },
          { pricePercent: 0.2, closePercent: 50 },
        ],
        moveToBreakevenAfterTP1: false,
        trailingAfterTP2: false,
        trailingDistancePercent: 0,
        minPartialClosePercent: 10,
        maxPartialClosePercent: 90,
      };

      const customService = new LadderTpManagerService(customConfig, bybitService, logger);

      const entry = 100;
      const levels = customService.createLadderLevels(entry, SignalDirection.LONG);

      expect(levels).toHaveLength(2);
      expect(levels[0].targetPrice).toBe(100.1); // 100 * 1.001
      expect(levels[1].targetPrice).toBe(100.2); // 100 * 1.002
    });
  });

  // ==========================================================================
  // CHECK TP HIT
  // ==========================================================================

  describe('checkTpHit', () => {
    it('should detect TP1 hit for LONG position', () => {
      const level: LadderTpLevel = {
        level: 1,
        pricePercent: 0.08,
        closePercent: 33,
        targetPrice: 1.0008,
        hit: false,
      };

      const currentPrice = 1.0008; // Exact TP price
      const isHit = service.checkTpHit(level, currentPrice, SignalDirection.LONG);

      expect(isHit).toBe(true);
    });

    it('should detect TP1 hit for SHORT position', () => {
      const level: LadderTpLevel = {
        level: 1,
        pricePercent: 0.08,
        closePercent: 33,
        targetPrice: 0.9992,
        hit: false,
      };

      const currentPrice = 0.9992; // Exact TP price
      const isHit = service.checkTpHit(level, currentPrice, SignalDirection.SHORT);

      expect(isHit).toBe(true);
    });

    it('should detect TP hit with tolerance (LONG)', () => {
      const level: LadderTpLevel = {
        level: 1,
        pricePercent: 0.08,
        closePercent: 33,
        targetPrice: 1.0008,
        hit: false,
      };

      // Price slightly below TP (within tolerance)
      const currentPrice = 1.00079;
      const isHit = service.checkTpHit(level, currentPrice, SignalDirection.LONG);

      expect(isHit).toBe(true);
    });

    it('should NOT detect TP hit when price too far (LONG)', () => {
      const level: LadderTpLevel = {
        level: 1,
        pricePercent: 0.08,
        closePercent: 33,
        targetPrice: 1.0008,
        hit: false,
      };

      const currentPrice = 1.0006; // Below TP
      const isHit = service.checkTpHit(level, currentPrice, SignalDirection.LONG);

      expect(isHit).toBe(false);
    });

    it('should NOT detect TP hit when price too far (SHORT)', () => {
      const level: LadderTpLevel = {
        level: 1,
        pricePercent: 0.08,
        closePercent: 33,
        targetPrice: 0.9992,
        hit: false,
      };

      const currentPrice = 0.9994; // Above TP
      const isHit = service.checkTpHit(level, currentPrice, SignalDirection.SHORT);

      expect(isHit).toBe(false);
    });

    it('should return false if TP already hit', () => {
      const level: LadderTpLevel = {
        level: 1,
        pricePercent: 0.08,
        closePercent: 33,
        targetPrice: 1.0008,
        hit: true, // Already hit
      };

      const currentPrice = 1.0008;
      const isHit = service.checkTpHit(level, currentPrice, SignalDirection.LONG);

      expect(isHit).toBe(false);
    });
  });

  // ==========================================================================
  // EXECUTE PARTIAL CLOSE
  // ==========================================================================

  describe('executePartialClose', () => {
    it('should execute partial close for TP1 (33%)', async () => {
      const level: LadderTpLevel = {
        level: 1,
        pricePercent: 0.08,
        closePercent: 33,
        targetPrice: 1.0008,
        hit: true,
      };

      const position = createMockPosition(PositionSide.LONG, 1.0, 100);

      bybitService.closePosition.mockResolvedValue(undefined);

      const success = await service.executePartialClose(level, position);

      expect(success).toBe(true);
      expect(bybitService.closePosition).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: position.id,
          percentage: 33,
        })
      );
    });

    it('should execute partial close for TP2 (33%)', async () => {
      const level: LadderTpLevel = {
        level: 2,
        pricePercent: 0.15,
        closePercent: 33,
        targetPrice: 1.0015,
        hit: true,
      };

      const position = createMockPosition(PositionSide.SHORT, 1.0, 50);

      bybitService.closePosition.mockResolvedValue(undefined);

      const success = await service.executePartialClose(level, position);

      expect(success).toBe(true);
      expect(bybitService.closePosition).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: position.id,
          percentage: 33,
        })
      );
    });

    it('should skip partial close if quantity too small', async () => {
      const level: LadderTpLevel = {
        level: 1,
        pricePercent: 0.08,
        closePercent: 33,
        targetPrice: 1.0008,
        hit: true,
      };

      const position = createMockPosition(PositionSide.LONG, 1.0, 0.01); // Tiny position

      const success = await service.executePartialClose(level, position);

      expect(success).toBe(false);
      expect(bybitService.closePosition).not.toHaveBeenCalled();
    });

    it('should handle close position error gracefully', async () => {
      const level: LadderTpLevel = {
        level: 1,
        pricePercent: 0.08,
        closePercent: 33,
        targetPrice: 1.0008,
        hit: true,
      };

      const position = createMockPosition(PositionSide.LONG, 1.0, 100);

      bybitService.closePosition.mockRejectedValue(new Error('Bybit API error'));

      const success = await service.executePartialClose(level, position);

      expect(success).toBe(false);
    });
  });

  // ==========================================================================
  // MOVE TO BREAKEVEN
  // ==========================================================================

  describe('moveToBreakeven', () => {
    it('should move SL to breakeven after TP1 (LONG)', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.0, 100);

      bybitService.updateStopLoss.mockResolvedValue(undefined);

      const success = await service.moveToBreakeven(position);

      expect(success).toBe(true);
      expect(bybitService.updateStopLoss).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: position.id,
          newPrice: 1.0,
        })
      );
    });

    it('should move SL to breakeven after TP1 (SHORT)', async () => {
      const position = createMockPosition(PositionSide.SHORT, 2.0, 50);

      bybitService.updateStopLoss.mockResolvedValue(undefined);

      const success = await service.moveToBreakeven(position);

      expect(success).toBe(true);
      expect(bybitService.updateStopLoss).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: position.id,
          newPrice: 2.0,
        })
      );
    });

    it('should NOT move to breakeven if disabled in config', async () => {
      const disabledConfig: LadderTpManagerConfig = {
        ...config,
        moveToBreakevenAfterTP1: false,
      };

      const disabledService = new LadderTpManagerService(disabledConfig, bybitService, logger);

      const position = createMockPosition(PositionSide.LONG, 1.0, 100);

      const success = await disabledService.moveToBreakeven(position);

      expect(success).toBe(false);
      expect(bybitService.updateStopLoss).not.toHaveBeenCalled();
    });

    it('should handle update SL error gracefully', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.0, 100);

      bybitService.updateStopLoss.mockRejectedValue(new Error('Bybit API error'));

      const success = await service.moveToBreakeven(position);

      expect(success).toBe(false);
    });
  });

  // ==========================================================================
  // MOVE TRAILING SL
  // ==========================================================================

  describe('moveTrailing', () => {
    it('should move trailing SL after TP2 (LONG)', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.0, 100);
      const currentPrice = 1.002; // Price moved up after TP2

      bybitService.updateStopLoss.mockResolvedValue(undefined);

      const success = await service.moveTrailing(position, currentPrice);

      expect(success).toBe(true);

      // Trailing SL: 1.002 * (1 - 0.05/100) = 1.00195
      const expectedSl = 1.002 * 0.9995;
      expect(bybitService.updateStopLoss).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: position.id,
          newPrice: expectedSl,
        })
      );
    });

    it('should move trailing SL after TP2 (SHORT)', async () => {
      const position = createMockPosition(PositionSide.SHORT, 1.0, 100);
      const currentPrice = 0.998; // Price moved down after TP2

      bybitService.updateStopLoss.mockResolvedValue(undefined);

      const success = await service.moveTrailing(position, currentPrice);

      expect(success).toBe(true);

      // Trailing SL: 0.998 * (1 + 0.05/100) = 0.99805
      const expectedSl = 0.998 * 1.0005;
      expect(bybitService.updateStopLoss).toHaveBeenCalledWith(
        expect.objectContaining({
          positionId: position.id,
          newPrice: expectedSl,
        })
      );
    });

    it('should NOT move trailing if new SL worse than current (LONG)', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.0, 100);
      position.stopLoss.price = 1.0016; // Current SL very high

      const currentPrice = 1.002;

      const success = await service.moveTrailing(position, currentPrice);

      // New SL (1.001499) < Current SL (1.0016) → Don't move
      expect(success).toBe(false);
      expect(bybitService.updateStopLoss).not.toHaveBeenCalled();
    });

    it('should NOT move trailing if disabled in config', async () => {
      const disabledConfig: LadderTpManagerConfig = {
        ...config,
        trailingAfterTP2: false,
      };

      const disabledService = new LadderTpManagerService(disabledConfig, bybitService, logger);

      const position = createMockPosition(PositionSide.LONG, 1.0, 100);
      const currentPrice = 1.002;

      const success = await disabledService.moveTrailing(position, currentPrice);

      expect(success).toBe(false);
      expect(bybitService.updateStopLoss).not.toHaveBeenCalled();
    });

    it('should handle update SL error gracefully', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.0, 100);
      const currentPrice = 1.002;

      bybitService.updateStopLoss.mockRejectedValue(new Error('Bybit API error'));

      const success = await service.moveTrailing(position, currentPrice);

      expect(success).toBe(false);
    });
  });

  // ==========================================================================
  // CONFIG VALIDATION
  // ==========================================================================

  describe('config validation', () => {
    it('should throw error if no levels configured', () => {
      const invalidConfig: LadderTpManagerConfig = {
        levels: [],
        moveToBreakevenAfterTP1: true,
        trailingAfterTP2: true,
        trailingDistancePercent: 0.05,
        minPartialClosePercent: 10,
        maxPartialClosePercent: 90,
      };

      expect(() => {
        new LadderTpManagerService(invalidConfig, bybitService, logger);
      }).toThrow('LadderTpManagerConfig must have at least 1 level');
    });

    it('should throw error if pricePercent <= 0', () => {
      const invalidConfig: LadderTpManagerConfig = {
        levels: [{ pricePercent: 0, closePercent: 50 }],
        moveToBreakevenAfterTP1: true,
        trailingAfterTP2: true,
        trailingDistancePercent: 0.05,
        minPartialClosePercent: 10,
        maxPartialClosePercent: 90,
      };

      expect(() => {
        new LadderTpManagerService(invalidConfig, bybitService, logger);
      }).toThrow('Invalid pricePercent: 0 (must be > 0)');
    });

    it('should throw error if closePercent < 10%', () => {
      const invalidConfig: LadderTpManagerConfig = {
        levels: [{ pricePercent: 0.1, closePercent: 5 }],
        moveToBreakevenAfterTP1: true,
        trailingAfterTP2: true,
        trailingDistancePercent: 0.05,
        minPartialClosePercent: 10,
        maxPartialClosePercent: 90,
      };

      expect(() => {
        new LadderTpManagerService(invalidConfig, bybitService, logger);
      }).toThrow('Invalid closePercent: 5 (must be 10-90%)');
    });

    it('should throw error if closePercent > 90%', () => {
      const invalidConfig: LadderTpManagerConfig = {
        levels: [{ pricePercent: 0.1, closePercent: 95 }],
        moveToBreakevenAfterTP1: true,
        trailingAfterTP2: true,
        trailingDistancePercent: 0.05,
        minPartialClosePercent: 10,
        maxPartialClosePercent: 90,
      };

      expect(() => {
        new LadderTpManagerService(invalidConfig, bybitService, logger);
      }).toThrow('Invalid closePercent: 95 (must be 10-90%)');
    });

    it('should throw error if trailingDistancePercent <= 0 when trailing enabled', () => {
      const invalidConfig: LadderTpManagerConfig = {
        levels: [{ pricePercent: 0.1, closePercent: 50 }],
        moveToBreakevenAfterTP1: true,
        trailingAfterTP2: true,
        trailingDistancePercent: 0,
        minPartialClosePercent: 10,
        maxPartialClosePercent: 90,
      };

      expect(() => {
        new LadderTpManagerService(invalidConfig, bybitService, logger);
      }).toThrow('Invalid trailingDistancePercent: 0 (must be > 0)');
    });
  });

  // ==========================================================================
  // GET CONFIG
  // ==========================================================================

  describe('getConfig', () => {
    it('should return config', () => {
      const returnedConfig = service.getConfig();

      expect(returnedConfig).toEqual(config);
    });
  });
});
