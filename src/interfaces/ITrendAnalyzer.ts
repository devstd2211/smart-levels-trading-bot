/**
 * Trend Analysis Interface
 *
 * Abstracts trend analysis logic
 * Analyzes market structure, EMAs, and overall market direction
 */

import type { Candle } from '../types/core';
import type { TrendContext } from '../types/architecture.types';
import { SignalDirection } from '../types/enums';

/**
 * Trend analyzer interface
 * Analyzes market trend and provides context
 */
export interface ITrendAnalyzer {
  /**
   * Analyze trend from candles
   * Should look at multiple timeframes
   */
  analyzeTrend(candles: Candle[], timeframe: string): TrendContext;

  /**
   * Get global trend bias (direction of main trend)
   */
  getGlobalBias(): SignalDirection | null;

  /**
   * Get swing points (highs and lows for structure analysis)
   */
  getSwingPoints(): {
    highs: number[];
    lows: number[];
  };

  /**
   * Check if market is flat (consolidation)
   */
  isFlatMarket(): boolean;

  /**
   * Check if candle closed above/below EMA
   */
  isCandleAboveEMA(candle: Candle, emaValue: number): boolean;

  /**
   * Get EMA crossover state
   */
  getEMACrossover(): {
    fast: number;
    slow: number;
    isBullish: boolean;
  } | null;

  /**
   * Update trend with new candle (incremental update)
   */
  updateWithCandle(newCandle: Candle): void;

  /**
   * Reset trend analysis
   */
  reset(): void;
}
