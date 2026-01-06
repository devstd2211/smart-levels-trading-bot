import { DECIMAL_PLACES, PERCENTAGE_THRESHOLDS } from '../../constants';
/**
 * Bybit Orders Partial
 *
 * Handles order management operations:
 * - Take-profit levels (TP1, TP2, TP3)
 * - Stop-loss orders
 * - Trailing stops
 * - Order cancellation
 * - Conditional orders cleanup
 */

import { PositionSide, TakeProfit, ProtectionVerification, BybitOrder, isStopLossOrder, isTakeProfitOrder } from '../../types';
import { BybitBase, BYBIT_SUCCESS_CODE, BYBIT_NOT_MODIFIED_CODE, BYBIT_ORDER_NOT_EXISTS_CODE, BYBIT_ZERO_POSITION_CODE, POSITION_IDX_ONE_WAY, PERCENT_TO_DECIMAL } from './bybit-base.partial';
import { isCriticalApiError } from '../../utils/error-helper';

// ============================================================================
// BYBIT ORDERS PARTIAL
// ============================================================================

export class BybitOrders extends BybitBase {
  // ==========================================================================
  // TAKE PROFIT
  // ==========================================================================

  /**
   * Place multiple take-profit levels
   */
  async placeTakeProfitLevels(params: {
    side: PositionSide;
    entryPrice: number;
    totalQuantity: number;
    levels: TakeProfit[];
  }): Promise<(string | undefined)[]> {
    return await this.retry(async () => {
      const { side, entryPrice, totalQuantity, levels } = params;
      const orderIds: (string | undefined)[] = [];

      const orderSide = side === PositionSide.LONG ? 'Sell' : 'Buy';

      // Track allocated quantity to avoid rounding leftovers
      // Last TP level will close the remaining quantity instead of calculating by percent
      let allocatedQuantity = 0;

      for (let i = 0; i < levels.length; i++) {
        const level = levels[i];
        const isLastLevel = i === levels.length - 1;

        const tpPrice =
          side === PositionSide.LONG
            ? entryPrice * (1 + level.percent / PERCENT_TO_DECIMAL)
            : entryPrice * (1 - level.percent / PERCENT_TO_DECIMAL);

        // For last TP level, use remaining quantity to avoid rounding leftovers
        // This ensures position closes completely after all TPs hit
        const quantity = isLastLevel
          ? totalQuantity - allocatedQuantity
          : (totalQuantity * level.sizePercent) / PERCENT_TO_DECIMAL;

        // Round quantity and price to exchange precision
        const orderQty = this.roundQuantity(quantity);
        const orderQtyNum = parseFloat(orderQty);
        const orderPrice = this.roundPrice(tpPrice);

        // Track allocated quantity for last-level calculation
        allocatedQuantity += orderQtyNum;

        this.logger.debug('Placing TP level', {
          level: level.level,
          percent: level.percent,
          price: tpPrice,
          priceRounded: orderPrice,
          quantity,
          quantityRounded: orderQty,
          quantityNumeric: orderQtyNum,
          isLastLevel,
          allocatedQuantity,
        });

        // Skip TP level if quantity rounds to zero (too small for exchange)
        if (orderQtyNum === 0 || orderQtyNum < parseFloat(this.minOrderQty || '0.0001')) {
          this.logger.warn(`🚫 TP level ${level.level} skipped - quantity too small`, {
            level: level.level,
            requestedQty: quantity,
            roundedQty: orderQtyNum,
            minRequired: this.minOrderQty,
            recommendation: `Consider combining TP${level.level} with TP${level.level + 1} or increasing position size`,
          });
          orderIds.push(undefined); // Mark as skipped
          continue;
        }

        try {
          const response = await this.restClient.submitOrder({
            category: 'linear',
            symbol: this.symbol,
            side: orderSide,
            orderType: 'Limit',
            qty: orderQty,
            price: orderPrice,
            reduceOnly: true,
            timeInForce: 'GTC',
          });

          if (response.retCode !== BYBIT_SUCCESS_CODE) {
            this.logger.warn(`Failed to place TP level ${level.level}`, { error: response.retMsg });
            orderIds.push(undefined); // Push undefined to maintain array index alignment
          } else {
            orderIds.push(response.result.orderId);
            this.logger.info(`✅ TP level ${level.level} placed`, {
              orderId: response.result.orderId,
              price: tpPrice,
              quantity: orderQtyNum,
            });
          }
        } catch (error) {
          this.logger.error(`Exception placing TP level ${level.level}`, { error });
          orderIds.push(undefined); // Push undefined to maintain array index alignment
        }
      }

      return orderIds;
    });
  }

  /**
   * Cancel take-profit order
   *
   * Gracefully handles cases where order doesn't exist (already filled/cancelled).
   * This is expected behavior when TP hits before cancellation.
   */
  async cancelTakeProfit(orderId: string): Promise<void> {
    return await this.retry(async () => {
      this.logger.debug('Cancelling take-profit', { orderId });

      const response = await this.restClient.cancelOrder({
        category: 'linear',
        symbol: this.symbol,
        orderId,
      });

      // Order not exists or too late to cancel - this is OK!
      // It means the order was already filled or cancelled by exchange
      if (response.retCode !== BYBIT_SUCCESS_CODE) {
        if (response.retMsg.includes('not exists') || response.retMsg.includes('too late')) {
          this.logger.warn('Take-profit already cancelled or filled', {
            orderId,
            reason: response.retMsg,
          });
          return; // Success - nothing to cancel
        }

        throw new Error(`Failed to cancel take-profit: ${response.retMsg}`);
      }

      this.logger.info('Take-profit cancelled', { orderId });
    });
  }

  /**
   * Update take-profit order price
   *
   * Used for smart TP3 movement - moving TP3 by ticks as price moves favorably.
   */
  async updateTakeProfit(orderId: string, newPrice: number): Promise<void> {
    return await this.retry(async () => {
      this.logger.debug('Updating take-profit price', { orderId, newPrice });

      const response = await this.restClient.amendOrder({
        category: 'linear',
        symbol: this.symbol,
        orderId,
        price: newPrice.toString(), // Use 'price' for Limit orders (TP), not 'triggerPrice'
      });

      // Allow "not modified" error - price is already correct
      if (response.retCode === BYBIT_NOT_MODIFIED_CODE) {
        this.logger.debug('Take-profit already at target price', { orderId, newPrice });
        return; // Success - no modification needed
      }

      if (response.retCode !== BYBIT_SUCCESS_CODE) {
        throw new Error(`Failed to update take-profit: ${response.retMsg}`);
      }

      this.logger.info('Take-profit price updated', { orderId, newPrice });
    });
  }

  /**
   * Set take-profit in Partial mode (for multiple TP levels)
   *
   * Used for setting additional TP levels after position opening.
   * Bybit Partial mode allows fractional position closing at different TP prices.
   *
   * @param params.price TP price
   * @param params.size Size to close at this TP level (in contracts)
   * @param params.index TP level index (for logging)
   */
  async updateTakeProfitPartial(params: {
    price: number;
    size: number;
    index?: number;
  }): Promise<void> {
    return await this.retry(async () => {
      const { price, size, index = 0 } = params;
      const roundedPrice = this.roundPrice(price);
      const roundedSize = this.roundQuantity(size);

      this.logger.info(`Setting TP${index + 1} (Partial mode)`, {
        price: roundedPrice,
        size: roundedSize,
      });

      const response = await this.restClient.setTradingStop({
        category: 'linear',
        symbol: this.symbol,
        takeProfit: roundedPrice.toString(),
        tpslMode: 'Partial', // Allow multiple TP levels
        tpOrderType: 'Market', // Market execution
        tpSize: roundedSize.toString(), // Size to close at this TP
        positionIdx: POSITION_IDX_ONE_WAY,
      });

      // Code 10001 means "zero position" - position already closed (race condition), which is OK
      if (response.retCode === 10001) {
        this.logger.info(`Position already closed, skipping TP${index + 1}`, {
          price: roundedPrice,
        });
        return;
      }

      if (response.retCode !== BYBIT_SUCCESS_CODE) {
        throw new Error(`Failed to set TP${index + 1}: ${response.retMsg}`);
      }

      this.logger.info(`✅ TP${index + 1} set successfully (Partial mode)`, {
        price: roundedPrice,
        size: roundedSize,
      });
    });
  }

  // ==========================================================================
  // STOP LOSS
  // ==========================================================================

  /**
   * Place stop-loss order
   */
  async placeStopLoss(params: {
    side: PositionSide;
    quantity: number;
    stopPrice: number;
  }): Promise<string> {
    return await this.retry(async () => {
      const { side, quantity, stopPrice } = params;

      const orderSide = side === PositionSide.LONG ? 'Sell' : 'Buy';
      const TRIGGER_DIRECTION_RISE = 1;
      const TRIGGER_DIRECTION_FALL = 2;
      const triggerDirection = side === PositionSide.LONG
        ? TRIGGER_DIRECTION_FALL
        : TRIGGER_DIRECTION_RISE;

      // Round quantity and price to exchange precision
      const orderQty = this.roundQuantity(quantity);
      const orderPrice = this.roundPrice(stopPrice);

      this.logger.debug('Placing stop-loss', {
        side,
        stopPrice,
        stopPriceRounded: orderPrice,
        quantity,
        quantityRounded: orderQty,
      });

      const response = await this.restClient.submitOrder({
        category: 'linear',
        symbol: this.symbol,
        side: orderSide,
        orderType: 'Market',
        qty: orderQty,
        triggerPrice: orderPrice,
        triggerDirection,
        triggerBy: 'LastPrice',
        reduceOnly: true,
        closeOnTrigger: true,
      });

      if (response.retCode !== BYBIT_SUCCESS_CODE) {
        throw new Error(`Failed to place stop-loss: ${response.retMsg}`);
      }

      const orderId = response.result.orderId;
      this.logger.info('Stop-loss placed', { orderId, stopPrice });

      return orderId;
    });
  }

  /**
   * Update stop-loss price for existing position
   * Uses setTradingStop API (NOT amendOrder) to update position SL
   */
  async updateStopLoss(newStopPrice: number): Promise<void> {
    return await this.retry(async () => {
      const roundedPrice = this.roundPrice(newStopPrice);

      this.logger.info('🔄 Updating stop-loss for position', {
        newStopPrice,
        roundedPrice,
        symbol: this.symbol,
      });

      const response = await this.restClient.setTradingStop({
        category: 'linear',
        symbol: this.symbol,
        stopLoss: roundedPrice.toString(),
        positionIdx: POSITION_IDX_ONE_WAY, // One-Way mode
        tpslMode: 'Full',
      });

      this.logger.info('📋 setTradingStop response', {
        retCode: response.retCode,
        retMsg: response.retMsg,
        result: response.result,
      });

      // Code 10001 means "zero position" - position already closed (race condition), which is OK
      if (response.retCode === BYBIT_ZERO_POSITION_CODE) {
        this.logger.info('ℹ️ Position already closed, skipping SL update (race condition)', {
          newStopPrice: roundedPrice,
          retCode: response.retCode,
        });
        return;
      }

      // Code 34040 means "not modified" - SL is already at this price, which is OK
      if (response.retCode !== BYBIT_SUCCESS_CODE && response.retCode !== BYBIT_NOT_MODIFIED_CODE) {
        throw new Error(`Failed to update stop-loss: ${response.retMsg}`);
      }

      if (response.retCode === BYBIT_NOT_MODIFIED_CODE) {
        this.logger.info('ℹ️ Stop-loss already at target price (not modified)', { newStopPrice: roundedPrice });
      } else {
        this.logger.info('✅ Stop-loss updated successfully', { newStopPrice: roundedPrice });
      }
    });
  }

  /**
   * Cancel stop-loss order
   */
  async cancelStopLoss(orderId: string): Promise<void> {
    return await this.retry(async () => {
      this.logger.debug('Cancelling stop-loss', { orderId });

      const response = await this.restClient.cancelOrder({
        category: 'linear',
        symbol: this.symbol,
        orderId,
      });

      // Code 110001 means "order not exists" - SL already cancelled, which is OK
      if (response.retCode === BYBIT_ORDER_NOT_EXISTS_CODE) {
        this.logger.info('ℹ️ Stop-loss already cancelled (order not exists)', { orderId });
        return;
      }

      if (response.retCode !== BYBIT_SUCCESS_CODE) {
        throw new Error(`Failed to cancel stop-loss: ${response.retMsg}`);
      }

      this.logger.info('Stop-loss cancelled', { orderId });
    });
  }

  // ==========================================================================
  // TRAILING STOP
  // ==========================================================================

  /**
   * Activate server-side trailing stop
   */
  async setTrailingStop(params: {
    side: PositionSide;
    activationPrice: number;
    trailingPercent: number;
  }): Promise<void> {
    return await this.retry(async () => {
      const { activationPrice, trailingPercent } = params;

      const trailingStopAmount = activationPrice * (trailingPercent / PERCENT_TO_DECIMAL);

      this.logger.debug('Setting trailing stop', {
        activationPrice,
        trailingPercent,
        trailingStopAmount,
      });

      const response = await this.restClient.setTradingStop({
        category: 'linear',
        symbol: this.symbol,
        trailingStop: trailingStopAmount.toFixed(DECIMAL_PLACES.PRICE),
        positionIdx: POSITION_IDX_ONE_WAY,
        tpslMode: 'Full',
      });

      // Code 10001 means "zero position" - position already closed (race condition), which is OK
      if (response.retCode === BYBIT_ZERO_POSITION_CODE) {
        this.logger.info('ℹ️ Position already closed, skipping trailing stop (race condition)', {
          trailingPercent,
          retCode: response.retCode,
        });
        return;
      }

      // Code 34040 means "not modified" - trailing stop already set, which is OK
      if (response.retCode !== BYBIT_SUCCESS_CODE && response.retCode !== BYBIT_NOT_MODIFIED_CODE) {
        throw new Error(`Failed to set trailing stop: ${response.retMsg}`);
      }

      if (response.retCode === BYBIT_NOT_MODIFIED_CODE) {
        this.logger.info('ℹ️ Trailing stop already set (not modified)', {
          trailingPercent: `${trailingPercent}%`,
        });
      } else {
        this.logger.info('Trailing stop activated', {
          activationPrice,
          trailingPercent: `${trailingPercent}%`,
          trailingStopAmount,
        });
      }
    });
  }

  // ==========================================================================
  // PROTECTION VERIFICATION
  // ==========================================================================

  /**
   * Verify that TP/SL protection is actually set on exchange
   * CRITICAL: Prevents positions without protection
   *
   * @param side - Position side (LONG or SHORT)
   * @returns ProtectionVerification with detailed status
   */
  async verifyProtectionSet(side: PositionSide): Promise<ProtectionVerification> {
    try {
      // 1. Get active orders (SL/TP orders)
      const orders = await this.getActiveOrders();

      // Find SL orders (trigger orders that close position)
      const stopLossOrders = orders.filter((order: BybitOrder): boolean => {
        const isSLOrder = isStopLossOrder(order);

        // For LONG: SL is Sell order below entry
        // For SHORT: SL is Buy order above entry
        const correctSide = side === PositionSide.LONG
          ? order.side === 'Sell'
          : order.side === 'Buy';

        return isSLOrder && correctSide;
      });

      // Find TP orders (limit reduce-only orders)
      const takeProfitOrders = orders.filter((order: BybitOrder): boolean => {
        const isTPOrder = isTakeProfitOrder(order);

        // For LONG: TP is Sell order above entry
        // For SHORT: TP is Buy order below entry
        const correctSide = side === PositionSide.LONG
          ? order.side === 'Sell'
          : order.side === 'Buy';

        return isTPOrder && correctSide;
      });

      const hasStopLoss = stopLossOrders.length > 0;
      const hasTakeProfit = takeProfitOrders.length > 0;

      // 2. Check for trailing stop via getPositionInfo
      let hasTrailingStop = false;
      try {
        const positionResponse = await this.restClient.getPositionInfo({
          category: 'linear',
          symbol: this.symbol,
        });

        if (positionResponse.retCode === BYBIT_SUCCESS_CODE && positionResponse.result?.list?.length > 0) {
          const position = positionResponse.result.list[0];
          // Trailing stop is set if trailingStop field is not empty/zero
          const trailingStopValue = position.trailingStop;
          hasTrailingStop = trailingStopValue !== undefined &&
                           trailingStopValue !== null &&
                           trailingStopValue !== '' &&
                           parseFloat(trailingStopValue) > 0;

          this.logger.debug('Trailing stop check', {
            trailingStopValue,
            hasTrailingStop,
          });
        }
      } catch (posError) {
        this.logger.warn('Failed to check trailing stop, assuming none', {
          error: posError instanceof Error ? posError.message : String(posError),
        });
      }

      // 3. Build verification result
      // Position is protected if:
      // - (hasStopLoss OR hasTrailingStop) AND (hasTakeProfit OR hasTrailingStop)
      // When trailing is active, we don't need TP anymore
      const isProtected = (hasStopLoss || hasTrailingStop) && (hasTakeProfit || hasTrailingStop);

      const verification: ProtectionVerification = {
        hasStopLoss: hasStopLoss || hasTrailingStop, // Trailing stop counts as SL
        hasTakeProfit: hasTakeProfit || hasTrailingStop, // Trailing stop replaces TP
        stopLossPrice: stopLossOrders[0] && stopLossOrders[0].triggerPrice ? parseFloat(stopLossOrders[0].triggerPrice) : undefined,
        takeProfitPrices: takeProfitOrders.map((o: BybitOrder): number => parseFloat(o.price)),
        activeOrders: orders.length,
        verified: isProtected,
        hasTrailingStop,
      };

      this.logger.debug('Protection verification complete', {
        side,
        verification,
        totalOrders: orders.length,
        slOrders: stopLossOrders.length,
        tpOrders: takeProfitOrders.length,
        hasTrailingStop,
        isProtected,
      });

      return verification;
    } catch (error) {
      this.logger.error('Failed to verify protection', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Return conservative result (assume no protection on error)
      return {
        hasStopLoss: false,
        hasTakeProfit: false,
        activeOrders: 0,
        verified: false,
        hasTrailingStop: false,
      };
    }
  }

  // ==========================================================================
  // ACTIVE ORDERS & CLEANUP
  // ==========================================================================

  /**
   * Get all active orders for the symbol
   * @returns Array of active orders with proper typing
   */
  async getActiveOrders(): Promise<BybitOrder[]> {
    return await this.retry(async () => {
      this.logger.debug('Fetching active orders', { symbol: this.symbol });

      const response = await this.restClient.getActiveOrders({
        category: 'linear',
        symbol: this.symbol,
        settleCoin: 'USDT',
      });

      if (response.retCode !== BYBIT_SUCCESS_CODE) {
        // Check if this is a critical error
        const error = new Error(`Bybit API error: ${response.retMsg}. (code: ${response.retCode})`);
        (error as any).code = response.retCode;

        if (isCriticalApiError(error)) {
          this.logger.error('🚨 CRITICAL API ERROR in getActiveOrders - throwing immediately!', {
            error: response.retMsg,
            code: response.retCode,
          });
          throw error;
        }

        this.logger.warn('Failed to get active orders', {
          error: response.retMsg,
          code: response.retCode,
        });
        return [];
      }

      const orders = (response.result?.list || []) as unknown as BybitOrder[];

      this.logger.debug('Active orders fetched', {
        count: orders.length,
        orderIds: orders.map((o: BybitOrder): string => o.orderId),
      });

      return orders;
    });
  }

  /**
   * Get order history (filled/cancelled orders)
   * Used by Safety Monitor to determine exitType when WebSocket event was missed
   * @param limit - Maximum number of orders to fetch (default: 20)
   * @returns Array of historical orders with proper typing
   */
  async getOrderHistory(limit: number = PERCENTAGE_THRESHOLDS.LOW_MODERATE): Promise<BybitOrder[]> {
    return await this.retry(async () => {
      this.logger.debug('Fetching order history', { symbol: this.symbol, limit });

      const response = await this.restClient.getHistoricOrders({
        category: 'linear',
        symbol: this.symbol,
        limit,
      });

      if (response.retCode !== BYBIT_SUCCESS_CODE) {
        // Check if this is a critical error
        const error = new Error(`Bybit API error: ${response.retMsg}. (code: ${response.retCode})`);
        (error as any).code = response.retCode;

        if (isCriticalApiError(error)) {
          this.logger.error('🚨 CRITICAL API ERROR in getOrderHistory - throwing immediately!', {
            error: response.retMsg,
            code: response.retCode,
          });
          throw error;
        }

        this.logger.warn('Failed to get order history', {
          error: response.retMsg,
          code: response.retCode,
        });
        return [];
      }

      const orders = (response.result?.list || []) as unknown as BybitOrder[];

      this.logger.debug('Order history fetched', {
        count: orders.length,
        orderStatuses: orders.map((o: BybitOrder): object => {
          return { id: o.orderId, status: o.orderStatus };
        }),
      });

      return orders;
    });
  }

  /**
   * Cancel all conditional orders (SL/TP) for the symbol
   * Used to cleanup hanging orders when no position exists
   * Logs errors instead of throwing to ensure cleanup continues
   */
  async cancelAllConditionalOrders(): Promise<void> {
    try {
      const orders = await this.getActiveOrders();

      if (orders.length === 0) {
        this.logger.debug('No active orders to cancel');
        return;
      }

      // Filter for conditional orders that should be cleaned up
      // NOTE: We ONLY delete StopLoss orders (stopOrderType='StopLoss'), NOT TP orders
      // TP orders are Limit orders with reduceOnly=true, and we need to keep ALL of them
      const conditionalOrders = orders.filter((order: BybitOrder): boolean => {
        // Only clean up actual STOP LOSS orders
        // StopLoss orders have stopOrderType = 'StopLoss' or 'TakeProfit'
        // But we only want to delete StopLoss, not TakeProfit (which is TP)
        return order.stopOrderType === 'StopLoss' ||
               (order.triggerPrice !== undefined && order.stopOrderType === 'StopLoss');
      });

      this.logger.info('Found conditional orders to cleanup', {
        total: orders.length,
        conditional: conditionalOrders.length,
        conditionalIds: conditionalOrders.map((o: BybitOrder): string => o.orderId),
      });

      // Cancel each conditional order
      for (const order of conditionalOrders) {
        try {
          this.logger.debug('Cancelling conditional order', {
            orderId: order.orderId,
            orderType: order.orderType,
            side: order.side,
            triggerPrice: order.triggerPrice,
          });

          const response = await this.restClient.cancelOrder({
            category: 'linear',
            symbol: this.symbol,
            orderId: order.orderId,
          });

          if (response.retCode !== BYBIT_SUCCESS_CODE) {
            this.logger.warn('Failed to cancel conditional order, continuing...', {
              orderId: order.orderId,
              error: response.retMsg,
              code: response.retCode,
            });
          } else {
            this.logger.info('✅ Cancelled hanging conditional order', {
              orderId: order.orderId,
              orderType: order.orderType,
            });
          }
        } catch (error) {
          this.logger.warn('Error cancelling conditional order, continuing...', {
            orderId: order.orderId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      this.logger.info('Conditional orders cleanup completed', {
        processed: conditionalOrders.length,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if this is a critical error
      if (isCriticalApiError(error)) {
        this.logger.error('🚨 CRITICAL API ERROR in cancelAllConditionalOrders - re-throwing!', {
          error: errorMessage,
          isCritical: true,
        });
        throw error; // Re-throw critical errors
      }

      this.logger.error('Error in cancelAllConditionalOrders', {
        error: errorMessage,
      });
    }
  }
}
