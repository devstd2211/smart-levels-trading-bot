import { DECIMAL_PLACES, PERCENT_MULTIPLIER, INTEGER_MULTIPLIERS } from '../constants';
/**
 * Limit Order Executor Service (Phase 2)
 *
 * Executes trades using limit orders instead of market orders
 * for fee savings (0.01% maker vs 0.06% taker = 0.05% savings).
 *
 * Features:
 * - Place limit orders at bid/ask with minimal slippage
 * - Wait for fill with configurable timeout
 * - Automatic fallback to market order if not filled
 * - Retry logic with max attempts
 * - Detailed execution statistics
 */

import {
  LoggerService,
  SignalDirection,
  PositionSide,
  LimitOrderExecutorConfig,
  LimitOrderResult,
  MarketOrderResult,
} from '../types';
import { BybitService } from './bybit/bybit.service';
import { MAKER_FEE_PERCENT, TAKER_FEE_PERCENT, ORDER_CHECK_INTERVAL_MS } from '../constants/technical.constants';

// ============================================================================
// CONSTANTS
// ============================================================================

const BYBIT_SUCCESS_CODE = INTEGER_MULTIPLIERS.ZERO;
const POSITION_IDX_ONE_WAY = INTEGER_MULTIPLIERS.ZERO;

// ============================================================================
// LIMIT ORDER EXECUTOR SERVICE
// ============================================================================

export class LimitOrderExecutorService {
  constructor(
    private config: LimitOrderExecutorConfig,
    private bybitService: BybitService,
    private logger: LoggerService,
  ) {
    this.logger.info('LimitOrderExecutorService initialized', {
      enabled: config.enabled,
      timeoutMs: config.timeoutMs,
      slippagePercent: config.slippagePercent,
      fallbackToMarket: config.fallbackToMarket,
      maxRetries: config.maxRetries,
    });
  }

  // ==========================================================================
  // PUBLIC METHODS
  // ==========================================================================

  /**
   * Calculate optimal limit price for entry
   *
   * For LONG: Place limit order below current ask (bid side)
   * For SHORT: Place limit order above current bid (ask side)
   *
   * @param direction - Signal direction (LONG/SHORT)
   * @param currentPrice - Current market price
   * @param slippagePercent - Slippage % (e.g., 0.02 = 0.02%)
   * @returns Calculated limit price
   */
  calculateLimitPrice(
    direction: SignalDirection,
    currentPrice: number,
    slippagePercent: number,
  ): number {
    if (direction === SignalDirection.LONG) {
      // LONG: Place bid below ask to get filled as maker
      // Example: ask = 100, slippage = 0.02% → limit = 99.98
      return currentPrice * (1 - slippagePercent / PERCENT_MULTIPLIER);
    } else {
      // SHORT: Place ask above bid to get filled as maker
      // Example: bid = 100, slippage = 0.02% → limit = 100.02
      return currentPrice * (1 + slippagePercent / PERCENT_MULTIPLIER);
    }
  }

  /**
   * Place limit order with retry logic
   *
   * @param direction - Signal direction (LONG/SHORT)
   * @param quantity - Order quantity (contracts)
   * @param limitPrice - Limit price
   * @param leverage - Position leverage
   * @returns LimitOrderResult with order details
   */
  async placeLimitOrder(
    direction: SignalDirection,
    quantity: number,
    limitPrice: number,
    leverage: number,
  ): Promise<LimitOrderResult> {
    const startTime = Date.now();
    let lastError: Error | undefined;

    // Retry logic
    for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt++) {
      try {
        this.logger.info('📝 Placing limit order', {
          attempt,
          maxAttempts: this.config.maxRetries + 1,
          direction,
          quantity,
          limitPrice,
          leverage,
        });

        // Set leverage first
        await this.bybitService.setLeverage(leverage);

        // Round quantity and price to exchange precision
        const orderQty = this.bybitService.roundQuantity(quantity);
        const orderPrice = this.bybitService.roundPrice(limitPrice);

        // Submit limit order
        const response = await this.bybitService.getRestClient().submitOrder({
          category: 'linear',
          symbol: this.bybitService.getSymbol(),
          side: direction === SignalDirection.LONG ? 'Buy' : 'Sell',
          orderType: 'Limit',
          qty: orderQty,
          price: orderPrice,
          timeInForce: 'GTC', // Good Till Cancelled
          positionIdx: POSITION_IDX_ONE_WAY,
        });

        if (response.retCode !== BYBIT_SUCCESS_CODE) {
          throw new Error(`Failed to place limit order: ${response.retMsg}`);
        }

        const orderId = response.result.orderId;
        const executionTime = Date.now() - startTime;

        this.logger.info('✅ Limit order placed successfully', {
          orderId,
          direction,
          quantity: orderQty,
          limitPrice: orderPrice,
          executionTime,
        });

        return {
          orderId,
          filled: false, // Order placed but not filled yet
          feePaid: 0, // Fee will be calculated after fill
          executionTime,
        };
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Limit order placement failed (attempt ${attempt})`, {
          error: error instanceof Error ? error.message : String(error),
        });

        // Retry only if we have attempts left
        if (attempt < this.config.maxRetries + 1) {
          await this.sleep(500); // Wait 500ms before retry
        }
      }
    }

    // All retries failed
    throw new Error(
      `Failed to place limit order after ${this.config.maxRetries + 1} attempts: ${lastError?.message}`,
    );
  }

  /**
   * Wait for limit order to fill with timeout
   *
   * Checks order status every 200ms until filled or timeout
   *
   * @param orderId - Order ID to monitor
   * @param timeoutMs - Max wait time (ms)
   * @returns True if filled, false if timeout
   */
  async waitForFill(orderId: string, timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const endTime = startTime + timeoutMs;

    this.logger.debug('⏳ Waiting for limit order fill', {
      orderId,
      timeoutMs,
    });

    while (Date.now() < endTime) {
      try {
        // Get order status
        const response = await this.bybitService.getRestClient().getActiveOrders({
          category: 'linear',
          symbol: this.bybitService.getSymbol(),
          orderId,
        });

        if (response.retCode !== BYBIT_SUCCESS_CODE) {
          this.logger.warn('Failed to check order status', {
            orderId,
            error: response.retMsg,
          });
          await this.sleep(ORDER_CHECK_INTERVAL_MS);
          continue;
        }

        const orders = response.result?.list || [];

        // If order not in active list, it was filled or cancelled
        if (orders.length === 0) {
          // Check order history to confirm fill
          const historyResponse = await this.bybitService.getRestClient().getHistoricOrders({
            category: 'linear',
            symbol: this.bybitService.getSymbol(),
            orderId,
          });

          if (historyResponse.retCode === BYBIT_SUCCESS_CODE) {
            const historicOrders = historyResponse.result?.list || [];
            if (historicOrders.length > 0) {
              const order = historicOrders[0];
              const filled = order.orderStatus === 'Filled';

              this.logger.info(filled ? '✅ Limit order filled' : '❌ Limit order not filled', {
                orderId,
                status: order.orderStatus,
                fillPrice: order.avgPrice,
                executionTime: Date.now() - startTime,
              });

              return filled;
            }
          }
        }

        // Order still active, wait and check again
        await this.sleep(ORDER_CHECK_INTERVAL_MS);
      } catch (error) {
        this.logger.warn('Error checking order status', {
          orderId,
          error: error instanceof Error ? error.message : String(error),
        });
        await this.sleep(ORDER_CHECK_INTERVAL_MS);
      }
    }

    // Timeout reached
    const executionTime = Date.now() - startTime;
    this.logger.warn('⏱️ Limit order fill timeout', {
      orderId,
      timeoutMs,
      executionTime,
    });

    return false;
  }

  /**
   * Cancel unfilled limit order
   *
   * @param orderId - Order ID to cancel
   * @returns True if cancelled successfully
   */
  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      this.logger.info('🚫 Cancelling unfilled limit order', { orderId });

      const response = await this.bybitService.getRestClient().cancelOrder({
        category: 'linear',
        symbol: this.bybitService.getSymbol(),
        orderId,
      });

      if (response.retCode !== BYBIT_SUCCESS_CODE) {
        // Order might already be filled or cancelled
        if (response.retMsg.includes('not exists') || response.retMsg.includes('too late')) {
          this.logger.warn('Order already filled or cancelled', {
            orderId,
            reason: response.retMsg,
          });
          return false;
        }

        throw new Error(`Failed to cancel order: ${response.retMsg}`);
      }

      this.logger.info('✅ Order cancelled successfully', { orderId });
      return true;
    } catch (error) {
      this.logger.error('Failed to cancel order', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Fallback to market order execution
   *
   * Used when limit order times out or fails
   *
   * @param direction - Signal direction (LONG/SHORT)
   * @param quantity - Order quantity (contracts)
   * @param leverage - Position leverage
   * @returns MarketOrderResult with execution details
   */
  async fallbackToMarket(
    direction: SignalDirection,
    quantity: number,
    leverage: number,
  ): Promise<MarketOrderResult> {
    const startTime = Date.now();

    this.logger.info('🔄 Falling back to market order', {
      direction,
      quantity,
      leverage,
    });

    try {
      // Use existing BybitService.openPosition for market order
      const side = direction === SignalDirection.LONG ? PositionSide.LONG : PositionSide.SHORT;

      const orderId = await this.bybitService.openPosition({
        side,
        quantity,
        leverage,
      });

      // Get order details to find fill price
      const response = await this.bybitService.getRestClient().getHistoricOrders({
        category: 'linear',
        symbol: this.bybitService.getSymbol(),
        orderId,
        limit: 1,
      });

      let fillPrice = 0;
      if (response.retCode === BYBIT_SUCCESS_CODE && response.result?.list?.length > 0) {
        const order = response.result.list[0];
        fillPrice = parseFloat(order.avgPrice || '0');
      }

      const executionTime = Date.now() - startTime;

      // Calculate taker fee (0.06%)
      const feePaid = (quantity * fillPrice * TAKER_FEE_PERCENT) / PERCENT_MULTIPLIER;

      this.logger.info('✅ Market order executed', {
        orderId,
        fillPrice,
        feePaid,
        executionTime,
      });

      return {
        orderId: orderId || 'unknown',
        filled: true as const, // Market orders are always filled
        fillPrice,
        feePaid,
        executionTime,
      };
    } catch (error) {
      this.logger.error('Failed to execute market order', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Execute entry with limit order and optional market fallback
   *
   * Main entry point for limit order execution:
   * 1. Calculate limit price
   * 2. Place limit order
   * 3. Wait for fill with timeout
   * 4. If not filled → cancel and fallback to market (if enabled)
   *
   * @param direction - Signal direction (LONG/SHORT)
   * @param quantity - Order quantity (contracts)
   * @param currentPrice - Current market price
   * @param leverage - Position leverage
   * @returns Execution result (limit or market)
   */
  async executeEntry(
    direction: SignalDirection,
    quantity: number,
    currentPrice: number,
    leverage: number,
  ): Promise<LimitOrderResult | MarketOrderResult> {
    if (!this.config.enabled) {
      this.logger.warn('Limit order execution disabled, using market order');
      return await this.fallbackToMarket(direction, quantity, leverage);
    }

    try {
      // 1. Calculate limit price
      const limitPrice = this.calculateLimitPrice(
        direction,
        currentPrice,
        this.config.slippagePercent,
      );

      this.logger.info('📊 Limit order execution started', {
        direction,
        quantity,
        currentPrice,
        limitPrice,
        slippage: this.config.slippagePercent,
      });

      // 2. Place limit order
      const limitResult = await this.placeLimitOrder(direction, quantity, limitPrice, leverage);

      // 3. Wait for fill
      const filled = await this.waitForFill(limitResult.orderId, this.config.timeoutMs);

      if (filled) {
        // Success! Calculate maker fee (0.01%)
        const feePaid = (quantity * limitPrice * MAKER_FEE_PERCENT) / PERCENT_MULTIPLIER;

        this.logger.info('💰 Limit order filled successfully - Fee savings achieved!', {
          orderId: limitResult.orderId,
          fillPrice: limitPrice,
          feePaid,
          feeSavings: `${(TAKER_FEE_PERCENT - MAKER_FEE_PERCENT).toFixed(DECIMAL_PLACES.PERCENT)}%`,
        });

        return {
          ...limitResult,
          filled: true,
          fillPrice: limitPrice,
          feePaid,
        };
      }

      // 4. Not filled - cancel and fallback
      this.logger.warn('Limit order not filled within timeout', {
        orderId: limitResult.orderId,
        timeoutMs: this.config.timeoutMs,
      });

      await this.cancelOrder(limitResult.orderId);

      if (this.config.fallbackToMarket) {
        this.logger.info('Fallback to market order enabled, executing market order');
        return await this.fallbackToMarket(direction, quantity, leverage);
      }

      // No fallback - return unfilled result
      this.logger.warn('Fallback to market disabled - entry failed');
      return {
        ...limitResult,
        filled: false,
      };
    } catch (error) {
      this.logger.error('Limit order execution failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      // If fallback enabled, try market order
      if (this.config.fallbackToMarket) {
        this.logger.info('Attempting market order fallback due to error');
        return await this.fallbackToMarket(direction, quantity, leverage);
      }

      throw error;
    }
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
