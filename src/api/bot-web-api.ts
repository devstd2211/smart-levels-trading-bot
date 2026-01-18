import { Candle, TimeframeRole, LoggerService } from '../types';
import { BotServices } from '../services/bot-services';

/**
 * Bot Web API - Provides data access for web interface
 *
 * Responsibilities:
 * - Expose market data (candles, orderbook, walls, funding rates)
 * - Provide trade history
 * - Calculate volume profiles
 * - Format data for web consumption
 *
 * This separates web API concerns from core trading logic (TradingBot).
 * The web interface should only interact through this adapter.
 */
export class BotWebAPI {
  private logger: LoggerService;

  constructor(private services: BotServices) {
    this.logger = services.logger;
  }

  /**
   * Get current market data (price, indicators, trend)
   * Used by web interface to display live data
   */
  getMarketData(): {
    currentPrice: number;
    priceChangePercent: number;
    rsi?: number;
    ema20?: number;
    ema50?: number;
    atr?: number;
    trend?: string;
    btcCorrelation?: number;
    nearestLevel?: number;
    distanceToLevel?: number;
  } {
    try {
      // Get latest candles from PRIMARY timeframe
      // Use async method without await here - access cached data
      // This is a simplified version - in production would need async handling
      const currentPrice = 0; // Placeholder

      const priceChangePercent = 0; // Placeholder

      // Get indicators - these are updated via analyzers
      let rsi: number | undefined;
      let ema20: number | undefined;
      let ema50: number | undefined;
      let atr: number | undefined;
      let trend: string | undefined;

      // Note: RSI and EMA values would come from analyzer registry in orchestrator
      // For now, returning placeholders until orchestrator exposes these methods
      trend = 'NEUTRAL';

      return {
        currentPrice,
        priceChangePercent,
        rsi,
        ema20,
        ema50,
        atr,
        trend,
        btcCorrelation: undefined,
        nearestLevel: undefined,
        distanceToLevel: undefined,
      };
    } catch (error) {
      this.logger.error('Error getting market data', { error });
      return {
        currentPrice: 0,
        priceChangePercent: 0,
      };
    }
  }

  /**
   * Get candlestick data for web chart
   * @param timeframeStr - Timeframe as string (e.g., '5m', '15m')
   * @param limit - Maximum number of candles to return
   */
  async getCandles(timeframeStr: string, limit: number = 100): Promise<Candle[]> {
    try {
      // Map interval strings to TimeframeRole
      const timeframeMap: Record<string, TimeframeRole> = {
        '1m': TimeframeRole.ENTRY,
        '5m': TimeframeRole.PRIMARY,
        '15m': TimeframeRole.TREND1,
        '30m': TimeframeRole.TREND2,
        '60m': TimeframeRole.CONTEXT,
        '1h': TimeframeRole.CONTEXT,
      };

      const role = timeframeMap[timeframeStr] || TimeframeRole.PRIMARY;
      return await this.services.candleProvider.getCandles(role, limit);
    } catch (error) {
      this.logger.error('Error getting candles', { error, timeframeStr, limit });
      return [];
    }
  }

  /**
   * Get position history (closed positions from trading journal)
   */
  async getPositionHistory(limit: number = 50): Promise<any[]> {
    try {
      // Get closed trades from trading journal
      const closedTrades = this.services.journal.getClosedTrades();

      // Convert to position history format for web interface
      // Return most recent trades first
      const positions = closedTrades
        .slice(-limit) // Get last N trades
        .reverse() // Reverse to show most recent first
        .map((trade) => {
          // Calculate PnL from entry/exit prices
          const pnl = trade.exitPrice
            ? trade.side === 'LONG'
              ? (trade.exitPrice - trade.entryPrice) * trade.quantity
              : (trade.entryPrice - trade.exitPrice) * trade.quantity
            : 0;

          return {
            id: trade.id,
            side: trade.side,
            entryPrice: trade.entryPrice,
            entryTime: trade.openedAt,
            exitPrice: trade.exitPrice,
            exitTime: trade.closedAt,
            pnl: pnl,
            quantity: trade.quantity,
            status: trade.status,
          };
        });

      return positions;
    } catch (error) {
      this.logger.error('Error getting position history', { error, limit });
      return [];
    }
  }

  /**
   * Get current orderbook snapshot for a symbol
   * @param symbol - Trading pair symbol (e.g., 'BTCUSDT')
   */
  async getOrderBook(symbol: string): Promise<any> {
    try {
      // Use the orderbook manager to get current snapshot
      const snapshot = this.services.orderbookManager.getSnapshot();

      if (!snapshot) {
        this.logger.warn('Orderbook not available yet', { symbol });
        return {
          symbol,
          bids: [],
          asks: [],
          timestamp: Date.now(),
        };
      }

      // Convert to web format with cumulative volumes
      const bids = snapshot.bids.map((level, idx) => ({
        price: level.price,
        quantity: level.size,
        cumulative: snapshot.bids.slice(0, idx + 1).reduce((sum, l) => sum + l.size, 0),
      }));

      const asks = snapshot.asks.map((level, idx) => ({
        price: level.price,
        quantity: level.size,
        cumulative: snapshot.asks.slice(0, idx + 1).reduce((sum, l) => sum + l.size, 0),
      }));

      return {
        symbol,
        bids,
        asks,
        timestamp: snapshot.timestamp,
      };
    } catch (error) {
      this.logger.error('Error getting orderbook', { error, symbol });
      return {
        symbol,
        bids: [],
        asks: [],
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Get detected whale walls (large orders)
   * @param symbol - Trading pair symbol
   */
  async getWalls(symbol: string): Promise<any> {
    try {
      // Check if wall tracker exists
      if (!this.services.wallTrackerService) {
        this.logger.warn('Wall tracker not initialized', { symbol });
        return { symbol, walls: [] };
      }

      // Get active walls from wall tracker
      const activeWalls = this.services.wallTrackerService.getActiveWalls();

      return {
        symbol,
        walls: activeWalls.map((wall) => ({
          side: wall.side,
          price: wall.price,
          quantity: wall.currentSize,
          strength: this.services.wallTrackerService!.getWallStrength(wall.price, wall.side),
          detected: true,
        })),
      };
    } catch (error) {
      this.logger.error('Error getting walls', { error, symbol });
      return { symbol, walls: [] };
    }
  }

  /**
   * Get current and predicted funding rate
   * @param symbol - Trading pair symbol
   */
  async getFundingRate(symbol: string): Promise<any> {
    try {
      // Try to get from Bybit API
      // IExchange.getFundingRate() returns number or is optional
      const fundingRate = this.services.bybitService.getFundingRate
        ? await this.services.bybitService.getFundingRate(symbol)
        : 0;

      // fundingRate is a number (current funding rate percentage)
      return {
        symbol,
        current: fundingRate || 0,
        predicted: fundingRate || 0, // Predicted same as current (Bybit doesn't provide predicted)
        nextFundingTime: Date.now() + 8 * 60 * 60 * 1000, // 8 hours from now (Bybit funds every 8h)
        lastFundingTime: Date.now(),
      };
    } catch (error) {
      this.logger.error('Error getting funding rate', { error, symbol });
      return {
        symbol,
        current: 0,
        predicted: 0,
        nextFundingTime: Date.now() + 8 * 60 * 60 * 1000,
        lastFundingTime: Date.now(),
      };
    }
  }

  /**
   * Get volume profile (price levels vs volume distribution)
   * @param symbol - Trading pair symbol
   * @param levels - Number of price levels to analyze
   */
  async getVolumeProfile(symbol: string, levels: number = 20): Promise<any> {
    try {
      // Get candles and analyze volume distribution
      const candles = await this.services.candleProvider.getCandles(TimeframeRole.PRIMARY, 100);

      if (candles.length === 0) {
        return { symbol, levels: [], volumes: [], maxVolume: 0 };
      }

      // Create price level buckets
      const minPrice = Math.min(...candles.map((c) => c.low));
      const maxPrice = Math.max(...candles.map((c) => c.high));
      const priceRange = maxPrice - minPrice;
      const bucketSize = priceRange / levels;

      // Aggregate volume by price level
      const volumeBuckets = new Array(levels).fill(0);

      for (const candle of candles) {
        const volume = candle.volume || 0;
        // Distribute volume across price levels where candle occurred
        const lowBucket = Math.max(0, Math.floor((candle.low - minPrice) / bucketSize));
        const highBucket = Math.min(levels - 1, Math.floor((candle.high - minPrice) / bucketSize));

        for (let i = lowBucket; i <= highBucket; i++) {
          volumeBuckets[i] += volume / (highBucket - lowBucket + 1);
        }
      }

      const maxVolume = Math.max(...volumeBuckets, 1);
      const profileLevels = Array.from({ length: levels }, (_, i) => ({
        price: minPrice + i * bucketSize,
        volume: volumeBuckets[i],
      }));

      return {
        symbol,
        levels: profileLevels.map((l) => `$${l.price.toFixed(2)}`),
        volumes: profileLevels.map((l) => l.volume),
        maxVolume,
      };
    } catch (error) {
      this.logger.error('Error getting volume profile', { error, symbol, levels });
      return { symbol, levels: [], volumes: [], maxVolume: 0 };
    }
  }
}
