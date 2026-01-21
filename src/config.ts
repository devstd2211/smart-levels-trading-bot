/**
 * Configuration Loader
 * Loads config from config.json and applies environment variables
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Config } from './types';

// Load .env file
dotenv.config();

/**
 * Load configuration from config.json and merge with strategy.json
 *
 * Priority (highest to lowest):
 * 1. strategy.json (if exists) - overrides config.json
 * 2. config.json - base configuration
 * 3. Environment variables - override both
 */
export function getConfig(): Config {
  const configPath = path.join(__dirname, '..', 'config.json');

  console.log('🔍 DEBUG: Loading config from:', configPath);

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const configFile = fs.readFileSync(configPath, 'utf-8');
  const config: Config = JSON.parse(configFile) as Config;

  console.log('🔍 DEBUG: Config loaded. scalpingLadderTp exists:', !!config.scalpingLadderTp, 'enabled:', config.scalpingLadderTp?.enabled);
  console.log('🔍 DEBUG: entryConfig.divergenceDetector:', JSON.stringify(config.entryConfig?.divergenceDetector || 'MISSING'));

  // PHASE 8.5: Load and merge strategy.json if specified in config
  // Strategy config takes precedence over base config.json
  if ((config as any).meta?.strategy || (config as any).meta?.strategyFile) {
    const strategyFileName = (config as any).meta.strategyFile ||
      `strategies/json/${(config as any).meta.strategy}.strategy.json`;
    const strategyPath = path.join(__dirname, '..', strategyFileName);

    if (fs.existsSync(strategyPath)) {
      console.log('🔍 DEBUG: Loading strategy from:', strategyPath);
      const strategyFile = fs.readFileSync(strategyPath, 'utf-8');
      const strategyConfig = JSON.parse(strategyFile) as any;

      // Merge strategy into base config (strategy takes precedence)
      // This ensures strategy.json overrides config.json for:
      // - indicators (critical! only load indicators used by strategy)
      // - analyzers
      // - risk management
      // - filters
      if (strategyConfig.indicators) {
        console.log('✅ Strategy defines indicators - overriding config.json');
        config.indicators = {
          ...config.indicators,
          ...strategyConfig.indicators,
        };
      }

      if (strategyConfig.analyzers) {
        console.log('✅ Strategy defines analyzers - using strategy config');
        (config as any).analyzers = strategyConfig.analyzers;
      }

      if (strategyConfig.riskManagement) {
        console.log('✅ Strategy defines risk management - merging with config');
        config.riskManagement = {
          ...config.riskManagement,
          ...strategyConfig.riskManagement,
        };
      }

      if (strategyConfig.filters) {
        console.log('✅ Strategy defines filters - merging with config');
        (config as any).filters = {
          ...(config as any).filters,
          ...strategyConfig.filters,
        };
      }

      console.log('✅ Strategy merged into config', {
        strategy: (config as any).meta.strategy,
        indicatorsAfterMerge: Object.keys(config.indicators || {}),
      });

      // DEBUG: Log enabled/disabled status of each indicator
      console.log('🔍 DEBUG: Indicator enabled status after merge:');
      Object.entries(config.indicators || {}).forEach(([key, val]) => {
        const enabled = (val as any)?.enabled !== false;
        console.log(`  ${key}: ${enabled ? '✅ ENABLED' : '❌ DISABLED'}`);
      });
    } else {
      console.warn('⚠️  Strategy file not found:', strategyPath);
    }
  } else {
    console.warn('⚠️  No strategy configured in config.meta - using all config.json indicators');
  }

  // Set defaults for dataSubscriptions (if not present in config)
  if (!config.dataSubscriptions) {
    console.log('⚠️  dataSubscriptions missing in config - using defaults');
    config.dataSubscriptions = {
      candles: {
        enabled: true,              // Default: subscribe to candles
        calculateIndicators: true,  // Default: calculate indicators
      },
      orderbook: {
        enabled: config.orderBook?.enabled ?? false,  // Inherit from old orderBook config
        updateIntervalMs: 5000,     // Default: 5s throttle
      },
      ticks: {
        enabled: false,             // Default: disabled (only for specific strategies)
        calculateDelta: config.delta?.enabled ?? false,  // Inherit from old delta config
      },
    };
    console.log('✅ dataSubscriptions set to defaults:', config.dataSubscriptions);
  }

  // Override with environment variables if present
  // Support both BYBIT_* and legacy API_* prefixes
  if (process.env.BYBIT_API_KEY || process.env.API_KEY) {
    config.exchange.apiKey = process.env.BYBIT_API_KEY || process.env.API_KEY || config.exchange.apiKey;
  }
  if (process.env.BYBIT_API_SECRET || process.env.API_SECRET) {
    config.exchange.apiSecret = process.env.BYBIT_API_SECRET || process.env.API_SECRET || config.exchange.apiSecret;
  }
  if (process.env.BYBIT_TESTNET !== undefined) {
    config.exchange.testnet = process.env.BYBIT_TESTNET === 'true';
  }
  if (process.env.BYBIT_DEMO !== undefined) {
    config.exchange.demo = process.env.BYBIT_DEMO === 'true';
  }

  return config;
}
