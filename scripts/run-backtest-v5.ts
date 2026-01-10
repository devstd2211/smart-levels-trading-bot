#!/usr/bin/env ts-node

/**
 * BACKTEST RUNNER V5 - CLI Tool
 *
 * Usage:
 * npm run backtest-v5 -- --strategy level-trading-v3 --symbol XRPUSDT --start 2025-12-10 --end 2026-01-10
 * npm run backtest-v5 -- --strategy level-trading-v1 --symbol XRPUSDT (uses all available data)
 *
 * Options:
 * --strategy:  Strategy file name (without path/extension) [required]
 * --symbol:    Trading symbol (e.g., XRPUSDT) [default: XRPUSDT]
 * --btc:       BTC symbol for correlation [default: BTCUSDT]
 * --start:     Start date YYYY-MM-DD [optional]
 * --end:       End date YYYY-MM-DD [optional]
 * --balance:   Initial balance [default: 10000]
 * --max-pos:   Max open positions [default: 3]
 * --source:    Data source: json or sqlite [default: json]
 * --output:    Output directory [default: ./backtest-results]
 */

import * as path from 'path';
import * as fs from 'fs';
import { BacktestEngineV5, BacktestConfig, BacktestResult } from '../src/backtest/backtest-engine-v5';
import { LoggerService } from '../src/services/logger.service';

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

interface CommandLineArgs {
  strategy: string;
  symbol: string;
  btc: string;
  start?: string;
  end?: string;
  balance: number;
  maxPos: number;
  source: 'json' | 'sqlite';
  output: string;
}

function parseArgs(): CommandLineArgs {
  const args = process.argv.slice(2);
  const parsed: any = {
    symbol: 'XRPUSDT',
    btc: 'BTCUSDT',
    balance: 10000,
    maxPos: 3,
    source: 'json',
    output: './backtest-results',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--strategy' && args[i + 1]) {
      parsed.strategy = args[++i];
    } else if (arg === '--symbol' && args[i + 1]) {
      parsed.symbol = args[++i];
    } else if (arg === '--btc' && args[i + 1]) {
      parsed.btc = args[++i];
    } else if (arg === '--start' && args[i + 1]) {
      parsed.start = args[++i];
    } else if (arg === '--end' && args[i + 1]) {
      parsed.end = args[++i];
    } else if (arg === '--balance' && args[i + 1]) {
      parsed.balance = parseFloat(args[++i]);
    } else if (arg === '--max-pos' && args[i + 1]) {
      parsed.maxPos = parseInt(args[++i], 10);
    } else if (arg === '--source' && args[i + 1]) {
      parsed.source = args[++i];
    } else if (arg === '--output' && args[i + 1]) {
      parsed.output = args[++i];
    }
  }

  if (!parsed.strategy) {
    console.error('❌ Error: --strategy is required');
    process.exit(1);
  }

  return parsed as CommandLineArgs;
}

// ============================================================================
// MAIN RUNNER
// ============================================================================

async function main() {
  const logger = new LoggerService();
  const args = parseArgs();

  // Build strategy file path
  const strategyDir = path.join(__dirname, '../strategies/json');
  const strategyFile = path.join(strategyDir, `${args.strategy}.strategy.json`);

  if (!fs.existsSync(strategyFile)) {
    logger.error('❌ Strategy file not found', { file: strategyFile });
    console.error(`Available strategies in ${strategyDir}:`);
    const strategies = fs.readdirSync(strategyDir).filter((f) => f.endsWith('.strategy.json'));
    strategies.forEach((s) => console.error(`  - ${s}`));
    process.exit(1);
  }

  logger.info('🚀 Backtest Runner V5', {
    strategy: args.strategy,
    symbol: args.symbol,
    balance: args.balance,
    dateRange: args.start && args.end ? `${args.start} to ${args.end}` : 'all data',
  });

  try {
    // Create backtest config
    const config: BacktestConfig = {
      strategyFile,
      symbol: args.symbol,
      alternativeSymbol: args.btc,
      dataProvider: args.source,
      startDate: args.start,
      endDate: args.end,
      initialBalance: args.balance,
      maxOpenPositions: args.maxPos,
      outputDir: args.output,
    };

    // Run backtest
    const engine = new BacktestEngineV5(config, logger);
    const result = await engine.run();

    // Display results
    displayResults(result, logger);

    // Export results
    const outputFile = `backtest-${args.strategy}-${args.symbol}-${Date.now()}.json`;
    const exportPath = engine.exportResults(result, outputFile);

    logger.info('✅ Backtest completed', {
      outputFile: exportPath,
      trades: result.trades.length,
      winRate: `${(result.metrics.winRate * 100).toFixed(1)}%`,
      profitFactor: result.metrics.profitFactor.toFixed(2),
    });
  } catch (error) {
    logger.error('❌ Backtest runner error', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// ============================================================================
// DISPLAY RESULTS
// ============================================================================

function displayResults(result: BacktestResult, logger: LoggerService) {
  const m = result.metrics;
  const config = result.config;

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('                      BACKTEST RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`📊 Strategy: ${config.strategyFile.split('/').pop()}`);
  console.log(`📈 Symbol: ${config.symbol}`);
  console.log(`💰 Initial Balance: $${config.initialBalance.toFixed(2)}`);
  console.log(`📅 Period: ${result.endTime - result.startTime} ms`);
  console.log('');
  console.log('                         PERFORMANCE METRICS');
  console.log('───────────────────────────────────────────────────────────────────');
  console.log(`Total Trades:          ${m.totalTrades}`);
  console.log(`Winning Trades:        ${m.winningTrades} (${(m.winRate * 100).toFixed(1)}%)`);
  console.log(`Losing Trades:         ${m.losingTrades}`);
  console.log('');
  console.log(`Total PnL:             $${m.totalPnl.toFixed(2)}`);
  console.log(`Profit Factor:         ${m.profitFactor.toFixed(2)}`);
  console.log(`Average Win:           $${m.averageWin.toFixed(2)}`);
  console.log(`Average Loss:          $${m.averageLoss.toFixed(2)}`);
  console.log('');
  console.log(`Largest Win:           $${m.largestWin.toFixed(2)}`);
  console.log(`Largest Loss:          $${m.largestLoss.toFixed(2)}`);
  console.log(`Max Drawdown:          ${(m.maxDrawdown * 100).toFixed(2)}%`);
  console.log('');
  console.log(`Sharpe Ratio:          ${m.sharpeRatio.toFixed(2)}`);
  console.log(`Final Equity:          $${m.equityPeek.toFixed(2)}`);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  // Trade summary
  if (result.trades.length > 0) {
    console.log('                        SAMPLE TRADES (First 5)');
    console.log('───────────────────────────────────────────────────────────────────');
    result.trades.slice(0, 5).forEach((trade, idx) => {
      console.log(`\nTrade #${idx + 1}:`);
      console.log(
        `  Entry: ${new Date(trade.entryTime).toISOString()} @ $${trade.entryPrice.toFixed(8)}`,
      );
      console.log(`  Type:  ${trade.direction} | Size: ${trade.size.toFixed(4)}`);
      console.log(
        `  Exit:  ${new Date(trade.exitTime || 0).toISOString()} @ $${trade.exitPrice?.toFixed(8)} (${trade.exitReason})`,
      );
      console.log(`  P&L:   $${trade.pnl?.toFixed(2)} (${trade.pnlPercent?.toFixed(2)}%)`);
    });
    console.log('');
  }
}

// ============================================================================
// RUN
// ============================================================================

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
