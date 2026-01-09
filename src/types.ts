
// Re-export constants so they're available when importing from types
export { CONFIDENCE_THRESHOLDS, PERCENTAGE_THRESHOLDS } from './constants';

// Import and re-export all enums from centralized enums file
import {
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
} from './types/enums';

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
};

// Import and re-export core types from centralized core file
import type {
  Candle,
  TakeProfit,
  CorrelationResult,
  BTCAnalysis,
  StopLossConfig,
  Signal,
  Position,
} from './types/core';

export type {
  Candle,
  TakeProfit,
  CorrelationResult,
  BTCAnalysis,
  StopLossConfig,
  Signal,
  Position,
};

// Import and re-export strategy types from centralized strategy file
import type {
  StrategyWeights,
  BlockingRules,
  StrategySignal,
  AnalyzerSignal,
  CoordinatorResult,
  StrategyEvaluation,
  StrategyStats,
  DirectionStats,
} from './types/strategy';

export type {
  StrategyWeights,
  BlockingRules,
  StrategySignal,
  AnalyzerSignal,
  CoordinatorResult,
  StrategyEvaluation,
  StrategyStats,
  DirectionStats,
};

// Import and re-export config types from centralized config file
import type {
  LoggingConfig,
  SystemConfig,
  TelegramConfig,
  TimeframeConfig,
  ExchangeConfig,
  TradingConfig,
  StochasticConfig,
  ATRFilterConfig,
  TakeProfitConfig,
  SmartTP3Config,
  BBTrailingStopConfig,
  DataSubscriptionsConfig,
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
  DataCollectionConfig,
  MaxConcurrentRiskConfig,
  MicroWallDetectorConfig,
  LimitOrderExecutorConfig,
  LadderTpManagerConfig,
  TickDeltaAnalyzerConfig,
  OrderFlowAnalyzerConfig,
  IndicatorsConfig,
  PatternAnalyzerConfig,
  SweepDetectorConfig,
  FastEntryConfig,
  WallTrackingConfig,
  FootprintConfig,
  OrderBlockConfig,
  FVGConfig,
  FractalConfig,
  EntryConfirmationConfig,
  SMCMicrostructureConfig,
  DynamicTPConfig,
  TFAlignmentConfig,
  SmartTrailingConfig,
  WeightSystemConfig,
  TrendConfirmationConfig,
  PatternValidationConfig,
} from './types/config';

export type {
  LoggingConfig,
  SystemConfig,
  TelegramConfig,
  TimeframeConfig,
  ExchangeConfig,
  TradingConfig,
  StochasticConfig,
  ATRFilterConfig,
  TakeProfitConfig,
  SmartTP3Config,
  BBTrailingStopConfig,
  DataSubscriptionsConfig,
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
  DataCollectionConfig,
  MaxConcurrentRiskConfig,
  MicroWallDetectorConfig,
  LimitOrderExecutorConfig,
  LadderTpManagerConfig,
  TickDeltaAnalyzerConfig,
  OrderFlowAnalyzerConfig,
  IndicatorsConfig,
  PatternAnalyzerConfig,
  SweepDetectorConfig,
  FastEntryConfig,
  WallTrackingConfig,
  FootprintConfig,
  OrderBlockConfig,
  FVGConfig,
  FractalConfig,
  EntryConfirmationConfig,
  SMCMicrostructureConfig,
  DynamicTPConfig,
  TFAlignmentConfig,
  SmartTrailingConfig,
  WeightSystemConfig,
  TrendConfirmationConfig,
  PatternValidationConfig,
};

/**
 * Types and Enums for Trading Bot
 * ALL types in ONE file - NO duplication!
 *
 * Rules:
 * - Only enums, NO string literals
 * - All constants as enums
 * - Descriptive names, no abbreviations
 */

// DataSubscriptionsConfig moved to ./types/config.ts

// ============================================================================
// CANDLE DATA
// ============================================================================

// Candle moved to ./types/core.ts

// ============================================================================
// TRADING SIGNALS
// ============================================================================

// TakeProfit and Signal moved to ./types/core.ts

// ============================================================================
// DIVERGENCE & LIQUIDITY TYPES
// ============================================================================

/**
 * Divergence detection result
 */
export interface Divergence {
  type: 'BULLISH' | 'BEARISH' | 'NONE';
  strength: number; // 0-1 (confidence in divergence)
  pricePoints?: [number, number]; // [old price, new price]
  rsiPoints?: [number, number]; // [old RSI, new RSI]
  timePoints?: [number, number]; // [old timestamp, new timestamp]
}

/**
 * Liquidity zone (support/resistance level)
 */
export interface LiquidityZone {
  price: number;
  type: 'SUPPORT' | 'RESISTANCE';
  touches: number; // Number of swing points at this level
  strength: number; // 0-1 (based on touches and recency)
  lastTouch: number; // Timestamp of last touch
  swingPoints?: SwingPoint[]; // Swing points that created this zone
}

/**
 * Liquidity sweep (false breakout)
 */
export interface LiquiditySweep {
  detected: boolean; // Was a sweep detected?
  sweepPrice?: number; // Price where sweep occurred
  zonePrice?: number; // Original zone price
  direction?: 'UP' | 'DOWN'; // Direction of sweep
}

/**
 * Liquidity analysis result
 */
export interface LiquidityAnalysis {
  zones: LiquidityZone[]; // All detected zones
  strongZones: LiquidityZone[]; // High-strength zones only
  recentSweep: LiquiditySweep | null; // Most recent sweep (if any)
  nearestSupportZone?: LiquidityZone & { priceLevel?: number }; // Nearest support zone
  nearestResistanceZone?: LiquidityZone & { priceLevel?: number }; // Nearest resistance zone
}

// ============================================================================
// STRATEGY INTERFACE
// ============================================================================

/**
 * Market data input for strategy evaluation
 */
export interface StrategyMarketData {
  candles: Candle[];
  swingPoints: SwingPoint[];
  rsi: number; // PRIMARY timeframe RSI
  rsiTrend1?: number; // TREND1 (30m) RSI
  ema: { fast: number; slow: number }; // PRIMARY timeframe EMA
  emaTrend1?: { fast: number; slow: number }; // TREND1 (30m) EMA
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  atr?: number;
  timestamp: number;
  currentPrice: number;
  liquidity?: LiquidityAnalysis; // Liquidity zones and sweeps
  divergence?: Divergence; // Divergence detection
  orderbook?: OrderBook; // Order book data for whale detection
  context?: TradingContext | null; // PHASE 4: Context archived - optional
  // NEW: Stochastic and Bollinger Bands data (from MarketDataCollector)
  stochastic?: {
    k: number; // %K value (0-100)
    d: number; // %D value (0-100)
    isOversold: boolean; // K < 20
    isOverbought: boolean; // K > 80
  };
  bollingerBands?: {
    upper: number; // Upper band price
    middle: number; // Middle band (SMA)
    lower: number; // Lower band price
    width: number; // Band width %
    percentB: number; // Price position (0-1)
    isSqueeze: boolean; // Squeeze detected
  };
  // PHASE 4: Delta Analysis (buy/sell pressure)
  deltaAnalysis?: DeltaAnalysis;
  // PHASE 4: Orderbook Imbalance (bid/ask pressure)
  imbalanceAnalysis?: ImbalanceAnalysis;
  // Breakout Direction Prediction (BB.MD Section 4.4)
  breakoutPrediction?: {
    direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: number; // 0-100
    emaTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    rsiMomentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    volumeStrength: 'HIGH' | 'MEDIUM' | 'LOW';
  };
  // PHASE 6: Multi-timeframe alignment scores
  tfAlignment?: {
    long: TFAlignmentResult; // Alignment score for LONG direction
    short: TFAlignmentResult; // Alignment score for SHORT direction
  };
  // Phase 3: Multi-Timeframe Level Confirmation
  candlesTrend1?: Candle[]; // 15m candles for HTF level confirmation
  candlesTrend2?: Candle[]; // 30m candles for additional HTF level confirmation
  candlesContext?: Candle[]; // 1h candles for context trend
  emaContext?: { fast: number; slow: number }; // 1h EMA for trend blocking
}

// StrategySignal, AnalyzerSignal, CoordinatorResult moved to ./types/strategy.ts

/**
 * Strategy interface (all strategies must implement this)
 */
export interface IStrategy {
  readonly name: string;
  readonly priority: number;

  /**
   * Evaluate market data and return a signal if conditions are met
   * @param data - Market data to analyze
   * @returns Strategy signal with validity flag
   */
  evaluate(data: StrategyMarketData): Promise<StrategySignal>;
}

// ============================================================================
// POSITIONS
// ============================================================================

// StopLossConfig and Position moved to ./types/core.ts

/**
 * Protection verification result
 * Used to verify TP/SL orders are actually set on exchange
 */
export interface ProtectionVerification {
  hasStopLoss: boolean;
  hasTakeProfit: boolean;
  stopLossPrice?: number;
  takeProfitPrices?: number[];
  activeOrders: number; // Count of active TP/SL orders
  verified: boolean; // Overall verification status
  hasTrailingStop?: boolean; // Trailing stop detected
}

/**
 * Bybit Order from API response
 * Represents both active and historical orders
 * Note: quantity is optional as some orders don't include it
 */
export interface BybitOrder {
  orderId: string;
  orderType: string; // 'Limit' | 'Market' | 'Conditional'
  side: string; // 'Buy' | 'Sell'
  price: string; // Price as string from API
  quantity?: string; // Quantity as string from API (optional)
  reduceOnly: boolean; // Is this a reduce-only order
  triggerPrice?: string; // For conditional orders (SL orders)
  stopOrderType?: string; // For stop orders ('TakeProfit' | 'StopLoss')
  orderStatus?: string; // 'New' | 'PartiallyFilled' | 'Filled' | 'Cancelled'
  [key: string]: unknown; // Allow additional SDK fields
}

/**
 * Filtered Bybit Stop Loss Order
 */
export interface BybitStopLossOrder extends BybitOrder {
  triggerPrice: string; // Required for SL orders
  stopOrderType: string; // Required for SL orders
  reduceOnly: true; // Required for SL orders
}

/**
 * Filtered Bybit Take Profit Order
 */
export interface BybitTakeProfitOrder extends BybitOrder {
  orderType: 'Limit'; // Required for TP orders
  reduceOnly: true; // Required for TP orders
  price: string; // Required for TP orders
}

/**
 * Type guard for Bybit Stop Loss Order
 */
export function isStopLossOrder(order: BybitOrder): order is BybitStopLossOrder {
  return (
    order.triggerPrice !== undefined &&
    order.stopOrderType !== undefined &&
    order.reduceOnly === true
  );
}

/**
 * Type guard for Bybit Take Profit Order
 */
export function isTakeProfitOrder(order: BybitOrder): order is BybitTakeProfitOrder {
  return (
    order.orderType === 'Limit' &&
    order.reduceOnly === true &&
    order.price !== undefined
  );
}

// ============================================================================
// MARKET DATA
// ============================================================================

/**
 * Swing point from ZigZag indicator
 */
export interface SwingPoint {
  price: number;
  timestamp: number;
  type: SwingPointType;
}

/**
 * Market structure event (CHoCH/BoS)
 */
export interface StructureEvent {
  type: StructureEventType;       // CHoCH or BoS
  direction: StructureDirection;  // BULLISH or BEARISH
  price: number;                  // Price where structure break occurred
  timestamp: number;              // When it occurred
  strength: number;               // Event strength (0-1)
}

/**
 * CHoCH/BoS detection result
 */
export interface CHoCHBoSDetection {
  hasEvent: boolean;
  event: StructureEvent | null;
  currentTrend: TrendBias;
  confidenceModifier: number;     // Multiplier for signal confidence (-0.5 to +0.3)
}


// ============================================================================
// CONFIGURATION INTERFACES
// ============================================================================

// TimeframeConfig, ExchangeConfig, TradingConfig moved to ./types/config.ts

/**
 * Multi-timeframe data configuration
 */
export interface MultiTimeframeData {
  entry?: Candle[]; // Entry timeframe candles (optional)
  primary: Candle[]; // Primary timeframe candles (required)
  trend1?: Candle[]; // Trend timeframe 1 candles (optional)
  trend2?: Candle[]; // Trend timeframe 2 candles (optional)
  context?: Candle[]; // Context timeframe candles (optional)
}

/**
 * RSI condition range (min/max)
 */
export interface RSICondition {
  min: number;
  max: number;
}

/**
 * RSI conditions for multi-timeframe ZigZag levels
 */
export interface RSIConditions {
  primary: RSICondition; // PRIMARY timeframe RSI condition
  trend1?: RSICondition; // TREND1 timeframe RSI condition (optional)
  trend2?: RSICondition; // TREND2 timeframe RSI condition (optional)
  context?: RSICondition; // CONTEXT timeframe RSI condition (optional)
}

/**
 * ZigZag levels configuration with RSI conditions
 */
export interface ZigZagLevelsConfig {
  enabled: boolean;
  lookback: number; // Lookback period for swing points
  rsiConditions: {
    long: RSIConditions; // RSI conditions for LONG entries
    short: RSIConditions; // RSI conditions for SHORT entries
  };
}

/**
 * ZigZag level (swing high/low with price)
 */
export interface ZigZagLevel {
  price: number;
  timestamp: number;
  type: SwingPointType;
  isValid: boolean; // Whether RSI conditions are met
}

// StrategyWeights and BlockingRules moved to ./types/strategy.ts

// BTCConfirmationConfig, OrderBookConfig, VolumeConfig moved to ./types/config.ts

// WeightSystemConfig moved to ./types/config.ts

export interface StrategyConfig {
  type: 'SMART_TREND' | 'LEVEL_BASED';
  emaFlatThreshold: number; // Threshold for EMA20 ≈ EMA50 (0.001 = 0.1%)
  emaDistanceThreshold: number; // Max distance from EMA50 to enter (1.0 = 1%)
  rsiNeutralZone: {
    min: number; // RSI min for neutral zone (45)
    max: number; // RSI max for neutral zone (55)
  };
  rsiLongThreshold: number; // RSI threshold for LONG (50)
  rsiShortThreshold: number; // RSI threshold for SHORT (50)
  minConfidenceThreshold?: number; // Min confidence to enter (0.6 = PERCENTAGE_THRESHOLDS.VERY_HIGH%)
  contextFilteringMode: ContextFilteringMode; // HARD_BLOCK or WEIGHT_BASED
  weightSystem?: WeightSystemConfig; // Phase 3: Gradient weights (optional)
  priceAction?: {
    enabled: boolean;
    requireLiquiditySweep?: boolean;
    divergenceBoost?: number;
    chochBoost?: number;
    liquiditySweepBoost?: number;
  };
  btcConfirmation?: BTCConfirmationConfig; // BTC confirmation settings
}

// IndicatorsConfig moved to ./types/config.ts

// StochasticConfig and ATRFilterConfig moved to ./types/config.ts

/**
 * ATR Analysis result
 */
export interface ATRAnalysis {
  value: number; // ATR value in %
  isValid: boolean; // Is ATR within valid range (min/max)?
  reason?: string; // Reason if not valid
}

/**
 * Regime-specific parameter overrides
 * These values override LevelBasedConfig when the regime is active
 */
export interface VolatilityRegimeParams {
  maxDistancePercent: number;        // Max distance to level for entry
  minTouchesRequired: number;        // Minimum touches for valid level
  clusterThresholdPercent: number;   // Threshold for clustering nearby levels
  minConfidenceThreshold: number;    // Minimum confidence to enter
}

/**
 * Volatility Regime Detection Configuration
 * Auto-switches strategy parameters based on ATR volatility
 */
export interface VolatilityRegimeConfig {
  enabled: boolean;
  thresholds: {
    lowAtrPercent: number;  // ATR below this = LOW regime (default: 0.3%)
    highAtrPercent: number; // ATR above this = HIGH regime (default: 1.5%)
  };
  regimes: {
    LOW: VolatilityRegimeParams;
    MEDIUM: VolatilityRegimeParams;
    HIGH: VolatilityRegimeParams;
  };
  // Session-based threshold overrides (optional)
  sessionOverrides?: {
    enabled: boolean;
    ASIAN?: {
      lowAtrPercent?: number;   // ASIAN session has lower volatility
      highAtrPercent?: number;
    };
    LONDON?: {
      lowAtrPercent?: number;   // LONDON session has higher volatility
      highAtrPercent?: number;
    };
    NY?: {
      lowAtrPercent?: number;   // NY session has higher volatility
      highAtrPercent?: number;
    };
    OVERLAP?: {
      lowAtrPercent?: number;   // OVERLAP has highest volatility
      highAtrPercent?: number;
    };
  };
  // Hysteresis to prevent rapid regime switching (optional)
  hysteresis?: {
    enabled: boolean;
    bufferPercent: number; // Buffer zone size (e.g., 0.1 = 10% of threshold)
  };
}

/**
 * Volatility Regime analysis result
 */
export interface VolatilityRegimeAnalysis {
  regime: VolatilityRegime;
  atrPercent: number;
  params: VolatilityRegimeParams;
  reason: string;
}

// TakeProfitConfig, SmartTP3Config, BBTrailingStopConfig moved to ./types/config.ts

/**
 * Risk management configuration
 */
export interface RiskManagementConfig {
  takeProfits: TakeProfitConfig[];
  stopLossPercent: number;
  minStopLossPercent: number; // Minimum SL distance (1.0% default)
  breakevenOffsetPercent: number; // Offset for breakeven SL after TP1 (e.g., 0.3% from entry)
  trailingStopEnabled: boolean;
  trailingStopPercent: number; // Trailing stop distance in %
  trailingStopActivationLevel: number; // Which TP level activates trailing (e.g., 2 for TP2)
  smartTP3?: SmartTP3Config; // Smart TP3 movement configuration (optional)
  bbTrailingStop?: BBTrailingStopConfig; // BB-based trailing stop configuration (optional)
  positionSizeUsdt: number; // Position size in USDT (e.g., 10)
  timeBasedExitEnabled?: boolean; // Enable time-based exit (optional, default: false)
  timeBasedExitMinutes?: number; // Minutes to wait before time-based exit (default: 30)
  timeBasedExitMinPnl?: number; // Minimum PnL % to allow time-based exit (default: 0.2)
}

// ============================================================================
// PHASE 5: ADVANCED RISK MANAGEMENT
// ============================================================================

// DailyLimitsConfig, RiskBasedSizingConfig, LossStreakConfig moved to ./types/config.ts

/**
 * Daily Statistics (PHASE 5)
 * Tracks daily performance and limits
 */
export interface DailyStats {
  date: string; // YYYY-MM-DD
  startingBalance: number;
  currentBalance: number;
  realizedPnL: number;
  maxLossHit: boolean;
  maxProfitHit: boolean;
  tradesCount: number;
  lastResetTime: number;
}

// LoggingConfig, SystemConfig, TelegramConfig moved to ./types/config.ts

// PatternAnalyzerConfig moved to ./types/config.ts

/**
 * Strategies configuration (individual strategy configs)
 */
/**
 * Level Based Strategy Configuration
 */
export interface LevelBasedConfig {
  enabled: boolean;
  maxDistancePercent: number;
  minDistanceFloorPercent?: number; // Minimum distance floor regardless of ATR (default: 0.3%)
  minTouchesRequired: number;
  minTouchesRequiredShort?: number;
  minTouchesRequiredLong?: number;
  minTouchesForStrong: number;
  minStrengthForNeutral?: number; // Minimum level strength for NEUTRAL trend entries (0-1, default: 0.4)
  requireTrendAlignment: boolean;
  blockLongInDowntrend?: boolean;
  blockShortInUptrend?: boolean;
  stopLossAtrMultiplier: number;
  stopLossAtrMultiplierLong?: number;
  minConfidenceThreshold?: number; // Minimum confidence to generate signal (0.0-1.0)
  takeProfits?: Array<{ level: number; percent: number; sizePercent: number }>;
  rrRatio?: number; // Risk-Reward ratio for TP calculation
  zigzagDepth?: number;
  sessionBasedSL?: SessionBasedSLConfig;
  patterns?: PatternAnalyzerConfig;
  rsiFilters?: {
    enabled: boolean;
    longMinThreshold: number;
    longMaxThreshold: number;
    shortMinThreshold: number;
    shortMaxThreshold: number;
    bypassOnStrongTrend?: boolean; // Bypass RSI filters when EMA gap is large
    strongTrendEmaGapPercent?: number; // EMA gap % to consider trend strong (default: 1.5)
  };
  emaFilters?: {
    enabled: boolean;
    downtrend: {
      rsiThreshold: number;
      emaDiffThreshold: number;
    };
  };
  distanceModifier?: {
    veryClosePercent: number;
    veryClosePenalty: number;
    farPercent: number;
    farPenalty: number;
  };
  dynamicDistance?: {
    enabled: boolean; // Enable ATR-based dynamic distance floor
    atrMultiplier: number; // Multiply ATR by this for min distance (default: 0.2)
    absoluteMinPercent: number; // Absolute minimum floor (default: 0.15%)
  };
  trendExistenceFilter?: {
    enabled: boolean;
    minEmaGapPercent: number; // Minimum EMA gap to consider trend exists (default: 0.5)
    bypassOnStrongLevel: boolean; // Allow entry if level strength > threshold
    strongLevelThreshold: number; // Level strength threshold to bypass (default: 0.7)
  };
  levelClustering?: {
    clusterThresholdPercent: number;
    minTouchesForStrong: number;
    strengthBoost: number;
    baseConfidence: number;
    trendAlignmentBoost: number;
    dynamicThreshold?: {
      enabled: boolean; // Enable ATR-based dynamic clustering
      atrMultiplier: number; // Multiply ATR by this for cluster threshold (default: 0.3)
    };
    trendFilters?: {
      minTrendGapPercent: number;
      downtrend: {
        enabled: boolean;
        rsiThreshold: number;
      };
      uptrend: {
        enabled: boolean;
        rsiThreshold: number;
      };
    };
  };
  levelSelection?: {
    tiebreakPreference: 'LONG' | 'SHORT' | 'NEAREST' | 'STRONGEST'; // How to break ties (default: NEAREST)
  };
  timeWeightedStrength?: {
    enabled: boolean; // Enable time-weighted level strength
    recentTouchBonusPercent: number; // Bonus for recent touches (default: 20)
    recentPeriodHours: number; // What counts as "recent" (default: 24)
  };
  volumeProfileIntegration?: {
    enabled: boolean;
    addVahValLevels: boolean;
    boostHvnMatch: boolean;
    hvnMatchThresholdPercent: number;
    hvnStrengthBoost: number;
    vahValStrength: number;
  };
  smartBreakeven?: SmartBreakevenConfig; // Strategy-specific breakeven settings
  multiTimeframeConfirmation?: {
    enabled: boolean; // Enable MTF level confirmation
    htfLevelConfirmation: {
      enabled: boolean; // Check if level aligns with HTF (15m) level
      alignmentThresholdPercent: number; // Max distance to consider aligned (default: 0.3%)
      confidenceBoostPercent: number; // Confidence boost if HTF-confirmed (default: 15)
    };
    contextTrendFilter: {
      enabled: boolean; // Block entry if 1h trend opposite
      minEmaGapPercent: number; // Min EMA gap to consider trend exists (default: 0.5%)
    };
  };
}

export interface StrategiesConfig {
  levelBased: LevelBasedConfig;
}

export interface Config {
  meta?: {
    description?: string;
    lastUpdated?: string;
    strategy?: string; // Strategy name from JSON (e.g., "simple-levels")
    notes?: string;
  };
  exchange: ExchangeConfig;
  timeframes: Record<string, TimeframeConfig>; // Key: 'entry' | 'primary' | 'trend1' | 'trend2' | 'context'
  trading: TradingConfig;
  strategies: StrategiesConfig; // Individual strategy configurations
  strategy: StrategyConfig; // Legacy strategy config
  indicators: IndicatorsConfig;
  analyzers?: Record<string, any>; // Analyzer configurations
  riskManagement: RiskManagementConfig;
  logging: LoggingConfig;
  system: SystemConfig;
  dataSubscriptions: DataSubscriptionsConfig; // Data subscriptions (candles, orderbook, ticks)
  entryConfig: {
    divergenceDetector: {
      minStrength: number;
      priceDiffPercent: number;
    };
    rsiPeriod: number;
    rsiOversold: number;
    rsiOverbought: number;
    fastEmaPeriod: number;
    slowEmaPeriod: number;
    zigzagDepth: number;
    priceAction?: {
      enabled: boolean;
    };
  };
  telegram?: TelegramConfig; // Telegram notifications (optional)
  btcConfirmation?: BTCConfirmationConfig; // BTC confirmation filter (optional)
  orderBook?: OrderBookConfig; // Order book analysis (optional)
  volume?: VolumeConfig; // Volume analysis (optional)
  atrFilter?: ATRFilterConfig; // ATR volatility filter (optional)
  volatilityRegime?: VolatilityRegimeConfig; // Auto-switch params based on ATR (optional)
  fundingRateFilter?: FundingRateFilterConfig; // Funding rate filter (optional)
  sessionBasedSL?: SessionBasedSLConfig; // Session-based SL widening (optional)
  flatMarketDetection?: FlatMarketConfig; // Multi-factor flat market detection (optional)
  compoundInterest?: CompoundInterestConfig; // Compound interest position sizing (optional)
  tradeHistory?: TradeHistoryConfig; // Trade history CSV storage (optional)
  entryConfirmation: EntryConfirmationConfig; // Entry confirmation (candle close)
  whaleHunter?: WhaleHunterConfig; // Whale hunter strategy (optional)
  whaleHunterFollow?: WhaleHunterConfig; // Whale hunter FOLLOW strategy (optional)
  scalpingMicroWall?: ScalpingMicroWallConfig; // Scalping micro wall strategy (Phase 1, optional)
  scalpingLimitOrder?: ScalpingLimitOrderConfig; // Scalping limit order execution wrapper (Phase 2, optional)
  scalpingLadderTp?: ScalpingLadderTpConfig; // Scalping ladder TP exit wrapper (Phase 3, optional)
  scalpingTickDelta?: ScalpingTickDeltaConfig; // Scalping tick delta momentum strategy (Phase 4, optional)
  scalpingOrderFlow?: ScalpingOrderFlowConfig; // Scalping order flow imbalance strategy (Phase 5, optional)
  // Phase 1: Smart Entry & Breakeven System (optional)
  fastEntry?: FastEntryConfig; // Fast entry with partial positions (optional)
  smartBreakeven?: SmartBreakevenConfig; // Smart breakeven with impulse confirmation (optional)
  retestEntry?: RetestConfig; // Retest entry after missed impulse (optional)
  // Phase 2: Weight Matrix System (optional)
  weightMatrix?: WeightMatrixConfig; // Gradient scoring instead of boolean filters (optional)
  // Phase 3: Dynamic Stops & Trailing System (optional)
  smartTrailing?: SmartTrailingConfig; // Impulse-based trailing stop (optional)
  adaptiveTP3?: AdaptiveTP3Config; // Momentum-based TP3 extension (optional)
  // Phase 4: Market Data Enhancement (optional)
  delta?: DeltaConfig; // Delta analysis (buy/sell pressure from tick trades) (optional)
  orderbookImbalance?: OrderbookImbalanceConfig; // Orderbook imbalance detection (bid/ask ratio) (optional)
  volumeProfile?: VolumeProfileConfig; // Volume profile analysis (POC, VAH, VAL) (optional)
  // SMC Microstructure (FVG, Order Block, Footprint) (optional)
  smcMicrostructure?: SMCMicrostructureConfig; // Smart Money Concepts microstructure settings (optional)
  // Phase 6: Multi-Timeframe Alignment (optional)
  tfAlignment?: TFAlignmentConfig; // Multi-timeframe alignment scoring (optional)
  // Phase 5: Advanced Risk Management (optional)
  dailyLimits?: DailyLimitsConfig; // Daily loss limit and profit target (optional)
  riskBasedSizing?: RiskBasedSizingConfig; // Risk-based position sizing (optional)
  lossStreak?: LossStreakConfig; // Loss streak cooldown (optional)
  maxConcurrentRisk?: MaxConcurrentRiskConfig; // Max concurrent risk/positions (optional)
  // Phase 4: Wall Tracking (optional)
  wallTracking?: WallTrackingConfig; // Orderbook wall tracking (spoofing/iceberg detection) (optional)
  // Data Collection System (optional)
  dataCollection?: DataCollectionConfig; // Standalone data collector for backtesting (optional)
  // Trading Orchestrator Options (optional)
  enableEntryScannerFallback?: boolean; // Enable legacy EntryScanner fallback when strategies don't signal (default: true)
  // Analyzer weights for weighted voting system (config-driven enabling/disabling)
  strategicWeights?: any; // Strategic weights for each analyzer (enables/disables analyzers)
  // Trend Confirmation Filter (optional)
  trendConfirmation?: TrendConfirmationConfig; // Multi-timeframe trend confirmation filter
  // Analysis Configuration (analyzers and pattern detectors)
  analysisConfig?: AnalysisConfig; // Configuration for all analyzers and pattern detectors (optional)
  // Phase 6: Structure-Aware Exit Strategy (optional)
  structureAwareExit?: StructureAwareExitConfig; // Dynamic TP2 from structure levels + trailing stop (optional)
}

/**
 * Analysis Configuration
 * Contains settings for all analyzers: pattern detectors, market structure, flat market, liquidity
 */
export interface AnalysisConfig {
  patternDetectors?: {
    wedge?: {
      baseConfidence: number;
      minPatternBars: number;
      maxPatternBars: number;
      recentLookback: number; // Number of recent swing points to analyze
      exhaustionBonus: number; // Bonus for trend exhaustion
    };
    triangle?: {
      baseConfidence: number;
      minPatternBars: number;
      maxPatternBars: number;
      recentLookback: number; // Number of recent swing points to analyze
    };
    triplePattern?: {
      baseConfidence: number;
      peakTolerancePercent: number;
      minPatternBars: number;
      maxPatternBars: number;
      stopLossMultiplier: number;
      confidenceBonusFactor: number;
      confidencePerPoint: number;
      recentLookback: number; // Number of recent swing points to analyze
    };
    flag?: {
      baseConfidence: number;
      minConsolidationBars: number;
      maxConsolidationBars: number;
      minPoleHeightPercent: number;
    };
  };
  marketStructure?: {
    chochAlignedBoost: number;
    chochAgainstPenalty: number;
    bosAlignedBoost: number;
    noModification: number;
  };
  flatMarketDetector?: {
    hvnThreshold: number;
    lvnThreshold: number;
    maxEmaScore: number;
    maxAtrScore: number;
    maxRangeScore: number;
    maxSlopeScore: number;
    maxVolumeScore: number;
  };
  liquidityDetector?: LiquidityDetectorConfig;
}

// EntryConfirmationConfig moved to ./types/config.ts

// SMCMicrostructureConfig moved to ./types/config.ts

/**
 * Whale Hunter Strategy Configuration
 * Detects whale activity in order book (large walls, imbalances, spoofing)
 */
/**
 * Adaptive Take Profit Configuration
 * Allows strategies to use custom TP levels instead of default
 */
export interface AdaptiveTakeProfitConfig {
  enabled: boolean; // Enable adaptive TP for this strategy
  microProfitMode?: boolean; // Use micro-profits for fast movements (0.3%, 0.6%, 1.2%)
  levels: TakeProfit[]; // Custom TP levels (overrides riskManagement.takeProfits)
}

// DynamicTPConfig moved to ./types/config.ts

// FundingRateFilterConfig moved to ./types/config.ts

// SessionBasedSLConfig moved to ./types/config.ts

// FlatMarketConfig moved to ./types/config.ts

// LiquidityDetectorConfig moved to ./types/config.ts

// MarketStructureConfig moved to ./types/config.ts

/**
 * Flat Market Detection Result
 *
 * Contains flat/trend decision with confidence score and factor breakdown.
 * Used by SignalCalculator to determine single vs multi-TP strategy.
 */
export interface FlatMarketResult {
  isFlat: boolean; // Final decision: flat market (true) or trending (false)
  confidence: number; // Total confidence score (0-100)
  factors: FlatMarketFactors; // Individual factor scores
  explanation: string; // Human-readable explanation for logs
}

/**
 * Individual Factor Scores for Flat Market Detection
 *
 * Each factor contributes 0-N points to total confidence score.
 * Sum of all factors = total confidence (0-100).
 */
export interface FlatMarketFactors {
  emaDistance: number; // 0-20 points: EMA convergence score
  atrVolatility: number; // 0-20 points: Low volatility score
  priceRange: number; // 0-15 points: Tight range score
  zigzagPattern: number; // 0-20 points: EH/EL pattern score
  emaSlope: number; // 0-15 points: Flat slope score
  volumeDistribution: number; // 0-10 points: Even volume score
}

// TFAlignmentConfig moved to ./types/config.ts

/**
 * Timeframe Alignment Result (PHASE 6)
 *
 * Result of TF alignment scoring.
 * Used to boost signal confidence when all timeframes agree.
 */
export interface TFAlignmentResult {
  score: number; // Total score (0-100)
  aligned: boolean; // score >= threshold
  contributions: {
    entry: number; // Points from entry TF (0-20)
    primary: number; // Points from primary TF (0-50)
    trend1: number; // Points from trend1 TF (0-30)
  };
  details: string; // Human-readable explanation (e.g., "Entry: 20, Primary: 30, Trend1: 30")
}

/**
 * TF-Specific Entry Rules (PHASE 6)
 *
 * Different strategies for different timeframes:
 * - M1: Fast scalping (tight SL, quick TP)
 * - M5: Swing trading (medium SL, medium TP)
 * - M30: Position trading (wide SL, large TP) - used as filter only
 */
export interface TFSpecificRules {
  [timeframe: string]: {
    minConfidence: number; // Min confidence to enter (0-100)
    stopLossMultiplier: number; // ATR multiplier for SL (e.g., 0.8 for M1, 1.5 for M5)
    takeProfitLevels: number[]; // TP levels in % (e.g., [0.3, 0.6, 1.0] for M1)
  };
}

// CompoundInterestConfig moved to ./types/config.ts

// TradeHistoryConfig moved to ./types/config.ts

export interface WhaleHunterConfig {
  enabled: boolean; // Enable whale hunter strategy
  priority: number; // Strategy priority (1 = highest, recommended: 1-2 for whale hunter)
  minConfidence: number; // Min confidence from whale detector (0-100) - DEPRECATED, use minConfidenceLong/Short
  minConfidenceLong?: number; // Optional: Min confidence for LONG signals (0-100, defaults to minConfidence)
  minConfidenceShort?: number; // Optional: Min confidence for SHORT signals (0-100, defaults to minConfidence)
  enableLong?: boolean; // Optional: Enable LONG trades (default: true)
  enableShort?: boolean; // Optional: Enable SHORT trades (default: true)
  requireTrendAlignment: boolean; // Require BTC trend alignment (or use trend-aware logic)
  requireMultipleSignals: boolean; // Require 2+ consecutive whale signals
  cooldownMs: number; // Cooldown after trade (e.g., 60000ms = 1min)
  maxAtrPercent?: number; // Optional: Block signals when ATR > this % (e.g., 3.0 = 3% volatility)
  stopLossAtrMultiplier?: number; // Optional: ATR-based stop loss multiplier (e.g., 1.2)
  takeProfitPercent?: number; // Optional: Take profit % for whale scalping (e.g., 0.5 = MULTIPLIERS.HALF%, default: from strategy config)
  takeProfitPercentLongDowntrend?: number; // Optional: Conservative TP % for LONG trades in downtrend (e.g., 0.6 = CONFIDENCE_THRESHOLDS.LOW%)
  blockLongInDowntrend?: boolean; // Optional: Block LONG entries when market is in downtrend
  dynamicTakeProfit?: DynamicTPConfig; // Optional: Dynamic TP based on market conditions
  sessionBasedSL?: SessionBasedSLConfig; // Optional: Session-based SL widening
  trendInversion?: {
    // Optional: Invert signal direction in strong trends
    enabled: boolean; // Enable trend-aware signal inversion
    strongTrendThreshold: number; // Momentum threshold for strong trend (e.g., 0.5 = CONFIDENCE_THRESHOLDS.MODERATE%)
    neutralZoneThreshold: number; // Momentum threshold for neutral market (e.g., 0.3 = PERCENTAGE_THRESHOLDS.MODERATE%)
    blockAgainstTrend: boolean; // Block signals that go against strong trend (instead of inverting)
  };
  detector: {
    modes: {
      wallBreak: {
        enabled: boolean;
        minWallSize: number; // Min % of total volume (e.g., 7%)
        breakConfirmationMs: number; // Time to confirm break (e.g., 3000ms)
        maxConfidence: number; // Max confidence % (e.g., 95, was hardcoded 85)
      };
      wallDisappearance: {
        enabled: boolean;
        minWallSize: number; // Min % of total volume (e.g., 9%)
        minWallDuration: number; // Min time wall existed (e.g., 60000ms = 1min)
        wallGoneThresholdMs: number; // Time without seeing wall = gone (e.g., 15000ms, was hardcoded)
        maxConfidence: number; // Max confidence % (e.g., 90, was hardcoded 80)
      };
      imbalanceSpike: {
        enabled: boolean;
        minRatioChange: number; // Min ratio change (e.g., 0.15 = 15% change)
        detectionWindow: number; // Time window for spike (e.g., 10000ms = 10s)
        maxConfidence: number; // Max confidence % (e.g., 95, was hardcoded 90)
      };
    };
    // Tracking & Cleanup
    maxImbalanceHistory: number; // Max history snapshots to keep (e.g., 20, was hardcoded)
    wallExpiryMs: number; // Wall considered expired after this time (e.g., 60000ms, was hardcoded)
    breakExpiryMs: number; // Allow re-detection after this time (e.g., 300000ms, was hardcoded)
  };
  smartBreakeven?: SmartBreakevenConfig; // Strategy-specific breakeven settings
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Stop Loss Hit Event
 */
export interface StopLossHitEvent {
  position: Position;
  currentPrice: number;
  reason: string;
}

/**
 * Take Profit Hit Event
 */
export interface TakeProfitHitEvent {
  position: Position;
  currentPrice: number;
  tpLevel: number;
  reason: string;
}

/**
 * Order Filled Event
 */
export interface OrderFilledEvent {
  orderId: string;
  symbol: string;
  side: string;
  execQty: string;
  execPrice: string;
}

// ============================================================================
// TRADING JOURNAL & LOGGING
// ============================================================================

/**
 * Entry condition for journal - Extended for ML
 */
/**
 * Entry condition - simplified to serialize entire objects
 * Just pass the whole Signal object and any additional data
 */
export interface EntryCondition {
  signal: Signal; // Complete signal object with all indicators
  marketData?: Record<string, unknown>; // Additional market data (ZigZag, swing points, etc.)
  btcData?: BTCAnalysis; // BTC correlation data if available
  indicators?: Record<string, unknown>; // All indicator values (ATR, EMA, RSI arrays, etc.)
  rawData?: Record<string, unknown>; // Any other raw data for ML analysis
}

/**
 * Exit condition for journal - Extended for ML
 */
export interface ExitCondition {
  // Тип выхода
  exitType: ExitType;

  // Основные параметры выхода
  price: number;
  timestamp: number;
  reason: string;

  // PnL метрики
  pnlUsdt: number;
  pnlPercent: number;
  realizedPnL: number; // Финальный реализованный PnL

  // Take Profit метрики
  tpLevelsHit: number[]; // Какие TP сработали [1, 2]
  tpLevelsHitCount: number; // Количество сработавших TP
  partialCloses?: Array<{
    level: number; // TP level (1, 2, 3)
    quantity: number; // Quantity closed
    exitPrice: number; // Price at which closed
    pnlGross: number; // PnL before fees
    fees: number; // Trading fees
    pnlNet: number; // PnL after fees
    timestamp: number; // When closed
  }>; // Детали частичных закрытий
  pnlGross?: number; // Gross PnL before fees
  tradingFees?: number; // Total trading fees paid

  // Время удержания
  holdingTimeMs: number;
  holdingTimeMinutes: number;
  holdingTimeHours: number;

  // Метрики движения цены
  maxProfitPercent?: number; // Максимальная прибыль во время удержания
  maxDrawdownPercent?: number; // Максимальная просадка во время удержания
  priceAtMaxProfit?: number; // Цена на пике прибыли
  priceAtMaxDrawdown?: number; // Цена на пике просадки

  // Stop Loss метрики
  stoppedOut: boolean;
  slMovedToBreakeven: boolean; // Был ли SL переведен в безубыток
  breakevenHitAt?: number; // Когда SL был переведен в безубыток

  // Trailing Stop метрики
  trailingStopActivated: boolean;
  trailingStopDistance?: number; // Дистанция trailing stop

  // RSI на момент выхода (мультитаймфреймы)
  rsiAtExit?: number; // PRIMARY
  rsiEntryAtExit?: number; // ENTRY
  rsiTrend1AtExit?: number; // TREND1
  rsiTrend2AtExit?: number; // TREND2
  rsiContextAtExit?: number; // CONTEXT

  // EMA на момент выхода
  emaAtExit?: number; // PRIMARY
  emaEntryAtExit?: number; // ENTRY

  // Volume на момент выхода
  volumeAtExit?: number;
  volumeMultiplierAtExit?: number;

  // Market условия на момент выхода
  marketConditionAtExit?: string;
  timeOfDayAtExit?: number;
  dayOfWeekAtExit?: number;

  // Дополнительная информация для анализа
  exitQuality?: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'; // Качество выхода
  couldHaveBeen?: 'BETTER' | 'WORSE' | 'OPTIMAL'; // Мог ли быть выход лучше
}

/**
 * Trade record for journal
 */
export interface TradeRecord {
  id: string;
  symbol: string;
  side: PositionSide;
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  leverage: number;
  entryCondition: EntryCondition;
  exitCondition?: ExitCondition;
  openedAt: number;
  closedAt?: number;
  unrealizedPnL?: number;
  realizedPnL?: number;
  status: 'OPEN' | 'CLOSED';
}

/**
 * Trend state for 5m timeframe
 */
export interface TrendState {
  bias: TrendBias; // BULLISH, BEARISH, NEUTRAL
  emaFast: number; // EMA20 value
  emaSlow: number; // EMA50 value
  emaCrossover: EMACrossover; // BULLISH/BEARISH/NONE
  price: number; // Current price
  structure: MarketStructure | null; // Last ZigZag structure (HH/HL/LH/LL)
  isValid: boolean; // Trend is confirmed and tradable
  reason: string; // Human-readable reason
}

/**
 * Pullback state for 1m timeframe
 */
export interface PullbackState {
  detected: boolean; // Pullback detected
  emaFast: number; // EMA20 value
  emaSlow: number; // EMA50 value
  price: number; // Current price
  structure: MarketStructure | null; // Pullback structure (HL for LONG, LH for SHORT)
  isComplete: boolean; // Pullback completed (price returned to EMA)
  reason: string; // Human-readable reason
}

/**
 * Entry confirmation state
 */
export interface EntryConfirmation {
  confirmed: boolean; // Entry confirmed
  rsi: number; // Current RSI
  rsiCrossed: boolean; // RSI crossed threshold (50)
  candleClosed: boolean; // Candle closed above/below EMAs
  zigzagConfirmed: boolean; // ZigZag confirms new wave (HH for LONG, LL for SHORT)
  reason: string; // Human-readable reason
}

/**
 * Smart Trend signal evaluation
 */
export interface SmartTrendEvaluation {
  shouldEnter: boolean; // Should enter position
  direction: SignalDirection; // LONG/SHORT/HOLD
  trendState: TrendState; // Trend on 5m
  pullbackState: PullbackState; // Pullback on 1m
  entryConfirmation: EntryConfirmation; // Entry confirmation
  blockedBy: string[]; // List of blocking reasons
  reason: string; // Summary reason
}

/**
 * Log entry
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
}

// ============================================================================
// TRADING ORCHESTRATOR TYPES
// ============================================================================

/**
 * Trading Context from higher timeframes (PRIMARY, TREND)
 * Provides market context and weight modifiers for entry decisions
 */
export interface TradingContext {
  timestamp: number;
  // Market structure
  trend: TrendBias;
  marketStructure: MarketStructure | null;
  // Metrics
  atrPercent: number;
  emaDistance: number; // Distance from price to EMA50 (%)
  ema50: number;
  // Weight modifiers (used in WEIGHT_BASED mode)
  atrModifier: number;      // 1.0 = neutral, <1.0 = penalty, >1.0 = boost
  emaModifier: number;      // 1.0 = neutral, <1.0 = penalty, >1.0 = boost
  trendModifier: number;    // 1.0 = neutral, <1.0 = penalty, >1.0 = boost
  // Overall confidence modifier
  overallModifier: number;  // Product of all modifiers
  // Hard block fields (used in HARD_BLOCK mode)
  isValidContext: boolean;  // True if all hard checks pass
  blockedBy: string[];      // Reasons for blocking (empty if valid)
  // Info
  warnings: string[];       // Non-blocking warnings (used in both modes)
  // BTC analysis (optional, for trend-aware strategies)
  btcAnalysis?: {
    direction: string; // 'UP'/'DOWN'/'NEUTRAL'
    momentum: number;  // 0-1
    priceChange: number;
    consecutiveMoves: number;
  };
  // Volume Profile (PHASE 4, optional)
  volumeProfile?: VolumeProfileResult;
  // ML Features (optional, for advanced strategies like EdgeReversals)
  mlFeatures?: MLFeatureSet;
}

/**
 * Entry Signal from ENTRY timeframe (1m)
 * Precise entry point based on context
 */
export interface EntrySignal {
  timestamp: number;
  shouldEnter: boolean;
  direction: SignalDirection;
  confidence: number;
  reason: string;
  // Entry details
  entryPrice: number;
  stopLoss: number;
  takeProfits: TakeProfit[];
  // Context used (optional for strategy signals)
  context?: TradingContext;
  // Strategy name (for journal recording)
  strategyName?: string;
}

// ============================================================================
// ORDER BOOK ANALYSIS
// ============================================================================

/**
 * Order book price level - Unified type for all formats
 * Discriminated union that supports both:
 * - Tuple format: [price, size] from exchange API
 * - Object format: {price, size, format: 'object'} for type safety
 */
export type OrderbookLevel =
  | {
      price: number;
      size: number;
      format?: 'object'; // Discriminator for object format
    }
  | readonly [price: number, size: number]; // Tuple with labeled indices

/**
 * Order book snapshot
 * Contains bid/ask levels with normalized OrderbookLevel type
 */
export interface OrderBook {
  symbol: string;
  timestamp: number;
  bids: OrderbookLevel[]; // Sorted descending by price
  asks: OrderbookLevel[]; // Sorted ascending by price
  updateId: number; // Sequential update ID
}

/**
 * Order book wall (large order) - Unified type from analyzer
 */
export interface OrderBookWall {
  side: 'BID' | 'ASK';
  price: number;
  quantity: number; // Order quantity
  percentOfTotal: number; // % of total volume
  distance: number; // Distance from current price (%)
}

/**
 * Order book imbalance
 */
export interface OrderBookImbalance {
  bidVolume: number; // Total bid volume
  askVolume: number; // Total ask volume
  ratio: number; // Bid / Ask ratio
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; // Market pressure
  strength: number; // 0-1 (strength of imbalance)
}

/**
 * Order book analysis result
 */
export interface OrderBookAnalysis {
  timestamp: number;
  orderBook: OrderBook;
  imbalance: OrderBookImbalance;
  walls: OrderBookWall[]; // Detected walls
  strongestBid: OrderbookLevel | null; // Strongest bid level
  strongestAsk: OrderbookLevel | null; // Strongest ask level
  spread: number; // Best bid - best ask (%)
  depth: {
    bid: number; // Number of bid levels
    ask: number; // Number of ask levels
  };
}

// OrderBookConfig (duplicate) removed - use the one from ./types/config.ts

/**
 * RSI values from multiple timeframes
 */
export interface RSIValues {
  [TimeframeRole.ENTRY]?: number;
  [TimeframeRole.PRIMARY]?: number;
  [TimeframeRole.TREND1]?: number;
  [TimeframeRole.TREND2]?: number;
  [TimeframeRole.CONTEXT]?: number;
}

/**
 * EMA values (fast and slow) from multiple timeframes
 */
export interface EMAValues {
  [TimeframeRole.ENTRY]?: {
    fast?: number; // EMA20 or EMA10
    slow?: number; // EMA50 or EMA20
  };
  [TimeframeRole.PRIMARY]?: {
    fast?: number;
    slow?: number;
  };
  [TimeframeRole.TREND1]?: {
    fast?: number;
    slow?: number;
  };
  [TimeframeRole.TREND2]?: {
    fast?: number;
    slow?: number;
  };
  [TimeframeRole.CONTEXT]?: {
    fast?: number;
    slow?: number;
  };
}

/**
 * Market data collected from all sources
 * Used by MarketDataCollector service
 */
export interface MarketData {
  rsi: RSIValues; // RSI values from all timeframes
  ema: EMAValues; // EMA values from all timeframes
  zigzagHighs: SwingPoint[]; // Swing highs from ZigZag
  zigzagLows: SwingPoint[]; // Swing lows from ZigZag
  currentPrice: number; // Current market price
  candles?: Candle[]; // PRIMARY timeframe candles
  pattern: 'HH_HL' | 'LH_LL' | 'FLAT' | null; // Market structure pattern
  bias: TrendBias; // Trend bias (BULLISH, BEARISH, NEUTRAL)
  stochastic?: {
    // Stochastic oscillator data (PRIMARY timeframe)
    k: number; // %K value (0-100)
    d: number; // %D value (0-100)
    isOversold: boolean; // K < oversoldThreshold
    isOverbought: boolean; // K > overboughtThreshold
  };
  bollingerBands?: {
    // Bollinger Bands data (PRIMARY timeframe)
    upper: number; // Upper band price
    middle: number; // Middle band (SMA)
    lower: number; // Lower band price
    width: number; // Band width %
    percentB: number; // Price position (0-1)
    isSqueeze: boolean; // Squeeze detected
  };
  atr?: number; // ATR value for adaptive BB params
  tfAlignment?: {
    // PHASE 6: Multi-timeframe alignment scores
    long: TFAlignmentResult; // Alignment score for LONG direction
    short: TFAlignmentResult; // Alignment score for SHORT direction
  };
  vwap?: {
    // PHASE 6: VWAP values from different timeframes
    primary: number; // M5 VWAP
    trend1: number; // M30 VWAP
  };
}

// CorrelationResult and BTCAnalysis moved to ./types/core.ts

/**
 * Confirmation result from BTC filter
 * Used by ConfirmationFilter service
 */
export interface ConfirmationResult {
  shouldConfirm: boolean; // Whether signal should be confirmed
  btcAnalysis?: BTCAnalysis; // BTC analysis data if available
  reason?: string; // Reason for confirmation/rejection
}

// StrategyEvaluation moved to ./types/strategy.ts

// ============================================================================
// SESSION STATISTICS (v3.4.0)
// ============================================================================

/**
 * Indicator snapshot for a specific timeframe
 */
export interface IndicatorSnapshot {
  rsi: number;
  ema20: number;
  ema50: number;
  atr: number;
  volume?: number;
}

/**
 * Pattern snapshot at entry time
 */
export interface PatternSnapshot {
  chartPattern: string | null;
  engulfing: boolean;
  triple: boolean;
  triangle: boolean;
  wedge: boolean;
  flag: boolean;
}

/**
 * Level snapshot at entry time
 */
export interface LevelSnapshot {
  nearestSupport: number;
  nearestResistance: number;
  distanceToLevel: number;
  levelStrength: number;
  touches: number;
}

// ============================================================================
// SWEEP DETECTION (Liquidity Grab Detection)
// ============================================================================

/**
 * Detected sweep event
 */
export interface SweepEvent {
  type: SweepType;
  sweepPrice: number;       // The extreme price reached during sweep (wick low/high)
  recoveryPrice: number;    // Price after recovery (candle close)
  levelPrice: number;       // The level that was swept
  levelType: 'SUPPORT' | 'RESISTANCE';
  timestamp: number;
  strength: number;         // 0-1 based on wick size, recovery, volume
  wickPercent: number;      // How far price swept past level (%)
  recoveryPercent: number;  // How much price recovered (%)
  volumeSpike: boolean;     // Was there volume spike during sweep
  candleIndex: number;      // Index of the sweep candle
}

// SweepDetectorConfig moved to ./types/config.ts

/**
 * Sweep analysis result
 */
export interface SweepAnalysis {
  hasSweep: boolean;
  sweep: SweepEvent | null;
  recentSweeps: SweepEvent[];       // Recent sweeps within lookback
  suggestedSL: number | null;       // Suggested SL after sweep (sweep price + buffer)
  confidenceBoost: number;          // Confidence boost from sweep (0-0.15)
}

/**
 * Context snapshot at entry time
 */
export interface ContextSnapshot {
  btcCorrelation: number | null;
  btcDirection: string | null;
  fundingRate: number | null;
  flatMarketScore: number;
}

/**
 * Stop loss information
 */
export interface StopLossInfo {
  initial: number;
  final: number;
  movedToBreakeven: boolean;
  trailingActivated: boolean;
}

/**
 * Entry condition for session statistics
 * Contains all indicators, patterns, levels, context at entry time
 */
export interface SessionEntryCondition {
  signal: {
    type: string; // Strategy type (LEVEL_BASED, TREND_FOLLOWING, etc.)
    direction: SignalDirection;
    confidence: number; // 0.0-1.0
    reason: string;
  };
  indicators: {
    entry: IndicatorSnapshot;
    primary: IndicatorSnapshot;
    trend1: IndicatorSnapshot;
    trend2?: IndicatorSnapshot;
    context?: IndicatorSnapshot;
  };
  patterns: PatternSnapshot;
  levels: LevelSnapshot | null;
  context: ContextSnapshot;
}

/**
 * Trade record for session statistics
 */
export interface SessionTradeRecord {
  tradeId: string;
  timestamp: string; // ISO timestamp
  direction: SignalDirection;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  exitType: ExitType;
  tpHitLevels: number[]; // Which TP levels were hit (e.g., [1, 2])
  holdingTimeMs: number;
  entryCondition: SessionEntryCondition;
  stopLoss: StopLossInfo;
}

// StrategyStats and DirectionStats moved to ./types/strategy.ts

/**
 * Session summary statistics
 */
export interface SessionSummary {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number; // Percentage (0-100)
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  wlRatio: number; // Win/Loss ratio (avgWin / abs(avgLoss))
  stopOutRate: number; // Percentage of losses that were stop-outs
  avgHoldingTimeMs: number;
  byStrategy: Record<string, StrategyStats>;
  byDirection: Record<string, DirectionStats>;
}

/**
 * Trading session
 */
export interface Session {
  sessionId: string;
  startTime: string; // ISO timestamp
  endTime: string | null; // ISO timestamp or null if session is active
  version: string; // Bot version (e.g., "v3.3.3")
  symbol: string; // Trading symbol (e.g., "APEXUSDT")
  config: Config; // Full config snapshot at session start
  trades: SessionTradeRecord[];
  summary: SessionSummary;
}

/**
 * Session database structure
 */
export interface SessionDatabase {
  sessions: Session[];
}

// ============================================================================
// PHASE 1: SMART ENTRY & BREAKEVEN SYSTEM
// ============================================================================

// FastEntryConfig moved to ./types/config.ts

/**
 * Partial position tracking
 */
export interface PartialPosition {
  orderId: string;
  symbol: string;
  side: SignalDirection;
  qty: number;
  entryPrice: number;
  timestamp: number;
  signal: Signal;
  confirmScheduled: boolean;
}

// SmartBreakevenConfig moved to ./types/config.ts

/**
 * Breakeven state tracking
 */
export interface BreakevenState {
  mode: BreakevenMode;
  activatedAt: number; // Timestamp
  candlesWaited: number; // Candles since activation
  lastCheckPrice: number; // Last price checked
}

// RetestConfig moved to ./types/config.ts

/**
 * Retest zone for missed impulse
 */
export interface RetestZone {
  symbol: string;
  direction: SignalDirection;
  impulseStart: number; // Price before impulse
  impulseEnd: number; // Price after impulse
  zoneHigh: number; // 61.8% retracement
  zoneLow: number; // 50% retracement
  createdAt: number;
  expiresAt: number;
  originalSignal: Signal;
}

// ============================================================================
// PHASE 4: MARKET DATA ENHANCEMENT (Delta, Volume Profile, Orderbook)
// ============================================================================

// DeltaConfig moved to ./types/config.ts

/**
 * Single trade tick from WebSocket
 */
export interface DeltaTick {
  timestamp: number;
  price: number;
  quantity: number;
  side: 'BUY' | 'SELL'; // Aggressor side (taker side)
}

/**
 * Delta Analysis Result
 */
export interface DeltaAnalysis {
  timestamp: number;
  buyVolume: number;
  sellVolume: number;
  delta: number; // buyVolume - sellVolume
  deltaPercent: number; // delta / totalVolume * 100
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  strength: number; // 0-100 (how strong is the imbalance)
}

// OrderbookImbalanceConfig moved to ./types/config.ts

/**
 * Orderbook Imbalance Analysis (PHASE 4 Feature 4)
 * Analyzes bid/ask volume ratio in orderbook
 */
export interface ImbalanceAnalysis {
  timestamp: number;
  bidVolume: number;
  askVolume: number;
  totalVolume: number;
  imbalance: number; // (bid - ask) / total * 100
  direction: 'BID' | 'ASK' | 'NEUTRAL';
  strength: number; // 0-100
}

// VolumeProfileConfig moved to ./types/config.ts

// VolumeProfileIntegrationConfig moved to ./types/config.ts

/**
 * Volume Node (single price level with volume)
 */
export interface VolumeNode {
  price: number;
  volume: number;
}

/**
 * Volume Profile Result (PHASE 4 Feature 3)
 * Distribution of volume across price levels
 */
export interface VolumeProfileResult {
  poc: number; // Point of Control (price with highest volume)
  vah: number; // Value Area High (top of 70% volume range)
  val: number; // Value Area Low (bottom of 70% volume range)
  totalVolume: number;
  nodes: VolumeNode[]; // Volume distribution (sorted by volume desc)
}

// ============================================================================
// PHASE 2: WEIGHT MATRIX SYSTEM
// ============================================================================

/**
 * Weight configuration for a single indicator/factor
 */
export interface IndicatorWeight {
  enabled: boolean;
  maxPoints: number; // Maximum points this factor can contribute
  thresholds: {
    excellent?: number; // e.g., RSI < 20 → 100% of maxPoints
    good?: number; // e.g., RSI < 30 → 75% of maxPoints
    ok?: number; // e.g., RSI < 40 → 50% of maxPoints
    weak?: number; // e.g., RSI < 50 → 25% of maxPoints
  };
}

/**
 * Complete weight matrix for signal scoring
 */
export interface WeightMatrixConfig {
  enabled: boolean;
  minConfidenceToEnter: number; // 70 (%) - for trending markets
  minConfidenceFlat?: number; // 30 (%) - for flat/sideways markets (OPTIONAL)
  minConfidenceForReducedSize: number; // 45 (%)
  reducedSizeMultiplier: number; // 0.5 (50% of normal size)

  weights: {
    // Technical indicators
    rsi: IndicatorWeight;
    stochastic: IndicatorWeight;
    ema: IndicatorWeight;
    bollingerBands: IndicatorWeight;
    atr: IndicatorWeight;

    // Volume & Market
    volume: IndicatorWeight;
    delta: IndicatorWeight; // Buy/Sell pressure
    orderbook: IndicatorWeight; // Wall analysis
    imbalance: IndicatorWeight; // Bid/Ask imbalance

    // Structure & Levels
    levelStrength: IndicatorWeight; // Touches, bounces
    levelDistance: IndicatorWeight; // Distance to S/R
    swingPoints: IndicatorWeight; // Swing high/low quality

    // Patterns
    chartPatterns: IndicatorWeight; // H&S, Double Top, etc.
    candlePatterns: IndicatorWeight; // Engulfing, Doji, etc.

    // Higher TF
    seniorTFAlignment: IndicatorWeight; // M30/M60 trend alignment
    btcCorrelation: IndicatorWeight; // BTC direction alignment
    tfAlignment: IndicatorWeight; // PHASE 6: Multi-timeframe alignment score

    // Special
    divergence: IndicatorWeight; // RSI divergence
    liquiditySweep: IndicatorWeight; // Sweep detection
  };
}

/**
 * Signal scoring breakdown (for transparency)
 */
export interface SignalScoreBreakdown {
  totalScore: number; // 0-100
  maxPossibleScore: number; // Sum of all maxPoints
  confidence: number; // totalScore / maxPossibleScore * 100
  contributions: {
    [key: string]: {
      points: number;
      maxPoints: number;
      reason: string;
    };
  };
}

/**
 * Market data for weight calculation
 * Collected from various analyzers/indicators
 */
export interface WeightMatrixInput {
  // Technical indicators
  rsi?: number;
  stochastic?: { k: number; d: number };
  ema?: { fast: number; slow: number; price: number };
  bollingerBands?: { position: number }; // 0-100 (percentile in BB)
  atr?: { current: number; average: number };

  // Volume & Market
  volume?: { current: number; average: number };
  delta?: { buyPressure: number; sellPressure: number };
  orderbook?: { wallStrength: number }; // 0-1
  imbalance?: { direction: 'BID' | 'ASK' | 'NEUTRAL'; strength: number }; // 0-100

  // Structure & Levels
  levelStrength?: { touches: number; strength: number };
  levelDistance?: { percent: number };
  swingPoints?: { quality: number }; // 0-1

  // Patterns
  chartPatterns?: { type: string; strength: number };
  candlePatterns?: { type: string; strength: number };

  // Higher TF
  seniorTFAlignment?: { aligned: boolean; strength: number };
  btcCorrelation?: { correlation: number };
  tfAlignmentScore?: number; // PHASE 6: Multi-timeframe alignment score (0-100)

  // Special
  divergence?: { type: string; strength: number };
  liquiditySweep?: { detected: boolean; confidence: number };
}

// ============================================================================
// PHASE 3: DYNAMIC STOPS & TRAILING SYSTEM
// ============================================================================

/**
 * Stop Loss calculation result with reasoning
 */
export interface StopLossCalculation {
  type: StopLossType;
  price: number;
  distancePercent: number;
  reason: string;
  structurePrice?: number; // e.g., swing low, sweep price
  buffer?: number;
}

// SmartTrailingConfig moved to ./types/config.ts

/**
 * Trailing stop state tracking
 */
export interface TrailingState {
  active: boolean;
  activatedBy: 'TP2' | 'IMPULSE';
  activatedAt: number;
  lastUpdatePrice: number;
  lastStopLoss: number;
  updateCount: number;
}

// AdaptiveTP3Config moved to ./types/config.ts

// ============================================================================
// DATA COLLECTION TYPES (for standalone collector script)
// ============================================================================

// DataCollectionConfig moved to ./types/config.ts

/**
 * Candle record for database storage
 */
export interface CandleRecord {
  id?: number;
  symbol: string;
  timeframe: string;
  timestamp: number; // Candle close time (Unix ms)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  createdAt: number; // When record was inserted
}

/**
 * Orderbook snapshot record for database storage
 */
export interface OrderbookSnapshot {
  id?: number;
  symbol: string;
  timestamp: number; // Snapshot time (Unix ms)
  bids: string; // JSON compressed: [[price, size], ...]
  asks: string; // JSON compressed: [[price, size], ...]
  createdAt: number; // When record was inserted
}

/**
 * Trade tick record for database storage
 */
export interface TradeTickRecord {
  id?: number;
  symbol: string;
  timestamp: number; // Trade execution time (Unix ms)
  price: number;
  size: number;
  side: 'Buy' | 'Sell';
  createdAt: number; // When record was inserted
}

// ============================================================================
// PHASE 4: WALL TRACKING (Advanced Orderbook Analysis)
// ============================================================================

// WallTrackingConfig moved to ./types/config.ts

/**
 * Wall Event (PHASE 4)
 */
export interface WallEvent {
  timestamp: number;
  type: 'ADDED' | 'REMOVED' | 'ABSORBED' | 'REFILLED';
  price: number;
  size: number;
  side: 'BID' | 'ASK';
  reason?: string;
}

/**
 * Wall Lifetime Tracking (PHASE 4)
 */
export interface WallLifetime {
  firstSeen: number;
  lastSeen: number;
  price: number;
  side: 'BID' | 'ASK';
  maxSize: number;
  currentSize: number;
  events: WallEvent[];
  isSpoofing: boolean; // Removed too quickly
  isIceberg: boolean; // Refills rapidly
  absorbedVolume: number; // How much traded through
}

/**
 * Wall Cluster (PHASE 4)
 */
export interface WallCluster {
  priceRange: [number, number];
  side: 'BID' | 'ASK';
  wallCount: number;
  totalSize: number;
  averageLifetime: number;
  strength: number; // 0-100
}

// ============================================================================
// PHASE 5: MAX CONCURRENT RISK
// ============================================================================

// MaxConcurrentRiskConfig moved to ./types/config.ts

/**
 * Position Risk Info (PHASE 5)
 */
export interface PositionRiskInfo {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  positionSize: number;
  riskAmount: number; // USDT at risk (SL distance * size)
  riskPercent: number; // % of balance at risk
}

// ============================================================================
// SCALPING STRATEGIES (Phase 1-5)
// ============================================================================

// MicroWallDetectorConfig moved to ./types/config.ts

/**
 * Micro Wall Data Structure
 * Represents a small orderbook wall detected for scalping
 */
export interface MicroWall {
  side: 'BID' | 'ASK'; // Wall side
  price: number; // Wall price level
  size: number; // Total size at this level (USDT)
  percentOfTotal: number; // % of total orderbook volume
  distance: number; // Distance from current price (%)
  timestamp: number; // Detection timestamp
  broken: boolean; // Has the wall been broken?
  brokenAt?: number; // Timestamp when wall was broken
}

/**
 * Scalping Micro Wall Strategy Configuration (Phase 1)
 * Strategy that trades small orderbook wall breaks for quick profits
 */
export interface ScalpingMicroWallConfig {
  enabled: boolean; // Enable strategy
  priority: number; // Strategy priority (1 = highest, recommended: 2)
  minConfidence: number; // Min confidence from detector (0-100, e.g., 65)
  takeProfitPercent: number; // Take profit % (e.g., 0.15 = 0.15%)
  stopLossPercent: number; // Stop loss % (e.g., 0.08 = 0.08%)
  maxHoldingTimeMs: number; // Max holding time (e.g., 120000ms = 2min)
  cooldownMs: number; // Cooldown after trade (e.g., 60000ms = 1min)
  detector: MicroWallDetectorConfig; // Detector configuration
  smartBreakeven?: SmartBreakevenConfig; // Strategy-specific breakeven settings
}

// LimitOrderExecutorConfig moved to ./types/config.ts

/**
 * Limit Order Execution Result
 * Result from placing and executing a limit order
 */
export interface LimitOrderResult {
  orderId: string; // Order ID from exchange
  filled: boolean; // Was order filled?
  fillPrice?: number; // Fill price (if filled)
  feePaid: number; // Fee paid (0.01% for maker)
  executionTime: number; // Time taken to fill (ms)
}

/**
 * Market Order Execution Result
 * Result from executing a market order (fallback)
 */
export interface MarketOrderResult {
  orderId: string; // Order ID from exchange
  filled: true; // Market orders are always filled immediately
  fillPrice: number; // Fill price
  feePaid: number; // Fee paid (0.06% for taker)
  executionTime: number; // Time taken to fill (ms)
}

/**
 * Scalping Limit Order Strategy Configuration (Phase 2)
 * Wrapper strategy that executes entries with limit orders instead of market
 */
export interface ScalpingLimitOrderConfig {
  enabled: boolean; // Enable strategy
  priority: number; // Strategy priority (1 = highest, recommended: 2)
  minConfidence: number; // Min confidence from base strategy (0-100, e.g., 70)
  executor: LimitOrderExecutorConfig; // Executor configuration
  baseSignalSource: string; // Base strategy to wrap (e.g., 'levelBased', 'whaleHunter')
  smartBreakeven?: SmartBreakevenConfig; // Strategy-specific breakeven settings
}

/**
 * Ladder Take Profit Level (Phase 3)
 * Represents single TP level in ladder TP system
 */
export interface LadderTpLevel {
  level: number; // TP level number (1, 2, 3)
  pricePercent: number; // Distance from entry % (e.g., 0.08, 0.15, 0.25)
  closePercent: number; // Position % to close (e.g., 33, 33, 34)
  targetPrice: number; // Calculated TP price
  hit: boolean; // Whether TP was hit
}

// LadderTpManagerConfig moved to ./types/config.ts

/**
 * Scalping Ladder TP Strategy Configuration (Phase 3)
 * Wrapper strategy that enhances exits with ladder TP system
 */
export interface ScalpingLadderTpConfig {
  enabled: boolean; // Enable strategy
  priority: number; // Strategy priority (1 = highest, recommended: 2)
  minConfidence: number; // Min confidence from base strategy (0-100, e.g., 70)
  stopLossPercent: number; // Stop loss distance % (e.g., 0.12)
  maxHoldingTimeMs: number; // Max position holding time (ms, e.g., 300000 = 5min)
  ladderManager: LadderTpManagerConfig; // Ladder TP manager config
  baseSignalSource: string; // Base strategy to wrap (e.g., 'levelBased', 'whaleHunter')
  smartBreakeven?: SmartBreakevenConfig; // Strategy-specific breakeven settings
}

/**
 * Tick (Phase 4 - Tick Delta Strategy)
 * Represents single trade/tick from market
 */
export interface Tick {
  timestamp: number; // Trade timestamp (ms)
  price: number; // Trade price
  size: number; // Trade size (contracts)
  side: 'BUY' | 'SELL'; // Aggressive side (taker side)
}

/**
 * Momentum Spike (Phase 4)
 * Detected buy/sell momentum from tick delta analysis
 */
export interface MomentumSpike {
  direction: SignalDirection; // LONG for buy momentum, SHORT for sell momentum
  deltaRatio: number; // Buy/Sell ratio (e.g., 2.5 = 2.5x more buys than sells)
  confidence: number; // Confidence score (0-100)
  tickCount: number; // Number of ticks in window
  volumeUSDT: number; // Total volume in USDT
}

// TickDeltaAnalyzerConfig moved to ./types/config.ts

/**
 * Scalping Tick Delta Strategy Configuration (Phase 4)
 * Scalping strategy based on tick delta momentum
 */
export interface ScalpingTickDeltaConfig {
  enabled: boolean; // Enable strategy
  priority: number; // Strategy priority (1 = highest, recommended: 2)
  minConfidence: number; // Min confidence to enter (0-100, e.g., 70)
  takeProfitPercent: number; // Take profit % (e.g., 0.20)
  stopLossPercent: number; // Stop loss % (e.g., 0.10)
  maxHoldingTimeMs: number; // Max position holding time (ms, e.g., 60000 = 1min)
  analyzer: TickDeltaAnalyzerConfig; // Tick delta analyzer config
  smartBreakeven?: SmartBreakevenConfig; // Strategy-specific breakeven settings
}

// ============================================================================
// STRATEGY 5: ORDER FLOW IMBALANCE (Phase 5)
// ============================================================================

/**
 * Aggressive flow event detected from orderbook changes
 */
export interface AggressiveFlow {
  direction: 'BUY' | 'SELL'; // Flow direction
  volumeUSDT: number; // Volume in USDT
  timestamp: number; // Event timestamp
  price: number; // Price level
}

/**
 * Flow imbalance result
 */
export interface FlowImbalance {
  direction: SignalDirection; // Signal direction (LONG/SHORT)
  ratio: number; // Aggressive buy / aggressive sell ratio
  confidence: number; // Confidence level (0-100)
  totalVolumeUSDT: number; // Total volume in window
}

// OrderFlowAnalyzerConfig moved to ./types/config.ts

/**
 * Scalping Order Flow Strategy Configuration (Phase 5)
 * Scalping strategy based on order flow imbalance
 */
export interface ScalpingOrderFlowConfig {
  enabled: boolean; // Enable strategy
  priority: number; // Strategy priority (1 = highest, recommended: 2)
  minConfidence: number; // Min confidence to enter (0-100, e.g., 75)
  takeProfitPercent: number; // Take profit % (e.g., 0.10)
  stopLossPercent: number; // Stop loss % (e.g., 0.05)
  maxHoldingTimeMs: number; // Max position holding time (ms, e.g., 30000 = PERCENTAGE_THRESHOLDS.MODERATEsec)
  analyzer: OrderFlowAnalyzerConfig; // Order flow analyzer config
  smartBreakeven?: SmartBreakevenConfig; // Strategy-specific breakeven settings
}

// ============================================================================
// SERVICE EXPORTS
// ============================================================================

export { LoggerService } from './services/logger.service';
export { RiskManager } from './services/risk-manager.service';
export { WeightMatrixCalculatorService } from './services/weight-matrix-calculator.service';
export { WhaleDetectionService } from './services/whale-detection.service';
export { WallTrackerService } from './services/wall-tracker.service';
export { MicroWallDetectorService } from './services/micro-wall-detector.service';
export { TickDeltaAnalyzerService } from './services/tick-delta-analyzer.service';
export { LadderTpManagerService } from './services/ladder-tp-manager.service';
export { OrderFlowAnalyzerService } from './services/order-flow-analyzer.service';
export { FractalSmcWeightingService } from './services/fractal-smc-weighting.service';
export { MarketHealthMonitor } from './services/market-health.monitor';
export { AntiFlipService, AntiFlipConfig, LastSignalInfo } from './services/anti-flip.service';
export { VolatilityRegimeService } from './services/volatility-regime.service';
export {
  EnhancedExitService,
  EnhancedExitConfig,
  RiskRewardValidation,
  EnhancedTPSLResult,
  BreakevenCheck,
  TrailingCheck,
  TimeDecayAdjustment,
} from './services/enhanced-exit.service';
export {
  WhaleWallTPService,
  WhaleWallTPConfig,
  WhaleWallTPResult,
} from './services/whale-wall-tp.service';

// ============================================================================
// LEGACY EXPORTS REMOVED
// ============================================================================
// Old indicators, analyzers, and strategies have been removed
// New architecture uses:
// - JSON-based strategies (src/strategies/json/*.strategy.json)
// - Strategy-driven analyzer loading (StrategyManagerService)
// - NEW analyzer versions (src/analyzers/*.analyzer-new.ts)
// - NEW indicator versions (src/indicators/*.indicator-new.ts)
// See MIGRATION_PLAN.md and CLEANUP_PLAN.md for details

// ============================================================================
// EVENT TYPES EXPORTS
// ============================================================================

export {
  ServerPingMessage,
  BybitWebSocketMessage,
  PositionData,
  OrderExecutionData,
  OrderUpdateData,
  KlineData,
  OrderbookData,
  TradeData,
  TakeProfitFilledEvent,
  StopLossFilledEvent,
  TradeTickEvent,
  TimeBasedExitEvent,
  OrderbookUpdateEvent,
} from './types/events.types';

// ============================================================================
// PATTERN 1: JSON VALIDATION TYPES
// ============================================================================

/**
 * Validated Virtual Balance State (after JSON.parse)
 * Used when deserializing virtual-balance.json
 */
export interface ValidatedVirtualBalanceState {
  currentBalance: number;
  baseDeposit: number;
  lastUpdated: number;
  totalTrades: number;
  lastTradeId: string;
  totalProfit: number;
  allTimeHigh: number;
  allTimeLow: number;
}

/**
 * Error message extraction from unknown error type
 * Standardized error context for logging
 */
export interface ErrorContext {
  message: string;
  timestamp: number;
  code?: string;
  context?: Record<string, unknown>;
}

// ============================================================================
// PATTERN 2: OPTIONAL OBJECT NAVIGATION TYPES
// ============================================================================

/**
 * Liquidity Sweep Data - Discriminated Union
 * Ensures properties exist together or not at all
 * Used to safely access sweep properties from LiquidityAnalysis.recentSweep
 */
export interface LiquiditySweepData {
  detected: boolean;
  isFakeout: boolean;
  sweepPrice: number;
  sweepTime: number;
  priceAfterSweep: number;
}

/**
 * Type guard for liquidity sweep detection
 * Safe way to check and access sweep properties
 */
/**
 * Timeframe-Specific Technical Data
 * Ensures all optional technical fields are typed together
 */
export interface TimeframeData {
  ema20?: number;
  ema50?: number;
  rsi?: number;
  atr?: number;
  bollingerUpper?: number;
  bollingerLower?: number;
}

/**
 * Market Structure Context
 * Typed structure for pattern/bias analysis results
 */
export interface TypedMarketStructure {
  pattern: string | null;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | null;
  isValid: boolean;
}

// ============================================================================
// PATTERN 3: INTERMEDIATE DATA TYPES (Generic Record Reduction)
// ============================================================================

/**
 * Pending Entry Signal Data
 * Type-safe intermediate for pending signals
 */
export interface PendingSignalData {
  signal: Signal;
  keyLevel: number;
  detectedAt: number;
  confidence: number;
  marketContext: Partial<StrategyMarketData>;
}

/**
 * Serialized Trade Data
 * Safe intermediate for trade data passing
 */
export interface SerializedTradeData {
  signal: Signal;
  direction: SignalDirection;
  entryPrice: number;
  quantity: number;
  takeProfits: TakeProfit[];
  stopLoss: number;
  openTime: number;
  status: 'PENDING' | 'OPEN' | 'CLOSED';
}

/**
 * Delta Analysis Result
 * Typed structure for volume analysis
 */
export interface TypedDeltaAnalysis {
  buyVolume: number;
  sellVolume: number;
  ratio: number;
  bullishScore: number;
  timestamp: number;
}

/**
 * Verification Result Structure
 * Type-safe TP/SL verification data
 */
export interface VerificationResult {
  takeProfitPrices: number[];
  stopLossPrices: number[];
  isValid: boolean;
  validationErrors: string[];
}

// ============================================================================
// SMART MONEY CONCEPTS (SMC) COMPONENTS
// ============================================================================

// ============================================================================
// FOOTPRINT ANALYSIS
// ============================================================================

/**
 * Price level in footprint chart
 * Tracks bid/ask volume by price level within a candle
 */
export interface FootprintLevel {
  price: number;
  bidVolume: number;
  askVolume: number;
  delta: number;
  timestamp: number;
}

/**
 * Footprint candle - Aggregates all price levels within a candle period
 */
export interface FootprintCandle {
  candle: Candle;
  levels: FootprintLevel[];
  totalDelta: number;
  dominantSide: 'BID' | 'ASK' | 'NEUTRAL';
  imbalanceRatio: number;
  povPoint: number | null;
}

/**
 * Footprint analysis result
 */
export interface FootprintAnalysis {
  candles: FootprintCandle[];
  currentAggression: 'BUY' | 'SELL' | 'NEUTRAL';
  aggressionStrength: number;
  imbalanceDetected: boolean;
  imbalanceLevel: FootprintLevel | null;
}

// FootprintConfig moved to ./types/config.ts

// ============================================================================
// ORDER BLOCKS
// ============================================================================

/**
 * Order Block - Institutional consolidation zone where smart money enters before breakouts
 */
export interface OrderBlock {
  type: OrderBlockType;
  high: number;
  low: number;
  timestamp: number;
  candle: Candle;
  strength: number;
  tested: boolean;
  testedAt: number | null;
  broken: boolean;
  brokenAt: number | null;
}

/**
 * Order Block Detection Result
 */
export interface OrderBlockAnalysis {
  blocks: OrderBlock[];
  activeBlocks: OrderBlock[];
  nearestBullishBlock: OrderBlock | null;
  nearestBearishBlock: OrderBlock | null;
  distanceToNearestBlock: number;
}

// OrderBlockConfig moved to ./types/config.ts

// ============================================================================
// FAIR VALUE GAPS (FVG)
// ============================================================================

/**
 * Fair Value Gap - Price gap between consecutive candles indicating unfilled orders
 */
export interface FairValueGap {
  type: FVGType;
  status: FVGStatus;
  gapHigh: number;
  gapLow: number;
  gapSize: number;
  gapPercent: number;
  timestamp: number;
  candles: [Candle, Candle, Candle];
  filledPercent: number;
  filledAt: number | null;
}

/**
 * FVG Analysis Result
 */
export interface FVGAnalysis {
  gaps: FairValueGap[];
  unfilledGaps: FairValueGap[];
  nearestBullishGap: FairValueGap | null;
  nearestBearishGap: FairValueGap | null;
  distanceToNearestGap: number;
  expectingFill: boolean;
}

// FVGConfig moved to ./types/config.ts

// ============================================================================
// FRACTAL DETECTION
// ============================================================================

/**
 * Fractal detection result
 */
export interface FractalSignal {
  type: FractalType;
  price: number;           // Price of the fractal (support or resistance)
  strength: number;        // 0-100, how strong is the fractal
  relativeHeight: number;  // 0-100, how far from nearby candles
  candleIndex: number;     // Index of the fractal candle (should be 2 for 5-candle pattern)
  timestamp?: number;
}

// FractalConfig moved to ./types/config.ts

// ============================================================================
// TREND CONFIRMATION (MULTI-TF)
// ============================================================================

/**
 * Trend data for single timeframe
 */
export interface TimeframeTrendData {
  timeframe: TimeframeRole;
  trend: TrendBias;              // BULLISH, BEARISH, NEUTRAL
  emaState: 'ABOVE' | 'BELOW' | 'CROSS'; // Price vs EMA
  structure: MarketStructure;    // HH, HL, LH, LL
  confidence: number;             // 0-100
}

/**
 * Multi-timeframe trend confirmation result
 */
export interface TrendConfirmationResult {
  isAligned: boolean;             // All confirmed TF are aligned
  alignmentScore: number;         // 0-100, how many TF confirm
  confirmedCount: number;         // Number of confirming TF
  totalCount: number;             // Total TF analyzed
  details: {
    entry?: TimeframeTrendData;
    primary?: TimeframeTrendData;
    trend1?: TimeframeTrendData;
    trend2?: TimeframeTrendData;
  };
  confidenceBoost: number;        // 0-30%, boost to apply if aligned
  reason: string;                 // Explanation of result
}

// TrendConfirmationConfig moved to ./types/config.ts

// ============================================================================
// PATTERN VALIDATION SYSTEM (Phase 1: Statistical validation)
// ============================================================================

/**
 * Single pattern occurrence from backtest or live trading
 * Includes walk-forward dataset split for validation
 */
export interface PatternOccurrence {
  patternType: string; // 'BULLISH_ENGULFING', 'HEAD_AND_SHOULDERS', etc.
  timeframe: string; // '1m', '5m', '15m'
  timestamp: number;
  symbol: string;

  // Pattern detection confidence
  detectorConfidence: number; // 0-100

  // Market context
  btcCorrelation: number | null;
  btcTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | null;
  marketRegime: 'TREND' | 'FLAT' | 'VOLATILE';
  atrPercent: number;
  volumeMultiplier: number;

  // Technical indicators (for ML features in Phase 2)
  rsi?: number;
  emaState?: 'ABOVE' | 'BELOW' | 'CROSS';
  bollingerState?: 'EXPANDED' | 'CONTRACTED';
  macdTrend?: 'UP' | 'DOWN' | 'NEUTRAL';

  // Trading outcome
  traded: boolean;
  direction: SignalDirection | null;
  pnl?: number; // USDT
  pnlPercent?: number;
  holdingTimeMs?: number;
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN' | 'NOT_TRADED';
  maxProfitPercent?: number;
  maxDrawdownPercent?: number;

  // Walk-forward validation split
  datasetSplit: 'TRAIN' | 'TEST';
}

/**
 * Validation result for a pattern (per pattern × timeframe combination)
 * Contains separate TRAIN and TEST statistics with overfitting detection
 */
export interface PatternValidationResult {
  patternType: string;
  timeframe: string;

  // Core stats
  totalOccurrences: number;
  wins: number;
  losses: number;
  winRate: number; // %

  // Expectancy & Sharpe
  avgWin: number; // %
  avgLoss: number; // %
  expectancy: number;
  sharpeRatio: number;
  profitFactor: number;

  // Statistical significance
  pValue: number; // Chi-square test vs 50%
  significanceLevel: 'HIGHLY_SIGNIFICANT' | 'SIGNIFICANT' | 'NOT_SIGNIFICANT';
  confidenceInterval: {
    lower: number;
    upper: number;
    confidence: 95;
  };

  // BTC context
  btcCorrelationImpact: {
    aligned: { winRate: number; count: number };
    opposed: { winRate: number; count: number };
  };

  // Market regimes
  regimePerformance: {
    TREND: { winRate: number; expectancy: number; count: number };
    FLAT: { winRate: number; expectancy: number; count: number };
    VOLATILE: { winRate: number; expectancy: number; count: number };
  };

  // Walk-forward validation results
  trainResults?: PatternValidationResult; // Stats from TRAIN split (63 days)
  testResults?: PatternValidationResult; // Stats from TEST split (27 days - out of sample)
  overfittingGap?: number; // |trainWR - testWR| %
  overfittingWarning?: boolean; // true if gap > threshold

  // Validation outcome
  isValid: boolean;
  warnings: string[];
  degradationLevel: 'NONE' | 'WARNING' | 'CRITICAL';
  recommendedAction: 'ENABLE' | 'REDUCE_WEIGHT' | 'DISABLE';
  recommendedWeight: number; // 0.0-1.0 (based on TEST results)

  validationTimestamp: number;
}

// PatternValidationConfig moved to ./types/config.ts

/**
 * Pattern metadata (runtime state, stored in config.json)
 * Tracks validation history and current status
 */
export interface PatternMetadata {
  patternType: string;
  enabled: boolean;
  weight: number; // Current weight multiplier (0.0-1.0)

  lastValidation: {
    timestamp: number;
    trainWinRate: number; // Reference only
    testWinRate: number; // PRIMARY metric for decisions
    expectancy: number;
    overfittingGap: number;
    degradationLevel: 'NONE' | 'WARNING' | 'CRITICAL';
  } | null;

  performanceHistory: Array<{
    timestamp: number;
    trainWinRate: number;
    testWinRate: number;
    expectancy: number;
  }>;
}

/**
 * Cross-timeframe analysis result
 * Determines optimal timeframe per pattern based on TEST results
 */
export interface CrossTimeframeAnalysis {
  pattern: string;
  results: {
    [timeframe: string]: {
      testWinRate: number;
      testExpectancy: number;
      testSampleSize: number;
      rank: number; // 1 = best, 2 = second, etc.
      overfittingGap: number;
    };
  };
  optimalTimeframe: string;
  consistencyScore: number; // 0-1 (how consistent across TFs)
}

/**
 * ML Feature Set for K-means clustering
 * Combines price action, technical indicators, volatility, and order flow
 */
export interface MLFeatureSet {
  // 1. Price Action (last 5 candles)
  priceAction: {
    highs: number[]; // Last 5 candle highs
    lows: number[]; // Last 5 candle lows
    closes: number[]; // Last 5 candle closes
    volumes: number[]; // Last 5 candle volumes
    returns: number[]; // Close-to-close % returns
  };

  // 2. Technical Indicators (ALL from config)
  technicalIndicators: {
    // RSI (14 period)
    rsi: number; // 0-100
    rsiTrend: 'UP' | 'DOWN'; // RSI momentum direction
    rsiStrength: 'EXTREME_OVERSOLD' | 'OVERSOLD' | 'STRONG' | 'MODERATE' | 'NEUTRAL' | 'MODERATE_OB' | 'OVERBOUGHT' | 'EXTREME_OVERBOUGHT';

    // EMA (20, 50)
    ema20: number; // Price value
    ema50: number; // Price value
    emaTrend: 'ABOVE' | 'BELOW'; // Price vs EMA50
    emaDiffPercent: number; // (EMA20 - EMA50) / EMA50 * 100

    // MACD (Optional for future)
    macdHistogram: number; // MACD histogram value
    macdTrend: 'POSITIVE' | 'NEGATIVE'; // MACD momentum

    // Stochastic (14, 3, 3)
    stochasticK: number; // 0-100
    stochasticD: number; // 0-100
    stochasticTrend: 'UP' | 'DOWN';
    stochasticStrength: 'OVERSOLD' | 'NORMAL' | 'OVERBOUGHT';

    // Bollinger Bands (20, 2)
    bbUpperBand: number;
    bbLowerBand: number;
    bbMiddleBand: number;
    bbPosition: number; // (close - lower) / (upper - lower), 0-1
  };

  // 3. Volatility & Market Regime
  volatility: {
    atrPercent: number; // ATR as % of current price
    bollingerWidth: number; // Bollinger band width as % of price
    volatilityRegime: 'LOW' | 'NORMAL' | 'HIGH'; // Volatility classification
    flatMarketScore: number; // 0-100, higher = flatter
  };

  // 4. Chart Patterns (ALL enabled in config)
  chartPatterns: {
    trianglePattern: boolean; // Triangle detected
    wedgePattern: boolean; // Wedge detected
    flagPattern: boolean; // Flag detected
    engulfingBullish: boolean; // Bullish engulfing
    engulfingBearish: boolean; // Bearish engulfing
    doubleBottom: boolean; // Double bottom
    doubleTop: boolean; // Double top
    headAndShoulders: boolean; // H&S pattern
  };

  // 5. Level-Based Analysis
  levelAnalysis: {
    nearestLevelDistance: number; // % distance to nearest level
    levelStrength: number; // 0-100, based on touches
    touchCount: number; // How many times tested
    isStrongLevel: boolean; // >= 5 touches
    trendAligned: boolean; // Level aligns with trend
  };

  // 6. Price Action Signals
  priceActionSignals: {
    divergenceDetected: boolean; // RSI/Price divergence
    chochDetected: boolean; // Change of Character
    liquiditySweep: boolean; // Liquidity sweep happened
    wickRejection: boolean; // Strong wick rejection
  };

  // 7. Order Flow & Microstructure
  orderFlow: {
    bidAskImbalance: number; // (bid_volume - ask_volume) / total_volume
    bookDepth: number; // Average book depth
    microStructure: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; // Orderbook bias
    volumeStrength: 'VERY_LOW' | 'LOW' | 'NORMAL' | 'HIGH' | 'VERY_HIGH';
  };

  // 8. BTC Correlation & Context
  btcContext?: {
    btcCorrelation: number; // -1 to 1, correlation with BTC
    btcMomentum: 'STRONG_BULL' | 'BULL' | 'NEUTRAL' | 'BEAR' | 'STRONG_BEAR';
    btcRsi: number; // BTC RSI value
  };

  // Target variable (outcome)
  label: 'WIN' | 'LOSS'; // Pattern trading outcome
  patternType: string; // For reference (BULLISH_ENGULFING, etc.)
  timestamp: number; // When this feature set was created

  // Multi-timeframe context on ALL timeframes (1m, 5m, 15m, 30m, 1h)
  multiTimeframeContext?: {
    // 5-minute timeframe
    context5m: {
      technicalIndicators: MLFeatureSet['technicalIndicators'];
      volatility: MLFeatureSet['volatility'];
      chartPatterns: MLFeatureSet['chartPatterns'];
    };
    // 15-minute timeframe
    context15m: {
      technicalIndicators: MLFeatureSet['technicalIndicators'];
      volatility: MLFeatureSet['volatility'];
      chartPatterns: MLFeatureSet['chartPatterns'];
    };
    // 30-minute timeframe
    context30m: {
      technicalIndicators: MLFeatureSet['technicalIndicators'];
      volatility: MLFeatureSet['volatility'];
      chartPatterns: MLFeatureSet['chartPatterns'];
    };
    // 1-hour timeframe
    context1h: {
      technicalIndicators: MLFeatureSet['technicalIndicators'];
      volatility: MLFeatureSet['volatility'];
      chartPatterns: MLFeatureSet['chartPatterns'];
    };
  };
}

/**
 * Cluster result from K-means clustering
 * Groups similar price action patterns
 */
export interface ClusterResult {
  clusterId: number; // 0 to K-1
  centroid: number[]; // Center point of cluster
  samples: MLFeatureSet[]; // All feature sets in this cluster

  // Statistics
  sampleCount: number;
  winRate: number; // % of WIN samples in cluster
  avgWinPnl: number; // Average profit for winners
  avgLossPnl: number; // Average loss for losers
  expectancy: number; // Expected value per trade

  // Characteristics
  commonPatterns: { [pattern: string]: number }; // Pattern distribution
  commonVolatilityRegimes: { [regime: string]: number }; // Volatility distribution
  avgRsi: number; // Average RSI in cluster
  avgAtrPercent: number; // Average volatility
}

/**
 * Configuration for ML Pattern Discovery
 */
export interface MLDiscoveryConfig {
  enabled: boolean;

  // K-means parameters
  numClusters: number; // 5-10 (auto-determined or fixed)
  maxIterations: number; // 100-1000
  convergenceThreshold: number; // 0.0001 (centroid movement threshold)

  // Validation parameters
  trainTestSplit: {
    trainPercent: number; // 70
    testPercent: number; // 30
  };

  // Feature normalization
  normalizeFeatures: boolean; // Standard scaling (mean=0, std=1)

  // Thresholds for cluster quality
  minClusterSize: number; // Min 5-10 samples per cluster
  minClusterWinRate: number; // Min 40% win rate (discovery threshold)

  // Data source
  dataSource: 'BACKTEST' | 'LIVE' | 'BOTH';
  backtestPeriodDays: number; // 90 days

  // Timing
  autoDiscoveryInterval: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'MANUAL';
  lastDiscoveryTimestamp: number;
}

/**
 * ML Pattern Discovery Result
 * Contains discovered clusters and their characteristics
 */
export interface MLDiscoveryResult {
  discoveryTimestamp: number;
  backtestPeriod: {
    startDate: string;
    endDate: string;
    dayCount: number;
  };

  // Clustering results
  numClusters: number;
  clusters: ClusterResult[];

  // Overall statistics
  totalSamples: number;
  trainSamples: number;
  testSamples: number;

  // Best clusters (by win rate or expectancy)
  topClustersByWinRate: Array<{
    clusterId: number;
    winRate: number;
    sampleCount: number;
    tradeable: boolean; // Min sample size met
  }>;

  // Feature importance (which features distinguish clusters)
  featureImportance: {
    [feature: string]: number; // 0-1 importance score
  };

  // Recommendations
  recommendations: string[];
  qualityScore: number; // 0-1 (how stable/repeatable are clusters)
}

// ============================================================================
// STRUCTURE-AWARE EXIT STRATEGY (Phase 6)
// ============================================================================

/**
 * Structure-Aware Exit Configuration
 * Dynamic TP2 calculation from resistance/support levels + Bybit trailing stop
 */
export interface StructureAwareExitConfig {
  enabled: boolean;

  dynamicTP2: {
    enabled: boolean;
    useSwingPoints: boolean;
    useLiquidityZones: boolean;
    useVolumeProfile: boolean;
    bufferPercent: number; // Safety buffer before resistance (0.3-0.5%)
    minTP2Percent: number; // Minimum TP2 distance (2.0%)
    maxTP2Percent: number; // Maximum TP2 distance (6.0%)
    minZoneStrength: number; // Minimum liquidity zone strength (0.6)
  };

  trailingStopAfterTP1: {
    enabled: boolean;
    trailingDistancePercent: number; // Trailing distance (0.5-1.0%)
    useBybitNativeTrailing: boolean; // Use Bybit API vs local tracking
  };
}

/**
 * Detected structural level (resistance/support)
 */
export interface StructureLevel {
  price: number;
  type: 'SWING_POINT' | 'LIQUIDITY_ZONE' | 'VOLUME_HVN';
  strength: number; // 0-1 confidence
  touches?: number; // For liquidity zones
  volume?: number; // For HVN levels
}

/**
 * Result of dynamic TP2 calculation
 */
export interface DynamicTPResult {
  price: number;
  percent: number;
  structureLevel: number;
  structureType: string;
  confidence: number;
  wasConstrained: boolean;
}

// ============================================================================
// PHASE 4: ORCHESTRATORS (PRIMARY LAYER)
// ============================================================================

/**
 * RiskManager - PHASE 4 PRIMARY
 * Single gatekeeper for all risk checks
 * Consolidates: DailyLimitsService, LossStreakService, MaxConcurrentRiskService, RiskBasedSizingService
 */

export interface RiskDecision {
  allowed: boolean;
  reason?: string; // Why blocked/allowed
  adjustedPositionSize?: number; // If size needs adjustment
  riskDetails?: {
    dailyPnL: number;
    dailyPnLPercent: number;
    consecutiveLosses: number;
    totalExposure: number;
    totalExposurePercent: number;
  };
}

export interface RiskStatus {
  dailyPnL: number;
  dailyPnLPercent: number;
  consecutiveLosses: number;
  lastLossTime?: number;
  totalExposure: number;
  totalExposurePercent: number;
  maxDailyLossPercent: number;
  riskHealthy: boolean;
}

export interface RiskManagerConfig {
  dailyLimits: {
    maxDailyLossPercent: number; // e.g., 5.0
    maxDailyProfitPercent?: number; // Optional: exit when profit limit reached
    emergencyStopOnLimit: boolean; // true = exit process on limit breach
  };
  lossStreak: {
    stopAfterLosses?: number; // e.g., 4 (optional)
    reductions: {
      after2Losses: number; // e.g., 0.75
      after3Losses: number; // e.g., 0.50
      after4Losses: number; // e.g., 0.25
    };
  };
  concurrentRisk: {
    enabled: boolean;
    maxPositions: number; // e.g., 3
    maxRiskPerPosition: number; // e.g., 2.0%
    maxTotalExposurePercent: number; // e.g., 5.0%
  };
  positionSizing: {
    riskPerTradePercent: number; // e.g., 1.0%
    minPositionSizeUsdt: number; // e.g., 5.0
    maxPositionSizeUsdt: number; // e.g., 100.0
    maxLeverageMultiplier: number; // e.g., 2.0
  };
}

/**
 * TrendAnalyzer - PHASE 4 PRIMARY
 * Runs FIRST in pipeline to detect global trend bias
 * Makes MarketStructureAnalyzer PRIMARY in the system
 * NOTE: TrendBias enum already defined earlier in types.ts
 */

export interface TrendAnalysis {
  bias: TrendBias; // Global trend for entire system
  strength: number; // 0-1 (how strong is the trend?)
  timeframe: string; // '1h' | '4h' | '1d'
  pattern?: string; // 'HH_HL' | 'LH_LL' | 'FLAT'
  reasoning: string[]; // Why this bias? (for logging)
  restrictedDirections: SignalDirection[]; // Blocked directions
}

/**
 * Multi-Timeframe Trend Analysis - Session 73
 * Analyzes trend across multiple timeframes (5m, 15m, 1h, 4h)
 */

/**
 * Multi-timeframe candles input data
 */
export interface MultiTimeframeData {
  candles5m: Candle[];
  candles15m: Candle[];
  candles1h: Candle[];
  candles4h: Candle[];
}

/**
 * Trend analysis for a single timeframe
 */
export interface TimeframeAnalysis {
  timeframe: string; // '5m', '15m', '1h', '4h'
  bias: TrendBias;
  strength: number; // 0-1
  swingHighsCount: number;
  swingLowsCount: number;
  pattern?: string; // 'HH_HL', 'LH_LL', 'FLAT'
}

/**
 * Combined multi-timeframe analysis result
 */
export interface MultiTimeframeAnalysis {
  byTimeframe: {
    '5m': TimeframeAnalysis;
    '15m': TimeframeAnalysis;
    '1h': TimeframeAnalysis;
    '4h': TimeframeAnalysis;
  };
  consensus: {
    primaryTrend: TrendBias;      // From 4h (longest timeframe)
    currentTrend: TrendBias;      // From 1h (immediate)
    entryTrend: TrendBias;        // From 5m/15m (confirmation)
    strength: number;             // Weighted average
    alignment: 'ALIGNED' | 'CONFLICTED' | 'MIXED';
  };
}

/**
 * Comprehensive trend analysis with multi-timeframe context
 */
export interface ComprehensiveTrendAnalysis extends TrendAnalysis {
  byTimeframe?: {
    '5m': TimeframeAnalysis;
    '15m': TimeframeAnalysis;
    '1h': TimeframeAnalysis;
    '4h': TimeframeAnalysis;
  };
  multiTrendAlignment?: 'ALIGNED' | 'CONFLICTED' | 'MIXED';
  primaryTrendBias?: TrendBias; // Longer timeframe trend
  currentTrendBias?: TrendBias; // Intermediate timeframe
}

/**
 * EntryOrchestrator - PHASE 4 PRIMARY (Week 2)
 * Single entry decision point
 * Consolidates: EntryScanner, FastEntryService, EntryConfirmationManager, StrategyCoordinator
 */

export interface EntryOrchestratorDecision {
  decision: EntryDecision;
  signal?: Signal;
  reason: string;
  riskAssessment?: RiskDecision;
}

/**
 * ExitOrchestrator - PHASE 4 PRIMARY (Week 3)
 * State machine for position exits
 * Consolidates: TakeProfitManager, SmartBreakeven, SmartTrailing, AdaptiveTP3
 */

export interface PositionExitAction {
  action: ExitAction;
  percent?: number; // For CLOSE_PERCENT
  newStopLoss?: number; // For UPDATE_SL, MOVE_SL_TO_BREAKEVEN
  trailingDistance?: number; // For ACTIVATE_TRAILING
}

export interface ExitOrchestratorResult {
  newState: PositionState;
  actions: PositionExitAction[];
  stateTransition: string; // e.g., "OPEN → TP1_HIT" for logging
}

/**
 * Trading Orchestrator Configuration
 * Centralized config for all trading logic, strategies, and filters
 */
export interface OrchestratorConfig {
  // Context config (PRIMARY)
  contextConfig: {
    atrPeriod: number;
    emaPeriod: number;
    zigzagDepth: number;
    minimumATR: number;
    maximumATR: number;
    maxEmaDistance: number;
    filteringMode: ContextFilteringMode;
    atrFilterEnabled: boolean;
  };
  // Entry config (ENTRY)
  entryConfig: {
    rsiPeriod: number;
    fastEmaPeriod: number;
    slowEmaPeriod: number;
    zigzagDepth: number;
    rsiOversold: number;
    rsiOverbought: number;
    stopLossPercent: number;
    takeProfits: Array<{ level: number; percent: number; sizePercent: number }>;
    priceAction?: {
      enabled: boolean;
      requireLiquiditySweep?: boolean;
      divergenceBoost?: number;
      chochBoost?: number;
      liquiditySweepBoost?: number;
    };
    divergenceDetector: {
      minStrength: number;
      priceDiffPercent: number;
    };
  };
  // Strategies config (NEW - no more magic numbers!)
  strategiesConfig?: StrategiesConfig;
  // Position config
  positionSizeUsdt: number;
  leverage: number;
  // BTC confirmation config
  btcConfirmation?: BTCConfirmationConfig;
  // Whale hunter config
  whaleHunter?: WhaleHunterConfig;
  levelBased?: Config;
  whaleHunterFollow?: WhaleHunterConfig;
  scalpingMicroWall?: ScalpingMicroWallConfig;
  scalpingLimitOrder?: ScalpingLimitOrderConfig;
  scalpingLadderTp?: ScalpingLadderTpConfig;
  scalpingTickDelta?: ScalpingTickDeltaConfig;
  scalpingOrderFlow?: ScalpingOrderFlowConfig;
  fractalBreakoutRetest?: any; // FractalStrategyConfig
  marketHealth?: any; // MarketHealthConfig
  // Funding rate filter config
  fundingRateFilter?: FundingRateFilterConfig;
  // Session-based SL config
  sessionBasedSL?: SessionBasedSLConfig;
  // Flat market detection config
  flatMarketDetection?: FlatMarketConfig;
  // Trend confirmation filter config (secondary signal validation)
  trendConfirmation?: TrendConfirmationConfig;
  // Indicators config (for Stochastic and Bollinger Bands)
  indicators?: IndicatorsConfig;
  // Analyzers config (for all registered analyzers)
  analyzers?: Record<string, any>;
  // Phase 1: Smart Entry & Breakeven config
  fastEntry?: FastEntryConfig;
  smartBreakeven?: SmartBreakevenConfig;
  retestEntry?: RetestConfig;
  // Phase 2: Weight Matrix config
  weightMatrix?: WeightMatrixConfig;
  // Phase 4: Market Data Enhancement config
  delta?: DeltaConfig;
  orderbookImbalance?: OrderbookImbalanceConfig;
  volumeProfile?: VolumeProfileConfig;
  // Phase 5: Risk Management config
  dailyLimits?: DailyLimitsConfig;
  riskBasedSizing?: RiskBasedSizingConfig;
  lossStreak?: LossStreakConfig;
  // Volatility Regime config (auto-switch params based on ATR)
  volatilityRegime?: VolatilityRegimeConfig;
  // System config
  system: {
    timeSyncIntervalMs: number;
    timeSyncMaxFailures: number;
  };
  // EntryScanner fallback (default: true for backward compatibility)
  enableEntryScannerFallback?: boolean;
  // Analyzer weights for weighted voting system (config-driven enabling/disabling)
  strategicWeights?: any;
  // Analysis configuration (pattern detectors, market structure, flat market, liquidity)
  analysisConfig?: any; // Flexible analysis config for all analyzer needs
  // PHASE 4: RiskManager configuration
  riskManager?: RiskManagerConfig;
  // Full riskManagement config (for exit services)
  riskManagement?: RiskManagementConfig;
  // Config-driven feature flags (Week 11)
  features?: {
    chartPattern?: {
      enabled: boolean;
    };
    distanceToLevel?: {
      enabled: boolean;
    };
    btcCorrelation?: {
      enabled: boolean;
    };
    flatMarketScore?: {
      enabled: boolean;
      atrThreshold?: number;
    };
  };
}
