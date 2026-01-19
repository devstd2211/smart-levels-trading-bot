/**
 * Analyzer Type Enum
 *
 * Why enum instead of strings?
 * ✅ Type-safe (no typos possible)
 * ✅ Intellisense support
 * ✅ Single source of truth
 * ✅ Easy to refactor
 * ✅ No magic strings
 *
 * All 29 analyzers organized by category:
 *
 * BASIC INDICATORS (6):
 *   - EMA, RSI, ATR, VOLUME, STOCHASTIC, BOLLINGER_BANDS
 *
 * ADVANCED ANALYZERS (23):
 *   Divergence (1): DIVERGENCE
 *   Breakout (1): BREAKOUT
 *   Price Action (1): PRICE_ACTION, WICK
 *   Structure (4): CHOCH_BOS, SWING, TREND_CONFLICT, TREND_DETECTOR
 *   Levels (4): LEVEL, MICRO_WALL, ORDER_BLOCK, FAIR_VALUE_GAP
 *   Liquidity & SMC (5): LIQUIDITY_SWEEP, LIQUIDITY_ZONE, WHALE, VOLATILITY_SPIKE, FOOTPRINT
 *   Order Flow (3): ORDER_FLOW, TICK_DELTA, DELTA
 *   Scalping (2): PRICE_MOMENTUM, VOLUME_PROFILE
 *
 * Used in:
 * - AnalyzerRegistry.register(AnalyzerType.EMA, ...)
 * - AnalyzerLoader: switch(type) cases
 * - Strategies: analyzers.get(AnalyzerType.RSI)
 */

export enum AnalyzerType {
  // ========== BASIC INDICATORS (6) ==========
  EMA = 'EMA',
  RSI = 'RSI',
  ATR = 'ATR',
  VOLUME = 'VOLUME',
  STOCHASTIC = 'STOCHASTIC',
  BOLLINGER_BANDS = 'BOLLINGER_BANDS',

  // ========== ADVANCED ANALYZERS (23) ==========

  // Divergence Detection (1)
  DIVERGENCE = 'DIVERGENCE',

  // Breakout Detection (1)
  BREAKOUT = 'BREAKOUT',

  // Price Action (2)
  PRICE_ACTION = 'PRICE_ACTION',
  WICK = 'WICK',

  // Structure Analysis (4)
  CHOCH_BOS = 'CHOCH_BOS', // Change of Character / Break of Structure
  SWING = 'SWING',
  TREND_CONFLICT = 'TREND_CONFLICT',
  TREND_DETECTOR = 'TREND_DETECTOR',

  // Level Analysis (4)
  LEVEL = 'LEVEL',
  MICRO_WALL = 'MICRO_WALL',
  ORDER_BLOCK = 'ORDER_BLOCK',
  FAIR_VALUE_GAP = 'FAIR_VALUE_GAP',

  // Liquidity & Smart Money Concept (5)
  LIQUIDITY_SWEEP = 'LIQUIDITY_SWEEP',
  LIQUIDITY_ZONE = 'LIQUIDITY_ZONE',
  WHALE = 'WHALE', // Whale activity detection
  VOLATILITY_SPIKE = 'VOLATILITY_SPIKE',
  FOOTPRINT = 'FOOTPRINT',

  // Order Flow (3)
  ORDER_FLOW = 'ORDER_FLOW',
  TICK_DELTA = 'TICK_DELTA',
  DELTA = 'DELTA',

  // Scalping (2)
  PRICE_MOMENTUM = 'PRICE_MOMENTUM',
  VOLUME_PROFILE = 'VOLUME_PROFILE',
}

/**
 * Helper to get all analyzer types
 */
export function getAllAnalyzerTypes(): AnalyzerType[] {
  return Object.values(AnalyzerType);
}

/**
 * Helper to check if string is valid analyzer type
 */
export function isValidAnalyzerType(value: string): value is AnalyzerType {
  return Object.values(AnalyzerType).includes(value as AnalyzerType);
}

/**
 * Helper to get all basic indicator analyzer types
 */
export function getBasicIndicatorAnalyzerTypes(): AnalyzerType[] {
  return [
    AnalyzerType.EMA,
    AnalyzerType.RSI,
    AnalyzerType.ATR,
    AnalyzerType.VOLUME,
    AnalyzerType.STOCHASTIC,
    AnalyzerType.BOLLINGER_BANDS,
  ];
}

/**
 * Helper to get all advanced analyzer types
 */
export function getAdvancedAnalyzerTypes(): AnalyzerType[] {
  return getAllAnalyzerTypes().filter(type => !getBasicIndicatorAnalyzerTypes().includes(type));
}

/**
 * Helper to group analyzers by category
 */
export function getAnalyzersByCategory(category: 'basic' | 'divergence' | 'breakout' | 'priceAction' | 'structure' | 'levels' | 'liquidity' | 'orderFlow' | 'scalping'): AnalyzerType[] {
  const categoryMap: Record<string, AnalyzerType[]> = {
    basic: getBasicIndicatorAnalyzerTypes(),
    divergence: [AnalyzerType.DIVERGENCE],
    breakout: [AnalyzerType.BREAKOUT],
    priceAction: [AnalyzerType.PRICE_ACTION, AnalyzerType.WICK],
    structure: [
      AnalyzerType.CHOCH_BOS,
      AnalyzerType.SWING,
      AnalyzerType.TREND_CONFLICT,
      AnalyzerType.TREND_DETECTOR,
    ],
    levels: [
      AnalyzerType.LEVEL,
      AnalyzerType.MICRO_WALL,
      AnalyzerType.ORDER_BLOCK,
      AnalyzerType.FAIR_VALUE_GAP,
    ],
    liquidity: [
      AnalyzerType.LIQUIDITY_SWEEP,
      AnalyzerType.LIQUIDITY_ZONE,
      AnalyzerType.WHALE,
      AnalyzerType.VOLATILITY_SPIKE,
      AnalyzerType.FOOTPRINT,
    ],
    orderFlow: [
      AnalyzerType.ORDER_FLOW,
      AnalyzerType.TICK_DELTA,
      AnalyzerType.DELTA,
    ],
    scalping: [
      AnalyzerType.PRICE_MOMENTUM,
      AnalyzerType.VOLUME_PROFILE,
    ],
  };

  return categoryMap[category] || [];
}
