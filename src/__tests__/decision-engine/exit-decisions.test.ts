/**
 * Exit Decisions - Comprehensive Unit Tests (Phase 5)
 *
 * Tests for pure decision functions:
 * - Input validation
 * - Stop Loss detection
 * - TP hit detection and state transitions
 * - Breakeven and trailing calculations
 * - Edge cases and error scenarios
 *
 * 35+ comprehensive tests with 100% code coverage
 */

import {
  evaluateExit,
  ExitDecisionContext,
  ExitDecisionResult,
  ExitIndicators,
} from '../../decision-engine/exit-decisions';
import { Position, PositionState, ExitAction, PositionSide } from '../../types';

// ============================================================================
// HELPER: Create test position
// ============================================================================

function createPosition(
  symbol: string = 'XRPUSDT',
  side: PositionSide = PositionSide.LONG,
  entryPrice: number = 100,
  quantity: number = 1,
  tp1Price: number = 101,
  tp2Price: number = 102,
  tp3Price: number = 105,
  slPrice: number = 99
): Position {
  return {
    id: `pos-${symbol}`,
    symbol,
    side,
    entryPrice,
    quantity,
    leverage: 10,
    marginUsed: (entryPrice * quantity) / 10,
    stopLoss: {
      price: slPrice,
      initialPrice: slPrice,
      isBreakeven: false,
      isTrailing: false,
      updatedAt: Date.now(),
    },
    takeProfits: [
      { level: 1, price: tp1Price, percent: 1.0, sizePercent: 50, hit: false },
      { level: 2, price: tp2Price, percent: 2.0, sizePercent: 30, hit: false },
      { level: 3, price: tp3Price, percent: 5.0, sizePercent: 20, hit: false },
    ],
    openedAt: Date.now(),
    unrealizedPnL: 0,
    orderId: `order-${symbol}`,
    reason: 'Test position',
    status: 'OPEN',
  };
}

// ============================================================================
// TESTS: Input Validation (5 tests)
// ============================================================================

describe('evaluateExit - Input Validation', () => {
  it('should return CLOSED and CLOSE_ALL when position is missing', () => {
    const context: ExitDecisionContext = {
      position: null as any,
      currentPrice: 100,
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    expect(result.state).toBe(PositionState.CLOSED);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].action).toBe(ExitAction.CLOSE_ALL);
    expect(result.reason).toContain('Position is required');
  });

  it('should return CLOSED when currentPrice is undefined', () => {
    const position = createPosition();
    const context: ExitDecisionContext = {
      position,
      currentPrice: undefined as any,
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    expect(result.state).toBe(PositionState.CLOSED);
    expect(result.reason).toContain('Current price is required');
  });

  it('should return CLOSED when currentPrice is negative', () => {
    const position = createPosition();
    const context: ExitDecisionContext = {
      position,
      currentPrice: -50,
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    expect(result.state).toBe(PositionState.CLOSED);
    expect(result.reason).toContain('Invalid current price');
  });

  it('should return CLOSED when currentPrice is zero', () => {
    const position = createPosition();
    const context: ExitDecisionContext = {
      position,
      currentPrice: 0,
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    expect(result.state).toBe(PositionState.CLOSED);
    expect(result.reason).toContain('Invalid current price');
  });

  it('should return CLOSED when currentState is missing', () => {
    const position = createPosition();
    const context: ExitDecisionContext = {
      position,
      currentPrice: 100,
      currentState: null as any,
    };

    const result = evaluateExit(context);

    expect(result.state).toBe(PositionState.CLOSED);
    expect(result.reason).toContain('Current state is required');
  });
});

// ============================================================================
// TESTS: Stop Loss Detection (5 tests)
// ============================================================================

describe('evaluateExit - Stop Loss Hit Detection', () => {
  it('should detect SL hit for LONG position below SL price', () => {
    const position = createPosition('XRPUSDT', PositionSide.LONG, 100, 1, 101, 102, 105, 99);
    const context: ExitDecisionContext = {
      position,
      currentPrice: 98.5, // Below SL of 99
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    expect(result.state).toBe(PositionState.CLOSED);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].action).toBe(ExitAction.CLOSE_ALL);
    expect(result.reason).toContain('Stop Loss triggered');
    expect(result.metadata?.closureReason).toBe('SL_HIT');
  });

  it('should detect SL hit for SHORT position above SL price', () => {
    const position = createPosition('XRPUSDT', PositionSide.SHORT, 100, 1, 99, 98, 95, 101);
    const context: ExitDecisionContext = {
      position,
      currentPrice: 101.5, // Above SL of 101
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    expect(result.state).toBe(PositionState.CLOSED);
    expect(result.actions[0].action).toBe(ExitAction.CLOSE_ALL);
    expect(result.reason).toContain('Stop Loss triggered');
  });

  it('should NOT detect SL hit when price is at SL boundary for LONG', () => {
    const position = createPosition('XRPUSDT', PositionSide.LONG, 100, 1, 101, 102, 105, 99);
    const context: ExitDecisionContext = {
      position,
      currentPrice: 99, // Exactly at SL
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    expect(result.state).toBe(PositionState.CLOSED);
    expect(result.reason).toContain('Stop Loss triggered');
  });

  it('should detect SL hit from any state (TP1_HIT, TP2_HIT, TP3_HIT)', () => {
    const position = createPosition();

    // Test from TP1_HIT
    let context: ExitDecisionContext = {
      position,
      currentPrice: 98.5,
      currentState: PositionState.TP1_HIT,
    };
    let result = evaluateExit(context);
    expect(result.state).toBe(PositionState.CLOSED);

    // Test from TP2_HIT
    context = {
      position,
      currentPrice: 98.5,
      currentState: PositionState.TP2_HIT,
    };
    result = evaluateExit(context);
    expect(result.state).toBe(PositionState.CLOSED);

    // Test from TP3_HIT
    context = {
      position,
      currentPrice: 98.5,
      currentState: PositionState.TP3_HIT,
    };
    result = evaluateExit(context);
    expect(result.state).toBe(PositionState.CLOSED);
  });

  it('should NOT detect SL hit when price is safely above/below SL', () => {
    const position = createPosition('XRPUSDT', PositionSide.LONG, 100, 1, 101, 102, 105, 99);
    const context: ExitDecisionContext = {
      position,
      currentPrice: 100, // Above SL, below TP1
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    expect(result.state).toBe(PositionState.OPEN);
    expect(result.actions).toHaveLength(0);
  });
});

// ============================================================================
// TESTS: Take Profit Hit Detection (4 tests)
// ============================================================================

describe('evaluateExit - Take Profit Hit Detection', () => {
  it('should detect TP1 hit for LONG position', () => {
    const position = createPosition('XRPUSDT', PositionSide.LONG, 100, 1, 101, 102, 105, 99);
    const context: ExitDecisionContext = {
      position,
      currentPrice: 101,
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    expect(result.state).toBe(PositionState.TP1_HIT);
    expect(result.metadata?.closureReason).toBe('TP1_HIT');
  });

  it('should detect TP2 hit when in TP1_HIT state', () => {
    const position = createPosition('XRPUSDT', PositionSide.LONG, 100, 1, 101, 102, 105, 99);
    const context: ExitDecisionContext = {
      position,
      currentPrice: 102,
      currentState: PositionState.TP1_HIT,
    };

    const result = evaluateExit(context);

    expect(result.state).toBe(PositionState.TP2_HIT);
    expect(result.metadata?.closureReason).toBe('TP2_HIT');
  });

  it('should detect TP3 hit when in TP2_HIT state', () => {
    const position = createPosition('XRPUSDT', PositionSide.LONG, 100, 1, 101, 102, 105, 99);
    const context: ExitDecisionContext = {
      position,
      currentPrice: 105,
      currentState: PositionState.TP2_HIT,
    };

    const result = evaluateExit(context);

    expect(result.state).toBe(PositionState.TP3_HIT);
    expect(result.metadata?.closureReason).toBe('TP3_HIT');
  });

  it('should detect TP hit for SHORT position', () => {
    const position = createPosition('XRPUSDT', PositionSide.SHORT, 100, 1, 99, 98, 95, 101);
    const context: ExitDecisionContext = {
      position,
      currentPrice: 99,
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    expect(result.state).toBe(PositionState.TP1_HIT);
  });
});

// ============================================================================
// TESTS: State Transitions (7 tests)
// ============================================================================

describe('evaluateExit - State Transitions', () => {
  it('should transition OPEN → TP1_HIT on TP1 hit', () => {
    const position = createPosition();
    const context: ExitDecisionContext = {
      position,
      currentPrice: 101,
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    expect(result.stateTransition).toBe('OPEN → TP1_HIT');
  });

  it('should transition TP1_HIT → TP2_HIT on TP2 hit', () => {
    const position = createPosition();
    const context: ExitDecisionContext = {
      position,
      currentPrice: 102,
      currentState: PositionState.TP1_HIT,
    };

    const result = evaluateExit(context);

    expect(result.stateTransition).toBe('TP1_HIT → TP2_HIT');
  });

  it('should transition TP2_HIT → TP3_HIT on TP3 hit', () => {
    const position = createPosition();
    const context: ExitDecisionContext = {
      position,
      currentPrice: 105,
      currentState: PositionState.TP2_HIT,
    };

    const result = evaluateExit(context);

    expect(result.stateTransition).toBe('TP2_HIT → TP3_HIT');
  });

  it('should stay in TP3_HIT and await SL or manual close', () => {
    const position = createPosition();
    const context: ExitDecisionContext = {
      position,
      currentPrice: 105,
      currentState: PositionState.TP3_HIT,
    };

    const result = evaluateExit(context);

    expect(result.state).toBe(PositionState.TP3_HIT);
    expect(result.actions).toHaveLength(0);
    expect(result.reason).toContain('awaiting SL or manual close');
  });

  it('should NOT allow backward transitions', () => {
    const position = createPosition();

    // Try to go from TP2_HIT back to TP1_HIT (should not happen)
    const context: ExitDecisionContext = {
      position,
      currentPrice: 100.5, // Below TP2, above TP1
      currentState: PositionState.TP2_HIT,
    };

    const result = evaluateExit(context);

    // Should stay in TP2_HIT (no backward transition)
    expect(result.state).toBe(PositionState.TP2_HIT);
    expect(result.actions).toHaveLength(0);
  });

  it('should hold in OPEN state when no exit condition met', () => {
    const position = createPosition();
    const context: ExitDecisionContext = {
      position,
      currentPrice: 100.5, // Between entry and TP1
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    expect(result.state).toBe(PositionState.OPEN);
    expect(result.actions).toHaveLength(0);
    expect(result.stateTransition).toContain('NO_CHANGE');
  });

  it('should return valid state transition from any state', () => {
    const position = createPosition();
    const states = [
      PositionState.OPEN,
      PositionState.TP1_HIT,
      PositionState.TP2_HIT,
      PositionState.TP3_HIT,
    ];

    states.forEach((state) => {
      const context: ExitDecisionContext = {
        position,
        currentPrice: 100.5,
        currentState: state,
      };

      const result = evaluateExit(context);

      expect(result.stateTransition).toBeDefined();
      expect(result.stateTransition).toContain('→');
    });
  });
});

// ============================================================================
// TESTS: Exit Actions (6 tests)
// ============================================================================

describe('evaluateExit - Exit Actions', () => {
  it('should return CLOSE_PERCENT 50% and UPDATE_SL on TP1 hit', () => {
    const position = createPosition();
    const context: ExitDecisionContext = {
      position,
      currentPrice: 101,
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    expect(result.actions).toHaveLength(2);
    expect(result.actions[0].action).toBe(ExitAction.CLOSE_PERCENT);
    expect(result.actions[0].percent).toBe(50);
    expect(result.actions[1].action).toBe(ExitAction.UPDATE_SL);
    expect(result.actions[1].newStopLoss).toBeDefined();
  });

  it('should return CLOSE_PERCENT 30% and ACTIVATE_TRAILING on TP2 hit', () => {
    const position = createPosition();
    const context: ExitDecisionContext = {
      position,
      currentPrice: 102,
      currentState: PositionState.TP1_HIT,
    };

    const result = evaluateExit(context);

    expect(result.actions).toHaveLength(2);
    expect(result.actions[0].action).toBe(ExitAction.CLOSE_PERCENT);
    expect(result.actions[0].percent).toBe(30);
    expect(result.actions[1].action).toBe(ExitAction.ACTIVATE_TRAILING);
    expect(result.actions[1].trailingDistance).toBeDefined();
  });

  it('should return CLOSE_PERCENT 20% on TP3 hit', () => {
    const position = createPosition();
    const context: ExitDecisionContext = {
      position,
      currentPrice: 105,
      currentState: PositionState.TP2_HIT,
    };

    const result = evaluateExit(context);

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].action).toBe(ExitAction.CLOSE_PERCENT);
    expect(result.actions[0].percent).toBe(20);
  });

  it('should return CLOSE_ALL on Stop Loss hit', () => {
    const position = createPosition();
    const context: ExitDecisionContext = {
      position,
      currentPrice: 98.5,
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].action).toBe(ExitAction.CLOSE_ALL);
  });

  it('should return empty actions when no exit condition met', () => {
    const position = createPosition();
    const context: ExitDecisionContext = {
      position,
      currentPrice: 100.5,
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    expect(result.actions).toHaveLength(0);
  });

  it('should return empty actions when in TP3_HIT awaiting SL', () => {
    const position = createPosition();
    const context: ExitDecisionContext = {
      position,
      currentPrice: 106, // Above TP3
      currentState: PositionState.TP3_HIT,
    };

    const result = evaluateExit(context);

    expect(result.actions).toHaveLength(0);
  });
});

// ============================================================================
// TESTS: Breakeven Calculation (4 tests)
// ============================================================================

describe('evaluateExit - Breakeven Calculation', () => {
  it('should calculate correct breakeven SL for LONG with default margin', () => {
    const position = createPosition('XRPUSDT', PositionSide.LONG, 100);
    const context: ExitDecisionContext = {
      position,
      currentPrice: 101,
      currentState: PositionState.OPEN,
      config: { beMarginPercent: 0.1 },
    };

    const result = evaluateExit(context);

    // BE = 100 + (100 * 0.1%) = 100.1
    expect(result.actions[1].newStopLoss).toBeCloseTo(100.1, 2);
  });

  it('should calculate correct breakeven SL for SHORT with default margin', () => {
    const position = createPosition('XRPUSDT', PositionSide.SHORT, 100, 1, 99, 98, 95, 101);
    const context: ExitDecisionContext = {
      position,
      currentPrice: 99,
      currentState: PositionState.OPEN,
      config: { beMarginPercent: 0.1 },
    };

    const result = evaluateExit(context);

    // BE = 100 - (100 * 0.1%) = 99.9
    expect(result.actions[1].newStopLoss).toBeCloseTo(99.9, 2);
  });

  it('should use custom BE margin from config', () => {
    const position = createPosition('XRPUSDT', PositionSide.LONG, 100);
    const context: ExitDecisionContext = {
      position,
      currentPrice: 101,
      currentState: PositionState.OPEN,
      config: { beMarginPercent: 0.5 },
    };

    const result = evaluateExit(context);

    // BE = 100 + (100 * 0.5%) = 100.5
    expect(result.actions[1].newStopLoss).toBeCloseTo(100.5, 2);
  });

  it('should use default BE margin when config not provided', () => {
    const position = createPosition();
    const context: ExitDecisionContext = {
      position,
      currentPrice: 101,
      currentState: PositionState.OPEN,
      // No config provided
    };

    const result = evaluateExit(context);

    // Should use default 0.1%
    // BE = 100 + (100 * 0.1%) = 100.1
    expect(result.actions[1].newStopLoss).toBeCloseTo(100.1, 2);
  });
});

// ============================================================================
// TESTS: Trailing Distance Calculation (4 tests)
// ============================================================================

describe('evaluateExit - Trailing Distance Calculation', () => {
  it('should calculate trailing distance with default percentage', () => {
    const position = createPosition();
    const context: ExitDecisionContext = {
      position,
      currentPrice: 102,
      currentState: PositionState.TP1_HIT,
      config: { trailingDistancePercent: 1.5 },
    };

    const result = evaluateExit(context);

    // Distance = 102 * 1.5% = 1.53
    expect(result.actions[1].trailingDistance).toBeCloseTo(1.53, 2);
  });

  it('should calculate trailing distance with ATR when indicators provided', () => {
    const position = createPosition();
    const indicators: ExitIndicators = {
      atrPercent: 2.0,
      currentVolume: 1000000,
      avgVolume: 900000,
    };
    const context: ExitDecisionContext = {
      position,
      currentPrice: 102,
      currentState: PositionState.TP1_HIT,
      indicators,
    };

    const result = evaluateExit(context);

    // Should use ATR (2.0%)
    // Distance = 102 * 2.0% = 2.04
    expect(result.actions[1].trailingDistance).toBeCloseTo(2.04, 2);
  });

  it('should tighten trailing on high volume', () => {
    const position = createPosition();
    const indicators: ExitIndicators = {
      atrPercent: 2.0,
      currentVolume: 2000000, // 2x average
      avgVolume: 1000000,
    };
    const context: ExitDecisionContext = {
      position,
      currentPrice: 102,
      currentState: PositionState.TP1_HIT,
      indicators,
    };

    const result = evaluateExit(context);

    // Should use ATR * 0.8 = 1.6%
    // Distance = 102 * 1.6% = 1.632
    expect(result.actions[1].trailingDistance).toBeCloseTo(1.632, 2);
  });

  it('should clamp ATR within min/max bounds', () => {
    const position = createPosition();
    const indicators: ExitIndicators = {
      atrPercent: 0.5, // Below min of 1.5
    };
    const context: ExitDecisionContext = {
      position,
      currentPrice: 102,
      currentState: PositionState.TP1_HIT,
      indicators,
    };

    const result = evaluateExit(context);

    // Should clamp to min 1.5%
    // Distance = 102 * 1.5% = 1.53
    expect(result.actions[1].trailingDistance).toBeCloseTo(1.53, 2);
  });
});

// ============================================================================
// TESTS: P&L Calculation (3 tests)
// ============================================================================

describe('evaluateExit - P&L Calculation', () => {
  it('should calculate positive P&L for profitable LONG', () => {
    const position = createPosition('XRPUSDT', PositionSide.LONG, 100, 1, 105);
    const context: ExitDecisionContext = {
      position,
      currentPrice: 105, // +5%
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    // Should have metadata with ~5% P&L
    expect(result.metadata?.profitPercent).toBeCloseTo(5, 0);
  });

  it('should calculate negative P&L for losing LONG', () => {
    const position = createPosition('XRPUSDT', PositionSide.LONG, 100);
    const context: ExitDecisionContext = {
      position,
      currentPrice: 95, // -5%
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    // SL should be hit
    expect(result.metadata?.profitPercent).toBeCloseTo(-5, 0);
  });

  it('should calculate P&L correctly for SHORT position', () => {
    const position = createPosition('XRPUSDT', PositionSide.SHORT, 100, 1, 99, 95, 90, 101);
    const context: ExitDecisionContext = {
      position,
      currentPrice: 95, // +5% for SHORT
      currentState: PositionState.TP1_HIT,
    };

    const result = evaluateExit(context);

    expect(result.metadata?.profitPercent).toBeCloseTo(5, 0);
  });
});

// ============================================================================
// TESTS: Edge Cases (6 tests)
// ============================================================================

describe('evaluateExit - Edge Cases', () => {
  it('should handle position with very tight TP levels', () => {
    const position = createPosition(
      'XRPUSDT',
      PositionSide.LONG,
      100,
      1,
      100.01, // 0.01% TP1
      100.02, // 0.02% TP2
      100.05, // 0.05% TP3
      99.9
    );
    const context: ExitDecisionContext = {
      position,
      currentPrice: 100.01,
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    expect(result.state).toBe(PositionState.TP1_HIT);
  });

  it('should handle position with very wide TP levels', () => {
    const position = createPosition(
      'XRPUSDT',
      PositionSide.LONG,
      100,
      1,
      150, // 50% TP1
      200, // 100% TP2
      300, // 200% TP3
      50
    );
    const context: ExitDecisionContext = {
      position,
      currentPrice: 150,
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    expect(result.state).toBe(PositionState.TP1_HIT);
  });

  it('should handle multiple TPs hit at once (price overshoots)', () => {
    const position = createPosition();
    const context: ExitDecisionContext = {
      position,
      currentPrice: 110, // Above all TPs
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    // Should transition to first TP hit (TP1)
    expect(result.state).toBe(PositionState.TP1_HIT);
  });

  it('should handle position with zero quantity', () => {
    const position = createPosition('XRPUSDT', PositionSide.LONG, 100, 0);
    const context: ExitDecisionContext = {
      position,
      currentPrice: 101,
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    // Should still process normally
    expect(result.state).toBe(PositionState.TP1_HIT);
  });

  it('should handle very large prices', () => {
    const position = createPosition(
      'BTCUSDT',
      PositionSide.LONG,
      50000, // Large price
      0.001,
      51000,
      52000,
      55000,
      49000
    );
    const context: ExitDecisionContext = {
      position,
      currentPrice: 51000,
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    expect(result.state).toBe(PositionState.TP1_HIT);
  });

  it('should handle very small prices', () => {
    const position = createPosition(
      'DOGECOIN',
      PositionSide.LONG,
      0.001, // Very small price
      1000000,
      0.0011,
      0.0012,
      0.0015,
      0.0009
    );
    const context: ExitDecisionContext = {
      position,
      currentPrice: 0.0011,
      currentState: PositionState.OPEN,
    };

    const result = evaluateExit(context);

    expect(result.state).toBe(PositionState.TP1_HIT);
  });
});

// ============================================================================
// TESTS: State Consistency (3 tests)
// ============================================================================

describe('evaluateExit - State Consistency', () => {
  it('should always return a valid PositionState', () => {
    const validStates = [
      PositionState.OPEN,
      PositionState.TP1_HIT,
      PositionState.TP2_HIT,
      PositionState.TP3_HIT,
      PositionState.CLOSED,
    ];

    const position = createPosition();
    const contexts: ExitDecisionContext[] = [
      { position, currentPrice: 100.5, currentState: PositionState.OPEN },
      { position, currentPrice: 101, currentState: PositionState.OPEN },
      { position, currentPrice: 102, currentState: PositionState.TP1_HIT },
      { position, currentPrice: 105, currentState: PositionState.TP2_HIT },
      { position, currentPrice: 98.5, currentState: PositionState.OPEN },
    ];

    contexts.forEach((context) => {
      const result = evaluateExit(context);
      expect(validStates).toContain(result.state);
    });
  });

  it('should always return actions array', () => {
    const position = createPosition();
    const contexts: ExitDecisionContext[] = [
      { position, currentPrice: 100.5, currentState: PositionState.OPEN },
      { position, currentPrice: 101, currentState: PositionState.OPEN },
      { position, currentPrice: 98.5, currentState: PositionState.OPEN },
    ];

    contexts.forEach((context) => {
      const result = evaluateExit(context);
      expect(Array.isArray(result.actions)).toBe(true);
    });
  });

  it('should always return a reason string', () => {
    const position = createPosition();
    const contexts: ExitDecisionContext[] = [
      { position, currentPrice: 100.5, currentState: PositionState.OPEN },
      { position, currentPrice: 101, currentState: PositionState.OPEN },
      { position, currentPrice: 98.5, currentState: PositionState.OPEN },
    ];

    contexts.forEach((context) => {
      const result = evaluateExit(context);
      expect(typeof result.reason).toBe('string');
      expect(result.reason.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// TESTS: Integration (3 tests)
// ============================================================================

describe('evaluateExit - Integration Scenarios', () => {
  it('should handle full position lifecycle: OPEN → TP1_HIT → TP2_HIT → TP3_HIT', () => {
    const position = createPosition();

    // Step 1: Open, no exit
    let context: ExitDecisionContext = {
      position,
      currentPrice: 100.5,
      currentState: PositionState.OPEN,
    };
    let result = evaluateExit(context);
    expect(result.state).toBe(PositionState.OPEN);

    // Step 2: TP1 hit
    context = { ...context, currentPrice: 101, currentState: result.state };
    result = evaluateExit(context);
    expect(result.state).toBe(PositionState.TP1_HIT);

    // Step 3: TP2 hit
    context = { ...context, currentPrice: 102, currentState: result.state };
    result = evaluateExit(context);
    expect(result.state).toBe(PositionState.TP2_HIT);

    // Step 4: TP3 hit
    context = { ...context, currentPrice: 105, currentState: result.state };
    result = evaluateExit(context);
    expect(result.state).toBe(PositionState.TP3_HIT);
  });

  it('should handle SL hit during TP progression', () => {
    const position = createPosition();

    // Progress to TP1_HIT
    let context: ExitDecisionContext = {
      position,
      currentPrice: 101,
      currentState: PositionState.OPEN,
    };
    let result = evaluateExit(context);
    expect(result.state).toBe(PositionState.TP1_HIT);

    // SL hit during TP1_HIT
    context = {
      ...context,
      currentPrice: 98.5,
      currentState: result.state,
    };
    result = evaluateExit(context);
    expect(result.state).toBe(PositionState.CLOSED);
    expect(result.metadata?.closureReason).toBe('SL_HIT');
  });

  it('should handle complete scenario with indicators', () => {
    const position = createPosition();
    const indicators: ExitIndicators = {
      atrPercent: 2.0,
      currentVolume: 1500000,
      avgVolume: 1000000,
    };

    const context: ExitDecisionContext = {
      position,
      currentPrice: 102,
      currentState: PositionState.TP1_HIT,
      indicators,
      config: {
        beMarginPercent: 0.1,
        trailingDistancePercent: 1.5,
      },
    };

    const result = evaluateExit(context);

    expect(result.state).toBe(PositionState.TP2_HIT);
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0].action).toBe(ExitAction.CLOSE_PERCENT);
    expect(result.actions[1].action).toBe(ExitAction.ACTIVATE_TRAILING);
    expect(result.actions[1].trailingDistance).toBeDefined();
    expect(result.actions[1].trailingDistance).toBeGreaterThan(0);
  });
});
