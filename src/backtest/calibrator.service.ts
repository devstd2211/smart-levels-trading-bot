/**
 * CALIBRATOR SERVICE - A/B Parameter Grid Search Optimizer
 */

import * as fs from 'fs';
import * as path from 'path';
import { LoggerService } from '../services/logger.service';
import { BacktestEngineV5, BacktestConfig, BacktestResult } from './backtest-engine-v5';

export interface ParameterGridConfig {
  emaFastPeriods: number[];
  emaSlowPeriods: number[];
  minConfidences: number[];
  atrMultipliers: number[];
  riskPercentages: number[];
}

export interface TestResult {
  params: Record<string, number>;
  metrics: {
    winRate: number;
    profitFactor: number;
    sharpeRatio: number;
    totalTrades: number;
    totalPnl: number;
  };
  score: number;
}

export interface CalibrationReport {
  timestamp: string;
  strategy: string;
  symbol: string;
  totalTests: number;
  bestResult?: TestResult;
  allResults: TestResult[];
  topResults: TestResult[];
}

export class CalibratorService {
  private logger: LoggerService;

  constructor(logger?: LoggerService) {
    this.logger = logger || new LoggerService();
  }

  /**
   * Run grid search calibration
   */
  async calibrate(
    strategyFile: string,
    symbol: string,
    gridConfig: ParameterGridConfig,
  ): Promise<CalibrationReport> {
    this.logger.info('🔄 Starting calibration...', {
      strategy: strategyFile,
      symbol,
      gridSize: this.calculateGridSize(gridConfig),
    });

    const results: TestResult[] = [];
    const totalTests = this.calculateGridSize(gridConfig);
    let testCount = 0;

    // Generate all parameter combinations
    const combinations = this.generateCombinations(gridConfig);

    for (const paramSet of combinations) {
      testCount++;
      const progress = ((testCount / totalTests) * 100).toFixed(1);

      this.logger.info(`⏳ Test ${testCount}/${totalTests} (${progress}%)`, {
        emaFast: paramSet.emaFastPeriods,
        emaSlow: paramSet.emaSlowPeriods,
        minConf: paramSet.minConfidences,
        atrMult: paramSet.atrMultipliers,
      });

      // Create temporary strategy with current params
      const tempStrategy = await this.createTempStrategy(strategyFile, paramSet);

      // Run backtest
      const backtest = new BacktestEngineV5(
        {
          strategyFile: tempStrategy,
          symbol,
          dataProvider: 'json',
          initialBalance: 10000,
          maxOpenPositions: 3,
        },
        this.logger,
      );

      try {
        const result = await backtest.run();
        const score = this.calculateScore(result.metrics);

        results.push({
          params: paramSet,
          metrics: {
            winRate: result.metrics.winRate,
            profitFactor: result.metrics.profitFactor,
            sharpeRatio: result.metrics.sharpeRatio,
            totalTrades: result.metrics.totalTrades,
            totalPnl: result.metrics.totalPnl,
          },
          score,
        });

        this.logger.info(`✅ Result: WR=${(result.metrics.winRate * 100).toFixed(0)}% PF=${result.metrics.profitFactor.toFixed(2)} Score=${score.toFixed(3)}`, {});

        if (fs.existsSync(tempStrategy)) {
          fs.unlinkSync(tempStrategy);
        }
      } catch (error) {
        this.logger.warn(`❌ Test failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
        if (fs.existsSync(tempStrategy)) {
          fs.unlinkSync(tempStrategy);
        }
      }
    }

    // Sort by score
    results.sort((a, b) => b.score - a.score);

    // Create report
    const report: CalibrationReport = {
      timestamp: new Date().toISOString(),
      strategy: strategyFile,
      symbol,
      totalTests: results.length,
      bestResult: results.length > 0 ? results[0] : undefined,
      allResults: results,
      topResults: results.slice(0, 10),
    };

    // Save report
    await this.saveReport(report);

    return report;
  }

  private calculateGridSize(grid: ParameterGridConfig): number {
    return (
      grid.emaFastPeriods.length *
      grid.emaSlowPeriods.length *
      grid.minConfidences.length *
      grid.atrMultipliers.length *
      grid.riskPercentages.length
    );
  }

  private generateCombinations(grid: ParameterGridConfig): Record<string, number>[] {
    const combinations: Record<string, number>[] = [];

    for (const emaFast of grid.emaFastPeriods) {
      for (const emaSlow of grid.emaSlowPeriods) {
        for (const minConf of grid.minConfidences) {
          for (const atrMult of grid.atrMultipliers) {
            for (const risk of grid.riskPercentages) {
              combinations.push({
                emaFastPeriods: emaFast,
                emaSlowPeriods: emaSlow,
                minConfidences: minConf,
                atrMultipliers: atrMult,
                riskPercentages: risk,
              });
            }
          }
        }
      }
    }

    return combinations;
  }

  private async createTempStrategy(
    baseStrategy: string,
    params: Record<string, number>,
  ): Promise<string> {
    const content = JSON.parse(fs.readFileSync(baseStrategy, 'utf-8'));

    if (content.indicators?.ema) {
      content.indicators.ema.fastPeriod = params.emaFastPeriods;
      content.indicators.ema.slowPeriod = params.emaSlowPeriods;
    }

    if (content.analyzers) {
      for (const analyzer of content.analyzers) {
        analyzer.minConfidence = params.minConfidences;
      }
    }

    if (content.riskManagement?.stopLoss) {
      content.riskManagement.stopLoss.atrMultiplier = params.atrMultipliers;
    }

    const tempFile = path.join(
      path.dirname(baseStrategy),
      `_temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`,
    );
    fs.writeFileSync(tempFile, JSON.stringify(content, null, 2));

    return tempFile;
  }

  private calculateScore(metrics: {
    winRate: number;
    profitFactor: number;
    sharpeRatio: number;
    totalTrades: number;
  }): number {
    const winRateWeight = 0.4;
    const profitFactorWeight = 0.35;
    const sharpeWeight = 0.15;
    const tradeCountWeight = 0.1;

    const winRateScore = Math.min(metrics.winRate, 1.0);
    const profitFactorScore = Math.min(metrics.profitFactor / 3.0, 1.0);
    const sharpeScore = Math.min(metrics.sharpeRatio / 2.0, 1.0);
    const tradeCountScore = Math.min(metrics.totalTrades / 100, 1.0);

    const score =
      winRateScore * winRateWeight +
      profitFactorScore * profitFactorWeight +
      sharpeScore * sharpeWeight +
      tradeCountScore * tradeCountWeight;

    return score;
  }

  private async saveReport(report: CalibrationReport): Promise<void> {
    const outputDir = path.join(process.cwd(), 'calibration-results');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filename = path.join(outputDir, `calibration_${Date.now()}.json`);
    fs.writeFileSync(filename, JSON.stringify(report, null, 2));

    this.logger.info('📊 Report saved', { file: filename });
  }
}
