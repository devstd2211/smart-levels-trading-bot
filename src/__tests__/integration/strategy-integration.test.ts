/**
 * STRATEGY SYSTEM - INTEGRATION TESTS
 * Tests demonstrating how strategy system integrates with AnalyzerRegistry
 * and StrategyCoordinator without bot code changes
 */

import { StrategyLoaderService } from '../../services/strategy-loader.service';
import { StrategyConfig } from '../../types/strategy-config.types';
import { promises as fs } from 'fs';
import { join } from 'path';
import { mkdtemp, rmdir } from 'fs/promises';
import { tmpdir } from 'os';

describe('Strategy System - Integration Tests', () => {
  let tempDir: string;
  let loader: StrategyLoaderService;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'strategy-integration-'));
    loader = new StrategyLoaderService(tempDir);
  });

  afterEach(async () => {
    try {
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        await fs.unlink(join(tempDir, file));
      }
      await rmdir(tempDir);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Strategy Selection and Filtering', () => {
    it('should identify enabled analyzers from strategy', async () => {
      const strategy: StrategyConfig = {
        version: 1,
        metadata: {
          name: 'Minimal Test Strategy',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: ['test'],
        },
        analyzers: [
          { name: 'EMA_ANALYZER_NEW', enabled: true, weight: 0.5, priority: 1 },
          { name: 'RSI_ANALYZER_NEW', enabled: true, weight: 0.5, priority: 2 },
        ],
      };

      const filePath = join(tempDir, 'minimal.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      const loaded = await loader.loadStrategy('minimal');
      const enabledAnalyzers = loaded.analyzers.filter(a => a.enabled);

      expect(enabledAnalyzers).toHaveLength(2);
      expect(enabledAnalyzers[0].name).toBe('EMA_ANALYZER_NEW');
      expect(enabledAnalyzers[1].name).toBe('RSI_ANALYZER_NEW');
    });

    it('should handle mixed enabled/disabled analyzers', async () => {
      const strategy: StrategyConfig = {
        version: 1,
        metadata: {
          name: 'Mixed Strategy',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: ['test'],
        },
        analyzers: [
          { name: 'EMA_ANALYZER_NEW', enabled: true, weight: 0.4, priority: 1 },
          { name: 'RSI_ANALYZER_NEW', enabled: false, weight: 0.0, priority: 2 },
          { name: 'ATR_ANALYZER_NEW', enabled: true, weight: 0.6, priority: 3 },
        ],
      };

      const filePath = join(tempDir, 'mixed.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      const loaded = await loader.loadStrategy('mixed');
      const enabledAnalyzers = loaded.analyzers.filter(a => a.enabled);
      const disabledAnalyzers = loaded.analyzers.filter(a => !a.enabled);

      expect(enabledAnalyzers).toHaveLength(2);
      expect(disabledAnalyzers).toHaveLength(1);
      expect(disabledAnalyzers[0].name).toBe('RSI_ANALYZER_NEW');
    });
  });

  describe('Weight Distribution', () => {
    it('should provide correct weights for StrategyCoordinator', async () => {
      const strategy: StrategyConfig = {
        version: 1,
        metadata: {
          name: 'Weighted Strategy',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: ['test'],
        },
        analyzers: [
          { name: 'LEVEL_ANALYZER_NEW', enabled: true, weight: 0.35, priority: 1 },
          { name: 'EMA_ANALYZER_NEW', enabled: true, weight: 0.30, priority: 2 },
          { name: 'TREND_DETECTOR_ANALYZER_NEW', enabled: true, weight: 0.20, priority: 3 },
          { name: 'RSI_ANALYZER_NEW', enabled: true, weight: 0.15, priority: 4 },
        ],
      };

      const filePath = join(tempDir, 'weighted.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      const loaded = await loader.loadStrategy('weighted');
      const enabledAnalyzers = loaded.analyzers.filter(a => a.enabled);

      // Verify weights sum to 1.0
      const totalWeight = enabledAnalyzers.reduce((sum, a) => sum + a.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 5);

      // Verify individual weights
      const levelAnalyzer = enabledAnalyzers.find(a => a.name === 'LEVEL_ANALYZER_NEW');
      expect(levelAnalyzer?.weight).toBe(0.35);

      const trendAnalyzer = enabledAnalyzers.find(a => a.name === 'TREND_DETECTOR_ANALYZER_NEW');
      expect(trendAnalyzer?.weight).toBe(0.20);
    });

    it('should support partial weight distribution', async () => {
      // Some strategies might not need weights to sum to 1.0
      // (relative weighting will be normalized)
      const strategy: StrategyConfig = {
        version: 1,
        metadata: {
          name: 'Partial Weight Strategy',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: ['test'],
        },
        analyzers: [
          { name: 'EMA_ANALYZER_NEW', enabled: true, weight: 0.5, priority: 1 },
          { name: 'RSI_ANALYZER_NEW', enabled: true, weight: 0.3, priority: 2 },
        ],
      };

      const filePath = join(tempDir, 'partial.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      const loaded = await loader.loadStrategy('partial');
      const enabledAnalyzers = loaded.analyzers.filter(a => a.enabled);

      const totalWeight = enabledAnalyzers.reduce((sum, a) => sum + a.weight, 0);
      expect(totalWeight).toBe(0.8);
    });
  });

  describe('Priority Assignment', () => {
    it('should maintain execution priority order', async () => {
      const strategy: StrategyConfig = {
        version: 1,
        metadata: {
          name: 'Priority Strategy',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: ['test'],
        },
        analyzers: [
          { name: 'LEVEL_ANALYZER_NEW', enabled: true, weight: 0.4, priority: 1 },
          { name: 'EMA_ANALYZER_NEW', enabled: true, weight: 0.3, priority: 2 },
          { name: 'RSI_ANALYZER_NEW', enabled: true, weight: 0.3, priority: 3 },
        ],
      };

      const filePath = join(tempDir, 'priority.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      const loaded = await loader.loadStrategy('priority');
      const analyzers = loaded.analyzers.filter(a => a.enabled);

      // Verify priorities are in order
      expect(analyzers[0].priority).toBeLessThan(analyzers[1].priority);
      expect(analyzers[1].priority).toBeLessThan(analyzers[2].priority);
    });
  });

  describe('Parameter Overrides', () => {
    it('should support indicator parameter overrides', async () => {
      const strategy: StrategyConfig = {
        version: 1,
        metadata: {
          name: 'Indicator Override Strategy',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: ['test'],
        },
        analyzers: [
          { name: 'EMA_ANALYZER_NEW', enabled: true, weight: 0.5, priority: 1 },
          { name: 'RSI_ANALYZER_NEW', enabled: true, weight: 0.5, priority: 2 },
        ],
        indicators: {
          ema: {
            fastPeriod: 7,
            slowPeriod: 25,
            baseConfidence: 0.6,
          },
          rsi: {
            period: 12,
            oversold: 25,
            overbought: 75,
          },
        },
      };

      const filePath = join(tempDir, 'override.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      const loaded = await loader.loadStrategy('override');

      expect(loaded.indicators?.ema?.fastPeriod).toBe(7);
      expect(loaded.indicators?.ema?.slowPeriod).toBe(25);
      expect(loaded.indicators?.rsi?.period).toBe(12);
      expect(loaded.indicators?.rsi?.overbought).toBe(75);
    });

    it('should support filter parameter overrides', async () => {
      const strategy: StrategyConfig = {
        version: 1,
        metadata: {
          name: 'Filter Override Strategy',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: ['test'],
        },
        analyzers: [
          { name: 'EMA_ANALYZER_NEW', enabled: true, weight: 1.0, priority: 1 },
        ],
        filters: {
          blindZone: {
            minSignalsForLong: 2,
            minSignalsForShort: 2,
            longPenalty: 0.8,
            shortPenalty: 0.85,
          },
          btcCorrelation: {
            enabled: true,
            thresholds: {
              weak: 0.2,
              moderate: 0.5,
              strict: 0.8,
            },
          },
        },
      };

      const filePath = join(tempDir, 'filter-override.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      const loaded = await loader.loadStrategy('filter-override');

      expect(loaded.filters?.blindZone?.minSignalsForLong).toBe(2);
      expect(loaded.filters?.blindZone?.longPenalty).toBe(0.8);
      expect(loaded.filters?.btcCorrelation?.thresholds?.weak).toBe(0.2);
    });

    it('should support risk management overrides', async () => {
      const strategy: StrategyConfig = {
        version: 1,
        metadata: {
          name: 'RM Override Strategy',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: ['test'],
        },
        analyzers: [
          { name: 'EMA_ANALYZER_NEW', enabled: true, weight: 1.0, priority: 1 },
        ],
        riskManagement: {
          stopLoss: {
            percent: 1.5,
            atrMultiplier: 1.2,
            minDistancePercent: 1.0,
          },
          takeProfits: [
            { level: 1, percent: 1.0, sizePercent: 50 },
            { level: 2, percent: 2.0, sizePercent: 50 },
          ],
          trailing: {
            enabled: true,
            percent: 0.5,
            activationLevel: 1,
          },
        },
      };

      const filePath = join(tempDir, 'rm-override.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      const loaded = await loader.loadStrategy('rm-override');

      expect(loaded.riskManagement?.stopLoss?.percent).toBe(1.5);
      expect(loaded.riskManagement?.takeProfits).toHaveLength(2);
      expect(loaded.riskManagement?.takeProfits?.[0].sizePercent).toBe(50);
      expect(loaded.riskManagement?.trailing?.percent).toBe(0.5);
    });
  });

  describe('Analyzer Configuration', () => {
    it('should support analyzer-specific parameter overrides', async () => {
      const strategy: StrategyConfig = {
        version: 1,
        metadata: {
          name: 'Analyzer Params Strategy',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: ['test'],
        },
        analyzers: [
          {
            name: 'EMA_ANALYZER_NEW',
            enabled: true,
            weight: 0.5,
            priority: 1,
            minConfidence: 40,
            maxConfidence: 90,
            params: {
              baseConfidence: 0.6,
              strengthMultiplier: 0.25,
            },
          },
          {
            name: 'RSI_ANALYZER_NEW',
            enabled: true,
            weight: 0.5,
            priority: 2,
            minConfidence: 50,
            params: {
              thresholdOversold: 28,
              thresholdOverbought: 72,
            },
          },
        ],
      };

      const filePath = join(tempDir, 'analyzer-params.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      const loaded = await loader.loadStrategy('analyzer-params');

      const emaAnalyzer = loaded.analyzers.find(a => a.name === 'EMA_ANALYZER_NEW');
      expect(emaAnalyzer?.minConfidence).toBe(40);
      expect(emaAnalyzer?.params?.baseConfidence).toBe(0.6);

      const rsiAnalyzer = loaded.analyzers.find(a => a.name === 'RSI_ANALYZER_NEW');
      expect(rsiAnalyzer?.params?.thresholdOversold).toBe(28);
    });
  });

  describe('Metadata and Backtesting Info', () => {
    it('should preserve backtest results metadata', async () => {
      const strategy: StrategyConfig = {
        version: 1,
        metadata: {
          name: 'Backtest Strategy',
          version: '2.0.1',
          description: 'Strategy with backtest results',
          author: 'Test Author',
          createdAt: '2026-01-08T12:00:00Z',
          lastModified: '2026-01-09T14:30:00Z',
          tags: ['tested', 'profitable'],
          backtest: {
            winRate: 0.62,
            profitFactor: 2.15,
            trades: 320,
            period: '2024-01-01 to 2024-06-30',
          },
        },
        analyzers: [
          { name: 'EMA_ANALYZER_NEW', enabled: true, weight: 1.0, priority: 1 },
        ],
      };

      const filePath = join(tempDir, 'backtest.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      const loaded = await loader.loadStrategy('backtest');

      expect(loaded.metadata.name).toBe('Backtest Strategy');
      expect(loaded.metadata.author).toBe('Test Author');
      expect(loaded.metadata.backtest?.winRate).toBe(0.62);
      expect(loaded.metadata.backtest?.profitFactor).toBe(2.15);
      expect(loaded.metadata.backtest?.trades).toBe(320);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle complex multi-analyzer strategy', async () => {
      const strategy: StrategyConfig = {
        version: 1,
        metadata: {
          name: 'Complex Production Strategy',
          version: '1.5.0',
          description: 'Production strategy with multiple analyzers and overrides',
          author: 'Trading Team',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T10:00:00Z',
          tags: ['production', 'multi-analyzer'],
          backtest: {
            winRate: 0.58,
            profitFactor: 1.92,
            trades: 150,
            period: '2024-01-01 to 2024-12-31',
          },
        },
        analyzers: [
          {
            name: 'LEVEL_ANALYZER_NEW',
            enabled: true,
            weight: 0.30,
            priority: 1,
            minConfidence: 50,
            maxConfidence: 95,
          },
          {
            name: 'EMA_ANALYZER_NEW',
            enabled: true,
            weight: 0.25,
            priority: 2,
            minConfidence: 40,
            maxConfidence: 100,
          },
          {
            name: 'TREND_DETECTOR_ANALYZER_NEW',
            enabled: true,
            weight: 0.20,
            priority: 3,
            minConfidence: 45,
            maxConfidence: 100,
          },
          {
            name: 'RSI_ANALYZER_NEW',
            enabled: true,
            weight: 0.15,
            priority: 4,
            minConfidence: 35,
            maxConfidence: 100,
          },
          {
            name: 'LIQUIDITY_SWEEP_ANALYZER_NEW',
            enabled: true,
            weight: 0.10,
            priority: 5,
            minConfidence: 55,
            maxConfidence: 100,
          },
        ],
        indicators: {
          ema: {
            fastPeriod: 9,
            slowPeriod: 21,
            baseConfidence: 0.5,
            strengthMultiplier: 0.2,
          },
          rsi: {
            period: 14,
            oversold: 30,
            overbought: 70,
            neutralZone: { min: 45, max: 55 },
            extreme: { low: 20, high: 80 },
          },
        },
        filters: {
          blindZone: {
            minSignalsForLong: 2,
            minSignalsForShort: 2,
            longPenalty: 0.85,
            shortPenalty: 0.90,
          },
          btcCorrelation: {
            enabled: true,
            thresholds: {
              weak: 0.15,
              moderate: 0.4,
              strict: 0.7,
            },
          },
        },
        riskManagement: {
          stopLoss: {
            percent: 2.0,
            atrMultiplier: 1.5,
            minDistancePercent: 1.5,
          },
          takeProfits: [
            {
              level: 1,
              percent: 1.5,
              sizePercent: 50,
            },
            {
              level: 2,
              percent: 3.0,
              sizePercent: 50,
            },
          ],
          breakeven: {
            enabled: true,
            offsetPercent: 0.4,
          },
        },
        notes:
          'Best used in 4-hour and higher timeframes with clear structural levels. Requires at least 2 supporting signals.',
      };

      const filePath = join(tempDir, 'complex.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      const loaded = await loader.loadStrategy('complex');

      // Verify complete structure
      expect(loaded.analyzers).toHaveLength(5);
      expect(loaded.indicators?.ema?.fastPeriod).toBe(9);
      expect(loaded.filters?.blindZone?.minSignalsForLong).toBe(2);
      expect(loaded.riskManagement?.takeProfits).toHaveLength(2);

      // Verify weights total to 1.0
      const totalWeight = loaded.analyzers.reduce((sum, a) => sum + a.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 5);
    });
  });
});
