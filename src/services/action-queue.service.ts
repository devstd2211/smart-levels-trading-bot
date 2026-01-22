/**
 * Action Queue Service - FIFO queue with retry logic
 *
 * Responsible for:
 * - Enqueuing actions (decision → execution decoupling)
 * - Processing actions in order with retry support
 * - Tracking action results and metrics
 * - Preventing race conditions with isProcessing flag
 */

import { randomUUID } from 'crypto';
import { IAction, IActionQueue, ActionResult, IActionHandler, AnyAction } from '../types/architecture.types';

export class ActionQueueService implements IActionQueue {
  private queue: IAction[] = [];
  private isProcessing_ = false;
  private results: Map<string, ActionResult> = new Map();

  // Metrics
  private totalEnqueued = 0;
  private totalProcessed = 0;
  private totalFailed = 0;

  // Phase 10.3: Multi-Strategy Support
  // Optional strategyId for event tagging
  private strategyId?: string;

  /**
   * Set strategy ID for multi-strategy support (Phase 10.3)
   * Used for event tagging to identify which strategy emitted the action
   */
  setStrategyId(strategyId: string): void {
    this.strategyId = strategyId;
  }

  /**
   * Get strategy ID
   */
  getStrategyId(): string | undefined {
    return this.strategyId;
  }

  /**
   * Add action to queue
   */
  async enqueue(action: IAction): Promise<void> {
    if (!action.id) {
      action.id = randomUUID();
    }
    if (!action.timestamp) {
      action.timestamp = Date.now();
    }
    if (!action.maxRetries) {
      action.maxRetries = 3;
    }
    if (!action.retries) {
      action.retries = 0;
    }

    this.queue.push(action);
    this.totalEnqueued++;
  }

  /**
   * Enqueue multiple actions at once
   */
  async enqueueBatch(actions: IAction[]): Promise<void> {
    for (const action of actions) {
      await this.enqueue(action);
    }
  }

  /**
   * Get next action without removing
   */
  peek(): IAction | undefined {
    return this.queue[0];
  }

  /**
   * Remove and get next action
   */
  dequeue(): IAction | undefined {
    return this.queue.shift();
  }

  /**
   * Process all pending actions
   * Uses handlers in order: first handler that can handle the action processes it
   */
  async process(handlers: IActionHandler[]): Promise<ActionResult[]> {
    // Prevent concurrent processing
    if (this.isProcessing_) {
      return [];
    }

    this.isProcessing_ = true;
    const processedResults: ActionResult[] = [];

    try {
      while (this.queue.length > 0) {
        const action = this.peek();
        if (!action) break;

        let result: ActionResult | null = null;

        // Try handlers in order
        for (const handler of handlers) {
          if (handler.canHandle(action)) {
            try {
              result = await handler.handle(action as AnyAction);

              if (result.success) {
                // Action succeeded - remove from queue
                this.dequeue();
                this.totalProcessed++;
                this.results.set(action.id, result);
                processedResults.push(result);
                break;
              } else {
                // Action failed - check if we should retry
                if (action.retries! < action.maxRetries!) {
                  // Retry the action
                  action.retries!++;
                  // Keep action in queue for retry on next process() call
                  result.metadata = {
                    ...result.metadata,
                    retry: action.retries,
                  };
                  processedResults.push(result);
                  break;
                } else {
                  // Max retries exceeded
                  this.dequeue();
                  this.totalFailed++;
                  this.results.set(action.id, result);
                  processedResults.push(result);
                  break;
                }
              }
            } catch (error) {
              // Handler threw error
              const errorResult: ActionResult = {
                success: false,
                actionId: action.id,
                error: error instanceof Error ? error : new Error(String(error)),
                timestamp: Date.now(),
              };

              if (action.retries! < action.maxRetries!) {
                action.retries!++;
                processedResults.push(errorResult);
                break;
              } else {
                this.dequeue();
                this.totalFailed++;
                this.results.set(action.id, errorResult);
                processedResults.push(errorResult);
                break;
              }
            }
          }
        }

        // No handler found for action
        if (!result) {
          const noHandlerResult: ActionResult = {
            success: false,
            actionId: action.id,
            error: new Error(`No handler found for action type: ${(action as any).type}`),
            timestamp: Date.now(),
          };
          this.dequeue();
          this.totalFailed++;
          this.results.set(action.id, noHandlerResult);
          processedResults.push(noHandlerResult);
        }
      }
    } finally {
      this.isProcessing_ = false;
    }

    return processedResults;
  }

  /**
   * Clear all pending actions
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Get current queue size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is processing
   */
  isProcessing(): boolean {
    return this.isProcessing_;
  }

  /**
   * Wait for queue to be empty
   */
  async waitEmpty(timeoutMs: number = 5000): Promise<void> {
    const startTime = Date.now();
    while (this.queue.length > 0 || this.isProcessing_) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Queue did not empty within ${timeoutMs}ms`);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Get action result by ID
   */
  getResult(actionId: string): ActionResult | undefined {
    return this.results.get(actionId);
  }

  /**
   * Get all results
   */
  getAllResults(): ActionResult[] {
    return Array.from(this.results.values());
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      totalEnqueued: this.totalEnqueued,
      totalProcessed: this.totalProcessed,
      totalFailed: this.totalFailed,
      currentQueueSize: this.queue.length,
      isProcessing: this.isProcessing_,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.totalEnqueued = 0;
    this.totalProcessed = 0;
    this.totalFailed = 0;
    this.results.clear();
  }
}
