import { IPreCalculationService } from '../types/pre-calculation.interface';
import { TimeframeRole } from '../types';

/**
 * Mock Pre-Calculation Service for testing
 *
 * Allows tests to:
 * 1. Control when indicators are ready
 * 2. Simulate candle closes
 * 3. Verify callbacks are called
 * 4. Test without real calculations
 */
export class MockPreCalculationService implements IPreCalculationService {
  private onIndicatorsReadyCallback?: (
    timeframe: TimeframeRole,
    closeTime: number
  ) => Promise<void>;
  private entryTimeframe: TimeframeRole = 'ENTRY' as TimeframeRole;

  /**
   * Register callback to be called when indicators are ready
   */
  setOnIndicatorsReady(
    callback: (timeframe: TimeframeRole, closeTime: number) => Promise<void>
  ): void {
    this.onIndicatorsReadyCallback = callback;
  }

  /**
   * Set entry timeframe configuration
   */
  setEntryTimeframe(timeframe: TimeframeRole): void {
    this.entryTimeframe = timeframe;
  }

  /**
   * Called when a candle closes
   * In mock, we just store it - test can manually trigger callback
   */
  async onCandleClosed(
    timeframe: TimeframeRole,
    closeTime: number
  ): Promise<void> {
    // Mock: do nothing, test controls when to call callback
  }

  /**
   * Test helper: manually trigger the callback
   * Simulates indicators being ready
   */
  async triggerIndicatorsReady(
    timeframe: TimeframeRole,
    closeTime: number
  ): Promise<void> {
    if (this.onIndicatorsReadyCallback) {
      await this.onIndicatorsReadyCallback(timeframe, closeTime);
    }
  }

  /**
   * Test helper: check if callback is registered
   */
  hasCallback(): boolean {
    return !!this.onIndicatorsReadyCallback;
  }

  /**
   * Test helper: get current entry timeframe
   */
  getEntryTimeframe(): TimeframeRole {
    return this.entryTimeframe;
  }
}
