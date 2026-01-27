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
import type { IMarketDataRepository } from '../../repositories/IRepositories';
import { ErrorHandler, RecoveryStrategy } from '../../errors';

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

  // Phase 6.2: Market data repository for candle caching
  private readonly marketDataRepository?: IMarketDataRepository;

  // Expose symbol and timeframe for backward compatibility
  private readonly symbol: string;
  private readonly timeframe: string;

  private originalDateNow = Date.now;
  private timeOffsetMs: number = 0;

  constructor(
    config: ExchangeConfig,
    logger: LoggerService,
    marketDataRepository?: IMarketDataRepository
  ) {
    this.logger = logger;
    this.symbol = config.symbol;
    this.timeframe = config.timeframe;
    this.marketDataRepository = marketDataRepository;

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
      sync_time_api: true, // CRITICAL FIX: SDK will sync time with server before each request
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
   *
   * Phase 8.3: ErrorHandler integration - RETRY strategy for API calls
   */
  async initialize(): Promise<void> {
    // Phase 8.3: Wrap base.initialize() with ErrorHandler for telemetry
    const initResult = await ErrorHandler.executeAsync(
      () => this.base.initialize(),
      {
        strategy: RecoveryStrategy.RETRY,
        retryConfig: {
          maxAttempts: 3,
          initialDelayMs: 1000,
          backoffMultiplier: 2,
          maxDelayMs: 5000,
        },
        logger: this.logger,
        context: 'BybitService.initialize',
        onRetry: (attempt, error, delayMs) => {
          this.logger.warn('⚠️ Initialization retry', {
            attempt,
            delayMs,
            error: error.message,
          });
        },
        onRecover: (strategy, attemptsUsed) => {
          this.logger.info('✅ Initialization succeeded after retry', {
            strategy,
            attemptsUsed,
          });
        },
      }
    );

    if (!initResult.success) {
      throw initResult.error;
    }

    // CRITICAL: Share precision data with all partial instances
    // Only base.initialize() makes the API call - other instances reuse the data
    const limits = this.base.getExchangeLimits();
    this.orders.setPrecision(limits.qtyStep, limits.tickSize, limits.minOrderQty);
    this.positions.setPrecision(limits.qtyStep, limits.tickSize, limits.minOrderQty);
    this.marketData.setPrecision(limits.qtyStep, limits.tickSize, limits.minOrderQty);

    // Phase 6.2: Share repository with partial instances for candle caching
    if (this.marketDataRepository) {
      this.marketData.setMarketDataRepository(this.marketDataRepository);
      this.logger.debug('✅ Market data repository shared with BybitMarketData');
    }

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

  /**
   * Get candles with ErrorHandler integration for telemetry (Phase 8.3)
   */
  async getCandles(symbolOrLimit?: string | number, interval?: string, limit?: number) {
    // Phase 8.3: Wrap with ErrorHandler for telemetry (Phase 6.2 caching already handles fallback)
    const result = await ErrorHandler.executeAsync(
      () => this.marketData.getCandles(symbolOrLimit, interval, limit),
      {
        strategy: RecoveryStrategy.RETRY,
        retryConfig: {
          maxAttempts: 3,
          initialDelayMs: 1000,
          backoffMultiplier: 2,
          maxDelayMs: 5000,
        },
        logger: this.logger,
        context: 'BybitService.getCandles',
        onRetry: (attempt, error, delayMs) => {
          this.logger.debug('⚠️ Candle fetch retry', { attempt, delayMs, error: error.message });
        },
      }
    );

    if (!result.success) {
      throw result.error;
    }

    return result.value;
  }

  async getCurrentPrice(): Promise<number> {
    return this.marketData.getCurrentPrice();
  }

  async getServerTime(): Promise<number> {
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

  /**
   * Open new position with ErrorHandler integration (Phase 8.3)
   */
  async openPosition(params: {
    side: PositionSide;
    quantity: number;
    leverage: number;
    stopLoss?: number;
    takeProfit?: number;
  }) {
    // Phase 8.3: Wrap with ErrorHandler for telemetry and error classification
    const result = await ErrorHandler.executeAsync(
      () => this.positions.openPosition(params),
      {
        strategy: RecoveryStrategy.RETRY,
        retryConfig: {
          maxAttempts: 3,
          initialDelayMs: 500,
          backoffMultiplier: 2,
          maxDelayMs: 5000,
        },
        logger: this.logger,
        context: 'BybitService.openPosition',
        onRetry: (attempt, error, delayMs) => {
          this.logger.warn('⚠️ Position open retry', {
            attempt,
            delayMs,
            side: params.side,
            quantity: params.quantity,
            error: error.message,
          });
        },
        onRecover: (strategy, attemptsUsed) => {
          this.logger.info('✅ Position opened after retry', {
            strategy,
            attemptsUsed,
            side: params.side,
            quantity: params.quantity,
          });
        },
      }
    );

    if (!result.success) {
      throw result.error;
    }

    return result.value;
  }

  async getPosition() {
    return this.positions.getPosition();
  }

  /**
   * Close position with ErrorHandler integration (Phase 8.3)
   * Idempotent: "position already closed" is treated as success
   */
  async closePosition(side: PositionSide, quantity: number) {
    // Phase 8.3: Wrap with ErrorHandler with special handling for already-closed positions
    const result = await ErrorHandler.executeAsync(
      () => this.positions.closePosition(side, quantity),
      {
        strategy: RecoveryStrategy.RETRY,
        retryConfig: {
          maxAttempts: 3,
          initialDelayMs: 500,
          backoffMultiplier: 2,
          maxDelayMs: 5000,
        },
        logger: this.logger,
        context: 'BybitService.closePosition',
        onRetry: (attempt, error, delayMs) => {
          // Check if position is already closed (expected race condition)
          if (error.message.includes('not found') || error.message.includes('zero position')) {
            this.logger.debug('⚠️ Position already closed - skipping retry', { side, quantity });
            return;
          }

          this.logger.warn('⚠️ Position close retry', {
            attempt,
            delayMs,
            side,
            quantity,
            error: error.message,
          });
        },
      }
    );

    // [P3] Idempotent behavior: treat already-closed as success
    if (!result.success) {
      const errorMsg = result.error?.message || '';
      if (errorMsg.includes('not found') || errorMsg.includes('zero position')) {
        this.logger.debug('✅ Position close skipped - already closed', { side, quantity });
        return; // Treat as success
      }

      throw result.error;
    }

    return result.value;
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

  async updateTakeProfitPartial(params: { price: number; size: number; index?: number }): Promise<void> {
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

  /**
   * Verify protection orders with ErrorHandler integration (Phase 8.3)
   * Uses GRACEFUL_DEGRADE: returns conservative fallback on API failure
   */
  async verifyProtectionSet(side: PositionSide) {
    // Phase 8.3: Wrap with ErrorHandler using GRACEFUL_DEGRADE strategy
    const result = await ErrorHandler.executeAsync(
      () => this.orders.verifyProtectionSet(side),
      {
        strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
        logger: this.logger,
        context: 'BybitService.verifyProtectionSet',
        onRecover: (strategy, attemptsUsed) => {
          this.logger.warn('⚠️ Protection verification degraded - assuming no protection', {
            side,
            strategy,
          });
        },
      }
    );

    // [GRACEFUL_DEGRADE] Return conservative assumption if API fails
    if (!result.success) {
      this.logger.warn('⚠️ Failed to verify protection - assuming no SL/TP set', {
        side,
        error: result.error?.message,
      });

      return {
        hasStopLoss: false,
        hasTakeProfit: false,
        stopLossPrice: null,
        takeProfitPrice: null,
      };
    }

    return result.value;
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
  getSymbol(): string {
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
