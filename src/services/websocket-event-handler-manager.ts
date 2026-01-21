import { DECIMAL_PLACES, INTEGER_MULTIPLIERS } from '../constants';
import { Candle, TimeframeRole, OrderBook, LoggerService } from '../types';
import { OrderbookUpdateEvent, TradeTickEvent } from '../types/events.types';
import { BotServices } from './bot-services';
import { RealTimeWhaleDetector } from './realtime-whale-detector';
import { type OrderbookUpdate } from './orderbook-manager.service';

/**
 * WebSocket Event Handler Manager
 *
 * Manages all WebSocket event handlers for:
 * - Position Monitor events (stopLoss, takeProfit, etc.)
 * - Private WebSocket events (orders, positions)
 * - Public WebSocket events (candles, orderbook, trades)
 *
 * This extracts 200+ lines of event handling logic from TradingBot,
 * keeping the bot class focused on orchestration.
 */
export class WebSocketEventHandlerManager {
  private logger: LoggerService;
  private lastOrderbookAnalysis: number = 0;
  private whaleDetector: RealTimeWhaleDetector;

  // Track event listeners for cleanup
  private eventListeners: Array<{ emitter: any; event: string; handler: any }> = [];

  constructor(private services: BotServices, private config: any) {
    this.logger = services.logger;
    this.whaleDetector = new RealTimeWhaleDetector(services, config);
  }

  /**
   * Register all WebSocket and Position Monitor event handlers
   * Called from TradingBot.start() after WebSocket connections
   *
   * @param bot - Reference to TradingBot instance (for callbacks)
   */
  registerAllHandlers(bot: any): void {
    this.registerPositionMonitorHandlers(bot);
    this.registerPrivateWebSocketHandlers(bot);
    this.registerPublicWebSocketHandlers(bot);

    this.logger.debug(
      `✅ Registered ${this.eventListeners.length} event handlers (Position Monitor + WebSockets)`,
    );
  }

  /**
   * Clean up all tracked event listeners to prevent memory leaks
   */
  cleanupAllListeners(): void {
    const count = this.eventListeners.length;
    for (const listener of this.eventListeners) {
      listener.emitter.off(listener.event, listener.handler);
    }
    this.eventListeners = [];
    this.logger.debug(`✅ Cleaned up ${count} event listeners`);
  }

  /**
   * Private: Register Position Monitor event handlers
   */
  private registerPositionMonitorHandlers(bot: any): void {
    const { positionEventHandler } = this.services;
    const { positionMonitor } = this.services;

    // Position Monitor Events
    this.registerListener(positionMonitor, 'stopLossHit', (event: any) => {
      void positionEventHandler.handleStopLossHit(event);
    });

    this.registerListener(positionMonitor, 'takeProfitHit', (event: any) => {
      void positionEventHandler.handleTakeProfitHit(event);
    });

    this.registerListener(positionMonitor, 'positionClosedExternally', (position: any) => {
      void positionEventHandler.handlePositionClosedExternally(position);
    });

    this.registerListener(positionMonitor, 'timeBasedExit', (event: any) => {
      void positionEventHandler.handleTimeBasedExit(event);
    });

    this.registerListener(positionMonitor, 'error', (error: Error) => {
      void positionEventHandler.handleMonitorError(error);
    });

    this.logger.debug('✅ Position Monitor handlers registered');
  }

  /**
   * Private: Register Private WebSocket event handlers
   */
  private registerPrivateWebSocketHandlers(bot: any): void {
    const { webSocketEventHandler } = this.services;
    const { webSocketManager } = this.services;

    // WebSocket Events
    this.registerListener(webSocketManager, 'positionUpdate', (position: any) => {
      void webSocketEventHandler.handlePositionUpdate(position);
    });

    this.registerListener(webSocketManager, 'positionClosed', () => {
      void webSocketEventHandler.handlePositionClosed();
    });

    this.registerListener(webSocketManager, 'orderFilled', (order: any) => {
      void webSocketEventHandler.handleOrderFilled(order);
    });

    this.registerListener(webSocketManager, 'takeProfitFilled', (event: any) => {
      void webSocketEventHandler.handleTakeProfitFilled(event);
    });

    this.registerListener(webSocketManager, 'stopLossFilled', (event: any) => {
      void webSocketEventHandler.handleStopLossFilled(event);
    });

    this.registerListener(webSocketManager, 'error', (error: Error) => {
      void webSocketEventHandler.handleError(error);
    });

    this.logger.debug('✅ Private WebSocket handlers registered');
  }

  /**
   * Private: Register Public WebSocket event handlers
   */
  private registerPublicWebSocketHandlers(bot: any): void {
    const { publicWebSocket, tradingOrchestrator, positionManager, orderbookManager } =
      this.services;

    // Candle closed - update cache and trigger trading cycle
    this.registerListener(
      publicWebSocket,
      'candleClosed',
      async ({ role, candle }: { role: TimeframeRole; candle: Candle }) => {
        this.logger.info('🕯️ Candle closed', {
          role,
          timestamp: new Date(candle.timestamp).toISOString(),
          close: candle.close,
        });

        try {
          // Update candle cache for this timeframe
          this.services.candleProvider.onCandleClosed(role, candle);

          // Log cache metrics
          const metrics = this.services.candleProvider.getCacheMetrics(role);
          if (metrics) {
            this.logger.debug(`Cache metrics for ${role}`, {
              hits: metrics.hits,
              misses: metrics.misses,
              hitRate: `${(metrics.hitRate * INTEGER_MULTIPLIERS.ONE_HUNDRED).toFixed(DECIMAL_PLACES.PERCENT)}%`,
            });
          }

          // [Phase 10.2] Route to StrategyOrchestrator if multi-strategy mode is enabled
          // Otherwise use TradingOrchestrator for single-strategy mode
          if (this.services.strategyOrchestrator) {
            // Multi-strategy mode: route only to active strategy
            await this.services.strategyOrchestrator.onCandleClosed(role, candle);
          } else {
            // Single-strategy mode: use legacy flow
            await tradingOrchestrator.onCandleClosed(role, candle);
          }
        } catch (error) {
          this.logger.error('Error handling candle close event', {
            role,
            error,
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
          });
        }
      },
    );

    // WebSocket connected
    this.registerListener(publicWebSocket, 'connected', () => {
      this.logger.info('Public WebSocket connected successfully');
    });

    // WebSocket disconnected
    this.registerListener(publicWebSocket, 'disconnected', () => {
      this.logger.warn('Public WebSocket disconnected');
    });

    // Orderbook update
    this.registerListener(publicWebSocket, 'orderbookUpdate', (update: OrderbookUpdateEvent) => {
      this.handleOrderbookUpdate(update, bot);
    });

    // Trade update
    this.registerListener(publicWebSocket, 'trade', (trade: TradeTickEvent) => {
      this.handleTradeUpdate(trade, bot);
    });

    // WebSocket errors
    this.registerListener(publicWebSocket, 'error', (error: Error) => {
      this.logger.error('Public WebSocket error', { error: error.message });
    });

    this.logger.debug('✅ Public WebSocket handlers registered');
  }

  /**
   * Private: Handle orderbook update event
   */
  private handleOrderbookUpdate(update: OrderbookUpdateEvent, bot: any): void {
    try {
      // Convert OrderbookUpdateEvent to OrderbookUpdate for processing
      const orderbookUpdate: OrderbookUpdate = {
        type: update.type || 'delta',
        bids: (update.bids || []).map((b: any) => [String(b[0]), String(b[1])]),
        asks: (update.asks || []).map((a: any) => [String(a[0]), String(a[1])]),
        updateId: update.updateId || 0,
        timestamp: update.timestamp || Date.now(),
      };

      // OrderbookManager ALWAYS maintains the snapshot (no throttling)
      this.services.orderbookManager.processUpdate(orderbookUpdate);

      // THROTTLE analysis to avoid CPU overload
      const now = Date.now();
      const orderbookThrottle = this.config.dataSubscriptions.orderbook.updateIntervalMs;
      if (now - this.lastOrderbookAnalysis < orderbookThrottle) {
        return; // Skip analysis, too soon
      }

      this.lastOrderbookAnalysis = now;

      // Get full snapshot and pass to whale detector
      const snapshot = this.services.orderbookManager.getSnapshot();
      if (snapshot) {
        // Analyze orderbook imbalance
        if (this.services.orderbookImbalanceService) {
          const imbalanceAnalysis = this.services.orderbookImbalanceService.analyze({
            bids: snapshot.bids.map((b: any) => [b.price, b.size] as [number, number]),
            asks: snapshot.asks.map((a: any) => [a.price, a.size] as [number, number]),
          });
        }

        const orderbookSnapshot: OrderBook = {
          symbol: update.symbol || this.config.exchange.symbol,
          bids: snapshot.bids,
          asks: snapshot.asks,
          timestamp: snapshot.timestamp,
          updateId: snapshot.updateId,
        };

        this.services.tradingOrchestrator.onOrderbookUpdate(orderbookSnapshot);

        // Check for whale signals in real-time (throttled via RealTimeWhaleDetector)
        void this.whaleDetector.checkWhaleSignalRealtime(orderbookSnapshot);

      }
    } catch (error) {
      this.logger.error('Error handling orderbook update', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Private: Handle trade update event
   */
  private handleTradeUpdate(trade: TradeTickEvent, bot: any): void {
    try {
      if (this.services.deltaAnalyzerService) {
        // Normalize side
        const normalizedSide = trade.side === 'Buy' || trade.side === 'BUY' ? 'BUY' : 'SELL';
        this.services.deltaAnalyzerService.addTick({
          timestamp: trade.timestamp,
          price: trade.price,
          quantity: trade.quantity,
          side: normalizedSide as 'BUY' | 'SELL',
        });
      }

      // REMOVED: Legacy strategy-based tick feeding
      // New architecture uses JSON-based strategies loaded at startup
    } catch (error) {
      this.logger.error('Error handling trade update', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Private: Register event listener with tracking for cleanup
   */
  private registerListener(emitter: any, event: string, handler: any): void {
    emitter.on(event, handler);
    this.eventListeners.push({ emitter, event, handler });
  }
}
