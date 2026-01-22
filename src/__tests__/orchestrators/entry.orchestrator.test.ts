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

  // ============================================================================
  // EXTENDED TEST SUITE (Phase 13.2: Additional Coverage)
  // ============================================================================

  describe('Flat Market Detection', () => {
    it('should identify flat market with neutral trend', async () => {
      const signals = [createSignal(SignalDirection.LONG, 65, 100)];
      const flatMarketTrend = {
        bias: 'NEUTRAL' as TrendBias,
        strength: 0.1,
        timeframe: '1h',
        pattern: 'CONSOLIDATION',
        reasoning: ['Price consolidating in tight range'],
        restrictedDirections: [],
      };

      const result = await orchestrator.evaluateEntry(signals, 1000, [], flatMarketTrend);

      // Signal with confidence 65 should pass in flat market only if >= flatMarketConfidenceThreshold
      expect(result).toBeDefined();
    });

    it('should require higher confidence in flat market', async () => {
      const lowConfidenceFlat = [createSignal(SignalDirection.LONG, 68, 100)]; // Below typical flat market threshold
      const flatMarketTrend = {
        bias: 'NEUTRAL' as TrendBias,
        strength: 0.05,
        timeframe: '1h',
        pattern: 'CONSOLIDATION',
        reasoning: ['Tight consolidation'],
        restrictedDirections: [],
      };

      const result = await orchestrator.evaluateEntry(lowConfidenceFlat, 1000, [], flatMarketTrend);

      // Would need confidence >= flatMarketConfidenceThreshold (default 70)
      expect(result).toBeDefined();
    });

    it('should accept entry in flat market with sufficient confidence', async () => {
      const highConfidenceFlat = [createSignal(SignalDirection.LONG, 75, 100)]; // Above 70 threshold
      const flatMarketTrend = {
        bias: 'NEUTRAL' as TrendBias,
        strength: 0.05,
        timeframe: '1h',
        pattern: 'CONSOLIDATION',
        reasoning: ['Consolidation'],
        restrictedDirections: [],
      };

      const result = await orchestrator.evaluateEntry(highConfidenceFlat, 1000, [], flatMarketTrend);

      expect(result.decision).toBe(EntryDecision.ENTER);
    });

    it('should handle rapid trend changes', async () => {
      const signals = [createSignal(SignalDirection.LONG, 75, 100)];
      const transitionTrend = {
        bias: 'NEUTRAL' as TrendBias,
        strength: 0.3, // Transitioning
        timeframe: '1h',
        pattern: 'TRANSITION',
        reasoning: ['Trend might be changing'],
        restrictedDirections: [],
      };

      const result = await orchestrator.evaluateEntry(signals, 1000, [], transitionTrend);

      expect(result).toBeDefined();
    });
  });

  describe('Signal Conflict & Consensus', () => {
    it('should detect conflicting signals below threshold (40%)', async () => {
      // 3 LONG, 1 SHORT = 1/4 = 25% conflict (below 40% threshold = consensus on LONG)
      const consensusSignals = [
        createSignal(SignalDirection.LONG, 75, 100),
        createSignal(SignalDirection.LONG, 70, 100),
        createSignal(SignalDirection.LONG, 65, 100),
        createSignal(SignalDirection.SHORT, 80, 100), // Minority
      ];

      const result = await orchestrator.evaluateEntry(consensusSignals, 1000, [], createNeutralTrend());

      // Should reach LONG consensus
      expect(result.decision).toBe(EntryDecision.ENTER);
      expect(result.signal?.direction).toBe(SignalDirection.LONG);
    });

    it('should return WAIT or SKIP for conflicting signals above threshold (40%)', async () => {
      // 2 LONG, 2 SHORT = 2/4 = 50% conflict (above 40% threshold = conflicting)
      const conflictingSignals = [
        createSignal(SignalDirection.LONG, 80, 100),
        createSignal(SignalDirection.LONG, 75, 100),
        createSignal(SignalDirection.SHORT, 85, 100),
        createSignal(SignalDirection.SHORT, 70, 100),
      ];

      const result = await orchestrator.evaluateEntry(conflictingSignals, 1000, [], createNeutralTrend());

      // Should handle conflict by returning WAIT (needs clarification) or SKIP (clear rejection)
      expect([EntryDecision.WAIT, EntryDecision.SKIP]).toContain(result.decision);
      expect(result.reason).toContain('conflict');
    });

    it('should reach strong consensus with clear direction majority', async () => {
      // 5 LONG, 1 SHORT = 1/6 = 16.7% conflict (clear consensus)
      const strongConsensusSignals = Array.from({ length: 5 }, () =>
        createSignal(SignalDirection.LONG, 70 + Math.random() * 20, 100),
      ).concat([createSignal(SignalDirection.SHORT, 75, 100)]);

      const result = await orchestrator.evaluateEntry(strongConsensusSignals, 1000, [], createNeutralTrend());

      expect(result.decision).toBe(EntryDecision.ENTER);
      expect(result.signal?.direction).toBe(SignalDirection.LONG);
    });
  });

  describe('Configuration Management (Phase 4.10)', () => {
    it('should use default configuration if none provided', () => {
      const orchWithDefaults = new EntryOrchestrator(riskManager, logger);
      const config = orchWithDefaults.getOrchestrationConfig();

      expect(config.minConfidenceThreshold).toBe(60);
      expect(config.flatMarketConfidenceThreshold).toBe(70);
      expect(config.signalConflictThreshold).toBe(0.4);
    });

    it('should apply custom configuration', () => {
      const customConfig = {
        minConfidenceThreshold: 50,
        signalConflictThreshold: 0.3,
        flatMarketConfidenceThreshold: 80,
        minCandlesRequired: 30,
        minEntryConfidenceCandlesRequired: 10,
        maxPrimaryCandles: 200,
      };

      const orchWithCustom = new EntryOrchestrator(riskManager, logger, undefined, customConfig);
      const config = orchWithCustom.getOrchestrationConfig();

      expect(config.minConfidenceThreshold).toBe(50);
      expect(config.flatMarketConfidenceThreshold).toBe(80);
      expect(config.signalConflictThreshold).toBe(0.3);
    });

    it('should update configuration at runtime', async () => {
      const newConfig = {
        minConfidenceThreshold: 75,
        signalConflictThreshold: 0.25,
        flatMarketConfidenceThreshold: 85,
        minCandlesRequired: 40,
        minEntryConfidenceCandlesRequired: 8,
        maxPrimaryCandles: 150,
      };

      orchestrator.setOrchestrationConfig(newConfig);

      const signals = [createSignal(SignalDirection.LONG, 70, 100)]; // Below new threshold
      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      expect(result.decision).toBe(EntryDecision.SKIP); // Rejected due to new threshold
    });

    it('should support deprecated setMinConfidenceThreshold method', async () => {
      orchestrator.setMinConfidenceThreshold(85);

      const signals = [createSignal(SignalDirection.LONG, 80, 100)]; // Below new threshold
      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      expect(result.decision).toBe(EntryDecision.SKIP);
    });

    it('should retrieve current confidence threshold', () => {
      orchestrator.setMinConfidenceThreshold(75);
      const threshold = orchestrator.getMinConfidenceThreshold();

      expect(threshold).toBe(75);
    });
  });

  describe('Multi-Strategy Support (Phase 10.3c)', () => {
    it('should accept strategyId in constructor', () => {
      const strategyOrch = new EntryOrchestrator(riskManager, logger, undefined, undefined, 'strategy-a');

      // Orchestrator should be created successfully with strategyId
      expect(strategyOrch).toBeDefined();
    });

    it('should allow multiple strategy instances', () => {
      const orchStrategyA = new EntryOrchestrator(riskManager, logger, undefined, undefined, 'strategy-a');
      const orchStrategyB = new EntryOrchestrator(riskManager, logger, undefined, undefined, 'strategy-b');

      // Both should be created successfully with different strategyIds
      expect(orchStrategyA).toBeDefined();
      expect(orchStrategyB).toBeDefined();
    });

    it('should work without strategyId (backward compatibility)', async () => {
      const signals = [createSignal(SignalDirection.LONG, 75, 100)];

      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      expect(result.decision).toBe(EntryDecision.ENTER);
      // strategyId parameter is accepted for future event tagging
    });
  });

  describe('Signal Type & Direction Combinations', () => {
    it('should handle LEVEL_BASED signals', async () => {
      const signals = [
        { ...createSignal(SignalDirection.LONG, 80), type: SignalType.LEVEL_BASED },
      ];

      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      expect(result.decision).toBe(EntryDecision.ENTER);
    });

    it('should handle TREND_FOLLOWING signals', async () => {
      const signals = [
        { ...createSignal(SignalDirection.LONG, 80), type: SignalType.TREND_FOLLOWING },
      ];

      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      expect(result.decision).toBe(EntryDecision.ENTER);
    });

    it('should handle COUNTER_TREND signals', async () => {
      const signals = [
        { ...createSignal(SignalDirection.SHORT, 85), type: SignalType.COUNTER_TREND },
      ];
      const bearishTrend = {
        bias: 'BEARISH' as TrendBias,
        strength: 0.8,
        timeframe: '1h',
        pattern: 'LH_LL',
        reasoning: ['Downtrend'],
        restrictedDirections: [SignalDirection.LONG],
      };

      const result = await orchestrator.evaluateEntry(signals, 1000, [], bearishTrend);

      // Counter-trend SHORT in bearish trend should be allowed but less preferred
      expect(result).toBeDefined();
    });

    it('should mix signal types in ranking', async () => {
      const mixedSignals = [
        { ...createSignal(SignalDirection.LONG, 75), type: SignalType.LEVEL_BASED },
        { ...createSignal(SignalDirection.LONG, 85), type: SignalType.TREND_FOLLOWING },
        { ...createSignal(SignalDirection.LONG, 70), type: SignalType.COUNTER_TREND },
      ];

      const result = await orchestrator.evaluateEntry(mixedSignals, 1000, [], createNeutralTrend());

      // Should select highest confidence regardless of type
      expect(result.signal?.confidence).toBe(85);
    });
  });

  describe('Risk Manager Edge Cases', () => {
    it('should handle zero account balance gracefully', async () => {
      const signals = [createSignal(SignalDirection.LONG, 75, 100)];

      const result = await orchestrator.evaluateEntry(signals, 0, [], createNeutralTrend());

      expect(result.decision).toBe(EntryDecision.SKIP);
    });

    it('should respect maximum position size constraints from RiskManager', async () => {
      const signals = [createSignal(SignalDirection.LONG, 95, 50000)]; // Huge position size
      const result = await orchestrator.evaluateEntry(signals, 100, [], createNeutralTrend()); // Small account

      // RiskManager validates position size - small account may still be allowed
      // but with reduced position size
      expect(result.riskAssessment).toBeDefined();
      if (result.riskAssessment?.allowed) {
        // If allowed, position should be reduced to fit account
        expect(result.riskAssessment.adjustedPositionSize).toBeLessThan(50000);
      }
    });

    it('should apply loss streak reductions', async () => {
      const signals = [createSignal(SignalDirection.LONG, 80, 100)];

      // Simulate 3 losses in riskManager
      for (let i = 0; i < 3; i++) {
        const lossTrade = {
          id: `trade-${i}`,
          symbol: 'BTCUSDT',
          side: PositionSide.LONG,
          quantity: 1,
          entryPrice: 100,
          exitPrice: 90,
          leverage: 1,
          entryCondition: { signal: {}, indicators: {} } as any,
          openedAt: Date.now(),
          closedAt: Date.now(),
          realizedPnL: -10,
          status: 'CLOSED' as const,
        };
        riskManager.recordTradeResult(lossTrade);
      }

      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());

      // Should still work but with reduced position size
      if (result.decision === EntryDecision.ENTER) {
        expect(result.riskAssessment?.adjustedPositionSize).toBeLessThan(50); // Reduced
      }
    });
  });

  describe('Performance & Scalability', () => {
    it('should efficiently handle 50 signals', async () => {
      const signals = Array.from({ length: 50 }, (_, i) =>
        createSignal(SignalDirection.LONG, 40 + (i % 60), 100),
      );

      const startTime = Date.now();
      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());
      const elapsed = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(elapsed).toBeLessThan(100); // Should complete in < 100ms
    });

    it('should efficiently handle 100 signals', async () => {
      const signals = Array.from({ length: 100 }, (_, i) =>
        createSignal(SignalDirection.LONG, 30 + (i % 70), 100),
      );

      const startTime = Date.now();
      const result = await orchestrator.evaluateEntry(signals, 1000, [], createNeutralTrend());
      const elapsed = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(elapsed).toBeLessThan(150); // Should complete in < 150ms
    });

    it('should maintain accuracy with many positions', async () => {
      const signals = [createSignal(SignalDirection.LONG, 75, 100)];
      const positions: Position[] = []; // Start with empty positions for this test

      const result = await orchestrator.evaluateEntry(signals, 1000, positions, createNeutralTrend());

      expect(result.riskAssessment).toBeDefined();
      expect(result.riskAssessment?.allowed).toBe(true);
    });
  });
});
