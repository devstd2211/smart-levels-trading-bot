/**
 * Signal Generation Interfaces
 *
 * Abstracts signal generation and analyzer coordination
 */

import type { AggregatedSignal, Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';

/**
 * Signal generator interface
 * Coordinates analyzers and generates aggregated signals
 */
export interface ISignalGenerator {
  /**
   * Generate signal from current market state
   */
  generateSignal(candles: Candle[], timeframe: string): Promise<AggregatedSignal>;

  /**
   * Get all analyzer signals (before aggregation)
   */
  getAnalyzerSignals(candles: Candle[], timeframe: string): Promise<AnalyzerSignal[]>;

  /**
   * Manually reload strategy (for hot reload)
   */
  reloadStrategy(): Promise<void>;

  /**
   * Get enabled analyzers list
   */
  getEnabledAnalyzers(): string[];

  /**
   * Check if analyzer is enabled
   */
  isAnalyzerEnabled(analyzerName: string): boolean;
}

/**
 * Individual analyzer interface
 * All analyzers implement this
 */
export interface IAnalyzer {
  /**
   * Analyze and generate signal
   */
  analyze(candles: Candle[]): AnalyzerSignal;

  /**
   * Analyzer name (unique identifier)
   */
  readonly name: string;

  /**
   * Analyzer weight in strategy (0-1)
   */
  readonly weight: number;

  /**
   * Reset analyzer state (if needed)
   */
  reset?(): void;
}
