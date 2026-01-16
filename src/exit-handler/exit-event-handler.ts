/**
 * Exit Event Handler - Process Exit Events
 *
 * Handles exit events from exchange/position manager:
 * - TP hit: Move SL to BE, activate trailing, or close
 * - Position closed: Log and cleanup
 *
 * SINGLE RESPONSIBILITY: Process exit events based on config
 * Does NOT manage state - position state is in Position object
 * Does NOT call exchange directly - just logs what should happen
 */

import {
  IExitEvent,
  ITPHitEvent,
  IPositionClosedEvent,
  AnyExitEvent,
  ExitStrategyConfig,
  TPLevelConfig,
  TPHitResult,
  PositionClosedResult,
  ExitHandlerResult,
} from '../types/exit-strategy.types';
import { LoggerService } from '../types';
import * as ExitCalculations from './exit-calculations';

// ============================================================================
// INTERFACES (for DI)
// ============================================================================

/**
 * Exchange service interface (for placing orders)
 */
export interface IExchangeService {
  updateStopLoss(symbol: string, newPrice: number): Promise<void>;
  setTrailingStop(symbol: string, distance: number): Promise<void>;
}

/**
 * Position manager interface (for cleanup)
 */
export interface IPositionManager {
  remove(symbol: string): Promise<void>;
}

// ============================================================================
// EXIT EVENT HANDLER
// ============================================================================

export class ExitEventHandler {
  constructor(
    private exchange: IExchangeService,
    private positionManager: IPositionManager,
    private exitConfig: ExitStrategyConfig,
    private logger: LoggerService,
  ) {
    this.logger.info('🎯 ExitEventHandler initialized', {
      role: 'Process exit events (TP hits, position closed)',
      tpLevels: exitConfig.takeProfits.length,
      trailingEnabled: exitConfig.trailing?.enabled ?? false,
      breakEvenEnabled: exitConfig.breakeven?.enabled ?? false,
    });
  }

  /**
   * Handle exit event
   * Routes to appropriate handler based on event type
   *
   * @param event - Exit event from exchange
   * @returns Result of event handling
   */
  async handle(event: AnyExitEvent): Promise<ExitHandlerResult> {
    try {
      switch (event.type) {
        case 'TP_HIT':
          return await this.handleTPHit(event as ITPHitEvent);

        case 'POSITION_CLOSED':
          return await this.handlePositionClosed(event as IPositionClosedEvent);

        default:
          const _exhaustive: never = event;
          return _exhaustive;
      }
    } catch (error) {
      this.logger.error('ExitEventHandler.handle failed', {
        eventType: event.type,
        symbol: event.symbol,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return safe failure response
      return {
        success: false,
        action: 'NONE',
        reason: `Handler error: ${error instanceof Error ? error.message : 'unknown'}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Handle TP hit event
   * Executes action based on TP config (BE, Trailing, Close, etc)
   *
   * @param event - TP hit event
   * @returns Result with action taken
   *
   * SINGLE RESPONSIBILITY: Execute TP hit logic based on config
   */
  private async handleTPHit(event: ITPHitEvent): Promise<TPHitResult> {
    const { symbol, position, tpLevel, tpPrice, currentPrice, indicators } = event;

    // Find TP config for this level
    const tpConfig = ExitCalculations.getTpConfigForLevel(
      this.exitConfig.takeProfits,
      tpLevel,
    );

    if (!tpConfig) {
      this.logger.warn('TP hit but no config found', {
        symbol,
        tpLevel,
        availableLevels: this.exitConfig.takeProfits.map((tp) => tp.level),
      });

      return {
        success: false,
        action: 'NONE',
        reason: `No config for TP level ${tpLevel}`,
      };
    }

    // Log TP hit
    const pnlPercent = ExitCalculations.calculatePnLPercent(position, currentPrice);
    this.logger.info('✅ TP HIT', {
      symbol,
      level: tpLevel,
      tpPrice: tpPrice.toFixed(8),
      currentPrice: currentPrice.toFixed(8),
      profitPercent: pnlPercent.toFixed(2) + '%',
      sizeToClose: (tpConfig.sizePercent).toFixed(1) + '%',
    });

    // Determine what to do based on config
    const action = tpConfig.onHit || 'CLOSE';

    switch (action) {
      case 'MOVE_SL_TO_BREAKEVEN':
        return await this.moveSlToBreakeven(
          symbol,
          position,
          tpConfig,
          tpLevel,
        );

      case 'ACTIVATE_TRAILING':
        return await this.activateTrailing(
          symbol,
          position,
          tpConfig,
          tpLevel,
          indicators,
        );

      case 'CLOSE':
        this.logger.info('📊 TP hit - position will close on exchange', {
          symbol,
          level: tpLevel,
          sizePercent: tpConfig.sizePercent,
        });
        return {
          success: true,
          action: 'CLOSE',
          reason: `TP${tpLevel} hit at ${tpPrice.toFixed(8)} - closing ${tpConfig.sizePercent}% on exchange`,
        };

      case 'CUSTOM':
        this.logger.info('🔧 Custom handler for TP hit', {
          symbol,
          level: tpLevel,
          handler: tpConfig.customHandler,
        });
        return {
          success: true,
          action: 'NONE',
          reason: `Custom handler: ${tpConfig.customHandler}`,
        };

      default:
        const _exhaustive: never = action;
        return _exhaustive;
    }
  }

  /**
   * Move SL to breakeven
   *
   * @private
   */
  private async moveSlToBreakeven(
    symbol: string,
    position: any,
    tpConfig: TPLevelConfig,
    tpLevel: number,
  ): Promise<TPHitResult> {
    try {
      // Get BE margin from TP config or use default from config
      const beMargin = tpConfig.beMargin ?? this.exitConfig.breakeven?.offsetPercent ?? 0.1;

      // Calculate new BE SL
      const newSL = ExitCalculations.calculateBreakevenSL(position, beMargin);

      // Verify it's valid
      if (!ExitCalculations.isBreakevenValid(position, newSL)) {
        this.logger.warn('Invalid breakeven SL calculated', {
          symbol,
          newSL: newSL.toFixed(8),
          entryPrice: position.entryPrice.toFixed(8),
        });

        return {
          success: false,
          action: 'NONE',
          reason: `Invalid BE SL: ${newSL.toFixed(8)}`,
        };
      }

      // Send to exchange
      await this.exchange.updateStopLoss(symbol, newSL);

      this.logger.info('✅ SL moved to breakeven', {
        symbol,
        tpLevel,
        entryPrice: position.entryPrice.toFixed(8),
        newSL: newSL.toFixed(8),
        beMargin: beMargin.toFixed(2) + '%',
      });

      return {
        success: true,
        action: 'MOVE_SL_TO_BREAKEVEN',
        newSlPrice: newSL,
        reason: `TP${tpLevel} hit - SL moved to BE at ${newSL.toFixed(8)}`,
      };
    } catch (error) {
      this.logger.error('Failed to move SL to breakeven', {
        symbol,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        action: 'NONE',
        reason: 'Failed to move SL to BE',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Activate trailing stop
   *
   * @private
   */
  private async activateTrailing(
    symbol: string,
    position: any,
    tpConfig: TPLevelConfig,
    tpLevel: number,
    indicators?: any,
  ): Promise<TPHitResult> {
    try {
      // Get trailing config from TP or from general config
      const trailingConfig = tpConfig.trailingConfig ?? this.exitConfig.trailing;

      if (!trailingConfig?.enabled) {
        this.logger.debug('Trailing not enabled for this TP', {
          symbol,
          level: tpLevel,
        });

        return {
          success: true,
          action: 'NONE',
          reason: `TP${tpLevel} hit - trailing disabled`,
        };
      }

      // Calculate trailing distance
      const distance = ExitCalculations.calculateTrailingDistance(
        position,
        trailingConfig.percent,
        indicators?.atrPercent,
        trailingConfig.atrMultiplier ?? 1.0,
      );

      // Send to exchange
      await this.exchange.setTrailingStop(symbol, distance);

      this.logger.info('✅ Trailing stop activated', {
        symbol,
        tpLevel,
        distance: distance.toFixed(8),
        distancePercent: trailingConfig.percent.toFixed(2) + '%',
        useATR: trailingConfig.useATR ?? false,
        atrPercent: indicators?.atrPercent?.toFixed(2),
      });

      return {
        success: true,
        action: 'ACTIVATE_TRAILING',
        trailingDistance: distance,
        reason: `TP${tpLevel} hit - trailing activated at distance ${distance.toFixed(8)}`,
      };
    } catch (error) {
      this.logger.error('Failed to activate trailing stop', {
        symbol,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        action: 'NONE',
        reason: 'Failed to activate trailing',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Handle position closed event
   * Log closure and cleanup position from memory
   *
   * @param event - Position closed event
   * @returns Result
   *
   * SINGLE RESPONSIBILITY: Log and cleanup
   */
  private async handlePositionClosed(event: IPositionClosedEvent): Promise<PositionClosedResult> {
    const { symbol, reason, pnl, pnlPercent, closedAt } = event;

    try {
      // Log closure with details
      this.logger.info('📊 POSITION CLOSED', {
        symbol,
        reason,
        pnl: pnl?.toFixed(2) + ' USDT',
        pnlPercent: pnlPercent?.toFixed(2) + '%',
        closedSize: event.closedSize?.toFixed(4),
        closedPercent: event.closedPercent?.toFixed(1) + '%',
        closingPrice: event.closingPrice?.toFixed(8),
        closedAt: new Date(closedAt).toISOString(),
      });

      // Remove position from memory
      await this.positionManager.remove(symbol);

      this.logger.debug('Position removed from memory', { symbol });

      return {
        success: true,
        removed: true,
        reason: `Position closed by ${reason} and removed from memory`,
      };
    } catch (error) {
      // Don't fail - position is closed anyway
      this.logger.warn('Failed to remove position from memory', {
        symbol,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: true,
        removed: false,
        reason: `Position closed by ${reason} but cleanup failed`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
