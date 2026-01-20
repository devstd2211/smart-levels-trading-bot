/**
 * Backtest Worker
 *
 * Worker thread that processes a single backtest chunk
 * Runs in isolation from main thread
 *
 * Responsibilities:
 * 1. Receive chunk of candles
 * 2. Load strategy configuration
 * 3. Initialize analyzers and orchestrators
 * 4. Process candles in backtest loop
 * 5. Track open/closed positions
 * 6. Return trades and final balance
 *
 * Communication:
 * - Receives: BacktestWorkerTask (chunk, config, strategy, open positions)
 * - Returns: BacktestWorkerResult (trades, balance, final positions)
 */

import { BacktestChunk } from './chunk-splitter';
import { BacktestTrade, BacktestConfig } from '../backtest-engine-v5';
import { StrategyConfig } from '../../types/strategy-config.types';

export interface BacktestWorkerTask {
  chunk: BacktestChunk;
  config: BacktestConfig;
  strategy: StrategyConfig;
  indicatorCacheSnapshot?: Map<string, number>;
}

export interface BacktestWorkerResult {
  chunkId: number;
  trades: BacktestTrade[];
  closedTrades: BacktestTrade[];
  openPositions: BacktestTrade[];
  finalBalance: number;
  startingBalance: number;
  equityCurve: { timestamp: number; balance: number }[];
  errors: string[];
}

/**
 * Backtest Worker Process
 *
 * This is the actual worker implementation that runs in worker_threads
 * It's initialized when a worker is spawned
 */
export class BacktestWorkerProcess {
  async procesChunk(task: BacktestWorkerTask): Promise<BacktestWorkerResult> {
    const { chunk, config, strategy, indicatorCacheSnapshot } = task;

    // Initialize result structure
    const result: BacktestWorkerResult = {
      chunkId: chunk.chunkId,
      trades: [],
      closedTrades: [],
      openPositions: chunk.openPositions || [],
      finalBalance: chunk.startingBalance,
      startingBalance: chunk.startingBalance,
      equityCurve: [],
      errors: [],
    };

    try {
      // TODO: Integrate with actual backtest engine logic
      // For now, return placeholder result
      // This would need to:
      // 1. Initialize AnalyzerRegistry
      // 2. Initialize EntryOrchestrator, FilterOrchestrator, ExitOrchestrator
      // 3. Run backtest loop on chunk candles
      // 4. Track positions and trades
      // 5. Calculate equity curve

      result.finalBalance = chunk.startingBalance;
      result.equityCurve.push({
        timestamp: chunk.timestamp.start,
        balance: chunk.startingBalance,
      });

      return result;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
      return result;
    }
  }
}

/**
 * Backtest Worker Pool Result Merger
 *
 * Merges results from multiple chunks back into single backtest result
 */
export class BacktestWorkerResultMerger {
  /**
   * Merge chunk results into final backtest result
   */
  static mergeResults(
    startingBalance: number,
    chunkResults: BacktestWorkerResult[]
  ): {
    trades: BacktestTrade[];
    equityCurve: { timestamp: number; balance: number }[];
    finalBalance: number;
  } {
    // Sort by chunk ID to maintain order
    const sorted = chunkResults.sort((a, b) => a.chunkId - b.chunkId);

    const allTrades: BacktestTrade[] = [];
    const equityCurve: { timestamp: number; balance: number }[] = [];
    let currentBalance = startingBalance;

    for (const result of sorted) {
      // Accumulate all trades
      allTrades.push(...result.closedTrades);

      // Update balance
      currentBalance = result.finalBalance;

      // Add equity curve points
      equityCurve.push(...result.equityCurve.filter(
        // Remove duplicate timestamps (first point of next chunk)
        (point, idx) => idx === 0 || equityCurve[equityCurve.length - 1]?.timestamp !== point.timestamp
      ));
    }

    return {
      trades: allTrades,
      equityCurve,
      finalBalance: currentBalance,
    };
  }

  /**
   * Validate that chunk results are consistent
   */
  static validateResults(results: BacktestWorkerResult[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for errors in any chunk
    for (const result of results) {
      if (result.errors.length > 0) {
        errors.push(`Chunk ${result.chunkId}: ${result.errors.join(', ')}`);
      }
    }

    // Check that chunks are sequential
    const sortedByChunk = results.sort((a, b) => a.chunkId - b.chunkId);
    for (let i = 0; i < sortedByChunk.length - 1; i++) {
      const current = sortedByChunk[i];
      const next = sortedByChunk[i + 1];

      // Open positions from chunk N should match input to chunk N+1
      // (This is validated during execution, just report if errors occurred)
      if (current.errors.length > 0 || next.errors.length > 0) {
        errors.push(`State transfer between chunks ${i} and ${i + 1} may be unreliable`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Backtest Worker initialization for worker_threads
 *
 * This code runs once when worker is spawned
 * Registers message handler and processes incoming tasks
 */
if (require.main === module) {
  const { parentPort } = require('worker_threads');

  if (parentPort) {
    const processor = new BacktestWorkerProcess();

    parentPort.on('message', async (message: any) => {
      try {
        if (message.type === 'task') {
          const result = await processor.procesChunk(message.data as BacktestWorkerTask);
          parentPort.postMessage({
            taskId: message.taskId,
            type: 'result',
            data: result,
          });
        }
      } catch (error) {
        parentPort.postMessage({
          taskId: message.taskId,
          type: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Signal ready
    parentPort.postMessage({ type: 'ready' });
  }
}
