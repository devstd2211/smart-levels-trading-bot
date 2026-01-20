/**
 * Edison Trading Bot - Types Index
 * Re-exports all types from domain-specific files
 */

// Re-export all enums
export {
  SignalDirection,
  SignalType,
  PositionSide,
  OrderType,
  ExitType,
  TrendType,
  TrendBias,
  MarketStructure,
  StructureEventType,
  StructureDirection,
  EMACrossover,
  TimeframeRole,
  ContextFilteringMode,
  TradingMode,
  StopLossType,
  BreakevenMode,
  SwingPointType,
  SweepType,
  VolatilityRegime,
  BTCDirection,
  OrderBlockType,
  FVGType,
  FVGStatus,
  FractalType,
  EntryDecision,
  PositionState,
  ExitAction,
  LogLevel,
} from './enums';

// Re-export all core types
export type {
  Candle,
  TakeProfit,
  CorrelationResult,
  BTCAnalysis,
  StopLossConfig,
  Signal,
  Position,
  AggregatedSignal,
} from './core';

// Re-export all strategy types
export type {
  StrategyWeights,
  BlockingRules,
  StrategySignal,
  AnalyzerSignal,
  CoordinatorResult,
  StrategyEvaluation,
  StrategyStats,
  DirectionStats,
} from './strategy';

// Re-export config types - NEW SIMPLIFIED STRUCTURE
export type {
  BotConfig,
  ConfigMeta,
  ExchangeConfig,
  TradingConfig,
  RiskManagementConfig,
  TimeframesConfig,
  IndicatorsConfig,
  AnalyzersConfig,
  FiltersConfig,
  ConfidenceConfig,
  StrategiesConfig,
  ServicesConfig,
  MonitoringConfig,
} from './config.types';

// Re-export old config types (deprecated - for backward compatibility)
export type {
  LoggingConfig,
  SystemConfig,
  TelegramConfig,
  StochasticConfig,
  ATRFilterConfig,
  TakeProfitConfig,
  SmartTP3Config,
  BBTrailingStopConfig,
  BTCConfirmationConfig,
  OrderBookConfig,
  VolumeConfig,
  DailyLimitsConfig,
  RiskBasedSizingConfig,
  LossStreakConfig,
  FundingRateFilterConfig,
  SessionBasedSLConfig,
  FlatMarketConfig,
  LiquidityDetectorConfig,
  MarketStructureConfig,
  CompoundInterestConfig,
  TradeHistoryConfig,
  SmartBreakevenConfig,
  RetestConfig,
  DeltaConfig,
  OrderbookImbalanceConfig,
  VolumeProfileConfig,
  VolumeProfileIntegrationConfig,
  AdaptiveTP3Config,
  MaxConcurrentRiskConfig,
  MicroWallDetectorConfig,
  LimitOrderExecutorConfig,
  LadderTpManagerConfig,
  TickDeltaAnalyzerConfig,
  OrderFlowAnalyzerConfig,
  PatternAnalyzerConfig,
  SweepDetectorConfig,
  FastEntryConfig,
  WallTrackingConfig,
  FootprintConfig,
  OrderBlockConfig,
  FVGConfig,
  FractalConfig,
  SMCMicrostructureConfig,
  DynamicTPConfig,
  TFAlignmentConfig,
  SmartTrailingConfig,
  WeightSystemConfig,
  TrendConfirmationConfig,
  PatternValidationConfig,
} from './config';

// Re-export new config types - STRICT, NO ANY
export type {
  ConfigNew,
  ConfigMetaNew,
  ExchangeConfigNew,
  TradingConfigNew,
  RiskManagementConfigNew,
  TimeframesConfigNew,
  TimeframeConfigNew,
  IndicatorsConfigNew,
  EmaIndicatorConfigNew,
  RsiIndicatorConfigNew,
  AtrIndicatorConfigNew,
  VolumeIndicatorConfigNew,
  StochasticIndicatorConfigNew,
  BollingerBandsConfigNew,
  AnalyzersConfigNew,
  BaseAnalyzerConfigNew,
  EmaAnalyzerConfigNew,
  RsiAnalyzerConfigNew,
  AtrAnalyzerConfigNew,
  VolumeAnalyzerConfigNew,
  StochasticAnalyzerConfigNew,
  BollingerBandsAnalyzerConfigNew,
  DivergenceAnalyzerConfigNew,
  BreakoutAnalyzerConfigNew,
  WickAnalyzerConfigNew,
  PriceMomentumAnalyzerConfigNew,
  TrendDetectorConfigNew,
  ChochBosAnalyzerConfigNew,
  SwingAnalyzerConfigNew,
  TrendConflictAnalyzerConfigNew,
  LevelAnalyzerConfigNew,
  VolumeProfileAnalyzerConfigNew,
  LiquiditySweepAnalyzerConfigNew,
  LiquidityZoneAnalyzerConfigNew,
  OrderBlockAnalyzerConfigNew,
  FairValueGapAnalyzerConfigNew,
  FootprintAnalyzerConfigNew,
  MicroWallAnalyzerConfigNew,
  WhaleAnalyzerConfigNew,
  PriceActionAnalyzerConfigNew,
  TickDeltaAnalyzerConfigNew,
  OrderFlowAnalyzerConfigNew,
  DeltaAnalyzerConfigNew,
  FiltersConfigNew,
  BtcCorrelationFilterConfigNew,
  NightTradingFilterConfigNew,
  BlindZoneFilterConfigNew,
  EntryConfirmationFilterConfigNew,
  AtrFilterConfigNew,
  VolatilityRegimeConfigNew,
  ConfidenceConfigNew,
  StrategiesConfigNew,
  ServicesConfigNew,
  MonitoringConfigNew,
} from './config-new.types';

export {
  isConfigNew,
  validateAnalyzerConfig,
  validateIndicatorConfig,
} from './config-new.types';

// Re-export indicator types and enums
export { IndicatorType, getAllIndicatorTypes, isValidIndicatorType } from './indicator-type.enum';
export type { IIndicator } from './indicator.interface';

// Re-export indicator loading types
export type { IIndicatorMetadata } from '../services/indicator-registry.service';
export { IndicatorRegistry } from '../services/indicator-registry.service';

// Re-export indicator cache & calculator
export type { IIndicatorCache } from './indicator-cache.interface';
export type { IIndicatorCalculator } from './indicator-calculator.interface';

// Re-export pre-calculation service interface
export type { IIndicatorPreCalculationService } from './pre-calculation.interface';

// Re-export architecture refactoring types
export { ActionType } from './architecture.types';
export type {
  IAction,
  AnyAction,
  ActionResult,
  IActionHandler,
  IActionQueue,
  OpenPositionAction,
  ClosePositionAction,
  UpdateStopLossAction,
  ActivateTrailingAction,
  ClosePercentAction,
  MoveSLToBreakeven,
  EntryContext,
  EntryDecisionResult,
  ExitContext,
  ExitDecisionResult,
  TradeValidationResult,
  RiskApprovalResult,
  TrendContext,
  VolatilityContext,
  MarketConditions,
  RiskLimits,
  IPositionLifecycle,
  IRiskGatekeeper,
  IDecisionEngine,
  IEventEmitter,
  MemorySnapshot,
  IQueueMonitor,
  HealthStatus,
} from './architecture.types';

// Re-export position state machine types
export type {
  PreBEMode,
  TrailingMode,
  BBTrailingMode,
  PositionStateMachineState,
  StateTransitionRequest,
  StateTransitionResult,
  IPositionStateMachine,
} from './position-state-machine.interface';

export {
  VALID_STATE_TRANSITIONS,
  ACTIVE_EXIT_MODES_BY_STATE,
} from './position-state-machine.interface';
