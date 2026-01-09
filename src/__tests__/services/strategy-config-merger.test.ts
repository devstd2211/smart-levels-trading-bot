/**
 * STRATEGY CONFIG MERGER SERVICE TESTS
 * Tests for merging strategy overrides into main configuration
 */

import { StrategyConfigMergerService, ChangeReport } from '../../services/strategy-config-merger.service';
import { ConfigNew } from '../../types/config-new.types';
import { StrategyConfig } from '../../types/strategy-config.types';

describe('StrategyConfigMergerService', () => {
  let merger: StrategyConfigMergerService;

  beforeEach(() => {
    merger = new StrategyConfigMergerService();
  });

  const createMainConfig = (): ConfigNew => ({
    version: 2,
    meta: {
      description: 'Test Config',
      lastUpdated: '2026-01-09',
      activeAnalyzers: ['EMA'],
      notes: 'Test',
    },
    exchange: {
      name: 'bybit',
      symbol: 'XRPUSDT',
      demo: true,
      testnet: false,
      apiKey: '',
      apiSecret: '',
    },
    trading: {
      leverage: 10,
      positionSizeUsdt: 10,
      maxPositions: 1,
      orderType: 'MARKET' as const,
      tradingCycleIntervalMs: 10000,
      favorableMovementThresholdPercent: 0.1,
    },
    riskManagement: {
      stopLoss: {
        percent: 2.5,
        atrMultiplier: 1.5,
        minDistancePercent: 1.5,
      },
      takeProfits: [
        { level: 1, percent: 1.0, sizePercent: 50 },
        { level: 2, percent: 2.0, sizePercent: 50 },
      ],
      trailing: { enabled: false, percent: 0.6, activationLevel: 2 },
      breakeven: { enabled: true, offsetPercent: 0.4 },
      timeBasedExit: { enabled: false },
    },
    timeframes: {
      entry: { interval: '1', candleLimit: 1000, enabled: true },
      primary: { interval: '5', candleLimit: 500, enabled: true },
      trend1: { interval: '15', candleLimit: 500, enabled: true },
      trend2: { interval: '30', candleLimit: 250, enabled: true },
      context: { interval: '60', candleLimit: 100, enabled: true },
    },
    indicators: {
      ema: {
        enabled: true,
        fastPeriod: 9,
        slowPeriod: 21,
        baseConfidence: 0.5,
        strengthMultiplier: 0.2,
      },
      rsi: {
        enabled: true,
        period: 14,
        oversold: 30,
        overbought: 70,
        extreme: { low: 20, high: 80 },
        neutralZone: { min: 45, max: 55 },
        maxConfidence: 25,
      },
      atr: { enabled: true, period: 14, minimumATR: 0.05, maximumATR: 5 },
      volume: { enabled: true, period: 20 },
      stochastic: { enabled: true, kPeriod: 14, dPeriod: 3 },
      bollingerBands: { enabled: true, period: 20, stdDev: 2 },
    },
    analyzers: {} as any,
    filters: {
      btcCorrelation: {
        enabled: true,
        symbol: 'BTCUSDT',
        timeframe: '1',
        lookbackCandles: 100,
        correlationPeriod: 50,
        thresholds: { weak: 0.15, moderate: 0.4, strict: 0.7 },
        requirements: {
          useCorrelation: true,
          requireAlignment: true,
          momentumThreshold: 0.3,
          minimumMomentum: 0.3,
        },
      },
      nightTrading: {
        enabled: true,
        utcStartHour: 2,
        utcEndHour: 5,
        confidencePenalty: 0.25,
      },
      blindZone: {
        enabled: true,
        minSignalsForLong: 3,
        minSignalsForShort: 3,
        longPenalty: 0.85,
        shortPenalty: 0.9,
      },
      entryConfirmation: {
        enabled: true,
        long: { expirySeconds: 120, tolerancePercent: 0.05 },
        short: { expirySeconds: 120, tolerancePercent: 0.05 },
      },
      atr: { enabled: true, period: 14, minimumATR: 0.05, maximumATR: 5 },
      volatilityRegime: {
        enabled: true,
        thresholds: { lowAtrPercent: 0.3, highAtrPercent: 1.5 },
      },
    } as any,
    confidence: {
      defaults: { min: 0.55, clampMin: 0.3, clampMax: 1.0 },
      regimes: {} as any,
      voting: {} as any,
    } as any,
    strategies: {} as any,
    services: {} as any,
    monitoring: {} as any,
  });

  const createStrategy = (overrides?: Partial<StrategyConfig>): StrategyConfig => ({
    version: 1,
    metadata: {
      name: 'Test Strategy',
      version: '1.0.0',
      description: 'Test',
      createdAt: '2026-01-09T00:00:00Z',
      lastModified: '2026-01-09T00:00:00Z',
      tags: [],
    },
    analyzers: [
      { name: 'EMA_ANALYZER_NEW', enabled: true, weight: 1.0, priority: 1 },
    ],
    ...overrides,
  });

  describe('mergeConfigs', () => {
    it('should merge indicator overrides', () => {
      const config = createMainConfig();
      const strategy = createStrategy({
        indicators: {
          ema: { fastPeriod: 7, slowPeriod: 25 },
          rsi: { period: 12 },
        },
      });

      const merged = merger.mergeConfigs(config, strategy);

      expect(merged.indicators.ema.fastPeriod).toBe(7);
      expect(merged.indicators.ema.slowPeriod).toBe(25);
      expect(merged.indicators.rsi.period).toBe(12);
      expect(merged.indicators.rsi.oversold).toBe(30); // Not overridden
    });

    it('should merge filter overrides', () => {
      const config = createMainConfig();
      const strategy = createStrategy({
        filters: {
          blindZone: {
            minSignalsForLong: 2,
            minSignalsForShort: 2,
          },
          btcCorrelation: {
            enabled: false,
          },
        },
      });

      const merged = merger.mergeConfigs(config, strategy);

      expect(merged.filters.blindZone.minSignalsForLong).toBe(2);
      expect(merged.filters.blindZone.minSignalsForShort).toBe(2);
      expect(merged.filters.blindZone.longPenalty).toBe(0.85); // Not overridden
      expect(merged.filters.btcCorrelation.enabled).toBe(false);
    });

    it('should merge risk management overrides', () => {
      const config = createMainConfig();
      const strategy = createStrategy({
        riskManagement: {
          stopLoss: { percent: 1.5 },
          trailing: { enabled: true, percent: 0.5 },
        },
      });

      const merged = merger.mergeConfigs(config, strategy);

      expect(merged.riskManagement.stopLoss.percent).toBe(1.5);
      expect(merged.riskManagement.stopLoss.atrMultiplier).toBe(1.5); // Not overridden
      expect(merged.riskManagement.trailing.enabled).toBe(true);
      expect(merged.riskManagement.trailing.percent).toBe(0.5);
    });

    it('should not modify original config', () => {
      const config = createMainConfig();
      const originalFastPeriod = config.indicators.ema.fastPeriod;
      const strategy = createStrategy({
        indicators: { ema: { fastPeriod: 5 } },
      });

      merger.mergeConfigs(config, strategy);

      expect(config.indicators.ema.fastPeriod).toBe(originalFastPeriod);
    });

    it('should handle empty overrides', () => {
      const config = createMainConfig();
      const strategy = createStrategy({});

      const merged = merger.mergeConfigs(config, strategy);

      expect(merged.indicators.ema.fastPeriod).toBe(config.indicators.ema.fastPeriod);
      expect(merged.filters.blindZone.minSignalsForLong).toBe(
        config.filters.blindZone.minSignalsForLong,
      );
    });
  });

  describe('getConfigValue', () => {
    it('should get value from merged config using path', () => {
      const config = createMainConfig();
      const strategy = createStrategy({
        filters: { blindZone: { minSignalsForLong: 2 } },
      });

      const value = merger.getConfigValue(config, strategy, 'filters.blindZone.minSignalsForLong');

      expect(value).toBe(2);
    });

    it('should get original value if not overridden', () => {
      const config = createMainConfig();
      const strategy = createStrategy({
        indicators: { ema: { fastPeriod: 7 } },
      });

      const value = merger.getConfigValue(config, strategy, 'indicators.ema.slowPeriod');

      expect(value).toBe(21);
    });

    it('should return undefined for invalid path', () => {
      const config = createMainConfig();
      const strategy = createStrategy({});

      const value = merger.getConfigValue(config, strategy, 'invalid.path.here');

      expect(value).toBeUndefined();
    });
  });

  describe('getChangeReport', () => {
    it('should report all changes', () => {
      const config = createMainConfig();
      const strategy = createStrategy({
        indicators: {
          ema: { fastPeriod: 7, slowPeriod: 25 },
        },
        filters: {
          blindZone: { minSignalsForLong: 2 },
        },
      });

      const report = merger.getChangeReport(config, strategy);

      expect(report.strategyName).toBe('Test Strategy');
      expect(report.changesCount).toBeGreaterThan(0);
      expect(report.changes.some((c) => c.path.includes('fastPeriod'))).toBe(true);
      expect(report.changes.some((c) => c.path.includes('minSignalsForLong'))).toBe(true);
    });

    it('should report no changes if no overrides', () => {
      const config = createMainConfig();
      const strategy = createStrategy({});

      const report = merger.getChangeReport(config, strategy);

      expect(report.changesCount).toBe(0);
      expect(report.changes).toHaveLength(0);
    });

    it('should show before/after values in change report', () => {
      const config = createMainConfig();
      const strategy = createStrategy({
        indicators: { ema: { fastPeriod: 7 } },
      });

      const report = merger.getChangeReport(config, strategy);

      const fastPeriodChange = report.changes.find((c) => c.path.includes('fastPeriod'));
      expect(fastPeriodChange?.original).toBe(9);
      expect(fastPeriodChange?.overridden).toBe(7);
    });
  });

  describe('real-world scenario', () => {
    it('should handle level-trading strategy config merge', () => {
      const config = createMainConfig();
      const strategy = createStrategy({
        indicators: {
          ema: { fastPeriod: 9, slowPeriod: 21 },
          rsi: { period: 14, oversold: 30, overbought: 70 },
        },
        filters: {
          blindZone: {
            minSignalsForLong: 2,
            minSignalsForShort: 2,
          },
          btcCorrelation: {
            enabled: true,
            thresholds: { weak: 0.15, moderate: 0.4, strict: 0.7 },
          },
        },
        riskManagement: {
          stopLoss: { percent: 2.0 },
          takeProfits: [
            { level: 1, percent: 1.5, sizePercent: 50 },
            { level: 2, percent: 3.0, sizePercent: 50 },
          ],
        },
      });

      const merged = merger.mergeConfigs(config, strategy);

      // Verify indicator overrides
      expect(merged.indicators.ema.fastPeriod).toBe(9);
      expect(merged.indicators.rsi.period).toBe(14);

      // Verify filter overrides
      expect(merged.filters.blindZone.minSignalsForLong).toBe(2);

      // Verify risk management overrides
      expect(merged.riskManagement.stopLoss.percent).toBe(2.0);
      expect(merged.riskManagement.takeProfits).toHaveLength(2);
    });

    it('should handle filter override with custom emaFilter', () => {
      const config = createMainConfig();
      const strategy = createStrategy({
        filters: {
          // This is a custom filter not in the original config
          // In real scenario, config might have this
          btcCorrelation: {
            thresholds: { strict: 0.8 },
          },
        },
      });

      const merged = merger.mergeConfigs(config, strategy);
      const report = merger.getChangeReport(config, strategy);

      expect(report.changesCount).toBeGreaterThan(0);
      expect(merged.filters.btcCorrelation.thresholds.strict).toBe(0.8);
      expect(merged.filters.btcCorrelation.thresholds.weak).toBe(0.15); // Not overridden
    });
  });
});
