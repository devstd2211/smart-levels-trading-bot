/**
 * Position PnL Calculator Service Tests
 * Tests for unrealized P&L calculation
 */

import { PositionPnLCalculatorService } from '../../services/position-pnl-calculator.service';
import { Position, PositionSide } from '../../types';
import { PERCENT_MULTIPLIER } from '../../constants';

// ============================================================================
// MOCKS
// ============================================================================

const createMockPosition = (
  side: PositionSide = PositionSide.LONG,
  entryPrice: number = 100,
): Position => ({
  id: 'test-position-123',
  symbol: 'APEXUSDT',
  side,
  entryPrice,
  quantity: 10,
  leverage: 10,
  marginUsed: 10,
  stopLoss: {
    price: side === PositionSide.LONG ? 99 : 101,
    initialPrice: side === PositionSide.LONG ? 99 : 101,
    orderId: 'sl-order-123',
    isBreakeven: false,
    isTrailing: false,
    updatedAt: Date.now(),
  },
  takeProfits: [
    {
      level: 1,
      price: side === PositionSide.LONG ? 101 : 99,
      percent: 1,
      sizePercent: 33.33,
      orderId: 'tp1-order',
      hit: false,
    },
  ],
  openedAt: Date.now(),
  unrealizedPnL: 0,
  orderId: 'entry-order-123',
  reason: 'Test position',
  status: 'OPEN',
});

// ============================================================================
// TESTS
// ============================================================================

describe('PositionPnLCalculatorService', () => {
  let service: PositionPnLCalculatorService;

  beforeEach(() => {
    service = new PositionPnLCalculatorService();
  });

  // ==========================================================================
  // TEST GROUP 1: LONG Position P&L
  // ==========================================================================

  describe('LONG position P&L', () => {
    it('should return 0% P&L when price equals entry price', () => {
      const position = createMockPosition(PositionSide.LONG, 100);
      const currentPrice = 100;

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBe(0);
    });

    it('should return positive P&L when price above entry (LONG)', () => {
      const position = createMockPosition(PositionSide.LONG, 100);
      const currentPrice = 110; // +10%

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBeCloseTo(10, 2);
    });

    it('should return negative P&L when price below entry (LONG)', () => {
      const position = createMockPosition(PositionSide.LONG, 100);
      const currentPrice = 90; // -10%

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBeCloseTo(-10, 2);
    });

    it('should calculate +1% P&L correctly (LONG)', () => {
      const position = createMockPosition(PositionSide.LONG, 100);
      const currentPrice = 101; // +1%

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBeCloseTo(1, 2);
    });

    it('should calculate -1% P&L correctly (LONG)', () => {
      const position = createMockPosition(PositionSide.LONG, 100);
      const currentPrice = 99; // -1%

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBeCloseTo(-1, 2);
    });

    it('should handle small price movements (LONG)', () => {
      const position = createMockPosition(PositionSide.LONG, 1000);
      const currentPrice = 1000.5; // +0.05%

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBeCloseTo(0.05, 4);
    });

    it('should handle large price movements (LONG)', () => {
      const position = createMockPosition(PositionSide.LONG, 100);
      const currentPrice = 250; // +150%

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBeCloseTo(150, 2);
    });

    it('should use PERCENT_MULTIPLIER constant', () => {
      const position = createMockPosition(PositionSide.LONG, 100);
      const currentPrice = 101; // +1%

      const pnl = service.calculatePnL(position, currentPrice);

      // Manual calculation to verify
      const expected = ((currentPrice - position.entryPrice) / position.entryPrice) * PERCENT_MULTIPLIER;
      expect(pnl).toBe(expected);
    });
  });

  // ==========================================================================
  // TEST GROUP 2: SHORT Position P&L
  // ==========================================================================

  describe('SHORT position P&L', () => {
    it('should return 0% P&L when price equals entry price (SHORT)', () => {
      const position = createMockPosition(PositionSide.SHORT, 100);
      const currentPrice = 100;

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBe(0);
    });

    it('should return positive P&L when price below entry (SHORT)', () => {
      const position = createMockPosition(PositionSide.SHORT, 100);
      const currentPrice = 90; // Entry was higher, so SHORT profits

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBeCloseTo(10, 2);
    });

    it('should return negative P&L when price above entry (SHORT)', () => {
      const position = createMockPosition(PositionSide.SHORT, 100);
      const currentPrice = 110; // Entry was lower, so SHORT loses

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBeCloseTo(-10, 2);
    });

    it('should calculate +1% P&L correctly (SHORT)', () => {
      const position = createMockPosition(PositionSide.SHORT, 100);
      const currentPrice = 99; // +1% for SHORT

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBeCloseTo(1, 2);
    });

    it('should calculate -1% P&L correctly (SHORT)', () => {
      const position = createMockPosition(PositionSide.SHORT, 100);
      const currentPrice = 101; // -1% for SHORT

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBeCloseTo(-1, 2);
    });

    it('should handle small price movements (SHORT)', () => {
      const position = createMockPosition(PositionSide.SHORT, 1000);
      const currentPrice = 999.5; // +0.05% for SHORT

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBeCloseTo(0.05, 4);
    });

    it('should handle large price movements (SHORT)', () => {
      const position = createMockPosition(PositionSide.SHORT, 200);
      const currentPrice = 50; // +75% for SHORT

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBeCloseTo(75, 2);
    });
  });

  // ==========================================================================
  // TEST GROUP 3: Different Entry Prices
  // ==========================================================================

  describe('different entry prices', () => {
    it('should calculate P&L correctly for high entry price', () => {
      const position = createMockPosition(PositionSide.LONG, 50000); // BTC-like price
      const currentPrice = 51000; // +2%

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBeCloseTo(2, 2);
    });

    it('should calculate P&L correctly for low entry price', () => {
      const position = createMockPosition(PositionSide.LONG, 0.001);
      const currentPrice = 0.0011; // +10%

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBeCloseTo(10, 1);
    });

    it('should handle fractional prices', () => {
      const position = createMockPosition(PositionSide.LONG, 123.456);
      const currentPrice = 125.123;

      const pnl = service.calculatePnL(position, currentPrice);

      const expected = ((currentPrice - position.entryPrice) / position.entryPrice) * PERCENT_MULTIPLIER;
      expect(pnl).toBeCloseTo(expected, 4);
    });
  });

  // ==========================================================================
  // TEST GROUP 4: Symmetry & Consistency
  // ==========================================================================

  describe('symmetry and consistency', () => {
    it('should be symmetric for LONG and SHORT (opposite results)', () => {
      const entryPrice = 100;
      const currentPrice = 110;

      const longPnl = service.calculatePnL(
        createMockPosition(PositionSide.LONG, entryPrice),
        currentPrice,
      );
      const shortPnl = service.calculatePnL(
        createMockPosition(PositionSide.SHORT, entryPrice),
        currentPrice,
      );

      expect(longPnl).toBeCloseTo(-shortPnl, 10);
    });

    it('should return consistent results for same inputs', () => {
      const position = createMockPosition(PositionSide.LONG, 100);
      const currentPrice = 105;

      const pnl1 = service.calculatePnL(position, currentPrice);
      const pnl2 = service.calculatePnL(position, currentPrice);
      const pnl3 = service.calculatePnL(position, currentPrice);

      expect(pnl1).toBe(pnl2);
      expect(pnl2).toBe(pnl3);
    });

    it('should produce opposite P&L for inverse prices', () => {
      const position1 = createMockPosition(PositionSide.LONG, 100);
      const position2 = createMockPosition(PositionSide.LONG, 100);

      const pnl1 = service.calculatePnL(position1, 110);
      const pnl2 = service.calculatePnL(position2, 90);

      expect(pnl1).toBeCloseTo(-pnl2, 10);
    });
  });

  // ==========================================================================
  // TEST GROUP 5: Real-World Scenarios
  // ==========================================================================

  describe('real-world scenarios', () => {
    it('should handle breakeven scenario (LONG)', () => {
      const position = createMockPosition(PositionSide.LONG, 1.5);
      position.stopLoss.price = 1.485; // 1% SL
      const currentPrice = position.entryPrice; // At entry

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBe(0);
    });

    it('should calculate TP1 scenario (LONG)', () => {
      const position = createMockPosition(PositionSide.LONG, 100);
      position.takeProfits[0].price = 101;
      const currentPrice = 101; // At TP1

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBeCloseTo(1, 2);
    });

    it('should calculate SL scenario (LONG)', () => {
      const position = createMockPosition(PositionSide.LONG, 100);
      position.stopLoss.price = 99;
      const currentPrice = 99; // At SL

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBeCloseTo(-1, 2);
    });

    it('should handle multiple TP hits in sequence (LONG)', () => {
      const position = createMockPosition(PositionSide.LONG, 100);
      const tp1 = 101;
      const tp2 = 102;
      const tp3 = 103;

      const pnl1 = service.calculatePnL(position, tp1);
      const pnl2 = service.calculatePnL(position, tp2);
      const pnl3 = service.calculatePnL(position, tp3);

      expect(pnl1).toBeLessThan(pnl2);
      expect(pnl2).toBeLessThan(pnl3);
    });

    it('should handle liquidation scenario (LONG)', () => {
      const position = createMockPosition(PositionSide.LONG, 100);
      const currentPrice = 50; // -50% - potentially liquidation

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBeCloseTo(-50, 2);
    });

    it('should handle volatility spike scenario (SHORT)', () => {
      const position = createMockPosition(PositionSide.SHORT, 100);
      const currentPrice = 120; // +20% spike (bad for SHORT)

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBeCloseTo(-20, 2);
    });
  });

  // ==========================================================================
  // TEST GROUP 6: Edge Cases & Precision
  // ==========================================================================

  describe('edge cases and precision', () => {
    it('should handle very small P&L changes', () => {
      const position = createMockPosition(PositionSide.LONG, 1000000);
      const currentPrice = 1000001; // +0.0001%

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBeCloseTo(0.0001, 6);
    });

    it('should handle scientific notation numbers', () => {
      const position = createMockPosition(PositionSide.LONG, 1e-8);
      const currentPrice = 1.1e-8; // +10%

      const pnl = service.calculatePnL(position, currentPrice);

      expect(pnl).toBeCloseTo(10, 1);
    });

    it('should not mutate position object', () => {
      const position = createMockPosition(PositionSide.LONG, 100);
      const originalEntryPrice = position.entryPrice;
      const originalQuantity = position.quantity;

      service.calculatePnL(position, 110);

      expect(position.entryPrice).toBe(originalEntryPrice);
      expect(position.quantity).toBe(originalQuantity);
    });

    it('should handle maximum safe integer prices', () => {
      const position = createMockPosition(PositionSide.LONG, Number.MAX_SAFE_INTEGER / 2);
      const currentPrice = Number.MAX_SAFE_INTEGER / 2 * 1.01;

      expect(() => {
        service.calculatePnL(position, currentPrice);
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // TEST GROUP 7: Formula Verification
  // ==========================================================================

  describe('formula verification', () => {
    it('should use correct LONG formula: (currentPrice - entryPrice) / entryPrice * 100', () => {
      const entryPrice = 100;
      const currentPrice = 105;
      const position = createMockPosition(PositionSide.LONG, entryPrice);

      const pnl = service.calculatePnL(position, currentPrice);

      // Manual calculation
      const expected = ((currentPrice - entryPrice) / entryPrice) * PERCENT_MULTIPLIER;
      expect(pnl).toBe(expected);
    });

    it('should use correct SHORT formula: (entryPrice - currentPrice) / entryPrice * 100', () => {
      const entryPrice = 100;
      const currentPrice = 95;
      const position = createMockPosition(PositionSide.SHORT, entryPrice);

      const pnl = service.calculatePnL(position, currentPrice);

      // Manual calculation for SHORT
      const expected = ((entryPrice - currentPrice) / entryPrice) * PERCENT_MULTIPLIER;
      expect(pnl).toBe(expected);
    });

    it('should always divide by entryPrice (not currentPrice)', () => {
      const position = createMockPosition(PositionSide.LONG, 50);
      const currentPrice = 100; // Entry 50, Current 100 (+100%)

      const pnl = service.calculatePnL(position, currentPrice);

      // Should be +100% (divide by entry), not +50% (divide by current)
      expect(pnl).toBeCloseTo(100, 2);
    });
  });
});
