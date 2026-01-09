/**
 * STRATEGY COORDINATOR SERVICE - NEW VERSION
 *
 * Coordinates signal aggregation using strategy weights
 *
 * Algorithm:
 * 1. Collect all analyzer signals with confidence
 * 2. Get weight for each analyzer from strategy
 * 3. Calculate weighted score: sum(confidence * weight) / sum(weight)
 * 4. Apply blind zone penalty if needed
 * 5. Return aggregated result
 *
 * No hardcoded weights anymore - all from strategy JSON!
 */

import type { LoggerService } from './logger.service';
import type { StrategyConfig } from '../types/strategy-config.types';
import type { AnalyzerSignal } from '../types/strategy';
import type { SignalDirection } from '../types/enums';
import { SignalDirection as SignalDirectionEnum } from '../types/enums';

export interface AggregationResult {
  direction: SignalDirection | null;
  totalScore: number;
  confidence: number;
  signalCount: number;
  appliedPenalty: number;
  analyzerBreakdown: Map<string, number>; // analyzer name -> weighted score
}

export class StrategyCoordinator {
  private readonly minTotalScore: number = 0.45;
  private readonly minConfidence: number = 0.75; // 75%

  constructor(
    private strategy: StrategyConfig,
    private logger?: LoggerService,
  ) {}

  /**
   * Aggregate signals from all enabled analyzers using strategy weights
   *
   * @param signals - Array of analyzer signals
   * @returns Aggregated result with direction and confidence
   */
  aggregateSignals(signals: AnalyzerSignal[]): AggregationResult {
    if (signals.length === 0) {
      return {
        direction: null,
        totalScore: 0,
        confidence: 0,
        signalCount: 0,
        appliedPenalty: 0,
        analyzerBreakdown: new Map(),
      };
    }

    // Get all enabled analyzer weights from strategy
    const weightsMap = this.getAnalyzerWeights();

    // Group signals by direction
    const longSignals = signals.filter((s) => s.direction === SignalDirectionEnum.LONG);
    const shortSignals = signals.filter((s) => s.direction === SignalDirectionEnum.SHORT);

    // Calculate weighted scores
    const longScore = this.calculateWeightedScore(longSignals, weightsMap);
    const shortScore = this.calculateWeightedScore(shortSignals, weightsMap);

    // Determine winner
    const winnerIsLong = longScore.total >= shortScore.total;
    const winningScore = winnerIsLong ? longScore : shortScore;
    const winningDirection = winnerIsLong ? SignalDirectionEnum.LONG : SignalDirectionEnum.SHORT;

    // Apply blind zone penalty if needed
    let penalty = 1.0;
    if (winnerIsLong && longSignals.length < (this.strategy.filters?.blindZone?.minSignalsForLong ?? 3)) {
      penalty = this.strategy.filters?.blindZone?.longPenalty ?? 0.85;
      this.logger?.debug(
        `[StrategyCoordinator] Blind zone penalty applied for LONG: ${longSignals.length} signals < ${this.strategy.filters?.blindZone?.minSignalsForLong ?? 3}`,
      );
    }
    if (!winnerIsLong && shortSignals.length < (this.strategy.filters?.blindZone?.minSignalsForShort ?? 3)) {
      penalty = this.strategy.filters?.blindZone?.shortPenalty ?? 0.90;
      this.logger?.debug(
        `[StrategyCoordinator] Blind zone penalty applied for SHORT: ${shortSignals.length} signals < ${this.strategy.filters?.blindZone?.minSignalsForShort ?? 3}`,
      );
    }

    // Apply penalty to confidence
    const adjustedConfidence = Math.min(1.0, winningScore.average * penalty);

    // Check thresholds
    const meetsThresholds = winningScore.total >= this.minTotalScore &&
      adjustedConfidence >= this.minConfidence;

    this.logger?.debug(
      `[StrategyCoordinator] Aggregation: ${winningDirection} | signals=${winningScore.count} | score=${winningScore.total.toFixed(3)} | conf=${(adjustedConfidence * 100).toFixed(0)}% | penalty=${penalty.toFixed(2)}`,
    );

    return {
      direction: meetsThresholds ? winningDirection : null,
      totalScore: winningScore.total,
      confidence: adjustedConfidence,
      signalCount: winningScore.count,
      appliedPenalty: penalty,
      analyzerBreakdown: winningScore.breakdown,
    };
  }

  /**
   * Calculate weighted score for signals in one direction
   */
  private calculateWeightedScore(
    signals: AnalyzerSignal[],
    weightsMap: Map<string, number>,
  ): {
    total: number;
    average: number;
    count: number;
    breakdown: Map<string, number>;
  } {
    if (signals.length === 0) {
      return {
        total: 0,
        average: 0,
        count: 0,
        breakdown: new Map(),
      };
    }

    let totalWeighted = 0;
    let totalWeight = 0;
    const breakdown = new Map<string, number>();

    for (const signal of signals) {
      const weight = weightsMap.get(signal.source) ?? 0;
      if (weight > 0) {
        const weighted = signal.confidence * weight;
        totalWeighted += weighted;
        totalWeight += weight;
        breakdown.set(signal.source, weighted);
      }
    }

    const average = totalWeight > 0 ? totalWeighted / totalWeight : 0;

    return {
      total: totalWeight > 0 ? average : 0,
      average,
      count: signals.length,
      breakdown,
    };
  }

  /**
   * Get analyzer weights from strategy
   * Only returns weights for ENABLED analyzers
   */
  private getAnalyzerWeights(): Map<string, number> {
    const weights = new Map<string, number>();

    for (const analyzer of this.strategy.analyzers) {
      if (analyzer.enabled) {
        weights.set(analyzer.name, analyzer.weight);
      }
    }

    return weights;
  }

  /**
   * Get strategy metadata
   */
  getStrategyName(): string {
    return this.strategy.metadata.name;
  }

  /**
   * Get strategy version
   */
  getStrategyVersion(): string {
    return this.strategy.metadata.version;
  }

  /**
   * Get enabled analyzers count
   */
  getEnabledAnalyzersCount(): number {
    return this.strategy.analyzers.filter((a) => a.enabled).length;
  }
}
