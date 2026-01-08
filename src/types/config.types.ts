/**
 * Configuration Types - New Simplified Structure
 */

export interface BotConfig {
  version: number;
  meta: ConfigMeta;
  exchange: ExchangeConfig;
  trading: TradingConfig;
  riskManagement: RiskManagementConfig;
  timeframes: TimeframesConfig;
  indicators: IndicatorsConfig;
  analyzers: AnalyzersConfig;
  filters: FiltersConfig;
  confidence: ConfidenceConfig;
  strategies: StrategiesConfig;
  services: ServicesConfig;
  monitoring: MonitoringConfig;
}

// ============================================================================
// METADATA
// ============================================================================

export interface ConfigMeta {
  description: string;
  lastUpdated: string;
  activeAnalyzers: string[];
  notes?: string;
}

// ============================================================================
// EXCHANGE
// ============================================================================

export interface ExchangeConfig {
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

export interface TradingConfig {
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

export interface RiskManagementConfig {
  stopLoss: StopLossConfig;
  takeProfits: TakeProfitLevel[];
  trailing: TrailingStopConfig;
  breakeven: BreakevenConfig;
  timeBasedExit: TimeBasedExitConfig;
}

export interface StopLossConfig {
  percent: number;
  atrMultiplier: number;
  minDistancePercent: number;
}

export interface TakeProfitLevel {
  level: number;
  percent: number;
  sizePercent: number;
}

export interface TrailingStopConfig {
  enabled: boolean;
  percent: number;
  activationLevel: number;
}

export interface BreakevenConfig {
  enabled: boolean;
  offsetPercent: number;
}

export interface TimeBasedExitConfig {
  enabled: boolean;
}

// ============================================================================
// TIMEFRAMES
// ============================================================================

export interface TimeframesConfig {
  entry: TimeframeConfig;
  primary: TimeframeConfig;
  trend1: TimeframeConfig;
  trend2: TimeframeConfig;
  context: TimeframeConfig;
}

export interface TimeframeConfig {
  interval: string;
  candleLimit: number;
  enabled: boolean;
}

// ============================================================================
// INDICATORS
// ============================================================================

export interface IndicatorsConfig {
  ema: EmaIndicatorConfig;
  priceMomentum: PriceMomentumIndicatorConfig;
  rsi: RsiIndicatorConfig;
  atr: AtrIndicatorConfig;
  volume: VolumeIndicatorConfig;
  stochastic: StochasticIndicatorConfig;
  bollingerBands: BollingerBandsConfig;
}

export interface EmaIndicatorConfig {
  enabled: boolean;
  fastPeriod: number;
  slowPeriod: number;
  baseConfidence: number;
  strengthMultiplier: number;
}

export interface PriceMomentumIndicatorConfig {
  enabled: boolean;
  period: number;
}

export interface RsiIndicatorConfig {
  enabled: boolean;
  period: number;
  oversold: number;
  overbought: number;
  extreme: { low: number; high: number };
  neutralZone: { min: number; max: number };
  maxConfidence: number;
}

export interface AtrIndicatorConfig {
  enabled: boolean;
  period: number;
  minimumATR: number;
  maximumATR: number;
}

export interface VolumeIndicatorConfig {
  enabled: boolean;
  period: number;
}

export interface StochasticIndicatorConfig {
  enabled: boolean;
  kPeriod: number;
  dPeriod: number;
}

export interface BollingerBandsConfig {
  enabled: boolean;
  period: number;
  stdDev: number;
}

// ============================================================================
// ANALYZERS
// ============================================================================

export interface AnalyzersConfig {
  ema: AnalyzerConfig;
  priceMomentum: AnalyzerConfig;
  trendDetector: AnalyzerConfig;
  disabled: DisabledAnalyzersConfig;
}

export interface AnalyzerConfig {
  enabled: boolean;
  weight: number;
  priority: number;
  minConfidence: number;
  maxConfidence: number;
  params?: Record<string, any>;
  warning?: string;
}

export interface DisabledAnalyzersConfig {
  _comment: string;
  [key: string]: any;
}

// ============================================================================
// FILTERS
// ============================================================================

export interface FiltersConfig {
  btcCorrelation: BtcCorrelationFilterConfig;
  nightTrading: NightTradingFilterConfig;
  blindZone: BlindZoneFilterConfig;
  entryConfirmation: EntryConfirmationFilterConfig;
  atr: AtrFilterConfig;
  volatilityRegime: VolatilityRegimeConfig;
  disabled: DisabledFiltersConfig;
}

export interface BtcCorrelationFilterConfig {
  enabled: boolean;
  symbol: string;
  timeframe: string;
  lookbackCandles: number;
  correlationPeriod: number;
  thresholds: {
    weak: number;
    moderate: number;
    strict: number;
  };
  requirements: {
    useCorrelation: boolean;
    requireAlignment: boolean;
    momentumThreshold: number;
    minimumMomentum: number;
  };
}

export interface NightTradingFilterConfig {
  enabled: boolean;
  utcStartHour: number;
  utcEndHour: number;
  confidencePenalty: number;
}

export interface BlindZoneFilterConfig {
  enabled: boolean;
  minSignalsForLong: number;
  minSignalsForShort: number;
  longPenalty: number;
  shortPenalty: number;
}

export interface EntryConfirmationFilterConfig {
  enabled: boolean;
  long: { expirySeconds: number; tolerancePercent: number };
  short: { expirySeconds: number; tolerancePercent: number };
}

export interface AtrFilterConfig {
  enabled: boolean;
  period: number;
  minimumATR: number;
  maximumATR: number;
}

export interface VolatilityRegimeConfig {
  enabled: boolean;
  thresholds: {
    lowAtrPercent: number;
    highAtrPercent: number;
  };
}

export interface DisabledFiltersConfig {
  _comment: string;
  [key: string]: any;
}

// ============================================================================
// CONFIDENCE
// ============================================================================

export interface ConfidenceConfig {
  defaults: ConfidenceThreshold;
  regimes: {
    LOW: ConfidenceRegime;
    MEDIUM: ConfidenceRegime;
    HIGH: ConfidenceRegime;
  };
  voting: VotingConfig;
}

export interface ConfidenceThreshold {
  min: number;
  clampMin: number;
  clampMax: number;
}

export interface ConfidenceRegime {
  confidence: { min: number };
  distance: { maxToLevel: number };
  touches: { min: number };
}

export interface VotingConfig {
  signalConflictPenalty: number;
  opposingSignalPenalty: number;
  conflictRatioThreshold: number;
}

// ============================================================================
// STRATEGIES
// ============================================================================

export interface StrategiesConfig {
  levelBased: LevelBasedStrategyConfig;
}

export interface LevelBasedStrategyConfig {
  enabled: boolean;
  rrRatio: number;
  minConfidenceThreshold: number;
  trendAlignment: {
    requireTrendAlignment: boolean;
    blockLongInDowntrend: boolean;
    blockShortInUptrend: boolean;
  };
  levels: {
    minTouchesRequired: number;
    minTouchesForStrong: number;
    clusterThresholdPercent: number;
    maxLevelAgeCandles: number;
  };
  longEntry: { enabled: boolean; minConfidence: number };
  shortEntry: { enabled: boolean; minConfidence: number };
}

// ============================================================================
// SERVICES
// ============================================================================

export interface ServicesConfig {
  websocket: WebSocketServiceConfig;
  logging: LoggingServiceConfig;
  dataCollection: DataCollectionServiceConfig;
}

export interface WebSocketServiceConfig {
  pingIntervalMs: number;
  reconnectDelayMs: number;
  maxReconnectAttempts: number;
  authExpiresOffsetMs: number;
}

export interface LoggingServiceConfig {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  toFile: boolean;
  toConsole: boolean;
}

export interface DataCollectionServiceConfig {
  enabled: boolean;
  symbols: string[];
  timeframes: string[];
  collectOrderbook: boolean;
  orderbookInterval: number;
  collectTradeTicks: boolean;
  database: {
    path: string;
    compression: boolean;
  };
}

// ============================================================================
// MONITORING
// ============================================================================

export interface MonitoringConfig {
  marketHealth: MarketHealthConfig;
  antiFlip: AntiFlipConfig;
}

export interface MarketHealthConfig {
  enabled: boolean;
  minWinRate: number;
  minProfitFactor: number;
  maxConsecutiveLosses: number;
  maxDrawdown: number;
}

export interface AntiFlipConfig {
  enabled: boolean;
  cooldownCandles: number;
  cooldownMs: number;
  requiredConfirmationCandles: number;
  overrideConfidenceThreshold: number;
  strongReversalRsiThreshold: number;
}
