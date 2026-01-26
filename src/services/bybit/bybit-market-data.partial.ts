/**
 * Bybit Market Data Partial
 *
 * Handles public market data operations (no authentication required):
 * - Historical candles (OHLCV)
 * - Current price
 * - Server time
 * - Order book depth
 */

import type { KlineIntervalV3 } from 'bybit-api';
import { Candle, CONFIDENCE_THRESHOLDS } from '../../types';
import { BybitBase, BYBIT_SUCCESS_CODE, DEFAULT_CANDLE_LIMIT } from './bybit-base.partial';
import { TIME_INTERVALS, TIME_MULTIPLIERS } from '../../constants/technical.constants';

// ============================================================================
// BYBIT MARKET DATA PARTIAL
// ============================================================================

export class BybitMarketData extends BybitBase {
  // ==========================================================================
  // CANDLES
  // ==========================================================================

  /**
   * Get historical candles (OHLCV data)
   * @param symbolOrLimit - Symbol name OR limit number (for backward compatibility)
   * @param interval - Interval (e.g., "1", "5", "60")
   * @param limit - Number of candles to fetch
   */
  async getCandles(
    symbolOrLimit: string | number = DEFAULT_CANDLE_LIMIT,
    interval?: string,
    limit?: number,
  ): Promise<Candle[]> {
    // Backward compatibility: if first arg is number, use old behavior
    let symbol: string;
    let timeframe: string;
    let candleLimit: number;

    if (typeof symbolOrLimit === 'number') {
      // Old behavior: getCandles(limit)
      symbol = this.symbol;
      timeframe = this.timeframe;
      candleLimit = symbolOrLimit;
    } else {
      // New behavior: getCandles(symbol, interval, limit)
      symbol = symbolOrLimit;
      timeframe = interval || this.timeframe;
      candleLimit = limit || DEFAULT_CANDLE_LIMIT;
    }

    // Phase 6.2: Check repository cache first
    if (this.marketDataRepository) {
      const cached = this.marketDataRepository.getCandles(symbol, timeframe, candleLimit);
      if (cached && cached.length > 0) {
        this.logger.debug('📦 Cache hit for candles', {
          symbol,
          timeframe,
          count: cached.length,
          source: 'repository',
        });
        return cached;
      }
    }

    // Cache miss - fetch from API
    return await this.retry(async () => {
      this.logger.info('🕯️ Requesting candles from Bybit', {
        symbol,
        interval: timeframe,
        limit: candleLimit,
        timestamp: new Date().toISOString(),
      });

      const requestParams = {
        category: 'linear' as const,
        symbol,
        interval: timeframe as KlineIntervalV3,
        limit: candleLimit,
      };

      this.logger.debug('📤 API Request params', requestParams);

      const response = await this.restClient.getKline(requestParams);

      // Detailed response logging
      this.logger.info('📥 Bybit API response received', {
        retCode: response.retCode,
        retMsg: response.retMsg,
        hasResult: !!response.result,
        hasResultList: !!response.result?.list,
        listLength: response.result?.list?.length ?? 0,
        category: response.result?.category,
        symbol: response.result?.symbol,
      });

      if (response.retCode !== BYBIT_SUCCESS_CODE) {
        this.logger.error('❌ Bybit API error', {
          retCode: response.retCode,
          retMsg: response.retMsg,
          fullResponse: JSON.stringify(response, null, 2),
        });
        throw new Error(`Bybit API error: ${response.retMsg} (code: ${response.retCode})`);
      }

      const klines = response.result?.list;
      if (klines === undefined || klines === null || klines.length === 0) {
        this.logger.error('❌ Empty candles response', {
          symbol: this.symbol,
          interval: this.timeframe,
          limit,
          resultExists: !!response.result,
          resultKeys: response.result ? Object.keys(response.result) : [],
          fullResult: JSON.stringify(response.result, null, 2),
        });
        throw new Error('No candles received from exchange');
      }

      this.logger.info('✅ Candles fetched successfully', {
        count: klines.length,
        firstCandleTime: klines[0]?.[0] ? new Date(parseInt(klines[0][0])).toISOString() : 'N/A',
        lastCandleTime: klines[klines.length - 1]?.[0] ? new Date(parseInt(klines[klines.length - 1][0])).toISOString() : 'N/A',
      });

      // Bybit returns newest first, reverse to oldest first
      const reversedKlines = klines.reverse();

      const candles = reversedKlines.map((k) => ({
        timestamp: parseInt(k[0]),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));

      this.logger.debug('📊 First candle', {
        timestamp: new Date(candles[0].timestamp).toISOString(),
        open: candles[0].open,
        close: candles[0].close,
      });

      this.logger.debug('📊 Last candle', {
        timestamp: new Date(candles[candles.length - 1].timestamp).toISOString(),
        open: candles[candles.length - 1].open,
        close: candles[candles.length - 1].close,
      });

      // Phase 6.2: Cache candles in repository for future requests
      if (this.marketDataRepository && candles.length > 0) {
        try {
          // Note: saveCandles is synchronous
          this.marketDataRepository.saveCandles(symbol, timeframe, candles);
          this.logger.debug('💾 Candles cached in repository', {
            symbol,
            timeframe,
            count: candles.length,
          });
        } catch (error) {
          // Log but don't fail - repository caching is optional
          this.logger.warn('⚠️ Failed to cache candles in repository', {
            error: error instanceof Error ? error.message : String(error),
            symbol,
            timeframe,
          });
        }
      }

      return candles;
    });
  }

  // ==========================================================================
  // PRICE & TIME
  // ==========================================================================

  /**
   * Get current market price
   */
  async getCurrentPrice(): Promise<number> {
    return await this.retry(async () => {
      const response = await this.restClient.getTickers({
        category: 'linear',
        symbol: this.symbol,
      });

      if (response.retCode !== BYBIT_SUCCESS_CODE) {
        throw new Error(`Bybit API error: ${response.retMsg} (code: ${response.retCode})`);
      }

      const ticker = response.result.list[0];
      if (ticker === undefined || ticker === null) {
        throw new Error(`No ticker data for ${this.symbol}`);
      }

      return parseFloat(ticker.lastPrice);
    });
  }

  /**
   * Get server time (for time synchronization)
   */
  async getServerTime(): Promise<number> {
    return await this.retry(async () => {
      const response = await this.restClient.getServerTime();

      if (response.retCode !== BYBIT_SUCCESS_CODE) {
        throw new Error(`Bybit API error: ${response.retMsg} (code: ${response.retCode})`);
      }

      const timeSeconds = response.result.timeSecond;
      if (timeSeconds === undefined || timeSeconds === null) {
        throw new Error('Server time not received');
      }

      // Convert seconds to milliseconds
      return Number(timeSeconds) * TIME_MULTIPLIERS.MILLISECONDS_PER_SECOND;
    });
  }

  // ==========================================================================
  // ORDER BOOK
  // ==========================================================================

  /**
   * Get order book (market depth)
   *
   * @param symbol - Trading symbol (default: this.symbol)
   * @param limit - Number of levels to fetch (default: 50, max: 500)
   * @returns Order book data with bids and asks
   */
  async getOrderBook(symbol?: string, limit: number = CONFIDENCE_THRESHOLDS.MODERATE): Promise<{
    bids: Array<{ price: number; size: number }>;
    asks: Array<{ price: number; size: number }>;
    timestamp: number;
  }> {
    const targetSymbol = symbol || this.symbol;

    return await this.retry(async () => {
      const response = await this.restClient.getOrderbook({
        category: 'linear',
        symbol: targetSymbol,
        limit,
      });

      if (response.retCode !== BYBIT_SUCCESS_CODE) {
        throw new Error(`Bybit API error: ${response.retMsg} (code: ${response.retCode})`);
      }

      const orderbook = response.result;
      if (!orderbook.b || !orderbook.a) {
        throw new Error('Invalid order book data');
      }

      // Parse bids and asks (use 'size' to match OrderbookLevel interface)
      const bids = orderbook.b.map((level: string[]) => ({
        price: parseFloat(level[0]),
        size: parseFloat(level[1]),
      }));

      const asks = orderbook.a.map((level: string[]) => ({
        price: parseFloat(level[0]),
        size: parseFloat(level[1]),
      }));

      return {
        bids,
        asks,
        timestamp: typeof orderbook.ts === 'string' ? parseInt(orderbook.ts) : orderbook.ts,
      };
    });
  }

  // ==========================================================================
  // FUNDING RATE
  // ==========================================================================

  /**
   * Get current funding rate and next funding time
   *
   * @param symbol - Symbol (e.g., "APEXUSDT")
   * @returns Funding rate data
   */
  async getFundingRate(symbol?: string): Promise<{
    fundingRate: number;
    timestamp: number;
    nextFundingTime: number;
  }> {
    const targetSymbol = symbol || this.symbol;

    return await this.retry(async () => {
      const response = await this.restClient.getFundingRateHistory({
        category: 'linear',
        symbol: targetSymbol,
        limit: 1, // Get only latest funding rate
      });

      if (response.retCode !== BYBIT_SUCCESS_CODE) {
        throw new Error(`Bybit API error: ${response.retMsg} (code: ${response.retCode})`);
      }

      const fundingHistory = response.result?.list;
      if (!fundingHistory || fundingHistory.length === 0) {
        throw new Error('No funding rate data available');
      }

      const latest = fundingHistory[0];

      return {
        fundingRate: parseFloat(latest.fundingRate),
        timestamp: typeof latest.fundingRateTimestamp === 'string'
          ? parseInt(latest.fundingRateTimestamp)
          : latest.fundingRateTimestamp,
        nextFundingTime: typeof latest.fundingRateTimestamp === 'string'
          ? parseInt(latest.fundingRateTimestamp) + TIME_INTERVALS.MS_PER_8_HOURS
          : latest.fundingRateTimestamp + TIME_INTERVALS.MS_PER_8_HOURS,
      };
    });
  }
}
