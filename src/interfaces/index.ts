/**
 * Interfaces Index
 * Re-exports all interfaces for easier importing
 */

// Exchange & Market Data
export type {
  IExchange,
  IExchangeMarketData,
  IExchangePositions,
  IExchangeOrders,
  IExchangeAccount,
  CandleParams,
  OpenPositionParams,
  PositionUpdateResult,
  UpdateStopLossParams,
  ActivateTrailingParams,
  ClosePositionParams,
  OrderParams,
  OrderResult,
  AccountBalance,
} from './IExchange';

export type { ICandleProvider } from './ICandleProvider';

export type { ITrendAnalyzer } from './ITrendAnalyzer';

// Persistence
export type {
  IRepository,
  TradeRecord,
  SessionRecord,
} from './IRepository';

// Analyzers & Signals
export type {
  ISignalGenerator,
  IAnalyzer,
} from './ISignalGenerator';

// Monitoring & Logging
export type {
  ILogger,
  IMonitoring,
  INotification,
} from './IMonitoring';

// Phase 5: Service Interfaces for DI Enhancement
export type {
  IPositionLifecycleService,
  IPositionExitingService,
  IPositionMonitorService,
  IWebSocketManagerService,
  IPublicWebSocketService,
  IOrderbookManagerService,
  IJournalService,
  ITelegramService,
  ITimeService,
  ITradingOrchestratorService,
  IBotServices,
} from './IServices';
