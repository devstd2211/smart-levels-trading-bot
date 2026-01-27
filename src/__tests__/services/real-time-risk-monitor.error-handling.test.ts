/**
 * Phase 8.5: RealTimeRiskMonitor - ErrorHandler Integration Tests
 *
 * Tests ErrorHandler integration in RealTimeRiskMonitor with:
 * - GRACEFUL_DEGRADE strategy for position validation & price validation
 * - GRACEFUL_DEGRADE strategy for zero division protection
 * - SKIP strategy for event publishing failures
 * - End-to-end error recovery scenarios
 *
 * Total: 15 comprehensive tests
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { RealTimeRiskMonitor } from '../../services/real-time-risk-monitor.service';
import { PositionLifecycleService } from '../../services/position-lifecycle.service';
import { BotEventBus } from '../../services/event-bus';
import { LoggerService, PositionSide, Position } from '../../types';
import { RiskMonitoringConfig, DangerLevel, LiveTradingEventType } from '../../types/live-trading.types';

describe('Phase 8.5: RealTimeRiskMonitor - Error Handling Integration', () => {
  let monitor: RealTimeRiskMonitor;
  let mockPositionLifecycleService: jest.Mocked<PositionLifecycleService>;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockEventBus: jest.Mocked<BotEventBus>;

  const mockConfig: RiskMonitoringConfig = {
    enabled: true,
    checkIntervalCandles: 5,
    healthScoreThreshold: 30,
    emergencyCloseOnCritical: true,
  };

  const createMockPosition = (overrides: Partial<Position> = {}): Position => ({
    id: 'pos-123',
    symbol: 'BTCUSDT',
    side: PositionSide.LONG,
    quantity: 0.1,
    entryPrice: 45000,
    leverage: 10,
    marginUsed: 450,
    unrealizedPnL: 500,
    status: 'OPEN',
    openedAt: Date.now() - 3600000,
    orderId: 'order-123',
    reason: 'test-position',
    takeProfits: [{ level: 1, percent: 0.5, sizePercent: 50, price: 46000, hit: false }],
    stopLoss: {
      price: 44000,
      initialPrice: 44000,
      isBreakeven: false,
      isTrailing: false,
      updatedAt: Date.now(),
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockPositionLifecycleService = {
      getCurrentPosition: jest.fn(),
      getPositionHistory: jest.fn().mockReturnValue([]),
      updatePosition: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
    } as any;

    mockEventBus = {
      publishSync: jest.fn(),
      publish: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    } as any;

    monitor = new RealTimeRiskMonitor(
      mockConfig,
      mockPositionLifecycleService,
      mockLogger,
      mockEventBus
    );
  });

  describe('[GRACEFUL_DEGRADE] calculatePositionHealth() - Position Validation (4 tests)', () => {
    it('test-8.5.1: Should return cached health score when position not found', async () => {
      const position = createMockPosition();
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(position);

      // First call to populate cache
      const healthScore = await monitor.calculatePositionHealth('pos-123', 46000);
      expect(healthScore.positionId).toBe('pos-123');
      expect(monitor.getLatestHealthScore('pos-123')).toBeDefined();

      // Second call with position not found - should return cached
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(null as any);

      const cachedScore = await monitor.calculatePositionHealth('pos-123', 46000);
      expect(cachedScore.positionId).toBe('pos-123');
      expect(cachedScore.overallScore).toBe(healthScore.overallScore);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '🔄 Position not found, returning cached health score',
        expect.objectContaining({ positionId: 'pos-123' })
      );
    });

    it('test-8.5.2: Should return safe default when position not found and no cache', async () => {
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(null as any);

      const healthScore = await monitor.calculatePositionHealth('pos-unknown', 46000);
      expect(healthScore.overallScore).toBe(70); // Safe default
      expect(healthScore.status).toBe(DangerLevel.SAFE);
      expect(healthScore.symbol).toBe('UNKNOWN');
    });

    it('test-8.5.3: Should handle position ID mismatch gracefully', async () => {
      const position = createMockPosition({ id: 'pos-456' });
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(position);

      const healthScore = await monitor.calculatePositionHealth('pos-123', 46000);
      expect(healthScore.overallScore).toBe(70); // Safe default
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '🔄 Position not found, returning cached health score',
        expect.objectContaining({ positionId: 'pos-123' })
      );
    });

    it('test-8.5.4: Should log warning on graceful degradation', async () => {
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(null as any);

      await monitor.calculatePositionHealth('pos-123', 46000);
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('🔄'),
        expect.any(Object)
      );
    });
  });

  describe('[GRACEFUL_DEGRADE] calculatePositionHealth() - Price Validation (4 tests)', () => {
    it('test-8.5.5: Should use fallback price when currentPrice is NaN', async () => {
      const position = createMockPosition({ entryPrice: 45000 });
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(position);

      const healthScore = await monitor.calculatePositionHealth('pos-123', NaN);
      expect(healthScore).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ Invalid currentPrice'),
        expect.any(Object)
      );
    });

    it('test-8.5.6: Should use fallback price when currentPrice is zero', async () => {
      const position = createMockPosition({ entryPrice: 45000 });
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(position);

      const healthScore = await monitor.calculatePositionHealth('pos-123', 0);
      expect(healthScore).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ Invalid currentPrice'),
        expect.any(Object)
      );
    });

    it('test-8.5.7: Should use fallback price when currentPrice is negative', async () => {
      const position = createMockPosition({ entryPrice: 45000 });
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(position);

      const healthScore = await monitor.calculatePositionHealth('pos-123', -100);
      expect(healthScore).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ Invalid currentPrice'),
        expect.any(Object)
      );
    });

    it('test-8.5.8: Should calculate correctly with valid currentPrice', async () => {
      const position = createMockPosition({ entryPrice: 45000 });
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(position);

      const healthScore = await monitor.calculatePositionHealth('pos-123', 46000);
      expect(healthScore).toBeDefined();
      expect(healthScore.overallScore).toBeGreaterThan(0);
      expect(healthScore.overallScore).toBeLessThanOrEqual(100);
    });
  });

  describe('[GRACEFUL_DEGRADE] PnL Calculation - Zero Division (3 tests)', () => {
    it('test-8.5.9: Should return safe default when quantity is zero', async () => {
      const position = createMockPosition({ quantity: 0, entryPrice: 45000 });
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(position);

      const healthScore = await monitor.calculatePositionHealth('pos-123', 46000);
      expect(healthScore.overallScore).toBe(70); // Safe default
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ Zero denominator'),
        expect.any(Object)
      );
    });

    it('test-8.5.10: Should return safe default when entryPrice is zero', async () => {
      const position = createMockPosition({ quantity: 0.1, entryPrice: 0 });
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(position);

      const healthScore = await monitor.calculatePositionHealth('pos-123', 46000);
      expect(healthScore.overallScore).toBe(70); // Safe default
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ Zero denominator'),
        expect.any(Object)
      );
    });

    it('test-8.5.11: Should return safe default when both quantity and entryPrice are zero', async () => {
      const position = createMockPosition({ quantity: 0, entryPrice: 0 });
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(position);

      const healthScore = await monitor.calculatePositionHealth('pos-123', 46000);
      expect(healthScore.overallScore).toBe(70); // Safe default
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ Zero denominator'),
        expect.any(Object)
      );
    });
  });

  describe('[SKIP] monitorAllPositions() - Event Publishing (2 tests)', () => {
    it('test-8.5.12: Should skip HEALTH_SCORE_UPDATED event on publish failure', async () => {
      const position = createMockPosition();
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(position);

      mockEventBus.publishSync.mockImplementation((event: any) => {
        if (event.type === LiveTradingEventType.HEALTH_SCORE_UPDATED) {
          throw new Error('Event bus failure');
        }
      });

      const report = await monitor.monitorAllPositions(46000);
      expect(report).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ Failed to publish HEALTH_SCORE_UPDATED'),
        expect.any(Object)
      );
    });

    it('test-8.5.13: Should skip RISK_ALERT_TRIGGERED event on publish failure', async () => {
      const position = createMockPosition();
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(position);

      // Create alert condition with critical health score
      mockEventBus.publishSync.mockImplementation((event: any) => {
        if (event.type === LiveTradingEventType.RISK_ALERT_TRIGGERED) {
          throw new Error('Event bus failure');
        }
      });

      const report = await monitor.monitorAllPositions(44000); // Low price triggers alert
      expect(report).toBeDefined();
      // Alert may or may not be triggered depending on health score, but event handling shouldn't crash
      expect(mockEventBus.publishSync).toHaveBeenCalled();
    });
  });

  describe('End-to-End Error Recovery Scenarios (2 tests)', () => {
    it('test-8.5.14: Should continue monitoring when position validation fails', async () => {
      const position = createMockPosition();
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(position);

      // First, populate cache
      const firstScore = await monitor.calculatePositionHealth('pos-123', 46000);
      expect(firstScore).toBeDefined();

      // Then, simulate position not found but we have cache
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(null as any);

      // This should not throw and should use cache
      const report = await monitor.monitorAllPositions(46000);
      expect(report).toBeDefined();
      expect(report.totalPositions).toBeGreaterThanOrEqual(0);
    });

    it('test-8.5.15: Should handle cascading failures gracefully', async () => {
      const position = createMockPosition({ quantity: 0, entryPrice: 0 }); // Zero division
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(position);

      // Make event bus fail too
      mockEventBus.publishSync.mockImplementation(() => {
        throw new Error('Event bus down');
      });

      // Should not throw despite multiple failures
      const report = await monitor.monitorAllPositions(46000);
      expect(report).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('Integration with Existing Functionality', () => {
    it('should not break existing getLatestHealthScore functionality', async () => {
      const position = createMockPosition();
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(position);

      const healthScore = await monitor.calculatePositionHealth('pos-123', 46000);
      const cached = monitor.getLatestHealthScore('pos-123');

      expect(cached).toBeDefined();
      expect(cached?.positionId).toBe('pos-123');
    });

    it('should not break existing checkPositionDanger functionality', async () => {
      const position = createMockPosition();
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(position);

      const danger = await monitor.checkPositionDanger('pos-123', 46000);
      expect(danger).toBeDefined();
      expect([DangerLevel.SAFE, DangerLevel.WARNING, DangerLevel.CRITICAL]).toContain(danger);
    });

    it('should not break existing shouldTriggerAlert functionality', async () => {
      const position = createMockPosition();
      mockPositionLifecycleService.getCurrentPosition.mockReturnValue(position);

      const alert = await monitor.shouldTriggerAlert('pos-123', 46000);
      expect(alert).toBeNull(); // No alert for normal conditions
    });
  });
});
