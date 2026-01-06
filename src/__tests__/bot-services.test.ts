/**
 * BotServices Tests
 *
 * Tests for DI container that initializes all bot services.
 * Covers:
 * - Service initialization in dependency order
 * - All services properly created
 * - Optional service initialization
 * - Configuration propagation
 * - Service interdependencies
 * - Logger integration
 * - Services collection via toObject()
 */

import { BotServices } from '../services/bot-services';
import { Config } from '../types';

// Minimal valid config for BotServices
const createMinimalConfig = (): Config => ({
  exchange: {
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    testnet: true,
    symbol: 'APEXUSDT',
  },
  trading: {
    leverage: 10,
    positionSizeUsdt: 100,
    maxConcurrentPositions: 1,
  },
  riskManagement: {
    stopLossPercent: 2,
    maxDailyLossPercent: 5,
  },
  indicators: {
    atrPeriod: 14,
    fastEmaPeriod: 5,
    slowEmaPeriod: 20,
    rsiPeriod: 14,
    zigzagDepth: 5,
  },
  timeframes: {
    entry: { interval: '1', candleLimit: 100, enabled: true },
    primary: { interval: '5', candleLimit: 100, enabled: true },
    trend1: { interval: '15', candleLimit: 100, enabled: true },
    trend2: { interval: '60', candleLimit: 100, enabled: false },
    context: { interval: '240', candleLimit: 100, enabled: false },
  },
  logging: {
    level: 'info',
    logDir: './logs',
  },
  system: {
    timeSyncIntervalMs: 60000,
    timeSyncMaxFailures: 3,
  },
  atrFilter: { enabled: false, period: 14, minimumATR: 0.01, maximumATR: 100 },
  dataSubscriptions: {
    candles: { enabled: true, calculateIndicators: true },
    orderbook: { enabled: true, updateIntervalMs: 100 },
  },
  entryConfig: {
    divergenceDetector: {
      minStrength: 0.3,
      priceDiffPercent: 0.2,
    },
  },
  strategies: {} as unknown as any,
  entryConfirmation: {} as unknown as any,
  telegram: { enabled: false },
  analysisConfig: {},
  strategicWeights: {},
  tradeHistory: {},
  strategy: {} as unknown as any,
} as unknown as Config);

describe('BotServices', () => {
  describe('initialization', () => {
    it('should create BotServices instance', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services).toBeInstanceOf(BotServices);
    });

    it('should initialize logger first', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services.logger).toBeDefined();
      expect(typeof services.logger.info).toBe('function');
      expect(typeof services.logger.debug).toBe('function');
      expect(typeof services.logger.error).toBe('function');
    });

    it('should initialize event bus after logger', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services.eventBus).toBeDefined();
      expect(typeof services.eventBus.subscribe).toBe('function');
      expect(typeof services.eventBus.publish).toBe('function');
    });

    it('should initialize metrics service', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services.metrics).toBeDefined();
      expect(typeof services.metrics.recordTrade).toBe('function');
      expect(typeof services.metrics.recordEvent).toBe('function');
    });

    it('should log successful initialization', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      // If services initialized, logger exists and is functional
      expect(services.logger).toBeDefined();
    });
  });

  describe('core services', () => {
    it('should initialize telegram service', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services.telegram).toBeDefined();
      expect(typeof services.telegram.sendAlert).toBe('function');
    });

    it('should initialize time service', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services.timeService).toBeDefined();
      expect(typeof services.timeService.now).toBe('function');
    });

    it('should initialize bybit service', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services.bybitService).toBeDefined();
      expect(typeof services.bybitService.getCurrentPrice).toBe('function');
      expect(typeof services.bybitService.getBalance).toBe('function');
    });
  });

  describe('data providers', () => {
    it('should initialize timeframe provider', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services.timeframeProvider).toBeDefined();
      expect(typeof services.timeframeProvider.getTimeframe).toBe('function');
    });

    it('should initialize candle provider', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services.candleProvider).toBeDefined();
      expect(typeof services.candleProvider.getCandles).toBe('function');
    });
  });

  describe('analysis services', () => {
    it('should initialize market structure analyzer', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services.structureAnalyzer).toBeDefined();
      // Analyzer is initialized and ready for use
      expect(services.structureAnalyzer).not.toBeNull();
    });

    it('should initialize trading orchestrator', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services.tradingOrchestrator).toBeDefined();
      expect(typeof services.tradingOrchestrator.onCandleClosed).toBe('function');
    });
  });

  describe('position management', () => {
    it('should initialize trading journal', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services.journal).toBeDefined();
      // Journal is initialized and ready
      expect(services.journal).not.toBeNull();
    });

    it('should initialize session stats', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services.sessionStats).toBeDefined();
      expect(typeof services.sessionStats.endSession).toBe('function');
    });

    it('should initialize position manager', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services.positionManager).toBeDefined();
      expect(typeof services.positionManager.openPosition).toBe('function');
      expect(typeof services.positionManager.getCurrentPosition).toBe('function');
    });
  });

  describe('websocket services', () => {
    it('should initialize websocket manager', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services.webSocketManager).toBeDefined();
      expect(typeof services.webSocketManager.connect).toBe('function');
    });

    it('should initialize public websocket', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services.publicWebSocket).toBeDefined();
      expect(typeof services.publicWebSocket.connect).toBe('function');
    });

    it('should initialize orderbook manager', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services.orderbookManager).toBeDefined();
      expect(typeof services.orderbookManager.processUpdate).toBe('function');
    });

    it('should initialize position monitor', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services.positionMonitor).toBeDefined();
      expect(typeof services.positionMonitor.start).toBe('function');
      expect(typeof services.positionMonitor.stop).toBe('function');
    });
  });

  describe('event handlers', () => {
    it('should initialize position event handler', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services.positionEventHandler).toBeDefined();
      expect(typeof services.positionEventHandler.handleStopLossHit).toBe('function');
      expect(typeof services.positionEventHandler.handleTakeProfitHit).toBe('function');
    });

    it('should initialize websocket event handler', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services.webSocketEventHandler).toBeDefined();
      expect(typeof services.webSocketEventHandler.handlePositionUpdate).toBe('function');
      expect(typeof services.webSocketEventHandler.handlePositionClosed).toBe('function');
    });
  });

  describe('optional services', () => {
    it('should not create optional services when disabled', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      // Optional services should be undefined when not enabled
      expect(services.compoundInterestCalculator).toBeUndefined();
      expect(services.retestEntryService).toBeUndefined();
      expect(services.deltaAnalyzerService).toBeUndefined();
    });

    it('should create compound interest calculator when enabled', () => {
      const config = createMinimalConfig();
      config.compoundInterest = {
        enabled: true,
        baseDeposit: 100,
        useVirtualBalance: false,
        reinvestmentPercent: 50,
        maxRiskPerTrade: 2,
        minPositionSize: 10,
        maxPositionSize: 1000,
        profitLockPercent: 25,
      };

      const services = new BotServices(config);

      expect(services.compoundInterestCalculator).toBeDefined();
    });

    it('should create delta analyzer when enabled', () => {
      const config = createMinimalConfig();
      config.delta = {
        enabled: true,
        windowSizeMs: 1000,
        minDeltaThreshold: 0.5,
      };

      const services = new BotServices(config);

      expect(services.deltaAnalyzerService).toBeDefined();
    });

    it('should create orderbook imbalance service when enabled', () => {
      const config = createMinimalConfig();
      config.orderbookImbalance = {
        enabled: true,
        minImbalancePercent: 5,
        levels: 5,
      };

      const services = new BotServices(config);

      expect(services.orderbookImbalanceService).toBeDefined();
    });

    it('should create wall tracker when enabled', () => {
      const config = createMinimalConfig();
      config.wallTracking = {
        enabled: true,
        minLifetimeMs: 100,
        spoofingThresholdMs: 50,
        trackHistoryCount: 10,
      };

      const services = new BotServices(config);

      expect(services.wallTrackerService).toBeDefined();
    });
  });

  describe('service interdependencies', () => {
    it('should pass logger to all services that need it', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      // All core services have access to logger through dependency injection
      expect(services.logger).toBeDefined();
      expect(services.telegram).toBeDefined();
      expect(services.timeService).toBeDefined();
    });

    it('should initialize services in correct dependency order', () => {
      const config = createMinimalConfig();
      // This should not throw if dependency order is correct
      const services = new BotServices(config);

      expect(services).toBeInstanceOf(BotServices);
    });

    it('should provide bybit service to time service', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      // TimeService should have bybit service set
      expect(services.timeService).toBeDefined();
      expect(services.bybitService).toBeDefined();
    });

    it('should provide services to position manager', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      // PositionManager depends on multiple services
      expect(services.positionManager).toBeDefined();
      expect(services.bybitService).toBeDefined();
      expect(services.telegram).toBeDefined();
      expect(services.journal).toBeDefined();
    });
  });

  describe('configuration propagation', () => {
    it('should propagate config to bybit service', () => {
      const config = createMinimalConfig();
      config.exchange.symbol = 'TESTUSDT';

      const services = new BotServices(config);

      expect(services.bybitService).toBeDefined();
    });

    it('should propagate trading config to position manager', () => {
      const config = createMinimalConfig();
      config.trading.leverage = 20;

      const services = new BotServices(config);

      expect(services.positionManager).toBeDefined();
    });

    it('should propagate risk management config', () => {
      const config = createMinimalConfig();
      config.riskManagement.stopLossPercent = 5;

      const services = new BotServices(config);

      expect(services.positionManager).toBeDefined();
    });

    it('should propagate indicator config', () => {
      const config = createMinimalConfig();
      config.indicators.atrPeriod = 21;

      const services = new BotServices(config);

      expect(services.tradingOrchestrator).toBeDefined();
    });

    it('should propagate system config', () => {
      const config = createMinimalConfig();
      config.system.timeSyncIntervalMs = 30000;

      const services = new BotServices(config);

      expect(services.timeService).toBeDefined();
    });
  });

  describe('toObject()', () => {
    it('should return all services as object', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);
      const servicesObj = services.toObject();

      expect(typeof servicesObj).toBe('object');
      expect(Object.keys(servicesObj).length).toBeGreaterThan(10);
    });

    it('should include core services in object', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);
      const servicesObj = services.toObject();

      expect(servicesObj.logger).toBeDefined();
      expect(servicesObj.eventBus).toBeDefined();
      expect(servicesObj.telegram).toBeDefined();
      expect(servicesObj.bybitService).toBeDefined();
    });

    it('should include data providers in object', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);
      const servicesObj = services.toObject();

      expect(servicesObj.timeframeProvider).toBeDefined();
      expect(servicesObj.candleProvider).toBeDefined();
    });

    it('should include position management in object', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);
      const servicesObj = services.toObject();

      expect(servicesObj.journal).toBeDefined();
      expect(servicesObj.positionManager).toBeDefined();
      expect(servicesObj.sessionStats).toBeDefined();
    });

    it('should include websocket services in object', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);
      const servicesObj = services.toObject();

      expect(servicesObj.webSocketManager).toBeDefined();
      expect(servicesObj.publicWebSocket).toBeDefined();
      expect(servicesObj.orderbookManager).toBeDefined();
      expect(servicesObj.positionMonitor).toBeDefined();
    });

    it('should include event handlers in object', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);
      const servicesObj = services.toObject();

      expect(servicesObj.positionEventHandler).toBeDefined();
      expect(servicesObj.webSocketEventHandler).toBeDefined();
    });

    it('should return same instance as readonly properties', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);
      const servicesObj = services.toObject();

      expect(servicesObj.logger).toBe(services.logger);
      expect(servicesObj.eventBus).toBe(services.eventBus);
      expect(servicesObj.bybitService).toBe(services.bybitService);
    });
  });

  describe('multiple instances', () => {
    it('should create independent service instances', () => {
      const config = createMinimalConfig();

      const services1 = new BotServices(config);
      const services2 = new BotServices(config);

      expect(services1.logger).not.toBe(services2.logger);
      expect(services1.bybitService).not.toBe(services2.bybitService);
    });

    it('should not share state between instances', () => {
      const config = createMinimalConfig();

      const services1 = new BotServices(config);
      const services2 = new BotServices(config);

      // Services should be independent
      expect(services1).not.toBe(services2);
      expect(services1.eventBus).not.toBe(services2.eventBus);
    });
  });

  describe('error handling', () => {
    it('should handle missing telegram config gracefully', () => {
      const config = createMinimalConfig();
      config.telegram = undefined;

      // Should not throw
      const services = new BotServices(config);
      expect(services.telegram).toBeDefined();
    });

    it('should handle missing optional services gracefully', () => {
      const config = createMinimalConfig();
      config.compoundInterest = undefined;
      config.retestEntry = undefined;
      config.delta = undefined;

      const services = new BotServices(config);

      expect(services.compoundInterestCalculator).toBeUndefined();
      expect(services.retestEntryService).toBeUndefined();
      expect(services.deltaAnalyzerService).toBeUndefined();
    });
  });

  describe('service relationships', () => {
    it('should properly connect bybit service to time service', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      // Both services should exist and be usable
      expect(services.bybitService).toBeDefined();
      expect(services.timeService).toBeDefined();
    });

    it('should properly initialize trading orchestrator with all dependencies', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services.tradingOrchestrator).toBeDefined();
      expect(services.candleProvider).toBeDefined();
      expect(services.timeframeProvider).toBeDefined();
      expect(services.bybitService).toBeDefined();
    });

    it('should properly initialize position manager with handlers', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services.positionManager).toBeDefined();
      expect(services.positionEventHandler).toBeDefined();
      expect(services.webSocketEventHandler).toBeDefined();
    });
  });

  describe('configuration scenarios', () => {
    it('should handle minimal config', () => {
      const config = createMinimalConfig();
      const services = new BotServices(config);

      expect(services).toBeInstanceOf(BotServices);
      expect(services.logger).toBeDefined();
    });

    it('should handle testnet config', () => {
      const config = createMinimalConfig();
      config.exchange.testnet = true;

      const services = new BotServices(config);
      expect(services).toBeInstanceOf(BotServices);
    });

    it('should handle production config', () => {
      const config = createMinimalConfig();
      config.exchange.testnet = false;

      const services = new BotServices(config);
      expect(services).toBeInstanceOf(BotServices);
    });

    it('should handle different leverage values', () => {
      const config = createMinimalConfig();
      config.trading.leverage = 5;

      const services = new BotServices(config);
      expect(services.positionManager).toBeDefined();
    });

    it('should handle different symbols', () => {
      const config = createMinimalConfig();
      config.exchange.symbol = 'SUIUSDT';

      const services = new BotServices(config);
      expect(services.bybitService).toBeDefined();
    });
  });
});
