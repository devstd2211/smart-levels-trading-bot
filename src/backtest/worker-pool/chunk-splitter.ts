/**
 * Chunk Splitter for Parallel Backtest Processing
 *
 * Splits backtest candles into chunks for parallel processing
 * Each chunk includes lookback context for reliable indicator calculation
 *
 * Strategy:
 * - Split 5m candles into chunks of N candles (default: 1000)
 * - Each chunk includes 60 candles of lookback context (previous chunk overlap)
 * - Chunks process independently with state transfer between them
 *
 * Example:
 * - Total: 10,000 candles
 * - Chunk size: 1000
 * - Lookback: 60 candles
 * - Chunk 0: candles 0-1000 (with 60 candle warmup)
 * - Chunk 1: candles 940-1940 (overlaps chunk 0, provides context)
 * - Chunk 2: candles 1880-2880
 * ... etc
 */

import { Candle } from '../../types';
import { BacktestTrade } from '../backtest-engine-v5';

export interface BacktestChunk {
  chunkId: number;
  candles5m: Candle[];          // Candles for this chunk (includes lookback)
  candles15m: Candle[];         // 15m candles for trend context
  startingBalance: number;      // Account balance at start of chunk
  openPositions: BacktestTrade[]; // Open positions from previous chunk
  timestamp: {
    start: number;             // First 5m candle timestamp in this chunk
    end: number;               // Last 5m candle timestamp in this chunk
  };
  lookbackCandles?: number;     // How many lookback candles included
  isFirstChunk: boolean;
  isLastChunk: boolean;
}

export interface ChunkResult {
  chunkId: number;
  trades: BacktestTrade[];      // All trades in this chunk (open + closed)
  finalBalance: number;         // Balance at end of chunk
  openPositions: BacktestTrade[]; // Positions to pass to next chunk
  tradesClosedInChunk: BacktestTrade[]; // Trades closed in this chunk
}

/**
 * Chunk Splitter
 * Divides candles into chunks for parallel processing
 */
export class ChunkSplitter {
  private readonly LOOKBACK_CANDLES = 60; // 60 5m candles = 5 hours (context for indicators)

  constructor(
    private chunkSize: number = 1000, // Default: ~3.5 days of 5m candles
    private lookbackCandles: number = 60
  ) {
    if (chunkSize < 100) {
      throw new Error('Chunk size must be at least 100 candles');
    }
    if (lookbackCandles >= chunkSize) {
      throw new Error('Lookback candles must be less than chunk size');
    }
  }

  /**
   * Split candles into chunks
   * Each chunk includes lookback context for indicator calculation
   */
  split(
    candles5m: Candle[],
    candles15m: Candle[],
    startingBalance: number
  ): BacktestChunk[] {
    const chunks: BacktestChunk[] = [];

    if (candles5m.length === 0) {
      return chunks;
    }

    // Calculate how many chunks we need
    const effectiveChunkSize = this.chunkSize - this.lookbackCandles;
    const totalChunks = Math.ceil(candles5m.length / effectiveChunkSize);

    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      const chunk = this.createChunk(
        chunkIdx,
        candles5m,
        candles15m,
        startingBalance,
        totalChunks
      );

      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Create a single chunk with lookback context
   */
  private createChunk(
    chunkId: number,
    candles5m: Candle[],
    candles15m: Candle[],
    startingBalance: number,
    totalChunks: number
  ): BacktestChunk {
    const effectiveChunkSize = this.chunkSize - this.lookbackCandles;

    // Calculate start and end indices
    const actualStart = chunkId * effectiveChunkSize;
    const actualEnd = Math.min(
      actualStart + this.chunkSize,
      candles5m.length
    );

    // Include lookback context (previous candles for indicator calculation)
    const contextStart = Math.max(0, actualStart - this.lookbackCandles);

    // Chunk candles (includes lookback context)
    const chunkCandles5m = candles5m.slice(contextStart, actualEnd);

    // Get corresponding 15m candles
    const firstCandle5mTimestamp = chunkCandles5m[0].timestamp;
    const lastCandle5mTimestamp = chunkCandles5m[chunkCandles5m.length - 1].timestamp;

    const chunkCandles15m = candles15m.filter(
      c => c.timestamp <= lastCandle5mTimestamp && c.timestamp >= firstCandle5mTimestamp - 15 * 60 * 1000
    );

    return {
      chunkId,
      candles5m: chunkCandles5m,
      candles15m: chunkCandles15m,
      startingBalance,
      openPositions: [], // Will be provided by previous chunk
      timestamp: {
        start: candles5m[actualStart].timestamp,
        end: candles5m[Math.min(actualEnd - 1, candles5m.length - 1)].timestamp,
      },
      lookbackCandles: this.lookbackCandles,
      isFirstChunk: chunkId === 0,
      isLastChunk: chunkId === totalChunks - 1,
    };
  }

  /**
   * Get chunk size configuration
   */
  getConfig() {
    return {
      chunkSize: this.chunkSize,
      lookbackCandles: this.lookbackCandles,
      effectiveChunkSize: this.chunkSize - this.lookbackCandles,
    };
  }

  /**
   * Calculate how many chunks are needed for dataset
   */
  getChunkCount(dataLength: number): number {
    if (dataLength === 0) return 0;
    const effectiveChunkSize = this.chunkSize - this.lookbackCandles;
    return Math.ceil(dataLength / effectiveChunkSize);
  }

  /**
   * Get optimal worker count based on dataset size
   * Avoids too many small chunks (overhead) or too few large chunks (no parallelism)
   */
  getOptimalWorkerCount(dataLength: number, cpuCount: number): number {
    const chunkCount = this.getChunkCount(dataLength);

    // Use 1 worker per chunk, but not more than CPU count - 1
    return Math.min(chunkCount, Math.max(1, cpuCount - 1));
  }
}
