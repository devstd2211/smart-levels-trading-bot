/**
 * Update Stop Loss Action Handler
 *
 * Executes the action to update position stop loss
 */

import { IActionHandler, UpdateStopLossAction, ActionResult, ActionType } from '../types/architecture.types';
import { PositionExitingService } from '../services/position-exiting.service';
import { PositionLifecycleService } from '../services/position-lifecycle.service';
import { LoggerService } from '../services/logger.service';
import { ExitType, ExitAction } from '../types';

export class UpdateStopLossHandler implements IActionHandler {
  readonly name = 'UpdateStopLossHandler';

  constructor(
    private positionExitingService: PositionExitingService,
    private positionLifecycleService: PositionLifecycleService,
    private logger: LoggerService,
  ) {}

  /**
   * Check if this handler can process the action
   */
  canHandle(action: any): action is UpdateStopLossAction {
    return action?.type === ActionType.UPDATE_STOP_LOSS;
  }

  /**
   * Execute update stop loss action
   */
  async handle(action: UpdateStopLossAction): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      this.logger.debug(`[${this.name}] Processing action`, {
        actionId: action.id,
        positionId: action.positionId,
        newStopLossPrice: action.newStopLossPrice,
      });

      // Get current position
      const position = this.positionLifecycleService.getCurrentPosition();
      if (!position || position.id !== action.positionId) {
        throw new Error(`Position ${action.positionId} not found or not current`);
      }

      // Create exit action object for SL update
      const exitAction: ExitAction = {
        action: 'UPDATE_SL' as any,
        newStopLoss: action.newStopLossPrice,
        reason: action.reason || 'Action queue triggered SL update',
      } as any;

      // Call position exiting service to execute exit action
      await this.positionExitingService.executeExitAction(
        position,
        exitAction,
        action.newStopLossPrice,
        action.reason,
        ExitType.MANUAL,
      );

      const processingTime = Date.now() - startTime;
      this.logger.info(`[${this.name}] Stop loss updated successfully`, {
        actionId: action.id,
        positionId: action.positionId,
        newStopLossPrice: action.newStopLossPrice,
        processingTimeMs: processingTime,
      });

      return {
        success: true,
        actionId: action.id,
        metadata: {
          positionId: action.positionId,
          newStopLossPrice: action.newStopLossPrice,
          processingTimeMs: processingTime,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`[${this.name}] Failed to update stop loss`, {
        actionId: action.id,
        positionId: action.positionId,
        error: error instanceof Error ? error.message : String(error),
        processingTimeMs: processingTime,
      });

      return {
        success: false,
        actionId: action.id,
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: {
          processingTimeMs: processingTime,
        },
        timestamp: Date.now(),
      };
    }
  }
}
