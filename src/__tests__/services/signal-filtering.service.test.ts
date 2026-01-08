/**
 * Signal Filtering Service Tests
 * Tests for signal filtering, validation, and confidence adjustment
 */

import { SignalFilteringService } from '../../services/signal-filtering.service';
import {
  LoggerService,
  LogLevel,
  AnalyzerSignal,
  TrendAnalysis,
  SignalDirection,
} from '../../types';
import { StrategyCoordinator } from '../../services/strategy-coordinator.service';
import { TrendConfirmationService } from '../../services/trend-confirmation.service';

// ============================================================================
// MOCKS
// ============================================================================

const createMockLogger = (): LoggerService => {
  return new LoggerService(LogLevel.ERROR, './logs', false);
};

const createMockStrategyCoordinator = (): jest.Mocked<StrategyCoordinator> => {
  return {
    getMinConfidence: jest.fn().mockReturnValue(65),
  } as any;
};

const createMockTrendConfirmationResult = (overrides: any = {}) => ({
  isAligned: true,
  alignmentScore: 85,
  confirmedCount: 3,
  totalCount: 3,
  details: {},
  confidenceBoost: 5,
  reason: 'Strong alignment with trend',
  ...overrides,
});

const createMockTrendConfirmationService = (): jest.Mocked<TrendConfirmationService> => {
  return {
    confirmTrend: jest.fn().mockResolvedValue(createMockTrendConfirmationResult()),
  } as any;
};

const createMockAnalyzerSignal = (overrides?: Partial<AnalyzerSignal>): AnalyzerSignal => ({
  source: 'TestAnalyzer',
  direction: SignalDirection.LONG,
  confidence: 75,
  weight: 0.25,
  priority: 5,
  ...overrides,
});

const createMockTrendAnalysis = (bias: string = 'BULLISH', restrictedDirections: SignalDirection[] = []): TrendAnalysis => ({
  bias: bias as any,
  strength: 0.8,
  timeframe: '1h',
  restrictedDirections,
  reasoning: ['Test trend'],
});

// ============================================================================
// TESTS
// ============================================================================

describe('SignalFilteringService', () => {
  let service: SignalFilteringService;
  let logger: LoggerService;
  let strategyCoordinator: jest.Mocked<StrategyCoordinator>;
  let trendConfirmationService: jest.Mocked<TrendConfirmationService>;

  beforeEach(() => {
    logger = createMockLogger();
    strategyCoordinator = createMockStrategyCoordinator();
    trendConfirmationService = createMockTrendConfirmationService();

    service = new SignalFilteringService(
      strategyCoordinator,
      trendConfirmationService,
      logger,
      {
        trendConfirmation: {
          criticalMisalignmentScore: 30,
          warningMisalignmentScore: 60,
          filterMode: 'ENABLED',
        },
      },
    );
  });

  // ==========================================================================
  // TEST GROUP 1: Filter Signals by Trend
  // ==========================================================================

  describe('filterSignalsByTrend', () => {
    it('should return all signals when no trend analysis available', () => {
      const signals = [
        createMockAnalyzerSignal({ direction: SignalDirection.LONG }),
        createMockAnalyzerSignal({ direction: SignalDirection.SHORT }),
      ];

      const filtered = service.filterSignalsByTrend(signals, null);

      expect(filtered).toHaveLength(2);
    });

    it('should return all signals when no restricted directions', () => {
      const signals = [
        createMockAnalyzerSignal({ direction: SignalDirection.LONG }),
        createMockAnalyzerSignal({ direction: SignalDirection.SHORT }),
      ];
      const trendAnalysis = createMockTrendAnalysis('BULLISH', []);

      const filtered = service.filterSignalsByTrend(signals, trendAnalysis);

      expect(filtered).toHaveLength(2);
    });

    it('should block LONG signals in BEARISH trend', () => {
      const signals = [
        createMockAnalyzerSignal({ direction: SignalDirection.LONG }),
        createMockAnalyzerSignal({ direction: SignalDirection.SHORT }),
      ];
      const trendAnalysis = createMockTrendAnalysis('BEARISH', [SignalDirection.LONG]);

      const filtered = service.filterSignalsByTrend(signals, trendAnalysis);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].direction).toBe(SignalDirection.SHORT);
    });

    it('should block SHORT signals in BULLISH trend', () => {
      const signals = [
        createMockAnalyzerSignal({ direction: SignalDirection.LONG }),
        createMockAnalyzerSignal({ direction: SignalDirection.SHORT }),
      ];
      const trendAnalysis = createMockTrendAnalysis('BULLISH', [SignalDirection.SHORT]);

      const filtered = service.filterSignalsByTrend(signals, trendAnalysis);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].direction).toBe(SignalDirection.LONG);
    });

    it('should block multiple directions if restricted', () => {
      const signals = [
        createMockAnalyzerSignal({ direction: SignalDirection.LONG }),
        createMockAnalyzerSignal({ direction: SignalDirection.SHORT }),
      ];
      const trendAnalysis = createMockTrendAnalysis('BULLISH', [SignalDirection.LONG, SignalDirection.SHORT]);

      const filtered = service.filterSignalsByTrend(signals, trendAnalysis);

      expect(filtered).toHaveLength(0);
    });
  });

  // ==========================================================================
  // TEST GROUP 2: Apply Trend Confirmation Filter
  // ==========================================================================

  describe('applyTrendConfirmationFilter', () => {
    it('should return original confidence when no trend confirmation service', async () => {
      const serviceNoTrendConfirm = new SignalFilteringService(
        strategyCoordinator,
        null,
        logger,
        {},
      );

      const result = await serviceNoTrendConfirm.applyTrendConfirmationFilter(
        SignalDirection.LONG,
        75,
      );

      expect(result).toBe(75);
    });

    it('should block signal with critical misalignment (score < 30)', async () => {
      trendConfirmationService.confirmTrend.mockResolvedValue(
        createMockTrendConfirmationResult({ isAligned: false, alignmentScore: 20 }),
      );

      const result = await service.applyTrendConfirmationFilter(SignalDirection.LONG, 75);

      expect(result).toBeNull();
    });

    it('should reduce confidence for warning misalignment (30 <= score < 60)', async () => {
      strategyCoordinator.getMinConfidence.mockReturnValue(40); // Lower threshold for this test
      trendConfirmationService.confirmTrend.mockResolvedValue(
        createMockTrendConfirmationResult({ isAligned: false, alignmentScore: 50 }),
      );

      const result = await service.applyTrendConfirmationFilter(SignalDirection.LONG, 100);

      expect(result).toBe(50); // 100 * (50 / 100)
    });

    it('should block signal after reduction if below minimum confidence', async () => {
      strategyCoordinator.getMinConfidence.mockReturnValue(65);
      trendConfirmationService.confirmTrend.mockResolvedValue(
        createMockTrendConfirmationResult({ isAligned: false, alignmentScore: 50 }),
      );

      const result = await service.applyTrendConfirmationFilter(SignalDirection.LONG, 60);

      expect(result).toBeNull();
    });

    it('should boost confidence for full alignment', async () => {
      trendConfirmationService.confirmTrend.mockResolvedValue(
        createMockTrendConfirmationResult({ isAligned: true, alignmentScore: 90, confidenceBoost: 15 }),
      );

      const result = await service.applyTrendConfirmationFilter(SignalDirection.LONG, 75);

      expect(result).toBe(90); // 75 + 15
    });

    it('should cap boosted confidence at 100', async () => {
      trendConfirmationService.confirmTrend.mockResolvedValue(
        createMockTrendConfirmationResult({ isAligned: true, confidenceBoost: 50 }),
      );

      const result = await service.applyTrendConfirmationFilter(SignalDirection.LONG, 80);

      expect(result).toBe(100);
    });

    it('should return original confidence when aligned but no boost', async () => {
      trendConfirmationService.confirmTrend.mockResolvedValue(
        createMockTrendConfirmationResult({ isAligned: true, confidenceBoost: 0 }),
      );

      const result = await service.applyTrendConfirmationFilter(SignalDirection.LONG, 75);

      expect(result).toBe(75);
    });

    it('should handle error and return original confidence', async () => {
      trendConfirmationService.confirmTrend.mockRejectedValue(new Error('Service error'));

      const result = await service.applyTrendConfirmationFilter(SignalDirection.LONG, 75);

      expect(result).toBe(75);
    });
  });

  // ==========================================================================
  // TEST GROUP 3: Detect Timeframe Conflict
  // ==========================================================================

  describe('detectTimeframeConflict', () => {
    it('should return 1.0 (no conflict) when no trend analysis', () => {
      const multiplier = service.detectTimeframeConflict(null, SignalDirection.LONG);

      expect(multiplier).toBe(1.0);
    });

    it('should return 1.0 (no conflict) when trend is NEUTRAL', () => {
      const trendAnalysis = createMockTrendAnalysis('NEUTRAL', []);

      const multiplier = service.detectTimeframeConflict(trendAnalysis, SignalDirection.LONG);

      expect(multiplier).toBe(1.0);
    });

    it('should return 1.0 for BULLISH trend + LONG signal (no conflict)', () => {
      const trendAnalysis = createMockTrendAnalysis('BULLISH', []);

      const multiplier = service.detectTimeframeConflict(trendAnalysis, SignalDirection.LONG);

      expect(multiplier).toBe(1.0);
    });

    it('should return 1.0 for BEARISH trend + SHORT signal (no conflict)', () => {
      const trendAnalysis = createMockTrendAnalysis('BEARISH', []);

      const multiplier = service.detectTimeframeConflict(trendAnalysis, SignalDirection.SHORT);

      expect(multiplier).toBe(1.0);
    });

    it('should return 0.7 for BULLISH trend + SHORT signal (conflict)', () => {
      const trendAnalysis = createMockTrendAnalysis('BULLISH', []);

      const multiplier = service.detectTimeframeConflict(trendAnalysis, SignalDirection.SHORT);

      expect(multiplier).toBe(0.7);
    });

    it('should return 0.7 for BEARISH trend + LONG signal (conflict)', () => {
      const trendAnalysis = createMockTrendAnalysis('BEARISH', []);

      const multiplier = service.detectTimeframeConflict(trendAnalysis, SignalDirection.LONG);

      expect(multiplier).toBe(0.7);
    });

    it('should apply 0.7 multiplier to reduce confidence by 30%', () => {
      const trendAnalysis = createMockTrendAnalysis('BULLISH', []);
      const confidence = 100;

      const multiplier = service.detectTimeframeConflict(trendAnalysis, SignalDirection.SHORT);
      const adjustedConfidence = confidence * multiplier;

      expect(adjustedConfidence).toBe(70);
    });
  });

  // ==========================================================================
  // TEST GROUP 4: Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle empty signal array', () => {
      const signals: AnalyzerSignal[] = [];
      const trendAnalysis = createMockTrendAnalysis();

      const filtered = service.filterSignalsByTrend(signals, trendAnalysis);

      expect(filtered).toHaveLength(0);
    });

    it('should handle null trend confirmation service gracefully', async () => {
      const serviceNoConfirm = new SignalFilteringService(strategyCoordinator, null, logger, {});

      const result = await serviceNoConfirm.applyTrendConfirmationFilter(SignalDirection.LONG, 75);

      expect(result).toBe(75);
    });

    it('should handle very low confidence values', async () => {
      trendConfirmationService.confirmTrend.mockResolvedValue(
        createMockTrendConfirmationResult({ isAligned: false, alignmentScore: 50 }),
      );

      const result = await service.applyTrendConfirmationFilter(SignalDirection.LONG, 1);

      expect(result).toBeNull();
    });

    it('should handle very high confidence values', async () => {
      trendConfirmationService.confirmTrend.mockResolvedValue(
        createMockTrendConfirmationResult({ isAligned: true, confidenceBoost: 50 }),
      );

      const result = await service.applyTrendConfirmationFilter(SignalDirection.LONG, 100);

      expect(result).toBe(100);
    });

    it('should handle zero confidence boost', async () => {
      trendConfirmationService.confirmTrend.mockResolvedValue(
        createMockTrendConfirmationResult({ isAligned: true, confidenceBoost: 0 }),
      );

      const result = await service.applyTrendConfirmationFilter(SignalDirection.LONG, 75);

      expect(result).toBe(75);
    });

    it('should handle negative alignment score', async () => {
      trendConfirmationService.confirmTrend.mockResolvedValue(
        createMockTrendConfirmationResult({ isAligned: false, alignmentScore: -10 }),
      );

      const result = await service.applyTrendConfirmationFilter(SignalDirection.LONG, 75);

      expect(result).toBeNull(); // Should be blocked (< critical 30)
    });

    it('should handle alignment score > 100', async () => {
      trendConfirmationService.confirmTrend.mockResolvedValue(
        createMockTrendConfirmationResult({ isAligned: true, alignmentScore: 110, confidenceBoost: 20 }),
      );

      const result = await service.applyTrendConfirmationFilter(SignalDirection.LONG, 80);

      expect(result).toBe(100); // Capped at 100
    });
  });
});
