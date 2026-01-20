/**
 * Analyzer Configuration Utilities (Phase 4.10)
 * Extract analyzer-specific parameters from BotConfig
 */

import type {
  AtrAnalyzerParams,
  BollingerBandsAnalyzerParams,
  BreakoutAnalyzerParams,
  OrderBlockAnalyzerParams,
  WickAnalyzerParams,
} from '../types/config.types';

// ============================================================================
// PARAMETER EXTRACTION UTILITIES
// ============================================================================

/**
 * Extract ATR analyzer parameters from config
 * Falls back to defaults if config section is missing
 */
export function getAtrAnalyzerParams(config: any): AtrAnalyzerParams {
  const params = config?.analyzerParameters?.atr;
  return {
    highThreshold: params?.highThreshold ?? 2.5,
    lowThreshold: params?.lowThreshold ?? 0.8,
  };
}

/**
 * Extract Bollinger Bands analyzer parameters from config
 * Falls back to defaults if config section is missing
 */
export function getBollingerBandsAnalyzerParams(config: any): BollingerBandsAnalyzerParams {
  const params = config?.analyzerParameters?.bollingerBands;
  return {
    minCandlesRequired: params?.minCandlesRequired ?? 25,
    oversoldThreshold: params?.oversoldThreshold ?? 20,
    overboughtThreshold: params?.overboughtThreshold ?? 80,
    neutralRange: {
      lower: params?.neutralRange?.lower ?? 40,
      upper: params?.neutralRange?.upper ?? 60,
    },
    squeezeThreshold: params?.squeezeThreshold ?? 5,
  };
}

/**
 * Extract Breakout analyzer parameters from config
 * Falls back to defaults if config section is missing
 */
export function getBreakoutAnalyzerParams(config: any): BreakoutAnalyzerParams {
  const params = config?.analyzerParameters?.breakout;
  return {
    minCandlesRequired: params?.minCandlesRequired ?? 30,
    resistanceLookback: params?.resistanceLookback ?? 20,
    volatilityThreshold: params?.volatilityThreshold ?? 1.5,
  };
}

/**
 * Extract Order Block analyzer parameters from config
 * Falls back to defaults if config section is missing
 */
export function getOrderBlockAnalyzerParams(config: any): OrderBlockAnalyzerParams {
  const params = config?.analyzerParameters?.orderBlock;
  return {
    maxDistanceThreshold: params?.maxDistanceThreshold ?? 0.05,
    maxRejectionCount: params?.maxRejectionCount ?? 5,
  };
}

/**
 * Extract Wick analyzer parameters from config
 * Falls back to defaults if config section is missing
 */
export function getWickAnalyzerParams(config: any): WickAnalyzerParams {
  const params = config?.analyzerParameters?.wick;
  return {
    minBodyToWickRatio: params?.minBodyToWickRatio ?? 0.3,
  };
}
