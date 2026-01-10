/**
 * CALIBRATOR CLI - Run grid search optimization
 *
 * Usage:
 *   npm run calibrate -- --strategy level-trading-optimized --symbol XRPUSDT
 *   npm run calibrate -- --strategy level-trading-v3 --symbol XRPUSDT --quick
 */

import * as path from 'path';
import { LoggerService } from '../src/services/logger.service';
import { CalibratorService, ParameterGridConfig } from '../src/backtest/calibrator.service';

const logger = new LoggerService();

// Parse command line arguments
const args = process.argv.slice(2);
const strategy = args.includes('--strategy') ? args[args.indexOf('--strategy') + 1] : 'level-trading-optimized';
const symbol = args.includes('--symbol') ? args[args.indexOf('--symbol') + 1] : 'XRPUSDT';
const isQuick = args.includes('--quick');
const isFull = args.includes('--full');

const strategyFile = path.join(process.cwd(), 'strategies', 'json', `${strategy}.strategy.json`);

// Define parameter grids
const quickGrid: ParameterGridConfig = {
  emaFastPeriods: [9, 12, 15],
  emaSlowPeriods: [21, 26, 30],
  minConfidences: [0.40, 0.55],
  atrMultipliers: [1.5, 2.0],
  riskPercentages: [0.5, 1.0],
};

const normalGrid: ParameterGridConfig = {
  emaFastPeriods: [7, 9, 12, 15],
  emaSlowPeriods: [19, 21, 26, 30],
  minConfidences: [0.30, 0.40, 0.50, 0.60],
  atrMultipliers: [1.5, 2.0, 2.5],
  riskPercentages: [0.3, 0.5, 1.0],
};

const fullGrid: ParameterGridConfig = {
  emaFastPeriods: [5, 7, 9, 12, 15, 20],
  emaSlowPeriods: [13, 19, 21, 26, 30, 35],
  minConfidences: [0.25, 0.30, 0.40, 0.50, 0.60, 0.70],
  atrMultipliers: [1.0, 1.5, 2.0, 2.5, 3.0],
  riskPercentages: [0.2, 0.3, 0.5, 1.0, 1.5],
};

async function main() {
  try {
    const grid = isQuick ? quickGrid : isFull ? fullGrid : normalGrid;
    const gridSize = grid.emaFastPeriods.length *
      grid.emaSlowPeriods.length *
      grid.minConfidences.length *
      grid.atrMultipliers.length *
      grid.riskPercentages.length;

    logger.info('🎯 CALIBRATOR STARTED', {
      strategy,
      symbol,
      mode: isQuick ? 'QUICK' : isFull ? 'FULL' : 'NORMAL',
      totalTests: gridSize,
      estimatedTime: `${(gridSize * 0.5).toFixed(0)} seconds`,
    });

    const calibrator = new CalibratorService(logger);
    const report = await calibrator.calibrate(strategyFile, symbol, grid);

    // Print summary
    logger.info('═══════════════════════════════════════════════════════════════════', {});
    logger.info('                        CALIBRATION RESULTS', {});
    logger.info('═══════════════════════════════════════════════════════════════════', {});

    if (report.bestResult) {
      logger.info('🏆 BEST RESULT', {
        score: report.bestResult.score.toFixed(4),
        winRate: (report.bestResult.metrics.winRate * 100).toFixed(1) + '%',
        profitFactor: report.bestResult.metrics.profitFactor.toFixed(2),
        sharpeRatio: report.bestResult.metrics.sharpeRatio.toFixed(2),
        trades: report.bestResult.metrics.totalTrades,
        pnl: report.bestResult.metrics.totalPnl.toFixed(2) + ' USDT',
      });

      logger.info('⚙️ OPTIMAL PARAMETERS', {
        emaFast: report.bestResult.params.emaFastPeriods,
        emaSlow: report.bestResult.params.emaSlowPeriods,
        minConfidence: report.bestResult.params.minConfidences,
        atrMultiplier: report.bestResult.params.atrMultipliers,
        riskPercent: report.bestResult.params.riskPercentages,
      });
    } else {
      logger.warn('⚠️ No calibration results - all tests failed', {});
    }

    logger.info('📊 TOP 5 RESULTS', {});
    for (let i = 0; i < Math.min(5, report.topResults.length); i++) {
      const result = report.topResults[i];
      logger.info(`  #${i + 1}: Score=${result.score.toFixed(3)} WR=${(result.metrics.winRate * 100).toFixed(0)}% PF=${result.metrics.profitFactor.toFixed(2)} SR=${result.metrics.sharpeRatio.toFixed(2)}`, {});
    }

    logger.info('═══════════════════════════════════════════════════════════════════', {});
    logger.info('✅ Calibration complete! Check calibration-results/ for full report', {});

  } catch (error) {
    logger.error('❌ Calibration failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

main();
