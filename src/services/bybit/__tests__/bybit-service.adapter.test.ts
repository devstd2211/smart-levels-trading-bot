/**
 * BybitServiceAdapter Tests
 *
 * Comprehensive unit tests for IExchange adapter implementation
 * Tests all 28 interface methods with focus on:
 * - Signature conversion (IExchange params → BybitService calls)
 * - Return type conversion (BybitService responses → IExchange types)
 * - Error handling and edge cases
 * - Type safety
 */

import { BybitServiceAdapter } from '../bybit-service.adapter';
import { BybitService } from '../bybit.service';
import { PositionSide } from '../../../types/enums';
import { LoggerService } from '../../logger.service';
import type { CandleParams, OpenPositionParams, ClosePositionParams, UpdateStopLossParams, ActivateTrailingParams } from '../../../interfaces/IExchange';

// Mock BybitService
jest.mock('../bybit.service');

describe('BybitServiceAdapter', () => {
  let adapter: BybitServiceAdapter;
  let mockBybitService: any; // Use 'any' to mock all methods
  let mockLogger: any;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;

    // Create a flexible mock that allows any method to be called
    mockBybitService = {
      name: 'Bybit',
      symbol: 'APEXUSDT',
      getSymbol: jest.fn().mockReturnValue('APEXUSDT'),
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: jest.fn(),
      getCandles: jest.fn(),
      getLatestPrice: jest.fn(),
      getExchangeTime: jest.fn(),
      getCurrentPrice: jest.fn(),
      getServerTime: jest.fn(),
      getSymbolPrecision: jest.fn(),
      openPosition: jest.fn(),
      closePosition: jest.fn(),
      updateStopLoss: jest.fn(),
      activateTrailing: jest.fn(),
      getOpenPositions: jest.fn(),
      getPosition: jest.fn(),
      hasPosition: jest.fn(),
      createConditionalOrder: jest.fn(),
      cancelOrder: jest.fn(),
      getOrderStatus: jest.fn(),
      cancelAllOrders: jest.fn(),
      cancelAllConditionalOrders: jest.fn(),
      getBalance: jest.fn(),
      getLeverage: jest.fn(),
      setLeverage: jest.fn(),
    } as any;

    // Create adapter with mocked BybitService and logger
    adapter = new BybitServiceAdapter(mockBybitService, mockLogger);
  });

  // ============================================================================
  // PHASE 1: CONNECTION LIFECYCLE (Critical for all operations)
  // ============================================================================

  describe('Phase 1: Connection Lifecycle', () => {
    describe('connect()', () => {
      it('should initialize connection successfully', async () => {
        mockBybitService.connect = jest.fn().mockResolvedValue(undefined);

        await adapter.connect();

        expect(mockBybitService.connect).toHaveBeenCalled();
      });

      it('should throw error if connection fails', async () => {
        const error = new Error('Connection failed');
        mockBybitService.connect = jest.fn().mockRejectedValue(error);

        await expect(adapter.connect()).rejects.toThrow('Connection failed');
      });
    });

    describe('disconnect()', () => {
      it('should disconnect successfully', async () => {
        mockBybitService.disconnect = jest.fn().mockResolvedValue(undefined);

        await adapter.disconnect();

        expect(mockBybitService.disconnect).toHaveBeenCalled();
      });

      it('should throw error if disconnect fails', async () => {
        const error = new Error('Disconnect failed');
        mockBybitService.disconnect = jest.fn().mockRejectedValue(error);

        await expect(adapter.disconnect()).rejects.toThrow('Disconnect failed');
      });
    });

    describe('isConnected()', () => {
      it('should return true when connected', () => {
        mockBybitService.isConnected = jest.fn().mockReturnValue(true);

        const result = adapter.isConnected();

        expect(result).toBe(true);
        expect(mockBybitService.isConnected).toHaveBeenCalled();
      });

      it('should return false when disconnected', () => {
        mockBybitService.isConnected = jest.fn().mockReturnValue(false);

        const result = adapter.isConnected();

        expect(result).toBe(false);
      });
    });

    describe('healthCheck()', () => {
      it('should return true when exchange is healthy', async () => {
        mockBybitService.getExchangeTime = jest.fn().mockResolvedValue(Date.now());

        const result = await adapter.healthCheck();

        expect(result).toBe(true);
        expect(mockBybitService.getExchangeTime).toHaveBeenCalled();
      });

      it('should return false when exchange is unhealthy', async () => {
        mockBybitService.getExchangeTime = jest.fn().mockRejectedValue(new Error('Exchange down'));

        const result = await adapter.healthCheck();

        expect(result).toBe(false);
      });
    });
  });

  // ============================================================================
  // PHASE 2A: MARKET DATA (Read-only, non-risky)
  // ============================================================================

  describe('Phase 2A: Market Data Operations', () => {
    describe('getCandles()', () => {
      it('should convert IExchange params to BybitService call', async () => {
        const params: CandleParams = {
          symbol: 'APEXUSDT',
          timeframe: '1h',
          limit: 100,
        };

        const mockCandles = [
          { timestamp: 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
        ];

        mockBybitService.getCandles = jest.fn().mockResolvedValue(mockCandles);

        const result = await adapter.getCandles(params);

        expect(result).toEqual(mockCandles);
        expect(mockBybitService.getCandles).toHaveBeenCalled();
      });

      it('should throw error when getCandles fails', async () => {
        const params: CandleParams = {
          symbol: 'INVALID',
          timeframe: '1h',
          limit: 100,
        };

        mockBybitService.getCandles = jest.fn().mockRejectedValue(new Error('Invalid symbol'));

        await expect(adapter.getCandles(params)).rejects.toThrow('Invalid symbol');
      });
    });

    describe('getLatestPrice()', () => {
      it('should fetch latest price for symbol', async () => {
        mockBybitService.getLatestPrice = jest.fn().mockResolvedValue(50000);

        const result = await adapter.getLatestPrice('BTC/USDT');

        expect(result).toBe(50000);
        expect(mockBybitService.getLatestPrice).toHaveBeenCalled();
      });

      it('should throw error when price fetch fails', async () => {
        mockBybitService.getLatestPrice = jest.fn().mockRejectedValue(new Error('Network error'));

        await expect(adapter.getLatestPrice('BTC/USDT')).rejects.toThrow('Network error');
      });
    });

    describe('getExchangeTime()', () => {
      it('should return exchange server time', async () => {
        const now = Date.now();
        mockBybitService.getExchangeTime = jest.fn().mockResolvedValue(now);

        const result = await adapter.getExchangeTime();

        expect(result).toBe(now);
      });

      it('should throw error when time fetch fails', async () => {
        mockBybitService.getExchangeTime = jest.fn().mockRejectedValue(new Error('Time sync failed'));

        await expect(adapter.getExchangeTime()).rejects.toThrow('Time sync failed');
      });
    });

    describe('getServerTime()', () => {
      it('should be alias for getExchangeTime()', async () => {
        const now = Date.now();
        mockBybitService.getExchangeTime = jest.fn().mockResolvedValue(now);

        const result = await adapter.getServerTime();

        expect(result).toBe(now);
      });
    });

    describe('getCurrentPrice()', () => {
      it('should be alias for getLatestPrice()', async () => {
        mockBybitService.getLatestPrice = jest.fn().mockResolvedValue(50000);

        const result = await adapter.getCurrentPrice();

        expect(result).toBe(50000);
      });
    });

    describe('getSymbolPrecision()', () => {
      it('should return precision info for symbol', async () => {
        const precisionInfo = {
          pricePrecision: 2,
          quantityPrecision: 4,
          minOrderQty: 0.001,
        };

        mockBybitService.getSymbolPrecision = jest.fn().mockResolvedValue(precisionInfo);

        const result = await adapter.getSymbolPrecision('BTC/USDT');

        expect(result).toEqual(precisionInfo);
      });
    });
  });

  // ============================================================================
  // PHASE 2B: POSITION MANAGEMENT (Risky, requires careful testing)
  // ============================================================================

  describe('Phase 2B: Position Management', () => {
    describe('openPosition()', () => {
      it('should convert IExchange params to BybitService and return Position', async () => {
        const params: OpenPositionParams = {
          symbol: 'APEXUSDT',
          side: 'Buy',
          quantity: 10,
          leverage: 5,
          stopLoss: 9500,
          takeProfits: [10500, 11000],
        };

        mockBybitService.openPosition = jest.fn().mockResolvedValue('order_123');
        mockBybitService.symbol = 'APEXUSDT';

        const result = await adapter.openPosition(params);

        expect(result).toBeDefined();
        expect(result.id).toBe('order_123');
        expect(result.symbol).toBe('APEXUSDT');
        expect(result.side).toBe(PositionSide.LONG);
        expect(result.quantity).toBe(10);
        expect(result.leverage).toBe(5);
        expect(result.status).toBe('OPEN');
        expect(result.stopLoss.price).toBe(9500);
        expect(result.takeProfits).toHaveLength(2);
        expect(result.takeProfits[0].price).toBe(10500);
        expect(result.takeProfits[1].price).toBe(11000);
      });

      it('should convert Sell side to SHORT', async () => {
        const params: OpenPositionParams = {
          symbol: 'BTCUSDT',
          side: 'Sell',
          quantity: 1,
          leverage: 10,
          stopLoss: 52000,
          takeProfits: [48000],
        };

        mockBybitService.openPosition = jest.fn().mockResolvedValue('order_456');
        mockBybitService.symbol = 'BTCUSDT';

        const result = await adapter.openPosition(params);

        expect(result.side).toBe(PositionSide.SHORT);
      });

      it('should calculate takeProfit percentages correctly', async () => {
        const params: OpenPositionParams = {
          symbol: 'APEXUSDT',
          side: 'Buy',
          quantity: 10,
          leverage: 5,
          stopLoss: 10000,
          takeProfits: [11000, 12000],
        };

        mockBybitService.openPosition = jest.fn().mockResolvedValue('order_789');
        mockBybitService.symbol = 'APEXUSDT';

        const result = await adapter.openPosition(params);

        // TP1: (11000 - 10000) / 10000 * 100 = 10%
        expect(result.takeProfits[0].percent).toBe(10);
        // TP2: (12000 - 10000) / 10000 * 100 = 20%
        expect(result.takeProfits[1].percent).toBe(20);
      });

      it('should throw error when openPosition fails', async () => {
        const params: OpenPositionParams = {
          symbol: 'APEXUSDT',
          side: 'Buy',
          quantity: 10,
          leverage: 5,
          stopLoss: 9500,
          takeProfits: [10500],
        };

        mockBybitService.openPosition = jest.fn().mockRejectedValue(new Error('Insufficient margin'));
        mockBybitService.symbol = 'APEXUSDT';

        await expect(adapter.openPosition(params)).rejects.toThrow('Insufficient margin');
      });
    });

    describe('closePosition()', () => {
      it('should close position fully', async () => {
        mockBybitService.closePosition = jest.fn().mockResolvedValue(undefined);

        const params: ClosePositionParams = {
          positionId: 'pos_123',
        };

        await adapter.closePosition(params);

        expect(mockBybitService.closePosition).toHaveBeenCalled();
      });

      it('should close position partially when percentage specified', async () => {
        mockBybitService.closePosition = jest.fn().mockResolvedValue(undefined);

        const params: ClosePositionParams = {
          positionId: 'pos_123',
          percentage: 50,
        };

        await adapter.closePosition(params);

        expect(mockBybitService.closePosition).toHaveBeenCalled();
      });

      it('should throw error when close fails', async () => {
        mockBybitService.closePosition = jest.fn().mockRejectedValue(new Error('Position not found'));

        const params: ClosePositionParams = {
          positionId: 'invalid_id',
        };

        await expect(adapter.closePosition(params)).rejects.toThrow('Position not found');
      });
    });

    describe('updateStopLoss()', () => {
      it('should update stop loss price', async () => {
        mockBybitService.updateStopLoss = jest.fn().mockResolvedValue(undefined);

        const params: UpdateStopLossParams = {
          positionId: 'pos_123',
          newPrice: 9000,
        };

        await adapter.updateStopLoss(params);

        expect(mockBybitService.updateStopLoss).toHaveBeenCalled();
      });

      it('should throw error when update fails', async () => {
        mockBybitService.updateStopLoss = jest.fn().mockRejectedValue(new Error('Invalid price'));

        const params: UpdateStopLossParams = {
          positionId: 'pos_123',
          newPrice: 50000,
        };

        await expect(adapter.updateStopLoss(params)).rejects.toThrow('Invalid price');
      });
    });

    describe('activateTrailing()', () => {
      it('should activate trailing stop', async () => {
        mockBybitService.activateTrailing = jest.fn().mockResolvedValue(undefined);

        const params: ActivateTrailingParams = {
          positionId: 'pos_123',
          trailingPercent: 2,
        };

        await adapter.activateTrailing(params);

        expect(mockBybitService.activateTrailing).toHaveBeenCalled();
      });

      it('should throw error when activation fails', async () => {
        mockBybitService.activateTrailing = jest.fn().mockRejectedValue(new Error('Trailing not supported'));

        const params: ActivateTrailingParams = {
          positionId: 'pos_123',
          trailingPercent: 2,
        };

        await expect(adapter.activateTrailing(params)).rejects.toThrow('Trailing not supported');
      });
    });

    describe('getOpenPositions()', () => {
      it('should return array of open positions', async () => {
        const mockPositions = [
          {
            id: 'pos_1',
            symbol: 'APEXUSDT',
            side: PositionSide.LONG,
            quantity: 10,
            entryPrice: 5000,
            leverage: 5,
            marginUsed: 10000,
            openedAt: Date.now(),
            unrealizedPnL: 100,
            orderId: 'order_1',
            reason: 'Signal',
            status: 'OPEN' as const,
            stopLoss: {
              price: 4500,
              initialPrice: 4500,
              isBreakeven: false,
              isTrailing: false,
              updatedAt: Date.now(),
            },
            takeProfits: [],
          },
        ];

        mockBybitService.getOpenPositions = jest.fn().mockResolvedValue(mockPositions);

        const result = await adapter.getOpenPositions();

        expect(result).toEqual(mockPositions);
        expect(mockBybitService.getOpenPositions).toHaveBeenCalled();
      });

      it('should return empty array when no positions open', async () => {
        mockBybitService.getOpenPositions = jest.fn().mockResolvedValue([]);

        const result = await adapter.getOpenPositions();

        expect(result).toEqual([]);
      });
    });

    describe('getPosition()', () => {
      it('should return specific position by ID', async () => {
        const mockPosition = {
          id: 'pos_123',
          symbol: 'APEXUSDT',
          side: PositionSide.LONG,
          quantity: 10,
          entryPrice: 5000,
          leverage: 5,
          marginUsed: 10000,
          openedAt: Date.now(),
          unrealizedPnL: 100,
          orderId: 'order_1',
          reason: 'Signal',
          status: 'OPEN' as const,
          stopLoss: {
            price: 4500,
            initialPrice: 4500,
            isBreakeven: false,
            isTrailing: false,
            updatedAt: Date.now(),
          },
          takeProfits: [],
        };

        mockBybitService.getPosition = jest.fn().mockResolvedValue(mockPosition);

        const result = await adapter.getPosition('pos_123');

        expect(result).toEqual(mockPosition);
      });

      it('should return null when position not found', async () => {
        mockBybitService.getPosition = jest.fn().mockResolvedValue(null);

        const result = await adapter.getPosition('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('hasPosition()', () => {
      it('should return true when position exists for symbol', async () => {
        mockBybitService.hasPosition = jest.fn().mockResolvedValue(true);

        const result = await adapter.hasPosition('APEXUSDT');

        expect(result).toBe(true);
      });

      it('should return false when no position exists for symbol', async () => {
        mockBybitService.hasPosition = jest.fn().mockResolvedValue(false);

        const result = await adapter.hasPosition('BTC/USDT');

        expect(result).toBe(false);
      });
    });
  });

  // ============================================================================
  // PHASE 2C: ORDER MANAGEMENT
  // ============================================================================

  describe('Phase 2C: Order Management', () => {
    describe('createConditionalOrder()', () => {
      it('should create conditional order', async () => {
        mockBybitService.createConditionalOrder = jest.fn().mockResolvedValue({
          orderId: 'cond_order_1',
          symbol: 'APEXUSDT',
          side: 'Buy',
          quantity: 10,
          timestamp: Date.now(),
        });

        const result = await adapter.createConditionalOrder({
          symbol: 'APEXUSDT',
          side: 'Buy',
          quantity: 10,
          stopPrice: 5500,
          takeProfit: 6500,
        });

        expect(result).toBeDefined();
        expect(result.orderId).toBe('cond_order_1');
      });
    });

    describe('cancelOrder()', () => {
      it('should cancel order by ID', async () => {
        mockBybitService.cancelOrder = jest.fn().mockResolvedValue(undefined);

        await adapter.cancelOrder('order_123');

        expect(mockBybitService.cancelOrder).toHaveBeenCalledWith('order_123');
      });
    });

    describe('getOrderStatus()', () => {
      it('should return order status', async () => {
        mockBybitService.getOrderStatus = jest.fn().mockResolvedValue({
          orderId: 'order_123',
          status: 'FILLED',
          filledQuantity: 10,
          averagePrice: 5000,
        });

        const result = await adapter.getOrderStatus('order_123');

        expect(result.status).toBe('FILLED');
      });
    });

    describe('cancelAllOrders()', () => {
      it('should cancel all orders for symbol', async () => {
        mockBybitService.cancelAllOrders = jest.fn().mockResolvedValue(undefined);

        await adapter.cancelAllOrders('APEXUSDT');

        expect(mockBybitService.cancelAllOrders).toHaveBeenCalled();
      });
    });

    describe('cancelAllConditionalOrders()', () => {
      it('should cancel all conditional orders', async () => {
        mockBybitService.cancelAllConditionalOrders = jest.fn().mockResolvedValue(undefined);

        await adapter.cancelAllConditionalOrders();

        expect(mockBybitService.cancelAllConditionalOrders).toHaveBeenCalled();
      });
    });
  });

  // ============================================================================
  // PHASE 2D: ACCOUNT MANAGEMENT
  // ============================================================================

  describe('Phase 2D: Account Management', () => {
    describe('getBalance()', () => {
      it('should return account balance', async () => {
        mockBybitService.getBalance = jest.fn().mockResolvedValue({
          walletBalance: 100000,
          availableBalance: 50000,
          totalMarginUsed: 50000,
          totalUnrealizedPnL: 1000,
        });

        const result = await adapter.getBalance();

        expect(result.walletBalance).toBe(100000);
        expect(result.availableBalance).toBe(50000);
      });
    });

    describe('getLeverage()', () => {
      it('should return current leverage', async () => {
        mockBybitService.getLeverage = jest.fn().mockResolvedValue(5);

        const result = await adapter.getLeverage('APEXUSDT');

        expect(result).toBe(5);
      });
    });

    describe('setLeverage()', () => {
      it('should set leverage for symbol', async () => {
        mockBybitService.setLeverage = jest.fn().mockResolvedValue(undefined);

        await adapter.setLeverage('APEXUSDT', 10);

        expect(mockBybitService.setLeverage).toHaveBeenCalled();
      });
    });
  });

  // ============================================================================
  // INTERFACE COMPLIANCE
  // ============================================================================

  describe('Interface Compliance', () => {
    it('should have name property', () => {
      expect(adapter.name).toBe('Bybit');
    });

    it('should implement IExchange interface methods', () => {
      // Market data
      expect(typeof adapter.getCandles).toBe('function');
      expect(typeof adapter.getLatestPrice).toBe('function');
      expect(typeof adapter.getExchangeTime).toBe('function');

      // Positions
      expect(typeof adapter.openPosition).toBe('function');
      expect(typeof adapter.closePosition).toBe('function');
      expect(typeof adapter.getOpenPositions).toBe('function');

      // Orders
      expect(typeof adapter.createConditionalOrder).toBe('function');
      expect(typeof adapter.cancelOrder).toBe('function');

      // Account
      expect(typeof adapter.getBalance).toBe('function');
      expect(typeof adapter.getLeverage).toBe('function');

      // Lifecycle
      expect(typeof adapter.connect).toBe('function');
      expect(typeof adapter.disconnect).toBe('function');
      expect(typeof adapter.isConnected).toBe('function');
    });
  });
});
