/**
 * Tests for TradingContextService
 * Week 13 Phase 2: Extracted from trading-orchestrator.service.ts
 */

import { TradingContextService } from '../../services/trading-context.service';
import { SignalDirection, TrendBias } from '../../types';

describe('TradingContextService', () => {
  let service: TradingContextService;
  let mockLogger: any;
  let mockCandleProvider: any;
  let mockTrendAnalyzer: any;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockCandleProvider = {
      getCandles: jest.fn(),
    };

    mockTrendAnalyzer = {
      analyzeTrend: jest.fn().mockResolvedValue({
        bias: TrendBias.BULLISH,
        strength: 0.75,
        pattern: 'HIGHER_HIGH',
        restrictedDirections: [SignalDirection.SHORT],
        reasoning: ['Strong bullish momentum', 'Price above EMA', 'Higher lows confirmed'],
      }),
    };

    service = new TradingContextService(
      mockCandleProvider as any,
      mockTrendAnalyzer as any,
      mockLogger as any,
    );
  });

  describe('initialization', () => {
    it('should initialize without errors', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(TradingContextService);
    });

    it('should have null trend analysis initially', () => {
      const analysis = service.getCurrentTrendAnalysis();
      expect(analysis).toBeNull();
    });
  });

  describe('updateTrendContext', () => {
    it('should update trend analysis on PRIMARY candle close', async () => {
      const mockCandles = Array(50)
        .fill(null)
        .map((_, i) => ({
          open: 100 + i * 0.1,
          high: 101 + i * 0.1,
          low: 99 + i * 0.1,
          close: 100.5 + i * 0.1,
          volume: 1000,
          timestamp: Date.now() - (50 - i) * 300000,
        }));

      mockCandleProvider.getCandles.mockResolvedValue(mockCandles);

      await service.updateTrendContext();

      const analysis = service.getCurrentTrendAnalysis();
      expect(analysis).toBeDefined();
      expect(analysis?.bias).toBe(TrendBias.BULLISH);
      expect(analysis?.strength).toBe(0.75);
      expect(mockTrendAnalyzer.analyzeTrend).toHaveBeenCalledWith(mockCandles, '1h');
    });

    it('should log trend analysis on update', async () => {
      const mockCandles = Array(50)
        .fill(null)
        .map((_, i) => ({
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
          timestamp: Date.now() - (50 - i) * 300000,
        }));

      mockCandleProvider.getCandles.mockResolvedValue(mockCandles);

      await service.updateTrendContext();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('TREND ANALYSIS UPDATED'),
        expect.objectContaining({
          bias: TrendBias.BULLISH,
          strength: expect.any(String),
        }),
      );
    });

    it('should skip update if not enough candles', async () => {
      mockCandleProvider.getCandles.mockResolvedValue([]);

      await service.updateTrendContext();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Insufficient candles'),
        expect.any(Object),
      );
      expect(mockTrendAnalyzer.analyzeTrend).not.toHaveBeenCalled();
    });

    it('should skip update if trendAnalyzer not available', async () => {
      const serviceWithoutAnalyzer = new TradingContextService(
        mockCandleProvider as any,
        null,
        mockLogger as any,
      );

      await serviceWithoutAnalyzer.updateTrendContext();

      expect(mockCandleProvider.getCandles).not.toHaveBeenCalled();
    });

    it('should handle trend analyzer errors gracefully', async () => {
      const mockCandles = Array(50)
        .fill(null)
        .map((_, i) => ({
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
          timestamp: Date.now() - (50 - i) * 300000,
        }));

      mockCandleProvider.getCandles.mockResolvedValue(mockCandles);
      mockTrendAnalyzer.analyzeTrend.mockRejectedValue(new Error('Analysis failed'));

      await service.updateTrendContext();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error during trend analysis update'),
        expect.any(Object),
      );
      // Should keep previous analysis on error (none in this case)
      expect(service.getCurrentTrendAnalysis()).toBeNull();
    });
  });

  describe('getCurrentTrendAnalysis', () => {
    it('should return current trend analysis', async () => {
      const mockCandles = Array(50)
        .fill(null)
        .map((_, i) => ({
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
          timestamp: Date.now() - (50 - i) * 300000,
        }));

      mockCandleProvider.getCandles.mockResolvedValue(mockCandles);

      await service.updateTrendContext();

      const analysis = service.getCurrentTrendAnalysis();
      expect(analysis?.bias).toBe(TrendBias.BULLISH);
      expect(analysis?.restrictedDirections).toContain(SignalDirection.SHORT);
    });

    it('should return null if no analysis yet', () => {
      const analysis = service.getCurrentTrendAnalysis();
      expect(analysis).toBeNull();
    });
  });

  describe('filterSignalsByTrend', () => {
    it('should filter out signals blocked by trend', async () => {
      const mockCandles = Array(50)
        .fill(null)
        .map((_, i) => ({
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
          timestamp: Date.now() - (50 - i) * 300000,
        }));

      mockCandleProvider.getCandles.mockResolvedValue(mockCandles);
      await service.updateTrendContext();

      const signals = [
        {
          source: 'TEST1',
          direction: SignalDirection.LONG,
          confidence: 75,
          weight: 0.5,
          priority: 5,
        },
        {
          source: 'TEST2',
          direction: SignalDirection.SHORT, // Should be blocked in BULLISH trend
          confidence: 60,
          weight: 0.4,
          priority: 4,
        },
      ];

      const filtered = service.filterSignalsByTrend(signals);

      expect(filtered.length).toBe(1);
      expect(filtered[0].direction).toBe(SignalDirection.LONG);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Signal BLOCKED'),
        expect.any(Object),
      );
    });

    it('should return all signals if no restrictions', async () => {
      const mockCandles = Array(50)
        .fill(null)
        .map((_, i) => ({
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
          timestamp: Date.now() - (50 - i) * 300000,
        }));

      mockTrendAnalyzer.analyzeTrend.mockResolvedValue({
        bias: TrendBias.NEUTRAL,
        strength: 0.5,
        pattern: 'EQUAL_HIGH',
        restrictedDirections: [], // No restrictions
        reasoning: ['Flat market'],
      });

      mockCandleProvider.getCandles.mockResolvedValue(mockCandles);
      await service.updateTrendContext();

      const signals = [
        {
          source: 'TEST1',
          direction: SignalDirection.LONG,
          confidence: 75,
          weight: 0.5,
          priority: 5,
        },
        {
          source: 'TEST2',
          direction: SignalDirection.SHORT,
          confidence: 60,
          weight: 0.4,
          priority: 4,
        },
      ];

      const filtered = service.filterSignalsByTrend(signals);

      expect(filtered.length).toBe(2);
    });

    it('should return all signals if no trend analysis', () => {
      const signals = [
        {
          source: 'TEST1',
          direction: SignalDirection.LONG,
          confidence: 75,
          weight: 0.5,
          priority: 5,
        },
        {
          source: 'TEST2',
          direction: SignalDirection.SHORT,
          confidence: 60,
          weight: 0.4,
          priority: 4,
        },
      ];

      const filtered = service.filterSignalsByTrend(signals);

      expect(filtered.length).toBe(2);
    });

    it('should log filtering stats when signals are blocked', async () => {
      const mockCandles = Array(50)
        .fill(null)
        .map((_, i) => ({
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
          timestamp: Date.now() - (50 - i) * 300000,
        }));

      mockCandleProvider.getCandles.mockResolvedValue(mockCandles);
      await service.updateTrendContext();

      const signals = [
        {
          source: 'TEST1',
          direction: SignalDirection.SHORT,
          confidence: 60,
          weight: 0.4,
          priority: 4,
        },
        {
          source: 'TEST2',
          direction: SignalDirection.SHORT,
          confidence: 55,
          weight: 0.3,
          priority: 3,
        },
      ];

      const filtered = service.filterSignalsByTrend(signals);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Trend Alignment Filtering'),
        expect.objectContaining({
          total: 2,
          filtered: 0,
          blocked: 2,
        }),
      );
    });
  });
});
