/**
 * ExchangeFactory Tests
 * Testing exchange factory instantiation, configuration, and caching
 * 30+ comprehensive tests for multi-exchange support
 */

import { ExchangeFactory } from '../../services/exchange-factory.service';
import { BybitServiceAdapter } from '../../services/bybit/bybit-service.adapter';
import { BinanceServiceAdapter } from '../../services/binance/binance-service.adapter';
import type { LoggerService } from '../../types';

// Create mock logger inline
const createMockLogger = (): Partial<LoggerService> => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});

describe('ExchangeFactory Service', () => {
  let mockLogger: Partial<LoggerService>;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  // ============================================================================
  // FACTORY INITIALIZATION
  // ============================================================================

  describe('Factory Initialization', () => {
    it('should initialize factory with valid Bybit config', () => {
      const config = {
        name: 'bybit' as const,
        symbol: 'XRPUSDT',
        demo: true,
        testnet: false,
      };

      const factory = new ExchangeFactory(mockLogger as LoggerService, config);
      expect(factory.getExchangeName()).toEqual('bybit');
      expect(factory.getSymbol()).toEqual('XRPUSDT');
    });

    it('should initialize factory with valid Binance config', () => {
      const config = {
        name: 'binance' as const,
        symbol: 'BTCUSDT',
        demo: true,
        testnet: false,
      };

      const factory = new ExchangeFactory(mockLogger as LoggerService, config);
      expect(factory.getExchangeName()).toEqual('binance');
      expect(factory.getSymbol()).toEqual('BTCUSDT');
    });

    it('should reject missing exchange name', () => {
      expect(() => {
        new ExchangeFactory(mockLogger as LoggerService, {
          name: undefined as any,
          symbol: 'XRPUSDT',
        });
      }).toThrow();
    });

    it('should reject missing symbol', () => {
      expect(() => {
        new ExchangeFactory(mockLogger as LoggerService, {
          name: 'bybit' as const,
          symbol: undefined as any,
        });
      }).toThrow();
    });

    it('should reject unsupported exchange', () => {
      expect(() => {
        new ExchangeFactory(mockLogger as LoggerService, {
          name: 'kraken' as any,
          symbol: 'XRPUSDT',
        });
      }).toThrow();
    });

    it('should accept case-insensitive exchange names in config validation', () => {
      // Only test that config validation doesn't break
      const config = {
        name: 'BYBIT' as any,
        symbol: 'XRPUSDT',
      };
      const factory = new ExchangeFactory(mockLogger as LoggerService, config);
      expect(factory).toBeDefined();
    });
  });

  // ============================================================================
  // BYBIT EXCHANGE CREATION
  // ============================================================================

  describe('Bybit Exchange Creation', () => {
    it('should create Bybit adapter', async () => {
      const factory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'bybit',
        symbol: 'XRPUSDT',
        demo: true,
      });

      const exchange = await factory.createExchange();
      expect(exchange).toBeDefined();
      expect(exchange.name).toEqual('Bybit');
    });

    it('should return BybitServiceAdapter instance', async () => {
      const factory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'bybit',
        symbol: 'XRPUSDT',
      });

      const exchange = await factory.createExchange();
      expect(exchange instanceof BybitServiceAdapter).toBe(true);
    });

    it('should handle all Bybit config parameters', async () => {
      const factory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'bybit',
        symbol: 'ETHUSDT',
        demo: false,
        testnet: true,
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      });

      const exchange = await factory.createExchange();
      expect(exchange).toBeDefined();
      expect(exchange.name).toEqual('Bybit');
    });

    it('should use default values for optional Bybit params', async () => {
      const factory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'bybit',
        symbol: 'XRPUSDT',
      });

      const exchange = await factory.createExchange();
      expect(exchange).toBeDefined();
    });
  });

  // ============================================================================
  // BINANCE EXCHANGE CREATION
  // ============================================================================

  describe('Binance Exchange Creation', () => {
    it('should create Binance adapter', async () => {
      const factory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'binance',
        symbol: 'BTCUSDT',
        demo: true,
      });

      const exchange = await factory.createExchange();
      expect(exchange).toBeDefined();
      expect(exchange.name).toEqual('Binance');
    });

    it('should return BinanceServiceAdapter instance', async () => {
      const factory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'binance',
        symbol: 'BTCUSDT',
      });

      const exchange = await factory.createExchange();
      expect(exchange instanceof BinanceServiceAdapter).toBe(true);
    });

    it('should handle all Binance config parameters', async () => {
      const factory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'binance',
        symbol: 'ETHUSDT',
        demo: false,
        testnet: true,
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      });

      const exchange = await factory.createExchange();
      expect(exchange).toBeDefined();
      expect(exchange.name).toEqual('Binance');
    });

    it('should use default values for optional Binance params', async () => {
      const factory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'binance',
        symbol: 'BTCUSDT',
      });

      const exchange = await factory.createExchange();
      expect(exchange).toBeDefined();
    });
  });

  // ============================================================================
  // EXCHANGE CACHING
  // ============================================================================

  describe('Exchange Caching', () => {
    it('should return same instance on cached calls', async () => {
      const factory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'bybit',
        symbol: 'XRPUSDT',
        demo: true,
      });

      const exchange1 = await factory.createExchange();
      const exchange2 = await factory.createExchange();

      expect(exchange1).toBe(exchange2);
    });

    it('should retrieve cached exchange with getExchange()', async () => {
      const factory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'bybit',
        symbol: 'XRPUSDT',
      });

      const exchange = await factory.createExchange();
      const cached = factory.getExchange();

      expect(cached).toBe(exchange);
    });

    it('should return null when exchange not initialized', () => {
      const factory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'bybit',
        symbol: 'XRPUSDT',
      });

      expect(factory.getExchange()).toBeNull();
    });

    it('should clear cache on reset', async () => {
      const factory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'bybit',
        symbol: 'XRPUSDT',
      });

      const exchange1 = await factory.createExchange();
      factory.reset();

      expect(factory.getExchange()).toBeNull();

      const exchange2 = await factory.createExchange();
      expect(exchange1).not.toBe(exchange2);
    });
  });

  // ============================================================================
  // SYMBOL HANDLING
  // ============================================================================

  describe('Symbol Handling', () => {
    it('should handle trading pairs for Bybit', async () => {
      const factory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'bybit',
        symbol: 'XRPUSDT',
        demo: true,
      });

      const exchange = await factory.createExchange();
      expect(typeof exchange.getSymbol).toBe('function');
    });

    it('should handle trading pairs for Binance', async () => {
      const factory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'binance',
        symbol: 'BTCUSDT',
        demo: true,
      });

      const exchange = await factory.createExchange();
      expect(typeof exchange.getSymbol).toBe('function');
    });
  });

  // ============================================================================
  // IEXCHANGE INTERFACE COMPLIANCE
  // ============================================================================

  describe('IExchange Interface Compliance', () => {
    it('should implement full IExchange interface for Bybit', async () => {
      const factory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'bybit',
        symbol: 'XRPUSDT',
      });

      const exchange = await factory.createExchange();

      // Check essential methods
      expect(typeof exchange.initialize).toBe('function');
      expect(typeof exchange.connect).toBe('function');
      expect(typeof exchange.disconnect).toBe('function');
      expect(typeof exchange.getCandles).toBe('function');
      expect(typeof exchange.getLatestPrice).toBe('function');
      expect(typeof exchange.openPosition).toBe('function');
      expect(typeof exchange.closePosition).toBe('function');
      expect(exchange.name).toBeDefined();
    });

    it('should implement full IExchange interface for Binance', async () => {
      const factory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'binance',
        symbol: 'BTCUSDT',
      });

      const exchange = await factory.createExchange();

      // Check essential methods
      expect(typeof exchange.initialize).toBe('function');
      expect(typeof exchange.connect).toBe('function');
      expect(typeof exchange.disconnect).toBe('function');
      expect(typeof exchange.getCandles).toBe('function');
      expect(typeof exchange.getLatestPrice).toBe('function');
      expect(typeof exchange.openPosition).toBe('function');
      expect(typeof exchange.closePosition).toBe('function');
      expect(exchange.name).toBeDefined();
    });

    it('should have consistent method signatures across exchanges', async () => {
      const bybitFactory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'bybit',
        symbol: 'XRPUSDT',
      });

      const binanceFactory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'binance',
        symbol: 'BTCUSDT',
      });

      const bybitExchange = await bybitFactory.createExchange();
      const binanceExchange = await binanceFactory.createExchange();

      // Both should have same method names
      const expectedMethods = [
        'initialize', 'connect', 'disconnect', 'isConnected', 'healthCheck',
        'getCandles', 'getLatestPrice', 'getExchangeTime', 'getServerTime',
        'getCurrentPrice', 'getSymbolPrecision', 'openPosition', 'closePosition',
        'updateStopLoss', 'activateTrailing', 'getOpenPositions', 'getPosition',
        'hasPosition', 'createConditionalOrder', 'cancelOrder', 'getOrderStatus',
        'cancelAllOrders', 'cancelAllConditionalOrders', 'getBalance',
        'getLeverage', 'setLeverage', 'getFundingRate', 'getSymbol',
      ];

      for (const method of expectedMethods) {
        expect(typeof (bybitExchange as any)[method]).toBe('function');
        expect(typeof (binanceExchange as any)[method]).toBe('function');
      }
    });
  });

  // ============================================================================
  // MULTI-EXCHANGE SWITCHING
  // ============================================================================

  describe('Multi-Exchange Switching', () => {
    it('should allow switching from Bybit to Binance', async () => {
      let factory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'bybit',
        symbol: 'XRPUSDT',
      });

      let exchange = await factory.createExchange();
      expect(exchange.name).toEqual('Bybit');

      factory.reset();
      factory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'binance',
        symbol: 'XRPUSDT',
      });

      exchange = await factory.createExchange();
      expect(exchange.name).toEqual('Binance');
    });

    it('should maintain separate instances for different symbols', async () => {
      const bybitXRP = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'bybit',
        symbol: 'XRPUSDT',
      });

      const bybitBTC = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'bybit',
        symbol: 'BTCUSDT',
      });

      const xrpExchange = await bybitXRP.createExchange();
      const btcExchange = await bybitBTC.createExchange();

      expect(xrpExchange).not.toBe(btcExchange);
      expect(xrpExchange.name).toEqual('Bybit');
      expect(btcExchange.name).toEqual('Bybit');
    });

    it('should support demo and testnet modes', async () => {
      const demoFactory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'bybit',
        symbol: 'XRPUSDT',
        demo: true,
      });

      const testnedFactory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'bybit',
        symbol: 'XRPUSDT',
        testnet: true,
      });

      const demoExchange = await demoFactory.createExchange();
      const testnetExchange = await testnedFactory.createExchange();

      expect(demoExchange).toBeDefined();
      expect(testnetExchange).toBeDefined();
    });

    it('should support API credentials configuration', () => {
      const factory = new ExchangeFactory(mockLogger as LoggerService, {
        name: 'binance',
        symbol: 'BTCUSDT',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      });

      expect(factory.getExchangeName()).toEqual('binance');
      expect(factory.getSymbol()).toEqual('BTCUSDT');
    });
  });
});
