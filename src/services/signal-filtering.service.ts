/**
 * Signal Filtering Service (Week 13 Phase 4b Extract)
 *
 * Extracted from SignalProcessingService.ts
 * Responsible for filtering and validating signals against trend alignment,
 * applying confidence adjustments, and detecting timeframe conflicts.
 *
 * Single Responsibility: Signal filtering and confidence adjustment logic
 */

import {
  LoggerService,
  TrendAnalysis,
  AnalyzerSignal,
  SignalDirection,
} from '../types';
import { StrategyCoordinator } from './strategy-coordinator.service';
import { TrendConfirmationService } from './trend-confirmation.service';
import { INTEGER_MULTIPLIERS } from '../constants';

/**
 * Signal Filtering Service
 *
 * Provides filtering and validation capabilities:
 * 1. Filter signals by trend alignment
 * 2. Apply trend confirmation filtering with confidence adjustment
 * 3. Detect timeframe conflicts and adjust confidence
 */
export class SignalFilteringService {
  constructor(
    private strategyCoordinator: StrategyCoordinator,
    private trendConfirmationService: TrendConfirmationService | null,
    private logger: LoggerService,
    private config?: any, // OrchestratorConfig
  ) {}

  /**
   * Filter analyzer signals by trend alignment
   * Blocks signals that are in restricted directions based on current trend
   * @param signals - Array of analyzer signals
   * @param trendAnalysis - Current trend analysis
   * @returns Filtered signals that align with trend
   */
  public filterSignalsByTrend(
    signals: AnalyzerSignal[],
    trendAnalysis: TrendAnalysis | null,
  ): AnalyzerSignal[] {
    if (!trendAnalysis) {
      return signals;
    }

    const { restrictedDirections } = trendAnalysis;

    if (restrictedDirections.length === 0) {
      return signals;
    }

    const filtered = signals.filter((signal) => {
      const isRestricted = restrictedDirections.includes(signal.direction as SignalDirection);
      if (isRestricted) {
        this.logger.warn('🚫 Signal BLOCKED by trend alignment', {
          signal: signal.direction,
          trend: trendAnalysis.bias,
          reason: `${signal.direction} blocked in ${trendAnalysis.bias} trend`,
        });
      }
      return !isRestricted;
    });

    if (filtered.length < signals.length) {
      this.logger.info('🔀 Trend Alignment Filtering', {
        total: signals.length,
        filtered: filtered.length,
        blocked: signals.length - filtered.length,
        trend: trendAnalysis.bias,
      });
    }

    return filtered;
  }

  /**
   * Apply trend confirmation filtering to adjust confidence
   * - BLOCK: Critical misalignment (alignment score < 30)
   * - REDUCE: Warning misalignment (alignment score < 60) - reduce confidence
   * - BOOST: Full alignment - boost confidence if enabled
   * @param direction - Signal direction
   * @param originalConfidence - Original confidence level
   * @returns Adjusted confidence or null if blocked
   */
  public async applyTrendConfirmationFilter(
    direction: SignalDirection,
    originalConfidence: number,
  ): Promise<number | null> {
    if (!this.trendConfirmationService) {
      return originalConfidence;
    }

    try {
      const trendConfirmation = await this.trendConfirmationService.confirmTrend(direction);
      const criticalScore = this.config?.trendConfirmation?.criticalMisalignmentScore ?? 30;
      const warningScore = this.config?.trendConfirmation?.warningMisalignmentScore ?? 60;

      this.logger.info('🔄 Trend Confirmation Analysis', {
        direction,
        alignmentScore: trendConfirmation.alignmentScore,
        reason: trendConfirmation.reason,
      });

      // BLOCK: Critical misalignment
      if (trendConfirmation.alignmentScore < criticalScore) {
        this.logger.error('❌ Signal BLOCKED by TrendConfirmation: Critical misalignment', {
          signal: direction,
          alignmentScore: trendConfirmation.alignmentScore,
          threshold: criticalScore,
          reason: trendConfirmation.reason,
        });
        return null;
      }

      // REDUCE: Warning misalignment
      if (trendConfirmation.alignmentScore < warningScore) {
        const reducedConfidence = Math.round(
          originalConfidence * (trendConfirmation.alignmentScore / INTEGER_MULTIPLIERS.ONE_HUNDRED)
        );

        this.logger.warn('⚠️ Signal confidence reduced by TrendConfirmation: Trend misalignment', {
          signal: direction,
          originalConfidence: originalConfidence.toFixed(0) + '%',
          reducedConfidence: reducedConfidence + '%',
          alignmentScore: trendConfirmation.alignmentScore,
          reason: trendConfirmation.reason,
        });

        // Check if reduced confidence still meets threshold
        if (reducedConfidence < this.strategyCoordinator.getMinConfidence()) {
          this.logger.info('❌ Signal REJECTED after TrendConfirmation reduction: Below confidence threshold', {
            signal: direction,
            reducedConfidence: reducedConfidence + '%',
            minRequired: this.strategyCoordinator.getMinConfidence() + '%',
          });
          return null;
        }

        return reducedConfidence;
      }

      // BOOST: Full alignment
      if (trendConfirmation.isAligned && trendConfirmation.confidenceBoost > 0) {
        const boostedConfidence = Math.min(
          INTEGER_MULTIPLIERS.ONE_HUNDRED,
          Math.round(originalConfidence + trendConfirmation.confidenceBoost),
        );

        this.logger.info('✅ Signal confidence BOOSTED by TrendConfirmation: Excellent trend alignment', {
          signal: direction,
          originalConfidence: originalConfidence.toFixed(0) + '%',
          boostedConfidence: boostedConfidence + '%',
          boost: trendConfirmation.confidenceBoost,
          alignmentScore: trendConfirmation.alignmentScore,
        });

        return boostedConfidence;
      }

      return originalConfidence;
    } catch (error) {
      this.logger.warn('Trend confirmation filtering failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return originalConfidence;
    }
  }

  /**
   * Detect timeframe conflicts and adjust confidence
   * Check if signal direction conflicts with trend bias across timeframes
   * - BULLISH trend + SHORT signal = conflict (entering short in uptrend)
   * - BEARISH trend + LONG signal = conflict (entering long in downtrend)
   * @param trendAnalysis - Trend analysis from multiple timeframes
   * @param direction - Current signal direction
   * @returns Confidence adjustment multiplier (0.7 = 30% reduction for conflict)
   */
  public detectTimeframeConflict(
    trendAnalysis: TrendAnalysis | null,
    direction: SignalDirection,
  ): number {
    if (!trendAnalysis) {
      return 1.0; // No conflict possible without trend analysis
    }

    const bias = trendAnalysis.bias; // BULLISH/BEARISH/NEUTRAL

    // No conflict if trend is neutral
    if (bias === 'NEUTRAL') {
      return 1.0;
    }

    // Check for directional mismatch
    // BULLISH trend + SHORT signal = conflicting (entering short in uptrend)
    // BEARISH trend + LONG signal = conflicting (entering long in downtrend)
    const isConflicting =
      (bias === 'BULLISH' && direction === SignalDirection.SHORT) ||
      (bias === 'BEARISH' && direction === SignalDirection.LONG);

    if (isConflicting) {
      this.logger.warn('⚠️ Timeframe conflict detected', {
        trendBias: bias,
        signalDirection: direction,
        action: 'Reducing confidence by 30%',
        confidence: 'Before adjustment: will be multiplied by 0.7',
      });
      return 0.7; // Reduce confidence by 30%
    }

    // No conflict - signal aligns with trend
    return 1.0;
  }
}
