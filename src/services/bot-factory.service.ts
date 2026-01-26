/**
 * BotFactory - Dependency Injection Container
 *
 * Phase 5: Dependency Injection Enhancement
 * Manages creation and configuration of BotServices with proper DI
 *
 * Benefits:
 * - Single source of truth for service creation
 * - Easy to swap implementations for testing
 * - Clear dependency graph
 * - Supports partial override for testing
 *
 * Usage:
 *   // Production
 *   const services = BotFactory.create(config);
 *
 *   // Testing with mocks
 *   const services = BotFactory.create(config, {
 *     bybitService: mockExchange,
 *     telegram: mockTelegram,
 *   });
 */

import { Config, LoggerService } from '../types';
import { BotServices } from './bot-services';
import { IExchange } from '../interfaces/IExchange';

/**
 * Factory options for partial DI overrides
 * Allows tests to inject specific mock services
 */
export interface BotFactoryOptions {
  // Exchange service (for testing with mock exchange)
  bybitService?: IExchange;

  // Notification service (for testing without sending messages)
  telegram?: any;

  // Logger (for testing with custom logger)
  logger?: LoggerService;

  // Add more as needed for other services
}

/**
 * BotFactory - Creates BotServices with dependency injection
 */
export class BotFactory {
  /**
   * Create BotServices with optional DI overrides
   *
   * @param config - Bot configuration
   * @param options - Optional overrides for testing
   * @returns Initialized BotServices instance
   */
  static create(config: Config, options: BotFactoryOptions = {}): BotServices {
    // Create BotServices normally
    const services = new BotServices(config);

    // Apply any test overrides
    if (options.bybitService) {
      (services as any).bybitService = options.bybitService;
    }

    if (options.telegram) {
      (services as any).telegram = options.telegram;
    }

    if (options.logger) {
      (services as any).logger = options.logger;
    }

    return services;
  }

  /**
   * Create minimal BotServices for testing
   * Useful for unit tests that need basic functionality
   *
   * @param config - Bot configuration
   * @param mockServices - Mock implementations
   * @returns Minimal BotServices for testing
   */
  static createForTesting(
    config: Config,
    mockServices: BotFactoryOptions = {},
  ): BotServices {
    return this.create(config, mockServices);
  }
}
