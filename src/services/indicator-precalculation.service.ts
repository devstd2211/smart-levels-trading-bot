import { CandleProvider } from '../providers/candle.provider';
import { IIndicatorCache } from '../types/indicator-cache.interface';
import { IIndicatorCalculator } from '../types/indicator-calculator.interface';
import { LoggerService } from './logger.service';
import { Candle } from '../types';

interface PendingClose {
  timeframe: string;
  closeTime: number;
}

/**
 * Pre-calculates indicators on every candle close
 *
 * Architecture:
 * 1. Listens to candleClosed events from CandleProvider
 * 2. Queues close events (handles race conditions from multiple timeframes)
 * 3. Processes queue sequentially (ensures proper order)
 * 4. Batches same-timestamp closes together
 * 5. Recalculates affected indicators
 * 6. Updates cache (invalidate old → calculate → store)
 * 7. Calls onIndicatorsReady callback when done
 *
 * Does NOT know about:
 * - Specific indicators (RSI, EMA, etc)
 * - Analyzers
 * - Logger dependencies
 *
 * Only knows about:
 * - IIndicatorCalculator interface
 * - IIndicatorCache interface
 * - CandleProvider events
 */
export class IndicatorPreCalculationService {
  private isCalculating = false;
  private pendingCloses: PendingClose[] = [];
  private onIndicatorsReadyCallback?: (
    timeframe: string,
    closeTime: number
  ) => Promise<void>;

  // Configuration (to be injected or set externally)
  private config = {
    timeframes: {
      entry: '5m', // Will be set from external config
    },
  };

  constructor(
    private candleProvider: CandleProvider,
    private cache: IIndicatorCache,
    private calculators: IIndicatorCalculator[],
    private logger: LoggerService,
  ) {
    // Listen to candle close events
    this.candleProvider.on('candleClosed', (candle: Candle) => {
      this.handleCandleClosed(candle);
    });
  }

  /**
   * Register callback to be called when indicators are ready
   * Called by TradingOrchestrator during initialization
   */
  setOnIndicatorsReady(
    callback: (timeframe: string, closeTime: number) => Promise<void>
  ): void {
    this.onIndicatorsReadyCallback = callback;
  }

  /**
   * Set entry timeframe (should be called from config)
   */
  setEntryTimeframe(timeframe: string): void {
    this.config.timeframes.entry = timeframe;
  }

  /**
   * Handle candle close event from CandleProvider
   * Queues the close and starts processing if not already processing
   */
  private async handleCandleClosed(candle: Candle): Promise<void> {
    // Add to queue
    this.pendingCloses.push({
      timeframe: candle.timeframe,
      closeTime: candle.closeTime,
    });

    // If already calculating, let it finish (and process queue)
    if (this.isCalculating) {
      return;
    }

    // Process queue
    await this.processQueue();
  }

  /**
   * Process all pending closes in queue
   * Groups closes at same timestamp and processes them together
   */
  private async processQueue(): Promise<void> {
    while (this.pendingCloses.length > 0 && !this.isCalculating) {
      this.isCalculating = true;

      try {
        // Get all closes at current timestamp
        const currentTime = this.pendingCloses[0].closeTime;
        const sameTimeBatch = this.pendingCloses.filter(
          (c) => c.closeTime === currentTime
        );

        // Remove from queue
        this.pendingCloses = this.pendingCloses.filter(
          (c) => c.closeTime !== currentTime
        );

        // Recalculate for each timeframe
        for (const item of sameTimeBatch) {
          await this.recalculate(item.timeframe);
        }

        // === Call callback if entry timeframe is in batch ===
        if (
          this.onIndicatorsReadyCallback &&
          sameTimeBatch.some((c) => c.timeframe === this.config.timeframes.entry)
        ) {
          try {
            await this.onIndicatorsReadyCallback(
              this.config.timeframes.entry,
              currentTime
            );
          } catch (error) {
            this.logger.error(
              'Error in onIndicatorsReady callback:',
              error
            );
          }
        }
      } catch (error) {
        this.logger.error('Error processing candle close:', error);
        // Continue processing queue even on error
      } finally {
        this.isCalculating = false;
      }
    }
  }

  /**
   * Recalculate indicators affected by closing of specific timeframe
   */
  private async recalculate(closedTimeframe: string): Promise<void> {
    // Find calculators that depend on this timeframe
    const affectedCalculators = this.calculators.filter((calc) => {
      const config = calc.getConfig();
      return config.indicators.some((ind) =>
        ind.timeframes.includes(closedTimeframe)
      );
    });

    if (affectedCalculators.length === 0) {
      // No one cares about this timeframe
      return;
    }

    try {
      // Collect all required timeframes and candle counts
      const tfRequirements = new Map<string, number>();

      for (const calc of affectedCalculators) {
        const config = calc.getConfig();
        config.indicators.forEach((ind) => {
          ind.timeframes.forEach((tf) => {
            const current = tfRequirements.get(tf) ?? 0;
            // Take maximum of all requirements
            tfRequirements.set(
              tf,
              Math.max(current, ind.minCandlesRequired)
            );
          });
        });
      }

      // Get candles for all required timeframes
      const candlesByTf = new Map<string, Candle[]>();
      for (const [tf, minCount] of tfRequirements) {
        const candles = await this.candleProvider.getCandles(tf, minCount);
        if (!candles || candles.length === 0) {
          this.logger.warn(`No candles available for ${tf}`);
          continue;
        }
        candlesByTf.set(tf, candles);
      }

      // === INVALIDATE old data ===
      // Clear cache entries that depend on CLOSED timeframe
      for (const calc of affectedCalculators) {
        const config = calc.getConfig();
        config.indicators.forEach((ind) => {
          // Only invalidate if this indicator depends on closed timeframe
          if (ind.timeframes.includes(closedTimeframe)) {
            ind.periods.forEach((period) => {
              const cacheKey = `${ind.name}-${period}-${closedTimeframe}`;
              this.cache.invalidate(cacheKey);
            });
          }
        });
      }

      // === CALCULATE ===
      const promises = affectedCalculators.map((calc) =>
        calc
          .calculate({
            candlesByTimeframe: candlesByTf,
            timestamp: Date.now(),
          })
          .catch((error) => {
            this.logger.error(
              `Calculator ${calc.constructor.name} failed:`,
              error
            );
            return new Map(); // Return empty, don't block others
          })
      );

      const allResults = await Promise.all(promises);

      // === STORE in cache ===
      for (const results of allResults) {
        results.forEach((value, key) => {
          this.cache.set(key, value);
        });
      }

      this.logger.debug(
        `Recalculated indicators for ${closedTimeframe}`,
        {
          calculatorsRun: affectedCalculators.length,
          entriesUpdated: Array.from(allResults).reduce(
            (sum, m) => sum + m.size,
            0
          ),
        }
      );
    } catch (error) {
      this.logger.error(`Recalculation failed for ${closedTimeframe}:`, error);
    }
  }
}
