/**
 * Exit Calculations - Unit Tests
 *
 * Tests for pure helper functions
 * No mocks needed - pure functions take data, return results
 */

import * as ExitCalculations from '../../exit-handler/exit-calculations';
import { Position } from '../../types/core';
import { PositionSide } from '../../types/enums';
import { TPLevelConfig } from '../../types/exit-strategy.types';

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

function createTestTPConfig(overrides?: Partial<TPLevelConfig>): TPLevelConfig {
  return {
    level: 1,
    percent: 1.5,
    sizePercent: 50,
    onHit: 'MOVE_SL_TO_BREAKEVEN',
    ...overrides,
  };
}

// ============================================================================
// BREAKEVEN TESTS
// ============================================================================

describe('ExitCalculations - Breakeven', () => {
  describe('calculateBreakevenSL', () => {
    it('should calculate BE SL for LONG position', () => {
      const position = createTestPosition({
        side: PositionSide.LONG,
        entryPrice: 100,
      });

      const beSL = ExitCalculations.calculateBreakevenSL(position, 0.1);

      expect(beSL).toBe(100.1);
    });

    it('should calculate BE SL for SHORT position', () => {
      const position = createTestPosition({
        side: PositionSide.SHORT,
        entryPrice: 100,
      });

      const beSL = ExitCalculations.calculateBreakevenSL(position, 0.1);

      expect(beSL).toBe(99.9);
    });

    it('should handle different BE margins', () => {
      const position = createTestPosition({ entryPrice: 100 });

      expect(ExitCalculations.calculateBreakevenSL(position, 0.5)).toBe(100.5);
      expect(ExitCalculations.calculateBreakevenSL(position, 0.2)).toBe(100.2);
      expect(ExitCalculations.calculateBreakevenSL(position, 1.0)).toBe(101.0);
    });
  });

  describe('isBreakevenValid', () => {
    it('should accept valid BE for LONG (>= entry)', () => {
      const position = createTestPosition({ side: PositionSide.LONG, entryPrice: 100 });

      expect(ExitCalculations.isBreakevenValid(position, 100.1)).toBe(true);
      expect(ExitCalculations.isBreakevenValid(position, 100)).toBe(true);
      expect(ExitCalculations.isBreakevenValid(position, 101)).toBe(true);
    });

    it('should reject invalid BE for LONG (< entry)', () => {
      const position = createTestPosition({ side: PositionSide.LONG, entryPrice: 100 });

      expect(ExitCalculations.isBreakevenValid(position, 99.9)).toBe(false);
      expect(ExitCalculations.isBreakevenValid(position, 99)).toBe(false);
    });

    it('should accept valid BE for SHORT (<= entry)', () => {
      const position = createTestPosition({ side: PositionSide.SHORT, entryPrice: 100 });

      expect(ExitCalculations.isBreakevenValid(position, 99.9)).toBe(true);
      expect(ExitCalculations.isBreakevenValid(position, 100)).toBe(true);
      expect(ExitCalculations.isBreakevenValid(position, 99)).toBe(true);
    });

    it('should reject invalid BE for SHORT (> entry)', () => {
      const position = createTestPosition({ side: PositionSide.SHORT, entryPrice: 100 });

      expect(ExitCalculations.isBreakevenValid(position, 100.1)).toBe(false);
      expect(ExitCalculations.isBreakevenValid(position, 101)).toBe(false);
    });
  });
});

// ============================================================================
// TRAILING STOP TESTS
// ============================================================================

describe('ExitCalculations - Trailing Stop', () => {
  describe('calculateTrailingDistance', () => {
    it('should calculate distance from base percent', () => {
      const position = createTestPosition({ entryPrice: 100 });

      const distance = ExitCalculations.calculateTrailingDistance(position, 0.5);

      expect(distance).toBe(0.5); // 0.5% of 100 = 0.5
    });

    it('should override with ATR if provided', () => {
      const position = createTestPosition({ entryPrice: 100 });

      const distance = ExitCalculations.calculateTrailingDistance(
        position,
        0.5,  // base
        1.5,  // ATR percent
        1.0   // multiplier
      );

      expect(distance).toBe(1.5); // 1.5% of 100 = 1.5
    });

    it('should apply ATR multiplier', () => {
      const position = createTestPosition({ entryPrice: 100 });

      const distance = ExitCalculations.calculateTrailingDistance(
        position,
        0.5,
        1.0,  // ATR percent
        2.0   // multiplier
      );

      expect(distance).toBe(2.0); // 1.0 * 2.0 = 2.0
    });

    it('should enforce minimum distance', () => {
      const position = createTestPosition({ entryPrice: 100 });

      const distance = ExitCalculations.calculateTrailingDistance(position, 0.01);

      expect(distance).toBeGreaterThanOrEqual(0.1); // Minimum 0.1%
    });

    it('should enforce maximum distance', () => {
      const position = createTestPosition({ entryPrice: 100 });

      const distance = ExitCalculations.calculateTrailingDistance(position, 10.0);

      expect(distance).toBeLessThanOrEqual(5.0); // Maximum 5%
    });
  });

  describe('calculateCurrentTrailingSL', () => {
    it('should calculate trailing SL for LONG (below current price)', () => {
      const position = createTestPosition({ side: PositionSide.LONG });

      const slPrice = ExitCalculations.calculateCurrentTrailingSL(position, 105, 1.0);

      expect(slPrice).toBe(104); // 105 - 1.0
    });

    it('should calculate trailing SL for SHORT (above current price)', () => {
      const position = createTestPosition({ side: PositionSide.SHORT });

      const slPrice = ExitCalculations.calculateCurrentTrailingSL(position, 95, 1.0);

      expect(slPrice).toBe(96); // 95 + 1.0
    });
  });

  describe('shouldUpdateTrailingSL', () => {
    it('should update for LONG when price goes higher', () => {
      const position = createTestPosition({ side: PositionSide.LONG });

      // Price went from 105 to 106
      expect(
        ExitCalculations.shouldUpdateTrailingSL(position, 106, 105, 1.0)
      ).toBe(true);
    });

    it('should NOT update for LONG when price stays same', () => {
      const position = createTestPosition({ side: PositionSide.LONG });

      expect(
        ExitCalculations.shouldUpdateTrailingSL(position, 105, 105, 1.0)
      ).toBe(false);
    });

    it('should NOT update for LONG when price goes lower', () => {
      const position = createTestPosition({ side: PositionSide.LONG });

      expect(
        ExitCalculations.shouldUpdateTrailingSL(position, 104, 105, 1.0)
      ).toBe(false);
    });

    it('should update for SHORT when price goes lower', () => {
      const position = createTestPosition({ side: PositionSide.SHORT });

      expect(
        ExitCalculations.shouldUpdateTrailingSL(position, 94, 95, 1.0)
      ).toBe(true);
    });

    it('should NOT update for SHORT when price goes higher', () => {
      const position = createTestPosition({ side: PositionSide.SHORT });

      expect(
        ExitCalculations.shouldUpdateTrailingSL(position, 96, 95, 1.0)
      ).toBe(false);
    });
  });
});

// ============================================================================
// TP HIT TESTS
// ============================================================================

describe('ExitCalculations - TP Hit', () => {
  describe('isTPHit', () => {
    it('should detect TP hit for LONG when price >= TP', () => {
      const position = createTestPosition({ side: PositionSide.LONG });

      expect(ExitCalculations.isTPHit(position, 101.5, 101.5)).toBe(true);
      expect(ExitCalculations.isTPHit(position, 102, 101.5)).toBe(true);
    });

    it('should NOT detect TP hit for LONG when price < TP', () => {
      const position = createTestPosition({ side: PositionSide.LONG });

      expect(ExitCalculations.isTPHit(position, 101.4, 101.5)).toBe(false);
    });

    it('should detect TP hit for SHORT when price <= TP', () => {
      const position = createTestPosition({ side: PositionSide.SHORT });

      expect(ExitCalculations.isTPHit(position, 98.5, 98.5)).toBe(true);
      expect(ExitCalculations.isTPHit(position, 98, 98.5)).toBe(true);
    });

    it('should NOT detect TP hit for SHORT when price > TP', () => {
      const position = createTestPosition({ side: PositionSide.SHORT });

      expect(ExitCalculations.isTPHit(position, 98.6, 98.5)).toBe(false);
    });
  });

  describe('calculateTPPrice', () => {
    it('should calculate TP price for LONG', () => {
      const position = createTestPosition({
        side: PositionSide.LONG,
        entryPrice: 100,
      });

      expect(ExitCalculations.calculateTPPrice(position, 1.5)).toBe(101.5);
      expect(ExitCalculations.calculateTPPrice(position, 3.0)).toBe(103);
    });

    it('should calculate TP price for SHORT', () => {
      const position = createTestPosition({
        side: PositionSide.SHORT,
        entryPrice: 100,
      });

      expect(ExitCalculations.calculateTPPrice(position, 1.5)).toBe(98.5);
      expect(ExitCalculations.calculateTPPrice(position, 3.0)).toBe(97);
    });
  });
});

// ============================================================================
// SL HIT TESTS
// ============================================================================

describe('ExitCalculations - SL Hit', () => {
  describe('isStopLossHit', () => {
    it('should detect SL hit for LONG when price <= SL', () => {
      const position = createTestPosition({
        side: PositionSide.LONG,
        stopLoss: { ...createTestPosition().stopLoss, price: 98 },
      });

      expect(ExitCalculations.isStopLossHit(position, 98)).toBe(true);
      expect(ExitCalculations.isStopLossHit(position, 97.5)).toBe(true);
    });

    it('should NOT detect SL hit for LONG when price > SL', () => {
      const position = createTestPosition({
        side: PositionSide.LONG,
        stopLoss: { ...createTestPosition().stopLoss, price: 98 },
      });

      expect(ExitCalculations.isStopLossHit(position, 98.1)).toBe(false);
    });

    it('should detect SL hit for SHORT when price >= SL', () => {
      const position = createTestPosition({
        side: PositionSide.SHORT,
        stopLoss: { ...createTestPosition().stopLoss, price: 102 },
      });

      expect(ExitCalculations.isStopLossHit(position, 102)).toBe(true);
      expect(ExitCalculations.isStopLossHit(position, 102.5)).toBe(true);
    });

    it('should NOT detect SL hit for SHORT when price < SL', () => {
      const position = createTestPosition({
        side: PositionSide.SHORT,
        stopLoss: { ...createTestPosition().stopLoss, price: 102 },
      });

      expect(ExitCalculations.isStopLossHit(position, 101.9)).toBe(false);
    });
  });
});

// ============================================================================
// PROFIT TESTS
// ============================================================================

describe('ExitCalculations - Profit', () => {
  describe('calculatePnL', () => {
    it('should calculate PnL for LONG position', () => {
      const position = createTestPosition({
        side: PositionSide.LONG,
        entryPrice: 100,
        quantity: 1.0,
      });

      expect(ExitCalculations.calculatePnL(position, 105)).toBe(5); // 1 * (105 - 100)
      expect(ExitCalculations.calculatePnL(position, 95)).toBe(-5); // 1 * (95 - 100)
    });

    it('should calculate PnL for SHORT position', () => {
      const position = createTestPosition({
        side: PositionSide.SHORT,
        entryPrice: 100,
        quantity: 1.0,
      });

      expect(ExitCalculations.calculatePnL(position, 95)).toBe(5); // 1 * (100 - 95)
      expect(ExitCalculations.calculatePnL(position, 105)).toBe(-5); // 1 * (100 - 105)
    });
  });

  describe('calculatePnLPercent', () => {
    it('should calculate PnL% for LONG position', () => {
      const position = createTestPosition({
        side: PositionSide.LONG,
        entryPrice: 100,
      });

      expect(ExitCalculations.calculatePnLPercent(position, 105)).toBe(5);
      expect(ExitCalculations.calculatePnLPercent(position, 95)).toBe(-5);
    });

    it('should calculate PnL% for SHORT position', () => {
      const position = createTestPosition({
        side: PositionSide.SHORT,
        entryPrice: 100,
      });

      expect(ExitCalculations.calculatePnLPercent(position, 95)).toBe(5);
      expect(ExitCalculations.calculatePnLPercent(position, 105)).toBe(-5);
    });
  });
});

// ============================================================================
// SIZE TESTS
// ============================================================================

describe('ExitCalculations - Size', () => {
  describe('calculateSizeToClose', () => {
    it('should calculate size to close', () => {
      const position = createTestPosition({ quantity: 10 });
      const tpConfig = createTestTPConfig({ sizePercent: 50 });

      expect(ExitCalculations.calculateSizeToClose(position, tpConfig)).toBe(5);
    });

    it('should handle different size percents', () => {
      const position = createTestPosition({ quantity: 10 });

      expect(
        ExitCalculations.calculateSizeToClose(position, createTestTPConfig({ sizePercent: 30 }))
      ).toBe(3);

      expect(
        ExitCalculations.calculateSizeToClose(position, createTestTPConfig({ sizePercent: 100 }))
      ).toBe(10);
    });
  });

  describe('calculateRemainingSize', () => {
    it('should calculate remaining size after close', () => {
      const position = createTestPosition({ quantity: 10 });

      expect(ExitCalculations.calculateRemainingSize(position, 5)).toBe(5);
      expect(ExitCalculations.calculateRemainingSize(position, 3)).toBe(7);
    });

    it('should not go negative', () => {
      const position = createTestPosition({ quantity: 10 });

      expect(ExitCalculations.calculateRemainingSize(position, 15)).toBe(0);
    });
  });
});

// ============================================================================
// CONFIG HELPERS TESTS
// ============================================================================

describe('ExitCalculations - Config Helpers', () => {
  describe('getTpConfigForLevel', () => {
    it('should find TP config by level', () => {
      const configs = [
        createTestTPConfig({ level: 1 }),
        createTestTPConfig({ level: 2 }),
        createTestTPConfig({ level: 3 }),
      ];

      expect(ExitCalculations.getTpConfigForLevel(configs, 2)?.level).toBe(2);
    });

    it('should return undefined if level not found', () => {
      const configs = [
        createTestTPConfig({ level: 1 }),
        createTestTPConfig({ level: 2 }),
      ];

      expect(ExitCalculations.getTpConfigForLevel(configs, 5)).toBeUndefined();
    });
  });

  describe('sortTPLevels', () => {
    it('should sort TP levels by level number', () => {
      const configs = [
        createTestTPConfig({ level: 3 }),
        createTestTPConfig({ level: 1 }),
        createTestTPConfig({ level: 2 }),
      ];

      const sorted = ExitCalculations.sortTPLevels(configs);

      expect(sorted[0].level).toBe(1);
      expect(sorted[1].level).toBe(2);
      expect(sorted[2].level).toBe(3);
    });

    it('should not modify original array', () => {
      const configs = [
        createTestTPConfig({ level: 3 }),
        createTestTPConfig({ level: 1 }),
      ];

      ExitCalculations.sortTPLevels(configs);

      expect(configs[0].level).toBe(3);
      expect(configs[1].level).toBe(1);
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('ExitCalculations - Edge Cases', () => {
  it('should handle zero entry price gracefully', () => {
    const position = createTestPosition({ entryPrice: 0 });

    // These shouldn't crash, even with zero entry
    expect(ExitCalculations.calculateBreakevenSL(position, 0.1)).toBe(0);
  });

  it('should handle very small quantities', () => {
    const position = createTestPosition({ quantity: 0.001 });
    const tp = createTestTPConfig({ sizePercent: 50 });

    expect(ExitCalculations.calculateSizeToClose(position, tp)).toBe(0.0005);
  });

  it('should be deterministic', () => {
    const position = createTestPosition();

    const result1 = ExitCalculations.calculateBreakevenSL(position, 0.1);
    const result2 = ExitCalculations.calculateBreakevenSL(position, 0.1);

    expect(result1).toBe(result2);
  });

  it('should not modify input position', () => {
    const position = createTestPosition();
    const originalJSON = JSON.stringify(position);

    ExitCalculations.calculateBreakevenSL(position, 0.1);
    ExitCalculations.calculatePnL(position, 105);
    ExitCalculations.calculateSizeToClose(position, createTestTPConfig());

    expect(JSON.stringify(position)).toBe(originalJSON);
  });
});
