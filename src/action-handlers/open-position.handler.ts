/**
 * Open Position Action Handler
 *
 * Executes the action to open a new position
 * Delegates to PositionLifecycleService for actual execution
 */

import { IActionHandler, OpenPositionAction, ActionResult, ActionType, AnyAction } from '../types/architecture.types';
import { PositionLifecycleService } from '../services/position-lifecycle.service';
import { LoggerService } from '../services/logger.service';
import { Signal } from '../types';

export class OpenPositionHandler implements IActionHandler {
  readonly name = 'OpenPositionHandler';

  constructor(
    private positionLifecycleService: PositionLifecycleService,
    private logger: LoggerService,
  ) {}

  /**
   * Check if this handler can process the action
   */
  canHandle(action: any): action is AnyAction {
    return action?.type === ActionType.OPEN_POSITION;
  }

  /**
   * Execute open position action
   */
  async handle(action: AnyAction): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      const openAction = action as OpenPositionAction;
      this.logger.debug(`[${this.name}] Processing action`, {
        actionId: openAction.id,
        symbol: openAction.symbol,
      });

      // Call position lifecycle service to open position
      // OpenPositionAction stores the signal - pass it directly to open position
      const signal = openAction.signal as unknown as Signal;
      const position = await this.positionLifecycleService.openPosition(signal);

      const processingTime = Date.now() - startTime;
      this.logger.info(`[${this.name}] Position opened successfully`, {
        actionId: openAction.id,
        positionId: position.id,
        processingTimeMs: processingTime,
      });

      return {
        success: true,
        actionId: openAction.id,
        metadata: {
          positionId: position.id,
          entryPrice: position.entryPrice,
          processingTimeMs: processingTime,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`[${this.name}] Failed to open position`, {
        actionId: (action as OpenPositionAction).id,
        error: error instanceof Error ? error.message : String(error),
        processingTimeMs: processingTime,
      });

      return {
        success: false,
        actionId: (action as OpenPositionAction).id,
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: {
          processingTimeMs: processingTime,
        },
        timestamp: Date.now(),
      };
    }
  }
}
