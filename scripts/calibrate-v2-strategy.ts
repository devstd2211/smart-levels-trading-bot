/**
 * V2 Strategy Calibration Script
 *
 * Runs comprehensive grid search to find optimal parameters for profit factor
 * Tests combinations of:
 * - EMA periods (fast/slow)
 * - Analyzer weights and confidence thresholds
 * - Risk management (SL multiplier, TP levels)
 * - Entry threshold
 *
 * Usage:
 *   npm run calibrate-v2 -- --source json       // Test on JSON data (1 month)
 *   npm run calibrate-v2 -- --source sqlite     // Test on SQLite data (8 days)
 *   npm run calibrate-v2 -- --quick             // Quick mode (5 combinations)
 */

import * as fs from 'fs';
import * as path from 'path';
import { BacktestEngineV5, BacktestConfig, BacktestResult } from '../src/backtest/backtest-engine-v5';
import { StrategyConfig } from '../src/types/strategy-config.types';
import { LoggerService } from '../src/services/logger.service';

// ============================================================================
// TYPES
// ============================================================================

interface CalibrationTest {
  iteration: number;
  params: {
    emaFastPeriod: number;
    emaSlowPeriod: number;
    levelAnalyzerWeight: number;
    momentumAnalyzerWeight: number;
    emaAnalyzerWeight: number;
    minConfidenceThreshold: number;
    atrMultiplier: number;
    tp1Percent: number;
    tp2Percent: number;
    tp3Percent: number;
  };
  results: {
    totalTrades: number;
    winRate: number;
    profitFactor: number;
    sharpeRatio: number;
    totalPnl: number;
    maxDrawdown: number;
  };
  score: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const USE_JSON = process.argv.includes('--source') && process.argv.includes('json');
const QUICK_MODE = process.argv.includes('--quick');
const DATA_SOURCE = USE_JSON ? 'json' : 'sqlite';

const logger = new LoggerService();

// Parameter grids
const CALIBRATION_GRIDS = {
  emaFastPeriod: QUICK_MODE ? [9, 12] : [8, 9, 12, 15],
  emaSlowPeriod: QUICK_MODE ? [19, 26] : [19, 21, 26, 30],
  levelAnalyzerWeight: QUICK_MODE ? [0.40] : [0.35, 0.40, 0.45],
  momentumAnalyzerWeight: QUICK_MODE ? [0.35] : [0.30, 0.35, 0.40],
  // EMA weight is calculated as 1.0 - level - momentum
  minConfidenceThreshold: QUICK_MODE ? [30, 40] : [25, 30, 35, 40, 45],
  atrMultiplier: QUICK_MODE ? [1.5, 2.0] : [1.5, 2.0, 2.5],
  tp1Percent: QUICK_MODE ? [1.0] : [0.8, 1.0, 1.2],
  tp2Percent: QUICK_MODE ? [2.0] : [1.5, 2.0, 2.5],
  tp3Percent: QUICK_MODE ? [3.5] : [3.0, 3.5, 4.0],
};

// Calculate total combinations
const totalCombinations = Object.values(CALIBRATION_GRIDS).reduce((acc, grid) => acc * grid.length, 1);

logger.info(`🎛️ V2 Strategy Calibration`, {
  mode: QUICK_MODE ? 'QUICK' : 'NORMAL',
  dataSource: DATA_SOURCE,
  totalCombinations,
  estimatedTime: QUICK_MODE ? '5-10 minutes' : '30-60 minutes',
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Load and clone base strategy configuration
 */
function loadBaseStrategyConfig(): StrategyConfig {
  const configPath = path.join(__dirname, '../strategies/json/level-trading-v2.strategy.json');
  const content = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Create modified strategy config for testing
 */
function createStrategyVariant(
  baseConfig: StrategyConfig,
  params: CalibrationTest['params'],
): StrategyConfig {
  const config = JSON.parse(JSON.stringify(baseConfig)); // Deep clone

  // Update EMA periods
  config.indicators.ema.fastPeriod = params.emaFastPeriod;
  config.indicators.ema.slowPeriod = params.emaSlowPeriod;

  // Update analyzer weights and normalize
  const levelWeight = params.levelAnalyzerWeight;
  const momentumWeight = params.momentumAnalyzerWeight;
  const emaWeight = 1.0 - levelWeight - momentumWeight;

  // Clamp to valid range
  if (emaWeight < 0.05) {
    // Skip invalid combinations
    return null as any;
  }

  config.analyzers[0].weight = levelWeight; // LEVEL_ANALYZER_NEW
  config.analyzers[1].weight = momentumWeight; // PRICE_MOMENTUM_ANALYZER_NEW
  config.analyzers[2].weight = emaWeight; // EMA_ANALYZER_NEW

  // Update entry threshold
  config.entryThreshold = params.minConfidenceThreshold;

  // Update risk management
  config.riskManagement.stopLoss.atrMultiplier = params.atrMultiplier;
  config.riskManagement.takeProfits[0].percent = params.tp1Percent;
  config.riskManagement.takeProfits[1].percent = params.tp2Percent;
  config.riskManagement.takeProfits[2].percent = params.tp3Percent;

  return config;
}

/**
 * Calculate composite score for ranking
 * Score = (WR × 0.40) + (PF × 0.35) + (Sharpe × 0.15) + (TradeCount × 0.10)
 */
function calculateScore(result: BacktestResult): number {
  const metrics = result.metrics;

  // Normalize metrics to 0-1 scale
  const wrScore = metrics.winRate; // Already 0-1
  const pfScore = Math.min(metrics.profitFactor / 5.0, 1.0); // Cap at 5.0 = score 1.0
  const sharpeScore = Math.min(Math.max(metrics.sharpeRatio / 3.0, 0), 1.0); // -3 to 3 = 0-1
  const tradeScore = Math.min(metrics.totalTrades / 50.0, 1.0); // 50+ trades = score 1.0

  return (wrScore * 0.40) + (pfScore * 0.35) + (sharpeScore * 0.15) + (tradeScore * 0.10);
}

/**
 * Run single backtest iteration
 */
async function runBacktest(
  strategyConfig: StrategyConfig,
  iteration: number,
): Promise<BacktestResult | null> {
  try {
    const backTestConfig: BacktestConfig = {
      strategyFile: path.join(__dirname, `../calibration-temp-${iteration}.strategy.json`),
      symbol: 'XRPUSDT',
      dataProvider: DATA_SOURCE as 'json' | 'sqlite',
      initialBalance: 10000,
      maxOpenPositions: 5,
      outputDir: path.join(__dirname, '../backtest-results'),
    };

    // Write temporary strategy file
    fs.writeFileSync(backTestConfig.strategyFile, JSON.stringify(strategyConfig, null, 2));

    try {
      const engine = new BacktestEngineV5(backTestConfig, logger);
      const result = await engine.run();
      return result;
    } finally {
      // Clean up temporary file
      if (fs.existsSync(backTestConfig.strategyFile)) {
        fs.unlinkSync(backTestConfig.strategyFile);
      }
    }
  } catch (error) {
    logger.error(`❌ Backtest failed for iteration ${iteration}`, { error: (error as Error).message });
    return null;
  }
}

/**
 * Generate all parameter combinations
 */
function* generateParameterCombinations() {
  const {
    emaFastPeriod,
    emaSlowPeriod,
    levelAnalyzerWeight,
    momentumAnalyzerWeight,
    minConfidenceThreshold,
    atrMultiplier,
    tp1Percent,
    tp2Percent,
    tp3Percent,
  } = CALIBRATION_GRIDS;

  let iteration = 0;

  for (const fast of emaFastPeriod) {
    for (const slow of emaSlowPeriod) {
      for (const level of levelAnalyzerWeight) {
        for (const momentum of momentumAnalyzerWeight) {
          for (const threshold of minConfidenceThreshold) {
            for (const atr of atrMultiplier) {
              for (const tp1 of tp1Percent) {
                for (const tp2 of tp2Percent) {
                  for (const tp3 of tp3Percent) {
                    yield {
                      iteration: ++iteration,
                      emaFastPeriod: fast,
                      emaSlowPeriod: slow,
                      levelAnalyzerWeight: level,
                      momentumAnalyzerWeight: momentum,
                      minConfidenceThreshold: threshold,
                      atrMultiplier: atr,
                      tp1Percent: tp1,
                      tp2Percent: tp2,
                      tp3Percent: tp3,
                    };
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

// ============================================================================
// MAIN CALIBRATION LOOP
// ============================================================================

async function runCalibration() {
  const startTime = Date.now();
  const results: CalibrationTest[] = [];
  const baseConfig = loadBaseStrategyConfig();
  let successCount = 0;
  let skipCount = 0;

  logger.info(`📊 Starting calibration run on ${DATA_SOURCE.toUpperCase()} data...`);

  const paramGenerator = generateParameterCombinations();

  for (const paramSet of paramGenerator) {
    const { iteration, ...params } = paramSet;

    // Create variant config
    const variantConfig = createStrategyVariant(baseConfig, params as any);
    if (!variantConfig) {
      skipCount++;
      continue;
    }

    // Run backtest
    const backTestResult = await runBacktest(variantConfig, iteration);
    if (!backTestResult) {
      continue;
    }

    // Calculate score
    const score = calculateScore(backTestResult);

    // Store result
    const testResult: CalibrationTest = {
      iteration,
      params: params as any,
      results: {
        totalTrades: backTestResult.metrics.totalTrades,
        winRate: backTestResult.metrics.winRate,
        profitFactor: backTestResult.metrics.profitFactor,
        sharpeRatio: backTestResult.metrics.sharpeRatio,
        totalPnl: backTestResult.metrics.totalPnl,
        maxDrawdown: backTestResult.metrics.maxDrawdown,
      },
      score,
    };

    results.push(testResult);
    successCount++;

    // Log progress every 10 iterations
    if (successCount % 10 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      logger.info(`⏳ Progress: ${successCount}/${totalCombinations} tests (${elapsed} min)`, {
        bestScore: Math.max(...results.map((r) => r.score)).toFixed(4),
        avgScore: (results.reduce((sum, r) => sum + r.score, 0) / results.length).toFixed(4),
      });
    }
  }

  const elapsed = Date.now() - startTime;
  logger.info(`✅ Calibration complete!`, {
    totalTests: successCount,
    skipped: skipCount,
    elapsed: `${(elapsed / 1000 / 60).toFixed(1)} minutes`,
  });

  // =========================================================================
  // ANALYZE AND REPORT RESULTS
  // =========================================================================

  // Sort by profit factor (primary), then score
  const sortedByPF = [...results].sort(
    (a, b) => b.results.profitFactor - a.results.profitFactor,
  );

  // Sort by score
  const sortedByScore = [...results].sort((a, b) => b.score - a.score);

  logger.info(`\n${'═'.repeat(80)}`);
  logger.info(`                    TOP 10 RESULTS BY PROFIT FACTOR`);
  logger.info(`${'═'.repeat(80)}`);

  for (let i = 0; i < Math.min(10, sortedByPF.length); i++) {
    const result = sortedByPF[i];
    logger.info(`\n#${i + 1}: EMA ${result.params.emaFastPeriod}/${result.params.emaSlowPeriod} | ` +
      `Weights: L=${(result.params.levelAnalyzerWeight).toFixed(2)} M=${(result.params.momentumAnalyzerWeight).toFixed(2)} ` +
      `E=${(1 - result.params.levelAnalyzerWeight - result.params.momentumAnalyzerWeight).toFixed(2)}`, {
      'Win Rate': `${(result.results.winRate * 100).toFixed(1)}%`,
      'Profit Factor': result.results.profitFactor.toFixed(2),
      'Total P&L': `$${result.results.totalPnl.toFixed(2)}`,
      'Trades': result.results.totalTrades,
      'Sharpe': result.results.sharpeRatio.toFixed(2),
      'Score': result.score.toFixed(4),
    });
  }

  logger.info(`\n${'═'.repeat(80)}`);
  logger.info(`                    TOP 10 RESULTS BY COMPOSITE SCORE`);
  logger.info(`${'═'.repeat(80)}`);

  for (let i = 0; i < Math.min(10, sortedByScore.length); i++) {
    const result = sortedByScore[i];
    logger.info(`\n#${i + 1}: EMA ${result.params.emaFastPeriod}/${result.params.emaSlowPeriod} | ` +
      `Entry Threshold: ${result.params.minConfidenceThreshold} | ATR: ${result.params.atrMultiplier}x`, {
      'Score': result.score.toFixed(4),
      'Win Rate': `${(result.results.winRate * 100).toFixed(1)}%`,
      'Profit Factor': result.results.profitFactor.toFixed(2),
      'Total P&L': `$${result.results.totalPnl.toFixed(2)}`,
      'Trades': result.results.totalTrades,
      'Sharpe': result.results.sharpeRatio.toFixed(2),
    });
  }

  // =========================================================================
  // EXPORT RESULTS TO JSON
  // =========================================================================

  const exportPath = path.join(
    __dirname,
    `../calibration-results/calibration-v2-${DATA_SOURCE}-${Date.now()}.json`,
  );

  const exportDir = path.dirname(exportPath);
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const exportData = {
    metadata: {
      timestamp: new Date().toISOString(),
      dataSource: DATA_SOURCE,
      mode: QUICK_MODE ? 'QUICK' : 'NORMAL',
      totalTests: successCount,
      totalSkipped: skipCount,
      elapsedMs: elapsed,
    },
    topByProfitFactor: sortedByPF.slice(0, 20),
    topByScore: sortedByScore.slice(0, 20),
    allResults: results,
    statistics: {
      avgProfitFactor: results.reduce((sum, r) => sum + r.results.profitFactor, 0) / results.length,
      avgWinRate: results.reduce((sum, r) => sum + r.results.winRate, 0) / results.length,
      avgScore: results.reduce((sum, r) => sum + r.score, 0) / results.length,
      bestProfitFactor: Math.max(...results.map((r) => r.results.profitFactor)),
      bestScore: Math.max(...results.map((r) => r.score)),
      bestWinRate: Math.max(...results.map((r) => r.results.winRate)),
    },
  };

  fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
  logger.info(`💾 Results exported to: ${exportPath}`);

  // =========================================================================
  // FINAL RECOMMENDATION
  // =========================================================================

  const bestByPF = sortedByPF[0];
  const bestByScore = sortedByScore[0];

  logger.info(`\n${'═'.repeat(80)}`);
  logger.info(`                      FINAL RECOMMENDATION`);
  logger.info(`${'═'.repeat(80)}`);

  logger.info(`\n🏆 BEST BY PROFIT FACTOR:`, {
    'Strategy': `EMA ${bestByPF.params.emaFastPeriod}/${bestByPF.params.emaSlowPeriod}`,
    'Weights': `L=${bestByPF.params.levelAnalyzerWeight.toFixed(2)} M=${bestByPF.params.momentumAnalyzerWeight.toFixed(2)} E=${(1 - bestByPF.params.levelAnalyzerWeight - bestByPF.params.momentumAnalyzerWeight).toFixed(2)}`,
    'Entry Threshold': bestByPF.params.minConfidenceThreshold,
    'ATR Multiplier': bestByPF.params.atrMultiplier,
    'Profit Factor': bestByPF.results.profitFactor.toFixed(2),
    'Win Rate': `${(bestByPF.results.winRate * 100).toFixed(1)}%`,
    'Total P&L': `$${bestByPF.results.totalPnl.toFixed(2)}`,
  });

  logger.info(`\n🎯 BEST BY COMPOSITE SCORE:`, {
    'Strategy': `EMA ${bestByScore.params.emaFastPeriod}/${bestByScore.params.emaSlowPeriod}`,
    'Weights': `L=${bestByScore.params.levelAnalyzerWeight.toFixed(2)} M=${bestByScore.params.momentumAnalyzerWeight.toFixed(2)} E=${(1 - bestByScore.params.levelAnalyzerWeight - bestByScore.params.momentumAnalyzerWeight).toFixed(2)}`,
    'Entry Threshold': bestByScore.params.minConfidenceThreshold,
    'Score': bestByScore.score.toFixed(4),
    'Profit Factor': bestByScore.results.profitFactor.toFixed(2),
    'Win Rate': `${(bestByScore.results.winRate * 100).toFixed(1)}%`,
    'Total P&L': `$${bestByScore.results.totalPnl.toFixed(2)}`,
  });

  logger.info(`\n💡 To apply these parameters, update level-trading-v2.strategy.json with:`);
  logger.info(`   - ema.fastPeriod: ${bestByPF.params.emaFastPeriod}`);
  logger.info(`   - ema.slowPeriod: ${bestByPF.params.emaSlowPeriod}`);
  logger.info(`   - entryThreshold: ${bestByPF.params.minConfidenceThreshold}`);
  logger.info(`   - riskManagement.stopLoss.atrMultiplier: ${bestByPF.params.atrMultiplier}`);
}

// Run calibration
runCalibration().catch((error) => {
  logger.error('❌ Calibration failed', { error: error.message });
  process.exit(1);
});
