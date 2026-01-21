/**
 * Walk-Forward Analysis Engine
 *
 * Detects parameter overfitting through rolling window optimization
 * 1. Split historical data into windows
 * 2. Optimize parameters on in-sample data
 * 3. Test on out-of-sample data
 * 4. Compare in-sample vs out-of-sample metrics
 * 5. Detect overfitting (IS good, OOS bad)
 */

import { BacktestEngineV5, BacktestConfig, BacktestResult } from '../backtest-engine-v5';
import { LoggerService } from '../../services/logger.service';
import { Candle } from '../../types';

export interface WalkForwardWindow {
  windowId: number;
  inSampleStart: number;      // Timestamp
  inSampleEnd: number;
  outOfSampleStart: number;
  outOfSampleEnd: number;
  inSampleCandles: Candle[];
  outOfSampleCandles: Candle[];
}

export interface WalkForwardWindowResult {
  windowId: number;
  inSampleMetrics: {
    sharpe: number;
    profitFactor: number;
    winRate: number;
    totalTrades: number;
  };
  outOfSampleMetrics: {
    sharpe: number;
    profitFactor: number;
    winRate: number;
    totalTrades: number;
  };
  optimalParams: { [key: string]: any };
  overfittingDetected: boolean;
  overfittingScore: number; // 0-1: 0=no overfitting, 1=severe
}

export interface WalkForwardConfig {
  inSampleDays: number;          // e.g., 20 days for optimization
  outOfSampleDays: number;       // e.g., 10 days for testing
  windowStartDate?: string;      // YYYY-MM-DD
  windowEndDate?: string;
  optimizationMetric: 'sharpe' | 'profitFactor' | 'winRate';
  parameterGrid?: { [key: string]: number[] };
  detectionThreshold?: number;   // Threshold for overfitting detection (default: 0.3)
}

/**
 * Walk-Forward Engine
 */
export class WalkForwardEngine {
  private logger: LoggerService;

  constructor(logger?: LoggerService) {
    this.logger = logger || new LoggerService();
  }

  /**
   * Execute walk-forward analysis
   */
  async run(
    candles: Candle[],
    baseConfig: BacktestConfig,
    walConfig: WalkForwardConfig
  ): Promise<WalkForwardWindowResult[]> {
    this.logger.info('🔄 Starting walk-forward analysis', {
      inSampleDays: walConfig.inSampleDays,
      outOfSampleDays: walConfig.outOfSampleDays,
      metric: walConfig.optimizationMetric,
    });

    // Split data into windows
    const windows = this.splitIntoWindows(candles, walConfig);
    this.logger.info(`📊 Generated ${windows.length} analysis windows`);

    // Process each window
    const results: WalkForwardWindowResult[] = [];

    for (let i = 0; i < windows.length; i++) {
      const window = windows[i];
      this.logger.info(`⏳ Processing window ${i + 1}/${windows.length}...`);

      const result = await this.analyzeWindow(window, baseConfig, walConfig);
      results.push(result);
    }

    // Generate summary
    this.summarizeResults(results, walConfig);

    return results;
  }

  /**
   * Split data into rolling windows
   */
  private splitIntoWindows(candles: Candle[], config: WalkForwardConfig): WalkForwardWindow[] {
    const windows: WalkForwardWindow[] = [];
    if (candles.length === 0) return windows;

    const inSampleMs = config.inSampleDays * 24 * 60 * 60 * 1000;
    const outOfSampleMs = config.outOfSampleDays * 24 * 60 * 60 * 1000;
    const windowSize = inSampleMs + outOfSampleMs;

    let windowId = 0;
    let inSampleStart = candles[0].timestamp;

    // Iterate through time windows until we run out of data
    while (inSampleStart + windowSize <= candles[candles.length - 1].timestamp) {
      const inSampleEnd = inSampleStart + inSampleMs;
      const outOfSampleEnd = inSampleEnd + outOfSampleMs;

      // Get candles for this window
      const inSampleCandles = candles.filter(
        c => c.timestamp >= inSampleStart && c.timestamp < inSampleEnd
      );
      const outOfSampleCandles = candles.filter(
        c => c.timestamp >= inSampleEnd && c.timestamp < outOfSampleEnd
      );

      if (inSampleCandles.length > 0 && outOfSampleCandles.length > 0) {
        windows.push({
          windowId: windowId++,
          inSampleStart,
          inSampleEnd,
          outOfSampleStart: inSampleEnd,
          outOfSampleEnd,
          inSampleCandles,
          outOfSampleCandles,
        });
      }

      // Move to next window (rolling forward by outOfSampleMs)
      inSampleStart += outOfSampleMs;
    }

    return windows;
  }

  /**
   * Analyze a single window
   */
  private async analyzeWindow(
    window: WalkForwardWindow,
    baseConfig: BacktestConfig,
    config: WalkForwardConfig
  ): Promise<WalkForwardWindowResult> {
    // TODO: Integrate with actual parameter optimizer
    // For now, return placeholder result

    const result: WalkForwardWindowResult = {
      windowId: window.windowId,
      inSampleMetrics: {
        sharpe: 1.5,
        profitFactor: 1.8,
        winRate: 0.55,
        totalTrades: 100,
      },
      outOfSampleMetrics: {
        sharpe: 0.9,
        profitFactor: 1.2,
        winRate: 0.50,
        totalTrades: 50,
      },
      optimalParams: {},
      overfittingDetected: false,
      overfittingScore: 0.2,
    };

    // Detect overfitting
    result.overfittingDetected = this.detectOverfitting(
      result.inSampleMetrics,
      result.outOfSampleMetrics,
      config.optimizationMetric,
      config.detectionThreshold || 0.3
    );

    return result;
  }

  /**
   * Detect overfitting by comparing in-sample vs out-of-sample metrics
   */
  private detectOverfitting(
    inSample: any,
    outOfSample: any,
    metric: string,
    threshold: number
  ): boolean {
    const getMetricValue = (metrics: any) => {
      switch (metric) {
        case 'sharpe':
          return metrics.sharpe || 0;
        case 'profitFactor':
          return metrics.profitFactor || 0;
        case 'winRate':
          return metrics.winRate || 0;
        default:
          return 0;
      }
    };

    const inSampleValue = getMetricValue(inSample);
    const outOfSampleValue = getMetricValue(outOfSample);

    // Overfitting detected if in-sample significantly better than out-of-sample
    const performanceRatio = outOfSampleValue / inSampleValue;
    const performanceGap = 1 - performanceRatio;

    return performanceGap > threshold;
  }

  /**
   * Summarize walk-forward results
   */
  private summarizeResults(results: WalkForwardWindowResult[], config: WalkForwardConfig): void {
    const overfittedWindows = results.filter(r => r.overfittingDetected).length;
    const avgOverftingScore = results.reduce((sum, r) => sum + r.overfittingScore, 0) / results.length;

    this.logger.info('📈 Walk-Forward Analysis Summary', {
      totalWindows: results.length,
      overfittedWindows,
      overfittingRate: `${((overfittedWindows / results.length) * 100).toFixed(1)}%`,
      avgOverftingScore: avgOverftingScore.toFixed(2),
    });

    if (overfittedWindows > results.length / 2) {
      this.logger.warn('⚠️ High overfitting detected - parameters may not generalize well');
    }
  }
}
