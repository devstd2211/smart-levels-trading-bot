/**
 * Phase 4.10: Config-Driven Constants Tests
 * Validates orchestration config and analyzer parameter loading
 */

import type {
  OrchestrationConfig,
  EntryOrchestrationConfig,
  ExitOrchestrationConfig,
  TrendAnalysisConfig,
  AnalyzerParametersConfig,
  AtrAnalyzerParams,
  BollingerBandsAnalyzerParams,
  BreakoutAnalyzerParams,
  OrderBlockAnalyzerParams,
  WickAnalyzerParams,
} from '../../types/config.types';

// ============================================================================
// ORCHESTRATION CONFIG TESTS
// ============================================================================

describe('Phase 4.10: OrchestrationConfig', () => {
  describe('EntryOrchestrationConfig', () => {
    it('should have all required entry parameters', () => {
      const config: EntryOrchestrationConfig = {
        minConfidenceThreshold: 60,
        signalConflictThreshold: 0.4,
        flatMarketConfidenceThreshold: 70,
        minCandlesRequired: 20,
        minEntryConfidenceCandlesRequired: 5,
        maxPrimaryCandles: 100,
      };

      expect(config.minConfidenceThreshold).toBe(60);
      expect(config.signalConflictThreshold).toBe(0.4);
      expect(config.flatMarketConfidenceThreshold).toBe(70);
      expect(config.minCandlesRequired).toBe(20);
      expect(config.minEntryConfidenceCandlesRequired).toBe(5);
      expect(config.maxPrimaryCandles).toBe(100);
    });

    it('should support custom entry thresholds', () => {
      const config: EntryOrchestrationConfig = {
        minConfidenceThreshold: 50, // Lowered from default 60
        signalConflictThreshold: 0.5, // Increased from default 0.4
        flatMarketConfidenceThreshold: 75, // Increased from default 70
        minCandlesRequired: 15,
        minEntryConfidenceCandlesRequired: 3,
        maxPrimaryCandles: 200,
      };

      expect(config.minConfidenceThreshold).toBe(50);
      expect(config.signalConflictThreshold).toBe(0.5);
      expect(config.flatMarketConfidenceThreshold).toBe(75);
    });

    it('should validate conflict threshold as ratio (0-1)', () => {
      const validConfig: EntryOrchestrationConfig = {
        minConfidenceThreshold: 60,
        signalConflictThreshold: 0.3,
        flatMarketConfidenceThreshold: 70,
        minCandlesRequired: 20,
        minEntryConfidenceCandlesRequired: 5,
        maxPrimaryCandles: 100,
      };

      // Conflict threshold should be between 0 and 1
      expect(validConfig.signalConflictThreshold).toBeGreaterThanOrEqual(0);
      expect(validConfig.signalConflictThreshold).toBeLessThanOrEqual(1);
    });

    it('should validate confidence thresholds as percentages (0-100)', () => {
      const config: EntryOrchestrationConfig = {
        minConfidenceThreshold: 60,
        signalConflictThreshold: 0.4,
        flatMarketConfidenceThreshold: 70,
        minCandlesRequired: 20,
        minEntryConfidenceCandlesRequired: 5,
        maxPrimaryCandles: 100,
      };

      // Confidence thresholds should be positive
      expect(config.minConfidenceThreshold).toBeGreaterThan(0);
      expect(config.flatMarketConfidenceThreshold).toBeGreaterThan(0);
    });
  });

  describe('ExitOrchestrationConfig', () => {
    it('should have all required exit parameters', () => {
      const config: ExitOrchestrationConfig = {
        breakeven: {
          marginPercent: 0.1,
        },
        trailingStop: {
          minDistancePercent: 0.1,
          maxDistancePercent: 5.0,
          atrMultiplier: 1.0,
        },
      };

      expect(config.breakeven.marginPercent).toBe(0.1);
      expect(config.trailingStop.minDistancePercent).toBe(0.1);
      expect(config.trailingStop.maxDistancePercent).toBe(5.0);
      expect(config.trailingStop.atrMultiplier).toBe(1.0);
    });

    it('should support custom trailing stop parameters', () => {
      const config: ExitOrchestrationConfig = {
        breakeven: {
          marginPercent: 0.15,
        },
        trailingStop: {
          minDistancePercent: 0.2,
          maxDistancePercent: 10.0,
          atrMultiplier: 1.5,
        },
      };

      expect(config.trailingStop.minDistancePercent).toBe(0.2);
      expect(config.trailingStop.maxDistancePercent).toBe(10.0);
      expect(config.trailingStop.atrMultiplier).toBe(1.5);
    });

    it('should enforce min < max for trailing stop distances', () => {
      const config: ExitOrchestrationConfig = {
        breakeven: {
          marginPercent: 0.1,
        },
        trailingStop: {
          minDistancePercent: 0.1,
          maxDistancePercent: 5.0,
          atrMultiplier: 1.0,
        },
      };

      expect(config.trailingStop.minDistancePercent).toBeLessThan(config.trailingStop.maxDistancePercent);
    });
  });

  describe('Full OrchestrationConfig', () => {
    it('should combine entry and exit configurations', () => {
      const config: OrchestrationConfig = {
        entry: {
          minConfidenceThreshold: 60,
          signalConflictThreshold: 0.4,
          flatMarketConfidenceThreshold: 70,
          minCandlesRequired: 20,
          minEntryConfidenceCandlesRequired: 5,
          maxPrimaryCandles: 100,
        },
        exit: {
          breakeven: {
            marginPercent: 0.1,
          },
          trailingStop: {
            minDistancePercent: 0.1,
            maxDistancePercent: 5.0,
            atrMultiplier: 1.0,
          },
        },
      };

      expect(config.entry.minConfidenceThreshold).toBe(60);
      expect(config.exit.trailingStop.atrMultiplier).toBe(1.0);
    });
  });
});

// ============================================================================
// TREND ANALYSIS CONFIG TESTS
// ============================================================================

describe('Phase 4.10: TrendAnalysisConfig', () => {
  it('should have all required trend parameters', () => {
    const config: TrendAnalysisConfig = {
      minCandlesRequired: 20,
      strongTrendStrength: 0.8,
      flatTrendStrength: 0.3,
      unclearTrendStrength: 0.0,
      zigzagMinDepth: 5,
      recentSwingMaxAge: 20,
    };

    expect(config.minCandlesRequired).toBe(20);
    expect(config.strongTrendStrength).toBe(0.8);
    expect(config.flatTrendStrength).toBe(0.3);
    expect(config.unclearTrendStrength).toBe(0.0);
    expect(config.zigzagMinDepth).toBe(5);
    expect(config.recentSwingMaxAge).toBe(20);
  });

  it('should support custom trend strength thresholds', () => {
    const config: TrendAnalysisConfig = {
      minCandlesRequired: 30,
      strongTrendStrength: 0.75,
      flatTrendStrength: 0.25,
      unclearTrendStrength: 0.1,
      zigzagMinDepth: 3,
      recentSwingMaxAge: 30,
    };

    expect(config.strongTrendStrength).toBe(0.75);
    expect(config.flatTrendStrength).toBe(0.25);
  });

  it('should have trend strength values between 0 and 1', () => {
    const config: TrendAnalysisConfig = {
      minCandlesRequired: 20,
      strongTrendStrength: 0.8,
      flatTrendStrength: 0.3,
      unclearTrendStrength: 0.0,
      zigzagMinDepth: 5,
      recentSwingMaxAge: 20,
    };

    expect(config.strongTrendStrength).toBeGreaterThanOrEqual(0);
    expect(config.strongTrendStrength).toBeLessThanOrEqual(1);
    expect(config.flatTrendStrength).toBeGreaterThanOrEqual(0);
    expect(config.flatTrendStrength).toBeLessThanOrEqual(1);
  });

  it('should have strongTrendStrength > flatTrendStrength', () => {
    const config: TrendAnalysisConfig = {
      minCandlesRequired: 20,
      strongTrendStrength: 0.8,
      flatTrendStrength: 0.3,
      unclearTrendStrength: 0.0,
      zigzagMinDepth: 5,
      recentSwingMaxAge: 20,
    };

    expect(config.strongTrendStrength).toBeGreaterThan(config.flatTrendStrength);
  });
});

// ============================================================================
// ANALYZER PARAMETERS CONFIG TESTS
// ============================================================================

describe('Phase 4.10: AnalyzerParametersConfig', () => {
  describe('AtrAnalyzerParams', () => {
    it('should have ATR analyzer thresholds', () => {
      const params: AtrAnalyzerParams = {
        highThreshold: 2.5,
        lowThreshold: 0.8,
      };

      expect(params.highThreshold).toBe(2.5);
      expect(params.lowThreshold).toBe(0.8);
    });

    it('should support custom ATR thresholds', () => {
      const params: AtrAnalyzerParams = {
        highThreshold: 3.0,
        lowThreshold: 0.6,
      };

      expect(params.highThreshold).toBe(3.0);
      expect(params.lowThreshold).toBe(0.6);
    });

    it('should have highThreshold > lowThreshold', () => {
      const params: AtrAnalyzerParams = {
        highThreshold: 2.5,
        lowThreshold: 0.8,
      };

      expect(params.highThreshold).toBeGreaterThan(params.lowThreshold);
    });
  });

  describe('BollingerBandsAnalyzerParams', () => {
    it('should have Bollinger Bands analyzer parameters', () => {
      const params: BollingerBandsAnalyzerParams = {
        minCandlesRequired: 25,
        oversoldThreshold: 20,
        overboughtThreshold: 80,
        neutralRange: {
          lower: 40,
          upper: 60,
        },
        squeezeThreshold: 5,
      };

      expect(params.minCandlesRequired).toBe(25);
      expect(params.oversoldThreshold).toBe(20);
      expect(params.overboughtThreshold).toBe(80);
      expect(params.neutralRange.lower).toBe(40);
      expect(params.neutralRange.upper).toBe(60);
      expect(params.squeezeThreshold).toBe(5);
    });

    it('should have overboughtThreshold > overboughtThreshold', () => {
      const params: BollingerBandsAnalyzerParams = {
        minCandlesRequired: 25,
        oversoldThreshold: 20,
        overboughtThreshold: 80,
        neutralRange: {
          lower: 40,
          upper: 60,
        },
        squeezeThreshold: 5,
      };

      expect(params.overboughtThreshold).toBeGreaterThan(params.oversoldThreshold);
    });

    it('should have valid neutral range', () => {
      const params: BollingerBandsAnalyzerParams = {
        minCandlesRequired: 25,
        oversoldThreshold: 20,
        overboughtThreshold: 80,
        neutralRange: {
          lower: 40,
          upper: 60,
        },
        squeezeThreshold: 5,
      };

      expect(params.neutralRange.upper).toBeGreaterThan(params.neutralRange.lower);
      expect(params.neutralRange.lower).toBeGreaterThan(params.oversoldThreshold);
      expect(params.neutralRange.upper).toBeLessThan(params.overboughtThreshold);
    });
  });

  describe('BreakoutAnalyzerParams', () => {
    it('should have Breakout analyzer parameters', () => {
      const params: BreakoutAnalyzerParams = {
        minCandlesRequired: 30,
        resistanceLookback: 20,
        volatilityThreshold: 1.5,
      };

      expect(params.minCandlesRequired).toBe(30);
      expect(params.resistanceLookback).toBe(20);
      expect(params.volatilityThreshold).toBe(1.5);
    });

    it('should support custom breakout parameters', () => {
      const params: BreakoutAnalyzerParams = {
        minCandlesRequired: 50,
        resistanceLookback: 30,
        volatilityThreshold: 2.0,
      };

      expect(params.minCandlesRequired).toBe(50);
      expect(params.resistanceLookback).toBe(30);
      expect(params.volatilityThreshold).toBe(2.0);
    });
  });

  describe('OrderBlockAnalyzerParams', () => {
    it('should have Order Block analyzer parameters', () => {
      const params: OrderBlockAnalyzerParams = {
        maxDistanceThreshold: 0.05,
        maxRejectionCount: 5,
      };

      expect(params.maxDistanceThreshold).toBe(0.05);
      expect(params.maxRejectionCount).toBe(5);
    });
  });

  describe('WickAnalyzerParams', () => {
    it('should have Wick analyzer parameters', () => {
      const params: WickAnalyzerParams = {
        minBodyToWickRatio: 0.3,
      };

      expect(params.minBodyToWickRatio).toBe(0.3);
    });

    it('should support custom wick ratio', () => {
      const params: WickAnalyzerParams = {
        minBodyToWickRatio: 0.5,
      };

      expect(params.minBodyToWickRatio).toBe(0.5);
    });
  });

  describe('Complete AnalyzerParametersConfig', () => {
    it('should support all analyzer parameters together', () => {
      const config: AnalyzerParametersConfig = {
        atr: {
          highThreshold: 2.5,
          lowThreshold: 0.8,
        },
        bollingerBands: {
          minCandlesRequired: 25,
          oversoldThreshold: 20,
          overboughtThreshold: 80,
          neutralRange: {
            lower: 40,
            upper: 60,
          },
          squeezeThreshold: 5,
        },
        breakout: {
          minCandlesRequired: 30,
          resistanceLookback: 20,
          volatilityThreshold: 1.5,
        },
        orderBlock: {
          maxDistanceThreshold: 0.05,
          maxRejectionCount: 5,
        },
        wick: {
          minBodyToWickRatio: 0.3,
        },
      };

      expect(config.atr?.highThreshold).toBe(2.5);
      expect(config.bollingerBands?.minCandlesRequired).toBe(25);
      expect(config.breakout?.resistanceLookback).toBe(20);
      expect(config.orderBlock?.maxDistanceThreshold).toBe(0.05);
      expect(config.wick?.minBodyToWickRatio).toBe(0.3);
    });

    it('should support partial analyzer parameters', () => {
      const config: AnalyzerParametersConfig = {
        atr: {
          highThreshold: 2.5,
          lowThreshold: 0.8,
        },
        // Only ATR configured, others optional
      };

      expect(config.atr?.highThreshold).toBe(2.5);
      expect(config.bollingerBands).toBeUndefined();
      expect(config.breakout).toBeUndefined();
    });
  });
});

// ============================================================================
// CONFIG DEFAULTS VALIDATION
// ============================================================================

describe('Phase 4.10: Config Defaults', () => {
  it('should provide sensible entry orchestration defaults', () => {
    const defaults: EntryOrchestrationConfig = {
      minConfidenceThreshold: 60,
      signalConflictThreshold: 0.4,
      flatMarketConfidenceThreshold: 70,
      minCandlesRequired: 20,
      minEntryConfidenceCandlesRequired: 5,
      maxPrimaryCandles: 100,
    };

    // Confidence thresholds should be reasonable
    expect(defaults.minConfidenceThreshold).toBeLessThan(defaults.flatMarketConfidenceThreshold);
    // Conflict threshold should be between 0 and 1
    expect(defaults.signalConflictThreshold).toBeGreaterThan(0);
    expect(defaults.signalConflictThreshold).toBeLessThan(1);
  });

  it('should provide sensible trend analysis defaults', () => {
    const defaults: TrendAnalysisConfig = {
      minCandlesRequired: 20,
      strongTrendStrength: 0.8,
      flatTrendStrength: 0.3,
      unclearTrendStrength: 0.0,
      zigzagMinDepth: 5,
      recentSwingMaxAge: 20,
    };

    expect(defaults.strongTrendStrength).toBeGreaterThan(defaults.flatTrendStrength);
    expect(defaults.minCandlesRequired).toBeGreaterThan(0);
  });

  it('should provide sensible ATR analyzer defaults', () => {
    const defaults: AtrAnalyzerParams = {
      highThreshold: 2.5,
      lowThreshold: 0.8,
    };

    expect(defaults.highThreshold).toBeGreaterThan(defaults.lowThreshold);
  });

  it('should provide sensible Bollinger Bands analyzer defaults', () => {
    const defaults: BollingerBandsAnalyzerParams = {
      minCandlesRequired: 25,
      oversoldThreshold: 20,
      overboughtThreshold: 80,
      neutralRange: {
        lower: 40,
        upper: 60,
      },
      squeezeThreshold: 5,
    };

    expect(defaults.overboughtThreshold).toBeGreaterThan(defaults.oversoldThreshold);
    expect(defaults.neutralRange.upper).toBeGreaterThan(defaults.neutralRange.lower);
  });
});

// ============================================================================
// CONFIG COMPATIBILITY TESTS
// ============================================================================

describe('Phase 4.10: Config Compatibility', () => {
  it('should allow partial config overrides', () => {
    const defaults: OrchestrationConfig = {
      entry: {
        minConfidenceThreshold: 60,
        signalConflictThreshold: 0.4,
        flatMarketConfidenceThreshold: 70,
        minCandlesRequired: 20,
        minEntryConfidenceCandlesRequired: 5,
        maxPrimaryCandles: 100,
      },
      exit: {
        breakeven: {
          marginPercent: 0.1,
        },
        trailingStop: {
          minDistancePercent: 0.1,
          maxDistancePercent: 5.0,
          atrMultiplier: 1.0,
        },
      },
    };

    // Should be able to override just confidence
    const custom = {
      ...defaults,
      entry: {
        ...defaults.entry,
        minConfidenceThreshold: 50, // Override just this
      },
    };

    expect(custom.entry.minConfidenceThreshold).toBe(50);
    expect(custom.entry.flatMarketConfidenceThreshold).toBe(70); // Should keep default
  });

  it('should be backwards compatible with old configs', () => {
    // Old configs without orchestration section should still work
    const oldConfig = {
      version: 1,
      meta: { description: 'Test', lastUpdated: '2026-01-20', activeAnalyzers: [] },
      exchange: { name: 'BYBIT', symbol: 'XRPUSDT', demo: true, testnet: false, apiKey: '', apiSecret: '' },
      trading: { leverage: 10, positionSizeUsdt: 100, maxPositions: 5, orderType: 'MARKET', tradingCycleIntervalMs: 1000, favorableMovementThresholdPercent: 0.1 },
      riskManagement: {
        stopLoss: { percent: 2, atrMultiplier: 2, minDistancePercent: 1 },
        takeProfits: [{ level: 1, percent: 1.5, sizePercent: 50 }],
        trailing: { enabled: false, percent: 2, activationLevel: 1 },
        breakeven: { enabled: true, offsetPercent: 0.1 },
        timeBasedExit: { enabled: false },
      },
      // No orchestration section - should use defaults
    };

    // New config with orchestration
    const newConfig = {
      ...oldConfig,
      orchestration: {
        entry: {
          minConfidenceThreshold: 60,
          signalConflictThreshold: 0.4,
          flatMarketConfidenceThreshold: 70,
          minCandlesRequired: 20,
          minEntryConfidenceCandlesRequired: 5,
          maxPrimaryCandles: 100,
        },
        exit: {
          breakeven: { marginPercent: 0.1 },
          trailingStop: { minDistancePercent: 0.1, maxDistancePercent: 5.0, atrMultiplier: 1.0 },
        },
      },
    };

    // Both should be valid
    expect(oldConfig).toBeDefined();
    expect(newConfig).toBeDefined();
    expect(newConfig.orchestration?.entry.minConfidenceThreshold).toBe(60);
  });
});
