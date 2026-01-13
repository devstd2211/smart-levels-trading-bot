/**
 * Interfaces Index
 * Re-exports all interfaces for easier importing
 */

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

export type {
  IRepository,
  TradeRecord,
  SessionRecord,
} from './IRepository';

export type {
  ISignalGenerator,
  IAnalyzer,
} from './ISignalGenerator';

export type {
  ILogger,
  IMonitoring,
  INotification,
} from './IMonitoring';
