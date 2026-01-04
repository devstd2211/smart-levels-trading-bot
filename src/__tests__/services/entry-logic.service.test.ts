/**
 * Tests for EntryLogicService
 * Week 13 Phase 5d: Extracted from trading-orchestrator.service.ts onCandleClosed method
 */

import { EntryLogicService } from '../../services/entry-logic.service';
import { TimeframeRole, SignalDirection } from '../../types';

describe('EntryLogicService', () => {
  let service: EntryLogicService;
  let mockLogger: any;
  let mockPositionManager: any;
  let mockBollingerIndicator: any;
  let mockCandleProvider: any;
  let mockEmaAnalyzer: any;
  let mockRetestEntryService: any;
  let mockMarketDataPreparationService: any;
  let mockExternalAnalysisService: any;
  let mockAnalyzerRegistry: any;
  let mockStrategyCoordinator: any;
  let mockSignalProcessingService: any;
  let mockTradeExecutionService: any;
  let mockBybitService: any;
  let mockConfig: any;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockPositionManager = {
      getCurrentPosition: jest.fn().mockReturnValue(null),
      checkPendingConfirmations: jest.fn().mockReturnValue(null),
      isConfirmationEnabled: jest.fn().mockReturnValue(false),
      addPendingSignal: jest.fn().mockReturnValue('pending-123'),
      updateBBTrailingStop: jest.fn().mockResolvedValue(undefined),
    };

    mockBollingerIndicator = {
      calculate: jest.fn().mockReturnValue({
        upper: 105,
        middle: 100,
        lower: 95,
        width: 10,
        percentB: 0.5,
      }),
    };

    mockCandleProvider = {
      getCandles: jest.fn().mockResolvedValue([
        { timestamp: 1000, open: 100, high: 105, low: 95, close: 103, volume: 1000 },
      ]),
    };

    mockEmaAnalyzer = {
      calculate: jest.fn().mockResolvedValue({
        fast: 102,
        slow: 101,
      }),
    };

    mockRetestEntryService = {
      getRetestZone: jest.fn().mockReturnValue(null),
    };

    mockMarketDataPreparationService = {
      prepareMarketData: jest.fn().mockResolvedValue({
        rsi: 50,
        ema: { fast: 102, slow: 101 },
        atr: 2,
        trend: 'NEUTRAL',
      }),
    };

    mockExternalAnalysisService = {
      detectFlatMarket: jest.fn().mockReturnValue(null),
    };

    mockAnalyzerRegistry = {
      collectSignals: jest.fn().mockResolvedValue([]),
      getEnabledCount: jest.fn().mockReturnValue(10),
      getCount: jest.fn().mockReturnValue(45),
    };

    mockStrategyCoordinator = {
      evaluateStrategies: jest.fn().mockResolvedValue(null),
    };

    mockSignalProcessingService = {
      processSignals: jest.fn().mockResolvedValue(null),
      onNewCandle: jest.fn(),
    };

    mockTradeExecutionService = {
      executeTrade: jest.fn().mockResolvedValue(undefined),
    };

    mockBybitService = {
      getServerTime: jest.fn().mockResolvedValue(Date.now()),
    };

    mockConfig = {
      indicators: {
        bollingerBands: {
          enabled: false,
        },
      },
      retestEntry: null,
      weightMatrix: {
        minConfidenceToEnter: 50,
      },
    };

    service = new EntryLogicService(
      mockConfig,
      mockPositionManager,
      mockBollingerIndicator,
      mockCandleProvider,
      mockEmaAnalyzer,
      null, // currentContext (TradingContextService)
      mockRetestEntryService,
      mockMarketDataPreparationService,
      mockExternalAnalysisService,
      mockAnalyzerRegistry,
      mockStrategyCoordinator,
      mockSignalProcessingService,
      mockTradeExecutionService,
      mockBybitService,
      mockLogger,
    );
  });

  describe('scanForEntries', () => {
    const mockCandle = { timestamp: 1000, open: 100, high: 105, low: 95, close: 103, volume: 1000 };

    it('should sync time with exchange before entry scan', async () => {
      await service.scanForEntries(mockCandle);

      expect(mockBybitService.getServerTime).toHaveBeenCalled();
    });

    it('should log entry scan start', async () => {
      await service.scanForEntries(mockCandle);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('ENTRY candle closed'),
      );
    });

    it('should check if already in position', async () => {
      await service.scanForEntries(mockCandle);

      expect(mockPositionManager.getCurrentPosition).toHaveBeenCalled();
    });

    it('should skip entry scan when already in position', async () => {
      mockPositionManager.getCurrentPosition.mockReturnValue({
        id: 'pos-1',
        symbol: 'APEXUSDT',
      });

      await service.scanForEntries(mockCandle);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Already in position'),
        expect.any(Object),
      );
      expect(mockMarketDataPreparationService.prepareMarketData).not.toHaveBeenCalled();
    });

    it('should check pending confirmations when no position', async () => {
      await service.scanForEntries(mockCandle);

      expect(mockPositionManager.checkPendingConfirmations).toHaveBeenCalledWith(mockCandle.close);
    });

    it('should execute confirmed signal immediately', async () => {
      mockPositionManager.checkPendingConfirmations.mockReturnValue({
        direction: SignalDirection.LONG,
        confidence: 0.75,
        price: 100,
        stopLoss: 95,
        takeProfits: [105, 110, 115],
        reason: 'Level support',
        timestamp: Date.now(),
      });

      await service.scanForEntries(mockCandle);

      // PHASE 6a: Now expects 3 parameters (signal, undefined, trend)
      expect(mockTradeExecutionService.executeTrade).toHaveBeenCalled();
      const calls = mockTradeExecutionService.executeTrade.mock.calls;
      expect(calls.length).toBeGreaterThan(0);

      const [signal, marketData, trend] = calls[0];
      expect(signal.shouldEnter).toBe(true);
      expect(signal.direction).toBe(SignalDirection.LONG);
      expect(signal.reason).toContain('[CONFIRMED]');
      expect(marketData).toBeUndefined(); // marketData is undefined for confirmed signals
      expect(trend).toBeDefined(); // trend passed from currentTrendAnalysis
    });

    it('should prepare market data when no confirmed signal', async () => {
      await service.scanForEntries(mockCandle);

      expect(mockMarketDataPreparationService.prepareMarketData).toHaveBeenCalled();
    });

    it('should skip entry scan when market data preparation fails', async () => {
      mockMarketDataPreparationService.prepareMarketData.mockResolvedValue(null);

      await service.scanForEntries(mockCandle);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to prepare market data'),
      );
      expect(mockAnalyzerRegistry.collectSignals).not.toHaveBeenCalled();
    });

    it('should collect analyzer signals', async () => {
      await service.scanForEntries(mockCandle);

      expect(mockAnalyzerRegistry.collectSignals).toHaveBeenCalled();
    });

    it('should evaluate strategies', async () => {
      await service.scanForEntries(mockCandle);

      expect(mockStrategyCoordinator.evaluateStrategies).toHaveBeenCalled();
    });

    it('should execute strategy signal when trend-aligned', async () => {
      mockStrategyCoordinator.evaluateStrategies.mockResolvedValue({
        valid: true,
        signal: {
          direction: SignalDirection.LONG,
          confidence: 0.8,
          price: 100,
          stopLoss: 95,
          takeProfits: [105, 110, 115],
          timestamp: Date.now(),
        },
        strategyName: 'EdgeReversals',
        reason: 'RSI oversold + trend aligned',
      });

      await service.scanForEntries(mockCandle);

      expect(mockTradeExecutionService.executeTrade).toHaveBeenCalled();
    });

    it('should process signals through signal processing service', async () => {
      await service.scanForEntries(mockCandle);

      expect(mockSignalProcessingService.processSignals).toHaveBeenCalled();
    });

    it('should exit early when no entry signal generated', async () => {
      mockSignalProcessingService.processSignals.mockResolvedValue(null);

      await service.scanForEntries(mockCandle);

      expect(mockPositionManager.isConfirmationEnabled).not.toHaveBeenCalled();
    });

    it('should add signal to pending queue when confirmation enabled', async () => {
      mockPositionManager.isConfirmationEnabled.mockReturnValue(true);
      mockSignalProcessingService.processSignals.mockResolvedValue({
        shouldEnter: true,
        direction: SignalDirection.LONG,
        confidence: 0.7,
        entryPrice: 100,
        stopLoss: 95,
        takeProfits: [105, 110],
        reason: 'LevelBased signal',
        timestamp: Date.now(),
      });

      await service.scanForEntries(mockCandle);

      expect(mockPositionManager.addPendingSignal).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('added to pending queue'),
        expect.any(Object),
      );
    });

    it('should execute trade immediately when confirmation disabled', async () => {
      mockPositionManager.isConfirmationEnabled.mockReturnValue(false);
      mockSignalProcessingService.processSignals.mockResolvedValue({
        shouldEnter: true,
        direction: SignalDirection.LONG,
        confidence: 0.7,
        entryPrice: 100,
        stopLoss: 95,
        takeProfits: [105, 110],
        reason: 'LevelBased signal',
        timestamp: Date.now(),
      });

      await service.scanForEntries(mockCandle);

      // PHASE 6a: Now expects 3 parameters (signal, marketData, trend)
      // Verify executeTrade was called with expected signal
      const calls = mockTradeExecutionService.executeTrade.mock.calls;
      expect(calls.length).toBeGreaterThan(0);

      const [signal, marketData, trend] = calls[0];
      expect(signal.shouldEnter).toBe(true);
      expect(signal.direction).toBe(SignalDirection.LONG);
      expect(marketData).toBeDefined(); // marketData provided
      expect(trend).toBeNull(); // trend is null in this test
    });

    it('should skip BB trailing stop update (deprecated - moved to ExitOrchestrator)', async () => {
      mockPositionManager.getCurrentPosition.mockReturnValue({
        id: 'pos-1',
        symbol: 'APEXUSDT',
      });
      mockConfig.indicators.bollingerBands.enabled = true;
      mockConfig.indicators.bollingerBands.period = 20;

      // Provide enough candles for BB calculation (needs >= 20)
      const manyCandles = Array.from({ length: 25 }, (_, i) => ({
        timestamp: 1000 + i * 60000,
        open: 100 + i * 0.1,
        high: 105 + i * 0.1,
        low: 95 + i * 0.1,
        close: 103 + i * 0.1,
        volume: 1000 + i * 10,
      }));
      mockCandleProvider.getCandles.mockResolvedValue(manyCandles);

      await service.scanForEntries(mockCandle);

      // BB trailing stop is now handled by ExitOrchestrator on PRIMARY candle close (Session 70)
      expect(mockPositionManager.updateBBTrailingStop).not.toHaveBeenCalled();
    });

    it('should check retest entry when in position', async () => {
      mockPositionManager.getCurrentPosition.mockReturnValue({
        id: 'pos-1',
        symbol: 'APEXUSDT',
      });
      mockConfig.retestEntry = { enabled: true };
      mockRetestEntryService.getRetestZone.mockReturnValue({
        originalSignal: 'test',
      });

      await service.scanForEntries(mockCandle);

      expect(mockRetestEntryService.getRetestZone).toHaveBeenCalled();
    });

    it('should handle time sync error gracefully', async () => {
      mockBybitService.getServerTime.mockRejectedValue(new Error('Network error'));

      // Should not throw, just log warning
      await expect(service.scanForEntries(mockCandle)).resolves.not.toThrow();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Time sync failed'),
        expect.any(Object),
      );
    });

    it('should handle flat market detection', async () => {
      // Need to create service with proper currentContext for flat market detection
      const mockContext = { atrPercent: 2.5, volatility: 0.015 };
      const serviceWithContext = new EntryLogicService(
        mockConfig,
        mockPositionManager,
        mockBollingerIndicator,
        mockCandleProvider,
        mockEmaAnalyzer,
        mockContext, // Provide context
        mockRetestEntryService,
        mockMarketDataPreparationService,
        mockExternalAnalysisService,
        mockAnalyzerRegistry,
        mockStrategyCoordinator,
        mockSignalProcessingService,
        mockTradeExecutionService,
        mockBybitService,
        mockLogger,
      );

      const flatMarketResult = { isFlat: true, confidence: 65 };
      mockExternalAnalysisService.detectFlatMarket.mockReturnValue(flatMarketResult);

      await serviceWithContext.scanForEntries(mockCandle);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '🎯 Adaptive Confidence Threshold',
        expect.objectContaining({
          marketType: 'FLAT',
        }),
      );
    });

    it('should use adaptive confidence threshold for flat market', async () => {
      mockConfig.weightMatrix.minConfidenceFlat = 40;

      const mockContext = { atrPercent: 2.5, volatility: 0.015 };
      const serviceWithContext = new EntryLogicService(
        mockConfig,
        mockPositionManager,
        mockBollingerIndicator,
        mockCandleProvider,
        mockEmaAnalyzer,
        mockContext,
        mockRetestEntryService,
        mockMarketDataPreparationService,
        mockExternalAnalysisService,
        mockAnalyzerRegistry,
        mockStrategyCoordinator,
        mockSignalProcessingService,
        mockTradeExecutionService,
        mockBybitService,
        mockLogger,
      );

      mockExternalAnalysisService.detectFlatMarket.mockReturnValue({
        isFlat: true,
        confidence: 65,
      });

      await serviceWithContext.scanForEntries(mockCandle);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '🎯 Adaptive Confidence Threshold',
        expect.objectContaining({
          source: 'minConfidenceFlat',
        }),
      );
    });

    it('should detect flat market with proper log output', async () => {
      const mockContext = { atrPercent: 2.5, volatility: 0.015 };
      const serviceWithContext = new EntryLogicService(
        mockConfig,
        mockPositionManager,
        mockBollingerIndicator,
        mockCandleProvider,
        mockEmaAnalyzer,
        mockContext,
        mockRetestEntryService,
        mockMarketDataPreparationService,
        mockExternalAnalysisService,
        mockAnalyzerRegistry,
        mockStrategyCoordinator,
        mockSignalProcessingService,
        mockTradeExecutionService,
        mockBybitService,
        mockLogger,
      );

      mockExternalAnalysisService.detectFlatMarket.mockReturnValue({
        isFlat: true,
        confidence: 62.5,
      });

      await serviceWithContext.scanForEntries(mockCandle);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '🎯 Adaptive Confidence Threshold',
        expect.objectContaining({
          marketType: 'FLAT',
          minRequired: '50%',
        }),
      );
    });
  });

  describe('Error handling', () => {
    const mockCandle = { timestamp: 1000, open: 100, high: 105, low: 95, close: 103, volume: 1000 };

    it('should handle market data preparation failure', async () => {
      mockMarketDataPreparationService.prepareMarketData.mockRejectedValue(new Error('DB error'));

      // Should not throw - error is caught inside scanForEntries
      await service.scanForEntries(mockCandle);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to prepare market data'),
        expect.objectContaining({
          error: 'DB error',
        }),
      );
    });

    it('should not attempt BB trailing stop update (deprecated - moved to ExitOrchestrator)', async () => {
      mockPositionManager.getCurrentPosition.mockReturnValue({
        id: 'pos-1',
        symbol: 'APEXUSDT',
      });
      mockConfig.indicators.bollingerBands.enabled = true;
      mockPositionManager.updateBBTrailingStop.mockRejectedValue(new Error('Update failed'));

      // Provide enough candles for BB calculation
      const manyCandles = Array.from({ length: 25 }, (_, i) => ({
        timestamp: 1000 + i * 60000,
        open: 100 + i * 0.1,
        high: 105 + i * 0.1,
        low: 95 + i * 0.1,
        close: 103 + i * 0.1,
        volume: 1000 + i * 10,
      }));
      mockCandleProvider.getCandles.mockResolvedValue(manyCandles);

      // Should complete successfully - BB trailing stop is no longer called here
      await service.scanForEntries(mockCandle);

      // BB trailing stop is now handled by ExitOrchestrator on PRIMARY candle close (Session 70)
      expect(mockPositionManager.updateBBTrailingStop).not.toHaveBeenCalled();
    });

    it('should handle retest entry check failure', async () => {
      mockPositionManager.getCurrentPosition.mockReturnValue({
        id: 'pos-1',
        symbol: 'APEXUSDT',
      });
      mockConfig.retestEntry = { enabled: true };
      mockRetestEntryService.getRetestZone.mockReturnValue({ originalSignal: 'test' });
      mockEmaAnalyzer.calculate.mockRejectedValue(new Error('EMA calculation failed'));

      // Should not throw - error is caught inside handlePositionStatus
      await service.scanForEntries(mockCandle);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to check retest entry'),
        expect.any(Object),
      );
    });
  });
});
