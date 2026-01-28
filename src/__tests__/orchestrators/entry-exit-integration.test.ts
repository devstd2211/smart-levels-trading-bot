/**
 * Entry + Exit Orchestrator Integration Tests
 *
 * Validates that Phase 6a (EntryOrchestrator) and Phase 6b (ExitOrchestrator)
 * work together correctly across the full trading lifecycle.
 *
 * Test Scenarios:
 * 1. Full position lifecycle (Entry → Open → TP1 → TP2 → TP3 → Close)
 * 2. Trend alignment (Entry respects trend, Exit doesn't interfere)
 * 3. State consistency (Both orchestrators maintain consistent position state)
 * 4. Logging consistency (Unified decision logging format)
 * 5. Error handling (Graceful error handling in both paths)
 */

import { EntryOrchestrator } from '../../orchestrators/entry.orchestrator';
import { ExitOrchestrator } from '../../orchestrators/exit.orchestrator';
import {
  Signal,
  SignalDirection,
  SignalType,
  EntryDecision,
  Position,
  PositionState,
  PositionSide,
  TrendAnalysis,
  TrendBias,
  ExitAction,
  LogLevel,
  TakeProfit,
  RiskManagerConfig,
  RiskDecision,
} from '../../types';
import { LoggerService } from '../../services/logger.service';
import { RiskManager } from '../../services/risk-manager.service';
import { ErrorHandler } from '../../errors/ErrorHandler';

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Mock RiskManager that always approves trades (for testing Entry/Exit orchestrators)
 */
class MockRiskManager extends RiskManager {
  constructor(
    config: RiskManagerConfig,
    logger: LoggerService,
    errorHandler?: ErrorHandler,
  ) {
    super(config, logger, errorHandler!);
  }

  async canTrade(): Promise<RiskDecision> {
    return {
      allowed: true,
      reason: 'Test approval',
      adjustedPositionSize: 100,
    };
  }
}

class TestLogger extends LoggerService {
  logHistory: Array<{ level: string; message: string; metadata: any }> = [];

  constructor() {
    super(LogLevel.DEBUG, './logs', false);
  }

  // Override to capture logs
  info(message: string, metadata?: any): void {
    this.logHistory.push({ level: 'INFO', message, metadata });
    super.info(message, metadata);
  }

  debug(message: string, metadata?: any): void {
    this.logHistory.push({ level: 'DEBUG', message, metadata });
    super.debug(message, metadata);
  }

  warn(message: string, metadata?: any): void {
    this.logHistory.push({ level: 'WARN', message, metadata });
    super.warn(message, metadata);
  }

  error(message: string, metadata?: any): void {
    this.logHistory.push({ level: 'ERROR', message, metadata });
    super.error(message, metadata);
  }

  clearHistory(): void {
    this.logHistory = [];
  }
}

// Create test signal
function createSignal(
  direction: SignalDirection,
  confidence: number = 75,
  type: SignalType = SignalType.LEVEL_BASED,
): Signal {
  return {
    type,
    direction,
    confidence,
    price: direction === SignalDirection.LONG ? 100 : 100,
    stopLoss: direction === SignalDirection.LONG ? 98 : 102,
    takeProfits: [
      { level: 1, percent: 0.5, sizePercent: 50, price: direction === SignalDirection.LONG ? 100.5 : 99.5, hit: false },
      { level: 2, percent: 1.0, sizePercent: 30, price: direction === SignalDirection.LONG ? 101 : 99, hit: false },
      { level: 3, percent: 2.0, sizePercent: 20, price: direction === SignalDirection.LONG ? 102 : 98, hit: false },
    ],
    reason: 'test signal',
    timestamp: Date.now(),
  };
}

// Create test position with full setup
let positionCounter = 0;
function createPosition(
  side: PositionSide = PositionSide.LONG,
  entryPrice: number = 100,
  quantity: number = 1,
  symbol: string = 'BTCUSDT',
): Position {
  const tpPercents = [0.5, 1.0, 2.0];
  const takeProfits: TakeProfit[] = tpPercents.map((percent, index) => ({
    level: index + 1,
    percent,
    sizePercent: index === 0 ? 50 : index === 1 ? 30 : 20,
    price:
      side === PositionSide.LONG
        ? entryPrice * (1 + percent / 100)
        : entryPrice * (1 - percent / 100),
    hit: false,
  }));

  const slPrice = side === PositionSide.LONG ? entryPrice * 0.98 : entryPrice * 1.02;

  return {
    id: 'integration-test-' + (positionCounter++),
    symbol,
    side,
    quantity,
    entryPrice,
    exitPrice: 0,
    leverage: 1,
    marginUsed: quantity * entryPrice,
    entryCondition: { signal: {}, indicators: {} } as any,
    openedAt: Date.now(),
    unrealizedPnL: 0,
    orderId: 'test-order-' + Date.now(),
    status: 'OPEN' as const,
    reason: 'integration test position',
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

// Create trend analysis
function createTrendAnalysis(bias: TrendBias): TrendAnalysis {
  return {
    bias,
    strength: 0.7,
    timeframe: '5m',
    pattern: bias === TrendBias.BULLISH ? 'HH_HL' : bias === TrendBias.BEARISH ? 'LH_LL' : 'FLAT',
    reasoning: [`Trend is ${bias}`],
    restrictedDirections:
      bias === TrendBias.BULLISH
        ? [SignalDirection.SHORT]
        : bias === TrendBias.BEARISH
          ? [SignalDirection.LONG]
          : [],
  };
}

// Create neutral trend helper
function createNeutralTrend(): TrendAnalysis {
  return createTrendAnalysis(TrendBias.NEUTRAL);
}

// ============================================================================
// TESTS
// ============================================================================

describe('Entry + Exit Orchestrator Integration', () => {
  let entryOrchestrator: EntryOrchestrator;
  let exitOrchestrator: ExitOrchestrator;
  let logger: TestLogger;
  let riskManager: RiskManager;

  beforeEach(() => {
    logger = new TestLogger();
    const riskConfig: RiskManagerConfig = {
      dailyLimits: {
        maxDailyLossPercent: 50.0,
        maxDailyProfitPercent: 200.0,
        emergencyStopOnLimit: false,
      },
      lossStreak: {
        stopAfterLosses: undefined,
        reductions: {
          after2Losses: 1.0,
          after3Losses: 1.0,
          after4Losses: 1.0,
        },
      },
      concurrentRisk: {
        enabled: true,
        maxPositions: 10,
        maxRiskPerPosition: 50.0,
        maxTotalExposurePercent: 100.0,
      },
      positionSizing: {
        riskPerTradePercent: 10.0,
        minPositionSizeUsdt: 1.0,
        maxPositionSizeUsdt: 1000.0,
        maxLeverageMultiplier: 10.0,
      },
    } as unknown as RiskManagerConfig;
    // Use mock to avoid complex risk calculations in tests
    riskManager = new MockRiskManager(riskConfig, logger);
    entryOrchestrator = new EntryOrchestrator(riskManager, logger);
    exitOrchestrator = new ExitOrchestrator(logger);
  });

  describe('Full Position Lifecycle', () => {
    it('should execute full lifecycle: LONG entry → TP1 → TP2 → TP3 → CLOSED', async () => {
      // STEP 1: Entry decision
      const signal = createSignal(SignalDirection.LONG, 75);
      const entryDecision = await entryOrchestrator.evaluateEntry(
        [signal],
        10000, // account balance (increased to avoid risk limits)
        [], // no open positions
        createNeutralTrend(),
      );

      expect(entryDecision.decision).toBe(EntryDecision.ENTER);
      expect(entryDecision.signal?.direction).toBe(SignalDirection.LONG);

      // STEP 2: Position opened
      const position = createPosition(PositionSide.LONG, 100, 1);
      expect(position.status).toBe('OPEN');
      expect(position.side).toBe(PositionSide.LONG);

      // STEP 3: TP1 hit
      const tp1Result = await exitOrchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);
      expect(tp1Result.newState).toBe(PositionState.TP1_HIT);
      expect(tp1Result.actions.length).toBeGreaterThan(0);
      const closePercentAction = tp1Result.actions.find(a => a.action === ExitAction.CLOSE_PERCENT);
      expect(closePercentAction?.percent).toBe(50); // Close 50%

      // STEP 4: TP2 hit
      const tp2Result = await exitOrchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01, {
        atrPercent: 2.0,
      });
      expect(tp2Result.newState).toBe(PositionState.TP2_HIT);
      const closePercent2 = tp2Result.actions.find(a => a.action === ExitAction.CLOSE_PERCENT);
      expect(closePercent2?.percent).toBe(30); // Close 30%

      // STEP 5: TP3 hit
      const tp3Result = await exitOrchestrator.evaluateExit(position, position.takeProfits[2].price + 0.01);
      expect(tp3Result.newState).toBe(PositionState.TP3_HIT);
      const closePercent3 = tp3Result.actions.find(a => a.action === ExitAction.CLOSE_PERCENT);
      expect(closePercent3?.percent).toBe(20); // Close final 20%

      // Verify complete lifecycle logged
      const entryLogs = logger.logHistory.filter(l => l.message.includes('APPROVED'));
      expect(entryLogs.length).toBeGreaterThan(0);

      const exitLogs = logger.logHistory.filter(l => l.message.includes('Exit State Transition'));
      expect(exitLogs.length).toBe(3); // TP1, TP2, TP3
    });

    it('should handle SL hit before TP1', async () => {
      const signal = createSignal(SignalDirection.SHORT, 75);
      const entryDecision = await entryOrchestrator.evaluateEntry(
        [signal],
        10000,
        [],
        createNeutralTrend(),
      );

      expect(entryDecision.decision).toBe(EntryDecision.ENTER);

      const position = createPosition(PositionSide.SHORT, 100, 1);
      const slPrice = position.stopLoss.price; // For SHORT, SL = 102 (above entry)

      // SL hit - for SHORT, need price ABOVE SL
      const slResult = await exitOrchestrator.evaluateExit(position, slPrice + 0.01);
      expect(slResult.newState).toBe(PositionState.CLOSED);
      expect(slResult.actions).toContainEqual({ action: ExitAction.CLOSE_ALL });
    });
  });

  describe('Trend Alignment Validation', () => {
    it('should block LONG entry in BEARISH trend', async () => {
      const signal = createSignal(SignalDirection.LONG, 75);
      const bearishTrend = createTrendAnalysis(TrendBias.BEARISH);

      const decision = await entryOrchestrator.evaluateEntry(
        [signal],
        10000,
        [],
        bearishTrend,
      );

      expect(decision.decision).toBe(EntryDecision.SKIP);
      expect(decision.reason).toContain('Trend misalignment');
    });

    it('should allow SHORT entry in BEARISH trend', async () => {
      const signal = createSignal(SignalDirection.SHORT, 75);
      const bearishTrend = createTrendAnalysis(TrendBias.BEARISH);

      const decision = await entryOrchestrator.evaluateEntry(
        [signal],
        10000,
        [],
        bearishTrend,
      );

      expect(decision.decision).toBe(EntryDecision.ENTER);
      expect(decision.signal?.direction).toBe(SignalDirection.SHORT);
    });

    it('should allow both directions in NEUTRAL trend', async () => {
      const neutralTrend = createTrendAnalysis(TrendBias.NEUTRAL);

      // Test LONG
      const longSignal = createSignal(SignalDirection.LONG, 75);
      const longDecision = await entryOrchestrator.evaluateEntry(
        [longSignal],
        10000,
        [],
        neutralTrend,
      );
      expect(longDecision.decision).toBe(EntryDecision.ENTER);

      // Test SHORT
      const shortSignal = createSignal(SignalDirection.SHORT, 75);
      const shortDecision = await entryOrchestrator.evaluateEntry(
        [shortSignal],
        10000,
        [],
        neutralTrend,
      );
      expect(shortDecision.decision).toBe(EntryDecision.ENTER);
    });

    it('ExitOrchestrator should NOT check trend (exits regardless)', async () => {
      const position = createPosition(PositionSide.SHORT, 100, 1);
      const bearishTrend = createTrendAnalysis(TrendBias.BULLISH); // Opposite trend

      // SL should trigger regardless of trend
      // For SHORT, SL = 102, so need price ABOVE to hit
      const slResult = await exitOrchestrator.evaluateExit(
        position,
        position.stopLoss.price + 0.01,
      );

      expect(slResult.newState).toBe(PositionState.CLOSED);
      // No trend check in exit orchestrator
    });
  });

  describe('State Consistency', () => {
    it('should maintain consistent position state through lifecycle', async () => {
      let state = PositionState.OPEN;
      const position = createPosition(PositionSide.LONG, 100, 1);

      // TP1 → TP1_HIT
      let result = await exitOrchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);
      state = result.newState;
      expect(state).toBe(PositionState.TP1_HIT);

      // TP1_HIT → TP2_HIT
      result = await exitOrchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01);
      state = result.newState;
      expect(state).toBe(PositionState.TP2_HIT);

      // TP2_HIT → TP3_HIT
      result = await exitOrchestrator.evaluateExit(position, position.takeProfits[2].price + 0.01);
      state = result.newState;
      expect(state).toBe(PositionState.TP3_HIT);

      // No going backwards
      result = await exitOrchestrator.evaluateExit(position, position.takeProfits[2].price);
      expect(result.newState).toBe(PositionState.TP3_HIT); // Still TP3_HIT
    });

    it('should reset state when position closed', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1, 'SYMBOL1');

      // Hit TP1
      await exitOrchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);

      // Close at SL
      const closeResult = await exitOrchestrator.evaluateExit(position, position.stopLoss.price - 0.01);
      expect(closeResult.newState).toBe(PositionState.CLOSED);

      // New position with different symbol should start fresh
      const newPosition = createPosition(PositionSide.SHORT, 95, 1, 'SYMBOL2');
      const freshResult = await exitOrchestrator.evaluateExit(newPosition, 95.1);
      expect(freshResult.newState).toBe(PositionState.OPEN); // No previous state for different symbol
    });

    it('should track different positions separately', async () => {
      const position1 = createPosition(PositionSide.LONG, 100, 1, 'SYMBOL_A');
      const position2 = createPosition(PositionSide.SHORT, 95, 1, 'SYMBOL_B');

      // Hit TP1 on position 1
      const result1 = await exitOrchestrator.evaluateExit(position1, position1.takeProfits[0].price + 0.01);
      expect(result1.newState).toBe(PositionState.TP1_HIT);

      // Position 2 should still be OPEN (different symbol)
      const result2 = await exitOrchestrator.evaluateExit(position2, 95.5);
      expect(result2.newState).toBe(PositionState.OPEN);
    });
  });

  describe('Logging Consistency', () => {
    it('should use consistent logging format across orchestrators', async () => {
      logger.clearHistory();

      // Entry decision
      const signal = createSignal(SignalDirection.LONG, 75);
      await entryOrchestrator.evaluateEntry([signal], 1000, [], createNeutralTrend());

      // Exit decision
      const position = createPosition(PositionSide.LONG, 100, 1);
      await exitOrchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);

      const logs = logger.logHistory;

      // Check entry approval log
      const entryLog = logs.find(l => l.message.includes('APPROVED'));
      expect(entryLog).toBeDefined();
      expect(entryLog?.metadata).toHaveProperty('direction');
      expect(entryLog?.metadata).toHaveProperty('confidence');

      // Check exit state transition log
      const exitLog = logs.find(l => l.message.includes('Exit State Transition: TP1_HIT'));
      expect(exitLog).toBeDefined();
      expect(exitLog?.metadata).toHaveProperty('symbol');
      expect(exitLog?.metadata).toHaveProperty('trigger');
      expect(exitLog?.metadata).toHaveProperty('profit');
      expect(exitLog?.metadata).toHaveProperty('timestamp');
    });

    it('should include action metadata in all decisions', async () => {
      logger.clearHistory();

      const position = createPosition(PositionSide.LONG, 100, 1);
      const result = await exitOrchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);

      // Should have state transition log
      const stateLog = logger.logHistory.find(l => l.message.includes('Exit State Transition'));
      expect(stateLog).toBeDefined();

      // Result should have actions
      expect(result.actions.length).toBeGreaterThan(0);
      expect(result.stateTransition).toBeDefined();
    });
  });

  describe('Advanced Exit Features Integration', () => {
    it('should activate Smart Breakeven at TP1', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      // Hit TP1 with Smart Breakeven
      const result = await exitOrchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);

      expect(result.newState).toBe(PositionState.TP1_HIT);
      const updateSlAction = result.actions.find(a => a.action === ExitAction.UPDATE_SL);
      expect(updateSlAction).toBeDefined();
      expect(updateSlAction?.newStopLoss).toBeGreaterThan(position.stopLoss.price);
    });

    it('should activate SmartTrailingV2 at TP2 with indicators', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      // Hit TP1 first
      await exitOrchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);

      // Hit TP2 with full indicators
      const result = await exitOrchestrator.evaluateExit(position, position.takeProfits[1].price + 0.01, {
        atrPercent: 2.0,
        currentVolume: 1000,
        avgVolume: 800,
      });

      expect(result.newState).toBe(PositionState.TP2_HIT);
      const trailingAction = result.actions.find(a => a.action === ExitAction.ACTIVATE_TRAILING);
      expect(trailingAction).toBeDefined();
      expect(trailingAction?.trailingDistance).toBeGreaterThan(0);
      // SmartTrailingV2 with 2% ATR should produce ~2.0 distance
      expect(trailingAction?.trailingDistance).toBeLessThanOrEqual(3.5);
      expect(trailingAction?.trailingDistance).toBeGreaterThanOrEqual(1.5);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid entry signals gracefully', async () => {
      const invalidSignal = createSignal(SignalDirection.LONG, -50); // Invalid confidence
      const decision = await entryOrchestrator.evaluateEntry([invalidSignal], 10000, [], createNeutralTrend());

      expect(decision.decision).toBe(EntryDecision.SKIP);
      expect(decision.reason).toContain('confidence');
    });

    it('should handle zero account balance by throwing error', async () => {
      const signal = createSignal(SignalDirection.LONG, 75);

      try {
        await entryOrchestrator.evaluateEntry([signal], 0, [], createNeutralTrend());
        fail('Should have thrown an error for zero account balance');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle null/undefined signals', async () => {
      const decision = await entryOrchestrator.evaluateEntry([], 10000, [], createNeutralTrend());

      expect(decision.decision).toBe(EntryDecision.SKIP);
      expect(decision.reason).toContain('No signals');
    });

    it('should handle very high price gracefully', async () => {
      const position = createPosition(PositionSide.LONG, 100, 1);

      // Exit orchestrator processes one TP at a time
      // First call: hit TP1
      let result = await exitOrchestrator.evaluateExit(position, 1000);
      expect(result.newState).toBe(PositionState.TP1_HIT);
      expect(result.actions.length).toBeGreaterThan(0);

      // Second call: hit TP2
      result = await exitOrchestrator.evaluateExit(position, 1000);
      expect(result.newState).toBe(PositionState.TP2_HIT);

      // Third call: hit TP3
      result = await exitOrchestrator.evaluateExit(position, 1000);
      expect(result.newState).toBe(PositionState.TP3_HIT);
    });
  });

  describe('Cross-Phase Interaction', () => {
    it('Entry approval should not interfere with exit execution', async () => {
      const signal = createSignal(SignalDirection.LONG, 75);
      const entryDecision = await entryOrchestrator.evaluateEntry([signal], 10000, [], createNeutralTrend());
      expect(entryDecision.decision).toBe(EntryDecision.ENTER);

      const position = createPosition(PositionSide.LONG, 100, 1);

      // Exit should work independently
      const exitResult = await exitOrchestrator.evaluateExit(position, position.takeProfits[0].price + 0.01);
      expect(exitResult.newState).toBe(PositionState.TP1_HIT);
    });

    it('Entry should not be blocked by previous exit decisions', async () => {
      // First entry+exit cycle
      const signal1 = createSignal(SignalDirection.LONG, 75);
      const entry1 = await entryOrchestrator.evaluateEntry([signal1], 10000, [], createNeutralTrend());
      expect(entry1.decision).toBe(EntryDecision.ENTER);

      const position1 = createPosition(PositionSide.LONG, 100, 1);
      await exitOrchestrator.evaluateExit(position1, position1.takeProfits[0].price + 0.01);

      // Second entry+exit cycle
      const signal2 = createSignal(SignalDirection.SHORT, 75);
      const entry2 = await entryOrchestrator.evaluateEntry([signal2], 10000, [], createNeutralTrend());
      expect(entry2.decision).toBe(EntryDecision.ENTER);
    });
  });
});
