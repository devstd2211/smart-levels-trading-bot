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
   * Update trend context on PRIMARY candle close
   * CRITICAL: Runs FIRST in signal pipeline to set global trend bias
   */
  async updateTrendContext(): Promise<void> {
    if (!this.trendAnalyzer) {
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

      this.currentTrendAnalysis = await this.trendAnalyzer.analyzeTrend(primaryCandles, '1h');

      if (this.currentTrendAnalysis) {
        const trendEmoji = this.getTrendEmoji(this.currentTrendAnalysis.bias);
        const restrictedText =
          this.currentTrendAnalysis.restrictedDirections.length > 0
            ? this.currentTrendAnalysis.restrictedDirections.join(', ')
            : 'NONE';

        // Super visible trend status output
        this.logger.info(
          `\n${'═'.repeat(80)}\n${trendEmoji} SUPER TREND STATUS (PRIMARY - 5min candles)\n${'═'.repeat(80)}`,
        );

        this.logger.info('📊 TREND ANALYSIS UPDATED (PRIMARY)', {
          trendDirection: this.currentTrendAnalysis.bias,
          trendEmoji: trendEmoji,
          strength: (this.currentTrendAnalysis.strength * 100).toFixed(1) + '%',
          pattern: this.currentTrendAnalysis.pattern,
          timeframe: 'PRIMARY (5-minute)',
          candles: primaryCandles.length,
          restrictedDirections: restrictedText,
          reasoning: this.currentTrendAnalysis.reasoning.slice(0, 3).join(' | '),
        });

        this.logger.info(
          `${trendEmoji} CURRENT MARKET STATE: ${this.getTrendDescription(this.currentTrendAnalysis)}\n${'═'.repeat(80)}\n`,
        );
      }
    } catch (error) {
      this.logger.warn('Failed to update trend analysis', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Do not clear currentTrendAnalysis - keep previous value if analysis fails
    }
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
