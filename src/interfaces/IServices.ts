/**
 * Service Interfaces - Phase 5: Dependency Injection Enhancement
 *
 * Defines contracts for core bot services to enable:
 * - Loose coupling between services
 * - Easy mocking for testing
 * - Service swappability
 * - Clear interface contracts
 *
 * Part of LEGO modular architecture transformation
 */

import {
  Position,
  Signal,
  ExitAction,
  ExitType,
  LoggerService,
  Config,
  PositionSide,
  SessionTradeRecord,
  TradingConfig,
  RiskManagementConfig,
  Candle,
} from '../types';
import type { IExchange } from './IExchange';
import { ExitActionDTO } from '../types/architecture.types';

// ============================================================================
// POSITION MANAGEMENT SERVICES
// ============================================================================

/**
 * IPositionLifecycleService - Manage position lifecycle from open to close
 *
 * Responsibilities:
 * - Open new positions with atomic SL/TP setup
 * - Track current position state
 * - Sync positions with WebSocket
 * - Manage take profit levels
 * - Entry confirmation logic
 */
export interface IPositionLifecycleService {
  // State accessors
  getCurrentPosition(): Position | null;
  getTakeProfitManager(): any; // TakeProfitManagerService

  // Position operations
  openPosition(signal: Signal, price?: number): Promise<Position | null>;
  closeFullPosition(
    position: Position | null,
    reason: string,
    price?: number,
  ): Promise<boolean>;
  closePartialPosition(
    position: Position,
    closePercent: number,
    reason: string,
  ): Promise<boolean>;
  closePositionWithAtomicLock(
    position: Position,
    callback: (p: Position) => Promise<boolean>,
  ): Promise<boolean>;

  // State management
  clearPosition(): void;
  restorePosition(position: Position): void;
  syncPositions(): Promise<void>;
  syncWithWebSocket(): Promise<void>;

  // Entry confirmation
  shouldConfirmEntry(): boolean;
  registerConfirmedCandle(): void;

  // Event listeners
  on(event: string, listener: (...args: any[]) => void): void;
  off(event: string, listener?: (...args: any[]) => void): void;
  removeAllListeners(event?: string): void;
}

/**
 * IPositionExitingService - Execute exit actions for positions
 *
 * Responsibilities:
 * - Execute partial/full closes
 * - Update stop-loss and trailing stops
 * - Record exits in journal
 * - Calculate and send PnL notifications
 */
export interface IPositionExitingService {
  executeExitAction(
    position: Position,
    action: ExitActionDTO,
    exitPrice: number,
    exitReason: string,
    exitType: ExitType,
  ): Promise<boolean>;

  closePositionPercent(
    position: Position,
    closePercent: number,
    currentPrice: number,
    reason: string,
  ): Promise<boolean>;

  updateStopLoss(
    position: Position,
    newStopLoss: number,
  ): Promise<boolean>;

  activateTrailingStop(
    position: Position,
    trailingPercent: number,
  ): Promise<boolean>;
}

/**
 * IPositionMonitorService - Monitor position health and states
 *
 * Responsibilities:
 * - Monitor open positions
 * - Detect exit conditions
 * - Sync position state
 * - Handle position closed events
 */
export interface IPositionMonitorService {
  monitor(): Promise<void>;
  handlePositionClosed(position: Position): Promise<void>;
  syncPositionState(): Promise<void>;
}

// ============================================================================
// WEBSOCKET & DATA SERVICES
// ============================================================================

/**
 * IWebSocketManagerService - Manage private WebSocket connection
 *
 * Responsibilities:
 * - Connect/disconnect WebSocket
 * - Handle position and order updates
 * - Manage connection health
 */
export interface IWebSocketManagerService {
  connect(): void;
  disconnect(): void;
  isConnected(): boolean;
  reconnect(): Promise<void>;
}

/**
 * IPublicWebSocketService - Manage public WebSocket for candles
 *
 * Responsibilities:
 * - Connect to public WebSocket
 * - Stream kline/candle data
 * - Manage BTC correlation candles
 */
export interface IPublicWebSocketService {
  connect(): void;
  disconnect(): void;
  isConnected(): boolean;
  setBtcCandlesStore(store: any): void;
}

/**
 * IOrderbookManagerService - Manage orderbook data
 *
 * Responsibilities:
 * - Track orderbook updates
 * - Detect walls and imbalances
 * - Monitor liquidity
 */
export interface IOrderbookManagerService {
  updateOrderbook(symbol: string, orderbook: any): void;
  getOrderbook(symbol: string): any;
}

// ============================================================================
// DATA & JOURNAL SERVICES
// ============================================================================

/**
 * IJournalService - Record and track trades
 *
 * Responsibilities:
 * - Record opened positions
 * - Record closed positions with PnL
 * - Calculate session statistics
 * - Persist trade history
 */
export interface IJournalService {
  recordPositionOpening(
    signal: Signal,
    position: Position,
  ): Promise<void>;

  recordPositionClosing(
    position: Position,
    closePrice: number,
    pnl: number,
    pnlPercent: number,
    exitType: ExitType,
  ): Promise<void>;

  recordTrade(trade: SessionTradeRecord): Promise<void>;

  getVirtualBalance(): number;
  getTrades(): SessionTradeRecord[];
  getCurrentSession(): any;
}

/**
 * ITelegramService - Send notifications
 *
 * Responsibilities:
 * - Send trade entry notifications
 * - Send exit and PnL notifications
 * - Send alerts and errors
 * - Handle notification batching
 */
export interface ITelegramService {
  sendMessage(message: string, options?: any): Promise<void>;
  sendTradeOpened(position: Position, signal: Signal): Promise<void>;
  sendTradeClosed(
    position: Position,
    exitType: ExitType,
    pnl: number,
    pnlPercent: number,
  ): Promise<void>;
  sendAlert(title: string, message: string): Promise<void>;
  sendError(error: Error | string): Promise<void>;
}

// ============================================================================
// UTILITY SERVICES
// ============================================================================

/**
 * ITimeService - Synchronize time with exchange
 *
 * Responsibilities:
 * - Sync local time with exchange server
 * - Detect time drift
 * - Auto-correct time differences
 */
export interface ITimeService {
  initialize(): Promise<void>;
  getServerTime(): number;
  getLocalTime(): number;
  getTimeDifference(): number;
  setBybitService(exchange: IExchange): void;
}

/**
 * ITradingOrchestratorService - Main trading decision engine
 *
 * Responsibilities:
 * - Analyze market data
 * - Generate entry/exit signals
 * - Coordinate with position manager
 * - Track strategy performance
 */
export interface ITradingOrchestratorService {
  runStrategyAnalysis(): Promise<void>;
  getCurrentSignal(): Signal | null;
  setIndicatorPreCalculationService(service: any): void;
  setBtcCandlesStore(store: any): void;
}

// ============================================================================
// EXPORT TYPE
// ============================================================================

/**
 * IBotServices - Complete service container interface
 * Represents all services available in BotServices
 */
export interface IBotServices {
  logger: LoggerService;
  eventBus: any;
  metrics: any;
  telegram: ITelegramService;
  timeService: ITimeService;
  bybitService: IExchange;
  timeframeProvider: any;
  candleProvider: any;
  indicatorCache: any;
  indicatorPreCalc: any;
  tradingOrchestrator: ITradingOrchestratorService;
  strategyOrchestrator?: any;
  journal: IJournalService;
  sessionStats: any;
  positionManager: IPositionLifecycleService;
  positionExitingService: IPositionExitingService;
  realTimeRiskMonitor: any;
  webSocketManager: IWebSocketManagerService;
  publicWebSocket: IPublicWebSocketService;
  orderbookManager: IOrderbookManagerService;
  positionMonitor: IPositionMonitorService;
  positionEventHandler: any;
  webSocketEventHandler: any;
  dashboard: any;
  compoundInterestCalculator?: any;
  retestEntryService?: any;
  deltaAnalyzerService?: any;
  orderbookImbalanceService?: any;
  wallTrackerService?: any;
}
