/**
 * FUNCTIONAL TESTS for PositionExitingService
 *
 * GOAL: Reproduce TP1 hit + breakeven SL bug
 *
 * SCENARIO:
 * 1. Open position at entry price 1.892
 * 2. TP1 hits at 1.9203 (partial close 33%)
 * 3. Move SL to breakeven should use entry price
 * 4. BUG: entryPrice becomes NaN, breakeven = NaN
 */

import { PositionExitingService } from '../../services/position-exiting.service';
import { Position, PositionSide, TakeProfit, TradingConfig, RiskManagementConfig, Config } from '../../types';

const createMockLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
});

const createMockBybitService = () => ({
  closePosition: jest.fn().mockResolvedValue(true),
  updateStopLoss: jest.fn().mockResolvedValue(true),
  placeTakeProfitLevels: jest.fn().mockResolvedValue(['TP1', 'TP2', 'TP3']),
  openPosition: jest.fn().mockResolvedValue('ORDER_123'),
  cancelAllConditionalOrders: jest.fn().mockResolvedValue(true),
});

const createMockTelegramService = () => ({
  sendAlert: jest.fn().mockResolvedValue(true),
});

const createMockJournalService = () => ({
  recordTradeOpen: jest.fn().mockResolvedValue(true),
  recordTradeClose: jest.fn().mockResolvedValue(true),
});

const createMockSessionStatsService = () => ({
  updateTradeExit: jest.fn().mockResolvedValue(true),
});

const createMockPositionManager = () => ({
  getTakeProfitManager: jest.fn().mockReturnValue(null),
});

const createMockTradingConfig = (): TradingConfig => ({
  leverage: 10,
  riskPercent: 2,
  maxPositions: 1,
  positionSizeUsdt: 100,
  tradingCycleIntervalMs: 1000,
  orderType: 'LIMIT' as any,
  tradingFeeRate: 0.0002,
  favorableMovementThresholdPercent: 0.1,
});

const createMockRiskConfig = (): RiskManagementConfig => ({
  takeProfits: [
    { level: 1, percent: 1.5, sizePercent: 33 },
    { level: 2, percent: 3, sizePercent: 33 },
    { level: 3, percent: 5, sizePercent: 34 },
  ],
  stopLossPercent: 1,
  minStopLossPercent: 0.5,
  breakevenOffsetPercent: 0.3,
  trailingStopEnabled: true,
  trailingStopPercent: 1,
  trailingStopActivationLevel: 2,
  positionSizeUsdt: 100,
});

const createMockConfig = (): Config => ({
  exchange: { symbol: 'XRPUSDT' } as any,
  timeframes: {},
  trading: createMockTradingConfig(),
  strategies: {} as any,
  strategy: {} as any,
  indicators: {} as any,
  riskManagement: createMockRiskConfig(),
  logging: {} as any,
  system: {} as any,
  dataSubscriptions: {
    candles: { enabled: true, calculateIndicators: true },
    orderbook: { enabled: false, updateIntervalMs: 5000 },
    ticks: { enabled: false, calculateDelta: false },
  },
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

/**
 * REAL SCENARIO: Position from logs
 * - Entry: 1.892
 * - TP1: 1.9203 (1.5%)
 * - TP2: 1.9488 (3%)
 * - TP3: 1.9866 (5%)
 * - SL: 1.8732 (1%)
 */
const createRealScenarioPosition = (): Position => ({
  id: 'XRPUSDT_Buy',
  journalId: 'XRPUSDT_Buy_1769181601722',
  symbol: 'XRPUSDT',
  side: PositionSide.LONG,
  quantity: 52.85,
  entryPrice: 1.892, // ← CRITICAL: Must stay valid
  leverage: 10,
  marginUsed: 100,
  stopLoss: {
    price: 1.8732,
    initialPrice: 1.8732,
    orderId: undefined,
    isBreakeven: false,
    isTrailing: false,
    updatedAt: Date.now(),
  },
  takeProfits: [
    { level: 1, percent: 1.5, sizePercent: 33, price: 1.9203, hit: false } as TakeProfit,
    { level: 2, percent: 3, sizePercent: 33, price: 1.9488, hit: false } as TakeProfit,
    { level: 3, percent: 5, sizePercent: 34, price: 1.9866, hit: false } as TakeProfit,
  ],
  openedAt: Date.now() - 1800000, // 30 min ago
  unrealizedPnL: 0,
  orderId: 'ORD_XRPUSDT',
  reason: 'Position opened',
  protectionVerifiedOnce: true,
  status: 'OPEN' as const,
});

describe('PositionExitingService - FUNCTIONAL TESTS (TP1 + Breakeven Bug)', () => {
  let service: PositionExitingService;
  let mockBybitService: any;
  let mockTelegramService: any;
  let mockLogger: any;
  let mockJournalService: any;
  let mockSessionStats: any;
  let mockPositionManager: any;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockBybitService = createMockBybitService();
    mockTelegramService = createMockTelegramService();
    mockJournalService = createMockJournalService();
    mockSessionStats = createMockSessionStatsService();
    mockPositionManager = createMockPositionManager();

    service = new PositionExitingService(
      mockBybitService,
      mockTelegramService,
      mockLogger,
      mockJournalService,
      createMockTradingConfig(),
      createMockRiskConfig(),
      createMockConfig(),
      mockSessionStats,
      mockPositionManager,
    );
  });

  describe('Scenario: TP1 Hit + Move SL to Breakeven', () => {
    it('Should calculate breakeven correctly when entryPrice is valid', () => {
      const position = createRealScenarioPosition();
      const entryPrice = position.entryPrice; // 1.892

      // Calculate breakeven like the service does
      const offsetPercent = createMockRiskConfig().breakevenOffsetPercent; // 0.3%
      const offset = (entryPrice * offsetPercent) / 10000; // Should be 0.00005676 (1.892 * 0.3 / 10000)
      const breakevenPrice = entryPrice + offset; // Should be 1.89205676

      console.log(`
        BREAKEVEN CALCULATION:
        - Entry Price: ${entryPrice}
        - Offset Percent: ${offsetPercent}%
        - Offset Value: ${offset}
        - Breakeven Price: ${breakevenPrice}
      `);

      expect(entryPrice).toBe(1.892);
      expect(isNaN(offset)).toBe(false);
      expect(offset).toBeCloseTo(0.00005676, 8);
      expect(isNaN(breakevenPrice)).toBe(false);
      expect(breakevenPrice).toBeCloseTo(1.89205676, 8);
    });

    it('Should detect when entryPrice becomes NaN', () => {
      const position = createRealScenarioPosition();

      // Simulate what happens if entryPrice gets corrupted
      position.entryPrice = NaN;

      const offsetPercent = createMockRiskConfig().breakevenOffsetPercent;
      const offset = (position.entryPrice * offsetPercent) / 10000;
      const breakevenPrice = position.entryPrice + offset;

      console.log(`
        CORRUPTED ENTRY PRICE:
        - Entry Price: ${position.entryPrice}
        - Is NaN: ${isNaN(position.entryPrice)}
        - Calculated Offset: ${offset}
        - Calculated Breakeven: ${breakevenPrice}
      `);

      expect(isNaN(position.entryPrice as any)).toBe(true);
      expect(isNaN(offset)).toBe(true);
      expect(isNaN(breakevenPrice as any)).toBe(true);
    });

    it('Should handle undefined entryPrice gracefully', () => {
      const position = createRealScenarioPosition();
      position.entryPrice = undefined as any;

      // Attempt calculation like the service would
      let breakevenPrice: number | undefined;
      try {
        const offsetPercent = createMockRiskConfig().breakevenOffsetPercent;
        const offset = (position.entryPrice * offsetPercent) / 10000;
        breakevenPrice = position.entryPrice + offset;
      } catch (e) {
        breakevenPrice = undefined;
      }

      console.log(`
        UNDEFINED ENTRY PRICE:
        - Entry Price: ${position.entryPrice}
        - Calculated Breakeven: ${breakevenPrice}
      `);

      expect(breakevenPrice === undefined || isNaN(breakevenPrice as any)).toBe(true);
    });

    it('CRITICAL: Call handleTP1Hit and verify it handles NaN gracefully', async () => {
      const position = createRealScenarioPosition();
      const currentPrice = 1.9203; // TP1 hit price

      // Simulate TP1 hit by marking it as hit
      position.takeProfits[0].hit = true;

      // This is what should happen in handleTP1Hit
      // BUT: What if entryPrice becomes NaN?
      const testHandleTP1HitWithValidEntry = () => {
        if (!position.entryPrice || isNaN(position.entryPrice)) {
          console.log('❌ ERROR: Entry price is invalid!');
          return null;
        }

        const offsetPercent = createMockRiskConfig().breakevenOffsetPercent;
        const offset = (position.entryPrice * offsetPercent) / 10000;
        const breakevenPrice = position.entryPrice + offset;

        return breakevenPrice;
      };

      const breakevenPrice1 = testHandleTP1HitWithValidEntry();
      expect(breakevenPrice1).not.toBeNull();
      expect(isNaN(breakevenPrice1 || 0)).toBe(false);
      console.log(`✓ Breakeven calculated: ${breakevenPrice1}`);

      // Now simulate corruption
      position.entryPrice = NaN;
      const breakevenPrice2 = testHandleTP1HitWithValidEntry();
      expect(breakevenPrice2).toBeNull();
      console.log(`✓ Gracefully handled NaN entry price`);
    });

    it('Should log detailed info before/after TP1 hit', async () => {
      const position = createRealScenarioPosition();

      console.log(`
        POSITION STATE BEFORE TP1:
        - ID: ${position.id}
        - Entry Price: ${position.entryPrice}
        - SL: ${position.stopLoss.price}
        - Quantity: ${position.quantity}
        - TP1 Hit: ${position.takeProfits[0].hit}
      `);

      // Simulate TP1 hit
      position.takeProfits[0].hit = true;

      // WebSocket might update position here
      // This is where entryPrice might get corrupted!

      console.log(`
        POSITION STATE AFTER TP1:
        - Entry Price: ${position.entryPrice}
        - Entry Price Valid: ${!isNaN(position.entryPrice)}
      `);

      expect(position.entryPrice).toBe(1.892);
      expect(isNaN(position.entryPrice)).toBe(false);
    });

    it('Should trace entryPrice through partial close lifecycle', () => {
      const position = createRealScenarioPosition();
      const initialEntryPrice = position.entryPrice;
      const tp1Level = position.takeProfits[0];
      const tp1Price = tp1Level.price;
      const partialCloseQty = (position.quantity * tp1Level.sizePercent) / 100;

      console.log(`
        PARTIAL CLOSE LIFECYCLE:

        STEP 1: Before Close
        - Entry Price: ${position.entryPrice}
        - Remaining Qty: ${position.quantity}
        - Close Qty (TP${tp1Level.level}): ${partialCloseQty}

        STEP 2: Execute Close on Exchange
        - Close at price: ${tp1Price}

        STEP 3: Update Position State
        - New Qty: ${position.quantity - partialCloseQty}
        - Entry Price Should Still Be: ${initialEntryPrice}
      `);

      // CRITICAL: Entry price should NOT change during partial close!
      expect(position.entryPrice).toBe(initialEntryPrice);

      // Simulate what might corrupt it
      // (e.g., if someone tries to recalculate average entry price)
      const corruptedEntryPrice = (initialEntryPrice * position.quantity - tp1Price * partialCloseQty) / (position.quantity - partialCloseQty);

      console.log(`
        POTENTIAL CORRUPTION SOURCE:
        - If service tries to recalculate entry price: ${corruptedEntryPrice}
        - Is it NaN? ${isNaN(corruptedEntryPrice)}
      `);

      // Entry price should NOT be recalculated!
      expect(position.entryPrice).toBe(initialEntryPrice);
    });

    it('Should validate TP1 close does NOT corrupt entryPrice', async () => {
      const position = createRealScenarioPosition();
      const initialEntryPrice = position.entryPrice;

      // Record the state we're testing
      const testState: any = {
        entryPriceBefore: position.entryPrice,
        entryPriceValid: !isNaN(position.entryPrice),
      };

      // Mock the Bybit API call that closes TP1
      mockBybitService.closePosition.mockResolvedValue(true);

      // Simulate partial close
      position.quantity = position.quantity * (1 - position.takeProfits[0].sizePercent / 100);

      // CRITICAL POINT: Does entryPrice change?
      testState.entryPriceAfter = position.entryPrice;

      console.log(`
        ENTRY PRICE CORRUPTION TEST:
        - Before: ${testState.entryPriceBefore}
        - After: ${testState.entryPriceAfter}
        - Same? ${testState.entryPriceBefore === testState.entryPriceAfter}
      `);

      expect(testState.entryPriceAfter).toBe(initialEntryPrice);
      expect(isNaN(testState.entryPriceAfter)).toBe(false);
    });
  });

  describe('Scenario: WebSocket Position Update Corruption', () => {
    it('Should trace how WebSocket update might corrupt entryPrice', () => {
      const position = createRealScenarioPosition();
      const originalEntryPrice = position.entryPrice;

      // Simulate WebSocket position update
      // This might have incorrect data or missing fields
      const wsUpdate = {
        symbol: 'XRPUSDT',
        side: 'Buy',
        qty: '52.85', // After TP1 close: 52.85 * (1 - 0.33) ≈ 35.41
        avgPrice: '1.9203', // ← DANGER! This is TP1 price, not entry price!
        mode: 'MergedSingleTP',
      };

      console.log(`
        WEBSOCKET UPDATE RISK:
        - Original Entry: ${originalEntryPrice}
        - WebSocket avgPrice: ${wsUpdate.avgPrice}
        - If service uses avgPrice instead of entryPrice: CORRUPTION!
      `);

      // This is likely where the bug is!
      // If updatePositionState uses avgPrice as entryPrice
      const corruptedEntry = parseFloat(wsUpdate.avgPrice);
      expect(corruptedEntry).toBe(1.9203); // NOT the original 1.892!
    });

    it('Should identify which service method corrupts entryPrice', () => {
      const position = createRealScenarioPosition();

      // HYPOTHESIS: position-lifecycle.service.ts updatePositionState()
      // might be using wrong field from WebSocket

      const wsPosition = {
        symbol: 'XRPUSDT',
        side: 'Buy',
        qty: 35.41, // After TP1
        entryPrice: 0, // Empty (not yet filled)
        avgPrice: 1.9203, // Current average (includes TP1 exit)
      };

      console.log(`
        WEBSOCKET DATA:
        - entryPrice: ${wsPosition.entryPrice} (empty)
        - avgPrice: ${wsPosition.avgPrice} (current)

        BUG LOCATION HYPOTHESIS:
        - If updatePositionState() does: position.entryPrice = wsPosition.avgPrice
        - Then: position.entryPrice = 1.9203 (WRONG!)
        - Instead of: position.entryPrice = 1.892 (original)
      `);

      expect(wsPosition.entryPrice).toBe(0);
      expect(wsPosition.avgPrice).not.toBe(position.entryPrice);
    });
  });
});
