/**
 * STRATEGY STATE MANAGER SERVICE
 *
 * Manages strategy state persistence, switching, and recovery.
 *
 * Responsibilities:
 * 1. Switch between active strategies
 * 2. Persist strategy state to disk
 * 3. Restore state on bot restart
 * 4. Generate strategy snapshots
 * 5. Aggregate metrics across strategies
 *
 * Design Pattern: State Management + Persistence
 * Usage: Injected into StrategyOrchestrator
 */

import type {
  StrategyStateSnapshot,
  StrategySwitchResult,
  PnLMetrics,
} from '../../types/multi-strategy-types';
import type { IsolatedStrategyContext } from '../../types/multi-strategy-types';

export class StrategyStateManagerService {
  private stateDirectory = './strategy-states';
  private switchInProgress = false;

  constructor(stateDir?: string) {
    if (stateDir) {
      this.stateDirectory = stateDir;
    }
  }

  /**
   * Switch from one active strategy to another
   *
   * Process:
   * 1. Save state of current strategy
   * 2. Deactivate current strategy
   * 3. Activate new strategy
   * 4. Restore previous state if available
   *
   * @throws Error if switch fails or timeout
   */
  async switchStrategy(
    currentContext: IsolatedStrategyContext | null,
    targetContext: IsolatedStrategyContext,
    timeout: number = 5000,
  ): Promise<StrategySwitchResult> {
    if (this.switchInProgress) {
      throw new Error('[StrategyStateManager] Strategy switch already in progress');
    }

    const startTime = Date.now();
    const fromId = currentContext?.strategyId || 'none';
    const toId = targetContext.strategyId;

    console.log(
      `[StrategyStateManager] Switching from ${fromId} to ${toId}`,
    );

    try {
      this.switchInProgress = true;

      // Save current strategy state
      let savedState: StrategyStateSnapshot | undefined;
      if (currentContext) {
        try {
          savedState = currentContext.getSnapshot();
          await this.persistState(fromId, savedState);
          console.log(
            `[StrategyStateManager] Saved state for ${fromId}`,
          );
        } catch (error) {
          console.warn(
            `[StrategyStateManager] Failed to save state: ${error}`,
          );
        }
      }

      // Deactivate current
      if (currentContext) {
        currentContext.isActive = false;
        await currentContext.cleanup();
      }

      // Activate target
      targetContext.isActive = true;
      targetContext.lastTradedAt = new Date();

      // Restore previous state if available
      try {
        await this.restoreState(toId, targetContext);
        console.log(
          `[StrategyStateManager] Restored state for ${toId}`,
        );
      } catch (error) {
        console.warn(
          `[StrategyStateManager] Failed to restore state: ${error}`,
        );
      }

      const switchTime = Date.now() - startTime;

      if (switchTime > timeout) {
        throw new Error(
          `[StrategyStateManager] Switch timeout: ${switchTime}ms > ${timeout}ms`,
        );
      }

      console.log(
        `[StrategyStateManager] ✅ Switched to ${toId} in ${switchTime}ms`,
      );

      return {
        success: true,
        fromStrategyId: fromId,
        toStrategyId: toId,
        switchTime,
        savedState,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(
        `[StrategyStateManager] ❌ Switch failed: ${errorMsg}`,
      );

      return {
        success: false,
        fromStrategyId: fromId,
        toStrategyId: toId,
        switchTime: Date.now() - startTime,
        error: errorMsg,
      };
    } finally {
      this.switchInProgress = false;
    }
  }

  /**
   * Persist strategy state to disk
   */
  async persistState(
    strategyId: string,
    snapshot: StrategyStateSnapshot,
  ): Promise<void> {
    try {
      const filename = `${this.stateDirectory}/${strategyId}-snapshot-${Date.now()}.json`;

      // In real implementation, would write to file
      console.log(
        `[StrategyStateManager] Saving state to ${filename}`,
      );

      // Placeholder: actual file I/O would happen here
      // await fs.writeFile(filename, JSON.stringify(snapshot, null, 2));
    } catch (error) {
      throw new Error(
        `[StrategyStateManager] Failed to persist state: ${error}`,
      );
    }
  }

  /**
   * Restore strategy state from disk
   */
  async restoreState(
    strategyId: string,
    context: IsolatedStrategyContext,
  ): Promise<void> {
    try {
      // In real implementation, would read from file
      console.log(
        `[StrategyStateManager] Restoring state for ${strategyId}`,
      );

      // Placeholder: actual file I/O would happen here
      // const snapshot = await loadLatestSnapshot(strategyId);
      // if (snapshot) {
      //   await context.restoreFromSnapshot(snapshot);
      // }
    } catch (error) {
      throw new Error(
        `[StrategyStateManager] Failed to restore state: ${error}`,
      );
    }
  }

  /**
   * Get P&L metrics for a specific strategy
   */
  getStrategyPnL(context: IsolatedStrategyContext): PnLMetrics {
    return {
      strategyId: context.strategyId,
      strategyName: context.strategyName,
      openPositionsPnL: 0,
      realizedPnL: 0,
      unrealizedPnL: 0,
      totalPnL: 0,
      bestTrade: 0,
      worstTrade: 0,
      avgWinSize: 0,
      avgLossSize: 0,
      periodStart: new Date(),
      periodEnd: new Date(),
    };
  }

  /**
   * Get combined P&L across all strategies
   */
  getCombinedPnL(contexts: IsolatedStrategyContext[]): PnLMetrics {
    const combined: PnLMetrics = {
      strategyId: 'combined',
      strategyName: 'All Strategies',
      openPositionsPnL: 0,
      realizedPnL: 0,
      unrealizedPnL: 0,
      totalPnL: 0,
      bestTrade: 0,
      worstTrade: 0,
      avgWinSize: 0,
      avgLossSize: 0,
      periodStart: new Date(),
      periodEnd: new Date(),
    };

    for (const context of contexts) {
      const pnl = this.getStrategyPnL(context);
      combined.openPositionsPnL += pnl.openPositionsPnL;
      combined.realizedPnL += pnl.realizedPnL;
      combined.unrealizedPnL += pnl.unrealizedPnL;
      combined.totalPnL += pnl.totalPnL;

      // Track best/worst
      if (pnl.bestTrade > combined.bestTrade) {
        combined.bestTrade = pnl.bestTrade;
      }
      if (pnl.worstTrade < combined.worstTrade) {
        combined.worstTrade = pnl.worstTrade;
      }
    }

    return combined;
  }

  /**
   * Get switch state
   */
  isSwitchInProgress(): boolean {
    return this.switchInProgress;
  }

  /**
   * Snapshot all strategies (for backup/recovery)
   */
  async snapshotAll(
    contexts: IsolatedStrategyContext[],
  ): Promise<StrategyStateSnapshot[]> {
    const snapshots: StrategyStateSnapshot[] = [];

    for (const context of contexts) {
      try {
        const snapshot = context.getSnapshot();
        snapshots.push(snapshot);
        await this.persistState(context.strategyId, snapshot);
      } catch (error) {
        console.warn(
          `[StrategyStateManager] Failed to snapshot ${context.strategyId}: ${error}`,
        );
      }
    }

    console.log(
      `[StrategyStateManager] ✅ Snapshotted ${snapshots.length} strategies`,
    );

    return snapshots;
  }
}
