#!/usr/bin/env ts-node

/**
 * Position Sizing Diagnostic Script
 *
 * Tracks position sizes from entry to close to find the 0.0000 bug
 */

import * as path from 'path';
import * as fs from 'fs';
import { BacktestEngineV5, BacktestResult } from '../src/backtest/backtest-engine-v5';
import { LoggerService } from '../src/services/logger.service';

async function main() {
  const logger = new LoggerService();

  const strategyFile = path.join(__dirname, '../strategies/json/level-trading-single-ema.strategy.json');

  logger.info('🔍 Position Sizing Diagnostic', {
    strategy: strategyFile,
    goal: 'Track size from entry to close for all trades',
  });

  try {
    const config = {
      strategyFile,
      symbol: 'XRPUSDT',
      alternativeSymbol: 'BTCUSDT',
      dataProvider: 'json' as const,
      initialBalance: 10000,
      maxOpenPositions: 3,
      outputDir: './backtest-results',
    };

    const engine = new BacktestEngineV5(config, logger);
    const result = await engine.run();

    // Analyze results
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                   POSITION SIZE ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');

    const trades = result.trades.slice(0, 20); // First 20 trades
    let zeroSizeCount = 0;
    let normalSizeCount = 0;

    trades.forEach((trade, idx) => {
      const entryDate = new Date(trade.entryTime).toISOString();
      const exitDate = new Date(trade.exitTime || 0).toISOString();

      if (trade.size === 0 || trade.size < 0.0001) {
        zeroSizeCount++;
        console.log(`\n❌ Trade #${idx + 1} - ZERO SIZE`);
      } else {
        normalSizeCount++;
        console.log(`\n✅ Trade #${idx + 1} - NORMAL SIZE`);
      }

      console.log(`   Entry:    ${entryDate} @ $${trade.entryPrice.toFixed(8)}`);
      console.log(`   Type:     ${trade.direction}`);
      console.log(`   Size:     ${trade.size.toFixed(4)} XRP`);
      console.log(`   SL:       $${trade.stopLoss.toFixed(8)}`);
      console.log(`   Exit:     ${exitDate} @ $${trade.exitPrice?.toFixed(8)} (${trade.exitReason})`);
      console.log(`   P&L:      $${trade.pnl?.toFixed(2)} (${trade.pnlPercent?.toFixed(2)}%)`);
      console.log(`   Duration: ${trade.duration ? (trade.duration / 60000).toFixed(1) + ' min' : 'N/A'}`);

      // Log TP info
      if (trade.takeProfits && trade.takeProfits.length > 0) {
        console.log(`   TPs:`);
        trade.takeProfits.forEach((tp: any) => {
          console.log(`     - TP${tp.level}: $${tp.price.toFixed(8)} | Size: ${tp.size.toFixed(4)} | Hit: ${tp.hit || false}`);
        });
      }
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`Total Trades Analyzed: ${trades.length}`);
    console.log(`Zero Size Trades:      ${zeroSizeCount} (${((zeroSizeCount / trades.length) * 100).toFixed(1)}%)`);
    console.log(`Normal Size Trades:    ${normalSizeCount} (${((normalSizeCount / trades.length) * 100).toFixed(1)}%)`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // Summary stats
    console.log('Performance Summary:');
    const m = result.metrics;
    console.log(`  Total Trades:    ${m.totalTrades}`);
    console.log(`  Win Rate:        ${(m.winRate * 100).toFixed(1)}%`);
    console.log(`  Profit Factor:   ${m.profitFactor.toFixed(2)}`);
    console.log(`  Total P&L:       $${m.totalPnl.toFixed(2)}`);

  } catch (error) {
    logger.error('Diagnostic failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

main();
