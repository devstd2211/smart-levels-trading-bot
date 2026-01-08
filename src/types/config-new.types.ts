/**
 * CONFIG-NEW TYPES
 * Comprehensive, strict type definitions for the entire configuration structure
 *
 * NO ANY TYPES - All types explicitly defined
 * FAIL FAST - Missing config values cause runtime errors
 *
 * Integration strategy:
 * 1. First: Define all types with required fields
 * 2. Then: Implement one indicator/analyzer at a time with tests
 * 3. Replace old types gradually
 * 4. Final: Delete old config types when all migration complete
 */

// ============================================================================
// ROOT CONFIG
// ============================================================================

export interface ConfigNew {
  version: number;
  meta: ConfigMetaNew;
  exchange: ExchangeConfigNew;
  trading: TradingConfigNew;
  riskManagement: RiskManagementConfigNew;
  timeframes: TimeframesConfigNew;
  indicators: IndicatorsConfigNew;
  analyzers: AnalyzersConfigNew;
  filters: FiltersConfigNew;
  confidence: ConfidenceConfigNew;
  strategies: StrategiesConfigNew;
  services: ServicesConfigNew;
  monitoring: MonitoringConfigNew;
}

// ============================================================================
// METADATA
// ============================================================================

export interface ConfigMetaNew {
  description: string;
  lastUpdated: string;
  activeAnalyzers: string[];
  notes?: string;
}

// ============================================================================
// EXCHANGE
// ============================================================================

export interface ExchangeConfigNew {
  name: string;
  symbol: string;
  demo: boolean;
  testnet: boolean;
  apiKey: string;
  apiSecret: string;
}

// ============================================================================
// TRADING
// ============================================================================

export interface TradingConfigNew {
  leverage: number;
  positionSizeUsdt: number;
  maxPositions: number;
  orderType: 'MARKET' | 'LIMIT';
  tradingCycleIntervalMs: number;
  favorableMovementThresholdPercent: number;
}

// ============================================================================
// RISK MANAGEMENT
// ============================================================================

export interface RiskManagementConfigNew {
  stopLoss: StopLossConfigNew;
  takeProfits: TakeProfitLevelNew[];
  trailing: TrailingStopConfigNew;
  breakeven: BreakevenConfigNew;
  timeBasedExit: TimeBasedExitConfigNew;
}

export interface StopLossConfigNew {
  percent: number;
  atrMultiplier: number;
  minDistancePercent: number;
}

export interface TakeProfitLevelNew {
  level: number;
  percent: number;
  sizePercent: number;
}

export interface TrailingStopConfigNew {
  enabled: boolean;
  percent: number;
  activationLevel: number;
}

export interface BreakevenConfigNew {
  enabled: boolean;
  offsetPercent: number;
}

export interface TimeBasedExitConfigNew {
  enabled: boolean;
}

// ============================================================================
// TIMEFRAMES
// ============================================================================

export interface TimeframesConfigNew {
  entry: TimeframeConfigNew;
  primary: TimeframeConfigNew;
  trend1: TimeframeConfigNew;
  trend2: TimeframeConfigNew;
  context: TimeframeConfigNew;
}

export interface TimeframeConfigNew {
  interval: string;
  candleLimit: number;
  enabled: boolean;
}

// ============================================================================
// INDICATORS - STRICT TYPES
// ============================================================================

export interface IndicatorsConfigNew {
  ema: EmaIndicatorConfigNew;
  rsi: RsiIndicatorConfigNew;
  atr: AtrIndicatorConfigNew;
  volume: VolumeIndicatorConfigNew;
  stochastic: StochasticIndicatorConfigNew;
  bollingerBands: BollingerBandsConfigNew;
}

// ===== EMA INDICATOR =====
export interface EmaIndicatorConfigNew {
  enabled: boolean;
  fastPeriod: number;
  slowPeriod: number;
  baseConfidence: number;
  strengthMultiplier: number;
}

// ===== RSI INDICATOR =====
export interface RsiIndicatorConfigNew {
  enabled: boolean;
  period: number;
  oversold: number;
  overbought: number;
  extreme: RsiExtremeNew;
  neutralZone: RsiNeutralZoneNew;
  maxConfidence: number;
}

export interface RsiExtremeNew {
  low: number;
  high: number;
}

export interface RsiNeutralZoneNew {
  min: number;
  max: number;
}

// ===== ATR INDICATOR =====
export interface AtrIndicatorConfigNew {
  enabled: boolean;
  period: number;
  minimumATR: number;
  maximumATR: number;
}

// ===== VOLUME INDICATOR =====
export interface VolumeIndicatorConfigNew {
  enabled: boolean;
  period: number;
}

// ===== STOCHASTIC INDICATOR =====
export interface StochasticIndicatorConfigNew {
  enabled: boolean;
  kPeriod: number;
  dPeriod: number;
}

// ===== BOLLINGER BANDS INDICATOR =====
export interface BollingerBandsConfigNew {
  enabled: boolean;
  period: number;
  stdDev: number;
}

// ============================================================================
// ANALYZERS - STRICT TYPES
// ============================================================================

export interface AnalyzersConfigNew {
  // TECHNICAL INDICATORS (6)
  ema: EmaAnalyzerConfigNew;
  rsi: RsiAnalyzerConfigNew;
  atr: AtrAnalyzerConfigNew;
  volume: VolumeAnalyzerConfigNew;
  stochastic: StochasticAnalyzerConfigNew;
  bollingerBands: BollingerBandsAnalyzerConfigNew;
  // ADVANCED ANALYSIS (4)
  divergence: DivergenceAnalyzerConfigNew;
  breakout: BreakoutAnalyzerConfigNew;
  wick: WickAnalyzerConfigNew;
  priceMomentum: PriceMomentumAnalyzerConfigNew;
  // STRUCTURE ANALYSIS (4)
  trendDetector: TrendDetectorConfigNew;
  chochBos: ChochBosAnalyzerConfigNew;
  swing: SwingAnalyzerConfigNew;
  trendConflict: TrendConflictAnalyzerConfigNew;
  // LEVEL ANALYSIS (2)
  level: LevelAnalyzerConfigNew;
  volumeProfile: VolumeProfileAnalyzerConfigNew;
  // LIQUIDITY & SMC (8)
  liquiditySweep: LiquiditySweepAnalyzerConfigNew;
  liquidityZone: LiquidityZoneAnalyzerConfigNew;
  orderBlock: OrderBlockAnalyzerConfigNew;
  fairValueGap: FairValueGapAnalyzerConfigNew;
  footprint: FootprintAnalyzerConfigNew;
  microWall: MicroWallAnalyzerConfigNew;
  whale: WhaleAnalyzerConfigNew;
  priceAction: PriceActionAnalyzerConfigNew;
  // SCALPING (3)
  tickDelta: TickDeltaAnalyzerConfigNew;
  orderFlow: OrderFlowAnalyzerConfigNew;
  delta: DeltaAnalyzerConfigNew;
}

// ===== BASE ANALYZER CONFIG =====
export interface BaseAnalyzerConfigNew {
  enabled: boolean;
  weight: number;
  priority: number;
}

// ===== TECHNICAL INDICATORS (6) =====
export interface EmaAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  baseConfidence: number;
  strengthMultiplier: number;
  minConfidence: number;
  maxConfidence: number;
}

export interface RsiAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  period: number;
  oversold: number;
  overbought: number;
  maxConfidence: number;
}

export interface AtrAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  confidenceMultiplier: number;
  maxConfidence: number;
}

export interface VolumeAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  neutralConfidence: number;
}

export interface StochasticAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  kPeriod: number;
  dPeriod: number;
}

export interface BollingerBandsAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  period: number;
  stdDev: number;
}

// ===== ADVANCED ANALYSIS (4) =====
export interface DivergenceAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  maxConfidence: number;
}

export interface BreakoutAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  // No additional params required
}

export interface WickAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  // No additional params required
}

export interface PriceMomentumAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  minConfidence: number;
  maxConfidence: number;
}

// ===== STRUCTURE ANALYSIS (4) =====
export interface TrendDetectorConfigNew extends BaseAnalyzerConfigNew {
  minEmaGapPercent: number;
  minConfidence: number;
  maxConfidence: number;
}

export interface ChochBosAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  // No additional params required
}

export interface SwingAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  // No additional params required
}

export interface TrendConflictAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  // No additional params required
}

// ===== LEVEL ANALYSIS (2) =====
export interface LevelAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  // No additional params required
}

export interface VolumeProfileAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  // No additional params required
}

// ===== LIQUIDITY & SMC (8) =====
export interface LiquiditySweepAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  // No additional params required
}

export interface LiquidityZoneAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  // No additional params required
}

export interface OrderBlockAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  minBodyToWickRatio: number;
  minBodyPercent: number;
  baseConfidence: number;
  bodyWickMultiplier: number;
  maxConfidence: number;
}

export interface FairValueGapAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  minGapPercent: number;
  baseConfidence: number;
  percentMultiplier: number;
  maxConfidence: number;
}

export interface FootprintAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  // No additional params required
}

export interface MicroWallAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  // No additional params required
}

export interface WhaleAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  minWallPercent: number;
}

export interface PriceActionAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  // No additional params required
}

// ===== SCALPING (3) =====
export interface TickDeltaAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  // No additional params required
}

export interface OrderFlowAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  maxConfidence: number;
}

export interface DeltaAnalyzerConfigNew extends BaseAnalyzerConfigNew {
  maxConfidence: number;
}

// ============================================================================
// FILTERS - STRICT TYPES
// ============================================================================

export interface FiltersConfigNew {
  btcCorrelation: BtcCorrelationFilterConfigNew;
  nightTrading: NightTradingFilterConfigNew;
  blindZone: BlindZoneFilterConfigNew;
  entryConfirmation: EntryConfirmationFilterConfigNew;
  atr: AtrFilterConfigNew;
  volatilityRegime: VolatilityRegimeConfigNew;
}

export interface BtcCorrelationFilterConfigNew {
  enabled: boolean;
  symbol: string;
  timeframe: string;
  lookbackCandles: number;
  correlationPeriod: number;
  thresholds: CorrelationThresholdsNew;
  requirements: CorrelationRequirementsNew;
}

export interface CorrelationThresholdsNew {
  weak: number;
  moderate: number;
  strict: number;
}

export interface CorrelationRequirementsNew {
  useCorrelation: boolean;
  requireAlignment: boolean;
  momentumThreshold: number;
  minimumMomentum: number;
}

export interface NightTradingFilterConfigNew {
  enabled: boolean;
  utcStartHour: number;
  utcEndHour: number;
  confidencePenalty: number;
}

export interface BlindZoneFilterConfigNew {
  enabled: boolean;
  minSignalsForLong: number;
  minSignalsForShort: number;
  longPenalty: number;
  shortPenalty: number;
}

export interface EntryConfirmationFilterConfigNew {
  enabled: boolean;
  long: EntryConfirmationDirectionNew;
  short: EntryConfirmationDirectionNew;
}

export interface EntryConfirmationDirectionNew {
  expirySeconds: number;
  tolerancePercent: number;
}

export interface AtrFilterConfigNew {
  enabled: boolean;
  period: number;
  minimumATR: number;
  maximumATR: number;
}

export interface VolatilityRegimeConfigNew {
  enabled: boolean;
  thresholds: VolatilityThresholdsNew;
}

export interface VolatilityThresholdsNew {
  lowAtrPercent: number;
  highAtrPercent: number;
}

// ============================================================================
// CONFIDENCE
// ============================================================================

export interface ConfidenceConfigNew {
  defaults: ConfidenceThresholdNew;
  regimes: ConfidenceRegimesNew;
  voting: VotingConfigNew;
}

export interface ConfidenceThresholdNew {
  min: number;
  clampMin: number;
  clampMax: number;
}

export interface ConfidenceRegimesNew {
  LOW: ConfidenceRegimeNew;
  MEDIUM: ConfidenceRegimeNew;
  HIGH: ConfidenceRegimeNew;
}

export interface ConfidenceRegimeNew {
  confidence: ConfidenceMinNew;
  distance: DistanceMaxNew;
  touches: TouchesMinNew;
}

export interface ConfidenceMinNew {
  min: number;
}

export interface DistanceMaxNew {
  maxToLevel: number;
}

export interface TouchesMinNew {
  min: number;
}

export interface VotingConfigNew {
  signalConflictPenalty: number;
  opposingSignalPenalty: number;
  conflictRatioThreshold: number;
}

// ============================================================================
// STRATEGIES
// ============================================================================

export interface StrategiesConfigNew {
  levelBased: LevelBasedStrategyConfigNew;
}

export interface LevelBasedStrategyConfigNew {
  enabled: boolean;
  rrRatio: number;
  minConfidenceThreshold: number;
  trendAlignment: TrendAlignmentConfigNew;
  levels: LevelRequirementsConfigNew;
  longEntry: DirectionEntryConfigNew;
  shortEntry: DirectionEntryConfigNew;
}

export interface TrendAlignmentConfigNew {
  requireTrendAlignment: boolean;
  blockLongInDowntrend: boolean;
  blockShortInUptrend: boolean;
}

export interface LevelRequirementsConfigNew {
  minTouchesRequired: number;
  minTouchesForStrong: number;
  clusterThresholdPercent: number;
  maxLevelAgeCandles: number;
}

export interface DirectionEntryConfigNew {
  enabled: boolean;
  minConfidence: number;
}

// ============================================================================
// SERVICES
// ============================================================================

export interface ServicesConfigNew {
  websocket: WebSocketServiceConfigNew;
  logging: LoggingServiceConfigNew;
  dataCollection: DataCollectionServiceConfigNew;
}

export interface WebSocketServiceConfigNew {
  pingIntervalMs: number;
  reconnectDelayMs: number;
  maxReconnectAttempts: number;
  authExpiresOffsetMs: number;
}

export interface LoggingServiceConfigNew {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  toFile: boolean;
  toConsole: boolean;
}

export interface DataCollectionServiceConfigNew {
  enabled: boolean;
  symbols: string[];
  timeframes: string[];
  collectOrderbook: boolean;
  orderbookInterval: number;
  collectTradeTicks: boolean;
  database: DatabaseConfigNew;
}

export interface DatabaseConfigNew {
  path: string;
  compression: boolean;
}

// ============================================================================
// MONITORING
// ============================================================================

export interface MonitoringConfigNew {
  marketHealth: MarketHealthConfigNew;
  antiFlip: AntiFlipConfigNew;
}

export interface MarketHealthConfigNew {
  enabled: boolean;
  minWinRate: number;
  minProfitFactor: number;
  maxConsecutiveLosses: number;
  maxDrawdown: number;
}

export interface AntiFlipConfigNew {
  enabled: boolean;
  cooldownCandles: number;
  cooldownMs: number;
  requiredConfirmationCandles: number;
  overrideConfidenceThreshold: number;
  strongReversalRsiThreshold: number;
}

// ============================================================================
// TYPE GUARDS & VALIDATORS
// ============================================================================

export function isConfigNew(config: unknown): config is ConfigNew {
  if (!config || typeof config !== 'object') return false;
  const c = config as any;
  return (
    typeof c.version === 'number' &&
    typeof c.meta === 'object' &&
    typeof c.exchange === 'object' &&
    typeof c.trading === 'object' &&
    typeof c.riskManagement === 'object' &&
    typeof c.timeframes === 'object' &&
    typeof c.indicators === 'object' &&
    typeof c.analyzers === 'object' &&
    typeof c.filters === 'object' &&
    typeof c.confidence === 'object' &&
    typeof c.strategies === 'object' &&
    typeof c.services === 'object' &&
    typeof c.monitoring === 'object'
  );
}

/**
 * Validate analyzer config - ALL analyzers must have enabled, weight, priority
 * Throws error if analyzer config is invalid
 */
export function validateAnalyzerConfig(
  analyzerName: string,
  config: BaseAnalyzerConfigNew,
): void {
  if (typeof config.enabled !== 'boolean') {
    throw new Error(`[${analyzerName}] Missing required: enabled (boolean)`);
  }
  if (typeof config.weight !== 'number') {
    throw new Error(`[${analyzerName}] Missing required: weight (number)`);
  }
  if (typeof config.priority !== 'number') {
    throw new Error(`[${analyzerName}] Missing required: priority (number)`);
  }
}

/**
 * Validate indicator config - ALL indicators must have enabled field
 */
export function validateIndicatorConfig(
  indicatorName: string,
  config: { enabled: boolean },
): void {
  if (typeof config.enabled !== 'boolean') {
    throw new Error(`[${indicatorName}] Missing required: enabled (boolean)`);
  }
}
