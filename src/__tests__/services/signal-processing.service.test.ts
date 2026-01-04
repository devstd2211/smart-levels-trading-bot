/**
 * Tests for SignalProcessingService
 * Week 13 Phase 4a: Extracted from trading-orchestrator.service.ts
 */

import { SignalProcessingService, EntrySignal } from '../../services/signal-processing.service';
import { SignalDirection, TrendBias } from '../../types';

describe('SignalProcessingService', () => {
  let service: SignalProcessingService;
  let mockLogger: any;
  let mockStrategyCoordinator: any;
  let mockTrendConfirmationService: any;
  let mockRiskCalculator: any;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockStrategyCoordinator = {
      aggregateSignals: jest.fn().mockReturnValue({
        direction: SignalDirection.LONG,
        confidence: 75,
        totalScore: 0.75,
        recommendedEntry: true,
        signals: [
          { source: 'TestAnalyzer', direction: SignalDirection.LONG, weight: 0.5, confidence: 75, priority: 1, reason: 'Test' }
        ],
        reasoning: 'Test reasoning',
      }),
      getMinTotalScore: jest.fn().mockReturnValue(0.5),
      getMinConfidence: jest.fn().mockReturnValue(50),
    };

    mockTrendConfirmationService = {
      confirmTrend: jest.fn().mockResolvedValue({
        isAligned: true,
        alignmentScore: 85,
        confidenceBoost: 10,
        reason: 'Aligned with trend',
      }),
    };

    mockRiskCalculator = {
      calculate: jest.fn().mockReturnValue({
        direction: SignalDirection.LONG,
        entryPrice: 100,
        stopLoss: 95,
        stopLossPercent: 5,
        takeProfits: [
          { level: 1, price: 105, sizePercent: 30, percent: 5, hit: false },
          { level: 2, price: 110, sizePercent: 40, percent: 10, hit: false },
          { level: 3, price: 115, sizePercent: 30, percent: 15, hit: false },
        ],
      }),
    };

    service = new SignalProcessingService(
      mockStrategyCoordinator as any,
      mockTrendConfirmationService as any,
      mockRiskCalculator as any,
      mockLogger as any,
      {
        strategiesConfig: {
          levelBased: {
            stopLossAtrMultiplier: 1.5,
          },
        },
        trendConfirmation: {
          filterMode: 'ENABLED',
          criticalMisalignmentScore: 30,
          warningMisalignmentScore: 60,
        },
        riskManagement: {
          minStopLossPercent: 1.0,
        },
        entryConfig: {
          takeProfits: [
            { level: 1, percent: 5, sizePercent: 30 },
            { level: 2, percent: 10, sizePercent: 40 },
            { level: 3, percent: 15, sizePercent: 30 },
          ],
        },
      },
    );
  });

  describe('processSignals', () => {
    it('should process signals and generate entry signal', async () => {
      const mockMarketData = {
        currentPrice: 100,
        atr: 1.5,
        timestamp: Date.now(),
        candles: [],
      } as any;

      const mockAnalyzerSignals = [
        { source: 'Test', direction: SignalDirection.LONG, confidence: 75, weight: 0.5, priority: 1 },
      ] as any;

      const mockTrendAnalysis = {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        pattern: 'UPTREND',
        timeframe: '1h',
        restrictedDirections: [],
        reasoning: ['Bullish trend'],
      };

      const result = await service.processSignals(
        mockMarketData,
        mockAnalyzerSignals,
        mockTrendAnalysis,
        null,
      );

      expect(result).toBeDefined();
      expect(result?.shouldEnter).toBe(true);
      expect(result?.direction).toBe(SignalDirection.LONG);
      expect(result?.confidence).toBeGreaterThan(0);
      expect(result?.entryPrice).toBe(100);
      expect(result?.stopLoss).toBeLessThan(100);
      expect(result?.takeProfits.length).toBeGreaterThan(0);
    });

    it('should return null if no analyzer signals', async () => {
      const mockMarketData = { currentPrice: 100, atr: 1.5, timestamp: Date.now(), candles: [] } as any;

      const result = await service.processSignals(mockMarketData, [], null, null);

      expect(result).toBeNull();
      // Check that warning was logged (logger formats with emoji, so just check the call was made)
      expect(mockLogger.warn.mock.calls.length).toBeGreaterThan(0);
    });

    it('should return null if all signals filtered out by trend', async () => {
      const mockMarketData = { currentPrice: 100, atr: 1.5, timestamp: Date.now(), candles: [] } as any;
      const mockAnalyzerSignals = [
        { source: 'Test', direction: SignalDirection.LONG, confidence: 75, weight: 0.5, priority: 1 },
      ] as any;
      const mockTrendAnalysis = {
        bias: TrendBias.BEARISH,
        strength: 0.8,
        pattern: 'DOWNTREND',
        timeframe: '1h',
        restrictedDirections: [SignalDirection.LONG],
        reasoning: ['Bearish trend'],
      };

      const result = await service.processSignals(
        mockMarketData,
        mockAnalyzerSignals,
        mockTrendAnalysis,
        null,
      );

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('All analyzer signals filtered out by trend alignment'),
        expect.any(Object),
      );
    });

    it('should return null if aggregated result does not meet thresholds', async () => {
      mockStrategyCoordinator.aggregateSignals.mockReturnValue({
        direction: SignalDirection.LONG,
        confidence: 30,
        totalScore: 0.3,
        recommendedEntry: false,
        signals: [],
        reasoning: 'Low confidence',
      });

      const mockMarketData = { currentPrice: 100, atr: 1.5, timestamp: Date.now(), candles: [] } as any;
      const mockAnalyzerSignals = [
        { source: 'Test', direction: SignalDirection.LONG, confidence: 75, weight: 0.5, priority: 1 },
      ] as any;
      const mockTrendAnalysis = {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        pattern: 'UPTREND',
        timeframe: '1h',
        restrictedDirections: [],
        reasoning: ['Bullish trend'],
      };

      const result = await service.processSignals(mockMarketData, mockAnalyzerSignals, mockTrendAnalysis, null);

      expect(result).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('does not meet entry thresholds'),
        expect.any(Object),
      );
    });

    it('should handle trend confirmation blocking', async () => {
      mockTrendConfirmationService.confirmTrend.mockResolvedValue({
        isAligned: false,
        alignmentScore: 20,
        confidenceBoost: 0,
        reason: 'Critical misalignment',
      });

      const mockMarketData = { currentPrice: 100, atr: 1.5, timestamp: Date.now(), candles: [] } as any;
      const mockAnalyzerSignals = [
        { source: 'Test', direction: SignalDirection.LONG, confidence: 75, weight: 0.5, priority: 1 },
      ] as any;
      const mockTrendAnalysis = {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        pattern: 'UPTREND',
        timeframe: '1h',
        restrictedDirections: [],
        reasoning: ['Bullish trend'],
      };

      const result = await service.processSignals(mockMarketData, mockAnalyzerSignals, mockTrendAnalysis, null);

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Critical misalignment'),
        expect.any(Object),
      );
    });


    it('should apply confidence boost on full alignment', async () => {
      mockTrendConfirmationService.confirmTrend.mockResolvedValue({
        isAligned: true,
        alignmentScore: 95,
        confidenceBoost: 15,
        reason: 'Full alignment',
      });

      const mockMarketData = { currentPrice: 100, atr: 1.5, timestamp: Date.now(), candles: [] } as any;
      const mockAnalyzerSignals = [
        { source: 'Test', direction: SignalDirection.LONG, confidence: 75, weight: 0.5, priority: 1 },
      ] as any;
      const mockTrendAnalysis = {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        pattern: 'UPTREND',
        timeframe: '1h',
        restrictedDirections: [],
        reasoning: ['Bullish trend'],
      };

      const result = await service.processSignals(mockMarketData, mockAnalyzerSignals, mockTrendAnalysis, null);

      expect(result).toBeDefined();
      expect(result?.confidence).toBeGreaterThan(75); // Original 75 + 15 = 90
    });

    it('should adjust take profits for flat market', async () => {
      const mockMarketData = { currentPrice: 100, atr: 1.5, timestamp: Date.now(), candles: [] } as any;
      const mockAnalyzerSignals = [
        { source: 'Test', direction: SignalDirection.LONG, confidence: 75, weight: 0.5, priority: 1 },
      ] as any;
      const flatResult = { isFlat: true, confidence: 0.7 };
      const mockTrendAnalysis = {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        pattern: 'UPTREND',
        timeframe: '1h',
        restrictedDirections: [],
        reasoning: ['Bullish trend'],
      };

      const result = await service.processSignals(mockMarketData, mockAnalyzerSignals, mockTrendAnalysis, flatResult);

      expect(result).toBeDefined();
      expect(result?.takeProfits.length).toBe(1); // Only one TP in flat market
      expect(result?.takeProfits[0].sizePercent).toBe(100); // 100% close on single TP
    });

    it('should keep multiple TPs for trending market', async () => {
      const mockMarketData = { currentPrice: 100, atr: 1.5, timestamp: Date.now(), candles: [] } as any;
      const mockAnalyzerSignals = [
        { source: 'Test', direction: SignalDirection.LONG, confidence: 75, weight: 0.5, priority: 1 },
      ] as any;
      const flatResult = { isFlat: false, confidence: 0.3 };
      const mockTrendAnalysis = {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        pattern: 'UPTREND',
        timeframe: '1h',
        restrictedDirections: [],
        reasoning: ['Bullish trend'],
      };

      const result = await service.processSignals(mockMarketData, mockAnalyzerSignals, mockTrendAnalysis, flatResult);

      expect(result).toBeDefined();
      expect(result?.takeProfits.length).toBe(3); // Multiple TPs in trending market
    });

    it('should handle processing errors gracefully', async () => {
      mockStrategyCoordinator.aggregateSignals.mockImplementation(() => {
        throw new Error('Aggregation failed');
      });

      const mockMarketData = { currentPrice: 100, atr: 1.5, timestamp: Date.now(), candles: [] } as any;
      const mockAnalyzerSignals = [
        { source: 'Test', direction: SignalDirection.LONG, confidence: 75, weight: 0.5, priority: 1 },
      ] as any;
      const mockTrendAnalysis = {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        pattern: 'UPTREND',
        timeframe: '1h',
        restrictedDirections: [],
        reasoning: ['Bullish trend'],
      };

      const result = await service.processSignals(mockMarketData, mockAnalyzerSignals, mockTrendAnalysis, null);

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error processing signals'),
        expect.any(Object),
      );
    });
  });

  describe('trend filtering', () => {
    it('should filter signals by restricted directions', async () => {
      const mockMarketData = { currentPrice: 100, atr: 1.5, timestamp: Date.now(), candles: [] } as any;
      const mockAnalyzerSignals = [
        { source: 'Test1', direction: SignalDirection.LONG, confidence: 75, weight: 0.5, priority: 1 },
        { source: 'Test2', direction: SignalDirection.SHORT, confidence: 75, weight: 0.5, priority: 1 },
      ] as any;
      const mockTrendAnalysis = {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        pattern: 'UPTREND',
        timeframe: '1h',
        restrictedDirections: [SignalDirection.SHORT],
        reasoning: ['Bullish trend'],
      };

      const result = await service.processSignals(
        mockMarketData,
        mockAnalyzerSignals,
        mockTrendAnalysis,
        null,
      );

      // Should proceed since LONG is not restricted
      expect(result).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Signal BLOCKED by trend alignment'),
        expect.any(Object),
      );
    });

    it('should not filter when no restrictions', async () => {
      const mockMarketData = { currentPrice: 100, atr: 1.5, timestamp: Date.now(), candles: [] } as any;
      const mockAnalyzerSignals = [
        { source: 'Test', direction: SignalDirection.LONG, confidence: 75, weight: 0.5, priority: 1 },
      ] as any;
      const mockTrendAnalysis = {
        bias: TrendBias.NEUTRAL,
        strength: 0.5,
        pattern: 'CONSOLIDATION',
        timeframe: '1h',
        restrictedDirections: [],
        reasoning: ['Neutral trend'],
      };

      const result = await service.processSignals(
        mockMarketData,
        mockAnalyzerSignals,
        mockTrendAnalysis,
        null,
      );

      expect(result).toBeDefined();
      expect(result?.direction).toBe(SignalDirection.LONG);
    });
  });

  describe('with trend confirmation service disabled', () => {
    beforeEach(() => {
      service = new SignalProcessingService(
        mockStrategyCoordinator as any,
        null, // Disabled
        mockRiskCalculator as any,
        mockLogger as any,
        {
          strategiesConfig: { levelBased: { stopLossAtrMultiplier: 1.5 } },
          riskManagement: { minStopLossPercent: 1.0 },
          entryConfig: {
            takeProfits: [
              { level: 1, percent: 5, sizePercent: 30 },
              { level: 2, percent: 10, sizePercent: 40 },
              { level: 3, percent: 15, sizePercent: 30 },
            ],
          },
        },
      );
    });

    it('should skip trend confirmation filtering', async () => {
      const mockMarketData = { currentPrice: 100, atr: 1.5, timestamp: Date.now(), candles: [] } as any;
      const mockAnalyzerSignals = [
        { source: 'Test', direction: SignalDirection.LONG, confidence: 75, weight: 0.5, priority: 1 },
      ] as any;
      const mockTrendAnalysis = {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        pattern: 'UPTREND',
        timeframe: '1h',
        restrictedDirections: [],
        reasoning: ['Bullish trend'],
      };

      const result = await service.processSignals(mockMarketData, mockAnalyzerSignals, mockTrendAnalysis, null);

      expect(result).toBeDefined();
      expect(result?.confidence).toBe(75); // Original confidence unchanged
    });
  });
});
