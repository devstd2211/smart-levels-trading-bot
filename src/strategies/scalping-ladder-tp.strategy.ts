import { PERCENT_MULTIPLIER } from '../constants';
/**
 * Scalping Ladder TP Strategy (Phase 3)
 *
 * Wrapper strategy that enhances exits with multi-level take profits:
 * - 3 TP levels (e.g., 0.08%, 0.15%, 0.25%)
 * - Partial closes (e.g., 33%, 33%, 34%)
 * - Move SL to breakeven after TP1
 * - Trailing SL after TP2
 *
 * This strategy does NOT generate its own signals.
 * Instead, it wraps base signal sources and enhances exit logic.
 *
 * R/R Ratio: ~1.26:1 (weighted average)
 *
 * Example flow:
 * 1. Base strategy (levelBased) generates LONG signal
 * 2. ScalpingLadderTpStrategy returns NO_SIGNAL (wrapper pattern)
 * 3. After position opens, ladder TPs are set up
 * 4. Monitor execution: TP1 → breakeven, TP2 → trailing, TP3 → full exit
 */

import {
  IStrategy,
  SignalDirection,
  StrategySignal,
  SignalType,
  StrategyMarketData,
  ScalpingLadderTpConfig,
  LoggerService,
  Position,
  LadderTpLevel,
  LadderTpManagerService,
} from '../types';
import { BybitService } from '../services/bybit/bybit.service';
import { IExchange } from '../interfaces/IExchange';

// ============================================================================
// SCALPING LADDER TP STRATEGY
// ============================================================================

export class ScalpingLadderTpStrategy implements IStrategy {
  readonly name = 'ScalpingLadderTp';
  readonly type = SignalType.SCALPING_LADDER_TP;
  readonly priority: number;

  private ladderManager: LadderTpManagerService;

  // Active ladder tracking
  private activeLadder: {
    position: Position;
    levels: LadderTpLevel[];
    tp1Hit: boolean;
    tp2Hit: boolean;
    tp3Hit: boolean;
  } | null = null;

  constructor(
    private config: ScalpingLadderTpConfig,
    private bybitService: IExchange,
    private logger: LoggerService,
  ) {
    this.priority = config.priority;

    // Initialize ladder manager
    this.ladderManager = new LadderTpManagerService(config.ladderManager, bybitService, logger);

    this.logger.info('✅ ScalpingLadderTpStrategy initialized', {
      enabled: config.enabled,
      priority: config.priority,
      levels: config.ladderManager.levels.length,
      baseSource: config.baseSignalSource,
    });
  }

  // ==========================================================================
  // STRATEGY INTERFACE
  // ==========================================================================

  /**
   * Evaluate strategy - wrapper pattern
   *
   * This strategy does NOT generate signals.
   * It only monitors existing positions for ladder TP execution.
   *
   * @param data - Market data
   * @returns Always NO_SIGNAL (wrapper strategy)
   */
  async evaluate(data: StrategyMarketData): Promise<StrategySignal> {
    // Monitor active ladder execution if exists
    if (this.activeLadder) {
      await this.monitorLadderExecution(data.candles[0].close);
    }

    // Wrapper strategy: always return NO_SIGNAL
    return this.noSignal('Wrapper strategy - does not generate signals');
  }

  // ==========================================================================
  // LADDER SETUP (called externally after position open)
  // ==========================================================================

  /**
   * Setup ladder TPs for new position
   *
   * Called by orchestrator after position is opened
   *
   * @param position - Newly opened position
   */
  async setupLadderTps(position: Position): Promise<void> {
    try {
      this.logger.info('🎯 Setting up ladder TPs', {
        side: position.side,
        entry: position.entryPrice,
        quantity: position.quantity,
      });

      // Determine direction from position side
      const direction = this.getDirectionFromPosition(position);

      // Create ladder levels
      const levels = this.ladderManager.createLadderLevels(position.entryPrice, direction);

      // Store active ladder
      this.activeLadder = {
        position,
        levels,
        tp1Hit: false,
        tp2Hit: false,
        tp3Hit: false,
      };

      this.logger.info('✅ Ladder TPs setup complete', {
        levels: levels.map((l) => ({
          level: l.level,
          targetPrice: l.targetPrice,
          closePercent: l.closePercent,
        })),
      });
    } catch (error) {
      this.logger.error('Failed to setup ladder TPs', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ==========================================================================
  // LADDER MONITORING
  // ==========================================================================

  /**
   * Monitor ladder TP execution
   *
   * Checks if TPs are hit and executes partial closes + SL adjustments
   *
   * @param currentPrice - Current market price
   */
  private async monitorLadderExecution(currentPrice: number): Promise<void> {
    if (!this.activeLadder) {
      return;
    }

    const { position, levels, tp1Hit, tp2Hit, tp3Hit } = this.activeLadder;
    const direction = this.getDirectionFromPosition(position);

    // Check TP1
    if (!tp1Hit && this.ladderManager.checkTpHit(levels[0], currentPrice, direction)) {
      await this.handleTp1Hit(levels[0]);
      this.activeLadder.tp1Hit = true;
      levels[0].hit = true;
    }

    // Check TP2
    if (tp1Hit && !tp2Hit && this.ladderManager.checkTpHit(levels[1], currentPrice, direction)) {
      await this.handleTp2Hit(levels[1]);
      this.activeLadder.tp2Hit = true;
      levels[1].hit = true;
    }

    // Check TP3
    if (tp2Hit && !tp3Hit && this.ladderManager.checkTpHit(levels[2], currentPrice, direction)) {
      await this.handleTp3Hit(levels[2]);
      this.activeLadder.tp3Hit = true;
      levels[2].hit = true;

      // All TPs hit - clear active ladder
      this.clearActiveLadder();
    }

    // Check max holding time
    if (this.isMaxHoldingTimeExceeded()) {
      this.logger.warn('Max holding time exceeded, closing position', {
        maxHoldingTimeMs: this.config.maxHoldingTimeMs,
      });
      this.clearActiveLadder();
    }
  }

  /**
   * Handle TP1 hit
   * - Execute partial close (33%)
   * - Move SL to breakeven
   */
  private async handleTp1Hit(level: LadderTpLevel): Promise<void> {
    if (!this.activeLadder) {
      return;
    }

    this.logger.info('🎯 TP1 HIT - Executing partial close + move to breakeven', {
      targetPrice: level.targetPrice,
      closePercent: level.closePercent,
    });

    // Execute partial close
    await this.ladderManager.executePartialClose(level, this.activeLadder.position);

    // Move SL to breakeven
    await this.ladderManager.moveToBreakeven(this.activeLadder.position);

    // Update position quantity
    this.activeLadder.position.quantity *= 1 - level.closePercent / PERCENT_MULTIPLIER;
  }

  /**
   * Handle TP2 hit
   * - Execute partial close (33%)
   * - Start trailing SL
   */
  private async handleTp2Hit(level: LadderTpLevel): Promise<void> {
    if (!this.activeLadder) {
      return;
    }

    this.logger.info('🎯 TP2 HIT - Executing partial close + trailing SL', {
      targetPrice: level.targetPrice,
      closePercent: level.closePercent,
    });

    // Execute partial close
    await this.ladderManager.executePartialClose(level, this.activeLadder.position);

    // Update position quantity
    this.activeLadder.position.quantity *= 1 - level.closePercent / PERCENT_MULTIPLIER;
  }

  /**
   * Handle TP3 hit
   * - Execute final close (34%)
   * - Clear ladder
   */
  private async handleTp3Hit(level: LadderTpLevel): Promise<void> {
    if (!this.activeLadder) {
      return;
    }

    this.logger.info('🎯 TP3 HIT - Executing final close', {
      targetPrice: level.targetPrice,
      closePercent: level.closePercent,
    });

    // Execute final close
    await this.ladderManager.executePartialClose(level, this.activeLadder.position);
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Get signal direction from position side
   */
  private getDirectionFromPosition(position: Position): SignalDirection {
    return position.side === 'LONG' ? SignalDirection.LONG : SignalDirection.SHORT;
  }

  /**
   * Check if max holding time exceeded
   */
  private isMaxHoldingTimeExceeded(): boolean {
    if (!this.activeLadder || this.config.maxHoldingTimeMs === 0) {
      return false;
    }

    const holdingTime = Date.now() - this.activeLadder.position.openedAt;
    return holdingTime >= this.config.maxHoldingTimeMs;
  }

  /**
   * Clear active ladder tracking
   */
  private clearActiveLadder(): void {
    this.logger.debug('Clearing active ladder', {
      tp1Hit: this.activeLadder?.tp1Hit,
      tp2Hit: this.activeLadder?.tp2Hit,
      tp3Hit: this.activeLadder?.tp3Hit,
    });

    this.activeLadder = null;
  }

  /**
   * Return no signal
   */
  private noSignal(reason: string): StrategySignal {
    return {
      valid: false,
      strategyName: this.name,
      priority: this.priority,
      reason,
    };
  }

  /**
   * Check if strategy is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get ladder manager (for testing)
   */
  getLadderManager(): LadderTpManagerService {
    return this.ladderManager;
  }

  /**
   * Get active ladder (for testing)
   */
  getActiveLadder(): typeof this.activeLadder {
    return this.activeLadder;
  }

  /**
   * Force clear active ladder (for testing)
   */
  forceClearLadder(): void {
    this.activeLadder = null;
  }
}
