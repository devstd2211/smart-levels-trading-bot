import { TIME_UNITS, INTEGER_MULTIPLIERS } from '../constants';
import { TIMING_CONSTANTS } from '../constants/technical.constants';
/**
 * WebSocket Manager Service
 * Manages Bybit WebSocket connections and subscriptions
 *
 * Responsibilities:
 * 1. Connect to Bybit WebSocket V5
 * 2. Subscribe to Position updates
 * 3. Subscribe to Order execution updates
 * 4. Emit events when position opened/closed
 * 5. Handle reconnection and errors
 *
 * Single Responsibility: Real-time event streaming from exchange
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import {
  ExchangeConfig,
  Position,
  PositionSide,
  LoggerService,
  PositionData,
  OrderExecutionData,
  OrderUpdateData,
} from '../types';
import { OrderExecutionDetectorService } from './order-execution-detector.service';
import { WebSocketAuthenticationService } from './websocket-authentication.service';
import { EventDeduplicationService } from './event-deduplication.service';
import { WebSocketKeepAliveService } from './websocket-keep-alive.service';
import { ErrorHandler, RecoveryStrategy, WebSocketConnectionError, WebSocketAuthenticationError, WebSocketSubscriptionError, ErrorLogger } from '../errors';

// ============================================================================
// CONSTANTS
// ============================================================================

const WS_BASE_URL = 'wss://stream.bybit.com/v5/private';
const WS_TESTNET_URL = 'wss://stream-testnet.bybit.com/v5/private';
const WS_DEMO_URL = 'wss://stream-demo.bybit.com/v5/private';
const RECONNECT_DELAY_MS = TIMING_CONSTANTS.RECONNECT_DELAY_MS;
const MAX_RECONNECT_ATTEMPTS = TIMING_CONSTANTS.MAX_RECONNECT_ATTEMPTS;
const POSITION_SIZE_ZERO = INTEGER_MULTIPLIERS.ZERO;

// ============================================================================
// WEBSOCKET EVENTS
// ============================================================================

export interface PositionUpdateEvent {
  symbol: string;
  side: string;
  size: string;
  avgPrice: string;
  leverage: string;
  unrealisedPnl: string;
}

export interface OrderExecutionEvent {
  orderId: string;
  symbol: string;
  side: string;
  orderStatus: string;
  execQty: string;
  execPrice: string;
}

export interface OrderUpdateEvent {
  orderId: string;
  symbol: string;
  orderType: string;
  orderStatus: string;
  avgPrice: string;
  qty: string;
  cumExecQty: string;
}

// ============================================================================
// WEBSOCKET MANAGER SERVICE
// ============================================================================

export class WebSocketManagerService extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempts: number = 0;
  private isConnecting: boolean = false;
  private shouldReconnect: boolean = true;
  private readonly logger: ErrorLogger; // Get from errorHandler

  constructor(
    private readonly config: ExchangeConfig,
    private readonly symbol: string,
    private readonly errorHandler: ErrorHandler, // Phase 8.8: Singleton - handles BOTH errors and logging
    private readonly orderExecutionDetector: OrderExecutionDetectorService,
    private readonly authService: WebSocketAuthenticationService,
    private readonly deduplicationService: EventDeduplicationService,
    private readonly keepAliveService: WebSocketKeepAliveService,
  ) {
    super();
    // Get logger from errorHandler (single source of truth)
    this.logger = this.errorHandler.getLogger();
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Connect to WebSocket and subscribe to updates
   * Uses exponential backoff for connection retries with ErrorHandler
   */
  async connect(): Promise<void> {
    if (this.isConnecting || (this.ws !== null && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;

    // Select WebSocket URL based on mode
    let wsUrl: string;
    if (this.config.testnet) {
      wsUrl = WS_TESTNET_URL;
    } else if (this.config.demo) {
      wsUrl = WS_DEMO_URL;
    } else {
      wsUrl = WS_BASE_URL;
    }

    this.logger.info('Connecting to WebSocket', { url: wsUrl, mode: this.config.demo ? 'DEMO' : this.config.testnet ? 'TESTNET' : 'MAINNET' });

    // RETRY strategy with exponential backoff (500ms → 1000ms → 2000ms)
    let lastError: Error | null = null;
    const maxAttempts = 3;
    const baseDelay = 500;
    const backoffMultiplier = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.connectOnce(wsUrl);
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxAttempts) {
          // Calculate delay with exponential backoff
          const delayMs = Math.min(baseDelay * Math.pow(backoffMultiplier, attempt - 1), 5000);

          // Log retry attempt
          const tradingError = lastError instanceof WebSocketConnectionError
            ? lastError
            : new WebSocketConnectionError(lastError.message);

          const retryResult = await this.errorHandler.handle(tradingError, {
            strategy: RecoveryStrategy.RETRY,
            context: 'WebSocketManager.connect',
            onRetry: (attemptNum) => {
              this.logger.warn(`[WS] Retry attempt ${attemptNum} after ${delayMs}ms`, {
                url: wsUrl,
                error: lastError?.message,
              });
            },
          });

          if (!retryResult.recovered) {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }
      }
    }

    // All attempts failed
    this.isConnecting = false;
    const finalError = new WebSocketConnectionError(
      `Failed to connect after ${maxAttempts} attempts: ${lastError?.message}`,
      { url: wsUrl, attemptNumber: maxAttempts }
    );

    const result = await this.errorHandler.handle(finalError, {
      strategy: RecoveryStrategy.THROW,
      context: 'WebSocketManager.connect',
    });

    if (!result.success) {
      this.emit('error', result.error || finalError);
      throw result.error || finalError;
    }
  }

  /**
   * Establish a single WebSocket connection (internal helper)
   */
  private async connectOnce(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);

        // Set timeout for connection
        const connectionTimeout = setTimeout(() => {
          if (this.ws) {
            this.ws.terminate();
          }
          reject(new WebSocketConnectionError('WebSocket connection timeout after 10s', { url: wsUrl }));
        }, 10000);

        this.ws.on('open', () => {
          clearTimeout(connectionTimeout);
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          void this.authenticate();
          this.startPing();
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          let message: string;
          if (typeof data === 'string') {
            message = data;
          } else if (Buffer.isBuffer(data)) {
            message = data.toString('utf-8');
          } else if (Array.isArray(data)) {
            message = Buffer.concat(data).toString('utf-8');
          } else {
            return; // Ignore unknown data types
          }
          this.handleMessage(message);
        });

        this.ws.on('error', (error: Error) => {
          clearTimeout(connectionTimeout);
          this.emit('error', error);
          reject(new WebSocketConnectionError(`WebSocket error: ${error.message}`, { url: wsUrl }));
        });

        this.ws.on('close', () => {
          clearTimeout(connectionTimeout);
          this.isConnecting = false;
          this.stopPing();
          this.emit('disconnected');

          if (this.shouldReconnect && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            this.reconnectAttempts++;
            setTimeout(() => {
              void this.connect();
            }, RECONNECT_DELAY_MS);
          }
        });
      } catch (error) {
        reject(new WebSocketConnectionError(`Failed to create WebSocket: ${String(error)}`, { url: wsUrl }));
      }
    });
  }

  /**
   * Disconnect from WebSocket
   * Uses SKIP strategy - non-blocking, logs errors but doesn't throw
   */
  async disconnect(): Promise<void> {
    this.shouldReconnect = false;
    this.stopPing();
    this.deduplicationService.clear();

    // SKIP strategy: attempt disconnect, but don't fail if it errors
    try {
      if (this.ws !== null) {
        this.ws.close();
        this.ws = null;
      }
    } catch (error) {
      const disconnectError = error instanceof Error ? error : new Error(String(error));
      const tradingError = new WebSocketConnectionError(
        `Disconnect error: ${disconnectError.message}`
      );

      await this.errorHandler.handle(tradingError, {
        strategy: RecoveryStrategy.SKIP,
        context: 'WebSocketManager.disconnect',
      });
    }
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get last close reason (for determining exitType in journal)
   */
  getLastCloseReason(): 'SL' | 'TP' | 'TRAILING' | null {
    return this.orderExecutionDetector.getLastCloseReason();
  }

  /**
   * Reset last close reason (called after position closes)
   */
  resetLastCloseReason(): void {
    this.orderExecutionDetector.resetLastCloseReason();
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Check if event is duplicate (already processed)
   * Delegates to EventDeduplicationService
   */
  private isDuplicateEvent(eventType: string, eventId: string, timestamp: number): boolean {
    return this.deduplicationService.isDuplicate(eventType, eventId, timestamp);
  }

  /**
   * Authenticate WebSocket connection
   * Uses RETRY strategy for auth failures with exponential backoff
   * Delegates HMAC signature generation to WebSocketAuthenticationService
   */
  private async authenticate(): Promise<void> {
    if (this.ws === null || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // RETRY strategy with exponential backoff (200ms → 400ms → 800ms)
    let lastError: Error | null = null;
    const maxAttempts = 3;
    const baseDelay = 200;
    const backoffMultiplier = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const authPayload = this.authService.generateAuthPayload(
          this.config.apiKey,
          this.config.apiSecret
        );

        this.ws!.send(JSON.stringify(authPayload));

        // Wait for auth confirmation
        await new Promise<void>((resolve) => {
          setTimeout(() => resolve(), 100); // Brief wait for auth
        });

        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxAttempts) {
          const delayMs = Math.min(baseDelay * Math.pow(backoffMultiplier, attempt - 1), 2000);

          const tradingError = new WebSocketAuthenticationError(lastError.message);
          await this.errorHandler.handle(tradingError, {
            strategy: RecoveryStrategy.RETRY,
            context: 'WebSocketManager.authenticate',
            onRetry: (attemptNum) => {
              this.logger.warn(`[WS] Auth retry attempt ${attemptNum} after ${delayMs}ms`, {
                error: lastError?.message,
              });
            },
          });

          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    // Auth failed - log but don't block (GRACEFUL_DEGRADE)
    const finalError = new WebSocketAuthenticationError(
      `Failed to authenticate after ${maxAttempts} attempts: ${lastError?.message}`
    );

    await this.errorHandler.handle(finalError, {
      strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
      context: 'WebSocketManager.authenticate',
    });

    // Continue to subscribe anyway
    void this.subscribe();
  }

  /**
   * Subscribe to topics after authentication
   * Uses GRACEFUL_DEGRADE strategy - continue even if subscription fails
   * This allows partial operation if some topics can't subscribe
   */
  private async subscribe(): Promise<void> {
    if (this.ws === null || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      // Subscribe to position updates
      const positionTopic = 'position';

      // Subscribe to order execution (market orders)
      const executionTopic = 'execution';

      // Subscribe to order updates (conditional orders: TP/SL)
      const orderTopic = 'order';

      const subscribeMessage = {
        op: 'subscribe',
        args: [positionTopic, executionTopic, orderTopic],
      };

      this.ws.send(JSON.stringify(subscribeMessage));

      this.logger.info('Private WebSocket subscribed to topics', {
        topics: [positionTopic, executionTopic, orderTopic],
      });
    } catch (error) {
      // GRACEFUL_DEGRADE: log error but continue operation
      const subscriptionError = error instanceof Error ? error : new Error(String(error));
      const tradingError = new WebSocketSubscriptionError(
        `Subscription failed: ${subscriptionError.message}`
      );

      await this.errorHandler.handle(tradingError, {
        strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
        context: 'WebSocketManager.subscribe',
      });
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    try {
      // this.logger.debug('Data:', {
      //    data: JSON.stringify(data)
      // });
      const message = JSON.parse(data) as {
        success?: boolean;
        op?: string;
        topic?: string;
        data?: unknown;
      };

      this.routeMessage(message);
    } catch (error) {
      this.emit('error', new Error(`Failed to parse message: ${String(error)}`));
    }
  }

  /**
   * Route message to appropriate handler
   */
  private routeMessage(message: {
    success?: boolean;
    op?: string;
    topic?: string;
    data?: unknown;
  }): void {
    // Log all incoming messages (DEBUG level)
    /* this.logger.debug('Private WebSocket message received', {
      op: message.op,
      topic: message.topic,
      success: message.success,
      hasData: message.data !== undefined,
    });
*/
    // Handle auth response
    if (message.op === 'auth' && message.success === true) {
      this.logger.info('Private WebSocket authenticated successfully');
      this.subscribe();
      return;
    }

    // Handle subscription confirmation
    if (message.op === 'subscribe') {
      if (message.success === true) {
        this.logger.info('✅ Bybit confirmed subscription', {
          success: true,
        });
      } else {
        this.logger.error('❌ Bybit rejected subscription', {
          success: message.success,
          message,
        });
      }
      return;
    }

    // Handle pong
    if (message.op === 'pong') {
      return;
    }

    // Handle topic messages
    if (message.data === undefined || message.data === null) {
      return;
    }

    const messageData = message.data;

    // this.logger.debug('RECEIVE MESSAGE!!!!', {
    //     data: JSON.stringify(message)
    // });
    if (message.topic === 'position') {
      this.handlePositionUpdate(messageData as PositionData | PositionData[]);
    } else if (message.topic === 'execution') {
      this.logger.debug('Received execution topic event', {
        executionCount: Array.isArray(messageData) ? messageData.length : 0,
      });
      this.handleOrderExecution(messageData as OrderExecutionData | OrderExecutionData[]);
    } else if (message.topic === 'order') {
      this.logger.debug('Received order topic event', {
        orderCount: Array.isArray(messageData) ? messageData.length : 0,
      });
      this.handleOrderUpdate(messageData as OrderUpdateData | OrderUpdateData[]);
    }
  }

  /**
   * Handle position update from WebSocket
   */
  private handlePositionUpdate(data: PositionData | PositionData[]): void {
    const positions = Array.isArray(data) ? data : [data];

    for (const pos of positions) {
      this.processPositionData(pos);
    }
  }

  /**
   * Process single position data
   */
  private processPositionData(pos: PositionData): void {
    const posData = pos;

    // Filter by our symbol
    if (posData.symbol !== this.symbol) {
      return;
    }

    const size = parseFloat(posData.size ?? '0');

    // Position closed - reset TP counter
    if (size === POSITION_SIZE_ZERO) {
      this.orderExecutionDetector.resetTpCounter();
      this.emit('positionClosed', { symbol: this.symbol });
      return;
    }

    // Position opened or updated
    // CRITICAL FIX: Check for EMPTY strings, not just null/undefined
    // parseFloat('') = NaN, so we must validate before parsing
    const parseEntryPrice = (): number => {
      // Try entryPrice first (must be non-empty)
      if (posData.entryPrice && posData.entryPrice.trim()) {
        const price = parseFloat(posData.entryPrice);
        if (!isNaN(price)) return price;
      }
      // Fall back to avgPrice (must be non-empty)
      if (posData.avgPrice && posData.avgPrice.trim()) {
        const price = parseFloat(posData.avgPrice);
        if (!isNaN(price)) return price;
      }
      // Default to 0 if both are invalid
      return 0;
    };

    const position: Position = {
      id: `${this.symbol}_${posData.side ?? 'unknown'}`,
      symbol: this.symbol,
      side: posData.side === 'Buy' ? PositionSide.LONG : PositionSide.SHORT,
      quantity: size,
      entryPrice: parseEntryPrice(),
      leverage: parseFloat(posData.leverage ?? '1'),
      marginUsed: parseFloat(posData.positionIM ?? '0'), // Initial margin
      stopLoss: {
        price: 0,
        initialPrice: 0,
        isBreakeven: false,
        isTrailing: false,
        updatedAt: Date.now(),
      },
      takeProfits: [],
      openedAt: Date.now(),
      unrealizedPnL: parseFloat(posData.unrealisedPnl ?? '0'),
      orderId: '',
      reason: 'WebSocket position update',
      status: 'OPEN', // Position from WebSocket is OPEN
    };

    this.emit('positionUpdate', position);
  }

  /**
   * Handle order execution from WebSocket
   * Delegates order detection to OrderExecutionDetectorService
   */
  private handleOrderExecution(data: OrderExecutionData | OrderExecutionData[]): void {
    const executions = Array.isArray(data) ? data : [data];

    for (const execData of executions) {
      // Filter by our symbol
      if (execData.symbol !== this.symbol) {
        continue;
      }

      // Detect execution type using domain service
      const result = this.orderExecutionDetector.detectExecution(execData);

      // Handle based on execution type
      switch (result.type) {
        case 'TAKE_PROFIT': {
          // Check for duplicate event
          const eventKey = `${result.orderId ?? 'unknown'}_${result.execPrice ?? '0'}_${result.closedSize}`;
          if (this.isDuplicateEvent('TP', eventKey, Date.now())) {
            break;
          }

          this.logger.info(`🎯 TP${result.tpLevel} execution detected from WebSocket`, {
            tpLevel: result.tpLevel,
            orderId: result.orderId,
            execPrice: result.execPrice,
            execQty: result.execQty,
            closedSize: result.closedSize,
          });

          this.emit('takeProfitFilled', {
            orderId: result.orderId ?? '',
            symbol: this.symbol,
            side: result.side,
            avgPrice: result.execPrice.toString(),
            qty: result.execQty,
            cumExecQty: result.closedSizeStr ?? result.execQty,
          });
          break;
        }

        case 'STOP_LOSS': {
          // Check for duplicate event
          const eventKey = `${result.orderId ?? 'unknown'}_${result.execPrice ?? '0'}`;
          if (this.isDuplicateEvent('SL', eventKey, Date.now())) {
            break;
          }

          this.logger.info('🛑 Stop Loss execution detected from WebSocket', {
            orderId: result.orderId,
            execPrice: result.execPrice,
            execQty: result.execQty,
          });

          this.emit('stopLossFilled', {
            orderId: result.orderId ?? '',
            symbol: this.symbol,
            side: result.side,
            avgPrice: result.execPrice.toString(),
            qty: result.execQty,
            cumExecQty: result.closedSizeStr ?? result.execQty,
          });
          break;
        }

        case 'TRAILING_STOP': {
          // Check for duplicate event
          const eventKey = `${result.orderId ?? 'unknown'}_${result.execPrice ?? '0'}`;
          if (this.isDuplicateEvent('TRAILING', eventKey, Date.now())) {
            break;
          }

          this.logger.info('📉 Trailing Stop execution detected from WebSocket', {
            orderId: result.orderId,
            execPrice: result.execPrice,
            execQty: result.execQty,
          });

          this.emit('stopLossFilled', {
            orderId: result.orderId ?? '',
            symbol: this.symbol,
            side: result.side,
            avgPrice: result.execPrice.toString(),
            qty: result.execQty,
            cumExecQty: result.closedSizeStr ?? result.execQty,
          });
          break;
        }

        case 'ENTRY': {
          this.emit('orderFilled', {
            orderId: result.orderId ?? '',
            symbol: this.symbol,
            side: result.side,
            execQty: result.execQty,
            execPrice: result.execPrice.toString(),
          });
          break;
        }

        // UNKNOWN or other types - emit generic event
        default:
          break;
      }
    }
  }

  /**
   * Handle order update from WebSocket (conditional orders: TP/SL)
   */
  private handleOrderUpdate(data: OrderUpdateData | OrderUpdateData[]): void {
    const orders = Array.isArray(data) ? data : [data];

    for (const order of orders) {
      const orderData = order;

      // Log all orders for debugging
      this.logger.debug('Processing order update', {
        orderId: orderData.orderId,
        symbol: orderData.symbol,
        status: orderData.orderStatus,
        stopOrderType: orderData.stopOrderType,
        avgPrice: orderData.avgPrice,
      });

      // Filter by our symbol
      if (orderData.symbol !== this.symbol) {
        continue;
      }

      // Only process filled orders
      if (orderData.orderStatus !== 'Filled') {
        continue;
      }

      // Check if this is a Take Profit order
      const isTakeProfit = orderData.stopOrderType === 'TakeProfit';
      const isStopLoss = orderData.stopOrderType === 'StopLoss';

      if (isTakeProfit) {
        this.logger.info('🎯 Take Profit detected from WebSocket', {
          orderId: orderData.orderId,
          avgPrice: orderData.avgPrice,
          qty: orderData.cumExecQty,
        });
        this.emit('takeProfitFilled', {
          orderId: orderData.orderId ?? '',
          symbol: this.symbol,
          side: orderData.side ?? '',
          avgPrice: orderData.avgPrice ?? '0',
          qty: orderData.qty ?? '0',
          cumExecQty: orderData.cumExecQty ?? '0',
        });
      } else if (isStopLoss) {
        this.logger.info('🛑 Stop Loss detected from WebSocket', {
          orderId: orderData.orderId,
          avgPrice: orderData.avgPrice,
          qty: orderData.cumExecQty,
        });
        this.emit('stopLossFilled', {
          orderId: orderData.orderId ?? '',
          symbol: this.symbol,
          side: orderData.side ?? '',
          avgPrice: orderData.avgPrice ?? '0',
          qty: orderData.qty ?? '0',
          cumExecQty: orderData.cumExecQty ?? '0',
        });
      }
    }
  }

  /**
   * Start ping interval to keep connection alive
   * Delegates to WebSocketKeepAliveService
   */
  private startPing(): void {
    if (this.ws !== null) {
      this.keepAliveService.start(this.ws);
    }
  }

  /**
   * Stop ping interval
   * Delegates to WebSocketKeepAliveService
   */
  private stopPing(): void {
    this.keepAliveService.stop();
  }
}
