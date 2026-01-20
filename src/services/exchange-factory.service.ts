/**
 * Exchange Factory Service
 *
 * Creates and manages exchange service instances based on configuration.
 * Supports multiple exchange implementations (Bybit, Binance, etc.)
 *
 * Usage:
 * const factory = new ExchangeFactory(logger, config);
 * const exchange = await factory.createExchange();
 *
 * Benefits:
 * - Single place to configure which exchange to use
 * - Easy to add new exchanges (create adapter + add to factory)
 * - Type-safe: returns IExchange interface
 * - Testable: can inject mock exchanges
 */

import type { IExchange } from '../interfaces/IExchange';
import type { LoggerService } from '../types';
import { BybitService } from './bybit/bybit.service';
import { BybitServiceAdapter } from './bybit/bybit-service.adapter';
import { BinanceServiceAdapter } from './binance/binance-service.adapter';
import { BinanceService } from './binance/binance.service';

/**
 * Exchange configuration from app config
 */
export interface ExchangeConfig {
  name: 'bybit' | 'binance'; // Future: add more exchanges
  symbol: string;
  demo?: boolean;
  testnet?: boolean;
  apiKey?: string;
  apiSecret?: string;
}

/**
 * Factory for creating exchange service instances
 */
export class ExchangeFactory {
  private exchangeCache: IExchange | null = null;

  constructor(
    private logger: LoggerService,
    private config: ExchangeConfig,
  ) {
    this.validateConfig();
  }

  /**
   * Create exchange service instance
   * Returns cached instance if already created
   */
  async createExchange(): Promise<IExchange> {
    if (this.exchangeCache) {
      return this.exchangeCache;
    }

    try {
      const exchange = await this.instantiateExchange();
      this.exchangeCache = exchange;

      this.logger.info('✅ Exchange initialized', {
        name: exchange.name,
        symbol: this.config.symbol,
      });

      return exchange;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to create exchange', {
        exchange: this.config.name,
        error: errorMsg,
      });
      throw error;
    }
  }

  /**
   * Get cached exchange instance
   * Returns null if not yet initialized
   */
  getExchange(): IExchange | null {
    return this.exchangeCache;
  }

  /**
   * Clear cache and reset exchange
   * Useful for testing or switching exchanges
   */
  reset(): void {
    this.exchangeCache = null;
  }

  /**
   * Get exchange name
   */
  getExchangeName(): string {
    return this.config.name;
  }

  /**
   * Get symbol
   */
  getSymbol(): string {
    return this.config.symbol;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Instantiate the appropriate exchange adapter
   */
  private async instantiateExchange(): Promise<IExchange> {
    switch (this.config.name.toLowerCase()) {
      case 'bybit':
        return this.createBybitExchange();

      case 'binance':
        return this.createBinanceExchange();

      default:
        throw new Error(`Unsupported exchange: ${this.config.name}. Supported: bybit, binance`);
    }
  }

  /**
   * Create Bybit exchange adapter
   */
  private async createBybitExchange(): Promise<IExchange> {
    try {
      // Create config object for BybitService
      const bybitConfig = {
        name: 'bybit',
        symbol: this.config.symbol,
        demo: this.config.demo ?? true,
        testnet: this.config.testnet ?? false,
        apiKey: this.config.apiKey ?? '',
        apiSecret: this.config.apiSecret ?? '',
      };

      // Create BybitService instance (takes config and logger)
      const bybitService = new BybitService(bybitConfig as any, this.logger);

      // Create adapter that implements IExchange
      const adapter = new BybitServiceAdapter(bybitService, this.logger);

      // Initialize the adapter
      await adapter.initialize();

      this.logger.info('✅ Created Bybit exchange adapter', {
        symbol: this.config.symbol,
        demo: this.config.demo,
      });

      return adapter;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create Bybit exchange: ${errorMsg}`);
    }
  }

  /**
   * Create Binance exchange adapter
   */
  private async createBinanceExchange(): Promise<IExchange> {
    try {
      // Create BinanceService instance
      // Note: BinanceService takes individual parameters for flexibility
      const binanceService = new BinanceService(
        this.config.symbol,
        this.config.demo ?? true,
        this.config.testnet ?? false,
        this.config.apiKey ?? '',
        this.config.apiSecret ?? '',
      );

      // Create adapter that implements IExchange
      const adapter = new BinanceServiceAdapter(binanceService, this.logger);

      // Initialize the adapter
      await adapter.initialize();

      this.logger.info('✅ Created Binance exchange adapter', {
        symbol: this.config.symbol,
        demo: this.config.demo,
      });

      return adapter;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create Binance exchange: ${errorMsg}`);
    }
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (!this.config.name) {
      throw new Error('Exchange name is required in config');
    }

    if (!this.config.symbol) {
      throw new Error('Symbol is required in config');
    }

    const supportedExchanges = ['bybit', 'binance'];
    if (!supportedExchanges.includes(this.config.name.toLowerCase())) {
      throw new Error(
        `Unsupported exchange: ${this.config.name}. Supported: ${supportedExchanges.join(', ')}`,
      );
    }
  }
}
