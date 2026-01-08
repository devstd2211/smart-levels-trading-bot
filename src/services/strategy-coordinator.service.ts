/**
 * Strategy Coordinator Service
 *
 * Coordinates multiple strategies using SCORE-BASED aggregation.
 * Instead of "FIRST VALID WINS", aggregates all signals with weights and priorities.
 *
 * Algorithm:
 * 1. Collect all strategy signals with confidence, weight, priority
 * 2. Group signals by direction (LONG / SHORT)
 * 3. Calculate weighted score for each direction: sum(confidence * weight) / sum(weight)
 * 4. Select direction with highest score
 * 5. Return result only if totalScore >= minTotalScore AND confidence >= minConfidence
 *
 * This solves the "micro-volatility block" problem where one strict filter blocks all entries.
 * With weighted scoring, multiple weaker signals can overcome a stronger negative signal.
 */

import { IStrategy, StrategyMarketData, StrategySignal, LoggerService, SignalDirection, AnalyzerSignal, CoordinatorResult } from '../types';
import { INTEGER_MULTIPLIERS } from '../constants';
import { MIN_TOTAL_SCORE_DEFAULT as MIN_TOTAL_SCORE_DEFAULT_CONST, MIN_CONFIDENCE_DEFAULT as MIN_CONFIDENCE_DEFAULT_CONST } from '../constants/technical.constants';

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_TOTAL_SCORE_DEFAULT = MIN_TOTAL_SCORE_DEFAULT_CONST;
const MIN_CONFIDENCE_DEFAULT = MIN_CONFIDENCE_DEFAULT_CONST;

// ============================================================================
// STRATEGY COORDINATOR SERVICE
// ============================================================================

export class StrategyCoordinator {
  private strategies: IStrategy[] = [];

  constructor(
    private logger: LoggerService,
    private minTotalScore: number = MIN_TOTAL_SCORE_DEFAULT,
    private minConfidence: number = MIN_CONFIDENCE_DEFAULT,
  ) {}

  /**
   * Register a strategy
   */
  registerStrategy(strategy: IStrategy): void {
    this.strategies.push(strategy);
    // Sort by priority (ascending - lower number = higher priority)
    this.strategies.sort((a, b) => a.priority - b.priority);
    this.logger.info(`Strategy registered: ${strategy.name} (priority ${strategy.priority})`);
  }

  /**
   * Unregister a strategy by name
   */
  unregisterStrategy(strategyName: string): boolean {
    const initialLength = this.strategies.length;
    this.strategies = this.strategies.filter((s) => s.name !== strategyName);
    const removed = this.strategies.length < initialLength;
    if (removed) {
      this.logger.info(`Strategy unregistered: ${strategyName}`);
    }
    return removed;
  }

  /**
   * Get all registered strategies (sorted by priority)
   */
  getStrategies(): IStrategy[] {
    return [...this.strategies];
  }

  /**
   * Clear all strategies
   */
  clearStrategies(): void {
    this.strategies = [];
    this.logger.info('All strategies cleared');
  }

  /**
   * Evaluate all strategies and aggregate signals using score-based coordination
   *
   * @param marketData - Market data to evaluate
   * @param excludeRealtimeStrategies - If true, excludes real-time strategies
   * @returns Strategy signal or null if no valid signals pass thresholds
   */
  async evaluateStrategies(
    marketData: StrategyMarketData,
    excludeRealtimeStrategies: boolean = true,
  ): Promise<StrategySignal | null> {
    if (this.strategies.length === 0) {
      this.logger.warn('No strategies registered');
      return null;
    }

    // Filter out real-time strategies
    const strategiesToEvaluate = excludeRealtimeStrategies
      ? this.strategies.filter(s => s.name !== 'WHALE_HUNTER' && s.name !== 'WHALE_HUNTER_FOLLOW')
      : this.strategies;

    if (strategiesToEvaluate.length === 0) {
      this.logger.warn('No strategies to evaluate (all filtered out)');
      return null;
    }

    this.logger.debug(`Evaluating ${strategiesToEvaluate.length} strategies`, {
      timestamp: marketData.timestamp,
      price: marketData.currentPrice,
    });

    // Collect all signals from all strategies
    const allSignals: AnalyzerSignal[] = [];

    for (const strategy of strategiesToEvaluate) {
      try {
        const result = await strategy.evaluate(marketData);

        this.logger.debug(`Strategy ${strategy.name} evaluated`, {
          valid: result.valid,
          confidence: result.signal?.confidence,
          reason: result.reason,
        });

        // If strategy returned a valid signal, convert to AnalyzerSignal
        if (result.valid && result.signal) {
          const analyzerSignal: AnalyzerSignal = {
            source: strategy.name,
            direction: result.signal.direction,
            confidence: result.signal.confidence,
            weight: this.getStrategyWeight(strategy.name),
            priority: strategy.priority,
          };
          allSignals.push(analyzerSignal);
        }
      } catch (error) {
        this.logger.error(`Strategy ${strategy.name} evaluation failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue to next strategy on error
      }
    }

    // If no valid signals, return null
    if (allSignals.length === 0) {
      this.logger.debug('No valid signals from any strategy');
      return null;
    }

    // Aggregate signals and make decision
    const result = this.coordinateSignals(allSignals);

    // Log coordinator result
    if (result.recommendedEntry) {
      this.logger.info(`✅ Coordinator Result: ${result.direction}`, {
        totalScore: (result.totalScore * INTEGER_MULTIPLIERS.ONE_HUNDRED).toFixed(1),
        confidence: result.confidence,
        reasoning: result.reasoning,
      });

      // Return as StrategySignal with coordinator name
      return {
        valid: true,
        signal: result.signals.length > 0 ? {
          direction: result.direction,
          type: undefined as any, // Not needed for coordinator
          confidence: result.confidence,
          price: marketData.currentPrice,
          stopLoss: marketData.currentPrice * 0.99,
          takeProfits: [],
          reason: result.reasoning,
          timestamp: marketData.timestamp,
        } : undefined,
        strategyName: 'SignalCoordinator',
        priority: 0,
        reason: result.reasoning,
      };
    } else {
      this.logger.debug('Coordinator result: no entry', {
        signals: allSignals.length,
        totalScore: (result.totalScore * INTEGER_MULTIPLIERS.ONE_HUNDRED).toFixed(1),
        confidence: result.confidence,
        minRequiredScore: (this.minTotalScore * INTEGER_MULTIPLIERS.ONE_HUNDRED).toFixed(1),
        minRequiredConfidence: this.minConfidence,
      });
      return null;
    }
  }

  /**
   * Coordinate (aggregate) multiple signals into a final decision
   *
   * Algorithm:
   * 1. Group signals by direction (LONG / SHORT)
   * 2. Calculate weighted score for each group
   * 3. Select direction with highest score
   * 4. Check if meets minimum thresholds
   *
   * @private
   */
  /**
   * Aggregate analyzer signals using weighted voting
   * Public method used by AnalyzerRegistry weighted voting path
   */
  aggregateSignals(signals: AnalyzerSignal[]): CoordinatorResult {
    return this.coordinateSignals(signals);
  }

  /**
   * Get minimum total score threshold
   */
  getMinTotalScore(): number {
    return this.minTotalScore;
  }

  /**
   * Get minimum confidence threshold
   */
  getMinConfidence(): number {
    return this.minConfidence;
  }

  private coordinateSignals(signals: AnalyzerSignal[]): CoordinatorResult {
    if (signals.length === 0) {
      return {
        direction: SignalDirection.HOLD,
        totalScore: 0,
        confidence: 0,
        signals: [],
        reasoning: 'No signals available',
        recommendedEntry: false,
      };
    }

    // Group by direction
    const longSignals = signals.filter(s => s.direction === SignalDirection.LONG);
    const shortSignals = signals.filter(s => s.direction === SignalDirection.SHORT);
    const holdSignals = signals.filter(s => s.direction === SignalDirection.HOLD);

    // Calculate weighted scores
    const longScore = this.calculateGroupScore(longSignals);
    const shortScore = this.calculateGroupScore(shortSignals);
    const holdScore = this.calculateGroupScore(holdSignals);

    // Determine winning direction
    let selectedDirection = SignalDirection.HOLD;
    let selectedScore = 0;
    let selectedSignals: AnalyzerSignal[] = [];

    if (longScore > shortScore && longScore > holdScore) {
      selectedDirection = SignalDirection.LONG;
      selectedScore = longScore;
      selectedSignals = longSignals;
    } else if (shortScore > longScore && shortScore > holdScore) {
      selectedDirection = SignalDirection.SHORT;
      selectedScore = shortScore;
      selectedSignals = shortSignals;
    } else if (holdScore > 0 && holdScore >= longScore && holdScore >= shortScore) {
      selectedDirection = SignalDirection.HOLD;
      selectedScore = holdScore;
      selectedSignals = holdSignals;
    }

    // Calculate average confidence
    const avgConfidence = selectedSignals.length > 0
      ? selectedSignals.reduce((sum, s) => sum + s.confidence, 0) / selectedSignals.length
      : 0;

    // ✨ NEW: Check for signal conflicts (FIX #2)
    const opposingSignals = selectedDirection === SignalDirection.LONG ? shortSignals : longSignals;
    const conflictPenalty = this.detectSignalConflict(selectedSignals, opposingSignals);

    // ✨ NEW: Check opposing signal strength (FIX #3)
    const opposingPenalty = this.checkOpposingSignalStrength(selectedSignals, opposingSignals, selectedDirection);

    // ✨ NEW: Check time-based risk (night trading penalty)
    const nightTimePenalty = this.checkNightTimePenalty();

    // Apply all penalties to confidence (stacked multipliers)
    const adjustedConfidence = Math.round(avgConfidence * conflictPenalty * opposingPenalty * nightTimePenalty);

    // Check thresholds
    const meetsThresholds = selectedDirection !== SignalDirection.HOLD &&
      selectedScore >= this.minTotalScore &&
      adjustedConfidence >= this.minConfidence;

    const reasoning = this.buildReasoning(
      selectedDirection,
      selectedScore,
      adjustedConfidence,
      selectedSignals,
      meetsThresholds,
    );

    return {
      direction: selectedDirection,
      totalScore: selectedScore,
      confidence: adjustedConfidence,
      signals: selectedSignals,
      reasoning,
      recommendedEntry: meetsThresholds,
    };
  }

  /**
   * Calculate weighted score for a group of signals
   * Formula: sum(confidence * weight) / sum(weight)
   * Result: normalized 0-1
   *
   * @private
   */
  private calculateGroupScore(signals: AnalyzerSignal[]): number {
    if (signals.length === 0) return 0;

    const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
    if (totalWeight === 0) return 0;

    // Calculate weighted average: sum(conf * weight) / sum(weight)
    const weightedScore = signals.reduce(
      (sum, s) => sum + (s.confidence / INTEGER_MULTIPLIERS.ONE_HUNDRED) * s.weight,
      0,
    );

    return Math.min(weightedScore / totalWeight, 1.0);
  }

  /**
   * Detect signal direction conflict (FIX #2)
   *
   * Flags when indicators are strongly disagreeing on direction
   * Returns confidence penalty multiplier:
   * - 0.75 (25% penalty): Major conflict
   * - 0.85 (15% penalty): Minor conflict
   * - 1.0 (no penalty): No conflict
   *
   * Example: 5 SHORT vs 3 LONG with 15% confidence difference = CONFLICT
   *
   * @private
   */
  private detectSignalConflict(
    selectedSignals: AnalyzerSignal[],
    opposingSignals: AnalyzerSignal[],
  ): number {
    if (selectedSignals.length === 0 || opposingSignals.length === 0) {
      return 1.0; // No conflict if one side empty
    }

    const selectedCount = selectedSignals.length;
    const opposingCount = opposingSignals.length;

    // Calculate average confidences
    const selectedAvgConf = selectedSignals.reduce((sum, s) => sum + s.confidence, 0) / selectedCount;
    const opposingAvgConf = opposingSignals.reduce((sum, s) => sum + s.confidence, 0) / opposingCount;

    // Calculate imbalance ratio (higher = more imbalanced)
    const countRatio = Math.max(selectedCount, opposingCount) / Math.min(selectedCount, opposingCount);
    const confDiff = Math.abs(selectedAvgConf - opposingAvgConf);

    // Log conflict analysis
    this.logger.debug('📊 Signal Conflict Analysis', {
      selectedCount,
      opposingCount,
      selectedAvgConf: Math.round(selectedAvgConf),
      opposingAvgConf: Math.round(opposingAvgConf),
      countRatio: countRatio.toFixed(2),
      confDiff: Math.round(confDiff),
    });

    // CONFLICT: Many indicators on one side, few on other, with similar confidence
    // Example: 5 SHORT vs 3 LONG with 15% confidence difference = CONFLICT
    if (countRatio > 1.5 && confDiff < 15) {
      this.logger.warn('⚠️ CONFLICT DETECTED: Indicators disagree strongly on direction', {
        selectedCount,
        opposingCount,
        countRatio: countRatio.toFixed(2),
        confDiff: Math.round(confDiff),
        penalty: '25%',
      });
      return 0.75; // 25% penalty
    }

    // MINOR CONFLICT: Imbalanced but reasonable confidence difference
    if (countRatio > 1.3 && confDiff < 20) {
      this.logger.warn('⚠️ MINOR CONFLICT: Slight indicator disagreement detected', {
        selectedCount,
        opposingCount,
        countRatio: countRatio.toFixed(2),
        confDiff: Math.round(confDiff),
        penalty: '15%',
      });
      return 0.85; // 15% penalty
    }

    return 1.0; // No conflict
  }

  /**
   * Check if opposing direction has stronger or close signal (FIX #3)
   *
   * Catches when the strongest indicator opposes the winning direction
   * Returns confidence penalty multiplier:
   * - 0.8 (20% penalty): Major risk
   * - 0.9 (10% penalty): Minor risk
   * - 1.0 (no penalty): Safe
   *
   * @private
   */
  private checkOpposingSignalStrength(
    selectedSignals: AnalyzerSignal[],
    opposingSignals: AnalyzerSignal[],
    selectedDirection: SignalDirection,
  ): number {
    if (selectedSignals.length === 0 || opposingSignals.length === 0) {
      return 1.0; // No opposing signals
    }

    // Find strongest signal in each group
    const selectedBest = Math.max(...selectedSignals.map(s => s.confidence));
    const opposingBest = Math.max(...opposingSignals.map(s => s.confidence));

    // If selected side's strongest signal is stronger → safe
    if (selectedBest >= opposingBest) {
      return 1.0; // No penalty needed
    }

    // If opposing side's strongest signal is stronger → risky
    const signalDiff = opposingBest - selectedBest;

    this.logger.warn('⚠️ Opposing signal stronger than selected direction', {
      selectedDirection,
      selectedBest: `${selectedBest}%`,
      opposingBest: `${opposingBest}%`,
      diff: `${signalDiff}%`,
    });

    // If difference > 10%, apply 20% penalty
    if (signalDiff > 10) {
      this.logger.error('❌ MAJOR RISK: Strongest indicator opposes selected direction!', {
        selectedDirection,
        diff: signalDiff,
        penalty: '20%',
      });
      return 0.8; // 20% penalty
    }

    // If difference 5-10%, apply 10% penalty
    if (signalDiff > 5) {
      this.logger.warn('⚠️ RISK: Strongest indicator close to selected direction', {
        selectedDirection,
        diff: signalDiff,
        penalty: '10%',
      });
      return 0.9; // 10% penalty
    }

    return 1.0; // Safe - difference is minimal
  }

  /**
   * Check night trading time penalty (UTC 02:00-04:00)
   *
   * Night trading produces 100% losing trades in backtests.
   * Apply 25% confidence reduction (0.75x) during night hours.
   * Does NOT block signals - allows them through with reduced confidence.
   *
   * Rationale: Low liquidity and false signals at night, but occasional
   * sharp movements (flash crash/pump) might present real opportunities.
   * Conservative approach: reduce confidence but keep signals alive.
   *
   * @private
   */
  private checkNightTimePenalty(): number {
    const now = new Date();
    const utcHours = now.getUTCHours();

    // Night trading window: UTC 02:00 - 04:59 (low liquidity period)
    const isNightTime = utcHours >= 2 && utcHours < 5;

    if (isNightTime) {
      this.logger.warn('⏰ NIGHT TRADING PENALTY: UTC 02:00-05:00 detected', {
        utcHours,
        penalty: '25%',
        reason: 'Low liquidity period with high false signal rate',
      });
      return 0.75; // 25% confidence reduction
    }

    return 1.0; // No penalty during day hours
  }

  /**
   * Get weight for a strategy/analyzer (can be customized per source)
   * Includes:
   * - Main strategies (LevelBased, TrendFollowing, CounterTrend, EntryScanner)
   * - SMC components (FVG, OrderBlocks, Footprint)
   * - Technical filters (ATH, EMA, RSI, Volume, Liquidity)
   * - Advanced analyzers (Divergence, CHOCH, Imbalance)
   *
   * @private
   */
  private getStrategyWeight(strategyName: string): number {
    // Default weights - organized by category
    const weights: Record<string, number> = {
      // Main Strategies (0.2 - 0.4)
      'LEVEL_BASED': 0.4,
      'TREND_FOLLOWING': 0.35,
      'COUNTER_TREND': 0.25,
      'ENTRY_SCANNER': 0.3,
      'REVERSAL': 0.2,

      // SMC Components (0.15 - 0.25) - Smart Money Concepts
      'FAIR_VALUE_GAP': 0.2,     // FVG detector
      'ORDER_BLOCK': 0.22,       // Order block detector
      'FOOTPRINT': 0.18,         // Footprint indicator

      // Trend & Structure (0.15 - 0.25)
      'TREND_DETECTOR': 0.25,
      'CHOCH_BOS': 0.2,          // Change of Character / Break of Structure
      'SWING_DETECTOR': 0.18,

      // Price Action & Liquidity (0.12 - 0.2)
      'LIQUIDITY_SWEEP': 0.18,
      'LIQUIDITY_ZONE': 0.15,
      'PRICE_ACTION': 0.16,

      // Technical Indicators (0.1 - 0.2)
      'RSI_ANALYZER': 0.15,
      'EMA_ANALYZER': 0.12,
      'ATR_ANALYZER': 0.12,
      'VOLUME_ANALYZER': 0.14,
      'STOCHASTIC': 0.12,
      'BOLLINGER_BANDS': 0.13,

      // Advanced Analysis (0.1 - 0.15)
      'DIVERGENCE': 0.15,
      'IMBALANCE': 0.13,
      'WHALE_DETECTOR': 0.2,     // Higher weight - actual whale money
      'WHALE_HUNTER': 0.22,
      'WHALE_HUNTER_FOLLOW': 0.2,

      // Filters & Protections (0.08 - 0.12)
      'ATH_PROTECTION': 0.1,
      'EMA_FILTER': 0.1,
      'RSI_FILTER': 0.09,
      'VOLUME_FILTER': 0.09,
      'FUNDING_RATE_FILTER': 0.08,
      'BTC_CORRELATION': 0.12,    // Bitcoin alignment
      'SESSION_FILTER': 0.08,

      // Scalping Strategies (0.15 - 0.25)
      'SCALPING_MICRO_WALL': 0.18,
      'SCALPING_TICK_DELTA': 0.2,
      'SCALPING_LADDER_TP': 0.17,
      'SCALPING_LIMIT_ORDER': 0.16,
      'SCALPING_ORDER_FLOW': 0.19,
    };

    return weights[strategyName] ?? 0.15; // Default 0.15 for unknown
  }

  /**
   * Build reasoning string for coordinator result
   *
   * @private
   */
  private buildReasoning(
    direction: SignalDirection,
    score: number,
    confidence: number,
    signals: AnalyzerSignal[],
    meetsThresholds: boolean,
  ): string {
    if (direction === SignalDirection.HOLD) {
      return 'No clear direction: signals balanced or below threshold';
    }

    const sources = signals
      .sort((a, b) => (b.confidence / b.weight) - (a.confidence / a.weight))
      .slice(0, 3)
      .map(s => `${s.source}(${s.confidence}%,w${(s.weight * 10).toFixed(0)})`)
      .join(', ');

    const scorePercent = (score * INTEGER_MULTIPLIERS.ONE_HUNDRED).toFixed(1);
    const status = meetsThresholds ? '✅' : '⚠️';

    return `${status} ${direction} | Score: ${scorePercent}% (min ${(this.minTotalScore * INTEGER_MULTIPLIERS.ONE_HUNDRED).toFixed(0)}%) | Conf: ${Math.round(confidence)}% (min ${this.minConfidence}%) | Sources: ${sources}`;
  }

  /**
   * Set thresholds for coordinator
   */
  setThresholds(minTotalScore: number, minConfidence: number): void {
    this.minTotalScore = minTotalScore;
    this.minConfidence = minConfidence;
    this.logger.info('Coordinator thresholds updated', {
      minTotalScore: (minTotalScore * INTEGER_MULTIPLIERS.ONE_HUNDRED).toFixed(1),
      minConfidence,
    });
  }

  /**
   * Get strategy count
   */
  getStrategyCount(): number {
    return this.strategies.length;
  }

  /**
   * Check if a strategy is registered
   */
  hasStrategy(strategyName: string): boolean {
    return this.strategies.some((s) => s.name === strategyName);
  }
}
