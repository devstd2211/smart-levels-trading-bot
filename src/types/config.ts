/**
 * Edison Trading Bot - Configuration Interfaces
 * Simple config interfaces with primitive types and enums only
 */

import { LogLevel, OrderType, StopLossType } from './enums';

// ============================================================================
// SYSTEM & LOGGING CONFIGS
// ============================================================================

/**
 * Logging configuration
 */
export interface LoggingConfig {
  level: LogLevel;
  logToFile: boolean;
  logDir: string;
}

/**
 * System configuration
 */
export interface SystemConfig {
  timeSyncIntervalMs: number; // Time sync interval (e.g., 300000 = 5 minutes)
  timeSyncMaxFailures: number; // Max time sync failures before critical error
}

/**
 * Telegram notification configuration
 */
export interface TelegramConfig {
  enabled: boolean;
  botToken?: string;
  chatId?: string;
}

// ============================================================================
// EXCHANGE & TRADING CONFIGS
// ============================================================================

/**
 * Timeframe configuration for multi-timeframe analysis
 */
export interface TimeframeConfig {
  interval: string; // Bybit interval format (e.g., "1", "5", "30", "60", "240")
  candleLimit: number; // Number of candles to keep in cache
  enabled: boolean; // Whether this timeframe is active
}

/**
 * Exchange configuration
 */
export interface ExchangeConfig {
  name: string;
  symbol: string;
  timeframe: string;
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
  demo: boolean;
}

/**
 * Trading configuration
 */
export interface TradingConfig {
  leverage: number;
  riskPercent: number;
  maxPositions: number;
  positionSizeUsdt?: number; // Optional: position size in USDT for testing
  tradingCycleIntervalMs: number;
  orderType: OrderType;
  tradingFeeRate: number; // Trading fee rate (0.0002 = 0.02% per trade)
  favorableMovementThresholdPercent: number; // Min favorable movement % for entry validation (0.1 = 0.1%)
  forceOpenPosition?: {
    enabled: boolean;
    direction: 'LONG' | 'SHORT';
  };
}

// ============================================================================
// INDICATOR CONFIGS
// ============================================================================

/**
 * Stochastic Indicator configuration
 */
export interface StochasticConfig {
  kPeriod: number; // Stochastic %K period (default: 14)
  dPeriod: number; // Stochastic %D smoothing (default: 3)
  smooth: number; // Smoothing period (default: 3)
}

/**
 * ATR Filter configuration
 */
export interface ATRFilterConfig {
  enabled: boolean;
  period: number; // ATR calculation period (default: 14)
  minimumATR: number; // Minimum ATR % to allow trading (e.g., 0.5%)
  maximumATR: number; // Maximum ATR % to allow trading (e.g., 5.0%)
}

// ============================================================================
// TAKE PROFIT CONFIGS
// ============================================================================

/**
 * Take profit level config
 */
export interface TakeProfitConfig {
  level: number;
  percent: number;
  sizePercent: number;
}

/**
 * Smart TP3 Movement Configuration
 *
 * After TP2 hits and trailing activates, TP3 can be moved along with price
 * to capture more profit before trailing stop closes the position.
 */
export interface SmartTP3Config {
  enabled: boolean; // Enable smart TP3 movement
  tickSizePercent: number; // Move TP3 by this % when price moves (e.g., 0.5%)
  maxTicks: number; // Maximum number of ticks to move (e.g., 3 = 3 * 0.5% = 1.5%)
  cancelAfterMaxTicks: boolean; // Cancel TP3 after max ticks reached (true = close by trailing, false = let TP3 hit)
}

/**
 * BB-based Trailing Stop Configuration (BB.MD Section 3.3)
 *
 * Updates stop loss based on Bollinger Bands lower band instead of fixed percentage.
 * Trailing stop formula: newStop = bb.lower - (atr × 0.5)
 * IMPORTANT: Only moves stop UP (never down) to protect profit.
 */
export interface BBTrailingStopConfig {
  enabled: boolean; // Enable BB-based trailing stop updates
  atrMultiplier: number; // ATR buffer below BB.lower (default: MULTIPLIERS.HALF)
  updateIntervalCandles: number; // Update every N candles (default: 1 = every candle)
  minMovePercent: number; // Minimum % move required to update SL (default: 0.1% to avoid spam)
}

// ============================================================================
// DATA & MARKET CONFIGS
// ============================================================================

/**
 * Data Subscriptions Configuration
 * Explicitly defines which data sources the bot subscribes to
 */
export interface DataSubscriptionsConfig {
  candles: {
    enabled: boolean; // Subscribe to kline/candle updates
    calculateIndicators: boolean; // Calculate RSI, EMA, ATR, Stochastic, BB
  };
  orderbook: {
    enabled: boolean; // Subscribe to orderbook snapshots
    updateIntervalMs: number; // Throttle interval (default: 5000ms)
  };
  ticks: {
    enabled: boolean; // Subscribe to trade ticks (for aggressive order flow)
    calculateDelta: boolean; // Calculate buy/sell delta from ticks
  };
}

/**
 * BTC Confirmation configuration
 */
export interface BTCConfirmationConfig {
  enabled: boolean; // Enable BTC confirmation filter
  symbol: string; // BTC symbol (BTCUSDT)
  timeframe: string; // Timeframe to analyze BTC (1m)
  candleLimit: number; // Number of candles to cache (50)
  minimumMomentum: number; // Minimum momentum score (0.0-1.0)
  lookbackCandles: number; // Number of candles to analyze (10)
  requireAlignment: boolean; // Require BTC direction to match signal
  useCorrelation?: boolean; // Use correlation to adjust filter strength (default: false)
  correlationPeriod?: number; // Rolling correlation window (default: 50)
  correlationThresholds?: {
    strict: number;
    moderate: number;
    weak: number;
  };
  movesMaxWeight: number; // Max weight for consecutive moves component
  volumeMaxWeight: number; // Max weight for volume component
  movesDivisor: number; // Divisor for consecutive moves scoring
  volumeDivisor: number; // Divisor for volume ratio scoring
  // Week 13: BTC_CORRELATION analyzer configuration (soft voting system)
  analyzer?: {
    weight: number; // Voting weight (0-1, typically 0.12 for secondary influence)
    priority: number; // Analyzer priority (1-10, typically 5)
    minConfidence: number; // Minimum confidence threshold to participate (0-100)
    maxConfidence: number; // Maximum confidence cap (0-100, typically 85)
  };
}

/**
 * Order Book configuration
 */
export interface OrderBookConfig {
  enabled: boolean; // Enable order book analysis
  depth: number; // Number of levels to analyze (e.g., 50)
  wallThreshold: number; // Min % of total volume to be considered a wall
  imbalanceThreshold: number; // Min ratio to be considered bullish/bearish
  updateIntervalMs: number; // How often to fetch order book (e.g., 5000 = 5s)
  useWebSocket?: boolean; // Use WebSocket for real-time updates (optional)
}

/**
 * Volume configuration
 */
export interface VolumeConfig {
  enabled: boolean; // Enable volume analysis
  priceBuckets: number; // Number of price buckets for volume profile (50-200)
  hvnThreshold: number; // Min % of avg volume to be HVN (e.g., 1.5 = 150%)
  lvnThreshold: number; // Max % of avg volume to be LVN
  minNodeSize: number; // Min price range for node as % of total range
}

// ============================================================================
// RISK MANAGEMENT CONFIGS
// ============================================================================

/**
 * Daily Limits Configuration (PHASE 5)
 * Stops trading after hitting daily loss limit or profit target
 */
export interface DailyLimitsConfig {
  enabled: boolean;
  maxDailyLossPercent: number; // Max daily loss % (e.g., 5.0)
  maxDailyProfitPercent?: number; // Max daily profit % (optional, e.g., 5.0)
  resetTimeUTC: string; // Reset time in UTC (e.g., "00:00")
  emergencyStopOnLimit: boolean; // Stop bot completely when limit hit
}

/**
 * Risk-Based Position Sizing Configuration (PHASE 5)
 * Calculates position size based on actual SL distance to risk fixed % per trade
 */
export interface RiskBasedSizingConfig {
  enabled: boolean;
  riskPerTradePercent: number; // Risk % per trade (e.g., 1.0)
  minPositionSizeUsdt: number; // Minimum position size (e.g., 10)
  maxPositionSizeUsdt: number; // Maximum position size (e.g., 1000)
  maxLeverageMultiplier: number; // Max position as multiple of account (e.g., 2.0)
}

/**
 * Loss Streak Configuration (PHASE 5)
 * Reduces position size after consecutive losses to limit drawdown
 */
export interface LossStreakConfig {
  enabled: boolean;
  reductions: {
    after2Losses: number; // Size multiplier after 2 losses (e.g., 0.75)
    after3Losses: number; // Size multiplier after 3 losses (e.g., 0.50)
    after4Losses: number; // Size multiplier after 4+ losses (e.g., 0.25)
  };
  stopAfterLosses?: number; // Stop trading after N consecutive losses (optional)
}

/**
 * Funding Rate Filter Configuration
 * Filters signals based on funding rate to avoid overheated positions.
 */
export interface FundingRateFilterConfig {
  enabled: boolean; // Enable funding rate filter
  blockLongThreshold: number; // Block LONG if funding rate > this (e.g., 0.05% = 0.0005)
  blockShortThreshold: number; // Block SHORT if funding rate < this (e.g., -0.05% = -0.0005)
  cacheTimeMs: number; // Cache funding rate for X ms (e.g., 3600000 = 1 hour)
}

/**
 * Session-based SL Widening Configuration
 * Adjusts stop loss based on trading session volatility.
 */
export interface SessionBasedSLConfig {
  enabled: boolean; // Enable session-based SL widening
  asianMultiplier: number; // SL multiplier for Asian session (e.g., 1.0 = normal)
  londonMultiplier: number; // SL multiplier for London session (e.g., 1.5 = +50%)
  nyMultiplier: number; // SL multiplier for NY session (e.g., 1.5 = +50%)
  overlapMultiplier: number; // SL multiplier for London/NY overlap (e.g., 1.8 = +80%)
}

/**
 * Flat Market Detection Configuration
 * Multi-factor system to detect ranging/neutral markets.
 */
export interface FlatMarketConfig {
  enabled: boolean; // Enable multi-factor flat market detection
  flatThreshold: number; // Confidence threshold for flat decision (0-100, e.g., 80)
  emaThreshold: number; // Max EMA distance for flat (%, e.g., 0.3)
  atrThreshold: number; // Max ATR for flat (% of price, e.g., 1.5)
  rangeThreshold: number; // Max price range for flat (%, e.g., 1.0)
  slopeThreshold: number; // Max EMA slope for flat (degrees, e.g., 5.0)
  maxEmaScore?: number; // Max points for EMA distance factor (default: 20)
  maxAtrScore?: number; // Max points for ATR volatility factor (default: 20)
  maxRangeScore?: number; // Max points for price range factor (default: 15)
  maxSlopeScore?: number; // Max points for EMA slope factor (default: 15)
  maxVolumeScore?: number; // Max points for volume distribution factor (default: 10)
}

/**
 * Liquidity Detector Configuration
 * Detects liquidity zones (support/resistance) and sweeps (false breakouts)
 */
export interface LiquidityDetectorConfig {
  fakeoutReversalPercent: number; // Reversal needed to confirm fakeout (default: 0.3 = 30%)
  recentTouchesWeight: number; // Weight for recent touches in strength calc (default: 0.5 = 50%)
  oldTouchesWeight: number; // Weight for old touches in strength calc (default: 0.3 = 30%)
}

/**
 * Market Structure Analyzer Configuration
 * Analyzes CHoCH (Change of Character) and BoS (Break of Structure) events
 */
export interface MarketStructureConfig {
  chochAlignedBoost: number; // Confidence boost when CHoCH aligns with signal (default: 1.3 = +30%)
  chochAgainstPenalty: number; // Confidence penalty when CHoCH opposes signal (default: 0.5 = -50%)
  bosAlignedBoost: number; // Confidence boost when BoS aligns with signal (default: 1.1 = +10%)
  noModification: number; // No confidence change (default: 1.0)
}

/**
 * Compound Interest Configuration
 * Automatically scales position size based on account profit.
 */
export interface CompoundInterestConfig {
  enabled: boolean; // Enable compound interest position sizing
  useVirtualBalance: boolean; // Use virtual balance from trade history instead of exchange balance
  baseDeposit: number; // Initial deposit in USDT (protected, never risked 100%)
  reinvestmentPercent: number; // % of profit to reinvest (0-100, e.g., 50)
  maxRiskPerTrade: number; // Max % of total balance per trade (0-100, e.g., 2)
  minPositionSize: number; // Min position size in USDT (e.g., 10)
  maxPositionSize: number; // Max position size in USDT (e.g., 1000)
  profitLockPercent: number; // % of profit to lock/protect (0-100, e.g., 30)
}

/**
 * Trade History Configuration
 */
export interface TradeHistoryConfig {
  enabled: boolean; // Enable permanent CSV trade history
  dataDir: string; // Directory for CSV and state files (e.g., './data')
  includeIndicators: boolean; // Include indicator values in CSV
  autoBackup: boolean; // Auto backup CSV on schema migration
}

// ============================================================================
// PHASE 3: BREAKEVEN, RETEST, TRAILING CONFIGS
// ============================================================================

/**
 * Smart Breakeven configuration
 * Pre-BE mode - only move SL when impulse confirmed
 */
export interface SmartBreakevenConfig {
  enabled: boolean;
  activationProfitPercent: number; // 0.3 (% profit to activate)
  breakevenProfitPercent: number; // 0.1 (% profit when moving SL)
  requireEMAHold: boolean; // true (price must hold above/below EMA)
  emaPeriod: number; // 20
  requireVolumeConfirmation: boolean; // true
  volumeReverseMultiplier: number; // 2.0 (spike = reversal)
  maxWaitCandles: number; // 5 (max candles to wait for confirmation)
}

/**
 * Retest Entry configuration
 * Enter on Fibonacci retest after missed impulse
 */
export interface RetestConfig {
  enabled: boolean;
  minImpulsePercent: number; // 0.5 (% move to consider impulse)
  retestZoneFibStart: number; // 50 (%)
  retestZoneFibEnd: number; // 61.8 (%)
  maxRetestWaitMs: number; // 300000 (5 minutes)
  volumeMultiplier: number; // 0.8 (below average = calm)
  requireStructureIntact: boolean; // true (EMA + senior TF)
}

/**
 * Delta Analysis Configuration
 * Tracks buy/sell pressure from tick trades
 */
export interface DeltaConfig {
  enabled: boolean;
  windowSizeMs: number; // 60000 (1 min) - rolling window
  minDeltaThreshold: number; // 1000 (min delta to be "significant")
}

/**
 * Orderbook Imbalance Configuration (PHASE 4 Feature 4)
 */
export interface OrderbookImbalanceConfig {
  enabled: boolean;
  minImbalancePercent: number; // 30 (%) - min imbalance to be "significant"
  levels: number; // 10 - depth to analyze
}

/**
 * Volume Profile Configuration (PHASE 4 Feature 3)
 */
export interface VolumeProfileConfig {
  enabled: boolean;
  lookbackCandles: number; // 100 (candles to analyze)
  valueAreaPercent: number; // 70 (% of volume for value area)
  priceTickSize: number; // 0.01 (price granularity for distribution)
}

/**
 * Volume Profile Integration Config
 * Shared config for integrating VP levels into S/R detection
 */
export interface VolumeProfileIntegrationConfig {
  enabled: boolean; // Enable volume profile integration
  addVahValLevels: boolean; // Add VAH/VAL as separate S/R levels
  boostHvnMatch: boolean; // Boost strength when swing level matches HVN
  hvnMatchThresholdPercent: number; // Distance threshold for HVN match (default: 0.3%)
  hvnStrengthBoost: number; // Strength boost for HVN match (default: 0.2)
  vahValStrength: number; // Base strength for VAH/VAL levels (default: 0.7)
}

/**
 * Adaptive TP3 Configuration
 * Momentum-based TP3 extension after TP2 hit
 */
export interface AdaptiveTP3Config {
  enabled: boolean;
  baseTP3Percent: number; // 2.0 (%)
  tickSizePercent: number; // 0.5 (%)
  maxTicks: number; // 3 (max +1.5%)
  momentumThreshold: {
    volumeMultiplier: number; // 1.5
    emaAngle: number; // 0.5 (degrees)
    noReversal: boolean; // true
  };
}

/**
 * Data collection configuration
 */
export interface DataCollectionConfig {
  enabled: boolean;
  symbols: string[]; // Multiple symbols to collect data for
  timeframes: string[]; // ['1m', '5m', '15m', '30m', '1h', '4h']
  collectOrderbook: boolean;
  orderbookInterval: number; // Interval in seconds (1-5)
  collectTradeTicks: boolean;
  database: {
    path: string; // Path to SQLite database
    compression: boolean; // Mandatory compression
  };
  websocket: {
    reconnectDelay: number; // Delay before reconnect (ms)
    maxReconnectAttempts: number;
  };
}

// ============================================================================
// PHASE 5: RISK & SCALPING CONFIGS
// ============================================================================

/**
 * Max Concurrent Risk Configuration (PHASE 5)
 */
export interface MaxConcurrentRiskConfig {
  enabled: boolean;
  maxTotalExposurePercent: number; // 5.0 (% of balance)
  maxPositions: number; // 3 (max concurrent positions)
  maxRiskPerPosition: number; // 2.0 (% of balance per position)
}

/**
 * Micro Wall Detector Configuration (Phase 1)
 * Detects small orderbook walls (5-10% of total volume) for scalping
 */
export interface MicroWallDetectorConfig {
  minWallSizePercent: number; // Min wall size as % of orderbook (e.g., 5-10%)
  breakConfirmationMs: number; // Time to confirm wall break (e.g., 1000ms)
  maxConfidence: number; // Max confidence % for micro wall (e.g., 75)
  wallExpiryMs: number; // Wall expiry time (e.g., 60000ms = 1min)
}

/**
 * Limit Order Executor Configuration (Phase 2)
 * Configuration for limit order execution with fallback to market orders
 */
export interface LimitOrderExecutorConfig {
  enabled: boolean; // Enable limit order execution
  timeoutMs: number; // Max wait time for limit order fill (e.g., 5000ms)
  slippagePercent: number; // Price slippage for limit order (e.g., 0.02 = 0.02%)
  fallbackToMarket: boolean; // Fallback to market order if limit not filled
  maxRetries: number; // Max retries for limit order placement (e.g., 1)
}

/**
 * Ladder TP Manager Configuration (Phase 3)
 * Multi-level take profit execution with breakeven and trailing
 */
export interface LadderTpManagerConfig {
  levels: Array<{
    pricePercent: number; // Distance from entry % (e.g., 0.08)
    closePercent: number; // Position % to close (e.g., 33)
  }>;
  moveToBreakevenAfterTP1: boolean; // Move SL to entry after TP1 hit
  trailingAfterTP2: boolean; // Enable trailing SL after TP2 hit
  trailingDistancePercent: number; // Trailing distance % (e.g., 0.05 = 0.05%)
  minPartialClosePercent: number; // Min % to close (avoid too small closes, default: 10)
  maxPartialClosePercent: number; // Max % to close (avoid closing full position, default: 90)
}

/**
 * Tick Delta Analyzer Configuration (Phase 4)
 * Analyzes buy/sell tick delta for momentum detection
 */
export interface TickDeltaAnalyzerConfig {
  minDeltaRatio: number; // Min buy/sell ratio to detect momentum (e.g., 2.0 = 2x)
  detectionWindow: number; // Time window for delta calculation (ms, e.g., 5000)
  minTickCount: number; // Min ticks required in window (e.g., 20)
  minVolumeUSDT: number; // Min volume required (USDT, e.g., 1000)
  maxConfidence: number; // Max confidence score (0-100, e.g., 85)
}

/**
 * Order Flow Analyzer Configuration
 */
export interface OrderFlowAnalyzerConfig {
  aggressiveBuyThreshold: number; // Min ratio for aggressive buy (e.g., 3.0)
  detectionWindow: number; // Time window for analysis (ms, e.g., 3000)
  minVolumeUSDT: number; // Min volume to trigger (USDT, e.g., 5000)
  maxConfidence: number; // Max confidence cap (0-100, e.g., 90)
}

// ============================================================================
// INDICATORS & PATTERNS
// ============================================================================

/**
 * Indicators configuration
 */
export interface IndicatorsConfig {
  rsiPeriod: number; // RSI period (14)
  rsiOversold: number; // RSI oversold threshold (30)
  rsiOverbought: number; // RSI overbought threshold (70)
  fastEmaPeriod: number; // Fast EMA period (20)
  slowEmaPeriod: number; // Slow EMA period (50)
  zigzagDepth: number; // ZigZag depth parameter (12)
  zigzagDeviation: number; // ZigZag deviation % (5)
  atrPeriod: number; // ATR period (14)
  stochastic?: {
    enabled: boolean;
    kPeriod: number;
    dPeriod: number;
    smooth: number;
    oversoldThreshold: number;
    overboughtThreshold: number;
  };
  bollingerBands?: {
    enabled: boolean;
    period: number;
    stdDev: number;
    adaptiveParams: boolean;
    squeezeThreshold: number;
  };
}

/**
 * Pattern Analyzer Configuration
 * Defines which chart patterns to detect and their confidence boosts
 */
export interface PatternAnalyzerConfig {
  enableChartPatterns?: boolean;
  enableEngulfingPattern?: boolean;
  enableTriplePattern?: boolean;
  enableTrianglePattern?: boolean;
  enableWedgePattern?: boolean;
  enableFlagPattern?: boolean;
  chartPatternBoost?: number;
  engulfingBoost?: number;
  tripleBoost?: number;
  triangleBoost?: number;
  wedgeBoost?: number;
  flagBoost?: number;
}

/**
 * Sweep detector configuration
 */
export interface SweepDetectorConfig {
  enabled: boolean;
  minWickPercent: number;
  minRecoveryPercent: number;
  volumeSpikeMultiplier: number;
  lookbackCandles: number;
  maxSweepAgeCandles: number;
  trailSlOnSweep: boolean;
  trailSlBufferPercent: number;
}

/**
 * Fast Entry configuration
 * Allows partial entry before candle close
 */
export interface FastEntryConfig {
  enabled: boolean;
  partialSizePercent: number;
  minBodyPercent: number;
  volumeMultiplier: number;
  requireSeniorTFAlignment: boolean;
  confirmTimeout: number;
}

/**
 * Wall Tracking Configuration (PHASE 4)
 */
export interface WallTrackingConfig {
  enabled: boolean;
  minLifetimeMs: number;
  spoofingThresholdMs: number;
  trackHistoryCount: number;
}

/**
 * Footprint configuration
 */
export interface FootprintConfig {
  enabled: boolean;
  tickLevels: number;
  minImbalanceRatio: number;
  minVolumeForImbalance: number;
  aggressionBoostMultiplier: number;
  aggressionPenaltyMultiplier: number;
}

/**
 * Order Block Configuration
 */
export interface OrderBlockConfig {
  enabled: boolean;
  minBreakoutPercent: number;
  minVolumeRatio: number;
  maxBlockAge: number;
  maxDistancePercent: number;
  confidenceBoost: number;
  retestBoostMultiplier: number;
}

/**
 * FVG Configuration
 */
export interface FVGConfig {
  enabled: boolean;
  minGapPercent: number;
  maxGapAge: number;
  fillThreshold: number;
  maxDistancePercent: number;
  fillExpectationBoost: number;
}

/**
 * Fractal detection configuration
 */
export interface FractalConfig {
  enabled: boolean;
  minFractalStrength: number;
  useAsFilter: boolean;
  confidenceBoost: number;
}

// ============================================================================
// PHASE 7: ENTRY & EXIT CONFIGS
// ============================================================================

/**
 * Entry Confirmation Config
 * Configures candle close confirmation for LONG and SHORT entries
 */
export interface EntryConfirmationConfig {
  long: {
    enabled: boolean; // Enable confirmation for LONG entries
    expirySeconds: number; // Expiry timeout in seconds (default: 120)
    tolerancePercent?: number; // Tolerance for close exactly at level (default: 0.05%)
    minBouncePercent?: number; // Minimum bounce from level required (default: 0, e.g. 0.05 = 0.05%)
  };
  short: {
    enabled: boolean; // Enable confirmation for SHORT entries
    expirySeconds: number; // Expiry timeout in seconds (default: 120)
    tolerancePercent?: number; // Tolerance for close exactly at level (default: 0.05%)
    minBouncePercent?: number; // Minimum bounce from level required (default: 0, e.g. 0.05 = 0.05%)
  };
}

/**
 * SMC Microstructure Analyzers Configuration
 * Fair Value Gap, Order Block, and Footprint detection settings
 */
export interface SMCMicrostructureConfig {
  fairValueGap?: {
    enabled: boolean;
    minGapPercent: number; // Minimum gap size as % of price (e.g., 0.2 = 0.2%)
    maxConfidence: number; // Maximum confidence cap (0-100)
  };
  orderBlock?: {
    enabled: boolean;
    minBodyToWickRatio: number; // Minimum ratio of body to wick (e.g., 2.5)
    minBodyPercent: number; // Minimum candle body size as % (e.g., 0.3 = 0.3%)
    maxConfidence: number; // Maximum confidence cap (0-100)
  };
  footprint?: {
    enabled: boolean;
    minClosePositionPercent: number; // Close position threshold (e.g., 70 = top 70%)
    minBodyToRangeRatio: number; // Minimum body to total range (e.g., 0.6)
    maxConfidence: number; // Maximum confidence cap (0-100)
  };
}

/**
 * Dynamic TP Configuration
 *
 * Adjusts TP levels based on market conditions:
 * - Whale wall size (>20% → wider TP, expect strong movement)
 * - ATR volatility (high ATR → wider TP, avoid premature exits)
 */
export interface DynamicTPConfig {
  enabled: boolean; // Enable dynamic TP adjustment
  maxTPPercent?: number; // Optional: Max TP % cap (e.g., 1.0 = MULTIPLIERS.NEUTRAL% max regardless of multipliers)
  wallSizeBased: {
    enabled: boolean; // Adjust TP based on whale wall size
    threshold: number; // Min wall size % to trigger (e.g., 20%)
    multiplier: number; // TP multiplier when threshold met (e.g., 1.3x)
  };
  atrBased: {
    enabled: boolean; // Adjust TP based on ATR volatility
    threshold: number; // Min ATR % to trigger (e.g., 2.0%)
    multiplier: number; // TP multiplier when threshold met (e.g., 1.2x)
  };
}

/**
 * Timeframe Alignment Configuration (PHASE 6)
 *
 * Scores signal strength based on multi-timeframe indicator alignment.
 * Example: LONG signal gets higher confidence if price is above EMAs on all timeframes.
 *
 * Scoring System:
 * - Entry TF (M1): price > EMA20 → +20 points
 * - Primary TF (M5): price > EMA20 → +30, price > EMA50 → +20
 * - Trend1 TF (M30): EMA20 > EMA50 → +30 points
 * Total: 0-100 points. If score >= minAlignmentScore → higher confidence.
 */
export interface TFAlignmentConfig {
  enabled: boolean; // Enable TF alignment scoring
  timeframes: {
    entry: { weight: number }; // Weight for entry TF (e.g., 20)
    primary: { weight: number }; // Weight for primary TF (e.g., 50)
    trend1: { weight: number }; // Weight for trend1 TF (e.g., 30)
  };
  minAlignmentScore: number; // Min score for "aligned" (0-100, e.g., 70)
}

/**
 * Smart Trailing Stop v2 Configuration
 * Impulse-based trailing with multiple activation triggers
 */
export interface SmartTrailingConfig {
  enabled: boolean;
  activateOnTP2: boolean; // true (current behavior)
  activateOnImpulse: boolean; // true (NEW)
  impulseThreshold: {
    minProfitPercent: number; // 0.7 (%)
    requireEMAHold: boolean; // true
    emaAngleThreshold: number; // 0.5 (degrees)
    requireVolume: boolean; // true
  };
  trailingMode: 'EMA' | 'ATR'; // 'EMA'
  emaDistance: number; // 0.15 (%)
  atrMultiplier: number; // 0.5
  minDistancePercent: number; // 0.1 (%)
  updateInterval: number; // 5000 (ms) - how often to update
}

// ============================================================================
// PHASE 8: WEIGHT & VALIDATION CONFIGS
// ============================================================================

/**
 * Weight System Configuration (Phase 3)
 * Replaces hard blocks with gradient weights for better signal quality
 */
export interface WeightSystemConfig {
  enabled: boolean; // Master switch for weight system
  rsiWeights: {
    enabled: boolean;
    extremeBonus: number; // RSI < 20 or > 80: +20%
    strongBonus: number; // RSI 20-30 or 70-80: +15%
    moderateBonus: number; // RSI 30-40 or 60-70: +10%
    neutralZoneMin: number; // Neutral zone start (40)
    neutralZoneMax: number; // Neutral zone end (60)
    slightPenalty: number; // Opposite zone light: -5%
    moderatePenalty: number; // Opposite zone moderate: -10%
    strongPenalty: number; // Opposite zone strong: -15%
  };
  volumeWeights: {
    enabled: boolean;
    veryHighBonus: number; // Volume > 2x: +10%
    highBonus: number; // Volume 1.5-2x: +5%
    lowPenalty: number; // Volume 0.5-0.8x: -5%
    veryLowPenalty: number; // Volume < 0.5x: -10%
  };
  levelStrengthWeights: {
    enabled: boolean;
    strongLevelBonus: number; // 3+ touches: +40%
    mediumLevelBonus: number; // 2 touches: +20%
    minTouchesForStrong: number; // Min touches for strong (3)
    minTouchesForMedium: number; // Min touches for medium (2)
  };
}

/**
 * Trend confirmation filter configuration
 */
export interface TrendConfirmationConfig {
  enabled: boolean;
  requirePrimaryAlignment: boolean; // PRIMARY must match entry direction
  requireTrend1Alignment: boolean; // TREND1 must match (optional)
  alignmentScoreThreshold: number; // Min score to consider aligned (0-100)
  confidenceBoost: number; // % boost to confidence if aligned
  weights: {
    primary: number; // Weight for PRIMARY TF (e.g., 0.4)
    trend1: number; // Weight for TREND1 TF (e.g., 0.35)
    trend2: number; // Weight for TREND2 TF (e.g., 0.25)
  };
  // Variant C: Conditional filtering with thresholds
  criticalMisalignmentScore?: number; // Score below this → BLOCK signal (default: 30)
  warningMisalignmentScore?: number; // Score below this → REDUCE confidence (default: 60)
  filterMode?: 'DISABLED' | 'CONDITIONAL' | 'STRICT'; // default: CONDITIONAL
}

/**
 * Configuration for pattern validation system
 */
export interface PatternValidationConfig {
  enabled: boolean;
  dataSource: 'BACKTEST' | 'LIVE' | 'BOTH';
  minSampleSize: number; // Min occurrences per split (default: 30)
  backtestPeriodDays: number; // Historical period (default: 90)

  // Walk-forward validation split
  trainTestSplit: {
    trainPercent: number; // default: 70
    testPercent: number; // default: 30
  };

  // Statistical thresholds
  thresholds: {
    minWinRate: number; // Min WR on TRAIN (default: 50)
    minTestWinRate: number; // Min WR on TEST (default: 45, more conservative)
    minExpectancy: number; // Min expectancy (default: 0)
    criticalWinRate: number; // Below this = auto-disable (default: 40)
    minPValue: number; // Chi-square test threshold (default: 0.05)
    maxOverfittingGap: number; // Max |trainWR - testWR| before warning (default: 10)
  };

  // Retraining schedule
  autoValidationInterval: 'DAILY' | 'WEEKLY' | 'MANUAL'; // default: WEEKLY
  autoDisableDegraded: boolean; // default: true
  autoAdjustWeights: boolean; // default: true

  // Multi-timeframe analysis
  timeframes: string[]; // ['1m', '5m', '15m']
  includeBtcContext: boolean;
}
