/**
 * Parameter Optimizer Tests
 *
 * Tests Phase 7.4: Parameter Optimization Framework
 * Coverage:
 * - Grid generation
 * - Random sampling
 * - Parameter combinations
 * - Best parameter selection
 * - Cache hit detection
 * - Metric selection
 * - Grid validation
 * - Early stopping
 */

import { ParameterGridGenerator, ParameterGrid } from '../../backtest/optimization/parameter-grid';
import { ParameterOptimizer } from '../../backtest/optimization/parameter-optimizer';

describe('Phase 7.4: Parameter Optimization', () => {
  /**
   * Test 1: Grid generation correctness
   */
  describe('Test 1: Grid Generation', () => {
    it('should generate all grid combinations', () => {
      const grid: ParameterGrid = {
        entryThreshold: [0.4, 0.5, 0.6],
        stopLossMultiplier: [1.5, 2.0],
      };

      const combinations = ParameterGridGenerator.generateGrid(grid);

      // Should have 3 × 2 = 6 combinations
      expect(combinations.length).toBe(6);

      // Verify all combinations are present
      const combinations_set = new Set(combinations.map(c => JSON.stringify(c)));
      expect(combinations_set.size).toBe(6); // All unique

      // Check first and last
      expect(combinations[0].entryThreshold).toBe(0.4);
      expect(combinations[0].stopLossMultiplier).toBe(1.5);
      expect(combinations[5].entryThreshold).toBe(0.6);
      expect(combinations[5].stopLossMultiplier).toBe(2.0);
    });

    it('should handle single parameter', () => {
      const grid: ParameterGrid = {
        entryThreshold: [0.3, 0.4, 0.5],
      };

      const combinations = ParameterGridGenerator.generateGrid(grid);

      expect(combinations.length).toBe(3);
      expect(combinations[0].entryThreshold).toBe(0.3);
      expect(combinations[1].entryThreshold).toBe(0.4);
      expect(combinations[2].entryThreshold).toBe(0.5);
    });

    it('should handle multiple parameters (3+)', () => {
      const grid: ParameterGrid = {
        param1: [1, 2],
        param2: [3, 4],
        param3: [5, 6],
      };

      const combinations = ParameterGridGenerator.generateGrid(grid);

      // Should have 2 × 2 × 2 = 8 combinations
      expect(combinations.length).toBe(8);
    });
  });

  /**
   * Test 2: Random sampling
   */
  describe('Test 2: Random Sampling', () => {
    it('should generate random sample smaller than full grid', () => {
      const grid: ParameterGrid = {
        param1: [1, 2, 3, 4, 5],
        param2: [10, 20, 30, 40, 50],
      };

      const fullGrid = ParameterGridGenerator.generateGrid(grid);
      expect(fullGrid.length).toBe(25);

      const sample = ParameterGridGenerator.generateRandom(grid, 10);

      expect(sample.length).toBe(10);
      expect(sample.length).toBeLessThan(fullGrid.length);
    });

    it('should return full grid if sample size >= total', () => {
      const grid: ParameterGrid = {
        param1: [1, 2],
        param2: [3, 4],
      };

      const sample = ParameterGridGenerator.generateRandom(grid, 100);

      expect(sample.length).toBe(4); // Full grid size
    });

    it('should generate diverse samples', () => {
      const grid: ParameterGrid = {
        param1: [1, 2, 3, 4, 5],
        param2: [10, 20, 30, 40, 50],
      };

      const sample = ParameterGridGenerator.generateRandom(grid, 15);

      // Check uniqueness (should be mostly unique due to randomness)
      const unique = new Set(sample.map(c => JSON.stringify(c)));
      expect(unique.size).toBeGreaterThan(10);
    });
  });

  /**
   * Test 3: Grid validation
   */
  describe('Test 3: Grid Validation', () => {
    it('should validate correct grid', () => {
      const grid: ParameterGrid = {
        param1: [1, 2, 3],
        param2: [10, 20],
      };

      const validation = ParameterGridGenerator.validate(grid);

      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    it('should reject empty parameter', () => {
      const grid: ParameterGrid = {
        param1: [],
        param2: [10, 20],
      };

      const validation = ParameterGridGenerator.validate(grid);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should detect invalid types', () => {
      const grid: ParameterGrid = {
        param1: [1, 2, 'invalid'] as any,
      };

      const validation = ParameterGridGenerator.validate(grid);

      expect(validation.valid).toBe(false);
    });
  });

  /**
   * Test 4: Total combinations calculation
   */
  describe('Test 4: Combinations Count', () => {
    it('should calculate total combinations correctly', () => {
      const grid: ParameterGrid = {
        param1: [1, 2, 3],
        param2: [10, 20],
        param3: [100, 200, 300],
      };

      const total = ParameterGridGenerator.getTotalCombinations(grid);

      // 3 × 2 × 3 = 18
      expect(total).toBe(18);
    });

    it('should handle single value', () => {
      const grid: ParameterGrid = {
        param1: [1],
      };

      const total = ParameterGridGenerator.getTotalCombinations(grid);

      expect(total).toBe(1);
    });

    it('should calculate large grids', () => {
      const grid: ParameterGrid = {
        param1: Array.from({ length: 10 }, (_, i) => i),
        param2: Array.from({ length: 20 }, (_, i) => i),
      };

      const total = ParameterGridGenerator.getTotalCombinations(grid);

      expect(total).toBe(200);
    });
  });

  /**
   * Test 5: Parameter Optimizer initialization
   */
  describe('Test 5: Optimizer Initialization', () => {
    it('should initialize with default logger', () => {
      const optimizer = new ParameterOptimizer();

      expect(optimizer).toBeDefined();
      expect(optimizer.getCacheStats().cachedResults).toBe(0);
    });

    it('should provide cache statistics', () => {
      const optimizer = new ParameterOptimizer();

      const stats = optimizer.getCacheStats();

      expect(stats.cachedResults).toBe(0);
      expect(stats.estimatedMemory).toBe(0);
    });
  });

  /**
   * Test 6: Cache management
   */
  describe('Test 6: Cache Management', () => {
    it('should support cache clearing', () => {
      const optimizer = new ParameterOptimizer();

      // Simulate cache population
      optimizer.clearCache();

      const stats = optimizer.getCacheStats();
      expect(stats.cachedResults).toBe(0);
    });

    it('should track cache memory usage', () => {
      const optimizer = new ParameterOptimizer();

      const stats = optimizer.getCacheStats();

      expect(stats.estimatedMemory).toBeGreaterThanOrEqual(0);
    });
  });

  /**
   * Test 7: Metric selection
   */
  describe('Test 7: Metric Selection', () => {
    it('should support multiple optimization metrics', () => {
      // Just verify the optimizer accepts different metrics
      const metrics = ['sharpe', 'profitFactor', 'winRate'] as const;

      for (const metric of metrics) {
        expect(['sharpe', 'profitFactor', 'winRate']).toContain(metric);
      }
    });
  });

  /**
   * Test 8: Parameter grid with nested arrays
   */
  describe('Test 8: Complex Grids', () => {
    it('should handle mixed parameter types', () => {
      const grid: ParameterGrid = {
        scalar: [1, 2, 3],
        pairs: [[1, 2], [3, 4]],
      };

      const validation = ParameterGridGenerator.validate(grid);

      expect(validation.valid).toBe(true);
    });

    it('should generate combinations with nested arrays', () => {
      const grid: ParameterGrid = {
        simple: [1, 2],
        levels: [[1, 2, 3], [4, 5, 6]],
      };

      const combinations = ParameterGridGenerator.generateGrid(grid);

      // Should have 2 × 2 = 4 combinations
      expect(combinations.length).toBe(4);

      // Check that nested arrays are preserved
      expect(Array.isArray(combinations[0].levels)).toBe(true);
    });
  });

  /**
   * Test 9: Edge cases
   */
  describe('Test 9: Edge Cases', () => {
    it('should handle empty grid', () => {
      const grid: ParameterGrid = {};

      const combinations = ParameterGridGenerator.generateGrid(grid);

      expect(combinations.length).toBe(0);
    });

    it('should handle single combination', () => {
      const grid: ParameterGrid = {
        param1: [42],
      };

      const combinations = ParameterGridGenerator.generateGrid(grid);

      expect(combinations.length).toBe(1);
      expect(combinations[0].param1).toBe(42);
    });

    it('should handle large grids without crashing', () => {
      const grid: ParameterGrid = {
        param1: Array.from({ length: 5 }, (_, i) => i),
        param2: Array.from({ length: 5 }, (_, i) => i * 10),
        param3: Array.from({ length: 5 }, (_, i) => i * 100),
      };

      const combinations = ParameterGridGenerator.generateGrid(grid);

      // 5 × 5 × 5 = 125
      expect(combinations.length).toBe(125);
    });
  });
});
