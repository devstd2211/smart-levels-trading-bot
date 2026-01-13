import { TimeframeRole } from './enums';

/**
 * Pre-Calculation Service Interface
 *
 * Primary Implementation: IndicatorPreCalculationService
 * Mock Implementation: MockPreCalculationService (for testing)
 *
 * Responsible for:
 * - Listening to candle close events
 * - Queuing closes (handles race conditions from multiple timeframes)
 * - Processing queue sequentially (ensures proper order)
 * - Batching same-timestamp closes together
 * - Invalidating + recalculating + storing indicators in cache
 * - Calling callback when entry timeframe indicators are ready
 *
 * Does NOT know about:
 * - Specific indicators (RSI, EMA, etc)
 * - Analyzers
 * - How indicators are calculated (delegates to IIndicatorCalculator)
 *
 * Depends on (through constructor injection):
 * - IIndicatorCache (where to store results)
 * - IIndicatorCalculator[] (how to calculate)
 * - ICandleProvider (where to get candles)
 * - ILogger (for logging)
 */
export interface IPreCalculationService {
  /**
   * Called when a candle closes
   * Queues the close event for processing
   * Handles race conditions from multiple timeframes
   *
   * @param timeframe The timeframe that closed (1m, 5m, 1h, etc)
   * @param closeTime Unix timestamp of when the candle closed
   */
  onCandleClosed(timeframe: TimeframeRole, closeTime: number): Promise<void>;

  /**
   * Register callback to be called when indicators are ready
   * Callback is only called when entry timeframe indicators are ready
   *
   * @param callback Function to call with (timeframe, closeTime)
   */
  setOnIndicatorsReady(
    callback: (timeframe: TimeframeRole, closeTime: number) => Promise<void>
  ): void;

  /**
   * Set entry timeframe configuration
   * PreCalc will only call callback when this timeframe closes
   *
   * @param timeframe The entry timeframe (e.g., '5m')
   */
  setEntryTimeframe(timeframe: TimeframeRole): void;
}
