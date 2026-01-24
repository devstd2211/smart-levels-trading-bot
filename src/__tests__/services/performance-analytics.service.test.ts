/**
 * Phase 9.1: Performance Analytics Service Tests
 *
 * Unit tests for PerformanceAnalytics service
 * Tests trade performance calculations and analysis
 *
 * Coverage:
 * - Win rate calculation
 * - Profit factor analysis
 * - Sharpe/Sortino ratio calculation
 * - Maximum drawdown analysis
 * - Period-based metrics (ALL/TODAY/WEEK/MONTH)
 * - Top/worst trade identification
 */

import { PerformanceAnalytics } from '../../services/performance-analytics.service';
import { TradingJournalService } from '../../services/trading-journal.service';
import { LoggerService } from '../../types';
import { PerformanceAnalyticsConfig } from '../../types/live-trading.types';

// ============================================================================
// MOCKS & FIXTURES
// ============================================================================

const mockConfig: PerformanceAnalyticsConfig = {
  enabled: true,
  metricsInterval: 10,
  historicalPeriods: {
    last10Trades: true,
    last30Trades: true,
    last100Trades: true,
    sessionMetrics: true,
    allTimeMetrics: true,
  },
};

const createMockTrade = (overrides?: any) => {
  const baseTrade = {
    tradeId: `trade-${Math.random()}`,
    symbol: 'BTCUSDT',
    direction: 'LONG',
    entryPrice: 45000,
    exitPrice: 45450,
    pnl: 450,
    pnlPercent: 1.0,
    entryTime: Date.now() - 3600000, // 1 hour ago
    exitTime: Date.now(),
    openedAt: Date.now() - 3600000,
    exitReason: 'TAKE_PROFIT',
  };
  return { ...baseTrade, ...overrides };
};

describe('PerformanceAnalytics Service Tests', () => {
  let analytics: PerformanceAnalytics;
  let mockJournalService: jest.Mocked<TradingJournalService>;
  let mockLogger: jest.Mocked<LoggerService>;

  beforeEach(() => {
    // Create mocks
    mockJournalService = {
      getAllTrades: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    // Initialize analytics
    analytics = new PerformanceAnalytics(
      mockConfig,
      mockJournalService,
      mockLogger
    );
  });

  // ========================================================================
  // WIN RATE CALCULATION TESTS
  // ========================================================================

  describe('Win Rate Calculation', () => {
    it('should calculate 100% win rate with all profitable trades', () => {
      const trades = [
        createMockTrade({ pnl: 100, pnlPercent: 1.0 }),
        createMockTrade({ pnl: 200, pnlPercent: 2.0 }),
        createMockTrade({ pnl: 150, pnlPercent: 1.5 }),
      ];

      const winRate = analytics.calculateWinRate(trades);

      expect(winRate).toBe(100);
    });

    it('should calculate 0% win rate with all losing trades', () => {
      const trades = [
        createMockTrade({ pnl: -100, pnlPercent: -1.0 }),
        createMockTrade({ pnl: -200, pnlPercent: -2.0 }),
        createMockTrade({ pnl: -150, pnlPercent: -1.5 }),
      ];

      const winRate = analytics.calculateWinRate(trades);

      expect(winRate).toBe(0);
    });

    it('should calculate 50% win rate with mixed trades', () => {
      const trades = [
        createMockTrade({ pnl: 100, pnlPercent: 1.0 }),
        createMockTrade({ pnl: -100, pnlPercent: -1.0 }),
      ];

      const winRate = analytics.calculateWinRate(trades);

      expect(winRate).toBe(50);
    });

    it('should return 0 for empty trade list', () => {
      const winRate = analytics.calculateWinRate([]);

      expect(winRate).toBe(0);
    });
  });

  // ========================================================================
  // PROFIT FACTOR ANALYSIS TESTS
  // ========================================================================

  describe('Profit Factor Analysis', () => {
    it('should calculate profit factor > 1 for profitable trades', () => {
      const trades = [
        createMockTrade({ pnl: 500 }), // +500
        createMockTrade({ pnl: 300 }), // +300
        createMockTrade({ pnl: -200 }), // -200
      ];

      const profitFactor = analytics.calculateProfitFactor(trades);

      // Gross profit: 500 + 300 = 800
      // Gross loss: 200
      // Profit Factor: 800 / 200 = 4.0
      expect(profitFactor).toBe(4.0);
    });

    it('should return 100 when all trades are profitable', () => {
      const trades = [
        createMockTrade({ pnl: 100 }),
        createMockTrade({ pnl: 200 }),
      ];

      const profitFactor = analytics.calculateProfitFactor(trades);

      expect(profitFactor).toBe(100); // Profit / 0 loss = 100 (cap)
    });

    it('should return 0 when all trades are losses', () => {
      const trades = [
        createMockTrade({ pnl: -100 }),
        createMockTrade({ pnl: -200 }),
      ];

      const profitFactor = analytics.calculateProfitFactor(trades);

      expect(profitFactor).toBe(0); // 0 profit / loss = 0
    });

    it('should return 0 for empty trade list', () => {
      const profitFactor = analytics.calculateProfitFactor([]);

      expect(profitFactor).toBe(0);
    });
  });

  // ========================================================================
  // SHARPE & SORTINO RATIO TESTS
  // ========================================================================

  describe('Sharpe & Sortino Ratios', () => {
    it('should calculate Sharpe ratio > 0 for consistent profits', async () => {
      const trades = [
        createMockTrade({ pnl: 100 }),
        createMockTrade({ pnl: 120 }),
        createMockTrade({ pnl: 110 }),
      ];
      mockJournalService.getAllTrades.mockReturnValue(trades);

      const stats = await analytics.getMetrics('ALL');

      expect(stats.sharpeRatio).toBeGreaterThan(0);
    });

    it('should calculate Sortino ratio > Sharpe for mixed performance', async () => {
      const trades = [
        createMockTrade({ pnl: 500 }), // Big win
        createMockTrade({ pnl: -100 }), // Small loss
        createMockTrade({ pnl: 300 }), // Good win
      ];
      mockJournalService.getAllTrades.mockReturnValue(trades);

      const stats = await analytics.getMetrics('ALL');

      // Sortino should be >= Sharpe (penalizes downside less)
      expect(stats.sortinoRatio).toBeGreaterThanOrEqual(stats.sharpeRatio);
    });

    it('should return 0 for single trade', async () => {
      const trades = [createMockTrade({ pnl: 100 })];
      mockJournalService.getAllTrades.mockReturnValue(trades);

      const stats = await analytics.getMetrics('ALL');

      expect(stats.sharpeRatio).toBe(0);
      expect(stats.sortinoRatio).toBe(0);
    });
  });

  // ========================================================================
  // MAXIMUM DRAWDOWN TESTS
  // ========================================================================

  describe('Maximum Drawdown Analysis', () => {
    it('should calculate max drawdown as 0 for consistently profitable trades', async () => {
      const trades = [
        createMockTrade({ pnl: 100 }),
        createMockTrade({ pnl: 200 }),
        createMockTrade({ pnl: 150 }),
      ];
      mockJournalService.getAllTrades.mockReturnValue(trades);

      const stats = await analytics.getMetrics('ALL');

      expect(stats.maxDrawdown).toBe(0);
    });

    it('should detect max drawdown when peak followed by loss', async () => {
      const trades = [
        createMockTrade({ pnl: 1000 }), // Peak at 1000
        createMockTrade({ pnl: -600 }), // Drop to 400
      ];
      mockJournalService.getAllTrades.mockReturnValue(trades);

      const stats = await analytics.getMetrics('ALL');

      // Max drawdown: (1000 - 400) / 1000 = 60%
      expect(stats.maxDrawdown).toBeCloseTo(60, 1);
    });

    it('should handle continuous drawdown correctly', async () => {
      const trades = [
        createMockTrade({ pnl: 500 }),
        createMockTrade({ pnl: -200 }),
        createMockTrade({ pnl: -150 }),
      ];
      mockJournalService.getAllTrades.mockReturnValue(trades);

      const stats = await analytics.getMetrics('ALL');

      expect(stats.maxDrawdown).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // PERIOD-BASED METRICS TESTS
  // ========================================================================

  describe('Period-Based Metrics', () => {
    it('should return all trades for ALL period', async () => {
      const trades = [
        createMockTrade({ openedAt: Date.now() - 86400000 * 40 }), // 40 days ago
        createMockTrade({ openedAt: Date.now() - 100 }), // Just now
      ];
      mockJournalService.getAllTrades.mockReturnValue(trades);

      const stats = await analytics.getMetrics('ALL');

      expect(stats.totalTrades).toBe(2);
    });

    it('should filter trades for TODAY period', async () => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const todayTimestamp = today.getTime();

      const trades = [
        createMockTrade({
          openedAt: todayTimestamp + 3600000, // Today
          entryTime: todayTimestamp + 3600000,
        }),
        createMockTrade({
          openedAt: todayTimestamp - 86400000, // Yesterday
          entryTime: todayTimestamp - 86400000,
        }),
      ];
      mockJournalService.getAllTrades.mockReturnValue(trades);

      const stats = await analytics.getMetrics('TODAY');

      expect(stats.totalTrades).toBe(1);
    });

    it('should filter trades for WEEK period', async () => {
      const now = Date.now();
      const trades = [
        createMockTrade({ openedAt: now - 86400000 * 5 }), // 5 days ago (in week)
        createMockTrade({ openedAt: now - 86400000 * 15 }), // 15 days ago (outside week)
      ];
      mockJournalService.getAllTrades.mockReturnValue(trades);

      const stats = await analytics.getMetrics('WEEK');

      expect(stats.totalTrades).toBe(1);
    });

    it('should filter trades for MONTH period', async () => {
      const now = Date.now();
      const trades = [
        createMockTrade({ openedAt: now - 86400000 * 20 }), // 20 days ago (in month)
        createMockTrade({ openedAt: now - 86400000 * 50 }), // 50 days ago (outside month)
      ];
      mockJournalService.getAllTrades.mockReturnValue(trades);

      const stats = await analytics.getMetrics('MONTH');

      expect(stats.totalTrades).toBe(1);
    });
  });

  // ========================================================================
  // TOP/WORST TRADES TESTS
  // ========================================================================

  describe('Top/Worst Trades Identification', () => {
    it('should identify top (best) trades sorted by PnL', async () => {
      const trades = [
        createMockTrade({ tradeId: 'trade1', pnl: 100 }),
        createMockTrade({ tradeId: 'trade2', pnl: 500 }), // Largest
        createMockTrade({ tradeId: 'trade3', pnl: 250 }),
      ];
      mockJournalService.getAllTrades.mockReturnValue(trades);

      const topTrades = await analytics.getTopTrades(2);

      expect(topTrades.length).toBe(2);
      expect(topTrades[0].tradeId).toBe('trade2'); // 500 is largest
      expect(topTrades[1].tradeId).toBe('trade3'); // 250 is second
    });

    it('should identify worst (losing) trades sorted by PnL', async () => {
      const trades = [
        createMockTrade({ tradeId: 'trade1', pnl: 100 }),
        createMockTrade({ tradeId: 'trade2', pnl: -200 }), // Smallest (worst)
        createMockTrade({ tradeId: 'trade3', pnl: -50 }),
      ];
      mockJournalService.getAllTrades.mockReturnValue(trades);

      const worstTrades = await analytics.getWorstTrades(2);

      expect(worstTrades.length).toBe(2);
      expect(worstTrades[0].tradeId).toBe('trade2'); // -200 is worst
      expect(worstTrades[1].tradeId).toBe('trade3'); // -50 is second worst
    });

    it('should respect limit parameter for top trades', async () => {
      const trades = [
        createMockTrade({ pnl: 100 }),
        createMockTrade({ pnl: 200 }),
        createMockTrade({ pnl: 300 }),
        createMockTrade({ pnl: 400 }),
      ];
      mockJournalService.getAllTrades.mockReturnValue(trades);

      const topTrades = await analytics.getTopTrades(2);

      expect(topTrades.length).toBe(2);
    });
  });

  // ========================================================================
  // COMPREHENSIVE METRICS TESTS
  // ========================================================================

  describe('Comprehensive Metrics', () => {
    it('should calculate all metrics for a mixed trade set', async () => {
      const trades = [
        createMockTrade({ pnl: 500, pnlPercent: 5.0 }),
        createMockTrade({ pnl: 300, pnlPercent: 3.0 }),
        createMockTrade({ pnl: -100, pnlPercent: -1.0 }),
        createMockTrade({ pnl: 200, pnlPercent: 2.0 }),
      ];
      mockJournalService.getAllTrades.mockReturnValue(trades);

      const stats = await analytics.getMetrics('ALL');

      expect(stats.totalTrades).toBe(4);
      expect(stats.winRate).toBeGreaterThan(0);
      expect(stats.lossRate).toBeGreaterThan(0);
      expect(stats.profitFactor).toBeGreaterThan(1);
      expect(stats.totalPnL).toBe(900);
    });

    it('should return empty statistics when no trades', async () => {
      mockJournalService.getAllTrades.mockReturnValue([]);

      const stats = await analytics.getMetrics('ALL');

      expect(stats.totalTrades).toBe(0);
      expect(stats.winRate).toBe(0);
      expect(stats.profitFactor).toBe(0);
      expect(stats.sharpeRatio).toBe(0);
    });

    it('should calculate average holding time correctly', () => {
      const now = Date.now();
      const trades = [
        createMockTrade({
          entryTime: now - 3600000, // 1 hour
          exitTime: now,
        }),
        createMockTrade({
          entryTime: now - 7200000, // 2 hours
          exitTime: now,
        }),
      ];

      const avgHoldTime = analytics.calculateAverageHoldTime(trades);

      // Average of 60 + 120 = 180 / 2 = 90 minutes
      expect(avgHoldTime).toBe(90);
    });
  });

  // ========================================================================
  // CACHE MANAGEMENT TESTS
  // ========================================================================

  describe('Cache Management', () => {
    it('should clear metrics cache', () => {
      // Add something to cache by getting statistics
      analytics.getStatistics();

      // Clear cache
      analytics.clearCache();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Cleared metrics cache')
      );
    });

    it('should provide cache statistics', () => {
      const stats = analytics.getStatistics();

      expect(stats.cacheSize).toBeDefined();
      expect(stats.totalAnalyzed).toBeDefined();
      expect(stats.lastUpdateTime).toBeDefined();
    });
  });

  // ========================================================================
  // EDGE CASES & BOUNDARY TESTS
  // ========================================================================

  describe('Edge Cases & Boundaries', () => {
    it('should handle trades with zero PnL', async () => {
      const trades = [
        createMockTrade({ pnl: 0, pnlPercent: 0 }),
        createMockTrade({ pnl: 100, pnlPercent: 1.0 }),
      ];
      mockJournalService.getAllTrades.mockReturnValue(trades);

      const stats = await analytics.getMetrics('ALL');

      expect(stats.totalTrades).toBe(2);
      expect(stats.winRate).toBe(50); // Only 1 of 2 is profitable
    });

    it('should handle very large profit factors', async () => {
      const trades = [
        createMockTrade({ pnl: 10000 }),
        createMockTrade({ pnl: 5000 }),
        createMockTrade({ pnl: -1 }), // Very small loss
      ];
      mockJournalService.getAllTrades.mockReturnValue(trades);

      const stats = await analytics.getMetrics('ALL');

      expect(stats.profitFactor).toBeGreaterThan(10000);
    });

    it('should handle identical pnl trades', async () => {
      const trades = [
        createMockTrade({ pnl: 100 }),
        createMockTrade({ pnl: 100 }),
        createMockTrade({ pnl: 100 }),
      ];

      const avgHoldTime = analytics.calculateAverageHoldTime(trades);

      expect(avgHoldTime).toBeGreaterThan(0);
    });
  });
});
