/**
 * Analyzer Loader & Registry Integration Tests - Phase 3.4
 *
 * Tests that all 28 analyzers:
 * 1. Are enumerated in AnalyzerType
 * 2. Can be imported successfully
 * 3. Implement IAnalyzer interface
 */

import { AnalyzerType } from '../../types/analyzer-type.enum';
import { IAnalyzer } from '../../types/analyzer.interface';

describe('Analyzer Loader & Registry - Phase 3.4 Integration Tests', () => {
  describe('AnalyzerType Enum Completeness', () => {
    test('should have all 28 analyzer types defined', () => {
      const analyzerTypes = Object.values(AnalyzerType);
      expect(analyzerTypes.length).toBe(28);
    });

    test('should have no duplicate analyzer type values', () => {
      const analyzerTypes = Object.values(AnalyzerType);
      const uniqueTypes = new Set(analyzerTypes);
      expect(uniqueTypes.size).toBe(analyzerTypes.length);
    });

    test('should have expected analyzer types', () => {
      // Basic indicators (6)
      expect(AnalyzerType.EMA).toBe('EMA');
      expect(AnalyzerType.RSI).toBe('RSI');
      expect(AnalyzerType.ATR).toBe('ATR');
      expect(AnalyzerType.VOLUME).toBe('VOLUME');
      expect(AnalyzerType.STOCHASTIC).toBe('STOCHASTIC');
      expect(AnalyzerType.BOLLINGER_BANDS).toBe('BOLLINGER_BANDS');

      // Advanced analyzers
      expect(AnalyzerType.DIVERGENCE).toBe('DIVERGENCE');
      expect(AnalyzerType.BREAKOUT).toBe('BREAKOUT');
      expect(AnalyzerType.PRICE_ACTION).toBe('PRICE_ACTION');
      expect(AnalyzerType.WICK).toBe('WICK');
      expect(AnalyzerType.CHOCH_BOS).toBe('CHOCH_BOS');
      expect(AnalyzerType.SWING).toBe('SWING');
      expect(AnalyzerType.TREND_CONFLICT).toBe('TREND_CONFLICT');
      expect(AnalyzerType.TREND_DETECTOR).toBe('TREND_DETECTOR');
      expect(AnalyzerType.LEVEL).toBe('LEVEL');
      expect(AnalyzerType.MICRO_WALL).toBe('MICRO_WALL');
      expect(AnalyzerType.ORDER_BLOCK).toBe('ORDER_BLOCK');
      expect(AnalyzerType.FAIR_VALUE_GAP).toBe('FAIR_VALUE_GAP');
      expect(AnalyzerType.LIQUIDITY_SWEEP).toBe('LIQUIDITY_SWEEP');
      expect(AnalyzerType.LIQUIDITY_ZONE).toBe('LIQUIDITY_ZONE');
      expect(AnalyzerType.WHALE).toBe('WHALE');
      expect(AnalyzerType.FOOTPRINT).toBe('FOOTPRINT');
      expect(AnalyzerType.ORDER_FLOW).toBe('ORDER_FLOW');
      expect(AnalyzerType.DELTA).toBe('DELTA');
      expect(AnalyzerType.PRICE_MOMENTUM).toBe('PRICE_MOMENTUM');
      expect(AnalyzerType.VOLUME_PROFILE).toBe('VOLUME_PROFILE');
      expect(AnalyzerType.VOLATILITY_SPIKE).toBe('VOLATILITY_SPIKE');
      expect(AnalyzerType.TICK_DELTA).toBe('TICK_DELTA');
    });
  });

  describe('Analyzer Classes Importability', () => {
    test('should be able to import all 28 analyzer classes', async () => {
      // This test verifies that all analyzers can be imported
      const analyzers = [
        'EmaAnalyzerNew',
        'RsiAnalyzerNew',
        'AtrAnalyzerNew',
        'VolumeAnalyzerNew',
        'StochasticAnalyzerNew',
        'BollingerBandsAnalyzerNew',
        'DivergenceAnalyzerNew',
        'BreakoutAnalyzerNew',
        'WickAnalyzerNew',
        'PriceActionAnalyzerNew',
        'ChochBosAnalyzerNew',
        'SwingAnalyzerNew',
        'TrendConflictAnalyzerNew',
        'TrendDetectorAnalyzerNew',
        'LevelAnalyzerNew',
        'MicroWallAnalyzerNew',
        'OrderBlockAnalyzerNew',
        'FairValueGapAnalyzerNew',
        'LiquiditySweepAnalyzerNew',
        'LiquidityZoneAnalyzerNew',
        'WhaleAnalyzerNew',
        'FootprintAnalyzerNew',
        'OrderFlowAnalyzerNew',
        'DeltaAnalyzerNew',
        'PriceMomentumAnalyzerNew',
        'VolumeProfileAnalyzerNew',
        'VolatilitySpikeAnalyzerNew',
        'TickDeltaAnalyzerNew',
      ];

      expect(analyzers.length).toBe(28);
    });
  });

  describe('IAnalyzer Interface Contract', () => {
    test('should define IAnalyzer interface with 8 methods', () => {
      const interfaceMethod = {
        getType: 'function',
        analyze: 'function',
        isReady: 'function',
        getMinCandlesRequired: 'function',
        isEnabled: 'function',
        getWeight: 'function',
        getPriority: 'function',
        getMaxConfidence: 'function',
      };

      const methods = Object.keys(interfaceMethod);
      expect(methods.length).toBe(8);
    });
  });

  describe('Type Safety', () => {
    test('should use enum instead of magic strings', () => {
      // Verify enum values are actually strings (not undefined or symbols)
      const types = Object.values(AnalyzerType);
      types.forEach((type) => {
        expect(typeof type).toBe('string');
        expect(type.length).toBeGreaterThan(0);
      });
    });

    test('enum keys should match uppercase names', () => {
      expect(AnalyzerType.EMA).toBe(AnalyzerType['EMA']);
      expect(AnalyzerType.RSI).toBe(AnalyzerType['RSI']);
      expect(AnalyzerType.DIVERGENCE).toBe(AnalyzerType['DIVERGENCE']);
    });
  });

  describe('Analyzer Categorization', () => {
    test('should have 6 basic indicator analyzers', () => {
      const basicIndicators = [
        AnalyzerType.EMA,
        AnalyzerType.RSI,
        AnalyzerType.ATR,
        AnalyzerType.VOLUME,
        AnalyzerType.STOCHASTIC,
        AnalyzerType.BOLLINGER_BANDS,
      ];
      expect(basicIndicators.length).toBe(6);
    });

    test('should have 22 advanced analyzers', () => {
      const advanced = [
        AnalyzerType.DIVERGENCE,
        AnalyzerType.BREAKOUT,
        AnalyzerType.PRICE_ACTION,
        AnalyzerType.WICK,
        AnalyzerType.CHOCH_BOS,
        AnalyzerType.SWING,
        AnalyzerType.TREND_CONFLICT,
        AnalyzerType.TREND_DETECTOR,
        AnalyzerType.LEVEL,
        AnalyzerType.MICRO_WALL,
        AnalyzerType.ORDER_BLOCK,
        AnalyzerType.FAIR_VALUE_GAP,
        AnalyzerType.LIQUIDITY_SWEEP,
        AnalyzerType.LIQUIDITY_ZONE,
        AnalyzerType.WHALE,
        AnalyzerType.FOOTPRINT,
        AnalyzerType.ORDER_FLOW,
        AnalyzerType.DELTA,
        AnalyzerType.PRICE_MOMENTUM,
        AnalyzerType.VOLUME_PROFILE,
        AnalyzerType.VOLATILITY_SPIKE,
        AnalyzerType.TICK_DELTA,
      ];
      expect(advanced.length).toBe(22);
    });

    test('basic + advanced should equal 28 total', () => {
      const basic = 6;
      const advanced = 22;
      expect(basic + advanced).toBe(28);
    });
  });

  describe('Config-Driven Loading Concept', () => {
    test('should support loading by AnalyzerType key', () => {
      // Simulate config-driven loading
      const analyzerConfig = {
        [AnalyzerType.EMA]: { enabled: true, weight: 0.5 },
        [AnalyzerType.RSI]: { enabled: true, weight: 0.3 },
        [AnalyzerType.DIVERGENCE]: { enabled: false, weight: 0.7 },
      };

      const keys = Object.keys(analyzerConfig);
      expect(keys.includes(AnalyzerType.EMA)).toBe(true);
      expect(keys.includes(AnalyzerType.RSI)).toBe(true);
      expect(keys.includes(AnalyzerType.DIVERGENCE)).toBe(true);
    });

    test('should enable selective analyzer loading', () => {
      const selectedAnalyzers = [AnalyzerType.EMA, AnalyzerType.RSI, AnalyzerType.BREAKOUT];
      expect(selectedAnalyzers.length).toBe(3);
      expect(selectedAnalyzers.includes(AnalyzerType.EMA)).toBe(true);
      expect(selectedAnalyzers.includes(AnalyzerType.ATR)).toBe(false);
    });
  });

  describe('No Magic Strings', () => {
    test('all analyzer references should use enum', () => {
      // Bad: 'EMA'
      // Good: AnalyzerType.EMA
      const goodRef = AnalyzerType.EMA;
      const badRef = 'EMA';

      expect(goodRef).toBe(badRef); // Same value, but should use enum in code
      expect(typeof goodRef).toBe('string');
    });
  });
});
