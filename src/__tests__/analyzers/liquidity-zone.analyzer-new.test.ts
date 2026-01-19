import { LiquidityZoneAnalyzerNew } from '../../analyzers/liquidity-zone.analyzer-new';
import type { Candle } from '../../types/core';
import type { BreakoutAnalyzerConfigNew } from '../../types/config-new.types';
import { AnalyzerType } from '../../types/analyzer-type.enum';

function createConfig(): BreakoutAnalyzerConfigNew {
  return { enabled: true, weight: 0.65, priority: 6 };
}

function createCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    timestamp: Date.now() + i * 60000,
    open: close - 0.4,
    high: close + 1.2,
    low: close - 1.2,
    close,
    volume: 3000 + Math.random() * 1500,
  }));
}

describe('LiquidityZoneAnalyzerNew - Configuration Tests', () => {
  test('should create analyzer with valid config', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should throw on missing enabled', () => {
    const config = { ...createConfig() };
    delete (config as any).enabled;
    expect(() => new LiquidityZoneAnalyzerNew(config as any)).toThrow();
  });

  test('should throw on invalid priority', () => {
    const config = { ...createConfig(), priority: 11 };
    expect(() => new LiquidityZoneAnalyzerNew(config)).toThrow();
  });
});

describe('LiquidityZoneAnalyzerNew - Input Validation Tests', () => {
  test('should throw when disabled', () => {
    const config = { ...createConfig(), enabled: false };
    const analyzer = new LiquidityZoneAnalyzerNew(config);
    const candles = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i));
    expect(() => analyzer.analyze(candles)).toThrow();
  });

  test('should throw on insufficient candles', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 15 }, (_, i) => 100 + i));
    expect(() => analyzer.analyze(candles)).toThrow();
  });

  test('should throw on invalid candles', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    expect(() => analyzer.analyze(null as any)).toThrow();
  });
});

describe('LiquidityZoneAnalyzerNew - Signal Generation Tests', () => {
  test('should generate signal', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    // Create realistic candles with clear HIGH ZONE (support/resistance level with volume)
    // Strategy: Create a tight band of high prices (110-111) with consistent volume
    // Then lower prices to create contrast
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 100 + i * 0.4), // Build up
      ...Array.from({ length: 5 }, () => 107.8), // HIGH ZONE: multiple candles at same high level
      ...Array.from({ length: 5 }, () => 107.9), // HIGH ZONE: very close high level
      ...Array.from({ length: 5 }, (_, i) => 107 - i * 0.2), // Start pullback
    ];

    const candles = closes.map((close, i) => ({
      timestamp: Date.now() + i * 60000,
      open: close - 0.2,
      high: close + 0.8, // Tight wicks around the close
      low: close - 0.8,
      close,
      volume: 5000 + (i >= 20 && i < 30 ? 2000 : 0), // HIGH volume at zone
    }));

    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.source).toBe('LIQUIDITY_ZONE_ANALYZER');
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });

  test('should track last signal', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i * 0.5));
    const signal = analyzer.analyze(candles);
    expect(analyzer.getLastSignal()).toBe(signal);
  });
});

describe('LiquidityZoneAnalyzerNew - IAnalyzer Interface Tests', () => {
  test('should implement getType()', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    expect(analyzer.getType()).toBe(AnalyzerType.LIQUIDITY_ZONE);
  });

  test('should implement isReady()', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    const ready = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i));
    expect(analyzer.isReady(ready)).toBe(true);
  });

  test('should implement getMinCandlesRequired()', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    const minCandles = analyzer.getMinCandlesRequired();
    expect(minCandles).toBeGreaterThan(0);
    expect(minCandles).toBeLessThanOrEqual(100);
  });

  test('should implement isEnabled()', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should implement getWeight()', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    expect(analyzer.getWeight()).toBe(0.65);
  });

  test('should implement getPriority()', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    expect(analyzer.getPriority()).toBe(6);
  });

  test('should implement getMaxConfidence()', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    expect(analyzer.getMaxConfidence()).toBe(0.95);
  });
});

describe('LiquidityZoneAnalyzerNew - State Tests', () => {
  test('should reset state', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i));
    analyzer.analyze(candles);
    analyzer.reset();
    expect(analyzer.getLastSignal()).toBeNull();
  });
});
