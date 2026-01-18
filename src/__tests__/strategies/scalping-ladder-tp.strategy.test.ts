/**
 * Tests for ScalpingLadderTpStrategy (Phase 3)
 *
 * Coverage:
 * - Strategy initialization
 * - Wrapper pattern (always NO_SIGNAL)
 * - Setup ladder TPs
 * - Monitor TP1 hit → partial close + breakeven
 * - Monitor TP2 hit → partial close + trailing
 * - Monitor TP3 hit → final close
 * - Max holding time
 * - Enable/disable states
 */

import { ScalpingLadderTpStrategy } from '../../strategies/scalping-ladder-tp.strategy';
import { BybitService } from '../../services/bybit/bybit.service';
import { IExchange } from '../../interfaces/IExchange';
import {
  LoggerService,
  LogLevel,
  PositionSide,
  ScalpingLadderTpConfig,
  StrategyMarketData,
  TrendBias,
  Position,
  Candle,
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

const createMockCandle = (close: number): Candle => {
  return {
    timestamp: Date.now(),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
  };
};

const createMockMarketData = (closePrice: number): StrategyMarketData => {
  return {
    candles: [createMockCandle(closePrice)],
    swingPoints: [],
    rsi: 50,
    rsiTrend1: 50,
    ema: { fast: closePrice, slow: closePrice },
    emaTrend1: { fast: closePrice, slow: closePrice },
    trend: 'NEUTRAL',
    atr: 0.01,
    timestamp: Date.now(),
    currentPrice: closePrice,
    context: {
      timestamp: Date.now(),
      trend: TrendBias.NEUTRAL,
      marketStructure: null,
      atrPercent: 0.5,
      emaDistance: 0,
      ema50: closePrice,
      atrModifier: 1.0,
      emaModifier: 1.0,
      trendModifier: 1.0,
      overallModifier: 1.0,
      isValidContext: true,
      blockedBy: [],
      warnings: [],
    },
  };
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

describe('ScalpingLadderTpStrategy', () => {
  let strategy: ScalpingLadderTpStrategy;
  let bybitService: jest.Mocked<IExchange>;
  let logger: LoggerService;
  let config: ScalpingLadderTpConfig;

  beforeEach(() => {
    logger = new LoggerService(LogLevel.ERROR, './logs', false);
    bybitService = createMockBybitService();

    // Default config: 3 levels
    config = {
      enabled: true,
      priority: 2,
      minConfidence: 70,
      stopLossPercent: 0.12,
      maxHoldingTimeMs: 300000, // 5 minutes
      ladderManager: {
        levels: [
          { pricePercent: 0.08, closePercent: 33 },
          { pricePercent: 0.15, closePercent: 33 },
          { pricePercent: 0.25, closePercent: 34 },
        ],
        moveToBreakevenAfterTP1: true,
        trailingAfterTP2: true,
        trailingDistancePercent: 0.05,
        minPartialClosePercent: 10,
        maxPartialClosePercent: 90,
      },
      baseSignalSource: 'levelBased',
    };

    strategy = new ScalpingLadderTpStrategy(config, bybitService, logger);
  });

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  describe('initialization', () => {
    it('should initialize with correct name and priority', () => {
      expect(strategy.name).toBe('ScalpingLadderTp');
      expect(strategy.priority).toBe(2);
    });

    it('should create ladder manager instance', () => {
      const ladderManager = strategy.getLadderManager();
      expect(ladderManager).toBeDefined();
      expect(ladderManager.getConfig()).toEqual(config.ladderManager);
    });

    it('should be enabled when config.enabled = true', () => {
      expect(strategy.isEnabled()).toBe(true);
    });

    it('should be disabled when config.enabled = false', () => {
      const disabledConfig: ScalpingLadderTpConfig = { ...config, enabled: false };
      const disabledStrategy = new ScalpingLadderTpStrategy(disabledConfig, bybitService, logger);

      expect(disabledStrategy.isEnabled()).toBe(false);
    });
  });

  // ==========================================================================
  // WRAPPER PATTERN (NO_SIGNAL)
  // ==========================================================================

  describe('evaluate - wrapper pattern', () => {
    it('should always return NO_SIGNAL (wrapper strategy)', async () => {
      const data = createMockMarketData(1.0);

      const signal = await strategy.evaluate(data);

      expect(signal.valid).toBe(false);
      expect(signal.strategyName).toBe('ScalpingLadderTp');
      expect(signal.priority).toBe(2);
      expect(signal.reason).toBe('Wrapper strategy - does not generate signals');
    });

    it('should return NO_SIGNAL even when disabled', async () => {
      const disabledConfig: ScalpingLadderTpConfig = { ...config, enabled: false };
      const disabledStrategy = new ScalpingLadderTpStrategy(disabledConfig, bybitService, logger);

      const data = createMockMarketData(1.0);
      const signal = await disabledStrategy.evaluate(data);

      expect(signal.valid).toBe(false);
    });

    it('should return NO_SIGNAL with different market conditions', async () => {
      const data1 = createMockMarketData(1.0);
      const data2 = createMockMarketData(2.0);
      const data3 = createMockMarketData(0.5);

      const signal1 = await strategy.evaluate(data1);
      const signal2 = await strategy.evaluate(data2);
      const signal3 = await strategy.evaluate(data3);

      expect(signal1.valid).toBe(false);
      expect(signal2.valid).toBe(false);
      expect(signal3.valid).toBe(false);
    });
  });

  // ==========================================================================
  // SETUP LADDER TPS
  // ==========================================================================

  describe('setupLadderTps', () => {
    it('should setup ladder TPs for LONG position', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.0, 100);

      await strategy.setupLadderTps(position);

      const activeLadder = strategy.getActiveLadder();

      expect(activeLadder).not.toBeNull();
      expect(activeLadder!.position).toEqual(position);
      expect(activeLadder!.levels).toHaveLength(3);
      expect(activeLadder!.tp1Hit).toBe(false);
      expect(activeLadder!.tp2Hit).toBe(false);
      expect(activeLadder!.tp3Hit).toBe(false);

      // Check TP prices
      expect(activeLadder!.levels[0].targetPrice).toBe(1.0008); // 0.08% above entry
      expect(activeLadder!.levels[1].targetPrice).toBe(1.0015); // 0.15% above entry
      expect(activeLadder!.levels[2].targetPrice).toBe(1.0025); // 0.25% above entry
    });

    it('should setup ladder TPs for SHORT position', async () => {
      const position = createMockPosition(PositionSide.SHORT, 1.0, 100);

      await strategy.setupLadderTps(position);

      const activeLadder = strategy.getActiveLadder();

      expect(activeLadder).not.toBeNull();
      expect(activeLadder!.levels).toHaveLength(3);

      // Check TP prices
      expect(activeLadder!.levels[0].targetPrice).toBe(0.9992); // 0.08% below entry
      expect(activeLadder!.levels[1].targetPrice).toBe(0.9985); // 0.15% below entry
      expect(activeLadder!.levels[2].targetPrice).toBe(0.9975); // 0.25% below entry
    });

    it('should replace existing ladder when setup called again', async () => {
      const position1 = createMockPosition(PositionSide.LONG, 1.0, 100);
      const position2 = createMockPosition(PositionSide.SHORT, 2.0, 50);

      await strategy.setupLadderTps(position1);
      const ladder1 = strategy.getActiveLadder();

      await strategy.setupLadderTps(position2);
      const ladder2 = strategy.getActiveLadder();

      expect(ladder2).not.toEqual(ladder1);
      expect(ladder2!.position.entryPrice).toBe(2.0);
    });
  });

  // ==========================================================================
  // MONITOR TP1 HIT
  // ==========================================================================

  describe('monitor TP1 hit', () => {
    it('should execute partial close + move to breakeven when TP1 hit (LONG)', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.0, 100);

      bybitService.closePosition.mockResolvedValue(undefined);
      bybitService.updateStopLoss.mockResolvedValue(undefined);

      // Setup ladder
      await strategy.setupLadderTps(position);

      // Simulate price reaching TP1 (1.0008)
      const data = createMockMarketData(1.0008);
      await strategy.evaluate(data);

      const activeLadder = strategy.getActiveLadder();

      // TP1 should be hit
      expect(activeLadder!.tp1Hit).toBe(true);
      expect(activeLadder!.levels[0].hit).toBe(true);

      // Partial close should be executed (33%)
      expect(bybitService.closePosition).toHaveBeenCalledWith(PositionSide.LONG, 33);

      // SL should be moved to breakeven (1.0)
      expect(bybitService.updateStopLoss).toHaveBeenCalledWith(1.0);

      // Position quantity should be reduced
      expect(activeLadder!.position.quantity).toBe(67); // 100 * (1 - 0.33)
    });

    it('should execute partial close + move to breakeven when TP1 hit (SHORT)', async () => {
      const position = createMockPosition(PositionSide.SHORT, 1.0, 100);

      bybitService.closePosition.mockResolvedValue(undefined);
      bybitService.updateStopLoss.mockResolvedValue(undefined);

      await strategy.setupLadderTps(position);

      // Simulate price reaching TP1 (0.9992)
      const data = createMockMarketData(0.9992);
      await strategy.evaluate(data);

      const activeLadder = strategy.getActiveLadder();

      expect(activeLadder!.tp1Hit).toBe(true);
      expect(bybitService.closePosition).toHaveBeenCalledWith(PositionSide.SHORT, 33);
      expect(bybitService.updateStopLoss).toHaveBeenCalledWith(1.0);
    });

    it('should NOT trigger TP1 when price not reached', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.0, 100);

      await strategy.setupLadderTps(position);

      // Price below TP1
      const data = createMockMarketData(1.0005);
      await strategy.evaluate(data);

      const activeLadder = strategy.getActiveLadder();

      expect(activeLadder!.tp1Hit).toBe(false);
      expect(bybitService.closePosition).not.toHaveBeenCalled();
      expect(bybitService.updateStopLoss).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // MONITOR TP2 HIT
  // ==========================================================================

  describe('monitor TP2 hit', () => {
    it('should execute partial close when TP2 hit after TP1 (LONG)', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.0, 100);

      bybitService.closePosition.mockResolvedValue(undefined);
      bybitService.updateStopLoss.mockResolvedValue(undefined);

      await strategy.setupLadderTps(position);

      // TP1 hit
      const data1 = createMockMarketData(1.0008);
      await strategy.evaluate(data1);

      // Clear mocks
      bybitService.closePosition.mockClear();

      // TP2 hit (1.0015)
      const data2 = createMockMarketData(1.0015);
      await strategy.evaluate(data2);

      const activeLadder = strategy.getActiveLadder();

      expect(activeLadder!.tp2Hit).toBe(true);
      expect(activeLadder!.levels[1].hit).toBe(true);

      // Partial close should be executed (33% of remaining 67)
      expect(bybitService.closePosition).toHaveBeenCalledWith(PositionSide.LONG, expect.any(Number));

      // Position quantity should be reduced again
      // 67 * (1 - 0.33) ≈ 44.89
      expect(activeLadder!.position.quantity).toBeCloseTo(44.89, 1);
    });

    it('should NOT trigger TP2 before TP1 hit', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.0, 100);

      await strategy.setupLadderTps(position);

      // Jump directly to TP2 price without hitting TP1
      const data = createMockMarketData(1.0015);
      await strategy.evaluate(data);

      const activeLadder = strategy.getActiveLadder();

      // TP1 should be hit, TP2 should NOT
      expect(activeLadder!.tp1Hit).toBe(true); // TP1 gets hit when price passes it
      expect(activeLadder!.tp2Hit).toBe(false); // TP2 waits for TP1 flag
    });
  });

  // ==========================================================================
  // MONITOR TP3 HIT
  // ==========================================================================

  describe('monitor TP3 hit', () => {
    it('should execute final close and clear ladder when TP3 hit (LONG)', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.0, 100);

      bybitService.closePosition.mockResolvedValue(undefined);
      bybitService.updateStopLoss.mockResolvedValue(undefined);

      await strategy.setupLadderTps(position);

      // TP1 hit
      await strategy.evaluate(createMockMarketData(1.0008));

      // TP2 hit
      await strategy.evaluate(createMockMarketData(1.0015));

      // TP3 hit (1.0025)
      await strategy.evaluate(createMockMarketData(1.0025));

      const activeLadder = strategy.getActiveLadder();

      // Ladder should be cleared
      expect(activeLadder).toBeNull();
    });

    it('should NOT trigger TP3 before TP2 hit', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.0, 100);

      await strategy.setupLadderTps(position);

      // TP1 hit
      await strategy.evaluate(createMockMarketData(1.0008));

      // Jump to TP3 without TP2
      await strategy.evaluate(createMockMarketData(1.0025));

      const activeLadder = strategy.getActiveLadder();

      // TP2 should be hit, TP3 should NOT
      expect(activeLadder!.tp2Hit).toBe(true);
      expect(activeLadder!.tp3Hit).toBe(false);
    });
  });

  // ==========================================================================
  // MAX HOLDING TIME
  // ==========================================================================

  describe('max holding time', () => {
    it('should clear ladder when max holding time exceeded', async () => {
      const oldTimestamp = Date.now() - 400000; // 6 minutes ago (> 5 min max)
      const position = createMockPosition(PositionSide.LONG, 1.0, 100, oldTimestamp);

      await strategy.setupLadderTps(position);

      // Evaluate with current time
      const data = createMockMarketData(1.0005); // Not at TP yet
      await strategy.evaluate(data);

      const activeLadder = strategy.getActiveLadder();

      // Ladder should be cleared due to max holding time
      expect(activeLadder).toBeNull();
    });

    it('should NOT clear ladder when within max holding time', async () => {
      const recentTimestamp = Date.now() - 60000; // 1 minute ago (< 5 min max)
      const position = createMockPosition(PositionSide.LONG, 1.0, 100, recentTimestamp);

      await strategy.setupLadderTps(position);

      const data = createMockMarketData(1.0005);
      await strategy.evaluate(data);

      const activeLadder = strategy.getActiveLadder();

      expect(activeLadder).not.toBeNull();
    });

    it('should NOT check max holding time when maxHoldingTimeMs = 0', async () => {
      const noTimeoutConfig: ScalpingLadderTpConfig = {
        ...config,
        maxHoldingTimeMs: 0,
      };

      const noTimeoutStrategy = new ScalpingLadderTpStrategy(noTimeoutConfig, bybitService, logger);

      const oldTimestamp = Date.now() - 1000000; // Very old
      const position = createMockPosition(PositionSide.LONG, 1.0, 100, oldTimestamp);

      await noTimeoutStrategy.setupLadderTps(position);

      const data = createMockMarketData(1.0005);
      await noTimeoutStrategy.evaluate(data);

      const activeLadder = noTimeoutStrategy.getActiveLadder();

      expect(activeLadder).not.toBeNull(); // Should NOT be cleared
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle evaluate() when no active ladder', async () => {
      const data = createMockMarketData(1.0);

      // No ladder setup yet
      const signal = await strategy.evaluate(data);

      expect(signal.valid).toBe(false);
      expect(bybitService.closePosition).not.toHaveBeenCalled();
    });

    it('should allow manual ladder clear', () => {
      strategy.forceClearLadder();

      const activeLadder = strategy.getActiveLadder();

      expect(activeLadder).toBeNull();
    });

    it('should handle closePosition error gracefully', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.0, 100);

      bybitService.closePosition.mockRejectedValue(new Error('Bybit error'));
      bybitService.updateStopLoss.mockResolvedValue(undefined);

      await strategy.setupLadderTps(position);

      const data = createMockMarketData(1.0008);
      await strategy.evaluate(data);

      // Should not throw, just log error
      const activeLadder = strategy.getActiveLadder();
      expect(activeLadder!.tp1Hit).toBe(true);
    });

    it('should handle updateStopLoss error gracefully', async () => {
      const position = createMockPosition(PositionSide.LONG, 1.0, 100);

      bybitService.closePosition.mockResolvedValue(undefined);
      bybitService.updateStopLoss.mockRejectedValue(new Error('Bybit error'));

      await strategy.setupLadderTps(position);

      const data = createMockMarketData(1.0008);
      await strategy.evaluate(data);

      // Should not throw
      const activeLadder = strategy.getActiveLadder();
      expect(activeLadder!.tp1Hit).toBe(true);
    });
  });
});
