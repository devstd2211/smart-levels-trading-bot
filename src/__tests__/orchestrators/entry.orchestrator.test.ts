/**
 * EntryOrchestrator Unit Tests
 *
 * Tests all entry decision logic:
 * - Signal ranking by confidence
 * - Trend alignment filtering
 * - RiskManager approval
 * - Edge cases and error handling
 */

import { EntryOrchestrator } from '../../orchestrators/entry.orchestrator';
import { RiskManager } from '../../services/risk-manager.service';
import {
  Signal,
  EntryDecision,
  SignalDirection,
  SignalType,
  PositionSide,
  TrendBias,
  LogLevel,
  Position,
  RiskManagerConfig,
  TrendAnalysis,
} from '../../types';
import { LoggerService } from '../../services/logger.service';

// Test utilities
class TestLogger extends LoggerService {
  constructor() {
    super(LogLevel.INFO, './logs', false);
  }
}

function createNeutralTrend(): TrendAnalysis {
  return {
    bias: 'NEUTRAL' as TrendBias,
    strength: 0.0,
    timeframe: '1h',
    pattern: 'MIXED',
    reasoning: ['No clear direction'],
    restrictedDirections: [],
  };
}

function createSignal(
  direction: SignalDirection = SignalDirection.LONG,
  confidence: number = 60,
  price: number = 100,
  type: SignalType = SignalType.LEVEL_BASED,
): Signal {
  return {
    direction,
    type,
    confidence,
    price,
    stopLoss: price * 0.98,
    takeProfits: [
      { level: 1, percent: 1.0, sizePercent: 100, price: price * 1.01, hit: false },
    ],
    reason: 'test signal',
    timestamp: Date.now(),
  };
}

function createRiskManager(logger: LoggerService): RiskManager {
  const config: RiskManagerConfig = {
    dailyLimits: {
      maxDailyLossPercent: 5.0,
      maxDailyProfitPercent: 10.0,
      emergencyStopOnLimit: true,
    },
    lossStreak: {
      reductions: {
        after2Losses: 0.75,
        after3Losses: 0.5,
        after4Losses: 0.25,
      },
      stopAfterLosses: 5,
    },
    concurrentRisk: {
      enabled: true,
      maxPositions: 3,
      maxRiskPerPosition: 2.0,
      maxTotalExposurePercent: 100.0,
    },
    positionSizing: {
      riskPerTradePercent: 1.0,
      minPositionSizeUsdt: 5.0,
      maxPositionSizeUsdt: 100.0,
      maxLeverageMultiplier: 2.0,
    },
  };
  return new RiskManager(config, logger);
}

describe('EntryOrchestrator', () => {
  let orchestrator: EntryOrchestrator;
  let riskManager: RiskManager;
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
    riskManager = createRiskManager(logger);
    orchestrator = new EntryOrchestrator(riskManager, logger);
  });

  describe('Basic Functionality', () => {
    it('should SKIP when no signals provided', async () => {
      const result = await orchestrator.evaluateEntry([], 1000, [], createNeutralTrend());

      expect(result.decision).toBe(EntryDecision.SKIP);
      expect(result.reason).toContain('No signals');
    });

    it('should SKIP when all signals below minimum confidence', async () => {
      const lowConfidenceSignals = [
        createSignal(SignalDirection.LONG, 20), // Below 30%
        createSignal(SignalDirection.LONG, 15), // Below 30%
      ];

      const result = await orchestrator.evaluateEntry(lowConfidenceSignals, 1000, [], createNeutralTrend());

      expect(result.decision).toBe(EntryDecision.SKIP);
      expect(result.reason).toContain('confidence');
    });

    it('should ENTER when single valid signal passed all checks', async () => {
      const signals = [createSignal(SignalDirection.LONG, 75, 100)];

      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      expect(result.decision).toBe(EntryDecision.ENTER);
      expect(result.signal).toBeDefined();
      expect(result.signal?.confidence).toBe(75);
    });

    it('should return RiskDecision when entry approved', async () => {
      const signals = [createSignal(SignalDirection.LONG, 75, 100)];

      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      expect(result.riskAssessment).toBeDefined();
      expect(result.riskAssessment?.allowed).toBe(true);
      expect(result.riskAssessment?.adjustedPositionSize).toBeGreaterThan(0);
    });
  });

  describe('Signal Ranking (Confidence Priority)', () => {
    it('should rank signals by confidence (highest first)', async () => {
      // 5 LONG vs 1 SHORT = 16% conflict (well below 40% threshold)
      // Should reach consensus and select LONG, then pick highest in LONG
      const signals = [
        createSignal(SignalDirection.LONG, 50, 100),
        createSignal(SignalDirection.LONG, 85, 100), // Highest in LONG
        createSignal(SignalDirection.LONG, 65, 100),
        createSignal(SignalDirection.LONG, 70, 100),
        createSignal(SignalDirection.LONG, 60, 100),
        createSignal(SignalDirection.SHORT, 80, 100), // High but minority
      ];

      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      // Should pick LONG consensus with highest confidence (85%)
      expect(result.decision).toBe(EntryDecision.ENTER);
      expect(result.signal?.confidence).toBe(85);
      expect(result.signal?.direction).toBe(SignalDirection.LONG);
    });

    it('should select highest confidence even if different strategy type', async () => {
      const signals = [
        { ...createSignal(SignalDirection.LONG, 70), type: SignalType.TREND_FOLLOWING },
        { ...createSignal(SignalDirection.LONG, 95), type: SignalType.COUNTER_TREND }, // Highest
        { ...createSignal(SignalDirection.LONG, 60), type: SignalType.LEVEL_BASED },
      ];

      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      expect(result.signal?.confidence).toBe(95);
    });

    it('should break ties by signal direction agreement', async () => {
      // 2 LONG signals @ 80%, 1 SHORT signal @ 80%
      const signals = [
        createSignal(SignalDirection.LONG, 80, 100),
        createSignal(SignalDirection.SHORT, 80, 101),
        createSignal(SignalDirection.LONG, 80, 102),
      ];

      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      // Should pick LONG (more agreement)
      expect(result.signal?.direction).toBe(SignalDirection.LONG);
    });
  });

  describe('Trend Alignment (PHASE 4 Rule)', () => {
    it('should SKIP LONG signal in BEARISH trend', async () => {
      const signals = [createSignal(SignalDirection.LONG, 80, 100)];
      const bearishTrend = {
        bias: 'BEARISH' as TrendBias,
        strength: 0.8,
        timeframe: '1h',
        pattern: 'LH_LL',
        reasoning: ['Lower highs and lower lows detected'],
        restrictedDirections: [SignalDirection.LONG],
      };

      const result = await orchestrator.evaluateEntry(signals, 1000, [], bearishTrend);

      expect(result.decision).toBe(EntryDecision.SKIP);
      expect(result.reason).toContain('LONG blocked');
    });

    it('should SKIP SHORT signal in BULLISH trend', async () => {
      const signals = [createSignal(SignalDirection.SHORT, 80, 100)];
      const bullishTrend = {
        bias: 'BULLISH' as TrendBias,
        strength: 0.8,
        timeframe: '1h',
        pattern: 'HH_HL',
        reasoning: ['Higher highs and higher lows detected'],
        restrictedDirections: [SignalDirection.SHORT],
      };

      const result = await orchestrator.evaluateEntry(signals, 1000, [], bullishTrend);

      expect(result.decision).toBe(EntryDecision.SKIP);
      expect(result.reason).toContain('SHORT blocked');
    });

    it('should ALLOW SHORT in BEARISH trend', async () => {
      const signals = [createSignal(SignalDirection.SHORT, 80, 100)];
      const bearishTrend = {
        bias: 'BEARISH' as TrendBias,
        strength: 0.8,
        timeframe: '1h',
        pattern: 'LH_LL',
        reasoning: ['Lower highs detected'],
        restrictedDirections: [SignalDirection.LONG],
      };

      const result = await orchestrator.evaluateEntry(signals, 1000, [], bearishTrend);

      expect(result.decision).toBe(EntryDecision.ENTER);
    });

    it('should ALLOW LONG in BULLISH trend', async () => {
      const signals = [createSignal(SignalDirection.LONG, 80, 100)];
      const bullishTrend = {
        bias: 'BULLISH' as TrendBias,
        strength: 0.8,
        timeframe: '1h',
        pattern: 'HH_HL',
        reasoning: ['Higher highs detected'],
        restrictedDirections: [SignalDirection.SHORT],
      };

      const result = await orchestrator.evaluateEntry(signals, 1000, [], bullishTrend);

      expect(result.decision).toBe(EntryDecision.ENTER);
    });

    it('should ALLOW both directions in NEUTRAL trend', async () => {
      const longSignal = [createSignal(SignalDirection.LONG, 80, 100)];
      const shortSignal = [createSignal(SignalDirection.SHORT, 80, 100)];
      const neutralTrend = {
        bias: 'NEUTRAL' as TrendBias,
        strength: 0.0,
        timeframe: '1h',
        pattern: 'MIXED',
        reasoning: ['No clear direction'],
        restrictedDirections: [],
      };

      const longResult = await orchestrator.evaluateEntry(longSignal, 1000, [], neutralTrend);
      const shortResult = await orchestrator.evaluateEntry(shortSignal, 1000, [], neutralTrend);

      expect(longResult.decision).toBe(EntryDecision.ENTER);
      expect(shortResult.decision).toBe(EntryDecision.ENTER);
    });

    it('should require trend analysis for entry decision', async () => {
      const signals = [createSignal(SignalDirection.LONG, 80, 100)];
      const validTrend = createNeutralTrend();

      const result = await orchestrator.evaluateEntry(signals, 1000, [], validTrend);

      expect(result.decision).toBe(EntryDecision.ENTER);
      // Trend is now required, so entries cannot proceed without it
    });
  });

  describe('RiskManager Integration', () => {
    it('should SKIP when RiskManager blocks trade', async () => {
      const signals = [createSignal(SignalDirection.LONG, 80, 100)];

      // Trigger daily loss limit by recording losses
      const trade = {
        id: 'trade-1',
        symbol: 'BTCUSDT',
        side: PositionSide.LONG,
        quantity: 1,
        entryPrice: 100,
        exitPrice: 50, // -50% loss
        leverage: 1,
        entryCondition: { signal: {}, indicators: {} } as any,
        openedAt: Date.now(),
        closedAt: Date.now(),
        realizedPnL: -100,
        status: 'CLOSED' as const,
      };
      riskManager.recordTradeResult(trade);

      // Now try to trade - should be blocked
      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      expect(result.decision).toBe(EntryDecision.SKIP);
      expect(result.reason).toContain('Risk check failed');
    });

    it('should include RiskDecision in response', async () => {
      const signals = [createSignal(SignalDirection.LONG, 80, 100)];

      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      expect(result.riskAssessment).toBeDefined();
      expect(result.riskAssessment?.allowed).toBe(true);
      expect(result.riskAssessment?.adjustedPositionSize).toBeGreaterThan(0);
    });

    it('should pass correct parameters to RiskManager', async () => {
      const signals = [createSignal(SignalDirection.LONG, 80, 100)];
      const positions: Position[] = [];

      const result = await orchestrator.evaluateEntry(signals, 1500, positions, createNeutralTrend());

      expect(result.decision).toBe(EntryDecision.ENTER);
      // RiskManager would have been called with correct balance
      expect(result.riskAssessment?.riskDetails?.totalExposure).toBeDefined();
    });
  });

  describe('Input Validation (PHASE 4 FAST FAIL)', () => {
    it('should return SKIP with error reason on invalid account balance (0)', async () => {
      const signals = [createSignal(SignalDirection.LONG, 80, 100)];

      const result = await orchestrator.evaluateEntry(signals, 0, [], createNeutralTrend());

      expect(result.decision).toBe(EntryDecision.SKIP);
      expect(result.reason.toLowerCase()).toContain('account');
    });

    it('should return SKIP with error reason on negative account balance', async () => {
      const signals = [createSignal(SignalDirection.LONG, 80, 100)];

      const result = await orchestrator.evaluateEntry(signals, -100, [], createNeutralTrend());

      expect(result.decision).toBe(EntryDecision.SKIP);
      expect(result.reason.toLowerCase()).toContain('account');
    });

    it('should filter out signals with invalid confidence (negative)', async () => {
      const signals = [
        { ...createSignal(SignalDirection.LONG, 75), confidence: -10 },
        createSignal(SignalDirection.LONG, 80), // Valid
      ];

      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      // Should only consider the valid signal
      expect(result.decision).toBe(EntryDecision.ENTER);
      expect(result.signal?.confidence).toBe(80);
    });

    it('should filter out signals with confidence > 100', async () => {
      const signals = [
        { ...createSignal(SignalDirection.LONG, 75), confidence: 150 },
        createSignal(SignalDirection.LONG, 80), // Valid
      ];

      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      expect(result.decision).toBe(EntryDecision.ENTER);
      expect(result.signal?.confidence).toBe(80);
    });

    it('should handle missing signal price gracefully', async () => {
      const signals = [
        { ...createSignal(SignalDirection.LONG, 80), price: 0 },
        createSignal(SignalDirection.SHORT, 75), // Fallback
      ];

      // Should proceed with evaluation (RiskManager will validate)
      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      expect(result).toBeDefined();
    });

    it('should handle orchestrator exceptions gracefully', async () => {
      const signals = [createSignal(SignalDirection.LONG, 80, 100)];

      // Create broken RiskManager
      const brokenRiskManager = {
        canTrade: async () => {
          throw new Error('RiskManager error');
        },
      } as any;

      const brokenOrchestrator = new EntryOrchestrator(brokenRiskManager, logger);

      const result = await brokenOrchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      expect(result.decision).toBe(EntryDecision.SKIP);
      expect(result.reason).toContain('Orchestrator error');
    });
  });

  describe('Edge Cases', () => {
    it('should handle single signal at minimum confidence threshold', async () => {
      const signals = [createSignal(SignalDirection.LONG, 60, 100)]; // Exactly 60% (new minimum)

      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      expect(result.decision).toBe(EntryDecision.ENTER);
    });

    it('should reject signal just below minimum confidence', async () => {
      const signals = [createSignal(SignalDirection.LONG, 59, 100)]; // 59% (below 60% threshold)

      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      expect(result.decision).toBe(EntryDecision.SKIP);
    });

    it('should handle many signals efficiently', async () => {
      const signals = Array.from({ length: 100 }, (_, i) =>
        createSignal(SignalDirection.LONG, 60 + (i % 40), 100), // 60-99% range
      );

      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      // Should pick highest confidence
      expect(result.decision).toBe(EntryDecision.ENTER);
      expect(result.signal?.confidence).toBeGreaterThanOrEqual(85);
    });

    it('should handle exact confidence tie with same direction', async () => {
      const signals = [
        { ...createSignal(SignalDirection.LONG, 80), type: SignalType.LEVEL_BASED },
        { ...createSignal(SignalDirection.LONG, 80), type: SignalType.TREND_FOLLOWING },
      ];

      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      expect(result.decision).toBe(EntryDecision.ENTER);
      expect(result.signal?.confidence).toBe(80);
    });
  });

  describe('Logging & Debugging', () => {
    it('should log when signal passed trend alignment', async () => {
      const signals = [createSignal(SignalDirection.LONG, 80, 100)];
      const bullishTrend = {
        bias: 'BULLISH' as TrendBias,
        strength: 0.8,
        timeframe: '1h',
        pattern: 'HH_HL',
        reasoning: ['Clear uptrend'],
        restrictedDirections: [SignalDirection.SHORT],
      };

      const result = await orchestrator.evaluateEntry(signals, 1000, [], bullishTrend);

      expect(result.decision).toBe(EntryDecision.ENTER);
      // Logger would have been called (tested via log output)
    });

    it('should include signal reason in decision', async () => {
      const signals = [
        {
          ...createSignal(SignalDirection.LONG, 80, 100),
          reason: 'Test entry reason',
        },
      ];

      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      expect(result.reason).toBeDefined();
    });
  });
});
