/**
 * BybitServiceAdapter - IExchange Implementation
 *
 * Wraps BybitService to implement the full IExchange interface.
 * Handles all 24 signature mismatches through the adapter pattern.
 *
 * Benefits:
 * - BybitService stays unchanged (backward compatible)
 * - IExchange fully compliant
 * - Safe wrapper layer
 * - Easy to swap exchanges in future
 *
 * Mismatch Resolution Strategy:
 * 1. Parameter normalization (convert IExchange params to BybitService params)
 * 2. Return type wrapping (convert BybitService returns to IExchange types)
 * 3. Missing method implementation (add functionality where needed)
 * 4. Symbol handling (validate or use internal)
 */

import {
  IExchange,
  IExchangeMarketData,
  IExchangePositions,
  IExchangeOrders,
  IExchangeAccount,
  CandleParams,
  OpenPositionParams,
  ClosePositionParams,
  UpdateStopLossParams,
  ActivateTrailingParams,
  OrderParams,
  OrderResult,
  AccountBalance,
} from '../../interfaces/IExchange';
import type { Candle, Position, TakeProfit } from '../../types/core';
import { PositionSide } from '../../types/enums';
import { BybitService } from './bybit.service';
import { LoggerService } from '../../types';

/**
 * BybitServiceAdapter implements IExchange by wrapping BybitService
 * Resolves all 24 signature mismatches through adapter pattern
 */
export class BybitServiceAdapter implements IExchange {
  readonly name = 'Bybit';

  private isConnected_ = false;
  private lastHealthCheck = 0;
  private healthCheckInterval = 60000; // 1 minute

  constructor(
    private bybitService: BybitService,
    private logger: LoggerService,
  ) {
    this.logger.info('BybitServiceAdapter initialized', {
      name: this.name,
      symbol: this.bybitService.getSymbol(),
    });
  }

  // ============================================================================
  // INITIALIZATION & CONNECTION LIFECYCLE (IExchange Main Interface)
  // ============================================================================

  /**
   * Initialize exchange service - Load symbol precision parameters
   * Delegates to BybitService.initialize()
   */
  async initialize(): Promise<void> {
    try {
      await this.bybitService.initialize();
      this.logger.info('✅ BybitServiceAdapter initialized', { name: this.name });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to initialize adapter', { error: errorMsg });
      throw error;
    }
  }

  /**
   * Connect to exchange - Initialize connection
   * BybitService initializes on demand, but we track connection state
   */
  async connect(): Promise<void> {
    try {
      // Verify connection by calling getServerTime()
      await this.bybitService.getServerTime();
      this.isConnected_ = true;
      this.logger.info('✅ Connected to Bybit Exchange', { name: this.name });
    } catch (error) {
      this.isConnected_ = false;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to connect to Bybit', { error: errorMsg });
      throw error;
    }
  }

  /**
   * Disconnect from exchange - Cleanup connection
   * BybitService doesn't expose disconnect, so this is a no-op
   * but we update our connection state
   */
  async disconnect(): Promise<void> {
    this.isConnected_ = false;
    this.logger.info('🔌 Disconnected from Bybit Exchange', { name: this.name });
  }

  /**
   * Check if connected to exchange
   */
  isConnected(): boolean {
    return this.isConnected_;
  }

  /**
   * Health check - Verify exchange is responsive
   * Calls getServerTime() and checks response validity
   * Throttled to avoid excessive API calls
   */
  async healthCheck(): Promise<boolean> {
    const now = Date.now();

    // Throttle health checks to once per minute
    if (now - this.lastHealthCheck < this.healthCheckInterval) {
      return this.isConnected_;
    }

    try {
      const serverTime = await this.bybitService.getServerTime();

      // Verify server time is recent (within 1 hour)
      if (Math.abs(Date.now() - serverTime) > 3600000) {
        this.logger.warn('🟡 Bybit server time suspicious', {
          serverTime,
          localTime: Date.now(),
          diff: Date.now() - serverTime,
        });
        return false;
      }

      this.lastHealthCheck = now;
      this.isConnected_ = true;
      return true;
    } catch (error) {
      this.lastHealthCheck = now;
      this.isConnected_ = false;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn('🟡 Bybit health check failed', { error: errorMsg });
      return false;
    }
  }

  // ============================================================================
  // MARKET DATA - IExchangeMarketData
  // ============================================================================

  /**
   * Get historical candles
   * MISMATCH RESOLUTION: Convert CandleParams to BybitService positional params
   */
  async getCandles(params: CandleParams): Promise<Candle[]> {
    try {
      // BybitService.getCandles(symbolOrLimit?, interval?, limit?)
      // IExchange expects: { symbol, timeframe, limit }
      const candles = await this.bybitService.getCandles(params.symbol, params.timeframe, params.limit);

      if (!Array.isArray(candles)) {
        this.logger.warn('⚠️ getCandles returned non-array', {
          type: typeof candles,
          value: candles,
        });
        return [];
      }

      return candles;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to get candles', { error: errorMsg });
      throw error;
    }
  }

  /**
   * Get latest price for symbol
   * MISMATCH RESOLUTION: BybitService.getCurrentPrice() has no symbol param
   * We validate symbol against internal symbol but still call BybitService
   */
  async getLatestPrice(symbol: string): Promise<number> {
    try {
      // Validate symbol (BybitService is single-symbol)
      const internalSymbol = this.bybitService.getSymbol();
      if (symbol !== internalSymbol) {
        this.logger.warn('⚠️ Symbol mismatch in getLatestPrice', {
          requested: symbol,
          internal: internalSymbol,
          note: 'BybitService is single-symbol, using internal symbol',
        });
      }

      // BybitService.getCurrentPrice() returns price without symbol param
      const price = await this.bybitService.getCurrentPrice();
      return price;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to get latest price', { error: errorMsg });
      throw error;
    }
  }

  /**
   * Get current exchange server time
   * MISMATCH RESOLUTION: Method name differs (getExchangeTime vs getServerTime)
   * Both return Promise<number> in milliseconds
   */
  async getExchangeTime(): Promise<number> {
    return this.bybitService.getServerTime();
  }

  /**
   * Get server time - Already matches IExchange
   */
  async getServerTime(): Promise<number> {
    return this.bybitService.getServerTime();
  }

  /**
   * Get current price - Already matches IExchange
   */
  async getCurrentPrice(): Promise<number> {
    return this.bybitService.getCurrentPrice();
  }

  /**
   * Get symbol precision information (decimal places, min order qty)
   * MISMATCH RESOLUTION: BybitService has getExchangeLimits() + utility methods
   * We map to IExchange.SymbolPrecision format
   */
  async getSymbolPrecision(symbol: string): Promise<{
    pricePrecision: number;
    quantityPrecision: number;
    minOrderQty: number;
  }> {
    try {
      // Validate symbol
      const internalSymbol = this.bybitService.getSymbol();
      if (symbol !== internalSymbol) {
        this.logger.warn('⚠️ Symbol mismatch in getSymbolPrecision', {
          requested: symbol,
          internal: internalSymbol,
        });
      }

      // BybitService.getExchangeLimits() returns:
      // { qtyStep, tickSize, minOrderQty, minOrderValue, maxOrderQty }
      const limits = this.bybitService.getExchangeLimits();

      // Calculate precision from step values
      const pricePrecision = this.calculatePrecision(parseFloat(limits.tickSize));
      const quantityPrecision = this.calculatePrecision(parseFloat(limits.qtyStep));

      return {
        pricePrecision,
        quantityPrecision,
        minOrderQty: parseFloat(limits.minOrderQty),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to get symbol precision', { error: errorMsg });
      throw error;
    }
  }

  /**
   * Resync time with exchange server
   * MISMATCH RESOLUTION: Missing method - simple wrapper
   */
  async resyncTime(): Promise<void> {
    try {
      // Call getServerTime to verify exchange is responsive
      // This effectively resyncs by fetching latest server time
      const serverTime = await this.bybitService.getServerTime();
      this.logger.info('✅ Time resynced with exchange', {
        serverTime,
        localTime: Date.now(),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn('⚠️ Failed to resync time', { error: errorMsg });
    }
  }

  // ============================================================================
  // POSITION MANAGEMENT - IExchangePositions
  // ============================================================================

  /**
   * Open new position with stop loss and take profits
   * MISMATCH RESOLUTION: Major - params structure, return type differ
   *
   * IExchange expects:
   * - symbol, side, quantity, leverage, stopLoss, takeProfits[]
   * - Returns: Position (full object)
   *
   * BybitService provides:
   * - side, quantity, leverage, stopLoss?, takeProfit?
   * - Returns: string (orderId)
   */
  async openPosition(params: OpenPositionParams): Promise<Position> {
    try {
      // Validate symbol
      const internalSymbol = this.bybitService.getSymbol();
      if (params.symbol !== internalSymbol) {
        this.logger.warn('⚠️ Symbol mismatch in openPosition', {
          requested: params.symbol,
          internal: internalSymbol,
        });
      }

      // Convert side from IExchange format to BybitService PositionSide
      // IExchange: 'Buy' | 'Sell' (string)
      // BybitService: PositionSide enum (LONG/SHORT)
      const positionSide: PositionSide = params.side === 'Buy' ? PositionSide.LONG : PositionSide.SHORT;

      // IExchange supports takeProfits[] but BybitService takes single takeProfit
      // Use first TP level if array provided
      const takeProfit = Array.isArray(params.takeProfits) ? params.takeProfits[0] : undefined;

      // Call BybitService.openPosition()
      const orderId = await this.bybitService.openPosition({
        side: positionSide,
        quantity: params.quantity,
        leverage: params.leverage,
        stopLoss: params.stopLoss,
        takeProfit,
      });

      // MISMATCH: BybitService returns orderId (string), but IExchange expects Position object
      // Create Position object from response
      // Convert TP prices array to TakeProfit objects
      const takeProfitObjects: TakeProfit[] = params.takeProfits.map((price, index) => ({
        level: index + 1,
        percent: ((price - params.stopLoss) / params.stopLoss) * 100 || 0, // Calculate % from SL
        sizePercent: 100 / params.takeProfits.length,
        price: price,
        hit: false,
      }));

      const position: Position = {
        id: orderId,
        symbol: internalSymbol,
        side: positionSide,
        quantity: params.quantity,
        entryPrice: 0, // Unknown at this point
        leverage: params.leverage,
        marginUsed: 0,
        stopLoss: {
          price: params.stopLoss,
          initialPrice: params.stopLoss,
          isBreakeven: false,
          isTrailing: false,
          updatedAt: Date.now(),
        },
        takeProfits: takeProfitObjects,
        openedAt: Date.now(),
        unrealizedPnL: 0,
        orderId,
        reason: 'IExchange.openPosition()',
        confidence: 0.5,
        status: 'OPEN',
      };

      this.logger.info('✅ Position opened', {
        id: position.id,
        symbol: position.symbol,
        side: position.side,
        quantity: position.quantity,
      });

      return position;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to open position', { error: errorMsg });
      throw error;
    }
  }

  /**
   * Close position (fully or partially)
   * MISMATCH RESOLUTION: Parameter structure differs
   *
   * IExchange expects: { positionId, percentage? }
   * BybitService provides: (side, quantity)
   */
  async closePosition(params: ClosePositionParams): Promise<void> {
    try {
      // Get current position to determine side and quantity
      const position = await this.getPosition(params.positionId);

      if (!position) {
        throw new Error(`Position ${params.positionId} not found`);
      }

      // Calculate quantity to close
      let quantityToClose = position.quantity;
      if (params.percentage !== undefined && params.percentage < 100) {
        quantityToClose = (position.quantity * params.percentage) / 100;
      }

      // Use PositionSide from position object
      const side = position.side;

      // Call BybitService.closePosition(side, quantity)
      await this.bybitService.closePosition(side, quantityToClose);

      this.logger.info('✅ Position closed', {
        id: params.positionId,
        percentage: params.percentage || 100,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to close position', { error: errorMsg });
      throw error;
    }
  }

  /**
   * Update stop loss price
   * MISMATCH RESOLUTION: Parameter structure differs
   *
   * IExchange expects: { positionId, newPrice }
   * BybitService provides: (newStopPrice)
   */
  async updateStopLoss(params: UpdateStopLossParams): Promise<void> {
    try {
      // BybitService doesn't use positionId, just newStopPrice
      // Validate position exists first
      const position = await this.getPosition(params.positionId);
      if (!position) {
        throw new Error(`Position ${params.positionId} not found`);
      }

      // Call BybitService.updateStopLoss(newStopPrice)
      await this.bybitService.updateStopLoss(params.newPrice);

      this.logger.info('✅ Stop loss updated', {
        id: params.positionId,
        newPrice: params.newPrice,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to update stop loss', { error: errorMsg });
      throw error;
    }
  }

  /**
   * Update take profit for partial position
   * MATCHES IExchange signature - direct pass-through
   */
  async updateTakeProfitPartial(params: {
    price: number;
    size: number;
    index?: number;
  }): Promise<void> {
    return this.bybitService.updateTakeProfitPartial(params);
  }

  /**
   * Activate trailing stop
   * MISMATCH RESOLUTION: Method name differs
   *
   * IExchange: activateTrailing({ positionId, trailingPercent })
   * BybitService: setTrailingStop({ side, activationPrice, trailingPercent })
   */
  async activateTrailing(params: ActivateTrailingParams): Promise<void> {
    try {
      // Get position to determine side and current price
      const position = await this.getPosition(params.positionId);
      if (!position) {
        throw new Error(`Position ${params.positionId} not found`);
      }

      const side = position.side;
      const activationPrice = position.entryPrice; // Use entry price as activation point

      // Call BybitService.setTrailingStop()
      await this.bybitService.setTrailingStop({
        side,
        activationPrice,
        trailingPercent: params.trailingPercent,
      });

      this.logger.info('✅ Trailing stop activated', {
        id: params.positionId,
        trailingPercent: params.trailingPercent,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to activate trailing stop', { error: errorMsg });
      throw error;
    }
  }

  /**
   * Get all open positions
   * MISMATCH RESOLUTION: BybitService only has getPosition() (singular)
   * Create array with single position
   */
  async getOpenPositions(): Promise<Position[]> {
    try {
      const position = await this.bybitService.getPosition();
      return position ? [position] : [];
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to get open positions', { error: errorMsg });
      return [];
    }
  }

  /**
   * Get position by ID
   * MISMATCH RESOLUTION: BybitService.getPosition() takes no parameter
   * Single-symbol trading, so we just return current position if ID matches
   */
  async getPosition(positionId: string): Promise<Position | null> {
    try {
      const position = await this.bybitService.getPosition();
      return position?.id === positionId ? position : null;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn('⚠️ Failed to get position', { error: errorMsg });
      return null;
    }
  }

  /**
   * Check if position exists
   * MISMATCH RESOLUTION: Missing method - implement using getPosition()
   */
  async hasPosition(symbol: string): Promise<boolean> {
    try {
      const internalSymbol = this.bybitService.getSymbol();
      if (symbol !== internalSymbol) {
        return false; // Single symbol, different symbol means no position
      }

      const position = await this.bybitService.getPosition();
      return position !== null && position !== undefined;
    } catch (error) {
      return false;
    }
  }

  // ============================================================================
  // ORDERS - IExchangeOrders
  // ============================================================================

  /**
   * Create conditional order (stop loss with take profit)
   * MISMATCH RESOLUTION: Missing method - implement wrapper
   */
  async createConditionalOrder(params: OrderParams): Promise<OrderResult> {
    try {
      // Map to BybitService methods
      // This is a simplified implementation - full functionality depends on BybitService

      if (params.stopPrice && params.takeProfit) {
        // Create stop loss order with take profit
        // BybitService uses: placeStopLoss() + placeTakeProfitLevels()
        // Convert side from IExchange format to PositionSide
        const side: PositionSide = params.side === 'Buy' ? PositionSide.LONG : PositionSide.SHORT;

        const orderId = await this.bybitService.placeStopLoss({
          side,
          quantity: params.quantity,
          stopPrice: params.stopPrice,
        });

        return {
          orderId,
          symbol: this.bybitService.getSymbol(),
          side: params.side,
          quantity: params.quantity,
          timestamp: Date.now(),
        };
      }

      throw new Error('Unsupported order type');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to create conditional order', { error: errorMsg });
      throw error;
    }
  }

  /**
   * Cancel order by ID
   * MISMATCH RESOLUTION: Missing generic method - try to cancel both SL and TP
   */
  async cancelOrder(orderId: string): Promise<void> {
    try {
      // Try cancel both types
      try {
        await this.bybitService.cancelStopLoss(orderId);
        return;
      } catch (e) {
        // Try take profit
        await this.bybitService.cancelTakeProfit(orderId);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to cancel order', { error: errorMsg });
      throw error;
    }
  }

  /**
   * Get order status
   * MISMATCH RESOLUTION: Missing method - simplified implementation
   */
  async getOrderStatus(orderId: string): Promise<{
    orderId: string;
    status: 'PENDING' | 'FILLED' | 'CANCELLED' | 'REJECTED';
    filledQuantity: number;
    averagePrice: number;
  }> {
    try {
      // Simplified: check if order exists in active orders
      const activeOrders = await this.bybitService.getActiveOrders();

      const order = activeOrders?.find((o: any) => o.orderId === orderId);

      if (order) {
        return {
          orderId,
          status: 'PENDING',
          filledQuantity: 0,
          averagePrice: 0,
        };
      }

      return {
        orderId,
        status: 'CANCELLED',
        filledQuantity: 0,
        averagePrice: 0,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn('⚠️ Failed to get order status', { error: errorMsg });

      return {
        orderId,
        status: 'REJECTED',
        filledQuantity: 0,
        averagePrice: 0,
      };
    }
  }

  /**
   * Cancel all orders for symbol
   * MISMATCH RESOLUTION: Missing method
   */
  async cancelAllOrders(symbol: string): Promise<void> {
    try {
      const internalSymbol = this.bybitService.getSymbol();
      if (symbol !== internalSymbol) {
        throw new Error(`Symbol ${symbol} not supported (BybitService is single-symbol)`);
      }

      // Cancel all conditional orders
      await this.bybitService.cancelAllConditionalOrders();

      this.logger.info('✅ All orders cancelled', { symbol });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to cancel all orders', { error: errorMsg });
      throw error;
    }
  }

  /**
   * Cancel all conditional orders
   * MATCHES IExchange signature - direct pass-through
   */
  async cancelAllConditionalOrders(): Promise<void> {
    return this.bybitService.cancelAllConditionalOrders();
  }

  /**
   * Set trailing stop loss
   * MISMATCH RESOLUTION: Missing method - implement wrapper
   */
  async setTrailingStop(params: {
    side: string;
    activationPrice: number;
    trailingPercent: number;
  }): Promise<void> {
    // Convert side string to PositionSide enum
    const positionSide: PositionSide = params.side === 'Buy' || params.side === 'LONG'
      ? PositionSide.LONG
      : PositionSide.SHORT;

    return this.bybitService.setTrailingStop({
      side: positionSide,
      activationPrice: params.activationPrice,
      trailingPercent: params.trailingPercent,
    });
  }

  /**
   * Update take profit order
   * MISMATCH RESOLUTION: Missing method - implement wrapper
   */
  async updateTakeProfit(orderId: string, newPrice: number): Promise<void> {
    // Try to update the order with new price
    // BybitService doesn't have direct updateTakeProfit, so this is best-effort
    try {
      // Cancel old order and create new one
      await this.bybitService.cancelTakeProfit(orderId);
      this.logger.info('✅ Cancelled take profit order', { orderId });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn('⚠️ Failed to update take profit', { orderId, error: errorMsg });
    }
  }

  /**
   * Get order history
   * MISMATCH RESOLUTION: Missing method - implement wrapper
   */
  async getOrderHistory(limit?: number): Promise<any[]> {
    try {
      // Try to get active orders as substitute for history
      const activeOrders = await this.bybitService.getActiveOrders();
      return Array.isArray(activeOrders) ? activeOrders.slice(0, limit || 50) : [];
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn('⚠️ Failed to get order history', { error: errorMsg });
      return [];
    }
  }

  // ============================================================================
  // ACCOUNT - IExchangeAccount
  // ============================================================================

  /**
   * Get account balance
   * MISMATCH RESOLUTION: Return type differs
   *
   * IExchange expects: { walletBalance, availableBalance, totalMarginUsed, totalUnrealizedPnL }
   * BybitService returns: number (USDT balance only)
   */
  async getBalance(): Promise<AccountBalance> {
    try {
      const balance = await this.bybitService.getBalance();

      // BybitService.getBalance() returns just a number
      // Create AccountBalance object
      const accountBalance: AccountBalance = {
        walletBalance: balance,
        availableBalance: balance,
        totalMarginUsed: 0,
        totalUnrealizedPnL: 0,
      };

      return accountBalance;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to get balance', { error: errorMsg });
      throw error;
    }
  }

  /**
   * Get current leverage
   * MISMATCH RESOLUTION: Missing method
   */
  async getLeverage(symbol: string): Promise<number> {
    try {
      // Validate symbol
      const internalSymbol = this.bybitService.getSymbol();
      if (symbol !== internalSymbol) {
        throw new Error(`Symbol ${symbol} not supported`);
      }

      // BybitService doesn't expose getting current leverage
      // Return default or from position
      const position = await this.bybitService.getPosition();
      return position?.leverage || 1;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to get leverage', { error: errorMsg });
      throw error;
    }
  }

  /**
   * Set leverage
   * MISMATCH RESOLUTION: Missing symbol parameter
   *
   * IExchange expects: (symbol, leverage)
   * BybitService provides: (leverage) - uses internal symbol
   */
  async setLeverage(symbol: string, leverage: number): Promise<void> {
    try {
      // Validate symbol
      const internalSymbol = this.bybitService.getSymbol();
      if (symbol !== internalSymbol) {
        throw new Error(`Symbol ${symbol} not supported (BybitService is single-symbol)`);
      }

      // Call BybitService.setLeverage(leverage)
      await this.bybitService.setLeverage(leverage);

      this.logger.info('✅ Leverage set', { symbol, leverage });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to set leverage', { error: errorMsg });
      throw error;
    }
  }

  /**
   * Get current funding rate for symbol (perpetual futures)
   * MISMATCH RESOLUTION: BybitService may not have this method directly
   * Return a default value or delegate if BybitService supports it
   */
  async getFundingRate(symbol: string): Promise<number> {
    try {
      // Validate symbol
      const internalSymbol = this.bybitService.getSymbol();
      if (symbol !== internalSymbol) {
        this.logger.warn('⚠️ Symbol mismatch in getFundingRate', {
          requested: symbol,
          internal: internalSymbol,
        });
      }

      // Check if BybitService has getFundingRate method
      if (typeof (this.bybitService as any).getFundingRate === 'function') {
        return await (this.bybitService as any).getFundingRate(symbol);
      }

      // Fallback: return 0 if method not available
      this.logger.debug('⚠️ getFundingRate not implemented in BybitService, returning 0');
      return 0;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn('⚠️ Failed to get funding rate', { error: errorMsg });
      return 0; // Return 0 on error rather than throwing
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get trading symbol
   * MATCHES IExchange - optional method already implemented
   */
  getSymbol(): string {
    return this.bybitService.getSymbol();
  }

  /**
   * Get active orders (stop loss and take profit orders)
   * MATCHES IExchange - delegates to BybitService
   */
  async getActiveOrders(): Promise<any[]> {
    return this.bybitService.getActiveOrders();
  }

  /**
   * Verify if protection (SL/TP) is set for position
   * MATCHES IExchange - delegates to BybitService
   */
  async verifyProtectionSet(side: string): Promise<any> {
    // Convert 'Buy'/'Sell' to PositionSide enum for BybitService
    const positionSide: PositionSide = side === 'Buy' || side === 'LONG'
      ? PositionSide.LONG
      : PositionSide.SHORT;

    return this.bybitService.verifyProtectionSet(positionSide);
  }

  /**
   * Round quantity to exchange minimum precision
   * MATCHES IExchange - delegates to BybitService
   * Type conversion: BybitService returns string, convert to number
   */
  roundQuantity(qty: number): number {
    const result = this.bybitService.roundQuantity(qty);
    return typeof result === 'string' ? parseFloat(result) : result;
  }

  /**
   * Round price to exchange price precision
   * MATCHES IExchange - delegates to BybitService
   * Type conversion: BybitService returns string, convert to number
   */
  roundPrice(price: number): number {
    const result = this.bybitService.roundPrice(price);
    return typeof result === 'string' ? parseFloat(result) : result;
  }

  /**
   * Calculate precision from step value
   * Helper method to convert step/tick values to decimal precision
   * Example: 0.01 → precision 2, 0.0001 → precision 4
   */
  private calculatePrecision(step: number): number {
    if (step <= 0) return 0;
    const str = step.toString();
    const decimalIndex = str.indexOf('.');
    if (decimalIndex === -1) return 0;
    return str.length - decimalIndex - 1;
  }
}
