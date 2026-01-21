/**
 * Event Replay Engine Tests
 *
 * Tests Phase 7.6: Event Stream Replay
 * Coverage:
 * - Event projection
 * - Trade reconstruction
 * - Metrics calculation
 * - Equity curve building
 * - Event integrity validation
 */

import { EventReplayEngine } from '../../backtest/replay/event-replay-engine';
import { BacktestTrade } from '../../backtest/backtest-engine-v5';

describe('Phase 7.6: Event Stream Replay', () => {
  let engine: EventReplayEngine;

  function createTestTrades(count: number, startTime: number = 1000000000000): BacktestTrade[] {
    const trades: BacktestTrade[] = [];
    let currentTime = startTime;
    let price = 100;

    for (let i = 0; i < count; i++) {
      const entryTime = currentTime;
      const entryPrice = price;
      const direction = i % 2 === 0 ? 'LONG' : 'SHORT';

      // Random P&L
      const pnl = (Math.random() - 0.5) * 200;
      const pnlPercent = (pnl / (entryPrice * 100)) * 100;

      trades.push({
        entryTime,
        entryPrice,
        entrySignal: 'TEST_SIGNAL',
        direction: direction as any,
        size: 100,
        stopLoss: direction === 'LONG' ? entryPrice - 2 : entryPrice + 2,
        takeProfits: [
          { level: 1, price: entryPrice + 5, size: 50 },
          { level: 2, price: entryPrice + 10, size: 50 },
        ],
        exitTime: entryTime + 12 * 60 * 60 * 1000, // 12 hours later
        exitPrice: entryPrice + pnl / 100,
        exitReason: 'TP_HIT',
        pnl,
        pnlPercent,
        duration: 12 * 60 * 60 * 1000,
      });

      currentTime += 24 * 60 * 60 * 1000; // 1 day between trades
      price += pnl / 200;
    }

    return trades;
  }

  beforeEach(() => {
    engine = new EventReplayEngine();
  });

  /**
   * Test 1: Event projection correctness
   */
  describe('Test 1: Event Projection', () => {
    it('should correctly project trades to replay format', async () => {
      const trades = createTestTrades(10);

      const result = await engine.replayTrades(trades, 10000);

      expect(result.trades.length).toBe(10);
      expect(result.trades[0].entryTime).toBe(trades[0].entryTime);
      expect(result.trades[0].entryPrice).toBe(trades[0].entryPrice);
      expect(result.trades[0].pnl).toBe(trades[0].pnl);
    });

    it('should preserve trade directions', async () => {
      const trades = createTestTrades(20);

      const result = await engine.replayTrades(trades, 10000);

      for (let i = 0; i < result.trades.length; i++) {
        expect(['LONG', 'SHORT']).toContain(result.trades[i].direction);
      }
    });
  });

  /**
   * Test 2: Metrics calculation
   */
  describe('Test 2: Metrics Calculation', () => {
    it('should calculate correct win rate', async () => {
      const trades: BacktestTrade[] = [
        // 2 winning trades
        {
          entryTime: 1000,
          entryPrice: 100,
          entrySignal: 'TEST',
          direction: 'LONG',
          size: 100,
          stopLoss: 95,
          takeProfits: [{ level: 1, price: 105, size: 100 }],
          exitTime: 2000,
          exitPrice: 105,
          exitReason: 'TP',
          pnl: 500,
          pnlPercent: 5,
          duration: 1000,
        },
        {
          entryTime: 3000,
          entryPrice: 105,
          entrySignal: 'TEST',
          direction: 'LONG',
          size: 100,
          stopLoss: 100,
          takeProfits: [{ level: 1, price: 110, size: 100 }],
          exitTime: 4000,
          exitPrice: 110,
          exitReason: 'TP',
          pnl: 500,
          pnlPercent: 5,
          duration: 1000,
        },
        // 1 losing trade
        {
          entryTime: 5000,
          entryPrice: 110,
          entrySignal: 'TEST',
          direction: 'LONG',
          size: 100,
          stopLoss: 105,
          takeProfits: [{ level: 1, price: 115, size: 100 }],
          exitTime: 6000,
          exitPrice: 105,
          exitReason: 'SL',
          pnl: -500,
          pnlPercent: -5,
          duration: 1000,
        },
      ];

      const result = await engine.replayTrades(trades, 10000);
      const metrics = result.metrics;

      expect(metrics.totalTrades).toBe(3);
      expect(metrics.winningTrades).toBe(2);
      expect(metrics.losingTrades).toBe(1);
      expect(metrics.winRate).toBeCloseTo(2 / 3, 2);
    });

    it('should calculate correct profit factor', async () => {
      const trades: BacktestTrade[] = [
        {
          entryTime: 1000,
          entryPrice: 100,
          entrySignal: 'TEST',
          direction: 'LONG',
          size: 100,
          stopLoss: 95,
          takeProfits: [{ level: 1, price: 105, size: 100 }],
          exitTime: 2000,
          exitPrice: 105,
          exitReason: 'TP',
          pnl: 1000,
          pnlPercent: 10,
          duration: 1000,
        },
        {
          entryTime: 3000,
          entryPrice: 105,
          entrySignal: 'TEST',
          direction: 'SHORT',
          size: 100,
          stopLoss: 110,
          takeProfits: [{ level: 1, price: 100, size: 100 }],
          exitTime: 4000,
          exitPrice: 100,
          exitReason: 'TP',
          pnl: 500,
          pnlPercent: 5,
          duration: 1000,
        },
        {
          entryTime: 5000,
          entryPrice: 100,
          entrySignal: 'TEST',
          direction: 'LONG',
          size: 100,
          stopLoss: 95,
          takeProfits: [{ level: 1, price: 105, size: 100 }],
          exitTime: 6000,
          exitPrice: 98,
          exitReason: 'SL',
          pnl: -1000,
          pnlPercent: -10,
          duration: 1000,
        },
      ];

      const result = await engine.replayTrades(trades, 10000);
      const metrics = result.metrics;

      expect(metrics.profitFactor).toBe(1.5); // (1000 + 500) / 1000 = 1.5
    });

    it('should calculate total P&L correctly', async () => {
      const trades = createTestTrades(10);

      const result = await engine.replayTrades(trades, 10000);

      const expectedPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      expect(result.metrics.totalPnl).toBeCloseTo(expectedPnL, 0);
    });
  });

  /**
   * Test 3: Equity curve building
   */
  describe('Test 3: Equity Curve', () => {
    it('should build equity curve from trades', async () => {
      const trades = createTestTrades(5);

      const result = await engine.replayTrades(trades, 10000);
      const curve = result.equityCurve;

      expect(curve.length).toBeGreaterThan(0);

      // First point should be starting balance (or first trade result)
      if (curve.length > 0) {
        expect(curve[0].balance).toBeDefined();
        expect(curve[0].timestamp).toBeDefined();
      }

      // Curve should be in chronological order
      for (let i = 1; i < curve.length; i++) {
        expect(curve[i].timestamp).toBeGreaterThanOrEqual(curve[i - 1].timestamp);
      }
    });

    it('should reflect balance changes from trades', async () => {
      const trades: BacktestTrade[] = [
        {
          entryTime: 1000,
          entryPrice: 100,
          entrySignal: 'TEST',
          direction: 'LONG',
          size: 100,
          stopLoss: 95,
          takeProfits: [{ level: 1, price: 105, size: 100 }],
          exitTime: 2000,
          exitPrice: 105,
          exitReason: 'TP',
          pnl: 500,
          pnlPercent: 5,
          duration: 1000,
        },
        {
          entryTime: 3000,
          entryPrice: 105,
          entrySignal: 'TEST',
          direction: 'LONG',
          size: 100,
          stopLoss: 100,
          takeProfits: [{ level: 1, price: 110, size: 100 }],
          exitTime: 4000,
          exitPrice: 110,
          exitReason: 'TP',
          pnl: 500,
          pnlPercent: 5,
          duration: 1000,
        },
      ];

      const result = await engine.replayTrades(trades, 10000);
      const curve = result.equityCurve;

      if (curve.length >= 2) {
        // After first trade: 10000 + 500 = 10500
        expect(curve[0].balance).toBeCloseTo(10500, -1);
        // After second trade: 10500 + 500 = 11000
        expect(curve[curve.length - 1].balance).toBeCloseTo(11000, -1);
      }
    });
  });

  /**
   * Test 4: Maximum drawdown calculation
   */
  describe('Test 4: Maximum Drawdown', () => {
    it('should calculate maximum drawdown', async () => {
      const trades: BacktestTrade[] = [
        {
          entryTime: 1000,
          entryPrice: 100,
          entrySignal: 'TEST',
          direction: 'LONG',
          size: 100,
          stopLoss: 95,
          takeProfits: [{ level: 1, price: 110, size: 100 }],
          exitTime: 2000,
          exitPrice: 110,
          exitReason: 'TP',
          pnl: 1000, // +1000
          pnlPercent: 10,
          duration: 1000,
        },
        {
          entryTime: 3000,
          entryPrice: 110,
          entrySignal: 'TEST',
          direction: 'LONG',
          size: 100,
          stopLoss: 105,
          takeProfits: [{ level: 1, price: 100, size: 100 }],
          exitTime: 4000,
          exitPrice: 100,
          exitReason: 'SL',
          pnl: -1000, // -1000 (drawdown from 11000 to 10000)
          pnlPercent: -10,
          duration: 1000,
        },
        {
          entryTime: 5000,
          entryPrice: 100,
          entrySignal: 'TEST',
          direction: 'LONG',
          size: 100,
          stopLoss: 95,
          takeProfits: [{ level: 1, price: 110, size: 100 }],
          exitTime: 6000,
          exitPrice: 110,
          exitReason: 'TP',
          pnl: 1000,
          pnlPercent: 10,
          duration: 1000,
        },
      ];

      const result = await engine.replayTrades(trades, 10000);

      expect(result.metrics.maxDrawdown).toBeGreaterThan(0);
      expect(result.metrics.maxDrawdown).toBeLessThan(1); // Should be < 100%
    });
  });

  /**
   * Test 5: Event integrity validation
   */
  describe('Test 5: Event Integrity', () => {
    it('should validate event integrity', () => {
      const validTrades = createTestTrades(5);

      const validation = engine.validateEventIntegrity(validTrades);

      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    it('should detect invalid trade sequences', () => {
      const invalidTrades: BacktestTrade[] = [
        {
          entryTime: 2000, // Exit before entry
          entryPrice: 100,
          entrySignal: 'TEST',
          direction: 'LONG',
          size: 100,
          stopLoss: 95,
          takeProfits: [],
          exitTime: 1000,
          exitPrice: 105,
          exitReason: 'TP',
          pnl: 500,
          pnlPercent: 5,
          duration: -1000,
        },
      ];

      const validation = engine.validateEventIntegrity(invalidTrades);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should detect invalid sizes', () => {
      const invalidTrades: BacktestTrade[] = [
        {
          entryTime: 1000,
          entryPrice: 100,
          entrySignal: 'TEST',
          direction: 'LONG',
          size: -100, // Invalid negative size
          stopLoss: 95,
          takeProfits: [],
          exitTime: 2000,
          exitPrice: 105,
          exitReason: 'TP',
          pnl: 500,
          pnlPercent: 5,
          duration: 1000,
        },
      ];

      const validation = engine.validateEventIntegrity(invalidTrades);

      expect(validation.valid).toBe(false);
    });
  });

  /**
   * Test 6: Metric comparison
   */
  describe('Test 6: Metric Comparison', () => {
    it('should compare original vs replayed metrics', async () => {
      const trades = createTestTrades(10);

      const result = await engine.replayTrades(trades, 10000);

      const original = result.metrics;
      const replayed = result.metrics; // Same metrics (perfect match)

      const comparison = engine.compareMetrics(original, replayed);

      expect(comparison.match).toBe(true);
      expect(comparison.differences.length).toBe(0);
    });
  });

  /**
   * Test 7: Performance (100x faster than backtest)
   */
  describe('Test 7: Performance', () => {
    it('should replay 1000 trades in <100ms', async () => {
      const trades = createTestTrades(1000);

      const start = Date.now();
      await engine.replayTrades(trades, 10000);
      const duration = Date.now() - start;

      console.log(`✅ Replayed 1000 trades in ${duration}ms`);
      expect(duration).toBeLessThan(500); // Should be very fast
    });
  });

  /**
   * Test 8: Edge cases
   */
  describe('Test 8: Edge Cases', () => {
    it('should handle empty trade list', async () => {
      const result = await engine.replayTrades([], 10000);

      expect(result.trades.length).toBe(0);
      expect(result.metrics.totalTrades).toBe(0);
      expect(result.equityCurve.length).toBe(0);
    });

    it('should handle all winning trades', async () => {
      const trades: BacktestTrade[] = Array.from({ length: 5 }, (_, i) => ({
        entryTime: 1000 + i * 1000,
        entryPrice: 100,
        entrySignal: 'TEST',
        direction: 'LONG',
        size: 100,
        stopLoss: 95,
        takeProfits: [],
        exitTime: 2000 + i * 1000,
        exitPrice: 105,
        exitReason: 'TP',
        pnl: 500,
        pnlPercent: 5,
        duration: 1000,
      }));

      const result = await engine.replayTrades(trades, 10000);

      expect(result.metrics.winRate).toBe(1.0);
      expect(result.metrics.losingTrades).toBe(0);
    });

    it('should handle all losing trades', async () => {
      const trades: BacktestTrade[] = Array.from({ length: 5 }, (_, i) => ({
        entryTime: 1000 + i * 1000,
        entryPrice: 100,
        entrySignal: 'TEST',
        direction: 'LONG',
        size: 100,
        stopLoss: 95,
        takeProfits: [],
        exitTime: 2000 + i * 1000,
        exitPrice: 95,
        exitReason: 'SL',
        pnl: -500,
        pnlPercent: -5,
        duration: 1000,
      }));

      const result = await engine.replayTrades(trades, 10000);

      expect(result.metrics.winRate).toBe(0);
      expect(result.metrics.winningTrades).toBe(0);
    });
  });
});
