/**
 * Strategy Coordinator Service - Phase 3 (Pure Strategy Coordinator)
 *
 * Central hub for coordinating analyzer execution and signal aggregation.
 * ARCHITECTURE: Wraps pure functions from decision-engine/signal-aggregation.ts
 *
 * Responsibilities:
 * 1. Load enabled analyzers from registry based on strategy config
 * 2. Execute analyzers in parallel with Promise.all()
 * 3. Collect and validate analyzer signals
 * 4. Aggregate signals using pure aggregateSignalsWeighted() function
 * 5. Return final aggregation result for EntryOrchestrator
 *
 * Design Pattern: Service wrapper around pure functions (Phase 0.3 pattern)
 * - Pure logic in signal-aggregation.ts (no side effects)
 * - Service provides: logging, error handling, caching, DI
 * - All entry decisions remain deterministic
 *
 * Integration Points:
 * - Wired by TradingOrchestrator (analyzer execution on every candle)
 * - Called by EntryOrchestrator (to get aggregated signals before entry decision)
 * - Uses AnalyzerRegistry (DI to get enabled analyzers)
 * - Uses LoggerService (for debugging, not decision-making)
 */

import type { Candle } from '../types/core';
import type { AnalyzerSignal } from '../types/strategy';
import type { SignalDirection } from '../types/enums';
import { LoggerService } from './logger.service';
import type { AnalyzerRegistryService } from './analyzer-registry.service';
import {
  aggregateSignalsWeighted,
  AggregationConfig,
  AggregationResult,
} from '../decision-engine/signal-aggregation';
import type { StrategyConfig } from '../types/strategy-config.types';
import type { IAnalyzer } from '../types/analyzer.interface';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of strategy coordination (analyzer execution + aggregation)
 */
export interface StrategyCoordinationResult {
  // Aggregation result
  aggregation: AggregationResult;

  // Metadata
  analyzersExecuted: number;
  executionTimeMs: number;
  timestamp: number;

  // Error tracking
  analyzerErrors?: Array<{
    analyzerName: string;
    error: string;
  }>;
}

/**
 * Configuration for strategy coordinator
 */
export interface StrategyCoordinatorConfig {
  // Aggregation thresholds
  minTotalScore?: number; // default 0.45 (45% weighted score)
  minConfidence?: number; // default 0.75 (75% confidence)
  conflictThreshold?: number; // default 0.4 (40% minority = conflict)

  // Blind zone
  blindZone?: {
    minSignalsForLong?: number; // default 3
    minSignalsForShort?: number; // default 3
    longPenalty?: number; // default 0.85 (15% penalty)
    shortPenalty?: number; // default 0.90 (10% penalty)
  };

  // Execution options
  parallelExecution?: boolean; // default true (Promise.all)
  errorHandling?: 'strict' | 'lenient'; // default 'lenient' (one failure doesn't crash)
  minReadyAnalyzers?: number; // default 1 (min analyzers ready before aggregating)
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_STRATEGY_COORDINATOR_CONFIG: Required<StrategyCoordinatorConfig> = {
  minTotalScore: 0.45,
  minConfidence: 0.75,
  conflictThreshold: 0.4,
  blindZone: {
    minSignalsForLong: 3,
    minSignalsForShort: 3,
    longPenalty: 0.85,
    shortPenalty: 0.90,
  },
  parallelExecution: true,
  errorHandling: 'lenient',
  minReadyAnalyzers: 1,
};

// ============================================================================
// STRATEGY COORDINATOR SERVICE
// ============================================================================

export class StrategyCoordinatorService {
  private config: Required<StrategyCoordinatorConfig>;

  constructor(
    private analyzerRegistry: AnalyzerRegistryService,
    private logger?: LoggerService,
  ) {
    this.config = { ...DEFAULT_STRATEGY_COORDINATOR_CONFIG } as Required<StrategyCoordinatorConfig>;
  }

  /**
   * Update strategy coordinator configuration
   * Used to apply custom threshold and blind zone settings
   */
  setConfig(config: StrategyCoordinatorConfig): void {
    // Merge blindZone separately to handle optional fields
    const blindZone = config.blindZone
      ? {
          minSignalsForLong: config.blindZone.minSignalsForLong ?? this.config.blindZone.minSignalsForLong,
          minSignalsForShort: config.blindZone.minSignalsForShort ?? this.config.blindZone.minSignalsForShort,
          longPenalty: config.blindZone.longPenalty ?? this.config.blindZone.longPenalty,
          shortPenalty: config.blindZone.shortPenalty ?? this.config.blindZone.shortPenalty,
        }
      : this.config.blindZone;

    const newConfig: Required<StrategyCoordinatorConfig> = {
      minTotalScore: config.minTotalScore ?? this.config.minTotalScore,
      minConfidence: config.minConfidence ?? this.config.minConfidence,
      conflictThreshold: config.conflictThreshold ?? this.config.conflictThreshold,
      blindZone,
      parallelExecution: config.parallelExecution ?? this.config.parallelExecution,
      errorHandling: config.errorHandling ?? this.config.errorHandling,
      minReadyAnalyzers: config.minReadyAnalyzers ?? this.config.minReadyAnalyzers,
    };

    this.config = newConfig;

    if (this.logger) {
      this.logger.debug(
        `[StrategyCoordinator] Config updated: minConfidence=${this.config.minConfidence}, parallelExecution=${this.config.parallelExecution}`,
      );
    }
  }

  /**
   * Main entry point: Execute strategy (run analyzers + aggregate signals)
   *
   * Flow:
   * 1. Get enabled analyzers from registry
   * 2. Check if analyzers are ready (have enough candles)
   * 3. Execute analyzers in parallel (Promise.all) or sequence
   * 4. Handle errors based on errorHandling mode
   * 5. Aggregate signals using pure function
   * 6. Return coordination result
   *
   * @param candles Current market candles (all timeframes)
   * @param strategyConfig Strategy configuration (weights, enabled analyzers)
   * @returns Strategy coordination result with aggregation
   * @throws Error if critical failure and errorHandling='strict'
   */
  async coordinateStrategy(
    candles: Candle[],
    strategyConfig: StrategyConfig,
  ): Promise<StrategyCoordinationResult> {
    const startTime = Date.now();
    const analyzerErrors: Array<{ analyzerName: string; error: string }> = [];

    try {
      // ========== STEP 1: Load enabled analyzers ==========
      const enabledAnalyzers = await this.analyzerRegistry.getEnabledAnalyzers(
        strategyConfig.analyzers,
        strategyConfig,
      );

      if (enabledAnalyzers.size === 0) {
        throw new Error(
          '[StrategyCoordinator] No analyzers enabled in strategy config',
        );
      }

      if (this.logger) {
        this.logger.debug(
          `[StrategyCoordinator] Executing ${enabledAnalyzers.size} analyzers`,
        );
      }

      // ========== STEP 2: Filter ready analyzers ==========
      const readyAnalyzers = new Map<string, IAnalyzer>();
      const notReadyAnalyzers: string[] = [];

      for (const [analyzerName, analyzerData] of enabledAnalyzers) {
        const analyzer = analyzerData.instance;

        // Check if analyzer has enough candles
        if (analyzer.isReady(candles)) {
          readyAnalyzers.set(analyzerName, analyzer);
        } else {
          notReadyAnalyzers.push(analyzerName);
        }
      }

      if (readyAnalyzers.size === 0) {
        throw new Error(
          `[StrategyCoordinator] No analyzers ready (need ${enabledAnalyzers
            .values()
            .next()
            .value?.instance.getMinCandlesRequired()} candles)`,
        );
      }

      if (notReadyAnalyzers.length > 0 && this.logger) {
        this.logger.debug(
          `[StrategyCoordinator] ${notReadyAnalyzers.length} analyzers not ready (skipped)`,
          { skipped: notReadyAnalyzers },
        );
      }

      // ========== STEP 3: Execute analyzers ==========
      const signals: AnalyzerSignal[] = [];

      if (this.config.parallelExecution) {
        // Execute in parallel (faster, better for many analyzers)
        const signalPromises = Array.from(readyAnalyzers).map(([name, analyzer]) =>
          this.executeAnalyzer(name, analyzer, candles, analyzerErrors),
        );

        const results = await Promise.all(signalPromises);
        signals.push(...results.filter((s) => s !== null) as AnalyzerSignal[]);
      } else {
        // Execute sequentially (helpful for debugging)
        for (const [name, analyzer] of readyAnalyzers) {
          const signal = await this.executeAnalyzer(name, analyzer, candles, analyzerErrors);
          if (signal) {
            signals.push(signal);
          }
        }
      }

      // ========== STEP 4: Check minimum analyzers ==========
      if (signals.length < this.config.minReadyAnalyzers) {
        if (this.config.errorHandling === 'strict') {
          throw new Error(
            `[StrategyCoordinator] Only ${signals.length} analyzers produced signals ` +
              `(min required: ${this.config.minReadyAnalyzers})`,
          );
        } else if (this.logger) {
          this.logger.warn(
            `[StrategyCoordinator] Only ${signals.length} analyzers produced signals`,
          );
        }
      }

      // ========== STEP 5: Build aggregation config ==========
      const aggregationConfig: AggregationConfig = {
        weights: this.extractAnalyzerWeights(enabledAnalyzers),
        minTotalScore: this.config.minTotalScore,
        minConfidence: this.config.minConfidence,
        conflictThreshold: this.config.conflictThreshold,
        blindZone: {
          minSignalsForLong: this.config.blindZone.minSignalsForLong!,
          minSignalsForShort: this.config.blindZone.minSignalsForShort!,
          longPenalty: this.config.blindZone.longPenalty!,
          shortPenalty: this.config.blindZone.shortPenalty!,
        },
      };

      // ========== STEP 6: Aggregate signals (pure function) ==========
      const aggregationResult = aggregateSignalsWeighted(
        signals,
        aggregationConfig,
      );

      if (this.logger) {
        this.logger.debug(
          `[StrategyCoordinator] Aggregation result: ` +
            `direction=${aggregationResult.direction}, ` +
            `confidence=${(aggregationResult.confidence * 100).toFixed(1)}%, ` +
            `signalCount=${aggregationResult.signalCount}`,
        );
      }

      // ========== STEP 7: Build coordination result ==========
      const executionTimeMs = Date.now() - startTime;

      return {
        aggregation: aggregationResult,
        analyzersExecuted: readyAnalyzers.size,
        executionTimeMs,
        timestamp: Date.now(),
        analyzerErrors: analyzerErrors.length > 0 ? analyzerErrors : undefined,
      };
    } catch (error) {
      if (this.logger) {
        this.logger.error(
          '[StrategyCoordinator] Critical error during coordination',
          { errorMessage: error instanceof Error ? error.message : String(error) },
        );
      }

      if (this.config.errorHandling === 'strict') {
        throw error;
      }

      // Fallback: return neutral aggregation on lenient mode
      return {
        aggregation: {
          direction: null,
          totalScore: 0,
          confidence: 0,
          signalCount: 0,
          appliedPenalty: 1.0,
          analyzerBreakdown: new Map(),
          conflictAnalysis: {
            conflictLevel: 1.0,
            consensusStrength: 0,
            direction: null,
            shouldWait: true,
            reasoning: 'Strategy coordinator encountered critical error',
          },
        },
        analyzersExecuted: 0,
        executionTimeMs: Date.now() - startTime,
        timestamp: Date.now(),
        analyzerErrors: [
          {
            analyzerName: 'system',
            error: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }

  /**
   * Execute single analyzer with error handling
   * Returns signal or null if error (depending on errorHandling mode)
   */
  private async executeAnalyzer(
    analyzerName: string,
    analyzer: IAnalyzer,
    candles: Candle[],
    errorLog: Array<{ analyzerName: string; error: string }>,
  ): Promise<AnalyzerSignal | null> {
    try {
      // Analyzer.analyze() is synchronous, but we await for consistency
      const signal = analyzer.analyze(candles);

      // Validate signal structure
      if (!signal || typeof signal.direction === 'undefined') {
        throw new Error('Invalid signal structure (missing direction)');
      }

      return signal;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (this.logger) {
        this.logger.warn(
          `[StrategyCoordinator] Analyzer "${analyzerName}" failed: ${errorMsg}`,
        );
      }

      errorLog.push({
        analyzerName,
        error: errorMsg,
      });

      if (this.config.errorHandling === 'strict') {
        throw error;
      }

      return null; // Skip this analyzer, continue with others
    }
  }

  /**
   * Extract weights from enabled analyzers
   * Used to build AggregationConfig for pure function
   */
  private extractAnalyzerWeights(
    enabledAnalyzers: Map<
      string,
      {
        instance: IAnalyzer;
        weight: number;
        priority: number;
      }
    >,
  ): Map<string, number> {
    const weights = new Map<string, number>();

    for (const [name, data] of enabledAnalyzers) {
      weights.set(name, data.weight);
    }

    return weights;
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<StrategyCoordinatorConfig> {
    return { ...this.config };
  }

  /**
   * Reset configuration to defaults
   */
  resetConfig(): void {
    this.config = { ...DEFAULT_STRATEGY_COORDINATOR_CONFIG };
    if (this.logger) {
      this.logger.debug('[StrategyCoordinator] Config reset to defaults');
    }
  }
}
