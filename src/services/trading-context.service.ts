/**
 * Trading Context Service (Week 13 Phase 2 Extract)
 *
 * Extracted from trading-orchestrator.service.ts
 * Responsible for maintaining and updating trading context (trend analysis)
 *
 * Responsibilities:
 * - Update trend analysis on PRIMARY candle close
 * - Provide current trend information for signal filtering
 * - Filter signals by trend alignment (block counter-trend signals)
 * - Cache trend analysis to avoid recalculation
 */

import {
  LoggerService,
  TimeframeRole,
  TrendAnalysis,
  ComprehensiveTrendAnalysis,
  AnalyzerSignal,
  SignalDirection,
  TradingMode,
  TrendAnalyzer,
} from '../types';
import { CandleProvider } from '../providers/candle.provider';

/**
 * Trading Context Service
 *
 * Manages trend analysis and signal filtering based on trend alignment.
 * PHASE 4 PRIMARY: Global trend detection runs FIRST in the pipeline
 */
export class TradingContextService {
  private currentTrendAnalysis: TrendAnalysis | null = null;

  constructor(
    private candleProvider: CandleProvider,
    private trendAnalyzer: TrendAnalyzer | null,
    private logger: LoggerService,
  ) {}

  /**
   * Initialize trend analysis on bot startup
   * CRITICAL: Called immediately after candle loading to avoid null trend at start
   * This prevents the "trend not available" blocking that lasts ~5 minutes
   */
  async initializeTrendAnalysis(): Promise<void> {
    this.logger.info('🔥 TradingContextService.initializeTrendAnalysis() CALLED - THIS IS CRITICAL');

    if (!this.trendAnalyzer) {
      this.logger.error('🚨 CRITICAL: TrendAnalyzer is NULL! Trend analysis cannot initialize');
      return;
    }

    this.logger.info('✅ TrendAnalyzer is available, proceeding...');

    try {
      const primaryCandles = await this.candleProvider.getCandles(TimeframeRole.PRIMARY);
      const candleCount = primaryCandles?.length || 0;

      this.logger.info('🔥 CRITICAL: Got primary candles', {
        count: candleCount,
        required: 20,
        hasCandles: candleCount > 0,
        isEnough: candleCount >= 20,
      });

      if (!primaryCandles || candleCount < 20) {
        this.logger.error('🚨 NOT ENOUGH CANDLES FOR TREND INIT', {
          available: candleCount,
          required: 20,
          candleProvider: this.candleProvider ? 'exists' : 'NULL',
        });
        return;
      }

      this.logger.info('🚀 STARTING TREND ANALYZER...');
      const result = await this.trendAnalyzer.analyzeTrend(primaryCandles, '1h');

      this.logger.info('🔥 ANALYZER RETURNED', {
        resultExists: !!result,
        resultType: result ? typeof result : 'null',
      });

      this.currentTrendAnalysis = result;

      if (this.currentTrendAnalysis) {
        this.logger.info('✅✅✅ TREND ANALYSIS INITIALIZED SUCCESSFULLY AT STARTUP!');
        this.logTrendStatus('STARTUP INITIALIZATION');
      } else {
        this.logger.error('🚨 ANALYZER RETURNED NULL - TREND ANALYSIS FAILED');
      }
    } catch (error) {
      this.logger.error('🚨 EXCEPTION DURING TREND INIT', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  /**
   * Update trend context on PRIMARY candle close
   * CRITICAL: Runs FIRST in signal pipeline to set global trend bias
   */
  async updateTrendContext(): Promise<void> {
    if (!this.trendAnalyzer) {
      this.logger.warn('⚠️ TrendAnalyzer not available, skipping trend update');
      return;
    }

    try {
      const primaryCandles = await this.candleProvider.getCandles(TimeframeRole.PRIMARY);
      if (!primaryCandles || primaryCandles.length < 20) {
        this.logger.warn('⚠️ Insufficient candles for trend analysis', {
          available: primaryCandles?.length || 0,
          required: 20,
        });
        return;
      }

      const result = await this.trendAnalyzer.analyzeTrend(primaryCandles, '1h');

      if (!result) {
        this.logger.error('🚨 TrendAnalyzer returned null result on PRIMARY candle close');
        // Keep previous trend analysis if new analysis failed
        return;
      }

      this.currentTrendAnalysis = result;
      this.logTrendStatus('PRIMARY CANDLE CLOSE UPDATE');
    } catch (error) {
      this.logger.error('❌ Error during trend analysis update', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Do not clear currentTrendAnalysis - keep previous value if analysis fails
    }
  }

  /**
   * Helper: Log trend status with super visible output
   */
  private logTrendStatus(source: string): void {
    if (!this.currentTrendAnalysis) return;

    const trendEmoji = this.getTrendEmoji(this.currentTrendAnalysis.bias);
    const restrictedText =
      this.currentTrendAnalysis.restrictedDirections.length > 0
        ? this.currentTrendAnalysis.restrictedDirections.join(', ')
        : 'NONE';

    // Super visible trend status output
    this.logger.info(
      `\n${'═'.repeat(80)}\n${trendEmoji} SUPER TREND STATUS (${source}) - 5min candles\n${'═'.repeat(80)}`,
    );

    this.logger.info('📊 TREND ANALYSIS UPDATED', {
      source: source,
      bias: this.currentTrendAnalysis.bias,
      strength: (this.currentTrendAnalysis.strength * 100).toFixed(1) + '%',
      pattern: this.currentTrendAnalysis.pattern,
      timeframe: 'PRIMARY (5-minute)',
      restrictedDirections: restrictedText,
      reasoning: this.currentTrendAnalysis.reasoning.slice(0, 3).join(' | '),
    });

    this.logger.info(
      `${trendEmoji} CURRENT MARKET STATE: ${this.getTrendDescription(this.currentTrendAnalysis)}\n${'═'.repeat(80)}\n`,
    );
  }

  /**
   * Get current trend analysis
   * @returns Current TrendAnalysis or null if not available
   */
  getCurrentTrendAnalysis(): TrendAnalysis | null {
    return this.currentTrendAnalysis;
  }

  /**
   * Get emoji representation of trend
   */
  private getTrendEmoji(bias: string): string {
    switch (bias) {
      case 'BULLISH':
        return '📈🟢 BULLISH';
      case 'BEARISH':
        return '📉🔴 BEARISH';
      case 'NEUTRAL':
        return '➡️⚪ NEUTRAL';
      default:
        return '❓ UNKNOWN';
    }
  }

  /**
   * Get detailed trend description
   */
  private getTrendDescription(analysis: TrendAnalysis): string {
    const strengthPercent = (analysis.strength * 100).toFixed(0);
    const strengthBar =
      '█'.repeat(Math.floor(analysis.strength * 10)) + '░'.repeat(10 - Math.floor(analysis.strength * 10));
    const blockInfo =
      analysis.restrictedDirections.length > 0
        ? `Blocks: ${analysis.restrictedDirections.join(', ')}`
        : 'No direction restrictions';

    return (
      `${analysis.bias} (${strengthPercent}% [${strengthBar}]) | ` +
      `Pattern: ${analysis.pattern} | ${blockInfo}`
    );
  }

  /**
   * Get super summary of current trend status
   * Used for console display and logging
   */
  getSuperTrendStatus(): string {
    if (!this.currentTrendAnalysis) {
      return '🚨 TREND ANALYSIS NOT READY YET - Awaiting first PRIMARY candle analysis';
    }

    const trend = this.currentTrendAnalysis;
    const emoji = this.getTrendEmoji(trend.bias);
    const strengthPercent = (trend.strength * 100).toFixed(1);
    const strengthBar =
      '█'.repeat(Math.floor(trend.strength * 10)) + '░'.repeat(10 - Math.floor(trend.strength * 10));

    return (
      `\n${'═'.repeat(80)}\n` +
      `${emoji} TREND STATUS\n` +
      `${'═'.repeat(80)}\n` +
      `Timeframe: PRIMARY (5-minute)\n` +
      `Bias: ${trend.bias} | Strength: ${strengthPercent}% [${strengthBar}]\n` +
      `Pattern: ${trend.pattern}\n` +
      `Restricted: ${trend.restrictedDirections.length > 0 ? trend.restrictedDirections.join(', ') : 'NONE'}\n` +
      `Reasoning: ${trend.reasoning.slice(0, 2).join(' → ')}\n` +
      `${'═'.repeat(80)}\n`
    );
  }

  /**
   * Filter analyzer signals by trend alignment
   * Blocks counter-trend signals BEFORE weighted voting aggregation
   * - LONG blocked in BEARISH trend
   * - SHORT blocked in BULLISH trend
   * - NEUTRAL allows both
   *
   * @param signals - Array of analyzer signals to filter
   * @returns Filtered array with counter-trend signals removed
   */
  filterSignalsByTrend(signals: AnalyzerSignal[]): AnalyzerSignal[] {
    // Skip if no trend analysis available
    if (!this.currentTrendAnalysis) {
      return signals;
    }

    const { restrictedDirections } = this.currentTrendAnalysis;

    // If no restrictions, return all signals
    if (restrictedDirections.length === 0) {
      return signals;
    }

    // Filter out restricted directions
    const filtered = signals.filter((signal) => {
      const isRestricted = restrictedDirections.includes(signal.direction as SignalDirection);
      if (isRestricted) {
        this.logger.warn('🚫 Signal BLOCKED by trend alignment', {
          signal: signal.direction,
          trend: this.currentTrendAnalysis!.bias,
          reason: `${signal.direction} blocked in ${this.currentTrendAnalysis!.bias} trend`,
        });
      }
      return !isRestricted;
    });

    if (filtered.length < signals.length) {
      this.logger.info('🔀 Trend Alignment Filtering', {
        total: signals.length,
        filtered: filtered.length,
        blocked: signals.length - filtered.length,
        trend: this.currentTrendAnalysis.bias,
      });
    }

    return filtered;
  }
}
