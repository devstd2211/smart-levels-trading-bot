/**
 * STRATEGY CONFIG TYPES
 * Strict type definitions for JSON-based trading strategy configuration
 *
 * NO ANY TYPES - All types explicitly defined
 * FAIL FAST - Invalid strategy causes immediate error
 *
 * Strategy Configuration allows users to:
 * 1. Select which analyzers to use
 * 2. Define weights for each analyzer
 * 3. Override indicator/filter parameters
 * 4. Override risk management settings
 * 5. Enable/disable components without code changes
 */

// ============================================================================
// STRATEGY ROOT
// ============================================================================

export interface StrategyConfig {
  version: number;
  metadata: StrategyMetadata;
  analyzers: StrategyAnalyzerConfig[];
  indicators?: IndicatorOverrides;
  filters?: FilterOverrides;
  riskManagement?: RiskManagementOverrides;
  notes?: string;
}

// ============================================================================
// METADATA
// ============================================================================

export interface StrategyMetadata {
  name: string;
  version: string;
  description: string;
  author?: string;
  createdAt: string;
  lastModified: string;
  tags: string[];
  backtest?: StrategyBacktestResults;
}

export interface StrategyBacktestResults {
  winRate: number;
  profitFactor: number;
  trades: number;
  period: string;
}

// ============================================================================
// ANALYZERS
// ============================================================================

export interface StrategyAnalyzerConfig {
  name: string;
  enabled: boolean;
  weight: number;
  priority: number;
  minConfidence?: number;
  maxConfidence?: number;
  params?: Record<string, string | number | boolean>;
}

// List of all available analyzers (for validation)
export type AvailableAnalyzer =
  // Technical Indicators
  | 'EMA_ANALYZER_NEW'
  | 'RSI_ANALYZER_NEW'
  | 'ATR_ANALYZER_NEW'
  | 'VOLUME_ANALYZER_NEW'
  | 'STOCHASTIC_ANALYZER_NEW'
  | 'BOLLINGER_BANDS_ANALYZER_NEW'
  // Advanced Analysis
  | 'DIVERGENCE_ANALYZER_NEW'
  | 'BREAKOUT_ANALYZER_NEW'
  | 'WICK_ANALYZER_NEW'
  | 'PRICE_MOMENTUM_ANALYZER_NEW'
  // Structure Analysis
  | 'TREND_DETECTOR_ANALYZER_NEW'
  | 'SWING_ANALYZER_NEW'
  | 'LEVEL_ANALYZER_NEW'
  | 'CHOCH_BOS_ANALYZER_NEW'
  // Liquidity & Smart Money
  | 'LIQUIDITY_SWEEP_ANALYZER_NEW'
  | 'LIQUIDITY_ZONE_ANALYZER_NEW'
  | 'ORDER_BLOCK_ANALYZER_NEW'
  | 'FAIR_VALUE_GAP_ANALYZER_NEW'
  | 'VOLUME_PROFILE_ANALYZER_NEW'
  | 'ORDER_FLOW_ANALYZER_NEW'
  | 'FOOTPRINT_ANALYZER_NEW'
  | 'WHALE_ANALYZER_NEW'
  // Micro-Level Analysis
  | 'MICRO_WALL_ANALYZER_NEW'
  | 'DELTA_ANALYZER_NEW'
  | 'TICK_DELTA_ANALYZER_NEW'
  | 'PRICE_ACTION_ANALYZER_NEW'
  // Additional
  | 'TREND_CONFLICT_ANALYZER_NEW'
  | 'WHALE_HUNTER_ANALYZER_NEW'
  | 'VOLATILITY_SPIKE_ANALYZER_NEW';

// ============================================================================
// INDICATOR OVERRIDES
// ============================================================================

export interface IndicatorOverrides {
  ema?: EmaIndicatorOverride;
  rsi?: RsiIndicatorOverride;
  atr?: AtrIndicatorOverride;
  volume?: VolumeIndicatorOverride;
  stochastic?: StochasticIndicatorOverride;
  bollingerBands?: BollingerBandsIndicatorOverride;
}

export interface EmaIndicatorOverride {
  fastPeriod?: number;
  slowPeriod?: number;
  baseConfidence?: number;
  strengthMultiplier?: number;
}

export interface RsiIndicatorOverride {
  period?: number;
  oversold?: number;
  overbought?: number;
  neutralZone?: {
    min: number;
    max: number;
  };
  extreme?: {
    low: number;
    high: number;
  };
  maxConfidence?: number;
}

export interface AtrIndicatorOverride {
  period?: number;
  minimumATR?: number;
  maximumATR?: number;
}

export interface VolumeIndicatorOverride {
  period?: number;
  volumeMultiplier?: number;
}

export interface StochasticIndicatorOverride {
  kPeriod?: number;
  dPeriod?: number;
  oversold?: number;
  overbought?: number;
}

export interface BollingerBandsIndicatorOverride {
  period?: number;
  stdDev?: number;
}

// ============================================================================
// FILTER OVERRIDES
// ============================================================================

export interface FilterOverrides {
  blindZone?: BlindZoneFilterOverride;
  btcCorrelation?: BtcCorrelationFilterOverride;
  nightTrading?: NightTradingFilterOverride;
  atr?: AtrFilterOverride;
  volatilityRegime?: VolatilityRegimeFilterOverride;
}

export interface BlindZoneFilterOverride {
  minSignalsForLong?: number;
  minSignalsForShort?: number;
  longPenalty?: number;
  shortPenalty?: number;
}

export interface BtcCorrelationFilterOverride {
  enabled?: boolean;
  thresholds?: {
    weak?: number;
    moderate?: number;
    strict?: number;
  };
}

export interface NightTradingFilterOverride {
  enabled?: boolean;
  utcStartHour?: number;
  utcEndHour?: number;
  confidencePenalty?: number;
}

export interface AtrFilterOverride {
  enabled?: boolean;
  period?: number;
  minimumATR?: number;
  maximumATR?: number;
}

export interface VolatilityRegimeFilterOverride {
  enabled?: boolean;
  thresholds?: {
    lowAtrPercent?: number;
    highAtrPercent?: number;
  };
}

// ============================================================================
// RISK MANAGEMENT OVERRIDES
// ============================================================================

export interface RiskManagementOverrides {
  stopLoss?: StopLossOverride;
  takeProfits?: TakeProfitOverride[];
  trailing?: TrailingStopOverride;
  breakeven?: BreakevenOverride;
  timeBasedExit?: TimeBasedExitOverride;
}

export interface StopLossOverride {
  percent?: number;
  atrMultiplier?: number;
  minDistancePercent?: number;
}

export interface TakeProfitOverride {
  level: number;
  percent?: number;
  sizePercent?: number;
}

export interface TrailingStopOverride {
  enabled?: boolean;
  percent?: number;
  activationLevel?: number;
}

export interface BreakevenOverride {
  enabled?: boolean;
  offsetPercent?: number;
}

export interface TimeBasedExitOverride {
  enabled?: boolean;
  maxHoldTimeMinutes?: number;
}

// ============================================================================
// VALIDATION ERRORS
// ============================================================================

export class StrategyValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
  ) {
    super(message);
    this.name = 'StrategyValidationError';
  }
}

// ============================================================================
// ANALYZER REGISTRY COMPATIBILITY
// ============================================================================

export interface StrategyAnalyzerFilter {
  enabledAnalyzers: StrategyAnalyzerConfig[];
  weightsMap: Map<string, number>;
  priorityMap: Map<string, number>;
}
