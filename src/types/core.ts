/**
 * Edison Trading Bot - Core Types
 * Fundamental types used throughout the codebase
 */

import {
  SignalDirection,
  SignalType,
  PositionSide,
  BTCDirection,
} from './enums';

// ============================================================================
// CANDLE DATA
// ============================================================================

/**
 * Single candle (OHLCV)
 */
export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

// ============================================================================
// TAKE PROFIT
// ============================================================================

/**
 * Take profit level configuration
 */
export interface TakeProfit {
  level: number;
  percent: number;
  sizePercent: number;
  price: number;
  orderId?: string; // Order ID after placement
  hit: boolean; // Whether this TP was hit
  hitAt?: number; // Timestamp when TP was hit
}

// ============================================================================
// BTC CORRELATION & ANALYSIS
// ============================================================================

/**
 * Correlation result for BTC-altcoin analysis
 */
export interface CorrelationResult {
  coefficient: number; // Pearson correlation coefficient (-1 to 1)
  strength: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE'; // Correlation strength
  filterStrength: 'STRICT' | 'MODERATE' | 'WEAK' | 'SKIP'; // Recommended filter strength
  sampleSize: number; // Number of data points used
  btcVolatility: number; // BTC price volatility (%)
  altVolatility: number; // Altcoin price volatility (%)
}

/**
 * BTC analysis result
 * Analyzes Bitcoin price movement to confirm altcoin signals
 */
export interface BTCAnalysis {
  direction: BTCDirection; // BTC direction (UP/DOWN/NEUTRAL)
  momentum: number; // 0-1 (strength of movement)
  priceChange: number; // % change over lookback period
  consecutiveMoves: number; // Number of consecutive candles in same direction
  volumeRatio: number; // Current volume vs average
  isAligned: boolean; // Whether BTC supports the signal direction
  reason: string; // Human-readable explanation
  correlation?: CorrelationResult; // Correlation with altcoin (if enabled)
}

// ============================================================================
// STOP LOSS CONFIG
// ============================================================================

/**
 * Stop loss configuration for positions
 */
export interface StopLossConfig {
  price: number; // Current SL price
  initialPrice: number; // Original SL price
  orderId?: string; // Order ID for SL order
  isBreakeven: boolean; // Whether SL is at breakeven
  isTrailing: boolean; // Whether trailing stop is active
  trailingPercent?: number; // Trailing stop distance in %
  trailingOrderId?: string; // Server-side trailing stop order ID
  updatedAt: number; // Last update timestamp
  trailingActivationPrice?: number; // Price at which trailing was activated (TP2 price for smart TP3)
  tp3MovedTicks?: number; // Number of ticks TP3 has been moved (for smart TP3)
}

// ============================================================================
// TRADING SIGNAL
// ============================================================================

/**
 * Trading signal
 */
export interface Signal {
  direction: SignalDirection;
  type: SignalType;
  confidence: number;
  price: number;
  stopLoss: number;
  takeProfits: TakeProfit[];
  reason: string;
  timestamp: number;
  // Market data for journal entry condition
  marketData?: {
    rsi: number;
    rsiEntry?: number;
    rsiTrend1?: number;
    ema?: number; // Legacy: EMA50 (for backward compatibility)
    ema20?: number; // NEW: Fast EMA
    ema50?: number; // NEW: Slow EMA
    emaEntry?: number;
    emaTrend1?: number;
    atr: number;
    volumeRatio?: number; // Optional for Whale Hunter
    swingHighsCount?: number; // Optional for Whale Hunter
    swingLowsCount?: number; // Optional for Whale Hunter
    trend?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    nearestLevel?: number;
    distanceToLevel?: number;
    distanceToEma?: number;
    // Whale Hunter specific fields
    whaleMode?: string;
    wallSize?: number;
    imbalance?: number;
    // Stochastic indicator data
    stochastic?: {
      k: number; // %K value (0-100)
      d: number; // %D value (0-100)
      isOversold: boolean; // K < 20
      isOverbought: boolean; // K > 80
    };
    // Bollinger Bands data
    bollingerBands?: {
      upper: number; // Upper band price
      middle: number; // Middle band (SMA)
      lower: number; // Lower band price
      width: number; // Band width %
      percentB: number; // Price position (0-1)
      isSqueeze: boolean; // Squeeze detected
    };
    // Breakout Direction Prediction (BB.MD Section 4.4)
    breakoutPrediction?: {
      direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
      confidence: number; // 0-100
      emaTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
      rsiMomentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
      volumeStrength: 'HIGH' | 'MEDIUM' | 'LOW';
    };
  };
  // BTC confirmation data (if BTC filter enabled)
  // Full BTCAnalysis object from btc.analyzer.ts
  btcData?: BTCAnalysis;
}

// ============================================================================
// POSITION
// ============================================================================

/**
 * Open position
 */
export interface Position {
  id: string; // Exchange ID (e.g., "APEXUSDT_Sell") - used for WebSocket sync
  journalId?: string; // Unique journal ID (e.g., "APEXUSDT_Sell_1761696424935") - used for trade history
  symbol: string;
  side: PositionSide;
  quantity: number;
  entryPrice: number;
  leverage: number;
  marginUsed: number; // Margin used in USDT
  stopLoss: StopLossConfig; // Stop loss configuration
  takeProfits: TakeProfit[];
  openedAt: number;
  unrealizedPnL: number;
  orderId: string; // Entry order ID
  reason: string; // Why position was opened
  confidence?: number; // Signal confidence
  strategy?: string; // Strategy name
  strategyId?: string; // [Phase 10.2] Multi-strategy support - which strategy owns this position
  protectionVerifiedOnce?: boolean; // Protection verified once - no need to check repeatedly
  status: 'OPEN' | 'CLOSED'; // Position status - used for idempotent close operations
}

// ============================================================================
// AGGREGATED SIGNAL (from StrategyCoordinator)
// ============================================================================

/**
 * Aggregated signal from StrategyCoordinator
 * Result of combining all analyzer signals with strategy weights
 */
export interface AggregatedSignal {
  direction: SignalDirection | null; // LONG, SHORT, or null if no signal
  confidence: number; // 0-1, confidence in signal
  totalScore: number; // 0-1, weighted score
  signalCount: number; // number of contributing analyzers
  analyzers: {
    name: string;
    direction: SignalDirection;
    confidence: number;
  }[];
  appliedPenalty: number; // blind zone penalty applied (0.0-1.0)
  reason: string; // human-readable explanation
  timestamp: number; // when signal was generated
}
