/**
 * Technical Constants
 *
 * Pure mathematical and technical values that never change.
 * These are implementation details, not configurable parameters.
 * Do NOT add trading strategy parameters here - use config.json instead.
 */

// ============================================================================
// DECIMAL PLACES & PRECISION
// ============================================================================

export const DECIMAL_PLACES = {
  /** Price decimal places for display/rounding (e.g., BTCUSDT: 0.01) */
  PRICE: 4,
  /** Quantity decimal places (e.g., 0.50 BTC) */
  QUANTITY: 2,
  /** Percentage display decimal places (e.g., 12.34%) */
  PERCENT: 2,
  /** RSI/Stochastic decimal places (e.g., 45.67) */
  RSI: 2,
  /** ATR decimal places (e.g., 123.45) */
  ATR: 2,
  /** EMA distance percentage (e.g., 0.15%) */
  EMA_DISTANCE: 2,
  /** Ratio/multiplier decimal places (e.g., 1.5234x) */
  RATIO: 4,
  /** Strength/intensity decimal places (e.g., breakout strength 0.234) */
  STRENGTH: 3,
  /** Correlation coefficient decimal places (e.g., 0.876) */
  CORRELATION: 3,
  /** Volume/volatility metrics decimal places */
  VOLATILITY: 3,
  /** Confidence display decimal places (e.g., 75.5%) */
  CONFIDENCE: 1,
} as const;

// ============================================================================
// INTEGER MULTIPLIERS (common whole number constants)
// ============================================================================

export const INTEGER_MULTIPLIERS = {
  /** 0 (zero, nothing) */
  ZERO: 0,
  /** 1 (one, single, identity) */
  ONE: 1,
  /** 2 (double, twice, half divisor) */
  TWO: 2,
  /** 3 (triple, third divisor) */
  THREE: 3,
  /** 4 (quadruple, quarter divisor) */
  FOUR: 4,
  /** 5 (quintuple, fifth divisor) */
  FIVE: 5,
  /** 6 (sextuple, sixth divisor) */
  SIX: 6,
  /** 7 (seven, common period for weeks) */
  SEVEN: 7,
  /** 8 (eight, for funding rate periods) */
  EIGHT: 8,
  /** 10 (ten times, 10% divisor) */
  TEN: 10,
  /** 12 (twelve, for pattern detection lookback) */
  TWELVE: 12,
  /** 15 (fifteen, common for timeframes) */
  FIFTEEN: 15,
  /** 20 (twenty times, 5% divisor) */
  TWENTY: 20,
  /** 24 (hours per day) */
  TWENTY_FOUR: 24,
  /** 25 (twenty-five, for pattern detection minimum bars) */
  TWENTY_FIVE: 25,
  /** 30 (thirty times, common period) */
  THIRTY: 30,
  /** 45 (forty-five, RSI oversold threshold) */
  FORTY_FIVE: 45,
  /** 50 (fifty times, 2% divisor) */
  FIFTY: 50,
  /** 55 (fifty-five, RSI overbought threshold) */
  FIFTY_FIVE: 55,
  /** 60 (sixty times, seconds/minutes) */
  SIXTY: 60,
  /** 65 (sixty-five, for pattern detector base confidence) */
  SIXTY_FIVE: 65,
  /** 70 (seventy, common threshold) */
  SEVENTY: 70,
  /** 80 (eighty, common threshold) */
  EIGHTY: 80,
  /** 100 (hundred, percentage conversion) */
  ONE_HUNDRED: 100,
  /** 180 (180 degrees, half circle) */
  ONE_HUNDRED_EIGHTY: 180,
  /** 200 (two hundred, common range) */
  TWO_HUNDRED: 200,
  /** 500 (five hundred, large threshold) */
  FIVE_HUNDRED: 500,
  /** 1000 (thousand, milliseconds conversion) */
  ONE_THOUSAND: 1000,
  /** 5000 (five thousand, large data threshold) */
  FIVE_THOUSAND: 5000,
} as const;

// ============================================================================
// TIME CONVERSIONS & PERIODS
// ============================================================================

export const TIME_MULTIPLIERS = {
  /** 1000 milliseconds = 1 second */
  MILLISECONDS_PER_SECOND: 1000,
  /** 60 seconds = 1 minute */
  SECONDS_PER_MINUTE: 60,
  /** 60 minutes = 1 hour */
  MINUTES_PER_HOUR: 60,
  /** 24 hours = 1 day */
  HOURS_PER_DAY: 24,
} as const;

// ============================================================================
// TIME INTERVALS (pre-calculated for common use cases)
// ============================================================================

export const TIME_INTERVALS = {
  /** 1 minute in milliseconds */
  MS_PER_MINUTE: TIME_MULTIPLIERS.SECONDS_PER_MINUTE * TIME_MULTIPLIERS.MILLISECONDS_PER_SECOND,
  /** 5 minutes in milliseconds (one candle period) */
  MS_PER_5_MINUTES: INTEGER_MULTIPLIERS.FIVE * TIME_MULTIPLIERS.SECONDS_PER_MINUTE * TIME_MULTIPLIERS.MILLISECONDS_PER_SECOND,
  /** 1 hour in milliseconds */
  MS_PER_HOUR: TIME_MULTIPLIERS.MINUTES_PER_HOUR * TIME_MULTIPLIERS.SECONDS_PER_MINUTE * TIME_MULTIPLIERS.MILLISECONDS_PER_SECOND,
  /** 8 hours in milliseconds (funding rate period) */
  MS_PER_8_HOURS: INTEGER_MULTIPLIERS.EIGHT * TIME_MULTIPLIERS.MINUTES_PER_HOUR * TIME_MULTIPLIERS.SECONDS_PER_MINUTE * TIME_MULTIPLIERS.MILLISECONDS_PER_SECOND,
  /** 1 day in milliseconds */
  MS_PER_DAY: TIME_MULTIPLIERS.HOURS_PER_DAY * TIME_MULTIPLIERS.MINUTES_PER_HOUR * TIME_MULTIPLIERS.SECONDS_PER_MINUTE * TIME_MULTIPLIERS.MILLISECONDS_PER_SECOND,
  /** 7 days in milliseconds (log retention period) */
  MS_PER_7_DAYS: INTEGER_MULTIPLIERS.SEVEN * TIME_MULTIPLIERS.HOURS_PER_DAY * TIME_MULTIPLIERS.MINUTES_PER_HOUR * TIME_MULTIPLIERS.SECONDS_PER_MINUTE * TIME_MULTIPLIERS.MILLISECONDS_PER_SECOND,
} as const;

// ============================================================================
// RATIO & MULTIPLIER CONSTANTS
// ============================================================================

export const RATIO_MULTIPLIERS = {
  /** 0.25 = 25% or 1:4 ratio */
  QUARTER: 0.25,
  /** 0.5 = 50% or 1:2 ratio (half) */
  HALF: 0.5,
  /** 0.75 = 75% or 3:4 ratio */
  THREE_QUARTER: 0.75,
  /** 1.0 = 100% or full value */
  FULL: 1.0,
  /** 1.1 = 10% increase */
  PLUS_10_PERCENT: 1.1,
  /** 1.2 = 20% increase */
  PLUS_20_PERCENT: 1.2,
  /** 1.5 = 50% increase */
  PLUS_50_PERCENT: 1.5,
  /** 2.0 = 100% or double */
  DOUBLE: 2.0,
} as const;

// ============================================================================
// COMMON TECHNICAL THRESHOLDS (most frequently used across analyzers)
// ============================================================================

/** Technical thresholds for indicator comparisons and filtering */
export const THRESHOLD_VALUES = {
  /** 0.005 = 0.5% (half percent, minimum breakout strength) */
  HALF_PERCENT: 0.005,
  /** 0.01 = 1% (minimum change/tolerance) */
  ONE_PERCENT: 0.01,
  /** 0.02 = 2% (small change threshold) */
  TWO_PERCENT: 0.02,
  /** 0.03 = 3% (medium volatility threshold) */
  THREE_PERCENT: 0.03,
  /** 0.05 = 5% (high volatility threshold) */
  FIVE_PERCENT: 0.05,
  /** 0.1 = 10% (moderate threshold) */
  TEN_PERCENT: 0.1,
  /** 0.12 = 12% (threshold for some analyzers) */
  TWELVE_PERCENT: 0.12,
  /** 0.15 = 15% (distance from EMA, support/resistance) */
  FIFTEEN_PERCENT: 0.15,
  /** 0.2 = 20% (correlation weak/none boundary) */
  TWENTY_PERCENT: 0.2,
  /** 0.25 = 25% (price level tolerance) */
  TWENTY_FIVE_PERCENT: 0.25,
  /** 0.3 = 30% (common threshold for filters) */
  THIRTY_PERCENT: 0.3,
  /** 0.4 = 40% (correlation moderate boundary) */
  FORTY_PERCENT: 0.4,
  /** 0.5 = 50% (standard half-way point) */
  FIFTY_PERCENT: 0.5,
  /** 0.6 = 60% (high confidence threshold) */
  SIXTY_PERCENT: 0.6,
  /** 0.7 = 70% (correlation strong boundary) */
  SEVENTY_PERCENT: 0.7,
  /** 0.75 = 75% (very strong threshold) */
  SEVENTY_FIVE_PERCENT: 0.75,
  /** 0.8 = 80% (high threshold) */
  EIGHTY_PERCENT: 0.8,
  /** 0.85 = 85% (extreme threshold) */
  EIGHTY_FIVE_PERCENT: 0.85,
  /** 0.9 = 90% (very close to upper bound) */
  NINETY_PERCENT: 0.9,
} as const;

/** Multiplier constants for ATR, volatility, and range calculations */
export const MULTIPLIER_VALUES = {
  /** 0.9x multiplier (90% or -10% penalty) */
  ZERO_POINT_NINE: 0.9,
  /** 1.0x multiplier (full/neutral) */
  ONE: 1.0,
  /** 1.1x multiplier (110% or +10% boost) */
  ONE_POINT_ONE: 1.1,
  /** 1.3x multiplier (130% or +30% boost - CHoCH/BoS strength) */
  ONE_POINT_THREE: 1.3,
  /** 1.25x multiplier */
  ONE_POINT_TWO_FIVE: 1.25,
  /** 1.5x multiplier (common for stop loss distance) */
  ONE_POINT_FIVE: 1.5,
  /** 2.0x multiplier (double/two times) */
  TWO: 2.0,
  /** 2.5x multiplier */
  TWO_POINT_FIVE: 2.5,
  /** 5.5x multiplier (EMA distance threshold for blocking rules) */
  FIVE_POINT_FIVE: 5.5,
  /** 10.0x multiplier (10 times) */
  TEN: 10.0,
} as const;

// ============================================================================
// PRECISION THRESHOLDS (very small values for tolerance/epsilon)
// ============================================================================

export const PRECISION_THRESHOLDS = {
  /** 0.0001 = 0.01% (very tight tolerance for "at" price levels) */
  TIGHT: 0.0001,
  /** 0.001 = 0.1% (tight tolerance) */
  TIGHT_MEDIUM: 0.001,
  /** 0.01 = 1% (moderate tolerance) */
  MODERATE: 0.01,
  /** 0.1 = 10% (loose tolerance) */
  LOOSE: 0.1,
} as const;

// ============================================================================
// PERCENTAGE CONVERSION
// ============================================================================

/** Convert decimal (0.5) to percentage (50) */
export const PERCENT_MULTIPLIER = 100;

/** Decimal places for percent display (2 = 50.12%) */
export const PERCENT_DECIMAL_PLACES = 2;

// ============================================================================
// ARRAY & LOOP PARTITIONING
// ============================================================================

export const ARRAY_SIZING = {
  /** Split into 2 equal parts */
  TWO_WAY_SPLIT: 2,
  /** Split into 3 equal parts (e.g., 3 TP levels) */
  THREE_WAY_SPLIT: 3,
  /** Split into 4 quarters (e.g., 4 size buckets) */
  FOUR_WAY_SPLIT: 4,
  /** Split into 5 parts (e.g., 5 volume buckets) */
  FIVE_WAY_SPLIT: 5,
  /** Split into 6 parts (e.g., 6 timeframes) */
  SIX_WAY_SPLIT: 6,
  /** Split into 10 parts */
  TEN_WAY_SPLIT: 10,
  /** Split into 50 parts */
  FIFTY_WAY_SPLIT: 50,
} as const;

// ============================================================================
// ARRAY INDEXING & SELECTION
// ============================================================================

/** Index for getting first element */
export const FIRST_INDEX = 0;
/** Index for getting second element */
export const SECOND_INDEX = 1;
/** Index for getting third element */
export const THIRD_INDEX = 2;
/** Index for getting fourth element */
export const FOURTH_INDEX = 3;
/** Index for getting fifth element */
export const FIFTH_INDEX = 4;
/** Index for getting sixth element */
export const SIXTH_INDEX = 5;

// ============================================================================
// INVALID/ERROR MARKERS & NEGATIVE VALUES
// ============================================================================

/** Standard "not found" or "invalid" index marker */
export const INVALID_INDEX = -1;
/** Secondary invalid marker for specific edge cases */
export const INVALID_TIMEFRAME = -2;

/** Negative markers for special cases */
export const NEGATIVE_MARKERS = {
  /** -1 (invalid/not found) */
  MINUS_ONE: -1,
  /** -2 (secondary invalid marker) */
  MINUS_TWO: -2,
  /** -10 (extreme negative marker) */
  MINUS_TEN: -10,
} as const;

// ============================================================================
// MATHEMATICAL BOUNDARIES
// ============================================================================

export const MATH_BOUNDS = {
  /** Minimum safe positive value */
  MIN_SAFE_POSITIVE: 0.00001,
  /** Maximum percentage value (100%) */
  MAX_PERCENTAGE: 100,
  /** Minimum percentage value (0%) */
  MIN_PERCENTAGE: 0,
} as const;

// ============================================================================
// ROUNDING & PRECISION HELPERS
// ============================================================================

/** Helper to round to N decimal places */
export const roundToDecimalPlaces = (value: number, places: number): number => {
  const multiplier = Math.pow(INTEGER_MULTIPLIERS.TEN, places);
  return Math.round(value * multiplier) / multiplier;
};

/** Helper to round price to PRICE decimal places */
export const roundPrice = (value: number): number => {
  return roundToDecimalPlaces(value, DECIMAL_PLACES.PRICE);
};

/** Helper to round percentage to PERCENT decimal places */
export const roundPercent = (value: number): number => {
  return roundToDecimalPlaces(value, DECIMAL_PLACES.PERCENT);
};

/** Helper to round RSI/Stochastic to RSI decimal places */
export const roundRSI = (value: number): number => {
  return roundToDecimalPlaces(value, DECIMAL_PLACES.RSI);
};

/** Helper to round ATR to ATR decimal places */
export const roundATR = (value: number): number => {
  return roundToDecimalPlaces(value, DECIMAL_PLACES.ATR);
};

/** Helper to round ratio to RATIO decimal places */
export const roundRatio = (value: number): number => {
  return roundToDecimalPlaces(value, DECIMAL_PLACES.RATIO);
};

// ============================================================================
// STRING FORMATTING CONSTANTS
// ============================================================================

/** Maximum decimal places for toFixed() calls */
export const TO_FIXED_DECIMAL_PLACES = {
  /** 2 decimal places (for price display) */
  PRICE: 2,
  /** 2 decimal places (for percentage display) */
  PERCENT: 2,
  /** 4 decimal places (for extended precision) */
  EXTENDED: 4,
  /** 0 decimal places (for whole numbers) */
  WHOLE: 0,
} as const;

/** Generic formatter: use with DECIMAL_PLACES constant (e.g., formatToDecimal(value, DECIMAL_PLACES.STRENGTH)) */
export const formatToDecimal = (value: number, places: number): string => {
  return value.toFixed(places);
};

/** Helper to format price with standard 4 decimal places */
export const formatPrice = (value: number): string => {
  return value.toFixed(DECIMAL_PLACES.PRICE);
};

/** Helper to format percent with standard 2 decimal places */
export const formatPercent = (value: number): string => {
  return value.toFixed(DECIMAL_PLACES.PERCENT);
};

/** String slicing indices (preferred over magic numbers) */
export const STRING_SLICE_INDICES = {
  /** Slice from index 0 (start) */
  SLICE_START: 0,
  /** Slice from index 1 */
  SLICE_ONE: 1,
  /** Slice from index 2 */
  SLICE_TWO: 2,
  /** Slice from index 3 */
  SLICE_THREE: 3,
  /** Slice from index 4 */
  SLICE_FOUR: 4,
  /** Slice from index 5 */
  SLICE_FIVE: 5,
  /** Slice from index -1 (last char) */
  SLICE_LAST: -1,
  /** Slice from index -2 (last 2 chars) */
  SLICE_LAST_TWO: -2,
} as const;

// ============================================================================
// BACKTEST & SIMULATION CONSTANTS (technical, not configurable)
// ============================================================================

// ============================================================================
// INDICATOR DEFAULT PARAMETERS (standard/industry default periods)
// ============================================================================

export const INDICATOR_DEFAULTS = {
  /** RSI standard period (Wilder's RSI default) */
  RSI_PERIOD: 14,
  /** EMA fast period (common scalping EMA) */
  EMA_FAST_PERIOD: 9,
  /** EMA slow period (common trend EMA) */
  EMA_SLOW_PERIOD: 21,
  /** ATR standard period (Welles Wilder's default) */
  ATR_PERIOD: 14,
  /** Stochastic %K period */
  STOCHASTIC_K_PERIOD: 14,
  /** Stochastic %K smoothing */
  STOCHASTIC_K_SMOOTHING: 3,
  /** Stochastic %D smoothing */
  STOCHASTIC_D_SMOOTHING: 3,
  /** Bollinger Bands MA period */
  BOLLINGER_PERIOD: 20,
  /** Bollinger Bands standard deviations */
  BOLLINGER_STD_DEV: 2.0,
} as const;

export const BACKTEST_CONSTANTS = {
  /** Candle batch size for historical data (200 candles) */
  CANDLE_BATCH_SIZE: 200,
  /** Progress reporting interval (100 iterations for 1% resolution) */
  PROGRESS_INTERVALS: 100,
  /** Default backtest data samples for statistics */
  DEFAULT_STATS_SAMPLES: 4,
  /** Trade list max display size */
  MAX_TRADE_DISPLAY: 500,
  /** Large data threshold for chunking (5000 items) */
  LARGE_DATA_THRESHOLD: 5000,
  /** Typical backtest timeframe (1000 is 1 second interval) */
  BACKTEST_TIMEFRAME_MS: 1000,
  /** Debug logging interval (every N candles) */
  DEBUG_LOG_INTERVAL: 500,
  /** Number of swing details to show in debug output */
  DEBUG_SWING_DETAILS_COUNT: 3,
  /** Decimal places for price logging */
  DEBUG_PRICE_DECIMALS: 4,
  /** Decimal places for percent/ratio logging */
  DEBUG_PERCENT_DECIMALS: 2,
} as const;

export const CALIBRATION_CONSTANTS = {
  /** Parameter range exploration width (200 values) */
  RANGE_WIDTH: 200,
  /** Parameter range exploration height (200 values) */
  RANGE_HEIGHT: 200,
  /** Number of parameter combinations to show in results (20 top configs) */
  TOP_RESULTS_COUNT: 20,
} as const;

// ============================================================================
// EXCHANGE FEES & COSTS (Bybit specific)
// ============================================================================

/** Maker fee percentage for limit orders - TECHNICAL: Bybit API value */
export const MAKER_FEE_PERCENT = 0.01;
/** Taker fee percentage for market orders - TECHNICAL: Bybit API value */
export const TAKER_FEE_PERCENT = 0.06;

export const EXCHANGE_FEES = {
  /** Bybit taker fee: 0.06% per market order */
  BYBIT_TAKER_FEE_PERCENT: 0.0006,
  /** Bybit maker fee: 0.01% per limit order */
  BYBIT_MAKER_FEE_PERCENT: 0.0001,
} as const;

// ============================================================================
// PATTERN & ANALYZER TECHNICAL THRESHOLDS
// ============================================================================

/** Doji candle thresholds (no body) - TECHNICAL: unit of measurement */
export const DOJI_THRESHOLD = PRECISION_THRESHOLDS.TIGHT; // 0.0001 = 0.01%

/** Divergence detection TECHNICAL thresholds (time/measurement units only) */
export const DIVERGENCE_THRESHOLDS = {
  /** Minimum RSI difference (points) - TECHNICAL: RSI unit */
  RSI_DIFF_POINTS: INTEGER_MULTIPLIERS.TWO as number,
  /** Maximum time between swing points (24 hours) - TECHNICAL: time calculation */
  MAX_TIME_BETWEEN_MS: (INTEGER_MULTIPLIERS.TWENTY_FOUR as number) * (INTEGER_MULTIPLIERS.SIXTY as number) * (INTEGER_MULTIPLIERS.SIXTY as number) * (INTEGER_MULTIPLIERS.ONE_THOUSAND as number),
} as const;

/** Pattern geometry TECHNICAL thresholds (mathematical precision only) */
export const PATTERN_GEOMETRY_THRESHOLDS = {
  /** Convergence threshold for wedge/triangle detection - TECHNICAL: geometric precision */
  CONVERGENCE: PRECISION_THRESHOLDS.TIGHT, // 0.0001
  /** Flat slope threshold for triangle/wedge detection - TECHNICAL: geometric precision */
  FLAT_SLOPE: 0.00005,
  /** Minimum touches per trendline - TECHNICAL: count unit */
  MIN_TOUCHES: INTEGER_MULTIPLIERS.TWO as number,
} as const;

/** Order flow TECHNICAL thresholds (measurement units only) */
export const ORDER_FLOW_THRESHOLDS = {
  /** Minimum price change to detect direction - TECHNICAL: precision measurement */
  PRICE_MOVE_THRESHOLD: 0.01,
} as const;

// ============================================================================
// TIMING CONSTANTS (milliseconds, intervals, safety limits)
// ============================================================================

/** WebSocket & Network TECHNICAL timing constants */
export const TIMING_CONSTANTS = {
  /** WebSocket ping interval to keep connection alive - TECHNICAL: heartbeat timing */
  PING_INTERVAL_MS: 20000,
  /** Delay before attempting WebSocket reconnection - TECHNICAL: backoff timing */
  RECONNECT_DELAY_MS: 5000,
  /** Maximum number of reconnection attempts - TECHNICAL: safety limit */
  MAX_RECONNECT_ATTEMPTS: 10,
  /** Offset for auth token expiration timing - TECHNICAL: safety buffer */
  AUTH_EXPIRES_OFFSET_MS: 10000,
  /** Timeout for order verification retries - TECHNICAL: count limit */
  MAX_VERIFICATION_RETRIES: 3,
  /** Mainnet warning display delay - TECHNICAL: UI timing */
  MAINNET_WARNING_DELAY_MS: 5000,
} as const;

// ============================================================================
// FILE FORMATTING CONSTANTS
// ============================================================================

/** JSON formatting TECHNICAL constant */
export const JSON_INDENT = INTEGER_MULTIPLIERS.TWO; // 2 spaces for readability

// ============================================================================
// CALIBRATION & DATA LOADING CONSTANTS
// ============================================================================

/** Data lookback period for whale detector calibration - TECHNICAL: default data window */
export const DATA_LOOKBACK_DAYS = INTEGER_MULTIPLIERS.SEVEN; // 7 days for comprehensive whale activity coverage

// ============================================================================
// SYSTEM & SERVICE LIMITS (memory, queue sizes, batch processing)
// ============================================================================

/** Max items in error history for circuit breaker - TECHNICAL: system limit */
export const MAX_ERROR_HISTORY = 100;
/** Error threshold for circuit breaker - TECHNICAL: error handling */
export const DEFAULT_ERROR_THRESHOLD = 5;
/** Max items per queue before warning - TECHNICAL: memory management */
export const MAX_QUEUE_SIZE = 10000;
/** Warning threshold for queue size - TECHNICAL: memory management */
export const WARN_QUEUE_SIZE = 5000;
/** Queue size logging interval (log every 1000 items) - TECHNICAL: monitoring */
export const QUEUE_LOG_INTERVAL = 1000;
/** Max levels to store in order book - TECHNICAL: memory leak prevention */
export const MAX_ORDERBOOK_LEVELS = 100;
/** Max ticks to keep in memory - TECHNICAL: memory management */
export const MAX_TICK_HISTORY = 1000;
/** Max aggressive flow events to keep - TECHNICAL: memory management */
export const MAX_FLOW_HISTORY = 500;
/** Min refills for iceberg detection - TECHNICAL: wall tracking */
export const MIN_REFILLS_FOR_ICEBERG = INTEGER_MULTIPLIERS.THREE;
/** Min walls to form cluster - TECHNICAL: wall tracking */
export const CLUSTER_MIN_WALLS = INTEGER_MULTIPLIERS.TWO;
/** LRU cache size divisor for cleanup - TECHNICAL: cache management */
export const LRU_SIZE_DIVISOR = INTEGER_MULTIPLIERS.TWO; // Keep 50% of maxSize

// ============================================================================
// SERVICE TIMING INTERVALS (batch writes, cleanup, monitoring)
// ============================================================================

/** Cooldown period for blocking rules - TECHNICAL: execution timing */
export const COOLDOWN_PERIOD_MS = 10000;
/** Batch write interval for data collector - TECHNICAL: write timing */
export const BATCH_WRITE_INTERVAL_MS = 5000;
/** Order book snapshot interval - TECHNICAL: sampling timing */
export const ORDERBOOK_SNAPSHOT_INTERVAL_MS = 5000;
/** Position monitor check interval - TECHNICAL: monitoring timing */
export const POSITION_MONITOR_INTERVAL_MS = 10000;
/** Order status check interval - TECHNICAL: polling timing */
export const ORDER_CHECK_INTERVAL_MS = 200;
/** Cleanup interval for tick history - TECHNICAL: maintenance timing */
export const CLEANUP_INTERVAL_MS = 10000;
/** Max batch size for database writes - TECHNICAL: batch processing */
export const MAX_BATCH_SIZE = 1000;
/** 24-hour period in milliseconds (86400000ms) - TECHNICAL: time calculation */
export const MS_PER_24_HOURS = 86400000;

// ============================================================================
// ORDER & TRADING RELATED TECHNICAL CONSTANTS
// ============================================================================

/** Order direction for rises - TECHNICAL: Bybit API value */
export const TRIGGER_DIRECTION_RISE = INTEGER_MULTIPLIERS.ONE;
/** Order direction for falls - TECHNICAL: Bybit API value */
export const TRIGGER_DIRECTION_FALL = INTEGER_MULTIPLIERS.TWO;

// ============================================================================
// BUFFER & PRECISION CONSTANTS (prices, slippage)
// ============================================================================

/** Minimum buffer for adaptive stop-loss - TECHNICAL: precision */
export const BUFFER_MIN = 0.0001;
/** Maximum buffer for adaptive stop-loss - TECHNICAL: precision */
export const BUFFER_MAX = 0.005;
/** Epsilon for floating point comparisons - TECHNICAL: precision */
export const EPSILON = 0.0001;

// ============================================================================
// ADAPTIVE STOP LOSS DISTANCE THRESHOLDS (structure validation)
// ============================================================================

/** Max order block distance from entry (%) - TECHNICAL: structure validation */
export const MAX_ORDERBLOCK_DISTANCE_PERCENT = 3.0;
/** Max swing distance from entry (%) - TECHNICAL: structure validation */
export const MAX_SWING_DISTANCE_PERCENT = 4.0;
/** Max level distance from entry (%) - TECHNICAL: structure validation */
export const MAX_LEVEL_DISTANCE_PERCENT = 3.0;
/** Default ATR multiplier for SL calculation - TECHNICAL: ATR-based SL */
export const DEFAULT_ATR_SL_MULTIPLIER = 1.5;

// ============================================================================
// CANDLE & TIME PERIOD CALCULATIONS
// ============================================================================

/** 24-hour high lookback: 288 candles at 5m intervals (288 * 5m = 1440m = 24h) - TECHNICAL: ATH protection */
export const CANDLES_FOR_24H_HIGH = 288;

// ============================================================================
// WALL STRENGTH CALCULATION CONSTANTS
// ============================================================================

/** Wall lifetime strength score (0-0.4) - TECHNICAL: wall strength calculation */
export const WALL_LIFETIME_SCORE_MAX = 0.4;
/** Wall size stability strength score (0-0.3) - TECHNICAL: wall strength calculation */
export const WALL_SIZE_STABILITY_SCORE_MAX = 0.3;
/** Wall iceberg bonus strength (0-0.3) - TECHNICAL: wall strength calculation */
export const WALL_ICEBERG_BONUS_SCORE = 0.3;

// ============================================================================
// ANALYZER DEFAULT PARAMETERS
// ============================================================================

/** Default fractal alignment tolerance (%) - TECHNICAL: fractal detection */
export const DEFAULT_FRACTAL_TOLERANCE_PERCENT = 0.3;
/** Default max distance for wall/HVN blocking checks (%) - TECHNICAL: blocking detection */
export const DEFAULT_BLOCKING_CHECK_DISTANCE_PERCENT = 2.0;
/** Default buffer for tight stop loss calculation (%) - TECHNICAL: SL calculation */
export const DEFAULT_TIGHT_STOPLOSS_BUFFER_PERCENT = 0.1;

// ============================================================================
// STATISTICAL CONSTANTS (chi-square, significance levels)
// ============================================================================

/** Chi-square critical value for p=0.01 (highly significant) - TECHNICAL: statistical testing */
export const CHI_SQUARE_CRITICAL_P_001 = 6.635;
/** Chi-square critical value for p=0.05 (significant) - TECHNICAL: statistical testing */
export const CHI_SQUARE_CRITICAL_P_005 = 3.841;

// ============================================================================
// WEIGHT & MODIFIER DEFAULTS
// ============================================================================

/** Default weight/modifier multiplier (neutral/no change) - TECHNICAL: scoring */
export const DEFAULT_MODIFIER_MULTIPLIER = 1.0;

// ============================================================================
// PATTERN DETECTION BOOSTS & MULTIPLIERS
// ============================================================================

/** Pattern detection confidence boost multiplier (10%) - TECHNICAL: pattern weighting */
export const PATTERN_BOOST_MULTIPLIER = 0.10;
/** Triple pattern tolerance percent (%) - TECHNICAL: pattern detection */
export const TRIPLE_PATTERN_TOLERANCE_PERCENT = 3.0;
/** Triple pattern stop loss multiplier (%) - TECHNICAL: pattern detection */
export const TRIPLE_PATTERN_SL_MULTIPLIER = 0.15;
/** Triple pattern confidence bonus factor - TECHNICAL: pattern detection */
export const TRIPLE_PATTERN_CONFIDENCE_BONUS = 3.0;
/** Triple pattern max bars lookback - TECHNICAL: pattern detection */
export const TRIPLE_PATTERN_MAX_BARS = 150;

// ============================================================================
// MARKET STRUCTURE & PATTERN ANALYSIS MULTIPLIERS
// ============================================================================

/** Market structure alignment boost multiplier (30% confidence boost) - TECHNICAL: CHOCH/BoS */
export const CHOCH_ALIGNED_BOOST = 1.3;
/** Market structure alignment penalty multiplier (50% reduction) - TECHNICAL: CHOCH/BoS */
export const CHOCH_AGAINST_PENALTY = 0.5;
/** Break of Structure aligned boost multiplier (10% confidence boost) - TECHNICAL: BoS */
export const BOS_ALIGNED_BOOST = 1.1;
/** No modification to confidence multiplier (neutral) - TECHNICAL: neutral weighting */
export const NO_MODIFICATION_MULTIPLIER = 1.0;
/** Engulfing pattern confidence bonus per ratio point - TECHNICAL: pattern confidence */
export const ENGULFING_CONFIDENCE_BONUS_PER_RATIO = 20;
/** Equal threshold for considering prices equal (0.1%) - TECHNICAL: price comparison precision */
export const EQUAL_THRESHOLD_PRECISION = 0.001;
/** Breakeven tolerance in USDT (e.g., $0.01) - TECHNICAL: PnL classification */
export const BREAKEVEN_TOLERANCE_USDT = 0.01;
/** Default minimum total weighted score for strategy coordination (65%) - TECHNICAL: signal aggregation */
export const MIN_TOTAL_SCORE_DEFAULT = 0.65;
/** Default minimum confidence threshold for strategy coordination (65%) - TECHNICAL: signal aggregation */
export const MIN_CONFIDENCE_DEFAULT = 65; // Increased from 55% to filter out weak signals on neutral trends

// ============================================================================
// PHASE 4: RISK MANAGER CONSTANTS (NO FALLBACKS - EXPLICIT REQUIRED)
// ============================================================================
// IMPORTANT: These constants are used in RiskManager to eliminate fallbacks.
// Every value must be explicit - NO ?? or || operators creating unpredictable behavior.
// See Phase 4 rule: "NO FALLBACKS - Fast Fail on Missing Data"

/** Estimated new position size ratio for exposure calculation (50% of risk per trade) */
export const RISK_MANAGER_ESTIMATED_NEW_POSITION_RATIO = 0.5;

/** Minimum stop loss distance in percent (prevents extreme SL values and premature hits) */
export const RISK_MANAGER_MIN_SL_DISTANCE_PERCENT = 1.2;

/** Position size multiplier after 2 consecutive losses (75% of normal size) */
export const RISK_MANAGER_LOSS_STREAK_MULTIPLIER_2_LOSSES = 0.75;

/** Position size multiplier after 3 consecutive losses (50% of normal size) */
export const RISK_MANAGER_LOSS_STREAK_MULTIPLIER_3_LOSSES = 0.5;

/** Position size multiplier after 4+ consecutive losses (25% of normal size) */
export const RISK_MANAGER_LOSS_STREAK_MULTIPLIER_4_LOSSES = 0.25;

// ============================================================================
// PHASE 4: TREND ANALYZER CONSTANTS (NO FALLBACKS - EXPLICIT REQUIRED)
// ============================================================================
// IMPORTANT: Used in TrendAnalyzer to make MarketStructure PRIMARY
// No fallbacks allowed - all values EXPLICIT

/** Minimum candles required for trend analysis (need enough data) */
export const TREND_ANALYZER_MIN_CANDLES_REQUIRED = 20;

/** Strong trend pattern strength (HH_HL for BULLISH or LH_LL for BEARISH) */
export const TREND_ANALYZER_STRONG_TREND_STRENGTH = 0.8;

/** Flat/neutral trend pattern strength (no clear direction) */
export const TREND_ANALYZER_FLAT_TREND_STRENGTH = 0.3;

/** Unclear/ambiguous trend pattern strength (insufficient data) */
export const TREND_ANALYZER_UNCLEAR_TREND_STRENGTH = 0.0;

/** ZigZag minimum depth for swing point detection (prevents noise) */
export const TREND_ANALYZER_ZIGZAG_MIN_DEPTH = 5;

/** Maximum age for considering recent swings (in candles) */
export const TREND_ANALYZER_RECENT_SWING_MAX_AGE = 20;

// ============================================================================
// FIX #1: RSI_ANALYZER TECHNICAL CONSTANTS
// ============================================================================

/** Multiplier for dynamic RSI threshold (50 + atrPercent * 2) */
export const RSI_DYNAMIC_THRESHOLD_ATR_MULTIPLIER = 2;

/** Penalty multiplier when falling/rising knife pattern detected */
export const RSI_KNIFE_PENALTY_MULTIPLIER = 0.6;

/** Bonus multiplier when bouncing/confirming candle detected */
export const RSI_BOUNCE_BONUS_MULTIPLIER = 1.1;

// ============================================================================
// FIX #2: CHOCH_BOS_DETECTOR TECHNICAL CONSTANTS
// ============================================================================

/** Minimum number of swings required to detect BOS pattern */
export const CHOCH_BOS_MIN_SWINGS = 2;

/** Swing point lookback index (get last 3 swings) */
export const CHOCH_BOS_LOOKBACK = 3;

// ============================================================================
// FIX #3: FOOTPRINT TECHNICAL CONSTANTS
// ============================================================================

/** Wick percentage threshold for resistance rejection (95% = 0.95) */
export const FOOTPRINT_RESISTANCE_WICK_THRESHOLD = 0.95;

// ============================================================================
// FIX #5: WICK_ANALYZER TECHNICAL CONSTANTS
// ============================================================================

/** Milliseconds per candlestick (for 1m candles) */
export const WICK_CANDLE_INTERVAL_MS = 60000;

/** Confidence multiplier for current candle's wick */
export const WICK_CURRENT_CANDLE_CONFIDENCE = 1.0;

/** Confidence multiplier for previous candle's wick */
export const WICK_PREVIOUS_CANDLE_CONFIDENCE = 0.7;

/** Confidence multiplier for 2-3 candles ago wick */
export const WICK_OLD_CANDLE_CONFIDENCE = 0.3;

// ============================================================================
// FIX #7: POST-TP CONSOLIDATION TECHNICAL CONSTANTS (time in ms)
// ============================================================================

/** First half consolidation period (5 minutes) */
export const POST_TP_FIRST_HALF_MS = 5 * 60 * 1000;

/** Second half consolidation period (3 minutes) */
export const POST_TP_SECOND_HALF_MS = 3 * 60 * 1000;

/** Total consolidation wait time (10 minutes) */
export const POST_TP_TOTAL_WAIT_MS = 10 * 60 * 1000;

// ============================================================================
// FIX #9: ANALYZER COST VALIDATION TECHNICAL CONSTANTS
// ============================================================================

/** Percentage threshold for blocked analyzers (40% of total) */
export const ENTRY_COST_BLOCKED_PERCENTAGE = 0.40;

/** Percentage threshold for blocked analyzers on LONG (50% of total) */
export const ENTRY_COST_BLOCKED_PERCENTAGE_LONG = 0.50;
