/**
 * Walk-Forward Analysis Types
 */

export interface ParameterOptimizer {
  optimize(grid: any, config: any, opts: any): Promise<any>;
}

export interface WindowAnalysisResult {
  windowId: number;
  inSamplePerformance: number;
  outOfSamplePerformance: number;
  drawdown: number;
}
