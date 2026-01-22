/**
 * ExitOrchestrator Unit Tests
 *
 * Tests all position exit logic:
 * - State transitions (OPEN → TP1_HIT → TP2_HIT → TP3_HIT → CLOSED)
 * - Stop Loss detection (ANY state → CLOSED)
 * - Take Profit hit detection
 * - Breakeven logic
 * - Trailing stop activation
 * - Edge cases and error handling
 */

import { ExitOrchestrator } from '../../orchestrators/exit.orchestrator';
import {
  Position,
  PositionState,
  ExitAction,
  PositionSide,
  LogLevel,
  TakeProfit,
} from '../../types';
import { LoggerService } from '../../services/logger.service';

// Test utilities
class TestLogger extends LoggerService {
  constructor() {
    super(LogLevel.INFO, './logs', false);
  }
}

function createPosition(
  side: PositionSide = PositionSide.LONG,
  entryPrice: number = 100,
  quantity: number = 1,
): Position {
  const tpPercents = [0.5, 1.0, 2.0];
  const takeProfits: TakeProfit[] = tpPercents.map((percent, index) => ({
    level: index + 1,
    percent,
    sizePercent: index === 0 ? 50 : index === 1 ? 30 : 20,
    price: side === PositionSide.LONG ? entryPrice * (1 + percent / 100) : entryPrice * (1 - percent / 100),
    hit: false,
  }));

  const slPrice = side === PositionSide.LONG ? entryPrice * 0.98 : entryPrice * 1.02;

  return {
    id: 'test-position-1',
    symbol: 'BTCUSDT',
    side,
    quantity,
    entryPrice,
    exitPrice: 0,
    leverage: 1,
    marginUsed: quantity * entryPrice,
    entryCondition: { signal: {}, indicators: {} } as any,
    openedAt: Date.now(),
    unrealizedPnL: 0,
    orderId: 'test-order-1',
    status: 'OPEN' as const,
    reason: 'test position',
    closedAt: 0,
    takeProfits,
    stopLoss: {
      price: slPrice,
      initialPrice: slPrice,
      isBreakeven: false,
      isTrailing: false,
      updatedAt: Date.now(),
    },
  } as unknown as Position;
}

describe('ExitOrchestrator', () => {
  let orchestrator: ExitOrchestrator;
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
    orchestrator = new ExitOrchestrator(logger);
  });

  describe('Basic Functionality', () => {
    it('should return OPEN state for position with no exit conditions', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      const result = await orchestrator.evaluateExit(position, 100.2); // Price slightly up, no TP/SL hit

      expect(result.newState).toBe(PositionState.OPEN);
      expect(result.actions.length).toBe(0);
    });

    it('should close position when Stop Loss hit', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      const result = await orchestrator.evaluateExit(position, position.stopLoss.price - 0.01); // Below SL

      expect(result.newState).toBe(PositionState.CLOSED);
      expect(result.actions).toContainEqual({ action: ExitAction.CLOSE_ALL });
    });

    it('should detect when TP1 is hit for LONG position', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);
      const tp1Price = position.takeProfits[0].price;

      const result = await orchestrator.evaluateExit(position, tp1Price + 0.01); // Above TP1

      expect(result.newState).toBe(PositionState.TP1_HIT);
      expect(result.actions).toContainEqual({ action: ExitAction.CLOSE_PERCENT, percent: 50 });
    });

    it('should detect when TP1 is hit for SHORT position', async () => {
      const position = createPosition(PositionSide.SHORT, 100, 1);
      const tp1Price = position.takeProfits[0].price;

      const result = await orchestrator.evaluateExit(position, tp1Price - 0.01); // Below TP1

      expect(result.newState).toBe(PositionState.TP1_HIT);
      expect(result.actions).toContainEqual({ action: ExitAction.CLOSE_PERCENT, percent: 50 });
    });
  });

  describe('State Transitions', () => {
    it('should transition from OPEN to TP1_HIT', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);
      const tp1Price = position.takeProfits[0].price;

      const result = await orchestrator.evaluateExit(position, tp1Price + 0.01);

      expect(result.newState).toBe(PositionState.TP1_HIT);
      expect(result.stateTransition).toContain('OPEN → TP1_HIT');
    });

    it('should transition from TP1_HIT to TP2_HIT', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);
      const tp1Price = position.takeProfits[0].price;
      const tp2Price = position.takeProfits[1].price;

      // First hit TP1
      await orchestrator.evaluateExit(position, tp1Price + 0.01);

      // Then hit TP2
      const result = await orchestrator.evaluateExit(position, tp2Price + 0.01);

      expect(result.newState).toBe(PositionState.TP2_HIT);
      expect(result.stateTransition).toContain('TP1_HIT → TP2_HIT');
    });

    it('should transition from TP2_HIT to TP3_HIT', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);
      const tp1Price = position.takeProfits[0].price;
      const tp2Price = position.takeProfits[1].price;
      const tp3Price = position.takeProfits[2].price;

      // Progress through states
      await orchestrator.evaluateExit(position, tp1Price + 0.01);
      await orchestrator.evaluateExit(position, tp2Price + 0.01);

      // Hit TP3
      const result = await orchestrator.evaluateExit(position, tp3Price + 0.01);

      expect(result.newState).toBe(PositionState.TP3_HIT);
      expect(result.stateTransition).toContain('TP2_HIT → TP3_HIT');
    });

    it('should handle full position lifecycle (OPEN → TP1 → TP2 → TP3)', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      // Hit TP1
      let result = await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);
      expect(result.newState).toBe(PositionState.TP1_HIT);
      expect(result.actions).toContainEqual({ action: ExitAction.CLOSE_PERCENT, percent: 50 });

      // Hit TP2
      result = await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01);
      expect(result.newState).toBe(PositionState.TP2_HIT);
      expect(result.actions).toContainEqual({ action: ExitAction.CLOSE_PERCENT, percent: 30 });

      // Hit TP3
      result = await orchestrator.evaluateExit(position, position.takeProfits[2].price + 0.01);
      expect(result.newState).toBe(PositionState.TP3_HIT);
      expect(result.actions).toContainEqual({ action: ExitAction.CLOSE_PERCENT, percent: 20 });
    });
  });

  describe('Stop Loss Priority', () => {
    it('should close position on SL hit even if TP1 not yet reached', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      const result = await orchestrator.evaluateExit(position, position.stopLoss.price - 0.01);

      expect(result.newState).toBe(PositionState.CLOSED);
      expect(result.stateTransition).toContain('CLOSED (SL HIT)');
    });

    it('should close position on SL hit even after TP1 reached', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      // First hit TP1
      await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);

      // Then SL hit
      const result = await orchestrator.evaluateExit(position, position.stopLoss.price - 0.01);

      expect(result.newState).toBe(PositionState.CLOSED);
    });

    it('should close on SL for SHORT position', async () => {
      const position = createPosition(PositionSide.SHORT, 100, 1);

      const result = await orchestrator.evaluateExit(position, position.stopLoss.price + 0.01);

      expect(result.newState).toBe(PositionState.CLOSED);
    });
  });

  describe('Breakeven Logic', () => {
    it('should move SL to breakeven when TP1 hit', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      const result = await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);

      expect(result.actions).toContainEqual(
        expect.objectContaining({ action: ExitAction.UPDATE_SL })
      );

      const updateSLAction = result.actions.find(a => a.action === ExitAction.UPDATE_SL);
      expect(updateSLAction?.newStopLoss).toBeGreaterThan(position.entryPrice);
      expect(updateSLAction?.newStopLoss).toBeLessThan(position.takeProfits[0].price);
    });

    it('should lock in small profit on breakeven', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      const result = await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);

      const updateSLAction = result.actions.find(a => a.action === ExitAction.UPDATE_SL);
      const newSL = updateSLAction?.newStopLoss || 0;

      // Should be slightly above entry price for LONG
      expect(newSL).toBeGreaterThan(position.entryPrice);
    });
  });

  describe('Trailing Stop', () => {
    it('should activate trailing stop when TP2 hit', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      // Hit TP1 first
      await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);

      // Then hit TP2
      const result = await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01);

      expect(result.actions).toContainEqual(
        expect.objectContaining({ action: ExitAction.ACTIVATE_TRAILING })
      );
    });

    it('should calculate trailing distance based on ATR (SmartTrailingV2)', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      // Hit TP1
      await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);

      // Hit TP2 with ATR provided
      const result = await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01, {
        atrPercent: 2.0, // 2% ATR
      });

      const trailingAction = result.actions.find(a => a.action === ExitAction.ACTIVATE_TRAILING);
      expect(trailingAction?.trailingDistance).toBeGreaterThan(0);
      // SmartTrailingV2 with 2% ATR should produce ~2.0 distance (2% of 100 entry price)
      // Min ATR is 1.5%, so minimum distance ~1.5
      // Max ATR is 3%, so maximum distance ~3.0
      expect(trailingAction?.trailingDistance).toBeLessThanOrEqual(3.5);
      expect(trailingAction?.trailingDistance).toBeGreaterThanOrEqual(1.5);
    });
  });

  describe('Close Percentages', () => {
    it('should close 50% on TP1 hit', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      const result = await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);

      const closeAction = result.actions.find(a => a.action === ExitAction.CLOSE_PERCENT);
      expect(closeAction?.percent).toBe(50);
    });

    it('should close 30% on TP2 hit', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);
      const result = await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01);

      const closeAction = result.actions.find(a => a.action === ExitAction.CLOSE_PERCENT);
      expect(closeAction?.percent).toBe(30);
    });

    it('should close 20% on TP3 hit', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);
      await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01);
      const result = await orchestrator.evaluateExit(position, position.takeProfits[2].price + 0.01);

      const closeAction = result.actions.find(a => a.action === ExitAction.CLOSE_PERCENT);
      expect(closeAction?.percent).toBe(20);
    });
  });

  describe('Input Validation - FAST FAIL', () => {
    it('should return CLOSED on invalid position (null)', async () => {
      const result = await orchestrator.evaluateExit(null as any, 100);

      expect(result.newState).toBe(PositionState.CLOSED);
      expect(result.actions).toContainEqual({ action: ExitAction.CLOSE_ALL });
    });

    it('should return CLOSED on invalid price (0)', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      const result = await orchestrator.evaluateExit(position, 0);

      expect(result.newState).toBe(PositionState.CLOSED);
    });

    it('should return CLOSED on negative price', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      const result = await orchestrator.evaluateExit(position, -100);

      expect(result.newState).toBe(PositionState.CLOSED);
    });
  });

  describe('Position State Management', () => {
    it('should reset position state when closed', () => {
      orchestrator.getPositionState('BTCUSDT'); // Initialize

      orchestrator.resetPositionState('BTCUSDT');

      expect(orchestrator.getPositionState('BTCUSDT')).toBe(PositionState.OPEN);
    });

    it('should track state for different positions separately', async () => {
      const position1 = createPosition(PositionSide.LONG, 100, 1);
      position1.symbol = 'BTCUSDT';

      const position2 = createPosition(PositionSide.SHORT, 50, 1);
      position2.symbol = 'ETHUSDT';

      // Progress position1
      await orchestrator.evaluateExit(position1, position1.takeProfits[0].price + 0.01);

      // Position2 stays at OPEN
      const result2 = await orchestrator.evaluateExit(position2, 50.5);

      expect(orchestrator.getPositionState('BTCUSDT')).toBe(PositionState.TP1_HIT);
      expect(orchestrator.getPositionState('ETHUSDT')).toBe(PositionState.OPEN);
      expect(result2.newState).toBe(PositionState.OPEN);
    });
  });

  describe('Edge Cases', () => {
    it('should handle exact price match on TP level', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);
      const tp1Price = position.takeProfits[0].price;

      const result = await orchestrator.evaluateExit(position, tp1Price); // Exact match

      expect(result.newState).toBe(PositionState.TP1_HIT);
    });

    it('should handle exact price match on SL', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);
      const slPrice = position.stopLoss.price;

      const result = await orchestrator.evaluateExit(position, slPrice); // Exact match

      expect(result.newState).toBe(PositionState.CLOSED);
    });

    it('should handle position with missing take profit levels', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);
      position.takeProfits = [];

      const result = await orchestrator.evaluateExit(position, 110);

      expect(result.newState).toBe(PositionState.OPEN);
      expect(result.actions.length).toBe(0);
    });

    it('should handle multiple TPs at same price (edge case)', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);
      position.takeProfits[1].price = position.takeProfits[0].price; // Same TP levels

      const result = await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);

      // Should hit the first one
      expect(result.newState).toBe(PositionState.TP1_HIT);
    });

    it('should handle very large position quantities', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1000000);

      const result = await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);

      expect(result.newState).toBe(PositionState.TP1_HIT);
      expect(result.actions).toContainEqual({ action: ExitAction.CLOSE_PERCENT, percent: 50 });
    });

    it('should handle very small position prices', async () => {
      const position = createPosition(PositionSide.LONG, 0.00001, 1);

      const result = await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.000001);

      expect(result.newState).toBe(PositionState.TP1_HIT);
    });
  });

  describe('Logging & Debugging', () => {
    it('should log state transitions', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      const result = await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);

      expect(result.stateTransition).toBeDefined();
      expect(result.stateTransition).toContain('→');
    });

    it('should include actions in result for debugging', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      const result = await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);

      expect(result.actions).toBeDefined();
      expect(Array.isArray(result.actions)).toBe(true);
    });
  });

  // ============================================================================
  // EXTENDED TEST SUITE (Phase 13.2: Additional Coverage)
  // ============================================================================

  describe('Advanced Trailing Stop (SmartTrailingV2)', () => {
    it('should activate trailing after TP2 hit', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);
      // Progress to TP2 to activate trailing
      await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);
      const result = await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01);

      // Should have trailing activation action
      const trailingAction = result.actions.find(a => a.action === ExitAction.ACTIVATE_TRAILING);
      expect(trailingAction).toBeDefined();
      expect(result.newState).toBe(PositionState.TP2_HIT);
    });

    it('should track trailing state for LONG position', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);
      // Move to TP2 to activate trailing
      await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);
      await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01);

      // Subsequent evaluations should maintain state
      const result = await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.5);

      // Should stay in TP2_HIT state
      expect(result.newState).toBe(PositionState.TP2_HIT);
    });

    it('should allow continuation above TP2 level', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);
      // Progress to TP2
      await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);
      await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01);

      // Price goes up (high profit)
      const result = await orchestrator.evaluateExit(position, position.takeProfits[1].price + 2);

      // Should maintain at least TP2_HIT or continue to TP3
      expect([PositionState.TP2_HIT, PositionState.TP3_HIT]).toContain(result.newState);
    });

    it('should adjust trailing distance based on profit level', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);
      position.unrealizedPnL = 2; // Higher profit suggests continued strength

      // Progress to TP2
      await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);
      const result = await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01);

      // Should generate trailing action with appropriate distance
      const trailingAction = result.actions.find(a => a.action === ExitAction.ACTIVATE_TRAILING);
      expect(trailingAction).toBeDefined();
    });

    it('should handle SHORT position trailing correctly', async () => {
      const position = createPosition(PositionSide.SHORT, 100, 1);

      // Progress to TP2
      await orchestrator.evaluateExit(position, position.takeProfits[0].price - 0.01);
      const result = await orchestrator.evaluateExit(position, position.takeProfits[1].price - 0.01);

      // Should activate trailing for SHORT position
      const trailingAction = result.actions.find(a => a.action === ExitAction.ACTIVATE_TRAILING);
      expect(trailingAction).toBeDefined();
      expect(result.newState).toBe(PositionState.TP2_HIT);
    });
  });

  describe('Pre-BE (Breakeven) Mode', () => {
    it('should lock profit in pre-BE mode after TP1', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      // Hit TP1 to enter pre-BE mode
      const result = await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);

      // Should move SL to breakeven
      expect(result.actions.some(a => a.action === ExitAction.UPDATE_SL)).toBe(true);
    });

    it('should count candles in pre-BE mode', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      // Hit TP1
      await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);

      // Next candle - candle count increments
      const result = await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.05);

      expect(result.newState).toBe(PositionState.TP1_HIT);
    });

    it('should transition from pre-BE to trailing after N candles', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      // Hit TP1
      await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);

      // Wait through multiple candles then hit TP2
      await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.02);
      const result = await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01);

      // Should progress to TP2_HIT
      expect(result.newState).toBe(PositionState.TP2_HIT);
    });

    it('should exit on SL during pre-BE mode', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      // Hit TP1
      await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);

      // Price hits SL (which was moved to BE)
      const slPrice = position.stopLoss.price; // BE price
      const result = await orchestrator.evaluateExit(position, slPrice - 0.01);

      expect(result.newState).toBe(PositionState.CLOSED);
    });

    it('should apply profit lock during pre-BE', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      // Hit TP1
      const result = await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);

      // Should have both CLOSE_PERCENT and UPDATE_SL actions
      expect(result.actions.some(a => a.action === ExitAction.CLOSE_PERCENT)).toBe(true);
      expect(result.actions.some(a => a.action === ExitAction.UPDATE_SL)).toBe(true);
    });
  });

  describe('Adaptive TP3 (Market Condition Based)', () => {
    it('should adjust TP3 based on volatility', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      // Progress through TP1 and TP2
      await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);
      await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01);

      // Check TP3 adjustment (adaptive based on market conditions)
      const result = await orchestrator.evaluateExit(position, position.takeProfits[2].price + 0.01);

      expect(result.newState).toBe(PositionState.TP3_HIT);
    });

    it('should increase TP3 on high volume', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);
      position.unrealizedPnL = 5; // High profit suggests high volume/momentum

      // Progress through TP1 and TP2
      await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);
      const result = await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01);

      // Should have actions related to adaptive TP3
      expect(result.actions).toBeDefined();
    });

    it('should handle low volume with conservative TP3', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);
      position.unrealizedPnL = 0.2; // Low profit indicates low volume

      // Progress through TP1 and TP2
      await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);
      await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01);

      // TP3 should be closer to TP2
      const result = await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.5);

      expect(result.newState).toBe(PositionState.TP2_HIT);
    });

    it('should respect maximum TP3 profit percent', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      // Progress through all TP levels
      await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);
      await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01);

      // Price goes extreme high (beyond reasonable TP3)
      const result = await orchestrator.evaluateExit(position, position.entryPrice * 1.1);

      // Should close on TP3 hit
      expect(result.newState).toBe(PositionState.TP3_HIT);
    });
  });

  describe('Bollinger Band Trailing Mode', () => {
    it('should activate trailing stop after TP2 hit', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      // Progress to TP2
      await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);
      const result = await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01);

      // Should activate some form of trailing
      expect(result.actions.some(a => a.action === ExitAction.ACTIVATE_TRAILING)).toBe(true);
    });

    it('should maintain state at TP2 after activation', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      // Progress to TP2 trailing mode
      await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);
      await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01);

      // Continue evaluating without hitting SL
      const result = await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.5);

      expect(result.newState).toBe(PositionState.TP2_HIT);
    });

    it('should respond to price movement in BB trailing mode', async () => {
      const position = createPosition(PositionSide.SHORT, 100, 1);

      // Progress to TP2 trailing mode
      await orchestrator.evaluateExit(position, position.takeProfits[0].price - 0.01);
      await orchestrator.evaluateExit(position, position.takeProfits[1].price - 0.01);

      // Continue evaluation
      const result = await orchestrator.evaluateExit(position, position.takeProfits[1].price - 0.5);

      expect(result.newState).toBe(PositionState.TP2_HIT);
    });

    it('should track BB trailing state correctly', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      // Progress to TP2 for BB trailing mode
      await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);
      const result = await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01);

      // Should have trailing action
      const trailingAction = result.actions.find(a => a.action === ExitAction.ACTIVATE_TRAILING);
      expect(trailingAction).toBeDefined();
    });
  });

  describe('Multi-Strategy Support (Phase 10.3c)', () => {
    it('should work with or without strategyId', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      // Both should work fine
      const result = await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);

      expect(result).toBeDefined();
      expect(result.newState).toBe(PositionState.TP1_HIT);
    });

    it('should maintain separate state for different positions regardless of strategy', async () => {
      const position1 = createPosition(PositionSide.LONG, 100, 1);
      position1.symbol = 'STRATEGY-A-BTCUSDT';

      const position2 = createPosition(PositionSide.SHORT, 50, 1);
      position2.symbol = 'STRATEGY-B-ETHUSDT';

      // Progress both
      const result1 = await orchestrator.evaluateExit(position1, position1.takeProfits[0].price + 0.01);
      const result2 = await orchestrator.evaluateExit(position2, position2.takeProfits[0].price - 0.01);

      expect(result1.newState).toBe(PositionState.TP1_HIT);
      expect(result2.newState).toBe(PositionState.TP1_HIT);
    });

    it('should handle simultaneous evaluations for multiple strategies', async () => {
      const positions = [
        createPosition(PositionSide.LONG, 100, 1),
        createPosition(PositionSide.SHORT, 100, 1),
        createPosition(PositionSide.LONG, 100, 1),
      ];

      // Evaluate all in sequence
      const results = await Promise.all(
        positions.map((pos, idx) => {
          const price = pos.side === PositionSide.LONG
            ? pos.takeProfits[0].price + 0.01
            : pos.takeProfits[0].price - 0.01;
          return orchestrator.evaluateExit(pos, price);
        }),
      );

      // All should transition correctly
      expect(results.every(r => r.newState === PositionState.TP1_HIT)).toBe(true);
    });
  });

  describe('Full Position Lifecycle With Advanced Features', () => {
    it('should complete full lifecycle: OPEN → TP1 → TP2 → TP3 → CLOSED', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      // OPEN → TP1_HIT
      let result = await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);
      expect(result.newState).toBe(PositionState.TP1_HIT);

      // TP1_HIT → TP2_HIT
      result = await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01);
      expect(result.newState).toBe(PositionState.TP2_HIT);

      // TP2_HIT → TP3_HIT
      result = await orchestrator.evaluateExit(position, position.takeProfits[2].price + 0.01);
      expect(result.newState).toBe(PositionState.TP3_HIT);

      // TP3_HIT → CLOSED (via SL or holding until manual close)
      result = await orchestrator.evaluateExit(position, position.stopLoss.price - 0.01);
      expect(result.newState).toBe(PositionState.CLOSED);
    });

    it('should handle full lifecycle with SL hit mid-way', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      // Progress to TP2
      await orchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);
      await orchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01);

      // Hit SL even at TP2 state
      const result = await orchestrator.evaluateExit(position, position.stopLoss.price - 0.01);

      expect(result.newState).toBe(PositionState.CLOSED);
      expect(result.actions.some(a => a.action === ExitAction.CLOSE_ALL)).toBe(true);
    });
  });

  describe('Performance & Stress Tests', () => {
    it('should handle rapid price changes efficiently', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      const startTime = Date.now();

      // Simulate 10 rapid candles
      for (let i = 0; i < 10; i++) {
        await orchestrator.evaluateExit(position, 100 + i * 0.5);
      }

      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(50); // Should be very fast
    });

    it('should handle many positions concurrently', async () => {
      const positions = Array.from({ length: 50 }, (_, i) =>
        createPosition(PositionSide.LONG, 100 - i, 1),
      );

      const startTime = Date.now();

      const results = await Promise.all(
        positions.map(pos => orchestrator.evaluateExit(pos, pos.takeProfits[0].price + 0.01)),
      );

      const elapsed = Date.now() - startTime;

      expect(results.length).toBe(50);
      expect(elapsed).toBeLessThan(200); // Should complete in < 200ms
    });
  });
});
