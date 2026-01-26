/**
 * BotFactory Unit Tests
 * Phase 5: Dependency Injection Enhancement
 *
 * Tests verify that BotFactory correctly manages service creation and DI
 */

import { BotFactory } from '../../services/bot-factory.service';
import { BotServices } from '../../services/bot-services';
import { Config } from '../../types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Get minimal config for testing
 */
function getMinimalConfig(): Config {
  return {
    exchange: {
      name: 'bybit',
      symbol: 'XRPUSDT',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      demo: true,
    },
    trading: { leverage: 10, marginType: 'CROSS' },
    riskManagement: {
      stopLossPercent: 2,
      takeProfits: [0.5, 1, 1.5],
      positionSizeUsdt: 100,
    },
    logging: { level: 'info', logDir: './logs' },
    telegram: { enabled: false },
    timeframes: {
      entry: { interval: '1', candleLimit: 1000, enabled: true },
      primary: { interval: '5', candleLimit: 500, enabled: true },
    },
    dataSubscriptions: { candles: { enabled: true } },
    system: { timeSyncIntervalMs: 60000, timeSyncMaxFailures: 3 },
    indicators: { rsiPeriod: 14, slowEmaPeriod: 50 },
  } as any;
}

describe('BotFactory - DI Container for BotServices', () => {
  let config: Config;

  beforeAll(() => {
    // Load real config if available
    // Try multiple locations: project root, src root
    let configPath = path.resolve(process.cwd(), 'config.json');
    if (!fs.existsSync(configPath)) {
      configPath = path.resolve(__dirname, '../../config.json');
    }
    if (!fs.existsSync(configPath)) {
      configPath = path.resolve(__dirname, '../../../config.json');
    }

    if (fs.existsSync(configPath)) {
      try {
        const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        config = rawConfig as Config;
      } catch (e) {
        // Use minimal config if parse fails
        console.warn('Failed to parse config.json, using minimal config');
        config = getMinimalConfig();
      }
    } else {
      // Use minimal config
      console.warn('config.json not found, using minimal config');
      config = getMinimalConfig();
    }
  });

  describe('Basic Factory Operations', () => {
    test('T1: Should create BotServices instance', () => {
      const services = BotFactory.create(config);
      expect(services).toBeInstanceOf(BotServices);
    });

    test('T2: Should create multiple independent instances', () => {
      const services1 = BotFactory.create(config);
      const services2 = BotFactory.create(config);

      expect(services1).not.toBe(services2);
      expect(services1.logger).not.toBe(services2.logger);
    });

    test('T3: Should initialize all required services', () => {
      const services = BotFactory.create(config);

      expect(services.logger).toBeDefined();
      expect(services.eventBus).toBeDefined();
      expect(services.bybitService).toBeDefined();
      expect(services.journal).toBeDefined();
      expect(services.positionManager).toBeDefined();
    });

    test('T4: Should have proper service type structure', () => {
      const services = BotFactory.create(config);

      // Check function types
      expect(typeof services.logger.info).toBe('function');
      expect(typeof services.positionManager.getCurrentPosition).toBe('function');
      expect(typeof services.positionExitingService.executeExitAction).toBe('function');
    });
  });

  describe('Dependency Injection - Service Override', () => {
    const mockExchange = {
      name: 'MockExchange',
      isConnected: jest.fn(() => true),
      healthCheck: jest.fn(async () => true),
    };

    const mockTelegram = {
      notifyBotStarted: jest.fn(),
      sendAlert: jest.fn(),
    };

    test('T5: Should allow exchange service override', () => {
      const services = BotFactory.create(config, {
        bybitService: mockExchange as any,
      });

      expect(services.bybitService).toBe(mockExchange);
      expect(services.bybitService.isConnected()).toBe(true);
    });

    test('T6: Should allow telegram service override', () => {
      const services = BotFactory.create(config, {
        telegram: mockTelegram as any,
      });

      expect(services.telegram).toBe(mockTelegram);
      expect(services.telegram.sendAlert).toBeDefined();
    });

    test('T7: Should allow multiple service overrides', () => {
      const services = BotFactory.create(config, {
        bybitService: mockExchange as any,
        telegram: mockTelegram as any,
      });

      expect(services.bybitService).toBe(mockExchange);
      expect(services.telegram).toBe(mockTelegram);
    });

    test('T8: Override should not affect other instances', () => {
      const services1 = BotFactory.create(config, {
        telegram: mockTelegram as any,
      });

      const services2 = BotFactory.create(config, {});

      expect(services1.telegram).toBe(mockTelegram);
      expect(services2.telegram).not.toBe(mockTelegram);
    });
  });

  describe('Factory Helper Methods', () => {
    test('T9: createForTesting should work like create', () => {
      const mockExchange = {
        name: 'TestExchange',
        isConnected: jest.fn(() => true),
      };

      const services = BotFactory.createForTesting(config, {
        bybitService: mockExchange as any,
      });

      expect(services).toBeInstanceOf(BotServices);
      expect(services.bybitService).toBe(mockExchange);
    });

    test('T10: createForTesting with empty options creates normal services', () => {
      const services = BotFactory.createForTesting(config);

      expect(services).toBeInstanceOf(BotServices);
      expect(services.logger).toBeDefined();
    });
  });

  describe('DI Container Benefits', () => {
    test('T11: Enables service mocking for unit tests', () => {
      const mockExchange = {
        name: 'MockExchange',
        openPosition: jest.fn(async () => ({
          id: 'test-pos-123',
          symbol: 'XRPUSDT',
          side: 'LONG' as any,
          quantity: 100,
          entryPrice: 0.5,
          leverage: 10,
          stopLoss: 0.49,
          unrealizedPnL: 5,
          unrealizedPnLPercent: 1.0,
        })),
      };

      const services = BotFactory.create(config, {
        bybitService: mockExchange as any,
      });

      expect(services.bybitService.openPosition).toBeDefined();
    });

    test('T12: Supports service swappability', () => {
      const exchangeA = { name: 'BybitMock', isConnected: jest.fn(() => true) };
      const exchangeB = { name: 'BinanceMock', isConnected: jest.fn(() => true) };

      const servicesA = BotFactory.create(config, {
        bybitService: exchangeA as any,
      });

      const servicesB = BotFactory.create(config, {
        bybitService: exchangeB as any,
      });

      expect(servicesA.bybitService.name).toBe('BybitMock');
      expect(servicesB.bybitService.name).toBe('BinanceMock');
    });

    test('T13: Maintains service independence', () => {
      const mockExchange1 = { name: 'Exchange1' };
      const mockExchange2 = { name: 'Exchange2' };

      const services1 = BotFactory.create(config, {
        bybitService: mockExchange1 as any,
      });

      const services2 = BotFactory.create(config, {
        bybitService: mockExchange2 as any,
      });

      expect((services1.bybitService as any).name).toBe('Exchange1');
      expect((services2.bybitService as any).name).toBe('Exchange2');
    });
  });

  describe('Error Handling', () => {
    test('T14: Should handle empty override options', () => {
      expect(() => {
        BotFactory.create(config, {});
      }).not.toThrow();
    });

    test('T15: Should handle undefined overrides', () => {
      expect(() => {
        BotFactory.create(config, undefined);
      }).not.toThrow();
    });

    test('T16: Should create valid services with partial overrides', () => {
      const mockExchange = { name: 'MockExchange' };

      const services = BotFactory.create(config, {
        bybitService: mockExchange as any,
      });

      expect(services).toBeDefined();
      expect(services.positionManager).toBeDefined();
      expect(services.journal).toBeDefined();
    });
  });
});
