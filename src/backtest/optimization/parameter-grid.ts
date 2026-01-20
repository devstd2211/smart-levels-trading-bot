/**
 * Parameter Grid Generator
 *
 * Generates parameter combinations for backtest optimization
 * Supports multiple strategies: grid search, random, Bayesian
 */

export interface ParameterGrid {
  [key: string]: number[] | number[][];
}

export interface ParameterCombination {
  [key: string]: number | number[];
}

/**
 * Generates all combinations of parameters
 */
export class ParameterGridGenerator {
  /**
   * Generate grid search combinations (all permutations)
   */
  static generateGrid(grid: ParameterGrid): ParameterCombination[] {
    const keys = Object.keys(grid);
    if (keys.length === 0) {
      return [];
    }

    const combinations: ParameterCombination[] = [];
    const indices = new Array(keys.length).fill(0);

    while (true) {
      const combination: ParameterCombination = {};

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const values = grid[key];
        combination[key] = values[indices[i]];
      }

      combinations.push(combination);

      // Increment indices
      let carry = 1;
      for (let i = keys.length - 1; i >= 0 && carry; i--) {
        indices[i] += carry;
        if (indices[i] >= grid[keys[i]].length) {
          indices[i] = 0;
        } else {
          carry = 0;
        }
      }

      if (carry) break;
    }

    return combinations;
  }

  /**
   * Generate random sample of combinations
   */
  static generateRandom(grid: ParameterGrid, count: number): ParameterCombination[] {
    const allCombinations = this.generateGrid(grid);

    if (allCombinations.length <= count) {
      return allCombinations;
    }

    // Random sample
    const shuffled = allCombinations.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  /**
   * Get total number of combinations
   */
  static getTotalCombinations(grid: ParameterGrid): number {
    let total = 1;
    for (const key of Object.keys(grid)) {
      total *= grid[key].length;
    }
    return total;
  }

  /**
   * Validate grid configuration
   */
  static validate(grid: ParameterGrid): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const key of Object.keys(grid)) {
      const values = grid[key];

      if (!Array.isArray(values) || values.length === 0) {
        errors.push(`Parameter "${key}": must have at least one value`);
      }

      for (const value of values) {
        if (typeof value !== 'number' && !Array.isArray(value)) {
          errors.push(`Parameter "${key}": all values must be numbers or arrays`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
