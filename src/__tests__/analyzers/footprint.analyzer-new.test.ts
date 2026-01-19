import { FootprintAnalyzerNew } from '../../analyzers/footprint.analyzer-new';
import type { Candle } from '../../types/core';
import type { BreakoutAnalyzerConfigNew } from '../../types/config-new.types';
import { AnalyzerType } from '../../types/analyzer-type.enum';

function createConfig(): BreakoutAnalyzerConfigNew {
  return { enabled: true, weight: 0.5, priority: 5 };
}

function createCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    timestamp: Date.now() + i * 60000,
    open: close - 0.3,
    high: close + 1.5,
    low: close - 1.5,
    close,
    volume: 5000 + Math.random() * 2000,
  }));
}

describe('FootprintAnalyzerNew - Configuration Tests', () => {
  test('should create analyzer with valid config', () => {
    const analyzer = new FootprintAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should throw on invalid config', () => {
    expect(() => new FootprintAnalyzerNew({ enabled: 'true' as any, weight: 0.5, priority: 5 })).toThrow();
  });
});

describe('FootprintAnalyzerNew - Input Validation Tests', () => {
  test('should throw when disabled', () => {
    const config = { ...createConfig(), enabled: false };
    const analyzer = new FootprintAnalyzerNew(config);
    const candles = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i));
    expect(() => analyzer.analyze(candles)).toThrow();
  });

  test('should throw on insufficient candles', () => {
    const analyzer = new FootprintAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 10 }, (_, i) => 100 + i));
    expect(() => analyzer.analyze(candles)).toThrow();
  });
});

describe('FootprintAnalyzerNew - Signal Generation Tests', () => {
  test('should generate signal', () => {
    const analyzer = new FootprintAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i * 0.5));
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.source).toBe('FOOTPRINT_ANALYZER');
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });

  test('should calculate score correctly', () => {
    const config = { ...createConfig(), weight: 0.6 };
    const analyzer = new FootprintAnalyzerNew(config);
    const candles = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i * 0.5));
    const signal = analyzer.analyze(candles);
    expect(signal.score).toBeCloseTo((signal.confidence / 100) * 0.6, 1);
  });
});

describe('FootprintAnalyzerNew - IAnalyzer Interface Tests', () => {
  test('should implement getType()', () => {
    const analyzer = new FootprintAnalyzerNew(createConfig());
    expect(analyzer.getType()).toBe(AnalyzerType.FOOTPRINT);
  });

  test('should implement isReady()', () => {
    const analyzer = new FootprintAnalyzerNew(createConfig());
    const ready = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i));
    expect(analyzer.isReady(ready)).toBe(true);
  });

  test('should implement getMinCandlesRequired()', () => {
    const analyzer = new FootprintAnalyzerNew(createConfig());
    expect(analyzer.getMinCandlesRequired()).toBeGreaterThan(0);
  });

  test('should implement isEnabled()', () => {
    const analyzer = new FootprintAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should implement getWeight()', () => {
    const analyzer = new FootprintAnalyzerNew(createConfig());
    expect(analyzer.getWeight()).toBe(0.5);
  });

  test('should implement getPriority()', () => {
    const analyzer = new FootprintAnalyzerNew(createConfig());
    expect(analyzer.getPriority()).toBe(5);
  });

  test('should implement getMaxConfidence()', () => {
    const analyzer = new FootprintAnalyzerNew(createConfig());
    expect(analyzer.getMaxConfidence()).toBe(0.95);
  });
});
