/**
 * Entry Decisions - Unit Tests (Phase 0.3)
 *
 * Tests for pure decision function evaluateEntry()
 * No mocks needed - pure function takes data, returns decision
 */

import { evaluateEntry, EntryDecisionContext } from '../../decision-engine/entry-decisions';
import { Signal, Position, TrendAnalysis, FlatMarketResult } from '../../types';
import { EntryDecision, SignalDirection, PositionSide, TrendBias } from '../../types/enums';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create a test signal with minimal required fields
 */
function createTestSignal(overrides?: Partial<Signal>): Signal {
  return {
    direction: SignalDirection.LONG,
    type: 'TREND_FOLLOWING' as any,
    confidence: 75,
    price: 100,
    stopLoss: 95,
    takeProfits: [
      { level: 1, percent: 2, sizePercent: 50, price: 102, hit: false },
      { level: 2, percent: 4, sizePercent: 30, price: 104, hit: false },
      { level: 3, percent: 6, sizePercent: 20, price: 106, hit: false },
    ],
    reason: 'Test signal',
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Create test trend analysis
 */
function createTestTrend(overrides?: Partial<TrendAnalysis>): TrendAnalysis {
  return {
    bias: TrendBias.BULLISH,
    strength: 0.8,
    timeframe: '1h',
    reasoning: ['Test trend'],
    restrictedDirections: [],
    ...overrides,
  };
}

/**
 * Create test flat market analysis
 */
function createTestFlatMarket(overrides?: Partial<FlatMarketResult>): FlatMarketResult {
  return {
    isFlat: false,
    confidence: 30,
    factors: {
      emaDistance: 5,
      atrVolatility: 5,
      priceRange: 5,
      zigzagPattern: 5,
      emaSlope: 5,
      volumeDistribution: 0,
    },
    explanation: 'Test flat market',
    ...overrides,
  };
}

/**
 * Create test entry context
 */
function createTestContext(overrides?: Partial<EntryDecisionContext>): EntryDecisionContext {
  return {
    signals: [createTestSignal()],
    accountBalance: 10000,
    openPositions: [],
    globalTrendBias: createTestTrend(),
    minConfidenceThreshold: 60,
    signalConflictThreshold: 0.4,
    flatMarketConfidenceThreshold: 70,
    ...overrides,
  };
}

// ============================================================================
// UNIT TESTS
// ============================================================================

describe('evaluateEntry', () => {
  // ==========================================================================
  // INPUT VALIDATION TESTS
  // ==========================================================================

  describe('Input Validation', () => {
    it('should SKIP when no signals provided', () => {
      const context = createTestContext({ signals: [] });
      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.SKIP);
      expect(result.reason).toContain('No signals');
    });

    it('should SKIP when account balance is zero', () => {
      const context = createTestContext({ accountBalance: 0 });
      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.SKIP);
      expect(result.reason).toContain('Invalid account balance');
    });

    it('should SKIP when account balance is negative', () => {
      const context = createTestContext({ accountBalance: -100 });
      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.SKIP);
      expect(result.reason).toContain('Invalid account balance');
    });
  });

  // ==========================================================================
  // CONFIDENCE FILTERING TESTS
  // ==========================================================================

  describe('Confidence Filtering', () => {
    it('should SKIP when all signals below minimum confidence', () => {
      const lowConfidenceSignals = [
        createTestSignal({ confidence: 50 }),
        createTestSignal({ confidence: 45 }),
      ];
      const context = createTestContext({
        signals: lowConfidenceSignals,
        minConfidenceThreshold: 60,
      });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.SKIP);
      expect(result.reason).toContain('confidence <');
    });

    it('should accept signal at exact threshold', () => {
      const signal = createTestSignal({ confidence: 60 });
      const context = createTestContext({
        signals: [signal],
        minConfidenceThreshold: 60,
      });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.ENTER);
      expect(result.selectedSignal).toBe(signal);
    });

    it('should filter invalid confidence values', () => {
      const invalidSignals = [
        createTestSignal({ confidence: -10 }),
        createTestSignal({ confidence: 150 }),
        createTestSignal({ confidence: 75 }),
      ];
      const context = createTestContext({
        signals: invalidSignals,
        minConfidenceThreshold: 60,
      });

      const result = evaluateEntry(context);

      // Should still ENTER because third signal is valid
      expect(result.decision).toBe(EntryDecision.ENTER);
      expect(result.selectedSignal?.confidence).toBe(75);
    });
  });

  // ==========================================================================
  // SIGNAL CONFLICT ANALYSIS TESTS
  // ==========================================================================

  describe('Signal Conflict Analysis', () => {
    it('should ENTER with clear LONG consensus', () => {
      const signals = [
        createTestSignal({ direction: SignalDirection.LONG, confidence: 80 }),
        createTestSignal({ direction: SignalDirection.LONG, confidence: 75 }),
        createTestSignal({ direction: SignalDirection.LONG, confidence: 70 }),
      ];
      const context = createTestContext({ signals });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.ENTER);
      expect(result.conflictAnalysis?.direction).toBe('LONG');
      expect(result.conflictAnalysis?.conflictLevel).toBe(0);
    });

    it('should ENTER with clear SHORT consensus', () => {
      const signals = [
        createTestSignal({ direction: SignalDirection.SHORT, confidence: 80 }),
        createTestSignal({ direction: SignalDirection.SHORT, confidence: 75 }),
        createTestSignal({ direction: SignalDirection.SHORT, confidence: 70 }),
      ];
      const context = createTestContext({
        signals,
        globalTrendBias: createTestTrend({ bias: TrendBias.BEARISH }),
      });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.ENTER);
      expect(result.conflictAnalysis?.direction).toBe('SHORT');
    });

    it('should WAIT when signals are equally split (no consensus)', () => {
      const signals = [
        createTestSignal({ direction: SignalDirection.LONG, confidence: 80 }),
        createTestSignal({ direction: SignalDirection.LONG, confidence: 75 }),
        createTestSignal({ direction: SignalDirection.SHORT, confidence: 80 }),
        createTestSignal({ direction: SignalDirection.SHORT, confidence: 75 }),
      ];
      const context = createTestContext({
        signals,
        signalConflictThreshold: 0.51, // Slightly above 50% to trigger equal votes path
      });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.WAIT);
      expect(result.reason).toContain('NO CONSENSUS');
    });

    it('should ENTER when conflict is below threshold', () => {
      // 5 LONG, 1 SHORT = 16.7% conflict (1/6)
      // Below 0.4 (40%) threshold
      const signals = [
        createTestSignal({ direction: SignalDirection.LONG, confidence: 80 }),
        createTestSignal({ direction: SignalDirection.LONG, confidence: 75 }),
        createTestSignal({ direction: SignalDirection.LONG, confidence: 70 }),
        createTestSignal({ direction: SignalDirection.LONG, confidence: 70 }),
        createTestSignal({ direction: SignalDirection.LONG, confidence: 70 }),
        createTestSignal({ direction: SignalDirection.SHORT, confidence: 65 }),
      ];
      const context = createTestContext({
        signals,
        signalConflictThreshold: 0.4,
      });

      const result = evaluateEntry(context);

      // Should ENTER because 16.7% < 40% (no high conflict)
      expect(result.decision).toBe(EntryDecision.ENTER);
    });

    it('should WAIT when conflict equals threshold (40%)', () => {
      // 3 LONG, 2 SHORT = 40% conflict (2/5)
      const signals = [
        createTestSignal({ direction: SignalDirection.LONG, confidence: 80 }),
        createTestSignal({ direction: SignalDirection.LONG, confidence: 75 }),
        createTestSignal({ direction: SignalDirection.LONG, confidence: 70 }),
        createTestSignal({ direction: SignalDirection.SHORT, confidence: 75 }),
        createTestSignal({ direction: SignalDirection.SHORT, confidence: 70 }),
      ];
      const context = createTestContext({
        signals,
        signalConflictThreshold: 0.4, // Exactly 40% conflict threshold
      });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.WAIT);
      expect(result.reason).toContain('Signal conflict too high');
    });

    it('should ignore HOLD signals in conflict calculation', () => {
      // 2 LONG, 2 SHORT, 1 HOLD
      // HOLD signals don't participate in direction voting
      // So: only 2 LONG, 2 SHORT directional votes = WAIT (no consensus)
      const signals = [
        createTestSignal({ direction: SignalDirection.LONG, confidence: 80 }),
        createTestSignal({ direction: SignalDirection.LONG, confidence: 75 }),
        createTestSignal({ direction: SignalDirection.SHORT, confidence: 75 }),
        createTestSignal({ direction: SignalDirection.SHORT, confidence: 70 }),
        createTestSignal({ direction: SignalDirection.HOLD, confidence: 60 }),
      ];
      const context = createTestContext({
        signals,
        signalConflictThreshold: 0.51, // Slightly above 50% to trigger equal votes path
      });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.WAIT);
      expect(result.reason).toContain('Equal votes');
    });

    it('should select top signal by confidence when multiple directions', () => {
      const signals = [
        createTestSignal({ direction: SignalDirection.LONG, confidence: 85 }),
        createTestSignal({ direction: SignalDirection.LONG, confidence: 70 }),
        createTestSignal({ direction: SignalDirection.SHORT, confidence: 65 }),
      ];
      const context = createTestContext({ signals });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.ENTER);
      expect(result.selectedSignal?.confidence).toBe(85);
    });
  });

  // ==========================================================================
  // FLAT MARKET DETECTION TESTS
  // ==========================================================================

  describe('Flat Market Detection', () => {
    it('should SKIP when flat market detected with high confidence', () => {
      const flatMarket = createTestFlatMarket({
        isFlat: true,
        confidence: 75,
      });
      const context = createTestContext({
        flatMarketAnalysis: flatMarket,
        flatMarketConfidenceThreshold: 70,
      });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.SKIP);
      expect(result.reason).toContain('Flat market detected');
    });

    it('should SKIP when flat market confidence equals threshold', () => {
      const flatMarket = createTestFlatMarket({
        isFlat: true,
        confidence: 70,
      });
      const context = createTestContext({
        flatMarketAnalysis: flatMarket,
        flatMarketConfidenceThreshold: 70,
      });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.SKIP);
      expect(result.reason).toContain('Flat market detected');
    });

    it('should ENTER when flat market confidence below threshold', () => {
      const flatMarket = createTestFlatMarket({
        isFlat: true,
        confidence: 69,
      });
      const context = createTestContext({
        flatMarketAnalysis: flatMarket,
        flatMarketConfidenceThreshold: 70,
      });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.ENTER);
    });

    it('should ENTER when not in flat market', () => {
      const flatMarket = createTestFlatMarket({ isFlat: false });
      const context = createTestContext({ flatMarketAnalysis: flatMarket });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.ENTER);
    });

    it('should ignore flat market analysis if not provided', () => {
      const context = createTestContext({ flatMarketAnalysis: undefined });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.ENTER);
    });
  });

  // ==========================================================================
  // TREND ALIGNMENT TESTS
  // ==========================================================================

  describe('Trend Alignment', () => {
    it('should ENTER LONG signal in BULLISH trend', () => {
      const signal = createTestSignal({ direction: SignalDirection.LONG });
      const trend = createTestTrend({ bias: TrendBias.BULLISH });
      const context = createTestContext({ signals: [signal], globalTrendBias: trend });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.ENTER);
    });

    it('should SKIP LONG signal in BEARISH trend', () => {
      const signal = createTestSignal({ direction: SignalDirection.LONG });
      const trend = createTestTrend({ bias: TrendBias.BEARISH });
      const context = createTestContext({ signals: [signal], globalTrendBias: trend });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.SKIP);
      expect(result.reason).toContain('Trend misalignment');
      expect(result.reason).toContain('LONG blocked');
    });

    it('should ENTER SHORT signal in BEARISH trend', () => {
      const signal = createTestSignal({ direction: SignalDirection.SHORT });
      const trend = createTestTrend({ bias: TrendBias.BEARISH });
      const context = createTestContext({ signals: [signal], globalTrendBias: trend });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.ENTER);
    });

    it('should SKIP SHORT signal in BULLISH trend', () => {
      const signal = createTestSignal({ direction: SignalDirection.SHORT });
      const trend = createTestTrend({ bias: TrendBias.BULLISH });
      const context = createTestContext({ signals: [signal], globalTrendBias: trend });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.SKIP);
      expect(result.reason).toContain('Trend misalignment');
      expect(result.reason).toContain('SHORT blocked');
    });

    it('should ENTER both LONG and SHORT in NEUTRAL trend', () => {
      const longSignal = createTestSignal({ direction: SignalDirection.LONG });
      const trend = createTestTrend({ bias: TrendBias.NEUTRAL });
      const context = createTestContext({ signals: [longSignal], globalTrendBias: trend });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.ENTER);
    });

    it('should also accept SHORT in NEUTRAL trend', () => {
      const shortSignal = createTestSignal({ direction: SignalDirection.SHORT });
      const trend = createTestTrend({ bias: TrendBias.NEUTRAL });
      const context = createTestContext({ signals: [shortSignal], globalTrendBias: trend });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.ENTER);
    });
  });

  // ==========================================================================
  // INTEGRATION TESTS
  // ==========================================================================

  describe('Integration Tests', () => {
    it('should handle complete entry flow with all checks', () => {
      // Setup: Multiple signals, bullish trend, not flat market
      const signals = [
        createTestSignal({ direction: SignalDirection.LONG, confidence: 85 }),
        createTestSignal({ direction: SignalDirection.LONG, confidence: 75 }),
        createTestSignal({ direction: SignalDirection.SHORT, confidence: 60 }),
      ];
      const trend = createTestTrend({ bias: TrendBias.BULLISH, strength: 0.8 });
      const flatMarket = createTestFlatMarket({ isFlat: false, confidence: 30 });

      const context = createTestContext({
        signals,
        globalTrendBias: trend,
        flatMarketAnalysis: flatMarket,
        accountBalance: 5000,
      });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.ENTER);
      expect(result.selectedSignal?.confidence).toBe(85);
      expect(result.conflictAnalysis?.direction).toBe('LONG');
      expect(result.conflictAnalysis?.conflictLevel).toBeLessThan(0.4);
    });

    it('should provide detailed conflict analysis in result', () => {
      const signals = [
        createTestSignal({ direction: SignalDirection.LONG, confidence: 80 }),
        createTestSignal({ direction: SignalDirection.LONG, confidence: 75 }),
      ];
      const context = createTestContext({ signals });

      const result = evaluateEntry(context);

      expect(result.conflictAnalysis).toBeDefined();
      expect(result.conflictAnalysis?.conflictLevel).toBeDefined();
      expect(result.conflictAnalysis?.consensusStrength).toBeDefined();
      expect(result.conflictAnalysis?.direction).toBe('LONG');
    });

    it('should provide reason in all decision paths', () => {
      const testCases = [
        createTestContext({ signals: [] }),
        createTestContext({ accountBalance: 0 }),
        createTestContext({
          signals: [createTestSignal({ confidence: 30 })],
          minConfidenceThreshold: 60,
        }),
        createTestContext({
          signals: [createTestSignal({ direction: SignalDirection.LONG })],
          globalTrendBias: createTestTrend({ bias: TrendBias.BEARISH }),
        }),
      ];

      testCases.forEach((context) => {
        const result = evaluateEntry(context);
        expect(result.reason).toBeTruthy();
        expect(result.reason.length).toBeGreaterThan(0);
      });
    });
  });

  // ==========================================================================
  // EDGE CASE TESTS
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle single signal correctly', () => {
      const signal = createTestSignal({ confidence: 75 });
      const context = createTestContext({ signals: [signal] });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.ENTER);
      expect(result.selectedSignal).toBe(signal);
    });

    it('should select highest confidence signal when multiple same direction', () => {
      const signals = [
        createTestSignal({ direction: SignalDirection.LONG, confidence: 70 }),
        createTestSignal({ direction: SignalDirection.LONG, confidence: 90 }),
        createTestSignal({ direction: SignalDirection.LONG, confidence: 80 }),
      ];
      const context = createTestContext({ signals });

      const result = evaluateEntry(context);

      expect(result.selectedSignal?.confidence).toBe(90);
    });

    it('should be deterministic - same input produces same output', () => {
      const context = createTestContext();
      const result1 = evaluateEntry(context);
      const result2 = evaluateEntry(context);

      expect(result1.decision).toBe(result2.decision);
      expect(result1.reason).toBe(result2.reason);
      expect(result1.selectedSignal).toEqual(result2.selectedSignal);
    });

    it('should not modify input context', () => {
      const context = createTestContext();
      const originalJSON = JSON.stringify(context);

      evaluateEntry(context);

      expect(JSON.stringify(context)).toBe(originalJSON);
    });

    it('should work with very large account balance', () => {
      const context = createTestContext({ accountBalance: 1000000000 });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.ENTER);
    });

    it('should work with many signals', () => {
      const signals = Array.from({ length: 50 }, (_, i) =>
        createTestSignal({
          direction: i % 2 === 0 ? SignalDirection.LONG : SignalDirection.SHORT,
          confidence: 75,
        })
      );
      const context = createTestContext({ signals });

      const result = evaluateEntry(context);

      expect(result.decision).toBe(EntryDecision.WAIT); // 50/50 split = no consensus
    });
  });
});
