import { VolatilitySpikeAnalyzerNew } from '../../analyzers/volatility-spike.analyzer-new';
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
    high: close + 2,
    low: close - 2,
    close,
    volume: 6000 + Math.random() * 3000,
  }));
}

describe('VolatilitySpikeAnalyzerNew - Configuration Tests', () => {
  test('should create with valid config', () => {
    const analyzer = new VolatilitySpikeAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should throw on missing config fields', () => {
    expect(() => new VolatilitySpikeAnalyzerNew({ enabled: 'true' as any, weight: 0.65, priority: 6 })).toThrow();
  });
});

describe('VolatilitySpikeAnalyzerNew - Input Validation Tests', () => {
  test('should throw when disabled', () => {
    const analyzer = new VolatilitySpikeAnalyzerNew({ ...createConfig(), enabled: false });
    const candles = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i));
    expect(() => analyzer.analyze(candles)).toThrow();
  });

  test('should throw on insufficient candles', () => {
    const analyzer = new VolatilitySpikeAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 15 }, (_, i) => 100 + i));
    expect(() => analyzer.analyze(candles)).toThrow();
  });

  test('should throw on invalid candles', () => {
    const analyzer = new VolatilitySpikeAnalyzerNew(createConfig());
    expect(() => analyzer.analyze(null as any)).toThrow();
  });
});

describe('VolatilitySpikeAnalyzerNew - Signal Generation Tests', () => {
  test('should generate signal on normal volatility', () => {
    const analyzer = new VolatilitySpikeAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i * 0.5));
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.source).toBe('VOLATILITY_SPIKE_ANALYZER_NEW');
    expect(signal.confidence).toBeGreaterThanOrEqual(0);
    expect(signal.confidence).toBeLessThanOrEqual(100);
  });

  test('should generate signal on high volatility', () => {
    const analyzer = new VolatilitySpikeAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.5) * 10));
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.confidence).toBeGreaterThanOrEqual(0);
    expect(signal.confidence).toBeLessThanOrEqual(100);
  });
});

describe('VolatilitySpikeAnalyzerNew - State Tests', () => {
  test('should have enabled status', () => {
    const analyzer = new VolatilitySpikeAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });
});

describe('VolatilitySpikeAnalyzerNew - IAnalyzer Interface Tests', () => {
  test('should implement getType()', () => {
    const analyzer = new VolatilitySpikeAnalyzerNew(createConfig());
    expect(analyzer.getType()).toBe(AnalyzerType.VOLATILITY_SPIKE);
  });

  test('should implement isReady()', () => {
    const analyzer = new VolatilitySpikeAnalyzerNew(createConfig());
    const ready = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i));
    expect(analyzer.isReady(ready)).toBe(true);
  });

  test('should implement getMinCandlesRequired()', () => {
    const analyzer = new VolatilitySpikeAnalyzerNew(createConfig());
    expect(analyzer.getMinCandlesRequired()).toBeGreaterThan(0);
  });

  test('should implement isEnabled()', () => {
    const analyzer = new VolatilitySpikeAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should implement getWeight()', () => {
    const analyzer = new VolatilitySpikeAnalyzerNew(createConfig());
    expect(analyzer.getWeight()).toBe(0.65);
  });

  test('should implement getPriority()', () => {
    const analyzer = new VolatilitySpikeAnalyzerNew(createConfig());
    expect(analyzer.getPriority()).toBe(6);
  });

  test('should implement getMaxConfidence()', () => {
    const analyzer = new VolatilitySpikeAnalyzerNew(createConfig());
    expect(analyzer.getMaxConfidence()).toBe(0.95);
  });
});
