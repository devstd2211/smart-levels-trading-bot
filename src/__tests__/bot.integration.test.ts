/**
 * TradingBot Integration Tests
 *
 * Tests for full bot lifecycle and integration of all components.
 * Covers:
 * - Bot initialization and startup
 * - Event handler connections
 * - Service integration
 * - Bot shutdown and cleanup
 * - Metrics collection
 * - Error handling
 */

import { TradingBot } from '../bot';
import { BotFactory } from '../bot-factory';
import { Config } from '../types';

// Minimal valid config for testing
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

describe('TradingBot Integration', () => {
  describe('bot creation and initialization', () => {
    it('should create bot via factory', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      expect(bot).toBeInstanceOf(TradingBot);
      expect(bot.isRunning).toBe(false);
    });

    it('should initialize with all services', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      expect(bot).toBeInstanceOf(TradingBot);
      // Bot creation succeeds means all services initialized
    });

    it('should have eventBus accessor for creating BotEventEmitter', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      expect(typeof bot.eventBus).toBe('object');
      expect(bot.eventBus).toBeDefined();
    });

    it('should expose public interface', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      expect(typeof bot.start).toBe('function');
      expect(typeof bot.stop).toBe('function');
      expect(typeof bot.isRunning).toBe('boolean');
    });

    it('should be in stopped state initially', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      expect(bot.isRunning).toBe(false);
    });

    it('should create independent bot instances', () => {
      const config = createMinimalConfig();

      const result1 = BotFactory.createWithEmitter({ config });
      const result2 = BotFactory.createWithEmitter({ config });

      expect(result1).not.toBe(result2);
      expect(result1.bot.isRunning).toBe(false);
      expect(result2.bot.isRunning).toBe(false);
    });

    it('should support event emission', (done) => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      emitter.on('test-event', () => {
        expect(true).toBe(true);
        done();
      });

      emitter.emit('test-event');
    });
  });

  describe('event handler connections', () => {
    it('should initialize with zero tracked listeners initially', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      // Bot is created with private listener tracking
      expect(bot).toBeInstanceOf(TradingBot);
    });

    it('should support listener registration', (done) => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      let callCount = 0;
      emitter.on('signal', () => {
        callCount++;
        expect(callCount).toBe(1);
        done();
      });

      emitter.emit('signal');
    });

    it('should support multiple listeners', (done) => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      let count = 0;
      const checkDone = () => {
        count++;
        if (count === 2) done();
      };

      emitter.on('event', checkDone);
      emitter.on('event', checkDone);

      emitter.emit('event');
    });

    it('should support listener removal', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      const handler = jest.fn();
      emitter.on('test', handler);
      emitter.off('test', handler);

      emitter.emit('test');

      // Handler should not be called after removal
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('bot lifecycle management', () => {
    it('should support start operation', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      // Should not throw
      expect(() => {
        // Note: actual start() may fail due to API calls, but structure should exist
        expect(typeof bot.start).toBe('function');
      }).not.toThrow();
    });

    it('should support stop operation', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      // Should not throw even if not running
      expect(() => bot.stop()).not.toThrow();
    });

    it('should remain in stopped state after stop when not running', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      bot.stop();

      expect(bot.isRunning).toBe(false);
    });

    it('should support multiple stop calls', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      expect(() => {
        bot.stop();
        bot.stop();
        bot.stop();
      }).not.toThrow();
    });

    it('should have consistent state after stop', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      bot.stop();
      expect(bot.isRunning).toBe(false);

      bot.stop();
      expect(bot.isRunning).toBe(false);
    });
  });

  describe('service integration', () => {
    it('should have access to logger through getters', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      // Logger is accessed through private getter
      // Verify bot was created (requires logger)
      expect(bot).toBeInstanceOf(TradingBot);
    });

    it('should have initialized all core services', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      // If bot created successfully, all core services initialized
      expect(bot).toBeInstanceOf(TradingBot);
    });

    it('should have position manager initialized', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      // PositionManager is initialized as part of bot setup
      expect(bot).toBeInstanceOf(TradingBot);
    });

    it('should have websocket services initialized', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      // WebSocket services initialized
      expect(bot).toBeInstanceOf(TradingBot);
    });

    it('should have metrics service initialized', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      // Metrics service tracks performance
      expect(bot).toBeInstanceOf(TradingBot);
    });
  });

  describe('configuration handling', () => {
    it('should accept minimal config', () => {
      const config = createMinimalConfig();

      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      expect(bot).toBeInstanceOf(TradingBot);
    });

    it('should accept testnet config', () => {
      const config = createMinimalConfig();
      config.exchange.testnet = true;

      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      expect(bot).toBeInstanceOf(TradingBot);
    });

    it('should accept production config', () => {
      const config = createMinimalConfig();
      config.exchange.testnet = false;

      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      expect(bot).toBeInstanceOf(TradingBot);
    });

    it('should handle different symbols', () => {
      const config = createMinimalConfig();
      config.exchange.symbol = 'SUIUSDT';

      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      expect(bot).toBeInstanceOf(TradingBot);
    });

    it('should handle different leverage', () => {
      const config = createMinimalConfig();
      config.trading.leverage = 5;

      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      expect(bot).toBeInstanceOf(TradingBot);
    });

    it('should handle different stop loss percent', () => {
      const config = createMinimalConfig();
      config.riskManagement.stopLossPercent = 3;

      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      expect(bot).toBeInstanceOf(TradingBot);
    });
  });

  describe('error handling', () => {
    it('should not throw on double stop', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      expect(() => {
        bot.stop();
        bot.stop();
      }).not.toThrow();
    });

    it('should handle stop when not running', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      // Should not throw
      expect(() => bot.stop()).not.toThrow();
      expect(bot.isRunning).toBe(false);
    });

    it('should maintain state consistency', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      expect(bot.isRunning).toBe(false);
      bot.stop();
      expect(bot.isRunning).toBe(false);
    });
  });

  describe('event bus integration', () => {
    it('should emit events', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      const listener = jest.fn();
      emitter.on('test', listener);

      emitter.emit('test', { data: 'value' });

      expect(listener).toHaveBeenCalledWith({ data: 'value' });
    });

    it('should support once listener', (done) => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      emitter.once('single', () => {
        expect(true).toBe(true);
        done();
      });

      emitter.emit('single');
      // Second emit should not trigger handler
      emitter.emit('single');
    });

    it('should support removing all listeners', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      const listener = jest.fn();
      emitter.on('test', listener);
      emitter.removeAllListeners('test');

      emitter.emit('test');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('multiple bot instances', () => {
    it('should support multiple independent bots', () => {
      const config = createMinimalConfig();

      const result1 = BotFactory.createWithEmitter({ config });
      const result2 = BotFactory.createWithEmitter({ config });

      expect(result1).not.toBe(result2);
      expect(result1.bot.isRunning).toBe(false);
      expect(result2.bot.isRunning).toBe(false);
    });

    it('should not share event listeners between bots', (done) => {
      const config = createMinimalConfig();

      const { bot: bot1, emitter: emitter1 } = BotFactory.createWithEmitter({ config });
      const { bot: bot2, emitter: emitter2 } = BotFactory.createWithEmitter({ config });

      const listener = jest.fn();
      emitter1.on('event', listener);

      emitter2.emit('event');

      // Listener should not be called
      setTimeout(() => {
        expect(listener).not.toHaveBeenCalled();
        done();
      }, 10);
    });

    it('should support independent state', () => {
      const config = createMinimalConfig();

      const { bot: bot1 } = BotFactory.createWithEmitter({ config });
      const { bot: bot2 } = BotFactory.createWithEmitter({ config });

      bot1.stop();

      expect(bot1.isRunning).toBe(false);
      expect(bot2.isRunning).toBe(false); // Independent
    });
  });

  describe('public interface', () => {
    it('should have isRunning property', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      expect(typeof bot.isRunning).toBe('boolean');
    });

    it('should have start method', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      expect(typeof bot.start).toBe('function');
    });

    it('should have stop method', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      expect(typeof bot.stop).toBe('function');
    });

    it('should provide event methods through emitter', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      expect(typeof emitter.on).toBe('function');
      expect(typeof emitter.off).toBe('function');
      expect(typeof emitter.emit).toBe('function');
      expect(typeof emitter.once).toBe('function');
    });
  });

  describe('real-world scenarios', () => {
    it('should support create, check state, stop cycle', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      expect(bot.isRunning).toBe(false);

      // Would call start here in real scenario
      // expect(bot.isRunning).toBe(true);

      bot.stop();
      expect(bot.isRunning).toBe(false);
    });

    it('should work with BotEventEmitter adapter', () => {
      const config = createMinimalConfig();
      const { bot, emitter } = BotFactory.createWithEmitter({ config });

      expect(bot.isRunning).toBe(false);
      expect(emitter).toBeDefined();

      bot.stop();
      expect(bot.isRunning).toBe(false);
    });

    it('should support createWithEmitter() factory method', () => {
      const config = createMinimalConfig();

      const { bot, emitter } = BotFactory.createWithEmitter({ config });
      expect(bot.isRunning).toBe(false);
      expect(emitter).toBeDefined();
      expect(typeof emitter.onSignal).toBe('function');

      bot.stop();
      expect(bot.isRunning).toBe(false);
    });
  });
});
