import { IIndicatorCalculator } from '../types/indicator-calculator.interface';
import { EmaCalculator } from '../indicators/calculators/ema.calculator';
import { RsiCalculator } from '../indicators/calculators/rsi.calculator';
import { AtrCalculator } from '../indicators/calculators/atr.calculator';
import { VolumeCalculator } from '../indicators/calculators/volume.calculator';
import { StochasticCalculator } from '../indicators/calculators/stochastic.calculator';
import { BollingerBandsCalculator } from '../indicators/calculators/bollinger-bands.calculator';

/**
 * Calculator Factory - centralizes instantiation of all indicator calculators
 *
 * Ensures all 6 calculators are consistently created and initialized
 * Used by IndicatorPreCalculationService to get all available calculators
 */
export class CalculatorFactory {
  /**
   * Create all 6 indicator calculators
   *
   * @returns Array of initialized calculator instances
   */
  static createAllCalculators(): IIndicatorCalculator[] {
    return [
      new EmaCalculator(),
      new RsiCalculator(),
      new AtrCalculator(),
      new VolumeCalculator(),
      new StochasticCalculator(),
      new BollingerBandsCalculator(),
    ];
  }

  /**
   * Get calculator by name (for debugging/inspection)
   *
   * @param name - Calculator name (e.g., 'EMA', 'RSI', 'ATR', etc)
   * @returns Calculator instance or undefined if not found
   */
  static getCalculator(name: string): IIndicatorCalculator | undefined {
    const calculators = this.createAllCalculators();
    return calculators.find((calc) => {
      const config = calc.getConfig();
      return config.indicators[0]?.name === name;
    });
  }
}
