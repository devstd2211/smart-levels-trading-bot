import { CalculatorFactory } from '../../factories/calculator.factory';
import { IIndicatorCalculator } from '../../types/indicator-calculator.interface';
import { EmaCalculator } from '../../indicators/calculators/ema.calculator';
import { RsiCalculator } from '../../indicators/calculators/rsi.calculator';
import { AtrCalculator } from '../../indicators/calculators/atr.calculator';
import { VolumeCalculator } from '../../indicators/calculators/volume.calculator';
import { StochasticCalculator } from '../../indicators/calculators/stochastic.calculator';
import { BollingerBandsCalculator } from '../../indicators/calculators/bollinger-bands.calculator';

describe('CalculatorFactory', () => {
  // ============================================================================
  // Create All Calculators Tests
  // ============================================================================

  describe('createAllCalculators', () => {
    it('should create all 6 calculator instances', () => {
      const calculators = CalculatorFactory.createAllCalculators();
      expect(calculators).toHaveLength(6);
    });

    it('should create instances implementing IIndicatorCalculator', () => {
      const calculators = CalculatorFactory.createAllCalculators();

      for (const calc of calculators) {
        expect(calc).toHaveProperty('getConfig');
        expect(calc).toHaveProperty('calculate');
        expect(typeof calc.getConfig).toBe('function');
        expect(typeof calc.calculate).toBe('function');
      }
    });

    it('should create EMA calculator', () => {
      const calculators = CalculatorFactory.createAllCalculators();
      const emaCalc = calculators.find((c) => c instanceof EmaCalculator);
      expect(emaCalc).toBeDefined();
      expect(emaCalc?.getConfig().indicators[0].name).toBe('EMA');
    });

    it('should create RSI calculator', () => {
      const calculators = CalculatorFactory.createAllCalculators();
      const rsiCalc = calculators.find((c) => c instanceof RsiCalculator);
      expect(rsiCalc).toBeDefined();
      expect(rsiCalc?.getConfig().indicators[0].name).toBe('RSI');
    });

    it('should create ATR calculator', () => {
      const calculators = CalculatorFactory.createAllCalculators();
      const atrCalc = calculators.find((c) => c instanceof AtrCalculator);
      expect(atrCalc).toBeDefined();
      expect(atrCalc?.getConfig().indicators[0].name).toBe('ATR');
    });

    it('should create Volume calculator', () => {
      const calculators = CalculatorFactory.createAllCalculators();
      const volCalc = calculators.find((c) => c instanceof VolumeCalculator);
      expect(volCalc).toBeDefined();
      expect(volCalc?.getConfig().indicators[0].name).toBe('VOLUME');
    });

    it('should create Stochastic calculator', () => {
      const calculators = CalculatorFactory.createAllCalculators();
      const stochCalc = calculators.find((c) => c instanceof StochasticCalculator);
      expect(stochCalc).toBeDefined();
      expect(stochCalc?.getConfig().indicators[0].name).toBe('STOCHASTIC');
    });

    it('should create Bollinger Bands calculator', () => {
      const calculators = CalculatorFactory.createAllCalculators();
      const bbCalc = calculators.find((c) => c instanceof BollingerBandsCalculator);
      expect(bbCalc).toBeDefined();
      expect(bbCalc?.getConfig().indicators[0].name).toBe('BOLLINGER_BANDS');
    });

    it('should create calculators in correct order', () => {
      const calculators = CalculatorFactory.createAllCalculators();
      const names = calculators.map((c) => c.getConfig().indicators[0].name);

      expect(names).toEqual(['EMA', 'RSI', 'ATR', 'VOLUME', 'STOCHASTIC', 'BOLLINGER_BANDS']);
    });

    it('should return new instances on each call', () => {
      const calc1 = CalculatorFactory.createAllCalculators();
      const calc2 = CalculatorFactory.createAllCalculators();

      expect(calc1).not.toBe(calc2);
      expect(calc1[0]).not.toBe(calc2[0]); // Different instances
    });

    it('should have no null or undefined calculators', () => {
      const calculators = CalculatorFactory.createAllCalculators();

      for (const calc of calculators) {
        expect(calc).toBeDefined();
        expect(calc).not.toBeNull();
      }
    });
  });

  // ============================================================================
  // Get Calculator Tests
  // ============================================================================

  describe('getCalculator', () => {
    it('should return EMA calculator by name', () => {
      const calc = CalculatorFactory.getCalculator('EMA');
      expect(calc).toBeDefined();
      expect(calc?.getConfig().indicators[0].name).toBe('EMA');
    });

    it('should return RSI calculator by name', () => {
      const calc = CalculatorFactory.getCalculator('RSI');
      expect(calc).toBeDefined();
      expect(calc?.getConfig().indicators[0].name).toBe('RSI');
    });

    it('should return ATR calculator by name', () => {
      const calc = CalculatorFactory.getCalculator('ATR');
      expect(calc).toBeDefined();
      expect(calc?.getConfig().indicators[0].name).toBe('ATR');
    });

    it('should return VOLUME calculator by name', () => {
      const calc = CalculatorFactory.getCalculator('VOLUME');
      expect(calc).toBeDefined();
      expect(calc?.getConfig().indicators[0].name).toBe('VOLUME');
    });

    it('should return STOCHASTIC calculator by name', () => {
      const calc = CalculatorFactory.getCalculator('STOCHASTIC');
      expect(calc).toBeDefined();
      expect(calc?.getConfig().indicators[0].name).toBe('STOCHASTIC');
    });

    it('should return BOLLINGER_BANDS calculator by name', () => {
      const calc = CalculatorFactory.getCalculator('BOLLINGER_BANDS');
      expect(calc).toBeDefined();
      expect(calc?.getConfig().indicators[0].name).toBe('BOLLINGER_BANDS');
    });

    it('should return undefined for unknown calculator name', () => {
      const calc = CalculatorFactory.getCalculator('UNKNOWN');
      expect(calc).toBeUndefined();
    });

    it('should return different instances on multiple calls', () => {
      const calc1 = CalculatorFactory.getCalculator('EMA');
      const calc2 = CalculatorFactory.getCalculator('EMA');

      expect(calc1).not.toBe(calc2); // Different instances
    });
  });

  // ============================================================================
  // Configuration Validation Tests
  // ============================================================================

  describe('Configuration validation', () => {
    it('should have valid getConfig on all calculators', () => {
      const calculators = CalculatorFactory.createAllCalculators();

      for (const calc of calculators) {
        const config = calc.getConfig();

        expect(config).toHaveProperty('indicators');
        expect(Array.isArray(config.indicators)).toBe(true);
        expect(config.indicators.length).toBeGreaterThan(0);

        const indicator = config.indicators[0];
        expect(indicator).toHaveProperty('name');
        expect(indicator).toHaveProperty('periods');
        expect(indicator).toHaveProperty('timeframes');
        expect(indicator).toHaveProperty('minCandlesRequired');

        expect(typeof indicator.name).toBe('string');
        expect(Array.isArray(indicator.periods)).toBe(true);
        expect(Array.isArray(indicator.timeframes)).toBe(true);
        expect(typeof indicator.minCandlesRequired).toBe('number');
      }
    });

    it('should have all calculators returning async calculate method', async () => {
      const calculators = CalculatorFactory.createAllCalculators();

      for (const calc of calculators) {
        const result = calc.calculate({
          candlesByTimeframe: new Map(),
          timestamp: Date.now(),
        });

        expect(result).toBeInstanceOf(Promise);
      }
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration with pre-calculation service', () => {
    it('should provide all calculators needed for pre-calculation', () => {
      const calculators = CalculatorFactory.createAllCalculators();

      // Each calculator should have required methods for pre-calculation
      for (const calc of calculators) {
        expect(calc.getConfig).toBeDefined();
        expect(calc.calculate).toBeDefined();

        const config = calc.getConfig();
        expect(config.indicators.length).toBeGreaterThan(0);
        expect(config.indicators[0].periods.length).toBeGreaterThan(0);
      }
    });

    it('should support async calculation for all calculators', async () => {
      const calculators = CalculatorFactory.createAllCalculators();
      const context = {
        candlesByTimeframe: new Map(),
        timestamp: Date.now(),
      };

      for (const calc of calculators) {
        const result = await calc.calculate(context);
        expect(result).toBeInstanceOf(Map);
      }
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge cases', () => {
    it('should handle repeated calls to createAllCalculators', () => {
      for (let i = 0; i < 5; i++) {
        const calculators = CalculatorFactory.createAllCalculators();
        expect(calculators).toHaveLength(6);

        for (const calc of calculators) {
          expect(calc).toBeDefined();
          expect(calc.getConfig).toBeDefined();
        }
      }
    });

    it('should handle mixed calls to createAllCalculators and getCalculator', () => {
      const allCalcs = CalculatorFactory.createAllCalculators();
      const emaCalc = CalculatorFactory.getCalculator('EMA');
      const rsiCalc = CalculatorFactory.getCalculator('RSI');

      expect(allCalcs).toHaveLength(6);
      expect(emaCalc).toBeDefined();
      expect(rsiCalc).toBeDefined();
      expect(allCalcs[0]).not.toBe(emaCalc); // Different instances
    });

    it('should return consistent calculator names across calls', () => {
      const names1 = CalculatorFactory.createAllCalculators().map((c) => c.getConfig().indicators[0].name);
      const names2 = CalculatorFactory.createAllCalculators().map((c) => c.getConfig().indicators[0].name);

      expect(names1).toEqual(names2);
    });
  });
});
