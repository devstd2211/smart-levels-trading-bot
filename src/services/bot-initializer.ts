import { INTEGER_MULTIPLIERS } from '../constants';
import { TIME_MULTIPLIERS } from '../constants/technical.constants';
import { Config, LoggerService } from '../types';
import { BotServices } from './bot-services';

/**
 * BotInitializer - Manages bot lifecycle (initialization and shutdown)
 *
 * Responsibilities:
 * - Initialize all bot components in correct order
 * - Start WebSocket connections
 * - Setup periodic maintenance tasks
 * - Graceful shutdown with cleanup
 *
 * This extracts lifecycle logic from TradingBot to keep it focused on orchestration.
 */
export class BotInitializer {
  private logger: LoggerService;
  private periodicTaskInterval: NodeJS.Timeout | null = null;

  constructor(
    private services: BotServices,
    private config: Config,
  ) {
    this.logger = services.logger;
  }

  /**
   * Initialize all bot components
   * Called once at startup in correct dependency order
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('🚀 Starting bot initialization sequence...');

      // Phase 1: Initialize Bybit service - load symbol precision parameters
      await this.initializeBybit();

      // Phase 2: Start session statistics tracking
      await this.startSessionStats();

      // Phase 3: Synchronize time with exchange server
      await this.syncTimeWithExchange();

      // Phase 4: Initialize candle provider (if enabled)
      if (this.config.dataSubscriptions.candles.enabled) {
        await this.initializeCandleProvider();
      } else {
        this.logger.warn('⚠️ Candles disabled - strategies may not work correctly!');
      }

      // Phase 4.5: Load BTC candles (if BTC confirmation is enabled)
      if (this.config.btcConfirmation?.enabled) {
        await this.initializeBtcCandles();
      }

      // Phase 5: Initialize trend analysis from loaded candles (CRITICAL - prevents ~5 minute startup delay)
      // MUST be called after candles are loaded but before trading starts
      if ((this.services as any).tradingOrchestrator) {
        this.logger.info('📍 Phase 5: Calling TradingOrchestrator.initializeTrendAnalysis()...');
        await (this.services as any).tradingOrchestrator.initializeTrendAnalysis();
        this.logger.info('✅ Phase 5: TradingOrchestrator.initializeTrendAnalysis() completed');
      } else {
        this.logger.warn('⚠️ TradingOrchestrator not available in BotServices');
      }

      this.logger.info('✅ Bot initialization complete - ready to start trading');
    } catch (error) {
      this.logger.error('Failed to initialize bot', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Connect WebSocket connections
   * Called after initialization, before trading starts
   */
  async connectWebSockets(): Promise<void> {
    try {
      this.logger.info('📡 Connecting WebSocket connections...');

      // Connect Private WebSocket (position/orders)
      this.logger.info('Connecting Private WebSocket...');
      this.services.webSocketManager.connect();

      // Connect Public WebSocket (kline/candles/orderbook)
      this.logger.info('Connecting Public WebSocket...');
      this.services.publicWebSocket.connect();

      this.logger.info('✅ WebSocket connections established');
    } catch (error) {
      this.logger.error('Failed to connect WebSockets', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Start position monitor and periodic maintenance tasks
   * Called after WebSocket connections are established
   */
  async startMonitoring(): Promise<void> {
    try {
      this.logger.info('🔍 Starting position monitor and maintenance tasks...');

      // CRITICAL: Restore open positions from exchange BEFORE periodic cleanup starts
      // This prevents race condition where cleanup cancels SL/TP before position is restored from WebSocket
      await this.restoreOpenPositions();

      // Start Position Monitor
      this.services.positionMonitor.start();
      this.logger.debug('Position monitor started');

      // Setup periodic maintenance tasks (only after position restoration)
      this.setupPeriodicTasks();

      this.logger.info('✅ Position monitor and maintenance tasks started');
    } catch (error) {
      this.logger.error('Failed to start monitoring', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Restore open positions from exchange after bot restart
   * CRITICAL: This is called BEFORE periodic cleanup to prevent cancelling SL/TP orders
   *
   * Race condition being prevented:
   * - Bot stops with open position
   * - Bot restarts
   * - Periodic cleanup runs every 30s and calls cancelAllConditionalOrders() if no position in memory
   * - WebSocket position restoration happens async and might not complete before first cleanup
   *
   * Solution: Proactively fetch position from exchange and restore to memory BEFORE cleanup starts
   */
  private async restoreOpenPositions(): Promise<void> {
    try {
      this.logger.info('🔄 Checking for open positions to restore...');

      // Fetch current position from exchange
      const exchangePosition = await this.services.bybitService.getPosition();

      if (exchangePosition === null || exchangePosition.quantity === 0) {
        this.logger.debug('✅ No open positions found on exchange - clean state');
        return;
      }

      // Position exists on exchange - restore it to memory
      this.logger.info('✅ Found open position on exchange - restoring to memory...', {
        symbol: exchangePosition.symbol,
        side: exchangePosition.side,
        quantity: exchangePosition.quantity,
        entryPrice: exchangePosition.entryPrice,
      });

      // Sync position with WebSocket (this handles journal linking)
      this.services.positionManager.syncWithWebSocket(exchangePosition);

      const restoredPosition = this.services.positionManager.getCurrentPosition();
      if (restoredPosition) {
        this.logger.info('✅ Position restored successfully', {
          positionId: restoredPosition.id,
          journalId: restoredPosition.journalId,
          protectionVerified: restoredPosition.protectionVerifiedOnce,
        });
      }
    } catch (error) {
      this.logger.error('Failed to restore open positions', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Non-fatal error - continue startup but log the issue
      // User should investigate why position restoration failed
    }
  }

  /**
   * Graceful shutdown - stop all components
   */
  async shutdown(): Promise<void> {
    try {
      this.logger.info('🛑 Starting graceful shutdown...');

      // Stop periodic tasks
      if (this.periodicTaskInterval) {
        clearInterval(this.periodicTaskInterval);
        this.periodicTaskInterval = null;
        this.logger.debug('Periodic tasks stopped');
      }

      // Stop position monitor
      this.services.positionMonitor.stop();
      this.logger.debug('Position monitor stopped');

      // Remove all position monitor listeners
      this.services.positionMonitor.removeAllListeners();
      this.logger.debug('Position monitor listeners removed');

      // Disconnect Private WebSocket
      this.services.webSocketManager.disconnect();
      this.logger.debug('Private WebSocket disconnected');
      this.services.webSocketManager.removeAllListeners();
      this.logger.debug('Private WebSocket listeners removed');

      // Disconnect Public WebSocket
      this.services.publicWebSocket.disconnect();
      this.logger.debug('Public WebSocket disconnected');
      this.services.publicWebSocket.removeAllListeners();
      this.logger.debug('Public WebSocket listeners removed');

      // End session statistics tracking
      this.services.sessionStats.endSession();
      this.logger.info('📊 Session ended');

      // Send Telegram notification
      await this.services.telegram.notifyBotStopped();

      this.logger.info('✅ Shutdown complete');
    } catch (error) {
      this.logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Private: Initialize Bybit service
   */
  private async initializeBybit(): Promise<void> {
    this.logger.info('Initializing Bybit service...');
    await this.services.bybitService.initialize();
    this.logger.debug('✅ Bybit service initialized');
  }

  /**
   * Private: Start session statistics
   */
  private async startSessionStats(): Promise<void> {
    this.logger.info('Starting session statistics...');
    const sessionId = this.services.sessionStats.startSession(
      this.config,
      this.config.exchange.symbol,
    );
    this.logger.info(`📊 Session started: ${sessionId}`);
  }

  /**
   * Private: Synchronize time with exchange
   */
  private async syncTimeWithExchange(): Promise<void> {
    this.logger.info('Synchronizing time with exchange...');
    await this.services.timeService.syncWithExchange();

    const syncInfo = this.services.timeService.getSyncInfo();
    this.logger.info('Time synchronized', {
      offset: syncInfo.offset,
      nextSyncIn: `${Math.round(syncInfo.nextSyncIn / TIME_MULTIPLIERS.MILLISECONDS_PER_SECOND)}s`,
    });
  }

  /**
   * Private: Initialize candle provider cache
   */
  private async initializeCandleProvider(): Promise<void> {
    this.logger.info('Initializing candle cache for all enabled timeframes...');
    await this.services.candleProvider.initialize();
    this.logger.debug('✅ Candle cache initialized (async preload disabled)');
  }

  /**
   * Private: Setup periodic maintenance tasks
   *
   * Runs every 30 seconds:
   * - Re-synchronize time with exchange (prevent drift)
   * - Clean up hanging conditional orders (when no position is open)
   */
  private setupPeriodicTasks(): void {
    const PERIODIC_INTERVAL_MS =
      INTEGER_MULTIPLIERS.THIRTY * TIME_MULTIPLIERS.MILLISECONDS_PER_SECOND; // 30 seconds

    this.periodicTaskInterval = setInterval(async () => {
      try {
        // Task 1: Re-synchronize time with Bybit server
        // CRITICAL: Prevents timestamp drift accumulation
        await this.services.bybitService.resyncTime();

        // Task 2: Cleanup hanging conditional orders
        // CRITICAL FIX: Check both currentPosition AND isOpeningPosition flag
        // to prevent race condition where cleanup cancels newly placed TP/SL orders
        const currentPosition = this.services.positionManager.getCurrentPosition();
        const isOpeningPosition = (this.services.positionManager as any).isOpeningPosition;

        if (!currentPosition && !isOpeningPosition) {
          this.logger.debug(
            '🧹 Periodic cleanup: checking for hanging conditional orders...',
          );
          await this.services.bybitService.cancelAllConditionalOrders();
        } else {
          if (currentPosition) {
            this.logger.debug('🧹 Periodic cleanup: skipping (active position exists)', {
              positionId: currentPosition.id,
            });
          }
          if (isOpeningPosition) {
            this.logger.debug('🧹 Periodic cleanup: skipping (position opening in progress)');
          }
        }
      } catch (error) {
        this.logger.error('Error in periodic tasks', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, PERIODIC_INTERVAL_MS);

    this.logger.info(
      '✅ Periodic tasks enabled (every 30 seconds): time sync + conditional orders cleanup',
    );
  }

  /**
   * Private: Initialize BTC candles for correlation analysis
   */
  private async initializeBtcCandles(): Promise<void> {
    try {
      const btcConfig = this.config.btcConfirmation;
      if (!btcConfig) {
        this.logger.warn('⚠️ BTC confirmation config not found');
        return;
      }

      this.logger.info('🔗 Loading BTC candles for correlation analysis...', {
        symbol: btcConfig.symbol,
        interval: btcConfig.timeframe,
        lookbackCandles: btcConfig.lookbackCandles,
      });

      const btcCandles = await this.services.bybitService.getCandles(
        btcConfig.symbol,
        btcConfig.timeframe,
        btcConfig.lookbackCandles || 100,
      );

      this.services.btcCandles1m = btcCandles;

      this.logger.info('✅ BTC candles loaded successfully', {
        count: btcCandles.length,
        latestTimestamp: btcCandles.length > 0 ? new Date(btcCandles[btcCandles.length - 1].timestamp).toISOString() : 'N/A',
      });
    } catch (error) {
      const errorObj = error instanceof Error ? { error: error.message } : { error: String(error) };
      this.logger.error('Failed to load BTC candles', errorObj);
      // Don't throw - allow bot to continue without BTC confirmation
      this.services.btcCandles1m = [];
    }
  }

  /**
   * Log data subscription status
   * Helper method for debugging
   */
  logDataSubscriptionStatus(): void {
    this.logger.info('📊 Data Subscriptions:', {
      candles: this.config.dataSubscriptions.candles.enabled ? '✅' : '❌',
      indicators: this.config.dataSubscriptions.candles.calculateIndicators ? '✅' : '❌',
      orderbook: this.config.dataSubscriptions.orderbook.enabled ? '✅' : '❌',
      ticks: this.config.dataSubscriptions.ticks.enabled ? '✅' : '❌',
      delta: this.config.dataSubscriptions.ticks.calculateDelta ? '✅' : '❌',
    });
  }
}
