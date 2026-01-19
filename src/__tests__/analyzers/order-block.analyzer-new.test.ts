import { OrderBlockAnalyzerNew } from '../../analyzers/order-block.analyzer-new';
import type { Candle } from '../../types/core';
import type { BreakoutAnalyzerConfigNew } from '../../types/config-new.types';
import { AnalyzerType } from '../../types/analyzer-type.enum';

function createConfig(): BreakoutAnalyzerConfigNew {
  return { enabled: true, weight: 0.75, priority: 7 };
}

function createCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    timestamp: Date.now() + i * 60000,
    open: close - 0.5,
    high: close + 2,
    low: close - 2,
    close,
    volume: 5000,
  }));
}

describe('OrderBlockAnalyzerNew - Configuration Tests', () => {
  test('should create with valid config', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should throw on invalid priority', () => {
    expect(() => new OrderBlockAnalyzerNew({ ...createConfig(), priority: 0 })).toThrow();
  });
});

describe('OrderBlockAnalyzerNew - Input Validation Tests', () => {
  test('should throw when disabled', () => {
    const analyzer = new OrderBlockAnalyzerNew({ ...createConfig(), enabled: false });
    const candles = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i));
    expect(() => analyzer.analyze(candles)).toThrow();
  });

  test('should throw on insufficient candles', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 20 }, (_, i) => 100 + i));
    expect(() => analyzer.analyze(candles)).toThrow();
  });

  test('should throw on null candles', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    expect(() => analyzer.analyze(null as any)).toThrow();
  });
});

describe('OrderBlockAnalyzerNew - Signal Generation Tests', () => {
  test('should generate signal', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i * 0.5));
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.source).toBe('ORDER_BLOCK_ANALYZER');
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
    expect(signal.weight).toBe(0.75);
  });

  test('should calculate score', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i * 0.5));
    const signal = analyzer.analyze(candles);
    expect(signal.score).toBeCloseTo((signal.confidence / 100) * 0.75, 1);
  });
});

describe('OrderBlockAnalyzerNew - State Tests', () => {
  test('should have null signal initially', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    expect(analyzer.getLastSignal()).toBeNull();
  });

  test('should reset state', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i));
    analyzer.analyze(candles);
    analyzer.reset();
    expect(analyzer.getLastSignal()).toBeNull();
  });
});

describe('OrderBlockAnalyzerNew - IAnalyzer Interface Tests', () => {
  test('should implement getType()', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    expect(analyzer.getType()).toBe(AnalyzerType.ORDER_BLOCK);
  });

  test('should implement isReady()', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    const ready = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i));
    expect(analyzer.isReady(ready)).toBe(true);
  });

  test('should implement getMinCandlesRequired()', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    expect(analyzer.getMinCandlesRequired()).toBeGreaterThan(0);
  });

  test('should implement isEnabled()', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should implement getWeight()', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    expect(analyzer.getWeight()).toBe(0.75);
  });

  test('should implement getPriority()', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    expect(analyzer.getPriority()).toBe(7);
  });

  test('should implement getMaxConfidence()', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    expect(analyzer.getMaxConfidence()).toBe(0.95);
  });
});
