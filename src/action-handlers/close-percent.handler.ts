/**
 * Close Percent Action Handler
 *
 * Executes the action to close a percentage of position
 */

import { IActionHandler, ClosePercentAction, ActionResult, ActionType, ClosePercentExitActionDTO } from '../types/architecture.types';
import { PositionExitingService } from '../services/position-exiting.service';
import { PositionLifecycleService } from '../services/position-lifecycle.service';
import { LoggerService } from '../services/logger.service';
import { ExitType, ExitAction } from '../types';

export class ClosePercentHandler implements IActionHandler {
  readonly name = 'ClosePercentHandler';

  constructor(
    private positionExitingService: PositionExitingService,
    private positionLifecycleService: PositionLifecycleService,
    private logger: LoggerService,
  ) {}

  /**
   * Check if this handler can process the action
   */
  canHandle(action: any): action is ClosePercentAction {
    return action?.type === ActionType.CLOSE_PERCENT;
  }

  /**
   * Execute close percent action
   */
  async handle(action: ClosePercentAction): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      this.logger.debug(`[${this.name}] Processing action`, {
        actionId: action.id,
        positionId: action.positionId,
        percent: action.percent,
      });

      // Get current position
      const position = this.positionLifecycleService.getCurrentPosition();
      if (!position || position.id !== action.positionId) {
        throw new Error(`Position ${action.positionId} not found or not current`);
      }

      // Get current price from metadata or use entry price
      const currentPrice = action.metadata?.currentPrice || position.entryPrice;

      // Create exit action object with strict typing
      const exitAction: ClosePercentExitActionDTO = {
        action: ExitAction.CLOSE_PERCENT,
        percent: action.percent,
        reason: action.reason || 'Action queue triggered close',
      };

      // Call position exiting service to execute exit action
      await this.positionExitingService.executeExitAction(
        position,
        exitAction,
        currentPrice,
        action.reason,
        ExitType.MANUAL,
      );

      const processingTime = Date.now() - startTime;
      this.logger.info(`[${this.name}] Partial position closed successfully`, {
        actionId: action.id,
        positionId: action.positionId,
        percent: action.percent,
        processingTimeMs: processingTime,
      });

      return {
        success: true,
        actionId: action.id,
        metadata: {
          positionId: action.positionId,
          percentClosed: action.percent,
          processingTimeMs: processingTime,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`[${this.name}] Failed to close position percent`, {
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
