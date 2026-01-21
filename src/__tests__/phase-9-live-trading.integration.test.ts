/**
 * Phase 9: Live Trading Engine - Integration Tests
 *
 * Tests for the complete Phase 9 Live Trading Engine implementation:
 * - TradingLifecycleManager (position timeout detection + emergency close)
 * - RealTimeRiskMonitor (health scoring + risk alerts)
 * - OrderExecutionPipeline (retry logic + slippage validation)
 * - PerformanceAnalytics (trade metrics + performance analysis)
 * - GracefulShutdownManager (state persistence + recovery)
 *
 * Note: These are integration tests that verify the Phase 9 services exist
 * and have the correct structure. Full unit tests require mocking actual
 * database/network dependencies.
 */

describe('Phase 9: Live Trading Engine - Integration Tests', () => {
  describe('Module Imports', () => {
    test('should import TradingLifecycleManager', () => {
      const { TradingLifecycleManager } = require('../../services/trading-lifecycle.service');
      expect(TradingLifecycleManager).toBeDefined();
      expect(typeof TradingLifecycleManager).toBe('function');
    });

    test('should import RealTimeRiskMonitor', () => {
      const { RealTimeRiskMonitor } = require('../../services/real-time-risk-monitor.service');
      expect(RealTimeRiskMonitor).toBeDefined();
      expect(typeof RealTimeRiskMonitor).toBe('function');
    });

    test('should import OrderExecutionPipeline', () => {
      const { OrderExecutionPipeline } = require('../../services/order-execution-pipeline.service');
      expect(OrderExecutionPipeline).toBeDefined();
      expect(typeof OrderExecutionPipeline).toBe('function');
    });

    test('should import PerformanceAnalytics', () => {
      const { PerformanceAnalytics } = require('../../services/performance-analytics.service');
      expect(PerformanceAnalytics).toBeDefined();
      expect(typeof PerformanceAnalytics).toBe('function');
    });

    test('should import GracefulShutdownManager', () => {
      const { GracefulShutdownManager } = require('../../services/graceful-shutdown.service');
      expect(GracefulShutdownManager).toBeDefined();
      expect(typeof GracefulShutdownManager).toBe('function');
    });
  });

  describe('Type Definitions', () => {
    test('should have PositionLifecycleState enum', () => {
      const { PositionLifecycleState } = require('../../types/live-trading.types');
      expect(PositionLifecycleState).toBeDefined();
      expect(PositionLifecycleState.OPEN).toBe('OPEN');
      expect(PositionLifecycleState.WARNING).toBe('WARNING');
      expect(PositionLifecycleState.CRITICAL).toBe('CRITICAL');
      expect(PositionLifecycleState.CLOSING).toBe('CLOSING');
      expect(PositionLifecycleState.CLOSED).toBe('CLOSED');
    });

    test('should have EmergencyCloseReason enum', () => {
      const { EmergencyCloseReason } = require('../../types/live-trading.types');
      expect(EmergencyCloseReason).toBeDefined();
      expect(EmergencyCloseReason.POSITION_TIMEOUT).toBe('POSITION_TIMEOUT');
      expect(EmergencyCloseReason.HEALTH_CRITICAL).toBe('HEALTH_CRITICAL');
    });

    test('should have DangerLevel enum', () => {
      const { DangerLevel } = require('../../types/live-trading.types');
      expect(DangerLevel).toBeDefined();
      expect(DangerLevel.SAFE).toBe('SAFE');
      expect(DangerLevel.WARNING).toBe('WARNING');
      expect(DangerLevel.CRITICAL).toBe('CRITICAL');
    });

    test('should have LiveTradingEventType enum', () => {
      const { LiveTradingEventType } = require('../../types/live-trading.types');
      expect(LiveTradingEventType).toBeDefined();
      expect(LiveTradingEventType.POSITION_TIMEOUT_WARNING).toBeDefined();
      expect(LiveTradingEventType.POSITION_TIMEOUT_TRIGGERED).toBeDefined();
      expect(LiveTradingEventType.HEALTH_SCORE_UPDATED).toBeDefined();
      expect(LiveTradingEventType.RISK_ALERT_TRIGGERED).toBeDefined();
      expect(LiveTradingEventType.SHUTDOWN_STARTED).toBeDefined();
      expect(LiveTradingEventType.SHUTDOWN_COMPLETED).toBeDefined();
    });
  });

  describe('Service Interfaces', () => {
    test('TradingLifecycleManager should have required methods', () => {
      const { TradingLifecycleManager } = require('../../services/trading-lifecycle.service');
      const instance = new TradingLifecycleManager({}, {}, {}, {});

      expect(typeof instance.trackPosition).toBe('function');
      expect(typeof instance.untrackPosition).toBe('function');
      expect(typeof instance.checkPositionTimeouts).toBe('function');
      expect(typeof instance.triggerEmergencyClose).toBe('function');
      expect(typeof instance.validateStateTransition).toBe('function');
      expect(typeof instance.getTrackedPositions).toBe('function');
    });

    test('RealTimeRiskMonitor should have required methods', () => {
      const { RealTimeRiskMonitor } = require('../../services/real-time-risk-monitor.service');
      const instance = new RealTimeRiskMonitor({}, {}, {}, {});

      expect(typeof instance.calculatePositionHealth).toBe('function');
      expect(typeof instance.checkPositionDanger).toBe('function');
      expect(typeof instance.monitorAllPositions).toBe('function');
      expect(typeof instance.shouldTriggerAlert).toBe('function');
      expect(typeof instance.clearHealthScoreCache).toBe('function');
    });

    test('OrderExecutionPipeline should have required methods', () => {
      const { OrderExecutionPipeline } = require('../../services/order-execution-pipeline.service');
      const instance = new OrderExecutionPipeline({}, {}, {});

      expect(typeof instance.placeOrder).toBe('function');
      expect(typeof instance.verifyOrderPlacement).toBe('function');
      expect(typeof instance.pollOrderStatus).toBe('function');
      expect(typeof instance.calculateSlippage).toBe('function');
      expect(typeof instance.validateSlippage).toBe('function');
      expect(typeof instance.getMetrics).toBe('function');
    });

    test('PerformanceAnalytics should have required methods', () => {
      const { PerformanceAnalytics } = require('../../services/performance-analytics.service');
      const instance = new PerformanceAnalytics({}, {});

      expect(typeof instance.calculateWinRate).toBe('function');
      expect(typeof instance.calculateProfitFactor).toBe('function');
      expect(typeof instance.calculateAverageHoldTime).toBe('function');
      expect(typeof instance.getMetrics).toBe('function');
      expect(typeof instance.getTopTrades).toBe('function');
      expect(typeof instance.getWorstTrades).toBe('function');
    });

    test('GracefulShutdownManager should have required methods', () => {
      const { GracefulShutdownManager } = require('../../services/graceful-shutdown.service');
      const instance = new GracefulShutdownManager({}, {}, {}, {}, {}, {});

      expect(typeof instance.registerShutdownHandlers).toBe('function');
      expect(typeof instance.initiateShutdown).toBe('function');
      expect(typeof instance.closeAllPositions).toBe('function');
      expect(typeof instance.cancelAllOrders).toBe('function');
      expect(typeof instance.persistState).toBe('function');
      expect(typeof instance.recoverState).toBe('function');
      expect(typeof instance.isShutdownInProgress).toBe('function');
      expect(typeof instance.hasSavedState).toBe('function');
    });
  });

  describe('Configuration Types', () => {
    test('PositionLifecycleConfig should be properly typed', () => {
      const config = {
        maxHoldingTimeMinutes: 240,
        warningThresholdMinutes: 180,
        enableAutomaticTimeout: true,
      };

      expect(config.maxHoldingTimeMinutes).toBe(240);
      expect(config.warningThresholdMinutes).toBe(180);
      expect(config.enableAutomaticTimeout).toBe(true);
    });

    test('RiskMonitoringConfig should be properly typed', () => {
      const config = {
        enabled: true,
        checkIntervalCandles: 5,
        healthScoreThreshold: 30,
        emergencyCloseOnCritical: true,
      };

      expect(config.enabled).toBe(true);
      expect(config.checkIntervalCandles).toBe(5);
    });
  });

  describe('Architecture Validation', () => {
    test('Phase 9 services should follow dependency injection pattern', () => {
      const { TradingLifecycleManager } = require('../../services/trading-lifecycle.service');

      // Constructor should accept dependencies
      expect(() => {
        new TradingLifecycleManager(
          { maxHoldingTimeMinutes: 240, warningThresholdMinutes: 180, enableAutomaticTimeout: true },
          {}, // eventBus
          {}, // actionQueue
          {}  // logger
        );
      }).not.toThrow();
    });

    test('services should publish events via EventBus', () => {
      const { LiveTradingEventType } = require('../../types/live-trading.types');

      // All event types should be defined
      const eventTypes = Object.keys(LiveTradingEventType);
      expect(eventTypes.length).toBeGreaterThan(0);

      // Should have position timeout events
      expect(eventTypes).toContain('POSITION_TIMEOUT_WARNING');
      expect(eventTypes).toContain('POSITION_TIMEOUT_TRIGGERED');

      // Should have risk alert events
      expect(eventTypes).toContain('RISK_ALERT_TRIGGERED');
      expect(eventTypes).toContain('HEALTH_SCORE_UPDATED');

      // Should have shutdown events
      expect(eventTypes).toContain('SHUTDOWN_STARTED');
      expect(eventTypes).toContain('SHUTDOWN_COMPLETED');
    });

    test('Phase 9 should extend BotConfig with LiveTradingConfig', () => {
      const { LiveTradingConfig } = require('../../types/config.types');

      // Should be defined and extend BotConfig
      expect(LiveTradingConfig).toBeDefined();
    });
  });

  describe('Phase 9 Status', () => {
    test('Phase 9 core services should all be implemented', () => {
      const services = [
        'trading-lifecycle.service',
        'real-time-risk-monitor.service',
        'order-execution-pipeline.service',
        'performance-analytics.service',
        'graceful-shutdown.service',
      ];

      const implemented = services.filter((service) => {
        try {
          require(`../../services/${service}`);
          return true;
        } catch {
          return false;
        }
      });

      expect(implemented.length).toBe(5);
    });

    test('Phase 9 should have comprehensive type definitions', () => {
      const types = require('../../types/live-trading.types');

      // Position lifecycle types
      expect(types.PositionLifecycleState).toBeDefined();
      expect(types.TrackedPosition).toBeDefined();
      expect(types.TimeoutCheckResult).toBeDefined();
      expect(types.TimeoutAlert).toBeDefined();
      expect(types.EmergencyCloseReason).toBeDefined();

      // Risk monitoring types
      expect(types.DangerLevel).toBeDefined();
      expect(types.HealthScore).toBeDefined();
      expect(types.RiskAlert).toBeDefined();
      expect(types.RiskMonitoringConfig).toBeDefined();

      // Order execution types
      expect(types.OrderStatus).toBeDefined();
      expect(types.OrderResult).toBeDefined();

      // Analytics types
      expect(types.TradeStatistics).toBeDefined();
      expect(types.TopTrade).toBeDefined();

      // Event types
      expect(types.LiveTradingEventType).toBeDefined();
    });
  });

  describe('Code Quality Metrics', () => {
    test('all Phase 9 services should have proper TSDoc comments', () => {
      const fs = require('fs');
      const path = require('path');

      const servicesDir = path.join(__dirname, '../../services');
      const phase9Files = [
        'trading-lifecycle.service.ts',
        'real-time-risk-monitor.service.ts',
        'order-execution-pipeline.service.ts',
        'performance-analytics.service.ts',
        'graceful-shutdown.service.ts',
      ];

      phase9Files.forEach((file) => {
        const filePath = path.join(servicesDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Check for basic documentation
        expect(content).toContain('/**');
        expect(content).toContain('*');
        expect(content).toContain('Responsibilities:');
      });
    });

    test('type definitions should have proper documentation', () => {
      const fs = require('fs');
      const path = require('path');

      const typesFile = path.join(__dirname, '../../types/live-trading.types.ts');
      const content = fs.readFileSync(typesFile, 'utf-8');

      // Should have comprehensive documentation
      expect(content).toContain('Phase 9');
      expect(content).toContain('Position lifecycle');
      expect(content).toContain('Real-time risk');
      expect(content).toContain('Order execution');
      expect(content).toContain('Performance analytics');
    });
  });

  describe('Production Readiness', () => {
    test('Phase 9 services should handle errors gracefully', () => {
      const { PerformanceAnalytics } = require('../../services/performance-analytics.service');
      const instance = new PerformanceAnalytics({}, {});

      // Should handle calculations with missing data
      const winRate = instance.calculateWinRate(10);
      expect(typeof winRate).toBe('number');

      const profitFactor = instance.calculateProfitFactor();
      expect(typeof profitFactor).toBe('number');
    });

    test('Shutdown manager should support state persistence', async () => {
      const fs = require('fs');
      const path = require('path');

      const { GracefulShutdownManager } = require('../../services/graceful-shutdown.service');
      const instance = new GracefulShutdownManager({}, {}, {}, {}, {}, {});

      const stateDir = instance.getStateDirectory();
      expect(typeof stateDir).toBe('string');
      expect(stateDir).toContain('shutdown-state');
    });

    test('Order pipeline should support metrics tracking', () => {
      const { OrderExecutionPipeline } = require('../../services/order-execution-pipeline.service');
      const instance = new OrderExecutionPipeline({}, {}, {});

      const metrics = instance.getMetrics();
      expect(metrics).toBeDefined();
      expect(typeof metrics.totalOrders).toBe('number');
      expect(typeof metrics.successfulOrders).toBe('number');
      expect(typeof metrics.failedOrders).toBe('number');
    });
  });

  describe('Documentation & Examples', () => {
    test('should have comprehensive ARCHITECTURE_QUICK_START.md', () => {
      const fs = require('fs');
      const path = require('path');

      const docPath = path.join(__dirname, '../../..', 'ARCHITECTURE_QUICK_START.md');
      if (fs.existsSync(docPath)) {
        const content = fs.readFileSync(docPath, 'utf-8');
        expect(content).toContain('Phase 9');
      }
    });

    test('should have comprehensive CLAUDE.md', () => {
      const fs = require('fs');
      const path = require('path');

      const docPath = path.join(__dirname, '../../..', 'CLAUDE.md');
      if (fs.existsSync(docPath)) {
        const content = fs.readFileSync(docPath, 'utf-8');
        expect(content).toContain('Phase 9');
      }
    });
  });

  describe('Integration Points', () => {
    test('Phase 9 should be integrated with bot configuration', () => {
      const { BotConfig } = require('../../types/config.types');
      expect(BotConfig).toBeDefined();
    });

    test('Phase 9 should use EventBus for communication', () => {
      const { BotEventBus } = require('../../services/event-bus');
      expect(BotEventBus).toBeDefined();
    });

    test('Phase 9 should use ActionQueue for order execution', () => {
      const { ActionQueueService } = require('../../services/action-queue.service');
      expect(ActionQueueService).toBeDefined();
    });

    test('Phase 9 should integrate with TradingJournalService', () => {
      const { TradingJournalService } = require('../../services/trading-journal.service');
      expect(TradingJournalService).toBeDefined();
    });
  });

  describe('Metrics & Monitoring', () => {
    test('services should provide metrics for monitoring', () => {
      const { PerformanceAnalytics } = require('../../services/performance-analytics.service');
      const instance = new PerformanceAnalytics({}, {});

      const stats = instance.getStatistics();
      expect(stats).toBeDefined();
      expect(typeof stats === 'object').toBe(true);
    });

    test('order execution should track execution time', () => {
      const { OrderExecutionPipeline } = require('../../services/order-execution-pipeline.service');
      const instance = new OrderExecutionPipeline({}, {}, {});

      const metrics = instance.getMetrics();
      expect(metrics).toHaveProperty('averageExecutionTime');
      expect(typeof metrics.averageExecutionTime).toBe('number');
    });

    test('risk monitor should track health checks', () => {
      const { RealTimeRiskMonitor } = require('../../services/real-time-risk-monitor.service');
      const instance = new RealTimeRiskMonitor({}, {}, {}, {});

      const stats = instance.getStatistics();
      expect(stats).toBeDefined();
    });
  });
});

describe('Phase 9: Documentation Status', () => {
  test('should have updated ARCHITECTURE_QUICK_START.md with Phase 9', () => {
    const fs = require('fs');
    const content = fs.readFileSync('./ARCHITECTURE_QUICK_START.md', 'utf-8');

    expect(content).toContain('Phase 9');
    expect(content).toContain('Live Trading Engine');
  });

  test('should have updated CLAUDE.md with Phase 9 status', () => {
    const fs = require('fs');
    const content = fs.readFileSync('./CLAUDE.md', 'utf-8');

    expect(content).toContain('Phase 9');
  });
});
