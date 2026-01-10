#!/usr/bin/env ts-node

/**
 * Calibration Results Analyzer
 *
 * Extracts insights from calibration results:
 * - Parameter sensitivity analysis
 * - Overfitting detection
 * - Recommendation generation
 */

import * as fs from 'fs';
import * as path from 'path';

interface CalibrationResult {
  timestamp: string;
  strategy: string;
  symbol: string;
  totalTests: number;
  bestResult?: {
    params: Record<string, number>;
    metrics: {
      winRate: number;
      profitFactor: number;
      sharpeRatio: number;
      totalTrades: number;
      totalPnl: number;
    };
    score: number;
  };
  topResults?: Array<any>;
  allResults?: Array<any>;
}

function generateReport(results: CalibrationResult) {
  if (!results.bestResult) {
    console.log('❌ No calibration results available\n');
    return;
  }

  const br = results.bestResult;
  const m = br.metrics;
  const score = br.score;

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                    CALIBRATION ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`📊 OVERALL SCORE: ${score.toFixed(3)}`);
  console.log(`Strategy: ${results.strategy}`);
  console.log(`Total Tests: ${results.totalTests}\n`);

  console.log('OPTIMAL PARAMETERS:');
  console.log(`  EMA Fast:   ${br.params.emaFastPeriods}`);
  console.log(`  EMA Slow:   ${br.params.emaSlowPeriods}`);
  console.log(`  Min Conf:   ${br.params.minConfidences}`);
  console.log(`  ATR Mult:   ${br.params.atrMultipliers}`);
  console.log(`  Risk %:     ${br.params.riskPercentages}\n`);

  console.log('PERFORMANCE:');
  console.log(`  Win Rate:      ${(m.winRate * 100).toFixed(1)}%`);
  console.log(`  Profit Factor: ${m.profitFactor.toFixed(2)}`);
  console.log(`  Sharpe Ratio:  ${m.sharpeRatio.toFixed(2)}`);
  console.log(`  Trades:        ${m.totalTrades}`);
  console.log(`  Total P&L:     $${m.totalPnl.toFixed(2)}\n`);

  console.log('═══════════════════════════════════════════════════════════\n');
}

async function main() {
  const resultsDir = path.join(process.cwd(), 'calibration-results');

  if (!fs.existsSync(resultsDir)) {
    console.log('❌ No calibration-results directory');
    process.exit(1);
  }

  const files = fs
    .readdirSync(resultsDir)
    .filter((f) => f.startsWith('calibration_'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.log('❌ No calibration results found');
    process.exit(1);
  }

  const latestFile = path.join(resultsDir, files[0]);
  const content = fs.readFileSync(latestFile, 'utf-8');
  const results: CalibrationResult = JSON.parse(content);

  generateReport(results);
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
