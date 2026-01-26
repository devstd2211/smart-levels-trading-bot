/**
 * Bybit Base Partial - Shared Utilities
 *
 * Provides common functionality used by all Bybit partial classes:
 * - Symbol precision management (qtyStep, tickSize)
 * - Retry logic with exponential backoff
 * - Rounding utilities (quantity, price)
 * - Error handling
 * - Constants
 */

import { RestClientV5 } from 'bybit-api';
import { LoggerService } from '../../types';
import type { IMarketDataRepository } from '../../repositories/IRepositories';

// ============================================================================
// CONSTANTS
// ============================================================================

export const RECV_WINDOW = 20000; // Increased from 5000 to handle clock drift
export const MAX_RETRIES = 3;
export const RETRY_DELAY_MS = 1000;
export const RETRY_BACKOFF_MULTIPLIER = 2;
export const DEFAULT_CANDLE_LIMIT = 200;
export const POSITION_SIZE_ZERO = 0;
export const BYBIT_SUCCESS_CODE = 0;
export const BYBIT_NOT_MODIFIED_CODE = 34039; // "order not modified" - price already at target
export const BYBIT_ORDER_STATUS_CODE = 34040; // "order does not exist or status does not support modification"
export const BYBIT_ORDER_NOT_EXISTS_CODE = 110001; // "order not exists or too late to cancel"
export const BYBIT_ZERO_POSITION_CODE = 10001; // "can not set tp/sl/ts for zero position"
export const POSITION_IDX_ONE_WAY = 0;
export const PERCENT_TO_DECIMAL = 100;

// ============================================================================
// BYBIT BASE PARTIAL
// ============================================================================

export class BybitBase {
  protected readonly restClient: RestClientV5;
  protected readonly symbol: string;
  protected readonly timeframe: string;
  protected readonly logger: LoggerService;
  protected readonly demo: boolean;

  // Symbol precision parameters (loaded from exchange)
  protected qtyStep: string | null = null;
  protected tickSize: string | null = null;
  protected minOrderQty: string | null = null;

  // Time synchronization (stored offset: local - server)
  protected timeOffsetMs: number = 0;

  // Phase 6.2: Market data repository for candle caching
  protected marketDataRepository?: IMarketDataRepository;

  constructor(
    restClient: RestClientV5,
    symbol: string,
    timeframe: string,
    logger: LoggerService,
    demo: boolean,
  ) {
    this.restClient = restClient;
    this.symbol = symbol;
    this.timeframe = timeframe;
    this.logger = logger;
    this.demo = demo;
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize service - load symbol precision parameters
   * Must be called after construction, before trading
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing BybitService - loading symbol info...');

    // Sync time with Bybit server to prevent timestamp errors
    this.logger.info('Synchronizing time with exchange...');
    try {
      const serverTimeResponse = await this.restClient.getServerTime();
      if (serverTimeResponse.retCode === BYBIT_SUCCESS_CODE) {
        const serverTime = parseInt(serverTimeResponse.result.timeSecond) * 1000;
        const localTime = Date.now();
        const timeDrift = localTime - serverTime;

        // Store time offset (positive = local clock is ahead)
        this.timeOffsetMs = timeDrift;

        this.logger.info('Time synchronized with Bybit server', {
          serverTime,
          localTime,
          offsetMs: this.timeOffsetMs,
          offsetOk: Math.abs(this.timeOffsetMs) < 500,
        });

        if (Math.abs(this.timeOffsetMs) > 500) {
          this.logger.warn('⚠️ Clock drift detected - applying offset correction', {
            offsetMs: this.timeOffsetMs,
          });
        }
      }
    } catch (error) {
      this.logger.warn('Failed to sync time, continuing without sync', {
        error: String(error),
      });
    }

    const symbolInfo = await this.getSymbolInfo();
    this.qtyStep = symbolInfo.qtyStep;
    this.tickSize = symbolInfo.tickSize;
    this.minOrderQty = symbolInfo.minOrderQty;

    this.logger.info('Symbol precision loaded', {
      symbol: this.symbol,
      qtyStep: this.qtyStep,
      tickSize: this.tickSize,
      minOrderQty: this.minOrderQty,
    });
  }

  /**
   * Get symbol trading parameters from exchange
   */
  private async getSymbolInfo(): Promise<{ qtyStep: string; tickSize: string; minOrderQty: string }> {
    return await this.retry(async () => {
      const response = await this.restClient.getInstrumentsInfo({
        category: 'linear',
        symbol: this.symbol,
      });

      if (response.retCode !== BYBIT_SUCCESS_CODE || !response.result?.list || response.result.list.length === 0) {
        throw new Error(`Failed to get symbol info for ${this.symbol}: ${response.retMsg}`);
      }

      const instrument = response.result.list[0];
      const qtyStep = instrument.lotSizeFilter?.qtyStep || '0.01';
      const tickSize = instrument.priceFilter?.tickSize || '0.0001';
      const minOrderQty = instrument.lotSizeFilter?.minOrderQty || '0.01';

      this.logger.debug('Symbol info received', {
        symbol: this.symbol,
        qtyStep,
        tickSize,
        minOrderQty,
      });

      return { qtyStep, tickSize, minOrderQty };
    });
  }

  /**
   * Get exchange limits for position calculations
   */
  getExchangeLimits(): {
    qtyStep: string;
    tickSize: string;
    minOrderQty: string;
    } {
    if (!this.qtyStep || !this.tickSize || !this.minOrderQty) {
      throw new Error('Exchange limits not initialized - call initialize() first');
    }

    return {
      qtyStep: this.qtyStep,
      tickSize: this.tickSize,
      minOrderQty: this.minOrderQty,
    };
  }

  /**
   * Set precision parameters (for sharing between instances)
   * Used by BybitService to share precision data from base instance to partial instances
   */
  setPrecision(qtyStep: string, tickSize: string, minOrderQty: string): void {
    this.qtyStep = qtyStep;
    this.tickSize = tickSize;
    this.minOrderQty = minOrderQty;
  }

  /**
   * Set market data repository for candle caching (Phase 6.2)
   * Used by BybitService to share repository instance with partial classes
   */
  setMarketDataRepository(repository: IMarketDataRepository): void {
    this.marketDataRepository = repository;
  }

  // ==========================================================================
  // PUBLIC GETTERS (for external services)
  // ==========================================================================

  /**
   * Get RestClient instance
   * Made public for LimitOrderExecutorService (Phase 2)
   */
  public getRestClient(): RestClientV5 {
    return this.restClient;
  }

  /**
   * Get trading symbol
   * Made public for LimitOrderExecutorService (Phase 2)
   */
  public getSymbol(): string {
    return this.symbol;
  }

  // ==========================================================================
  // ROUNDING UTILITIES
  // ==========================================================================

  /**
   * Round quantity to qtyStep precision
   * Example: qty=99.8901, qtyStep=0.01 => 99.89
   *
   * NOTE: This method is DEPRECATED - use PositionCalculatorService instead!
   * Kept only for backward compatibility with existing code (BybitOrders, BybitPositions).
   * Made public for LimitOrderExecutorService (Phase 2).
   */
  public roundQuantity(qty: number): string {
    // Fallback for backward compatibility (e.g., emergency protection calls)
    const step = this.qtyStep || '0.1';
    const stepNum = parseFloat(step);
    // Use Math.round instead of Math.floor to properly handle percentages (20%, 30%, 50%)
    // Example: qty=0.00003, step=0.0001 → 0.00003/0.0001=0.3 → round(0.3)=0 (still zero, need special handling)
    // Better: use banker's rounding or check minimum quantity
    const rounded = Math.round(qty / stepNum) * stepNum;

    // Check if rounded result is zero when input is non-zero (rounding error)
    if (rounded === 0 && qty > 0) {
      this.logger.warn('⚠️ roundQuantity resulted in ZERO - quantity too small for qtyStep', {
        input: qty,
        qtyStep: step,
        stepNum,
        minPossible: stepNum,
        recommendation: 'Combine with adjacent TP level or skip this TP',
      });
    }

    // Format to match step precision (count decimals in step)
    const decimals = (step.split('.')[1] || '').length;
    const result = rounded.toFixed(decimals);

    this.logger.debug('🔢 roundQuantity', {
      input: qty,
      qtyStep: step,
      stepNum,
      rounded,
      decimals,
      result,
      qtyStepLoaded: this.qtyStep !== null,
    });

    return result;
  }

  /**
   * Round price to tickSize precision
   * Example: price=1.00249, tickSize=0.0001 => 1.0024
   *
   * NOTE: This method is DEPRECATED - use PositionCalculatorService instead!
   * Kept only for backward compatibility with existing code (BybitOrders).
   * Made public for LimitOrderExecutorService (Phase 2).
   */
  public roundPrice(price: number): string {
    // Fallback for backward compatibility
    const tick = this.tickSize || '0.0001';
    const tickNum = parseFloat(tick);
    const rounded = Math.floor(price / tickNum) * tickNum;

    // Format to match tick precision
    const decimals = (tick.split('.')[1] || '').length;
    return rounded.toFixed(decimals);
  }

  // ==========================================================================
  // BALANCE
  // ==========================================================================

  /**
   * Get USDT balance
   */
  async getBalance(): Promise<number> {
    return await this.retry(async () => {
      const response = await this.restClient.getWalletBalance({
        accountType: 'UNIFIED',
        coin: 'USDT',
      });

      if (response.retCode !== BYBIT_SUCCESS_CODE) {
        throw new Error(`Bybit API error: ${response.retMsg} (code: ${response.retCode})`);
      }

      const coins = response.result.list[0]?.coin;
      if (coins === undefined || coins.length === 0) {
        throw new Error('USDT balance not found');
      }

      const usdtCoin = coins.find((c) => c.coin === 'USDT');
      if (usdtCoin === undefined) {
        throw new Error('USDT not found in wallet');
      }

      return parseFloat(usdtCoin.walletBalance);
    });
  }

  // ==========================================================================
  // RETRY LOGIC
  // ==========================================================================

  /**
   * Retry logic with exponential backoff
   */
  protected async retry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = this.handleError(error);

        // Don't retry on auth errors
        if (lastError.message.includes('auth') || lastError.message.includes('API key')) {
          throw lastError;
        }

        // Wait before retry (exponential backoff)
        if (attempt < MAX_RETRIES - 1) {
          const delay = RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt);
          this.logger.warn(`Retry attempt ${attempt + 1}/${MAX_RETRIES}`, { delay, error: lastError.message });
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`Failed after ${MAX_RETRIES} retries: ${lastError?.message ?? 'Unknown error'}`);
  }

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  /**
   * Handle and format errors
   */
  protected handleError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    return new Error(`Unknown error: ${String(error)}`);
  }

  /**
   * Get corrected timestamp for Bybit API requests
   * Applies time offset to prevent timestamp errors
   */
  protected getCorrectedTimestamp(): number {
    return Date.now() - this.timeOffsetMs;
  }

  /**
   * Sleep helper
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
