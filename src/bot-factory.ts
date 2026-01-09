/**
 * BotFactory - Factory Pattern for TradingBot Creation
 *
 * Centralized factory for creating TradingBot instances.
 * Handles:
 * - Configuration loading and validation
 * - Service initialization via DI container
 * - Bot instantiation with all dependencies
 *
 * Benefits:
 * - Single point of bot creation
 * - Clear dependency graph
 * - Easy to mock for testing
 * - Easy to add pre/post-creation hooks
 */

import { Config } from './types';
import { TradingBot } from './bot';
import { BotEventEmitter } from './bot-event-emitter';
import { BotServices } from './services/bot-services';
import { StrategyLoaderService } from './services/strategy-loader.service';
import { StrategyConfigMergerService } from './services/strategy-config-merger.service';

export interface BotFactoryConfig {
  config: Config;
}

/**
 * Factory for creating TradingBot instances
 */
export class BotFactory {
  /**
   * Create a new TradingBot instance with all dependencies
   *
   * @param factoryConfig - Configuration for bot creation
   * @returns Initialized TradingBot instance
   *
   * @example
   * const config = loadConfig('config.json');
   * const bot = await BotFactory.create({ config });
   * await bot.start();
   */
  static async create(factoryConfig: BotFactoryConfig): Promise<TradingBot> {
    let { config } = factoryConfig;

    // 1. Load and merge strategy if specified
    if (config.meta?.strategy) {
      try {
        const strategyLoader = new StrategyLoaderService();
        const strategyMerger = new StrategyConfigMergerService();

        console.log(`📋 Loading strategy: ${config.meta.strategy}`);
        const strategy = await strategyLoader.loadStrategy(config.meta.strategy);
        config = strategyMerger.mergeConfigs(config, strategy) as Config;

        const changeReport = strategyMerger.getChangeReport(
          factoryConfig.config,
          strategy,
        );
        console.log(
          `✅ Strategy merged | ${changeReport.changesCount} config overrides applied`,
        );

        // Log loaded analyzers
        if (strategy.analyzers && strategy.analyzers.length > 0) {
          console.log(`📊 Strategy Analyzers (${strategy.analyzers.length} total):`);
          const enabledAnalyzers = strategy.analyzers.filter((a) => a.enabled);
          console.log(
            `   ✅ Enabled: ${enabledAnalyzers.length} | ❌ Disabled: ${strategy.analyzers.length - enabledAnalyzers.length}`,
          );

          // Group by weight
          const byWeight = enabledAnalyzers.reduce(
            (acc, a) => {
              const key = `${(a.weight * 100).toFixed(1)}%`;
              if (!acc[key]) acc[key] = [];
              acc[key].push(a.name);
              return acc;
            },
            {} as Record<string, string[]>,
          );

          Object.entries(byWeight)
            .sort(([w1], [w2]) => parseFloat(w2) - parseFloat(w1))
            .forEach(([weight, names]) => {
              console.log(`   ${weight}: ${names.length} analyzers`);
            });

          // Log top 5 by weight
          const topAnalyzers = [...enabledAnalyzers]
            .sort((a, b) => (b.weight || 0) - (a.weight || 0))
            .slice(0, 5);
          if (topAnalyzers.length > 0) {
            console.log(`   Top 5:`);
            topAnalyzers.forEach((a) => {
              console.log(`     ${a.name}: ${(a.weight * 100).toFixed(2)}% weight, priority=${a.priority}`);
            });
          }
        }

        // Log indicator overrides
        if (strategy.indicators) {
          console.log(
            `📈 Indicator Overrides: ${Object.keys(strategy.indicators).length} indicators`,
          );
          Object.entries(strategy.indicators).forEach(([name, config]) => {
            const cfg = config as any;
            const details: string[] = [];
            if (cfg.period) details.push(`period=${cfg.period}`);
            if (cfg.fastPeriod) details.push(`fast=${cfg.fastPeriod}, slow=${cfg.slowPeriod}`);
            if (cfg.kPeriod) details.push(`k=${cfg.kPeriod}, d=${cfg.dPeriod}`);
            if (cfg.stdDev) details.push(`stdDev=${cfg.stdDev}`);
            console.log(`   ${name}: ${details.join(', ')}`);
          });
        }
      } catch (error) {
        console.error('❌ Failed to load strategy:', error);
        throw error;
      }
    }

    // 2. Initialize all services in dependency order
    const services = new BotServices(config);

    // 3. Create bot with injected dependencies
    const bot = new TradingBot(services, config);

    // 4. Log successful creation
    services.logger.info('🤖 TradingBot created successfully via BotFactory');

    return bot;
  }

  /**
   * Create a TradingBot instance for testing
   *
   * Useful for unit tests where you want to mock specific services.
   *
   * @param config - Configuration for bot
   * @param serviceOverrides - Services to override (for testing)
   * @returns Initialized TradingBot instance with overridden services
   *
   * @example
   * const mockBybitService = mock(BybitService);
   * const bot = BotFactory.createForTesting(config, {
   *   bybitService: mockBybitService
   * });
   */
  static createForTesting(
    config: Config,
    serviceOverrides?: Partial<BotServices>,
  ): TradingBot {
    // Create services normally
    const services = new BotServices(config);

    // Override specific services for testing
    if (serviceOverrides) {
      Object.assign(services, serviceOverrides);
    }

    return new TradingBot(services, config);
  }

  /**
   * Create a TradingBot with event emitter adapter
   *
   * Recommended approach for applications that need event API.
   * Returns both bot (for trading) and emitter (for events).
   *
   * @param factoryConfig - Configuration for bot creation
   * @returns Promise resolving to object with bot and emitter
   *
   * @example
   * const { bot, emitter } = await BotFactory.createWithEmitter({ config });
   * emitter.on('signal', (signal) => { });
   * await bot.start();
   */
  static async createWithEmitter(
    factoryConfig: BotFactoryConfig
  ): Promise<{ bot: TradingBot; emitter: BotEventEmitter }> {
    const bot = await this.create(factoryConfig);
    const emitter = new BotEventEmitter(bot.eventBus);
    return { bot, emitter };
  }

  /**
   * Get services without creating bot
   *
   * Useful for direct service access in tests or standalone usage.
   *
   * @param config - Configuration for services
   * @returns Initialized BotServices container
   */
  static createServices(config: Config): BotServices {
    return new BotServices(config);
  }
}
