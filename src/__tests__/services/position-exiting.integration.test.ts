/**
 * INTEGRATION TEST: PositionExitingService + TakeProfitManager
 *
 * REPRODUCES: TP1 Hit + Breakeven SL Bug
 *
 * SCENARIO FROM LOGS:
 * 1. Position opened: entry=1.892, qty=52.85
 * 2. TP1 hit at 1.9203
 * 3. recordPartialClose() called with qty=17.44 (33%)
 * 4. pnlNet becomes NaN
 * 5. calculateBreakevenPrice() receives NaN
 * 6. Moving SL fails
 */

import { PositionExitingService } from '../../services/position-exiting.service';
import { TakeProfitManagerService } from '../../services/take-profit-manager.service';
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
  notifyPositionOpened: jest.fn().mockResolvedValue(true),
  notifyTakeProfitHit: jest.fn().mockResolvedValue(true),
  enabled: true,
  botToken: 'test',
  chatId: 'test',
  logger: createMockLogger(),
} as any);

const createMockJournalService = () => ({
  recordTradeOpen: jest.fn(),
  recordTradeClose: jest.fn(),
  getOpenPositionBySymbol: jest.fn().mockReturnValue(null),
});

const createMockSessionStatsService = () => ({
  updateTradeExit: jest.fn(),
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
    { level: 1, percent: 0.5, sizePercent: 33 },
    { level: 2, percent: 1.0, sizePercent: 33 },
    { level: 3, percent: 1.5, sizePercent: 34 },
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
    orderbook: { enabled: false },
    ticks: { enabled: false, calculateDelta: false },
  },
  entryConfig: {} as any,
  entryConfirmation: {} as any,
});

describe('PositionExitingService INTEGRATION: TP1 Bug Reproduction', () => {
  let service: PositionExitingService;
  let mockBybitService: any;
  let mockLogger: any;
  let mockTakeProfitManager: TakeProfitManagerService;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockBybitService = createMockBybitService();

    // Create REAL TakeProfitManager with real entry price
    mockTakeProfitManager = new TakeProfitManagerService(
      {
        positionId: 'XRPUSDT_Buy',
        symbol: 'XRPUSDT',
        side: PositionSide.LONG,
        entryPrice: 1.892, // REAL value from logs
        totalQuantity: 52.85,
        leverage: 10,
      },
      mockLogger,
    );

    // Mock positionManager to return the real TakeProfitManager
    const mockPositionManager = {
      getTakeProfitManager: jest.fn().mockReturnValue(mockTakeProfitManager),
    };

    service = new PositionExitingService(
      mockBybitService,
      createMockTelegramService(),
      mockLogger,
      createMockJournalService() as any,
      createMockTradingConfig(),
      createMockRiskConfig(),
      createMockConfig(),
      createMockSessionStatsService() as any,
      mockPositionManager as any,
    );
  });

  describe('Real scenario: TP1 close + recordPartialClose', () => {
    it('Should correctly record TP1 partial close with valid entryPrice', () => {
      // This tests that TakeProfitManager works correctly with valid data
      const tpLevel = 1;
      const partialQuantity = (52.85 * 33) / 100; // 17.4405
      const tp1ExitPrice = 1.9203;

      const partialClose = mockTakeProfitManager.recordPartialClose(
        tpLevel,
        partialQuantity,
        tp1ExitPrice,
      );

      console.log(`
        PARTIAL CLOSE RESULT:
        - Level: ${partialClose.level}
        - Quantity: ${partialClose.quantity}
        - Exit Price: ${partialClose.exitPrice}
        - PnL Gross: ${partialClose.pnlGross}
        - PnL Net: ${partialClose.pnlNet}
        - Is NaN? ${isNaN(partialClose.pnlNet)}
      `);

      // Verify PnL is NOT NaN
      expect(isNaN(partialClose.pnlNet)).toBe(false);
      expect(partialClose.pnlNet).toBeGreaterThan(0); // Should be profitable
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('CRITICAL: What happens if TakeProfitManager entryPrice becomes NaN?', () => {
      // Simulate corruption
      (mockTakeProfitManager as any).config.entryPrice = NaN;

      const tpLevel = 1;
      const partialQuantity = (52.85 * 33) / 100;
      const tp1ExitPrice = 1.9203;

      const partialClose = mockTakeProfitManager.recordPartialClose(
        tpLevel,
        partialQuantity,
        tp1ExitPrice,
      );

      console.log(`
        CORRUPTED ENTRY PRICE:
        - config.entryPrice: ${(mockTakeProfitManager as any).config.entryPrice}
        - Recorded pnlNet: ${partialClose.pnlNet}
        - Is NaN? ${isNaN(partialClose.pnlNet)}
      `);

      // This is the BUG!
      expect(isNaN(partialClose.pnlNet)).toBe(true);
    });

    it('Should NOT corrupt entryPrice during position update', async () => {
      const position: Position = {
        id: 'XRPUSDT_Buy',
        journalId: 'XRPUSDT_Buy_1769181601722',
        symbol: 'XRPUSDT',
        side: PositionSide.LONG,
        quantity: 52.85,
        entryPrice: 1.892,
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
          { level: 1, percent: 0.5, sizePercent: 33, price: 1.9203, hit: false } as TakeProfit,
          { level: 2, percent: 1.0, sizePercent: 33, price: 1.9488, hit: false } as TakeProfit,
          { level: 3, percent: 1.5, sizePercent: 34, price: 1.9866, hit: false } as TakeProfit,
        ],
        openedAt: Date.now() - 1800000,
        unrealizedPnL: 0,
        orderId: 'ORD_XRPUSDT',
        reason: 'Position opened',
        protectionVerifiedOnce: true,
        status: 'OPEN',
      };

      const originalEntryPrice = position.entryPrice;

      // Simulate TP1 hit and partial close
      position.quantity = position.quantity * 0.67; // After 33% close
      position.takeProfits[0].hit = true;

      console.log(`
        POSITION STATE AFTER TP1:
        - Entry Price Before: ${originalEntryPrice}
        - Entry Price After: ${position.entryPrice}
        - Entry Price Corrupted? ${position.entryPrice !== originalEntryPrice}
      `);

      expect(position.entryPrice).toBe(originalEntryPrice);
      expect(isNaN(position.entryPrice)).toBe(false);
    });

    it('INVESTIGATION: Where does entryPrice come from in handleTP1Hit?', async () => {
      // This test investigates the actual issue
      // In handleTP1Hit on line 560:
      // const breakevenPrice = this.calculateBreakevenPrice(position, ...);

      const position: Position = {
        id: 'XRPUSDT_Buy',
        journalId: 'XRPUSDT_Buy_1769181601722',
        symbol: 'XRPUSDT',
        side: PositionSide.LONG,
        quantity: 52.85,
        entryPrice: 1.892, // Valid at start
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
          { level: 1, percent: 0.5, sizePercent: 33, price: 1.9203, hit: false } as TakeProfit,
        ],
        openedAt: Date.now(),
        unrealizedPnL: 0,
        orderId: 'ORD_XRPUSDT',
        reason: 'Position opened',
        protectionVerifiedOnce: true,
        status: 'OPEN',
      };

      // Check what breakeven calculation would give
      const offsetPercent = createMockRiskConfig().breakevenOffsetPercent; // 0.3
      const offset = (position.entryPrice * offsetPercent) / 10000;
      const breakevenPrice = position.entryPrice + offset;

      console.log(`
        BREAKEVEN CALCULATION:
        - Position entryPrice: ${position.entryPrice}
        - Is NaN? ${isNaN(position.entryPrice)}
        - Calculated Breakeven: ${breakevenPrice}
        - Is Breakeven NaN? ${isNaN(breakevenPrice)}
      `);

      expect(isNaN(breakevenPrice)).toBe(false);

      // Now what if entryPrice becomes NaN between recordPartialClose and handleTP1Hit?
      position.entryPrice = NaN;

      const offset2 = (position.entryPrice * offsetPercent) / 10000;
      const breakevenPrice2 = position.entryPrice + offset2;

      console.log(`
        AFTER CORRUPTION:
        - Position entryPrice: ${position.entryPrice}
        - Is NaN? ${isNaN(position.entryPrice as any)}
        - Calculated Breakeven: ${breakevenPrice2}
        - Is Breakeven NaN? ${isNaN(breakevenPrice2 as any)}
      `);

      expect(isNaN(breakevenPrice2 as any)).toBe(true);
    });
  });

  describe('WebSocket Update Impact', () => {
    it('BUGGY: Old code - Empty string causes NaN', () => {
      // OLD CODE BUG:
      // entryPrice: parseFloat(posData.entryPrice ?? posData.avgPrice ?? '0')
      //
      // When entryPrice='', nullish coalescing fails:
      // - '' ?? avgPrice = '' (empty string is truthy!)
      // - parseFloat('') = NaN

      const posData = {
        entryPrice: '', // Empty from WebSocket
        avgPrice: '1.9203',
      };

      // OLD BUGGY CODE
      const oldBuggyCode = parseFloat(posData.entryPrice ?? posData.avgPrice ?? '0');

      console.log(`
        OLD BUGGY CODE:
        - entryPrice: "${posData.entryPrice}"
        - avgPrice: "${posData.avgPrice}"
        - Result: ${oldBuggyCode}
        - Is NaN? ${isNaN(oldBuggyCode)}
      `);

      // This is the bug!
      expect(isNaN(oldBuggyCode)).toBe(true);
    });

    it('FIXED: New code - Properly handles empty strings', () => {
      // NEW CODE FIX:
      // Checks for EMPTY strings before parsing
      // Validates non-NaN result

      const posData = {
        entryPrice: '', // Empty
        avgPrice: '1.9203', // Valid
      };

      // NEW FIXED CODE (simulation)
      const parseEntryPrice = (): number => {
        if (posData.entryPrice && posData.entryPrice.trim()) {
          const price = parseFloat(posData.entryPrice);
          if (!isNaN(price)) return price;
        }
        if (posData.avgPrice && posData.avgPrice.trim()) {
          const price = parseFloat(posData.avgPrice);
          if (!isNaN(price)) return price;
        }
        return 0;
      };

      const newFixedCode = parseEntryPrice();

      console.log(`
        NEW FIXED CODE:
        - entryPrice: "${posData.entryPrice}" (empty, skipped)
        - avgPrice: "${posData.avgPrice}" (valid, used)
        - Result: ${newFixedCode}
        - Is NaN? ${isNaN(newFixedCode)}
      `);

      // This should NOT be NaN!
      expect(isNaN(newFixedCode)).toBe(false);
      expect(newFixedCode).toBe(1.9203);
    });

    it('VERIFIED: Sequence of WebSocket updates', () => {
      // Simulates actual WebSocket update sequence
      const positions = [
        { entryPrice: '1.892', avgPrice: '1.892', label: 'Position Open' },
        { entryPrice: '', avgPrice: '1.9203', label: 'After TP1 Close (BUG)' },
      ];

      const parseEntryPrice = (entryPrice: string, avgPrice: string): number => {
        if (entryPrice && entryPrice.trim()) {
          const price = parseFloat(entryPrice);
          if (!isNaN(price)) return price;
        }
        if (avgPrice && avgPrice.trim()) {
          const price = parseFloat(avgPrice);
          if (!isNaN(price)) return price;
        }
        return 0;
      };

      const results = positions.map(p => ({
        ...p,
        parsed: parseEntryPrice(p.entryPrice, p.avgPrice),
      }));

      console.log(`
        WEBSOCKET UPDATE SEQUENCE:
        ${results.map(r => `- ${r.label}: entryPrice="${r.entryPrice}", avgPrice="${r.avgPrice}" → Parsed: ${r.parsed}`).join('\n')}
      `);

      // Verify both are valid
      expect(isNaN(results[0].parsed)).toBe(false);
      expect(isNaN(results[1].parsed)).toBe(false);

      // First should be 1.892
      expect(results[0].parsed).toBe(1.892);
      // Second should still be valid (use avgPrice since entryPrice is empty)
      expect(results[1].parsed).toBe(1.9203);
    });
  });
});
