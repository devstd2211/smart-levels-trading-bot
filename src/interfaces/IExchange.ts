/**
 * Exchange Integration Interface
 *
 * Abstracts exchange-specific implementation (Bybit, Binance, etc.)
 * Allows swapping exchanges without changing bot logic
 */

import type { Candle, Position } from '../types/core';
import type { ProtectionVerification } from '../types';

// ============================================================================
// CANDLE & MARKET DATA
// ============================================================================

/**
 * Candle fetch parameters
 */
export interface CandleParams {
  symbol: string;
  timeframe: string;
  limit: number;
}

/**
 * Exchange market data methods
 */
export interface IExchangeMarketData {
  /**
   * Get historical candles
   */
  getCandles(params: CandleParams): Promise<Candle[]>;

  /**
   * Get latest price
   */
  getLatestPrice(symbol: string): Promise<number>;

  /**
   * Get current time from exchange
   */
  getExchangeTime(): Promise<number>;

  /**
   * Get server time (same as getExchangeTime, alternative name)
   */
  getServerTime(): Promise<number>;

  /**
   * Get current price (same as getLatestPrice, alternative name)
   */
  getCurrentPrice(): Promise<number>;

  /**
   * Get symbol precision info (decimal places for price/quantity)
   */
  getSymbolPrecision(symbol: string): Promise<{
    pricePrecision: number;
    quantityPrecision: number;
    minOrderQty: number;
  }>;

  /**
   * Resync time with exchange server
   */
  resyncTime?(): Promise<void>;
}

// ============================================================================
// POSITION MANAGEMENT
// ============================================================================

/**
 * Open position parameters
 */
export interface OpenPositionParams {
  symbol: string;
  side: 'Buy' | 'Sell';
  quantity: number;
  leverage: number;
  stopLoss: number;
  takeProfits: number[]; // array of TP prices
}

/**
 * Position update result
 */
export interface PositionUpdateResult {
  success: boolean;
  positionId?: string;
  error?: Error;
}

/**
 * Stop loss update parameters
 */
export interface UpdateStopLossParams {
  positionId: string;
  newPrice: number;
}

/**
 * Trailing stop parameters
 */
export interface ActivateTrailingParams {
  positionId: string;
  trailingPercent: number;
}

/**
 * Close position parameters
 */
export interface ClosePositionParams {
  positionId: string;
  percentage?: number; // 0-100, default 100 (close all)
}

/**
 * Exchange position management methods
 */
export interface IExchangePositions {
  /**
   * Open new position with SL and TP
   */
  openPosition(params: OpenPositionParams): Promise<Position>;

  /**
   * Close position (fully or partially)
   */
  closePosition(params: ClosePositionParams): Promise<void>;

  /**
   * Update stop loss
   */
  updateStopLoss(params: UpdateStopLossParams): Promise<void>;

  /**
   * Update take profit for partial position (Bybit specific)
   */
  updateTakeProfitPartial?(params: { price: number; size: number; index?: number }): Promise<void>;

  /**
   * Activate trailing stop
   */
  activateTrailing(params: ActivateTrailingParams): Promise<void>;

  /**
   * Get all open positions
   */
  getOpenPositions(): Promise<Position[]>;

  /**
   * Get position by ID
   */
  getPosition(positionId: string): Promise<Position | null>;

  /**
   * Check if position exists
   */
  hasPosition(symbol: string): Promise<boolean>;
}

// ============================================================================
// ORDERS
// ============================================================================

/**
 * Order parameters
 */
export interface OrderParams {
  symbol: string;
  side: 'Buy' | 'Sell';
  quantity: number;
  price?: number; // for limit orders
  stopPrice?: number; // for conditional orders
  takeProfit?: number; // for conditional orders
}

/**
 * Order result
 */
export interface OrderResult {
  orderId: string;
  symbol: string;
  side: string;
  quantity: number;
  timestamp: number;
}

/**
 * Exchange order methods
 */
export interface IExchangeOrders {
  /**
   * Create conditional order (stop loss with take profit)
   */
  createConditionalOrder(params: OrderParams): Promise<OrderResult>;

  /**
   * Cancel order
   */
  cancelOrder(orderId: string): Promise<void>;

  /**
   * Get order status
   */
  getOrderStatus(orderId: string): Promise<{
    orderId: string;
    status: 'PENDING' | 'FILLED' | 'CANCELLED' | 'REJECTED';
    filledQuantity: number;
    averagePrice: number;
  }>;

  /**
   * Cancel all hanging orders
   */
  cancelAllOrders(symbol: string): Promise<void>;

  /**
   * Cancel all conditional orders (stop loss, take profit)
   */
  cancelAllConditionalOrders(): Promise<void>;

  /**
   * Set trailing stop loss
   */
  setTrailingStop?(params: { side: string; activationPrice: number; trailingPercent: number }): Promise<void>;

  /**
   * Update take profit order
   */
  updateTakeProfit?(orderId: string, newPrice: number): Promise<void>;

  /**
   * Get order history
   */
  getOrderHistory?(limit?: number): Promise<any[]>;
}

// ============================================================================
// ACCOUNT
// ============================================================================

/**
 * Account balance info
 */
export interface AccountBalance {
  walletBalance: number;
  availableBalance: number;
  totalMarginUsed: number;
  totalUnrealizedPnL: number;
}

/**
 * Exchange account methods
 */
export interface IExchangeAccount {
  /**
   * Get account balance
   */
  getBalance(): Promise<AccountBalance>;

  /**
   * Get leverage
   */
  getLeverage(symbol: string): Promise<number>;

  /**
   * Set leverage
   */
  setLeverage(symbol: string, leverage: number): Promise<void>;
}

// ============================================================================
// MAIN EXCHANGE INTERFACE
// ============================================================================

/**
 * Main exchange interface
 * Implementations: BybitService, BinanceService, etc.
 */
export interface IExchange
  extends IExchangeMarketData,
    IExchangePositions,
    IExchangeOrders,
    IExchangeAccount {
  /**
   * Exchange name identifier
   */
  readonly name: string;

  /**
   * Get trading symbol
   */
  getSymbol?(): string;

  /**
   * Connect to exchange (if needed)
   */
  connect(): Promise<void>;

  /**
   * Disconnect from exchange
   */
  disconnect(): Promise<void>;

  /**
   * Check if connected
   */
  isConnected(): boolean;

  /**
   * Health check
   */
  healthCheck(): Promise<boolean>;

  // ============================================================================
  // HELPER METHODS (Exchange-Specific Utilities)
  // ============================================================================

  /**
   * Get active orders (stop loss and take profit orders)
   */
  getActiveOrders?(): Promise<any[]>;

  /**
   * Verify if protection (SL/TP) is set for position
   */
  verifyProtectionSet?(side: string): Promise<ProtectionVerification>;

  /**
   * Round quantity to exchange minimum precision
   * Example: 0.123456789 → 0.123456 (6 decimal places for BTC)
   */
  roundQuantity?(qty: number): number;

  /**
   * Round price to exchange price precision
   * Example: 45123.456789 → 45123.45 (2 decimal places)
   */
  roundPrice?(price: number): number;
}
