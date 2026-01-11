import {
  Config,
  Position,
  Candle,
} from './types';


import { BotServices } from './services/bot-services';
import { BotInitializer } from './services/bot-initializer';
import { WebSocketEventHandlerManager } from './services/websocket-event-handler-manager';
import { BotWebAPI } from './api/bot-web-api';

/**
 * Main Trading Bot orchestrator
 * Coordinates all services and manages the trading lifecycle
 *
 * NOTE: This class is ONLY responsible for trading logic.
 * Event API is provided separately via BotEventEmitter adapter.
 */
export class TradingBot {
  private readonly config: Config;
  private readonly services: BotServices;
  private readonly initializer: BotInitializer;
  private readonly eventHandlerManager: WebSocketEventHandlerManager;
  private webAPI?: BotWebAPI; // Lazy-loaded web API adapter

  // Direct service references (no getters - simpler and more transparent)
  private readonly logger: any;
  private readonly telegram: any;
  private readonly timeService: any;
  private readonly journal: any;
  private readonly sessionStats: any;
  private readonly bybitService: any;
  private readonly candleProvider: any;
  private readonly timeframeProvider: any;
  private readonly tradingOrchestrator: any;
  private readonly positionManager: any;
  private readonly webSocketManager: any;
  private readonly publicWebSocket: any;
  private readonly orderbookManager: any;
  private readonly positionMonitor: any;
  private readonly orderbookImbalanceService: any;
  private readonly deltaAnalyzerService: any;
  private readonly wallTrackerService: any;

  // Public accessors for external consumers
  /**
   * Get EventBus for creating BotEventEmitter adapter
   */
  get eventBus() {
    return this.services.eventBus;
  }

  // State
  public isRunning = false;

  // 🔒 CRITICAL: OrderID → TP Level mapping for reliable TP detection
  // Avoids guesswork when multiple TP orders are placed
  private tpOrderToLevel: Map<string, number> = new Map();

  /**
   * Constructor - receives all dependencies via DI (BotFactory)
   *
   * @param services - BotServices container with all initialized services
   * @param config - Bot configuration
   */
  constructor(services: BotServices, config: Config) {
    this.services = services;
    this.config = config;
    this.initializer = new BotInitializer(services, config);
    this.eventHandlerManager = new WebSocketEventHandlerManager(services, config);

    // Initialize direct service references
    this.logger = services.logger;
    this.telegram = services.telegram;
    this.timeService = services.timeService;
    this.journal = services.journal;
    this.sessionStats = services.sessionStats;
    this.bybitService = services.bybitService;
    this.candleProvider = services.candleProvider;
    this.timeframeProvider = services.timeframeProvider;
    this.tradingOrchestrator = services.tradingOrchestrator;
    this.positionManager = services.positionManager;
    this.webSocketManager = services.webSocketManager;
    this.publicWebSocket = services.publicWebSocket;
    this.orderbookManager = services.orderbookManager;
    this.positionMonitor = services.positionMonitor;
    this.orderbookImbalanceService = services.orderbookImbalanceService;
    this.deltaAnalyzerService = services.deltaAnalyzerService;
    this.wallTrackerService = services.wallTrackerService;

    this.logger.info('🤖 TradingBot initialized with injected dependencies via BotFactory');
    this.logger.info('🔍 DEBUG: Config structure check', {
      hasStrategicWeights: !!config.strategicWeights,
      strategicWeightsKeys: config.strategicWeights ? Object.keys(config.strategicWeights) : [],
    });
  }

  /**
   * Preload historical candles for all timeframes
   * Called once at startup to populate cache before trading begins
   */
  private async preloadCandles(): Promise<void> {
    this.logger.info('[Bot] Preloading historical candles for all timeframes...');

    // PHASE 4: Candles are now loaded asynchronously via WebSocket subscription
    // No need for explicit preload - the system will collect them as candles close
    // This prevents cache initialization errors during startup
    this.logger.info('[Bot] ✅ Candle collection via WebSocket initialized (async preload disabled)');
  }

  /**
   * Start the trading bot
   *
   * Lifecycle:
   * 1. Initialize all components (services, candles, time sync)
   * 2. Setup event handlers
   * 3. Connect WebSocket connections
   * 4. Start position monitoring and periodic tasks
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Already running');
      return;
    }

    this.logger.info('Starting...');

    try {
      // Phase 1: Initialize components
      await this.initializer.initialize();

      // Phase 2: Log data subscriptions
      this.initializer.logDataSubscriptionStatus();

      // Phase 3: Connect WebSocket connections
      await this.initializer.connectWebSockets();

      // Phase 4: Register all event handlers
      this.eventHandlerManager.registerAllHandlers(this);

      // Phase 4.5: Setup critical error handling
      this.setupCriticalErrorHandling();

      // Phase 4.7: Connect dashboard to trading events
      this.setupDashboardEventListeners();

      // Phase 5: Start position monitoring and periodic tasks
      await this.initializer.startMonitoring();

      this.isRunning = true;
      this.logger.info('✅ Started successfully! Waiting for candle close events...');

      // Send Telegram notification
      const enabledTimeframes = Object.keys(this.config.timeframes)
        .filter((key) => this.config.timeframes[key].enabled)
        .map((key) => `${key}(${this.config.timeframes[key].interval}m)`);
      await this.telegram.notifyBotStarted(this.config.exchange.symbol, enabledTimeframes);

      // Note: Force open mode is not supported in new TradingOrchestrator architecture
      // Trading will start automatically when ENTRY candles close
      if (this.config.trading.forceOpenPosition?.enabled) {
        this.logger.warn('⚠️ Force open mode is not supported in new architecture - ignoring');
      }
    } catch (error) {
      this.logger.error('Failed to start', { error });
      await this.stop();
      throw error;
    }
  }

  /**
   * Main trading cycle - runs every N seconds
   * Generates signals and opens positions
   */
  // REMOVED: Old tradingCycle() logic - now handled by TradingOrchestrator
  // All trading logic moved to:
  // - ContextAnalyzer (PRIMARY timeframe analysis)
  // - EntryScanner (ENTRY timeframe scanning)
  // - TradingOrchestrator (coordination & execution)

  /**
   * Setup critical error handling
   * Listen for critical errors from position monitor and EventBus
   */
  private setupCriticalErrorHandling(): void {
    // Handler for critical errors
    const handleCriticalError = (error: Error) => {
      this.logger.error('🚨🚨🚨 CRITICAL ERROR RECEIVED - Initiating IMMEDIATE shutdown 🚨🚨🚨', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Set a hard timeout - if shutdown takes too long, force exit
      const shutdownTimeout = setTimeout(() => {
        this.logger.error('⏱️ TIMEOUT: Shutdown took too long. Force exiting...');
        process.exit(1);
      }, 5000); // 5 second timeout

      // Trigger graceful shutdown on critical error
      void this.stop().then(() => {
        clearTimeout(shutdownTimeout);
        this.logger.error('✅ Bot stopped due to critical error. Exiting process.');
        process.exit(1);
      }).catch((stopError) => {
        clearTimeout(shutdownTimeout);
        this.logger.error('Failed to stop bot gracefully', { error: stopError });
        process.exit(1);
      });
    };

    // Listen for critical API errors from position monitor
    this.positionMonitor.on('critical-error', handleCriticalError);

    // Listen for critical API errors from EventBus (e.g., periodic tasks)
    this.services.eventBus.on('critical-error', handleCriticalError);

    this.logger.debug('Critical error handlers registered (positionMonitor + EventBus)');
  }

  /**
   * Stop the trading bot gracefully
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.info('Not running');
      return;
    }

    this.logger.info('Stopping...');

    try {
      // Clean up event handlers (memory leak prevention)
      this.eventHandlerManager.cleanupAllListeners();

      // Delegate to initializer for graceful shutdown
      await this.initializer.shutdown();

      this.isRunning = false;
      this.logger.info('✅ Stopped successfully');
    } catch (error) {
      this.logger.error('Error during shutdown', { error });
      throw error;
    }
  }

  /**
   * Setup dashboard event listeners for real-time updates
   * Connects position and exit events to dashboard display
   */
  private setupDashboardEventListeners(): void {
    // Listen for position-opened events
    this.eventBus.on('position-opened', (data: any) => {
      if (data.position) {
        const p = data.position;
        const msg = `${p.side} @ ${p.entryPrice.toFixed(4)} | Qty: ${p.quantity}`;
        this.services.dashboard.recordEvent('position-open', msg);
      }
    });

    // Listen for position-closed events
    this.eventBus.on('position-closed', (data: any) => {
      if (data.closedPosition) {
        const p = data.closedPosition;
        const pnl = data.pnl || 0;
        const msg = `${p.side} closed | P&L: ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)} USDT`;
        this.services.dashboard.recordEvent('position-close', msg);
      }
    });

    this.logger.debug('📊 Dashboard event listeners configured');
  }

  /**
   * Enable test mode - allows position opening without real signals
   * Used for debugging the position opening workflow
   */
  enableTestMode(): void {
    this.tradingOrchestrator.enableTestMode();
  }

  /**
   * Disable test mode
   */
  disableTestMode(): void {
    this.tradingOrchestrator.disableTestMode();
  }

  /**
   * Get current position
   */
  getCurrentPosition(): Position | null {
    return this.positionManager.getCurrentPosition();
  }

  /**
   * Get current balance
   */
  async getBalance(): Promise<number> {
    try {
      const balance = await this.bybitService.getBalance();
      return balance;
    } catch (error) {
      this.logger.error('Error getting balance', { error });
const positionSize = this.config?.riskManagement?.positionSizeUsdt || 100;      const placeholderBalance = positionSize * 100;      return placeholderBalance;
    }
  }

  /**
   * Get bot status
   */
  getStatus(): {
    isRunning: boolean;
    hasPosition: boolean;
    position: Position | null;
  } {
    return {
      isRunning: this.isRunning,
      hasPosition: this.positionManager.getCurrentPosition() !== null,
      position: this.positionManager.getCurrentPosition(),
    };
  }

  /**
   * Lazy-load web API adapter
   * Provides access to data for web interface
   */
  private getWebAPI(): BotWebAPI {
    if (!this.webAPI) {
      this.webAPI = new BotWebAPI(this.services);
    }
    return this.webAPI;
  }

  /**
   * Get current market data (price, indicators, trend)
   * Delegates to BotWebAPI
   */
  getMarketData(): any {
    return this.getWebAPI().getMarketData();
  }

  /**
   * Get candlestick data for web chart
   * Delegates to BotWebAPI
   */
  async getCandles(timeframe: string, limit: number): Promise<Candle[]> {
    return this.getWebAPI().getCandles(timeframe, limit);
  }

  /**
   * Get position history for web interface
   * Delegates to BotWebAPI
   */
  async getPositionHistory(limit: number): Promise<any[]> {
    return this.getWebAPI().getPositionHistory(limit);
  }

  /**
   * Get orderbook data for web interface
   * Delegates to BotWebAPI
   */
  async getOrderBook(symbol: string): Promise<any> {
    return this.getWebAPI().getOrderBook(symbol);
  }

  /**
   * Get wall orders for web interface
   * Delegates to BotWebAPI
   */
  async getWalls(symbol: string): Promise<any> {
    return this.getWebAPI().getWalls(symbol);
  }

  /**
   * Get funding rate for web interface
   * Delegates to BotWebAPI
   */
  async getFundingRate(symbol: string): Promise<any> {
    return this.getWebAPI().getFundingRate(symbol);
  }

  /**
   * Get volume profile for web interface
   * Delegates to BotWebAPI
   */
  async getVolumeProfile(symbol: string, levels: number): Promise<any> {
    return this.getWebAPI().getVolumeProfile(symbol, levels);
  }
}

