import { TickDeltaAnalyzerNew } from '../../analyzers/tick-delta.analyzer-new';
import type { Candle } from '../../types/core';
import type { BreakoutAnalyzerConfigNew } from '../../types/config-new.types';
import { AnalyzerType } from '../../types/analyzer-type.enum';

function createConfig(): BreakoutAnalyzerConfigNew {
  return { enabled: true, weight: 0.6, priority: 5 };
}

function createCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    timestamp: Date.now() + i * 60000,
    open: close - 0.2,
    high: close + 1,
    low: close - 1,
    close,
    volume: 4000 + Math.random() * 2000,
  }));
}

describe('TickDeltaAnalyzerNew - Configuration Tests', () => {
  test('should create with valid config', () => {
    const analyzer = new TickDeltaAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should throw on invalid weight', () => {
    expect(() => new TickDeltaAnalyzerNew({ ...createConfig(), weight: 1.5 })).toThrow();
  });
});

describe('TickDeltaAnalyzerNew - Input Validation Tests', () => {
  test('should throw when disabled', () => {
    const analyzer = new TickDeltaAnalyzerNew({ ...createConfig(), enabled: false });
    const candles = createCandles(Array.from({ length: 30 }, (_, i) => 100 + i));
    expect(() => analyzer.analyze(candles)).toThrow();
  });

  test('should throw on insufficient candles', () => {
    const analyzer = new TickDeltaAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 10 }, (_, i) => 100 + i));
    expect(() => analyzer.analyze(candles)).toThrow();
  });
});

describe('TickDeltaAnalyzerNew - Signal Generation Tests', () => {
  test('should generate signal', () => {
    const analyzer = new TickDeltaAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 30 }, (_, i) => 100 + i * 0.3));
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.source).toBe('TICK_DELTA_ANALYZER');
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });

  test('should calculate score correctly', () => {
    const config = { ...createConfig(), weight: 0.5 };
    const analyzer = new TickDeltaAnalyzerNew(config);
    const candles = createCandles(Array.from({ length: 30 }, (_, i) => 100 + i * 0.3));
    const signal = analyzer.analyze(candles);
    expect(signal.score).toBeCloseTo((signal.confidence / 100) * 0.5, 1);
  });
});

describe('TickDeltaAnalyzerNew - State Tests', () => {
  test('should have null signal initially', () => {
    const analyzer = new TickDeltaAnalyzerNew(createConfig());
    expect(analyzer.getLastSignal()).toBeNull();
  });

  test('should reset state', () => {
    const analyzer = new TickDeltaAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 30 }, (_, i) => 100 + i));
    analyzer.analyze(candles);
    analyzer.reset();
    expect(analyzer.getLastSignal()).toBeNull();
  });
});

describe('TickDeltaAnalyzerNew - IAnalyzer Interface Tests', () => {
  test('should implement getType()', () => {
    const analyzer = new TickDeltaAnalyzerNew(createConfig());
    expect(analyzer.getType()).toBe(AnalyzerType.TICK_DELTA);
  });

  test('should implement isReady()', () => {
    const analyzer = new TickDeltaAnalyzerNew(createConfig());
    const ready = createCandles(Array.from({ length: 30 }, (_, i) => 100 + i));
    expect(analyzer.isReady(ready)).toBe(true);
  });

  test('should implement getMinCandlesRequired()', () => {
    const analyzer = new TickDeltaAnalyzerNew(createConfig());
    expect(analyzer.getMinCandlesRequired()).toBeGreaterThan(0);
  });

  test('should implement isEnabled()', () => {
    const analyzer = new TickDeltaAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should implement getWeight()', () => {
    const analyzer = new TickDeltaAnalyzerNew(createConfig());
    expect(analyzer.getWeight()).toBe(0.6);
  });

  test('should implement getPriority()', () => {
    const analyzer = new TickDeltaAnalyzerNew(createConfig());
    expect(analyzer.getPriority()).toBe(5);
  });

  test('should implement getMaxConfidence()', () => {
    const analyzer = new TickDeltaAnalyzerNew(createConfig());
    expect(analyzer.getMaxConfidence()).toBe(0.95);
  });
});
