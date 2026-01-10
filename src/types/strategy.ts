/**
 * Edison Trading Bot - Strategy Types
 * Types related to strategy evaluation and signal coordination
 */

import { SignalDirection } from './enums';
import type { Signal } from './core';

// ============================================================================
// STRATEGY WEIGHTS & RULES
// ============================================================================

/**
 * Strategy weights for signal coordination
 */
export interface StrategyWeights {
  ema: number; // EMA crossover weight (0-1)
  rsi: number; // RSI weight (0-1)
  zigzag: number; // ZigZag levels weight (0-1)
}

/**
 * Blocking rules for signal coordination
 */
export interface BlockingRules {
  emaBlocksAll: boolean; // EMA can block all signals
  rsiBlocksAll: boolean; // RSI can block all signals
  zigzagRequired: boolean; // ZigZag level required for entry
}

// ============================================================================
// STRATEGY SIGNALS
// ============================================================================

/**
 * Strategy evaluation result
 */
export interface StrategySignal {
  valid: boolean;
  signal?: Signal;
  reason?: string;
  strategyName: string;
  priority: number;
}

/**
 * Analyzer signal with weight and priority for signal coordination
 * Used by SignalCoordinator to aggregate multiple signals into a final decision
 */
export interface AnalyzerSignal {
  source: string; // Source identifier ("LevelBased", "EntryScanner", "RSI", etc)
  direction: SignalDirection; // LONG, SHORT, or HOLD
  confidence: number; // 0-100 (confidence percentage)
  weight: number; // 0.0-1.0 (importance multiplier)
  priority: number; // 1-10 (higher = more important)
  price?: number; // Signal price (added by orchestrator, not by analyzer)
  blockingReasons?: string[]; // Why blocked (for logging, but ignored in scoring)
  score?: number; // Computed score (confidence * weight)
}

/**
 * Signal coordinator result - final decision after aggregating multiple signals
 */
export interface CoordinatorResult {
  direction: SignalDirection; // Final direction (LONG, SHORT, or HOLD)
  totalScore: number; // Sum of weighted scores (0-1)
  confidence: number; // Average confidence of selected signals (0-100)
  signals: AnalyzerSignal[]; // All signals for selected direction
  reasoning: string; // Why this direction was chosen
  recommendedEntry: boolean; // Whether to enter based on thresholds
}

// ============================================================================
// STRATEGY EVALUATION
// ============================================================================

/**
 * Strategy evaluation result
 * Returned by IStrategy.evaluate()
 */
export interface StrategyEvaluation {
  shouldEnter: boolean; // Whether to enter position
  direction: SignalDirection; // Signal direction (LONG/SHORT)
  confidence?: number; // Confidence level (0-1)
  reason: string; // Reason for decision
  blockedBy?: string[]; // Blocking reasons if shouldEnter=false
  details?: Record<string, unknown>; // Additional details (strategy-specific)
}

// ============================================================================
// STRATEGY STATISTICS
// ============================================================================

/**
 * Strategy statistics
 */
export interface StrategyStats {
  count: number;
  wins: number;
  losses: number;
  winRate: number; // Percentage (0-100)
  totalPnl: number;
}

/**
 * Direction statistics (LONG/SHORT)
 */
export interface DirectionStats {
  count: number;
  wins: number;
  losses: number;
  winRate: number; // Percentage (0-100)
  totalPnl: number;
}
