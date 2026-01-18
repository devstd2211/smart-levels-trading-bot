/**
 * Data Collector Entry Point (Standalone)
 *
 * Standalone script for collecting real-time market data for backtesting.
 * NO TRADING LOGIC - data collection only!
 *
 * Usage:
 *   npm run collect-data
 */

import { LoggerService, LogLevel, DataCollectionConfig, Config } from './types';
import { DataCollectorService } from './services/data-collector.service';
import { BybitService } from './services/bybit';
import { BybitServiceAdapter } from './services/bybit/bybit-service.adapter';
import { IExchange } from './interfaces/IExchange';
import { TimeService } from './services/time.service';
import { INTEGER_MULTIPLIERS, TIME_INTERVALS } from './constants';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG_PATH = path.resolve(__dirname, '../config.json');

/**
 * Load configuration from config.json
 */
function loadConfig(): {
  dataCollection: DataCollectionConfig;
  exchange: Config['exchange'];
  system: Config['system'];
  } {
  try {
    const configFile = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(configFile) as Config;

    if (!config.dataCollection) {
      throw new Error('dataCollection config section not found in config.json');
    }

    if (!config.dataCollection.enabled) {
      throw new Error('dataCollection is disabled in config.json');
    }

    return {
      dataCollection: config.dataCollection,
      exchange: config.exchange,
      system: config.system,
    };
  } catch (error) {
    console.error('Failed to load configuration:', error);
    process.exit(1);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('========================================');
  console.log('🗄️  Data Collector - Standalone Script');
  console.log('========================================\n');

  // Load configuration
  const config = loadConfig();

  // Initialize logger
  const logger = new LoggerService(LogLevel.INFO, './logs', true);
  logger.info('Data Collector starting (Multi-Symbol)...', {
    symbols: config.dataCollection.symbols,
    symbolCount: config.dataCollection.symbols.length,
    timeframes: config.dataCollection.timeframes,
    orderbookInterval: config.dataCollection.orderbookInterval + 's',
    compression: config.dataCollection.database.compression,
  });

  // Initialize BybitService and wrap with adapter for IExchange interface
  const rawBybitService = new BybitService(config.exchange, logger);
  const bybitService: IExchange = new BybitServiceAdapter(rawBybitService, logger);

  // Initialize TimeService
  const timeService = new TimeService(
    logger,
    config.system?.timeSyncIntervalMs || TIME_INTERVALS.MS_PER_5_MINUTES, // Default 5 min
    config.system?.timeSyncMaxFailures || INTEGER_MULTIPLIERS.THREE,
  );

  // Connect TimeService to BybitService
  timeService.setBybitService(bybitService);

  // Create data collector service
  const collector = new DataCollectorService(config.dataCollection, logger);

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    logger.info(`\n\n${signal} received - stopping data collector...`);

    try {
      await collector.stop();
      logger.info('Data collector stopped successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  };

  // Register shutdown handlers
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    shutdown('UNCAUGHT_EXCEPTION');
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', { reason, promise });
    shutdown('UNHANDLED_REJECTION');
  });

  try {
    // Initialize BybitService - load symbol precision
    logger.info('Initializing Bybit API...');
    if (bybitService.initialize) {
      await bybitService.initialize();
    }
    logger.info('✅ Bybit API initialized');

    // Synchronize time with exchange
    logger.info('⏰ Synchronizing time with Bybit...');
    await timeService.syncWithExchange();
    const syncInfo = timeService.getSyncInfo();
    logger.info('✅ Time synchronized', {
      offset: syncInfo.offset,
      nextSyncIn: `${Math.round(syncInfo.nextSyncIn / INTEGER_MULTIPLIERS.ONE_THOUSAND)}s`,
    });

    // Initialize database
    await collector.initialize();
    logger.info('✅ Data collector initialized');

    // Start collecting data
    await collector.start();
    logger.info('✅ Data collector started - collecting data...\n');

    // Re-sync time every 1 minute (for data collector precision is critical)
    setInterval(async () => {
      try {
        logger.debug('⏰ Re-syncing time with Bybit...');
        await timeService.syncWithExchange();
        const updatedSyncInfo = timeService.getSyncInfo();
        logger.debug('Time re-synced', {
          offset: updatedSyncInfo.offset,
        });
      } catch (error) {
        logger.warn('Failed to re-sync time', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, TIME_INTERVALS.MS_PER_MINUTE); // Every 60 seconds

    // Print stats every 60 seconds
    setInterval(async () => {
      try {
        const stats = await collector.getStats();
        logger.info('📊 Collection stats', {
          candles: stats.candles,
          orderbook_snapshots: stats.orderbook_snapshots,
          trade_ticks: stats.trade_ticks,
        });
      } catch (error) {
        logger.warn('Failed to get stats', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, TIME_INTERVALS.MS_PER_MINUTE);

    logger.info('Press Ctrl+C to stop collecting data');
  } catch (error) {
    logger.error('Failed to start data collector', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
