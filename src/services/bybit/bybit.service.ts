/**
 * Bybit API Service - Main Orchestrator
 *
 * Composed from modular partial classes:
 * - BybitBase: Shared utilities (retry, rounding, balance)
 * - BybitMarketData: Public API (candles, price, time, orderbook)
 * - BybitPositions: Position management (open, close, leverage)
 * - BybitOrders: Order management (TP, SL, trailing stop)
 *
 * Uses official Bybit SDK (RestClientV5) for futures trading.
 * Supports Demo/Testnet/Production environments.
 */

import { RestClientV5 } from 'bybit-api';
import {
  ExchangeConfig,
  LoggerService,
  PositionSide,
  TakeProfit,
} from '../../types';
import { INTEGER_MULTIPLIERS } from '../../constants';
import { BybitBase, RECV_WINDOW } from './bybit-base.partial';
import { BybitMarketData } from './bybit-market-data.partial';
import { BybitPositions } from './bybit-positions.partial';
import { BybitOrders } from './bybit-orders.partial';
import { isCriticalApiError } from '../../utils/error-helper';

// ============================================================================
// BYBIT SERVICE (MAIN ORCHESTRATOR)
// ============================================================================

export class BybitService {
  // Partial class instances (composition pattern)
  private readonly base: BybitBase;
  private readonly marketData: BybitMarketData;
  private readonly positions: BybitPositions;
  private readonly orders: BybitOrders;

  // Logger and time sync
  private readonly logger: LoggerService;

  // Expose symbol and timeframe for backward compatibility
  private readonly symbol: string;
  private readonly timeframe: string;

  private originalDateNow = Date.now;
  private timeOffsetMs: number = 0;

  constructor(config: ExchangeConfig, logger: LoggerService) {
    this.logger = logger;
    this.symbol = config.symbol;
    this.timeframe = config.timeframe;

    // Initialize RestClientV5
    const clientConfig: {
      key: string;
      secret: string;
      testnet?: boolean;
      baseUrl?: string;
      recv_window?: number;
      sync_time_api?: boolean; // Enable Bybit SDK time sync
    } = {
      key: config.apiKey,
      secret: config.apiSecret,
      recv_window: RECV_WINDOW,
      sync_time_api: false, // SDK sync doesn't work - we'll do manual offset
    };

    // Select environment
    if (config.demo) {
      clientConfig.testnet = false;
      clientConfig.baseUrl = 'https://api-demo.bybit.com';
      logger.info('Bybit Demo API initialized', { baseUrl: clientConfig.baseUrl });
    } else if (config.testnet) {
      clientConfig.testnet = true;
      logger.info('Bybit Testnet API initialized');
    } else {
      clientConfig.testnet = false;
      logger.info('Bybit Production API initialized');
    }

    const restClient = new RestClientV5(clientConfig);

    // Instantiate partial classes
    this.base = new BybitBase(restClient, config.symbol, config.timeframe, logger, config.demo);
    this.marketData = new BybitMarketData(restClient, config.symbol, config.timeframe, logger, config.demo);
    this.positions = new BybitPositions(restClient, config.symbol, config.timeframe, logger, config.demo);
    this.orders = new BybitOrders(restClient, config.symbol, config.timeframe, logger, config.demo);
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize service - load symbol precision parameters
   * Must be called after construction, before trading
   */
  async initialize(): Promise<void> {
    await this.base.initialize();

    // CRITICAL: Share precision data with all partial instances
    // Only base.initialize() makes the API call - other instances reuse the data
    const limits = this.base.getExchangeLimits();
    this.orders.setPrecision(limits.qtyStep, limits.tickSize, limits.minOrderQty);
    this.positions.setPrecision(limits.qtyStep, limits.tickSize, limits.minOrderQty);
    this.marketData.setPrecision(limits.qtyStep, limits.tickSize, limits.minOrderQty);

    // CRITICAL: Apply time offset correction after initialization
    // BybitBase.initialize() calculates timeOffsetMs from server
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const baseOffset = (this.base as unknown as { timeOffsetMs: number }).timeOffsetMs || 0;
    this.applyTimeOffset(baseOffset);
  }

  /**
   * Apply time offset correction via Date.now() monkey-patch
   * CRITICAL: Prevents timestamp errors when local clock is ahead
   *
   * IMPORTANT: ALWAYS apply monkey-patch, even for small offsets!
   * Reason: Drift grows over time (e.g., 50ms → 1500ms in hours)
   * and we have NO periodic sync to update it.
   */
  private applyTimeOffset(offsetMs: number): void {
    this.timeOffsetMs = offsetMs;

    // ALWAYS monkey-patch Date.now() - drift grows over time!
    const correctedDateNow = (): number => {
      return this.originalDateNow() - this.timeOffsetMs;
    };

    // Apply global monkey-patch (affects Bybit SDK internal timestamp generation)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (Date as { now: () => number }).now = correctedDateNow;

    // Log only significant offsets to reduce noise
    if (Math.abs(offsetMs) > INTEGER_MULTIPLIERS.ONE_HUNDRED) {
      this.logger.info('⏰ Time offset applied (Date.now() monkey-patched)', {
        offsetMs
      });
    }
  }

  /**
   * Re-synchronize time offset with Bybit server
   * CRITICAL: Call this periodically to prevent drift accumulation
   *
   * Recommended: Every 5 minutes during bot operation
   */
  async resyncTime(): Promise<void> {
    try {
      // Get server time in milliseconds (already converted by getServerTime())
      const serverTimeMs = await this.marketData.getServerTime();
      const localTime = this.originalDateNow();
      const oldOffset = this.timeOffsetMs;
      const newOffset = localTime - serverTimeMs;

      // Update offset and re-apply monkey-patch
      this.applyTimeOffset(newOffset);

      this.logger.debug('⏰ Time re-synchronized', {
        oldOffsetMs: oldOffset,
        newOffsetMs: newOffset,
        driftChange: newOffset - oldOffset,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if this is a critical error
      if (isCriticalApiError(error)) {
        this.logger.error('🚨 CRITICAL API ERROR in resyncTime - throwing!', {
          error: errorMessage,
          isCritical: true,
        });
        throw error; // Re-throw critical errors
      }

      this.logger.warn('Failed to re-sync time:', {
        error: errorMessage,
      });
    }
  }

  // ==========================================================================
  // MARKET DATA (delegate to BybitMarketData partial)
  // ==========================================================================

  async getCandles(symbolOrLimit?: string | number, interval?: string, limit?: number) {
    return this.marketData.getCandles(symbolOrLimit, interval, limit);
  }

  async getCurrentPrice() {
    return this.marketData.getCurrentPrice();
  }

  async getServerTime() {
    return this.marketData.getServerTime();
  }

  async getOrderBook(symbol?: string, limit?: number) {
    return this.marketData.getOrderBook(symbol, limit);
  }

  async getFundingRate(symbol?: string) {
    return this.marketData.getFundingRate(symbol);
  }

  // ==========================================================================
  // POSITIONS (delegate to BybitPositions partial)
  // ==========================================================================

  async setMarginMode() {
    return this.positions.setMarginMode();
  }

  async setLeverage(leverage: number) {
    return this.positions.setLeverage(leverage);
  }

  async openPosition(params: {
    side: PositionSide;
    quantity: number;
    leverage: number;
    stopLoss?: number;
    takeProfit?: number;
  }) {
    return this.positions.openPosition(params);
  }

  async getPosition() {
    return this.positions.getPosition();
  }

  async closePosition(side: PositionSide, quantity: number) {
    return this.positions.closePosition(side, quantity);
  }

  // ==========================================================================
  // ORDERS (delegate to BybitOrders partial)
  // ==========================================================================

  async placeTakeProfitLevels(params: { side: PositionSide; entryPrice: number; totalQuantity: number; levels: TakeProfit[] }) {
    return this.orders.placeTakeProfitLevels(params);
  }

  async cancelTakeProfit(orderId: string) {
    return this.orders.cancelTakeProfit(orderId);
  }

  async updateTakeProfit(orderId: string, newPrice: number) {
    return this.orders.updateTakeProfit(orderId, newPrice);
  }

  async updateTakeProfitPartial(params: { price: number; size: number; index?: number }) {
    return this.orders.updateTakeProfitPartial(params);
  }

  async placeStopLoss(params: { side: PositionSide; quantity: number; stopPrice: number }) {
    return this.orders.placeStopLoss(params);
  }

  async updateStopLoss(newStopPrice: number) {
    return this.orders.updateStopLoss(newStopPrice);
  }

  async cancelStopLoss(orderId: string) {
    return this.orders.cancelStopLoss(orderId);
  }

  async setTrailingStop(params: { side: PositionSide; activationPrice: number; trailingPercent: number }) {
    return this.orders.setTrailingStop(params);
  }

  async getActiveOrders() {
    return this.orders.getActiveOrders();
  }

  async getOrderHistory(limit?: number) {
    return this.orders.getOrderHistory(limit);
  }

  async verifyProtectionSet(side: PositionSide) {
    return this.orders.verifyProtectionSet(side);
  }

  async cancelAllConditionalOrders() {
    return this.orders.cancelAllConditionalOrders();
  }

  // ==========================================================================
  // BALANCE (delegate to BybitBase partial)
  // ==========================================================================

  async getBalance() {
    return this.base.getBalance();
  }

  getExchangeLimits() {
    return this.base.getExchangeLimits();
  }

  // ==========================================================================
  // UTILITY METHODS (delegate to BybitBase partial)
  // Phase 2: Made public for LimitOrderExecutorService
  // ==========================================================================

  /**
   * Get RestClient instance
   * Delegates to BybitBase.getRestClient()
   */
  getRestClient() {
    return this.base.getRestClient();
  }

  /**
   * Get trading symbol
   * Delegates to BybitBase.getSymbol()
   */
  getSymbol() {
    return this.base.getSymbol();
  }

  /**
   * Round quantity to exchange precision
   * Delegates to BybitBase.roundQuantity()
   */
  roundQuantity(qty: number) {
    return this.base.roundQuantity(qty);
  }

  /**
   * Round price to exchange precision
   * Delegates to BybitBase.roundPrice()
   */
  roundPrice(price: number) {
    return this.base.roundPrice(price);
  }
}
