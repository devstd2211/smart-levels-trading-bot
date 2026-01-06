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
import crypto from 'crypto';
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

// ============================================================================
// CONSTANTS
// ============================================================================

const WS_BASE_URL = 'wss://stream.bybit.com/v5/private';
const WS_TESTNET_URL = 'wss://stream-testnet.bybit.com/v5/private';
const WS_DEMO_URL = 'wss://stream-demo.bybit.com/v5/private';
const PING_INTERVAL_MS = TIMING_CONSTANTS.PING_INTERVAL_MS;
const RECONNECT_DELAY_MS = TIMING_CONSTANTS.RECONNECT_DELAY_MS;
const MAX_RECONNECT_ATTEMPTS = TIMING_CONSTANTS.MAX_RECONNECT_ATTEMPTS;
const AUTH_EXPIRES_OFFSET_MS = TIMING_CONSTANTS.AUTH_EXPIRES_OFFSET_MS;
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
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private isConnecting: boolean = false;
  private shouldReconnect: boolean = true;
  private tpCounter: number = 0;
  private lastCloseReason: 'SL' | 'TP' | 'TRAILING' | null = null; // Track last close reason for journal

  // Event deduplication
  private processedEvents = new Map<string, number>(); // eventKey → timestamp
  private readonly EVENT_CACHE_SIZE = INTEGER_MULTIPLIERS.ONE_HUNDRED;
  private readonly EVENT_CACHE_TTL_MS = TIME_UNITS.MINUTE; // 1 minute

  constructor(
    private readonly config: ExchangeConfig,
    private readonly symbol: string,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Connect to WebSocket and subscribe to updates
   */
  connect(): void {
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

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.authenticate();
      this.startPing();
      this.emit('connected');
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
      this.emit('error', error);
    });

    this.ws.on('close', () => {
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
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.stopPing();

    if (this.ws !== null) {
      this.ws.close();
      this.ws = null;
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
    return this.lastCloseReason;
  }

  /**
   * Reset last close reason (called after position closes)
   */
  resetLastCloseReason(): void {
    this.lastCloseReason = null;
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Check if event is duplicate (already processed)
   * @param eventType - Type of event (TP, SL, POSITION)
   * @param orderId - Order ID
   * @param timestamp - Event timestamp
   * @returns true if duplicate, false if new event
   */
  private isDuplicateEvent(eventType: string, orderId: string, timestamp: number): boolean {
    const eventKey = `${eventType}_${orderId}_${timestamp}`;

    if (this.processedEvents.has(eventKey)) {
      this.logger.debug('Duplicate event ignored', { eventKey });
      return true;
    }

    // Store event
    this.processedEvents.set(eventKey, Date.now());

    // Cleanup old events if cache is too large
    if (this.processedEvents.size > this.EVENT_CACHE_SIZE) {
      const now = Date.now();
      for (const [key, time] of this.processedEvents.entries()) {
        if (now - time > this.EVENT_CACHE_TTL_MS) {
          this.processedEvents.delete(key);
        }
      }
    }

    return false;
  }

  /**
   * Authenticate WebSocket connection
   */
  private authenticate(): void {
    if (this.ws === null || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const expires = Date.now() + AUTH_EXPIRES_OFFSET_MS;
    const signature = crypto
      .createHmac('sha256', this.config.apiSecret)
      .update(`GET/realtime${expires}`)
      .digest('hex');

    const authMessage = {
      op: 'auth',
      args: [this.config.apiKey, expires.toString(), signature],
    };

    this.ws.send(JSON.stringify(authMessage));
  }

  /**
   * Subscribe to topics after authentication
   */
  private subscribe(): void {
    if (this.ws === null || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

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
      this.logger.debug('Position closed - resetting TP counter', { previousCounter: this.tpCounter });
      this.tpCounter = 0;
      this.emit('positionClosed', { symbol: this.symbol });
      return;
    }

    // Position opened or updated
    const position: Position = {
      id: `${this.symbol}_${posData.side ?? 'unknown'}`,
      symbol: this.symbol,
      side: posData.side === 'Buy' ? PositionSide.LONG : PositionSide.SHORT,
      quantity: size,
      entryPrice: parseFloat(posData.entryPrice ?? posData.avgPrice ?? '0'),
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
   * This is where TP/SL fills come through!
   */
  private handleOrderExecution(data: OrderExecutionData | OrderExecutionData[]): void {
    const executions = Array.isArray(data) ? data : [data];

    for (const exec of executions) {
      const execData = exec;

      // Log all executions for debugging
      this.logger.debug('Processing execution event', {
        orderId: execData.orderId,
        symbol: execData.symbol,
        execType: execData.execType,
        stopOrderType: execData.stopOrderType,
        orderType: execData.orderType,
        createType: execData.createType,
        execPrice: execData.execPrice,
        execQty: execData.execQty,
        closedSize: execData.closedSize,
      });

      // Filter by our symbol
      if (execData.symbol !== this.symbol) {
        continue;
      }

      // Detect Take Profit: stopOrderType="UNKNOWN" + createType="CreateByUser" + closedSize > 0
      const closedSize = parseFloat(execData.closedSize ?? '0');
      const isTakeProfit =
        execData.stopOrderType === 'UNKNOWN' &&
        execData.createType === 'CreateByUser' &&
        closedSize > 0;

      // Detect Stop Loss: stopOrderType="StopLoss" or "Stop" (Bybit uses both)
      const isStopLoss = execData.stopOrderType === 'StopLoss' || execData.stopOrderType === 'Stop';

      // Detect Trailing Stop: stopOrderType="TrailingStop" (should not happen in execution, but just in case)
      const isTrailingStop = execData.stopOrderType === 'TrailingStop';

      if (isTakeProfit) {
        // Check for duplicate event
        const eventKey = `${execData.orderId ?? 'unknown'}_${execData.execPrice ?? '0'}_${closedSize}`;
        if (this.isDuplicateEvent('TP', eventKey, Date.now())) {
          continue; // Skip duplicate
        }

        // Increment TP counter
        this.tpCounter++;

        this.logger.info(`🎯 TP${this.tpCounter} execution detected from WebSocket`, {
          tpLevel: this.tpCounter,
          orderId: execData.orderId,
          execPrice: execData.execPrice,
          execQty: execData.execQty,
          closedSize: execData.closedSize,
        });

        // Track close reason for journal
        this.lastCloseReason = 'TP';

        this.emit('takeProfitFilled', {
          orderId: execData.orderId ?? '',
          symbol: this.symbol,
          side: execData.side ?? '',
          avgPrice: execData.execPrice ?? '0',
          qty: execData.execQty ?? '0',
          cumExecQty: execData.closedSize ?? execData.execQty ?? '0',
        });
      } else if (isStopLoss) {
        // Check for duplicate event
        const eventKey = `${execData.orderId ?? 'unknown'}_${execData.execPrice ?? '0'}`;
        if (this.isDuplicateEvent('SL', eventKey, Date.now())) {
          continue; // Skip duplicate
        }

        this.logger.info('🛑 Stop Loss execution detected from WebSocket', {
          orderId: execData.orderId,
          execPrice: execData.execPrice,
          execQty: execData.execQty,
        });

        // Reset TP counter
        this.logger.debug('Stop Loss hit - resetting TP counter', { previousCounter: this.tpCounter });
        this.tpCounter = 0;

        // Track close reason for journal
        this.lastCloseReason = 'SL';

        this.emit('stopLossFilled', {
          orderId: execData.orderId ?? '',
          symbol: this.symbol,
          side: execData.side ?? '',
          avgPrice: execData.execPrice ?? '0',
          qty: execData.execQty ?? '0',
          cumExecQty: execData.closedSize ?? execData.execQty ?? '0',
        });
      } else if (isTrailingStop) {
        // Check for duplicate event
        const eventKey = `${execData.orderId ?? 'unknown'}_${execData.execPrice ?? '0'}`;
        if (this.isDuplicateEvent('TRAILING', eventKey, Date.now())) {
          continue; // Skip duplicate
        }

        this.logger.info('📉 Trailing Stop execution detected from WebSocket', {
          orderId: execData.orderId,
          execPrice: execData.execPrice,
          execQty: execData.execQty,
        });

        // Reset TP counter
        this.logger.debug('Trailing Stop hit - resetting TP counter', { previousCounter: this.tpCounter });
        this.tpCounter = 0;

        // Track close reason for journal
        this.lastCloseReason = 'TRAILING';

        this.emit('stopLossFilled', {
          orderId: execData.orderId ?? '',
          symbol: this.symbol,
          side: execData.side ?? '',
          avgPrice: execData.execPrice ?? '0',
          qty: execData.execQty ?? '0',
          cumExecQty: execData.closedSize ?? execData.execQty ?? '0',
        });
      } else {
        // Regular order fill (market/limit entry) - reset TP counter for new position
        this.logger.debug('Position entry execution - resetting TP counter', { previousCounter: this.tpCounter });
        this.tpCounter = 0;

        this.emit('orderFilled', {
          orderId: execData.orderId ?? '',
          symbol: this.symbol,
          side: execData.side ?? '',
          execQty: execData.execQty ?? '0',
          execPrice: execData.execPrice ?? '0',
        });
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
   */
  private startPing(): void {
    this.stopPing();

    this.pingInterval = setInterval(() => {
      if (this.ws !== null && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ op: 'ping' }));
      }
    }, PING_INTERVAL_MS);
  }

  /**
   * Stop ping interval
   */
  private stopPing(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}
