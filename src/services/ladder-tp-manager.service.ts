import { PERCENT_MULTIPLIER, PRICE_TOLERANCE, INTEGER_MULTIPLIERS } from '../constants';
/**
 * Ladder TP Manager Service (Phase 3)
 *
 * Manages multi-level take profit execution for scalping strategies.
 *
 * Features:
 * - 3 TP levels with partial closes (e.g., 0.08%, 0.15%, 0.25%)
 * - Position closes: 33%, 33%, 34%
 * - Move SL to breakeven after TP1
 * - Trailing SL after TP2
 * - R/R Ratio: ~1.26:1 (weighted average)
 *
 * Example:
 * Entry: 1.0000 LONG
 * TP1: 1.0008 (33% close) → Move SL to 1.0000 (breakeven)
 * TP2: 1.0015 (33% close) → Trailing SL activated
 * TP3: 1.0025 (34% close) → Full exit
 */

import {
  LoggerService,
  SignalDirection,
  PositionSide,
  LadderTpManagerConfig,
  LadderTpLevel,
  Position,
} from '../types';
import type { IExchange } from '../interfaces/IExchange';

// ============================================================================
// CONSTANTS
// ============================================================================

// Read from config: minPartialClosePercent, maxPartialClosePercent

// ============================================================================
// LADDER TP MANAGER SERVICE
// ============================================================================

export class LadderTpManagerService {
  constructor(
    private config: LadderTpManagerConfig,
    private bybitService: IExchange,
    private logger: LoggerService,
  ) {
    this.logger.info('LadderTpManagerService initialized', {
      levels: config.levels.length,
      moveToBreakeven: config.moveToBreakevenAfterTP1,
      trailing: config.trailingAfterTP2,
      trailingDistance: config.trailingDistancePercent,
    });

    // Validate config
    this.validateConfig();
  }

  // ==========================================================================
  // PUBLIC METHODS
  // ==========================================================================

  /**
   * Create ladder TP levels for position
   *
   * Calculates TP prices based on entry price and direction
   *
   * @param entry - Entry price
   * @param direction - Signal direction (LONG/SHORT)
   * @returns Array of ladder TP levels
   */
  createLadderLevels(entry: number, direction: SignalDirection): LadderTpLevel[] {
    this.logger.debug('Creating ladder TP levels', {
      entry,
      direction,
      levelsCount: this.config.levels.length,
    });

    const levels: LadderTpLevel[] = this.config.levels.map((levelConfig, index) => {
      // Calculate target price
      let targetPrice: number;
      if (direction === SignalDirection.LONG) {
        // LONG: TP above entry
        targetPrice = entry * (1 + levelConfig.pricePercent / PERCENT_MULTIPLIER);
      } else {
        // SHORT: TP below entry
        targetPrice = entry * (1 - levelConfig.pricePercent / PERCENT_MULTIPLIER);
      }

      return {
        level: index + 1,
        pricePercent: levelConfig.pricePercent,
        closePercent: levelConfig.closePercent,
        targetPrice,
        hit: false,
      };
    });

    this.logger.info('✅ Ladder TP levels created', {
      direction,
      levels: levels.map((l) => ({
        level: l.level,
        price: l.targetPrice,
        closePercent: l.closePercent,
      })),
    });

    return levels;
  }

  /**
   * Check if TP level was hit
   *
   * Compares current price with TP target price
   *
   * @param level - TP level to check
   * @param currentPrice - Current market price
   * @param direction - Signal direction (LONG/SHORT)
   * @returns True if TP was hit
   */
  checkTpHit(level: LadderTpLevel, currentPrice: number, direction: SignalDirection): boolean {
    if (level.hit) {
      return false; // Already hit
    }

    // Calculate tolerance
    const tolerance = level.targetPrice * (PRICE_TOLERANCE.TP_HIT_DETECTION_PERCENT / PERCENT_MULTIPLIER);

    let isHit: boolean;
    if (direction === SignalDirection.LONG) {
      // LONG: current price >= target price
      isHit = currentPrice >= level.targetPrice - tolerance;
    } else {
      // SHORT: current price <= target price
      isHit = currentPrice <= level.targetPrice + tolerance;
    }

    if (isHit) {
      this.logger.info(`🎯 TP${level.level} HIT!`, {
        targetPrice: level.targetPrice,
        currentPrice,
        closePercent: level.closePercent,
      });
    }

    return isHit;
  }

  /**
   * Execute partial close for TP level
   *
   * Closes specified % of position via Bybit API
   *
   * @param level - TP level to execute
   * @param position - Current position
   * @returns True if close successful
   */
  async executePartialClose(level: LadderTpLevel, position: Position): Promise<boolean> {
    try {
      // Calculate quantity to close
      const closeQty = position.quantity * (level.closePercent / PERCENT_MULTIPLIER);

      if (closeQty < 0.01) {
        this.logger.warn('Close quantity too small, skipping partial close', {
          level: level.level,
          closeQty,
          minQty: 0.01,
        });
        return false;
      }

      this.logger.info(`💰 Executing TP${level.level} partial close`, {
        level: level.level,
        closePercent: level.closePercent,
        closeQty,
        targetPrice: level.targetPrice,
      });

      // Execute partial close via Bybit (convert quantity to percentage)
      await this.bybitService.closePosition({
        positionId: position.id,
        percentage: level.closePercent,
      });

      this.logger.info(`✅ TP${level.level} partial close executed`, {
        level: level.level,
        closedQty: closeQty,
      });

      return true;
    } catch (error) {
      this.logger.error(`Failed to execute TP${level.level} partial close`, {
        level: level.level,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Move SL to breakeven (entry price)
   *
   * Called after TP1 hit to protect position
   *
   * @param position - Current position
   * @returns True if SL moved successfully
   */
  async moveToBreakeven(position: Position): Promise<boolean> {
    if (!this.config.moveToBreakevenAfterTP1) {
      return false;
    }

    try {
      const breakeven = position.entryPrice;

      this.logger.info('⚖️ Moving SL to breakeven after TP1', {
        oldSl: position.stopLoss,
        newSl: breakeven,
        entry: position.entryPrice,
      });

      // Update SL via Bybit API
      await this.bybitService.updateStopLoss({
        positionId: position.id,
        newPrice: breakeven,
      });

      this.logger.info('✅ SL moved to breakeven', {
        slPrice: breakeven,
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to move SL to breakeven', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Move SL to trailing price
   *
   * Called after TP2 hit to maximize profits
   *
   * @param position - Current position
   * @param currentPrice - Current market price
   * @returns True if SL moved successfully
   */
  async moveTrailing(position: Position, currentPrice: number): Promise<boolean> {
    if (!this.config.trailingAfterTP2) {
      return false;
    }

    try {
      // Calculate trailing SL price
      let newSlPrice: number;
      if (position.side === PositionSide.LONG) {
        // LONG: SL below current price
        newSlPrice = currentPrice * (1 - this.config.trailingDistancePercent / PERCENT_MULTIPLIER);
      } else {
        // SHORT: SL above current price
        newSlPrice = currentPrice * (1 + this.config.trailingDistancePercent / PERCENT_MULTIPLIER);
      }

      // Only move SL if it improves current SL
      const shouldMove =
        position.side === PositionSide.LONG
          ? newSlPrice > position.stopLoss.price // LONG: move SL up
          : newSlPrice < position.stopLoss.price; // SHORT: move SL down

      if (!shouldMove) {
        this.logger.debug('Trailing SL not better than current SL, skipping', {
          currentSl: position.stopLoss.price,
          newSl: newSlPrice,
        });
        return false;
      }

      this.logger.info('📈 Moving SL to trailing price after TP2', {
        oldSl: position.stopLoss.price,
        newSl: newSlPrice,
        currentPrice,
        trailingDistance: this.config.trailingDistancePercent,
      });

      // Update SL via Bybit API
      await this.bybitService.updateStopLoss({
        positionId: position.id,
        newPrice: newSlPrice,
      });

      this.logger.info('✅ Trailing SL updated', {
        slPrice: newSlPrice,
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to move trailing SL', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (this.config.levels.length === 0) {
      throw new Error('LadderTpManagerConfig must have at least 1 level');
    }

    // Validate each level
    for (const level of this.config.levels) {
      if (level.pricePercent <= 0) {
        throw new Error(`Invalid pricePercent: ${level.pricePercent} (must be > 0)`);
      }

      if (level.closePercent < this.config.minPartialClosePercent || level.closePercent > this.config.maxPartialClosePercent) {
        throw new Error(
          `Invalid closePercent: ${level.closePercent} (must be ${this.config.minPartialClosePercent}-${this.config.maxPartialClosePercent}%)`,
        );
      }
    }

    // Validate total closePercent ~= 100%
    const totalClose = this.config.levels.reduce((sum, level) => sum + level.closePercent, 0);
    if (Math.abs(totalClose - INTEGER_MULTIPLIERS.ONE_HUNDRED) > 5) {
      this.logger.warn('Total closePercent is not ~100%, some position may remain', {
        totalClose,
      });
    }

    if (this.config.trailingAfterTP2 && this.config.trailingDistancePercent <= 0) {
      throw new Error(`Invalid trailingDistancePercent: ${this.config.trailingDistancePercent} (must be > 0)`);
    }
  }

  /**
   * Get config for external access
   */
  getConfig(): LadderTpManagerConfig {
    return this.config;
  }
}
