import { DeltaAnalyzerNew } from '../../analyzers/delta.analyzer-new';
import type { Candle } from '../../types/core';
import type { BreakoutAnalyzerConfigNew } from '../../types/config-new.types';
import { AnalyzerType } from '../../types/analyzer-type.enum';

function createConfig(): BreakoutAnalyzerConfigNew {
  return { enabled: true, weight: 0.6, priority: 5 };
}

function createCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    timestamp: Date.now() + i * 60000,
    open: close - 0.25,
    high: close + 1.25,
    low: close - 1.25,
    close,
    volume: 5000 + Math.random() * 2500,
  }));
}

describe('DeltaAnalyzerNew - Configuration Tests', () => {
  test('should create with valid config', () => {
    const analyzer = new DeltaAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should throw on missing enabled', () => {
    const config = { ...createConfig() };
    delete (config as any).enabled;
    expect(() => new DeltaAnalyzerNew(config as any)).toThrow();
  });

  test('should throw on invalid weight (negative)', () => {
    expect(() => new DeltaAnalyzerNew({ ...createConfig(), weight: -0.1 })).toThrow();
  });

  test('should throw on invalid weight (> 1)', () => {
    expect(() => new DeltaAnalyzerNew({ ...createConfig(), weight: 1.5 })).toThrow();
  });

  test('should throw on invalid priority', () => {
    expect(() => new DeltaAnalyzerNew({ ...createConfig(), priority: 0 })).toThrow();
  });
});

describe('DeltaAnalyzerNew - Input Validation Tests', () => {
  test('should throw when disabled', () => {
    const analyzer = new DeltaAnalyzerNew({ ...createConfig(), enabled: false });
    const candles = createCandles(Array.from({ length: 40 }, (_, i) => 100 + i));
    expect(() => analyzer.analyze(candles)).toThrow();
  });

  test('should throw on invalid candles input (null)', () => {
    const analyzer = new DeltaAnalyzerNew(createConfig());
    expect(() => analyzer.analyze(null as any)).toThrow();
  });

  test('should throw on invalid candles input (undefined)', () => {
    const analyzer = new DeltaAnalyzerNew(createConfig());
    expect(() => analyzer.analyze(undefined as any)).toThrow();
  });

  test('should throw on insufficient candles', () => {
    const analyzer = new DeltaAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 10 }, (_, i) => 100 + i));
    expect(() => analyzer.analyze(candles)).toThrow();
  });

  test('should handle valid candle data', () => {
    const analyzer = new DeltaAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 40 }, (_, i) => 100 + i));
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
  });
});

describe('DeltaAnalyzerNew - Signal Generation Tests', () => {
  test('should generate signal', () => {
    const analyzer = new DeltaAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 40 }, (_, i) => 100 + i * 0.5));
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.source).toBe('DELTA_ANALYZER');
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
    expect(signal.weight).toBe(0.6);
  });

  test('should calculate score correctly', () => {
    const config = { ...createConfig(), weight: 0.5 };
    const analyzer = new DeltaAnalyzerNew(config);
    const candles = createCandles(Array.from({ length: 40 }, (_, i) => 100 + i * 0.5));
    const signal = analyzer.analyze(candles);
    expect(signal.score).toBeCloseTo((signal.confidence / 100) * 0.5, 1);
  });

  test('should track last signal', () => {
    const analyzer = new DeltaAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 40 }, (_, i) => 100 + i * 0.5));
    const signal = analyzer.analyze(candles);
    expect(analyzer.getLastSignal()).toBe(signal);
  });

  test('should handle uptrend', () => {
    const analyzer = new DeltaAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 40 }, (_, i) => 100 + i * 2));
    const signal = analyzer.analyze(candles);
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });

  test('should handle downtrend', () => {
    const analyzer = new DeltaAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 40 }, (_, i) => 200 - i * 2));
    const signal = analyzer.analyze(candles);
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});

describe('DeltaAnalyzerNew - State Management Tests', () => {
  test('should have null signal initially', () => {
    const analyzer = new DeltaAnalyzerNew(createConfig());
    expect(analyzer.getLastSignal()).toBeNull();
  });

  test('should reset state', () => {
    const analyzer = new DeltaAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 40 }, (_, i) => 100 + i * 0.5));
    analyzer.analyze(candles);
    analyzer.reset();
    expect(analyzer.getLastSignal()).toBeNull();
  });

  test('should return config in state', () => {
    const config = createConfig();
    const analyzer = new DeltaAnalyzerNew(config);
    const state = analyzer.getState();
    expect(state.config.weight).toBe(0.6);
    expect(state.enabled).toBe(true);
  });
});

describe('DeltaAnalyzerNew - IAnalyzer Interface Tests', () => {
  test('should implement getType()', () => {
    const analyzer = new DeltaAnalyzerNew(createConfig());
    expect(analyzer.getType()).toBe(AnalyzerType.DELTA);
  });

  test('should implement isReady()', () => {
    const analyzer = new DeltaAnalyzerNew(createConfig());
    const notReady = createCandles(Array.from({ length: 10 }, (_, i) => 100 + i));
    const ready = createCandles(Array.from({ length: 40 }, (_, i) => 100 + i));
    expect(analyzer.isReady(notReady)).toBe(false);
    expect(analyzer.isReady(ready)).toBe(true);
  });

  test('should implement getMinCandlesRequired()', () => {
    const analyzer = new DeltaAnalyzerNew(createConfig());
    const min = analyzer.getMinCandlesRequired();
    expect(min).toBeGreaterThan(0);
    expect(min).toBeLessThanOrEqual(100);
  });

  test('should implement isEnabled()', () => {
    const analyzer = new DeltaAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should implement getWeight()', () => {
    const analyzer = new DeltaAnalyzerNew(createConfig());
    expect(analyzer.getWeight()).toBe(0.6);
  });

  test('should implement getPriority()', () => {
    const analyzer = new DeltaAnalyzerNew(createConfig());
    expect(analyzer.getPriority()).toBe(5);
  });

  test('should implement getMaxConfidence()', () => {
    const analyzer = new DeltaAnalyzerNew(createConfig());
    expect(analyzer.getMaxConfidence()).toBe(0.95);
  });
});

describe('DeltaAnalyzerNew - Edge Cases Tests', () => {
  test('should handle flat prices', () => {
    const analyzer = new DeltaAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 40 }, () => 100));
    const signal = analyzer.analyze(candles);
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });

  test('should handle zero weight', () => {
    const config = { ...createConfig(), weight: 0 };
    const analyzer = new DeltaAnalyzerNew(config);
    const candles = createCandles(Array.from({ length: 40 }, (_, i) => 100 + i));
    const signal = analyzer.analyze(candles);
    expect(signal.score).toBe(0);
  });

  test('should handle large price moves', () => {
    const analyzer = new DeltaAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 40 }, (_, i) => 100 + i * 10));
    const signal = analyzer.analyze(candles);
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});
