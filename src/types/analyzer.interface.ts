import { Candle } from './core';
import { AnalyzerSignal } from './strategy';

/**
 * Universal Analyzer Interface
 *
 * All 29 analyzers must implement this contract:
 * - Basic 6: EMA, RSI, ATR, Volume, Stochastic, Bollinger Bands
 * - Advanced: Divergence, Breakout, Wick, Price Action, Structure, Levels, Liquidity, SMC, Scalping, etc.
 *
 * Design Pattern:
 * - Pure interface (no implementations)
 * - All analyzers injected through AnalyzerLoader
 * - AnalyzerRegistry manages metadata
 * - Type-safe everywhere (no magic strings - use AnalyzerType enum)
 *
 * Usage:
 * - Strategies receive Map<AnalyzerType, IAnalyzer>
 * - Call analyzer.analyze(candles) to get AnalyzerSignal
 * - Use analyzer metadata (getType, getEnabled, etc) for filtering
 *
 * SOLID Principles:
 * - SRP: Each analyzer handles one analysis type
 * - OCP: New analyzer? Just implement IAnalyzer
 * - LSP: All analyzers behave the same way
 * - ISP: Only required methods (no bloated interface)
 * - DIP: Depend on interface, not implementations
 */
export interface IAnalyzer {
  /**
   * Get analyzer type name
   * @returns 'EMA', 'RSI', 'DIVERGENCE', 'BREAKOUT', etc (use AnalyzerType enum)
   */
  getType(): string;

  /**
   * Analyze candles and generate trading signal
   *
   * @param candles Array of candles to analyze
   * @returns AnalyzerSignal { direction: LONG/SHORT/HOLD, confidence: 0-1, weight: 0-1 }
   * @throws Error if not enabled, not enough candles, or invalid input
   */
  analyze(candles: Candle[]): AnalyzerSignal;

  /**
   * Check if analyzer has enough data to analyze
   * @param candles Array of candles
   * @returns true if enough candles, false otherwise
   */
  isReady(candles: Candle[]): boolean;

  /**
   * Get minimum candles required for analysis
   * @returns Min candle count needed (e.g., RSI needs 50, Divergence needs 100)
   */
  getMinCandlesRequired(): number;

  /**
   * Check if analyzer is enabled
   * @returns true if enabled, false otherwise
   */
  isEnabled(): boolean;

  /**
   * Get analyzer weight (contribution to final decision)
   * @returns Weight 0.0-1.0 (usually from config)
   */
  getWeight(): number;

  /**
   * Get analyzer priority (execution order)
   * @returns Priority 1-10 (higher = more important)
   */
  getPriority(): number;

  /**
   * Get maximum confidence this analyzer can produce
   * @returns Max confidence 0.0-1.0 (usually from config)
   */
  getMaxConfidence(): number;
}
