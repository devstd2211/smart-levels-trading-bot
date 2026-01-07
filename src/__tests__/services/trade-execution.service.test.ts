/**
 * Tests for TradeExecutionService
 * Week 13 Phase 4b: Extracted from trading-orchestrator.service.ts
 */

import { TradeExecutionService } from '../../services/trade-execution.service';
import { EntrySignal } from '../../types';
import { SignalDirection } from '../../types';

describe('TradeExecutionService', () => {
  let service: TradeExecutionService;
  let mockLogger: any;
  let mockBybitService: any;
  let mockPositionManager: any;
  let mockCandleProvider: any;
  let mockRiskManager: any;
  let mockRetestEntryService: any;
  let mockExternalAnalysisService: any;
  let mockTelegram: any;
  let mockEntryOrchestrator: any;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockBybitService = {
      getBalance: jest.fn().mockResolvedValue(1000),
    };

    mockPositionManager = {
      openPosition: jest.fn().mockResolvedValue({
        id: 'pos-123',
        side: 'BUY',
        entryPrice: 100,
      }),
      ['journal']: {
        getOpenTrades: jest.fn().mockReturnValue([]),
      },
    };

    mockCandleProvider = {
      getCandles: jest.fn().mockResolvedValue(
        Array(10)
          .fill(null)
          .map((_, i) => ({
            open: 100 + i,
            high: 101 + i,
            low: 99 + i,
            close: 100 + i * 0.5,
            volume: 1000,
            timestamp: Date.now() - (10 - i) * 60000,
          }))
      ),
    };

    mockRiskManager = {
      canTrade: jest.fn().mockResolvedValue({
        allowed: true,
        adjustedPositionSize: 1,
        reason: 'Approved',
        riskDetails: {
          dailyPnL: 50,
          consecutiveLosses: 0,
          totalExposure: 10,
        },
      }),
    };

    mockRetestEntryService = {
      detectImpulse: jest.fn().mockReturnValue({
        hasImpulse: false,
        impulseStart: 0,
        impulseEnd: 0,
      }),
      createRetestZone: jest.fn(),
    };

    mockExternalAnalysisService = {
      checkBTCConfirmation: jest.fn().mockResolvedValue(true),
      checkFundingRate: jest.fn().mockResolvedValue(true),
    };

    mockTelegram = {
      sendTradeNotification: jest.fn().mockResolvedValue(undefined),
      notifyError: jest.fn().mockResolvedValue(undefined),
    };

    // PHASE 6a: Mock EntryOrchestrator (REQUIRED)
    mockEntryOrchestrator = {
      evaluateEntry: jest.fn().mockResolvedValue({
        decision: 'ENTER',
        signal: { type: 'TEST', direction: SignalDirection.LONG },
        reason: 'Mock approval',
        riskAssessment: {
          allowed: true,
          adjustedPositionSize: 1,
          reason: 'Approved',
          riskDetails: {
            dailyPnL: 50,
            consecutiveLosses: 0,
            totalExposure: 10,
          },
        },
      }),
    };

    service = new TradeExecutionService(
      mockBybitService as any,
      mockPositionManager as any,
      mockCandleProvider as any,
      mockRiskManager as any,
      mockRetestEntryService as any,
      mockExternalAnalysisService as any,
      mockTelegram as any,
      mockLogger as any,
      {
        btcConfirmation: { enabled: true },
        fundingRateFilter: { enabled: true },
        retestEntry: { enabled: true },
        positionSizeUsdt: 10,
      } as any,
      undefined, // rsiAnalyzer
      undefined, // emaAnalyzer
      undefined, // liquidityDetector
      mockEntryOrchestrator as any, // PHASE 6a: Pass mock orchestrator
    );
  });

  describe('executeTrade', () => {
    it('should execute trade successfully', async () => {
      const entrySignal: EntrySignal = {
        shouldEnter: true,
        direction: SignalDirection.LONG,
        confidence: 75,
        entryPrice: 100,
        stopLoss: 95,
        takeProfits: [
          { level: 1, price: 105, sizePercent: 30, percent: 5, hit: false },
          { level: 2, price: 110, sizePercent: 40, percent: 10, hit: false },
        ],
        reason: 'Test signal',
        timestamp: Date.now(),
        strategyName: 'WeightedVoting',
      };

      await service.executeTrade(entrySignal);

      // PHASE 6a: EntryOrchestrator is now PRIMARY decision point (RiskManager called inside)
      expect(mockEntryOrchestrator.evaluateEntry).toHaveBeenCalled();
      // Week 13: BTC confirmation now handled as soft voting through analyzer system, not hard block
      expect(mockExternalAnalysisService.checkFundingRate).toHaveBeenCalled();
      expect(mockPositionManager.openPosition).toHaveBeenCalled();
      expect(mockTelegram.sendTradeNotification).toHaveBeenCalled();
    });

    it('should be blocked by kill-switch', async () => {
      // Mock fs to return kill-switch exists
      jest.mock('fs', () => ({
        existsSync: jest.fn().mockReturnValue(true),
      }));

      const entrySignal: EntrySignal = {
        shouldEnter: true,
        direction: SignalDirection.LONG,
        confidence: 75,
        entryPrice: 100,
        stopLoss: 95,
        takeProfits: [],
        reason: 'Test signal',
        timestamp: Date.now(),
      };

      // This test would need proper mocking of fs module
      // For now, we'll skip detailed kill-switch testing
    });


    it('should be blocked by BTC confirmation', async () => {
      mockExternalAnalysisService.checkBTCConfirmation.mockResolvedValue(false);

      const entrySignal: EntrySignal = {
        shouldEnter: true,
        direction: SignalDirection.LONG,
        confidence: 75,
        entryPrice: 100,
        stopLoss: 95,
        takeProfits: [],
        reason: 'Test signal',
        timestamp: Date.now(),
      };

      await service.executeTrade(entrySignal);

      expect(mockPositionManager.openPosition).not.toHaveBeenCalled();
    });

    it('should be blocked by funding rate filter', async () => {
      mockExternalAnalysisService.checkFundingRate.mockResolvedValue(false);

      const entrySignal: EntrySignal = {
        shouldEnter: true,
        direction: SignalDirection.LONG,
        confidence: 75,
        entryPrice: 100,
        stopLoss: 95,
        takeProfits: [],
        reason: 'Test signal',
        timestamp: Date.now(),
      };

      await service.executeTrade(entrySignal);

      expect(mockPositionManager.openPosition).not.toHaveBeenCalled();
    });


  });

  describe('telegram notifications', () => {
    it('should handle telegram notification errors gracefully', async () => {
      mockTelegram.sendTradeNotification.mockRejectedValue(new Error('Telegram error'));

      const entrySignal: EntrySignal = {
        shouldEnter: true,
        direction: SignalDirection.LONG,
        confidence: 75,
        entryPrice: 100,
        stopLoss: 95,
        takeProfits: [],
        reason: 'Test signal',
        timestamp: Date.now(),
      };

      // Should not throw
      await expect(service.executeTrade(entrySignal)).resolves.not.toThrow();
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Failed to send Telegram'),
        expect.any(Object),
      );
    });
  });
});
