import { FairValueGapAnalyzerNew } from '../../analyzers/fair-value-gap.analyzer-new';
import type { Candle } from '../../types/core';
import type { BreakoutAnalyzerConfigNew } from '../../types/config-new.types';
import { AnalyzerType } from '../../types/analyzer-type.enum';

function createConfig(): BreakoutAnalyzerConfigNew {
  return { enabled: true, weight: 0.7, priority: 6 };
}

function createCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    timestamp: Date.now() + i * 60000,
    open: close - 0.5,
    high: close + 2,
    low: close - 2,
    close,
    volume: 1000,
  }));
}

describe('FairValueGapAnalyzerNew - Configuration Tests', () => {
  test('should create analyzer with valid config', () => {
    const analyzer = new FairValueGapAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should throw on invalid weight', () => {
    const config = { ...createConfig(), weight: 1.5 };
    expect(() => new FairValueGapAnalyzerNew(config)).toThrow();
  });

  test('should throw on invalid priority', () => {
    const config = { ...createConfig(), priority: 11 };
    expect(() => new FairValueGapAnalyzerNew(config)).toThrow();
  });
});

describe('FairValueGapAnalyzerNew - Input Validation Tests', () => {
  test('should throw when disabled', () => {
    const config = { ...createConfig(), enabled: false };
    const analyzer = new FairValueGapAnalyzerNew(config);
    const candles = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i));
    expect(() => analyzer.analyze(candles)).toThrow();
  });

  test('should throw on insufficient candles', () => {
    const analyzer = new FairValueGapAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 10 }, (_, i) => 100 + i));
    expect(() => analyzer.analyze(candles)).toThrow();
  });

  test('should throw on invalid candles input', () => {
    const analyzer = new FairValueGapAnalyzerNew(createConfig());
    expect(() => analyzer.analyze(null as any)).toThrow();
  });
});

describe('FairValueGapAnalyzerNew - Signal Generation Tests', () => {
  test('should generate signal with valid candles', () => {
    const analyzer = new FairValueGapAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i * 0.5));
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.source).toBe('FVG_ANALYZER');
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
    expect(signal.weight).toBe(0.7);
  });

  test('should calculate score correctly', () => {
    const config = { ...createConfig(), weight: 0.5 };
    const analyzer = new FairValueGapAnalyzerNew(config);
    const candles = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i * 0.5));
    const signal = analyzer.analyze(candles);
    expect(signal.score).toBeCloseTo((signal.confidence / 100) * 0.5, 1);
  });
});

describe('FairValueGapAnalyzerNew - State Management Tests', () => {
  test('should have null signal initially', () => {
    const analyzer = new FairValueGapAnalyzerNew(createConfig());
    expect(analyzer.getLastSignal()).toBeNull();
  });

  test('should reset state', () => {
    const analyzer = new FairValueGapAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i * 0.5));
    analyzer.analyze(candles);
    analyzer.reset();
    expect(analyzer.getLastSignal()).toBeNull();
  });
});

describe('FairValueGapAnalyzerNew - IAnalyzer Interface Tests', () => {
  test('should implement getType()', () => {
    const analyzer = new FairValueGapAnalyzerNew(createConfig());
    expect(analyzer.getType()).toBe(AnalyzerType.FAIR_VALUE_GAP);
  });

  test('should implement isReady()', () => {
    const analyzer = new FairValueGapAnalyzerNew(createConfig());
    const notReady = createCandles(Array.from({ length: 20 }, (_, i) => 100 + i));
    const ready = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i));
    expect(analyzer.isReady(notReady)).toBe(false);
    expect(analyzer.isReady(ready)).toBe(true);
  });

  test('should implement getMinCandlesRequired()', () => {
    const analyzer = new FairValueGapAnalyzerNew(createConfig());
    expect(analyzer.getMinCandlesRequired()).toBeGreaterThan(0);
  });

  test('should implement isEnabled()', () => {
    const analyzer = new FairValueGapAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should implement getWeight()', () => {
    const analyzer = new FairValueGapAnalyzerNew(createConfig());
    expect(analyzer.getWeight()).toBe(0.7);
  });

  test('should implement getPriority()', () => {
    const analyzer = new FairValueGapAnalyzerNew(createConfig());
    expect(analyzer.getPriority()).toBe(6);
  });

  test('should implement getMaxConfidence()', () => {
    const analyzer = new FairValueGapAnalyzerNew(createConfig());
    expect(analyzer.getMaxConfidence()).toBe(0.95);
  });
});
