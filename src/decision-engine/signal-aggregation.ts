/**
 * Signal Aggregation - Pure Functions (Phase 3.1)
 *
 * Unified system for weighted signal aggregation with conflict analysis.
 * Used by both Backtest and Production systems.
 *
 * Algorithm:
 * 1. Separate signals by direction (LONG vs SHORT)
 * 2. Calculate weighted scores for each direction
 * 3. Determine winning direction
 * 4. Analyze signal conflicts
 * 5. Apply blind zone penalty if needed
 * 6. Check thresholds
 * 7. Return final decision
 *
 * PURE FUNCTION: No side effects, no logger calls, all inputs as parameters
 */

import { AnalyzerSignal, SignalDirection } from '../types';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Configuration for signal aggregation
 */
export interface AggregationConfig {
  // Analyzer weights (from StrategyConfig)
  weights: Map<string, number>;

  // Score thresholds
  minTotalScore: number;        // 0.45 default (weighted score >= 45%)
  minConfidence: number;        // 0.75 default (75% confidence)

  // Conflict detection
  conflictThreshold: number;    // 0.4 default (40% minority votes = conflict)

  // Blind zone settings (optional)
  blindZone?: {
    minSignalsForLong: number;
    minSignalsForShort: number;
    longPenalty: number;        // 0.85 default (15% penalty)
    shortPenalty: number;       // 0.90 default (10% penalty)
  };
}

/**
 * Weighted score for signals in one direction
 */
export interface WeightedScore {
  total: number;                // Weighted average score
  average: number;              // Average confidence (0-1)
  count: number;                // Number of signals
  breakdown: Map<string, number>; // analyzer → weighted score
}

/**
 * Conflict analysis result
 */
export interface ConflictAnalysis {
  conflictLevel: number;        // 0-1 (0 = no conflict, 1 = max conflict)
  consensusStrength: number;    // 0-1 (1 = strong consensus)
  direction: SignalDirection | null;
  shouldWait: boolean;          // True if conflict too high
  reasoning: string;
}

/**
 * Final aggregation result
 */
export interface AggregationResult {
  direction: SignalDirection | null;
  totalScore: number;           // Weighted score
  confidence: number;           // 0-1 (after penalties)
  signalCount: number;          // Number of signals used
  appliedPenalty: number;       // 0.85-1.0 (penalty factor)
  analyzerBreakdown: Map<string, number>; // analyzer → weighted score
  conflictAnalysis: ConflictAnalysis;
}

// ============================================================================
// MAIN AGGREGATION FUNCTION
// ============================================================================

/**
 * Aggregate signals using weighted average with conflict analysis
 *
 * Pure function for signal aggregation. Used by both backtest and production.
 *
 * @param signals - Array of analyzer signals
 * @param config - Aggregation configuration with weights and thresholds
 * @returns AggregationResult with final direction and confidence
 *
 * @pure - No side effects, deterministic output
 */
export function aggregateSignalsWeighted(
  signals: AnalyzerSignal[],
  config: AggregationConfig,
): AggregationResult {
  // Handle empty signals
  if (signals.length === 0) {
    return {
      direction: null,
      totalScore: 0,
      confidence: 0,
      signalCount: 0,
      appliedPenalty: 1.0,
      analyzerBreakdown: new Map(),
      conflictAnalysis: {
        conflictLevel: 0,
        consensusStrength: 0,
        direction: null,
        shouldWait: false,
        reasoning: 'No signals available',
      },
    };
  }

  // =====================================================================
  // STEP 1: Group signals by direction
  // =====================================================================
  const longSignals = signals.filter((s) => s.direction === SignalDirection.LONG);
  const shortSignals = signals.filter((s) => s.direction === SignalDirection.SHORT);

  // =====================================================================
  // STEP 2: Calculate weighted scores for each direction
  // =====================================================================
  const longScore = calculateWeightedScore(longSignals, config.weights);
  const shortScore = calculateWeightedScore(shortSignals, config.weights);

  // =====================================================================
  // STEP 3: Determine winning direction
  // =====================================================================
  const winnerIsLong = longScore.total >= shortScore.total;
  const winningScore = winnerIsLong ? longScore : shortScore;
  const winningDirection = winnerIsLong ? SignalDirection.LONG : SignalDirection.SHORT;
  const losingScore = winnerIsLong ? shortScore : longScore;

  // =====================================================================
  // STEP 4: Analyze signal conflicts
  // =====================================================================
  const conflictAnalysis = analyzeSignalConflicts(
    longScore,
    shortScore,
    config.conflictThreshold,
  );

  // If conflict too high, wait instead of entering
  if (conflictAnalysis.shouldWait) {
    return {
      direction: null,
      totalScore: winningScore.total,
      confidence: winningScore.average,
      signalCount: winningScore.count,
      appliedPenalty: 1.0,
      analyzerBreakdown: winningScore.breakdown,
      conflictAnalysis,
    };
  }

  // =====================================================================
  // STEP 5: Apply blind zone penalty if needed
  // =====================================================================
  const penalty = applyBlindZonePenalty(winningScore, winningDirection, config.blindZone);

  // Apply penalty to confidence
  const adjustedConfidence = Math.min(1.0, winningScore.average * penalty);

  // =====================================================================
  // STEP 6: Check thresholds
  // =====================================================================
  const meetsThresholds = meetsThresholdChecks(
    winningScore.total,
    adjustedConfidence,
    config.minTotalScore,
    config.minConfidence,
  );

  return {
    direction: meetsThresholds ? winningDirection : null,
    totalScore: winningScore.total,
    confidence: adjustedConfidence,
    signalCount: winningScore.count,
    appliedPenalty: penalty,
    analyzerBreakdown: winningScore.breakdown,
    conflictAnalysis,
  };
}

// ============================================================================
// HELPER FUNCTIONS (all pure)
// ============================================================================

/**
 * Calculate weighted score for signals in one direction
 *
 * Weighted average = sum(confidence * weight) / sum(weight)
 *
 * @param signals - Signals in one direction
 * @param weights - Analyzer weights map
 * @returns WeightedScore with total, average, count, and breakdown
 * @pure
 */
export function calculateWeightedScore(
  signals: AnalyzerSignal[],
  weights: Map<string, number>,
): WeightedScore {
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
    const weight = weights.get(signal.source) ?? 0;
    if (weight > 0) {
      // Normalize confidence from 0-100 to 0-1 if needed
      const normalizedConfidence = signal.confidence > 1 ? signal.confidence / 100 : signal.confidence;
      const weighted = normalizedConfidence * weight;
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
 * Analyze signal conflicts (consensus vs disagreement)
 *
 * Conflict level = minority votes / directional votes
 * Consensus strength = majority votes / directional votes
 *
 * @param longScore - Weighted score for LONG signals
 * @param shortScore - Weighted score for SHORT signals
 * @param conflictThreshold - Threshold above which to wait (0-1)
 * @returns ConflictAnalysis with conflict level and consensus metrics
 * @pure
 */
export function analyzeSignalConflicts(
  longScore: WeightedScore,
  shortScore: WeightedScore,
  conflictThreshold: number,
): ConflictAnalysis {
  const totalSignals = longScore.count + shortScore.count;

  if (totalSignals === 0) {
    return {
      conflictLevel: 0,
      consensusStrength: 0,
      direction: null,
      shouldWait: false,
      reasoning: 'No signals available',
    };
  }

  // Calculate conflict metrics
  const minorityVotes = Math.min(longScore.count, shortScore.count);
  const majorityVotes = Math.max(longScore.count, shortScore.count);
  const conflictLevel = minorityVotes / totalSignals;
  const consensusStrength = majorityVotes / totalSignals;

  // Determine direction and whether to wait
  let direction: SignalDirection | null = null;
  let shouldWait = false;
  let reasoning = '';

  // Check for equal votes FIRST (highest priority)
  if (longScore.count === shortScore.count) {
    // Equal votes (e.g., 2 LONG, 2 SHORT) - NO CONSENSUS
    shouldWait = true;
    reasoning = `NO CONSENSUS: ${longScore.count} LONG = ${shortScore.count} SHORT. Equal votes, no clear direction.`;
    direction = null;

  } else if (conflictLevel > conflictThreshold) {
    // HIGH CONFLICT: Too many opposing signals (strictly greater than threshold)
    shouldWait = true;
    reasoning = `CONFLICT DETECTED: ${longScore.count} LONG vs ${shortScore.count} SHORT (${Math.round(
      conflictLevel * 100,
    )}% conflict). Signals disagree too much, waiting for clarity.`;
    direction = null;

  } else if (longScore.count > shortScore.count) {
    // LONG consensus
    direction = SignalDirection.LONG;
    reasoning = `LONG consensus: ${longScore.count}/${totalSignals} signals (conflict: ${Math.round(
      conflictLevel * 100,
    )}%)`;

  } else if (shortScore.count > longScore.count) {
    // SHORT consensus
    direction = SignalDirection.SHORT;
    reasoning = `SHORT consensus: ${shortScore.count}/${totalSignals} signals (conflict: ${Math.round(
      conflictLevel * 100,
    )}%)`;

  } else {
    // Fallback (should not reach here)
    direction = null;
    shouldWait = true;
    reasoning = 'Unable to determine consensus';
  }

  return {
    conflictLevel,
    consensusStrength,
    direction,
    shouldWait,
    reasoning,
  };
}

/**
 * Apply blind zone penalty if signal count below threshold
 *
 * Blind zone: region with few signals. Applies penalty to confidence.
 *
 * @param score - WeightedScore for winning direction
 * @param direction - Winning direction (LONG or SHORT)
 * @param blindZoneConfig - Blind zone configuration (optional)
 * @returns Penalty factor (0.85-1.0)
 * @pure
 */
export function applyBlindZonePenalty(
  score: WeightedScore,
  direction: SignalDirection,
  blindZoneConfig?: AggregationConfig['blindZone'],
): number {
  if (!blindZoneConfig) {
    return 1.0; // No penalty if config not provided
  }

  if (direction === SignalDirection.LONG) {
    const minSignals = blindZoneConfig.minSignalsForLong ?? 3;
    if (score.count < minSignals) {
      return blindZoneConfig.longPenalty ?? 0.85;
    }
  } else if (direction === SignalDirection.SHORT) {
    const minSignals = blindZoneConfig.minSignalsForShort ?? 3;
    if (score.count < minSignals) {
      return blindZoneConfig.shortPenalty ?? 0.90;
    }
  }

  return 1.0; // No penalty
}

/**
 * Check if aggregation meets minimum thresholds
 *
 * @param totalScore - Weighted score (0-1)
 * @param confidence - Confidence after penalties (0-1)
 * @param minScore - Minimum required score
 * @param minConfidence - Minimum required confidence
 * @returns true if both thresholds met
 * @pure
 */
export function meetsThresholdChecks(
  totalScore: number,
  confidence: number,
  minScore: number,
  minConfidence: number,
): boolean {
  return totalScore >= minScore && confidence >= minConfidence;
}

/**
 * Build aggregation config from analyzer weights and default thresholds
 *
 * Helper function to create AggregationConfig from StrategyConfig
 *
 * @param weights - Map of analyzer name to weight
 * @param options - Optional configuration overrides
 * @returns AggregationConfig ready for use
 * @pure
 */
export function buildAggregationConfig(
  weights: Map<string, number>,
  options?: {
    minTotalScore?: number;
    minConfidence?: number;
    conflictThreshold?: number;
    blindZone?: AggregationConfig['blindZone'];
  },
): AggregationConfig {
  return {
    weights,
    minTotalScore: options?.minTotalScore ?? 0.45,
    minConfidence: options?.minConfidence ?? 0.75,
    conflictThreshold: options?.conflictThreshold ?? 0.4,
    blindZone: options?.blindZone,
  };
}
