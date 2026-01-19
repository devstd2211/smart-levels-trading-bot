/**
 * STRATEGY LOADER SERVICE TESTS
 * Tests for loading, parsing, and validating strategy JSON configurations
 */

import { StrategyLoaderService } from '../../services/strategy-loader.service';
import { StrategyValidationError } from '../../types/strategy-config.types';
import { promises as fs } from 'fs';
import { join } from 'path';
import { mkdtemp, rmdir } from 'fs/promises';
import { tmpdir } from 'os';

describe('StrategyLoaderService', () => {
  let tempDir: string;
  let loader: StrategyLoaderService;

  beforeEach(async () => {
    // Create temp directory for test strategy files
    tempDir = await mkdtemp(join(tmpdir(), 'strategy-test-'));
    loader = new StrategyLoaderService(tempDir);
  });

  afterEach(async () => {
    // Cleanup temp directory
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

  describe('loadStrategy', () => {
    it('should load valid strategy file', async () => {
      const strategy = {
        version: 1,
        metadata: {
          name: 'Test Strategy',
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
          },
        ],
      };

      const filePath = join(tempDir, 'test-strategy.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      const loaded = await loader.loadStrategy('test-strategy');

      expect(loaded).toEqual(strategy);
      expect(loaded.metadata.name).toBe('Test Strategy');
      expect(loaded.analyzers).toHaveLength(1);
    });

    it('should throw error for non-existent file', async () => {
      await expect(loader.loadStrategy('non-existent')).rejects.toThrow(
        StrategyValidationError,
      );
    });

    it('should throw error for invalid JSON', async () => {
      const filePath = join(tempDir, 'invalid.strategy.json');
      await fs.writeFile(filePath, 'not valid json {[');

      await expect(loader.loadStrategy('invalid')).rejects.toThrow(
        StrategyValidationError,
      );
    });
  });

  describe('validation - version', () => {
    it('should require version field', async () => {
      const strategy = {
        metadata: {
          name: 'Test',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: [],
        },
        analyzers: [],
      };

      const filePath = join(tempDir, 'no-version.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      await expect(loader.loadStrategy('no-version')).rejects.toThrow(
        'version must be a number',
      );
    });

    it('should reject non-numeric version', async () => {
      const strategy = {
        version: 'one',
        metadata: {
          name: 'Test',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: [],
        },
        analyzers: [],
      };

      const filePath = join(tempDir, 'string-version.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      await expect(loader.loadStrategy('string-version')).rejects.toThrow(
        'version must be a number',
      );
    });
  });

  describe('validation - metadata', () => {
    it('should require metadata', async () => {
      const strategy = {
        version: 1,
        analyzers: [],
      };

      const filePath = join(tempDir, 'no-metadata.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      await expect(loader.loadStrategy('no-metadata')).rejects.toThrow(
        'metadata is required',
      );
    });

    it('should require metadata.name', async () => {
      const strategy = {
        version: 1,
        metadata: {
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: [],
        },
        analyzers: [
          {
            name: 'EMA_ANALYZER_NEW',
            enabled: true,
            weight: 0.5,
            priority: 1,
          },
        ],
      };

      const filePath = join(tempDir, 'no-name.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      await expect(loader.loadStrategy('no-name')).rejects.toThrow(
        'metadata.name is required',
      );
    });

    it('should require metadata.tags as array', async () => {
      const strategy = {
        version: 1,
        metadata: {
          name: 'Test',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: 'test',
        },
        analyzers: [
          {
            name: 'EMA_ANALYZER_NEW',
            enabled: true,
            weight: 0.5,
            priority: 1,
          },
        ],
      };

      const filePath = join(tempDir, 'bad-tags.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      await expect(loader.loadStrategy('bad-tags')).rejects.toThrow(
        'metadata.tags must be an array',
      );
    });

    it('should validate backtest results if present', async () => {
      const strategy = {
        version: 1,
        metadata: {
          name: 'Test',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: [],
          backtest: {
            winRate: 1.5, // Invalid: > 1
            profitFactor: 2.0,
            trades: 100,
            period: 'test',
          },
        },
        analyzers: [
          {
            name: 'EMA_ANALYZER_NEW',
            enabled: true,
            weight: 0.5,
            priority: 1,
          },
        ],
      };

      const filePath = join(tempDir, 'bad-backtest.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      await expect(loader.loadStrategy('bad-backtest')).rejects.toThrow(
        'metadata.backtest.winRate must be a number between 0 and 1',
      );
    });
  });

  describe('validation - analyzers', () => {
    it('should require analyzers array', async () => {
      const strategy = {
        version: 1,
        metadata: {
          name: 'Test',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: [],
        },
        analyzers: undefined,
      };

      const filePath = join(tempDir, 'no-analyzers.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      await expect(loader.loadStrategy('no-analyzers')).rejects.toThrow(
        'analyzers must be a non-empty array',
      );
    });

    it('should reject empty analyzers array', async () => {
      const strategy = {
        version: 1,
        metadata: {
          name: 'Test',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: [],
        },
        analyzers: [],
      };

      const filePath = join(tempDir, 'empty-analyzers.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      await expect(loader.loadStrategy('empty-analyzers')).rejects.toThrow(
        'analyzers must be a non-empty array',
      );
    });

    it('should require analyzer.name', async () => {
      const strategy = {
        version: 1,
        metadata: {
          name: 'Test',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: [],
        },
        analyzers: [
          {
            enabled: true,
            weight: 0.5,
            priority: 1,
          },
        ],
      };

      const filePath = join(tempDir, 'no-analyzer-name.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      await expect(loader.loadStrategy('no-analyzer-name')).rejects.toThrow(
        'analyzers[0].name must be a string',
      );
    });

    it('should reject unknown analyzer', async () => {
      const strategy = {
        version: 1,
        metadata: {
          name: 'Test',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: [],
        },
        analyzers: [
          {
            name: 'UNKNOWN_ANALYZER',
            enabled: true,
            weight: 0.5,
            priority: 1,
          },
        ],
      };

      const filePath = join(tempDir, 'unknown-analyzer.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      await expect(loader.loadStrategy('unknown-analyzer')).rejects.toThrow(
        'Unknown analyzer: UNKNOWN_ANALYZER',
      );
    });

    it('should require analyzer.weight between 0 and 1', async () => {
      const strategy = {
        version: 1,
        metadata: {
          name: 'Test',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: [],
        },
        analyzers: [
          {
            name: 'EMA_ANALYZER_NEW',
            enabled: true,
            weight: 1.5,
            priority: 1,
          },
        ],
      };

      const filePath = join(tempDir, 'bad-weight.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      await expect(loader.loadStrategy('bad-weight')).rejects.toThrow(
        'analyzers[0].weight must be a number between 0 and 1',
      );
    });

    it('should require analyzer.priority between 1 and 10', async () => {
      const strategy = {
        version: 1,
        metadata: {
          name: 'Test',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: [],
        },
        analyzers: [
          {
            name: 'EMA_ANALYZER_NEW',
            enabled: true,
            weight: 0.5,
            priority: 11,
          },
        ],
      };

      const filePath = join(tempDir, 'bad-priority.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      await expect(loader.loadStrategy('bad-priority')).rejects.toThrow(
        'analyzers[0].priority must be a number between 1 and 10',
      );
    });

    it('should detect duplicate analyzers', async () => {
      const strategy = {
        version: 1,
        metadata: {
          name: 'Test',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: [],
        },
        analyzers: [
          {
            name: 'EMA_ANALYZER_NEW',
            enabled: true,
            weight: 0.5,
            priority: 1,
          },
          {
            name: 'EMA_ANALYZER_NEW',
            enabled: true,
            weight: 0.5,
            priority: 2,
          },
        ],
      };

      const filePath = join(tempDir, 'duplicate-analyzer.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      await expect(loader.loadStrategy('duplicate-analyzer')).rejects.toThrow(
        'Duplicate analyzer: EMA_ANALYZER_NEW',
      );
    });

    it('should validate confidence thresholds', async () => {
      const strategy = {
        version: 1,
        metadata: {
          name: 'Test',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: [],
        },
        analyzers: [
          {
            name: 'EMA_ANALYZER_NEW',
            enabled: true,
            weight: 0.5,
            priority: 1,
            minConfidence: 150, // Invalid
          },
        ],
      };

      const filePath = join(tempDir, 'bad-confidence.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      await expect(loader.loadStrategy('bad-confidence')).rejects.toThrow(
        'analyzers[0].minConfidence must be a number between 0 and 100',
      );
    });
  });

  describe('validation - overrides', () => {
    it('should reject unknown indicator override', async () => {
      const strategy = {
        version: 1,
        metadata: {
          name: 'Test',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: [],
        },
        analyzers: [
          {
            name: 'EMA_ANALYZER_NEW',
            enabled: true,
            weight: 0.5,
            priority: 1,
          },
        ],
        indicators: {
          unknownIndicator: {},
        },
      };

      const filePath = join(tempDir, 'bad-indicator.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      await expect(loader.loadStrategy('bad-indicator')).rejects.toThrow(
        'Unknown indicator override: unknownIndicator',
      );
    });

    it('should reject unknown filter override', async () => {
      const strategy = {
        version: 1,
        metadata: {
          name: 'Test',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: [],
        },
        analyzers: [
          {
            name: 'EMA_ANALYZER_NEW',
            enabled: true,
            weight: 0.5,
            priority: 1,
          },
        ],
        filters: {
          unknownFilter: {},
        },
      };

      const filePath = join(tempDir, 'bad-filter.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      await expect(loader.loadStrategy('bad-filter')).rejects.toThrow(
        'Unknown filter override: unknownFilter',
      );
    });
  });

  describe('getAvailableAnalyzers', () => {
    it('should return sorted list of available analyzers', () => {
      const analyzers = loader.getAvailableAnalyzers();

      expect(analyzers).toContain('EMA_ANALYZER_NEW');
      expect(analyzers).toContain('RSI_ANALYZER_NEW');
      expect(analyzers).toContain('WHALE_ANALYZER_NEW');
      expect(analyzers.length).toBeGreaterThan(20);

      // Should be sorted
      const sorted = [...analyzers].sort();
      expect(analyzers).toEqual(sorted);
    });
  });

  describe('loadAllStrategies', () => {
    it('should load all valid strategies from directory', async () => {
      const strategy1 = {
        version: 1,
        metadata: {
          name: 'Strategy 1',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: [],
        },
        analyzers: [
          {
            name: 'EMA_ANALYZER_NEW',
            enabled: true,
            weight: 0.5,
            priority: 1,
          },
        ],
      };

      const strategy2 = {
        version: 1,
        metadata: {
          name: 'Strategy 2',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: [],
        },
        analyzers: [
          {
            name: 'RSI_ANALYZER_NEW',
            enabled: true,
            weight: 0.5,
            priority: 1,
          },
        ],
      };

      await fs.writeFile(
        join(tempDir, 'strat1.strategy.json'),
        JSON.stringify(strategy1),
      );
      await fs.writeFile(
        join(tempDir, 'strat2.strategy.json'),
        JSON.stringify(strategy2),
      );

      const loaded = await loader.loadAllStrategies();

      expect(loaded.size).toBe(2);
      expect(loaded.has('strat1')).toBe(true);
      expect(loaded.has('strat2')).toBe(true);
      expect(loaded.get('strat1')?.metadata.name).toBe('Strategy 1');
      expect(loaded.get('strat2')?.metadata.name).toBe('Strategy 2');
    });

    it('should handle empty directory', async () => {
      const loaded = await loader.loadAllStrategies();
      expect(loaded.size).toBe(0);
    });

    it('should skip invalid strategy files', async () => {
      const validStrategy = {
        version: 1,
        metadata: {
          name: 'Valid',
          version: '1.0.0',
          description: 'Test',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: [],
        },
        analyzers: [
          {
            name: 'EMA_ANALYZER_NEW',
            enabled: true,
            weight: 0.5,
            priority: 1,
          },
        ],
      };

      const invalidStrategy = {
        version: 1,
        // Missing required fields
      };

      await fs.writeFile(
        join(tempDir, 'valid.strategy.json'),
        JSON.stringify(validStrategy),
      );
      await fs.writeFile(
        join(tempDir, 'invalid.strategy.json'),
        JSON.stringify(invalidStrategy),
      );

      const loaded = await loader.loadAllStrategies();

      // Should load only valid strategy
      expect(loaded.size).toBe(1);
      expect(loaded.has('valid')).toBe(true);
      expect(loaded.has('invalid')).toBe(false);
    });
  });

  describe('integration tests', () => {
    it('should load and validate complete level-trading strategy', async () => {
      const strategy = {
        version: 1,
        metadata: {
          name: 'Level Trading Strategy',
          version: '1.0.0',
          description: 'Trade support/resistance levels',
          createdAt: '2026-01-09T00:00:00Z',
          lastModified: '2026-01-09T00:00:00Z',
          tags: ['level-trading'],
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
            weight: 0.35,
            priority: 1,
            minConfidence: 50,
          },
          {
            name: 'EMA_ANALYZER_NEW',
            enabled: true,
            weight: 0.30,
            priority: 2,
            minConfidence: 40,
          },
          {
            name: 'TREND_DETECTOR_ANALYZER_NEW',
            enabled: true,
            weight: 0.20,
            priority: 3,
            minConfidence: 45,
          },
          {
            name: 'RSI_ANALYZER_NEW',
            enabled: true,
            weight: 0.15,
            priority: 4,
            minConfidence: 35,
          },
        ],
        indicators: {
          ema: {
            fastPeriod: 9,
            slowPeriod: 21,
          },
        },
        filters: {
          blindZone: {
            minSignalsForLong: 2,
            minSignalsForShort: 2,
          },
        },
      };

      const filePath = join(tempDir, 'level-trading.strategy.json');
      await fs.writeFile(filePath, JSON.stringify(strategy));

      const loaded = await loader.loadStrategy('level-trading');

      expect(loaded.metadata.name).toBe('Level Trading Strategy');
      expect(loaded.analyzers).toHaveLength(4);
      expect(loaded.analyzers[0].weight).toBe(0.35);
      expect(loaded.indicators?.ema?.fastPeriod).toBe(9);
      expect(loaded.filters?.blindZone?.minSignalsForLong).toBe(2);
    });
  });
});
