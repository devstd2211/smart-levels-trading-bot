import { WhaleAnalyzerNew } from '../../analyzers/whale.analyzer-new';
import type { Candle } from '../../types/core';
import type { BreakoutAnalyzerConfigNew } from '../../types/config-new.types';
import { AnalyzerType } from '../../types/analyzer-type.enum';

function createConfig(): BreakoutAnalyzerConfigNew {
  return { enabled: true, weight: 0.7, priority: 7 };
}

function createCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    timestamp: Date.now() + i * 60000,
    open: close - 0.3,
    high: close + 1.5,
    low: close - 1.5,
    close,
    volume: 10000 + Math.random() * 5000,
  }));
}

describe('WhaleAnalyzerNew - Configuration Tests', () => {
  test('should create with valid config', () => {
    const analyzer = new WhaleAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should throw on invalid enabled', () => {
    expect(() => new WhaleAnalyzerNew({ ...createConfig(), enabled: 'true' as any })).toThrow();
  });

  test('should throw on invalid priority', () => {
    expect(() => new WhaleAnalyzerNew({ ...createConfig(), priority: -1 })).toThrow();
  });
});

describe('WhaleAnalyzerNew - Input Validation Tests', () => {
  test('should throw when disabled', () => {
    const analyzer = new WhaleAnalyzerNew({ ...createConfig(), enabled: false });
    const candles = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i));
    expect(() => analyzer.analyze(candles)).toThrow();
  });

  test('should throw on insufficient candles', () => {
    const analyzer = new WhaleAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 20 }, (_, i) => 100 + i));
    expect(() => analyzer.analyze(candles)).toThrow();
  });

  test('should throw on invalid input', () => {
    const analyzer = new WhaleAnalyzerNew(createConfig());
    expect(() => analyzer.analyze(undefined as any)).toThrow();
  });
});

describe('WhaleAnalyzerNew - Signal Generation Tests', () => {
  test('should generate signal', () => {
    const analyzer = new WhaleAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i * 0.5));
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.source).toBe('WHALE_ANALYZER');
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
    expect(signal.weight).toBe(0.7);
  });

  test('should detect large volume', () => {
    const analyzer = new WhaleAnalyzerNew(createConfig());
    const closes = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5);
    const candles = closes.map((close, i) => ({
      timestamp: Date.now() + i * 60000,
      open: close - 0.3,
      high: close + 1.5,
      low: close - 1.5,
      close,
      volume: i === 45 ? 100000 : 10000, // Large volume spike
    }));
    const signal = analyzer.analyze(candles);
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});

describe('WhaleAnalyzerNew - State Tests', () => {
  test('should have null signal initially', () => {
    const analyzer = new WhaleAnalyzerNew(createConfig());
    expect(analyzer.getLastSignal()).toBeNull();
  });

  test('should reset state', () => {
    const analyzer = new WhaleAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i));
    analyzer.analyze(candles);
    analyzer.reset();
    expect(analyzer.getLastSignal()).toBeNull();
  });
});

describe('WhaleAnalyzerNew - IAnalyzer Interface Tests', () => {
  test('should implement getType()', () => {
    const analyzer = new WhaleAnalyzerNew(createConfig());
    expect(analyzer.getType()).toBe(AnalyzerType.WHALE);
  });

  test('should implement isReady()', () => {
    const analyzer = new WhaleAnalyzerNew(createConfig());
    const ready = createCandles(Array.from({ length: 50 }, (_, i) => 100 + i));
    expect(analyzer.isReady(ready)).toBe(true);
  });

  test('should implement getMinCandlesRequired()', () => {
    const analyzer = new WhaleAnalyzerNew(createConfig());
    const min = analyzer.getMinCandlesRequired();
    expect(min).toBeGreaterThan(0);
    expect(min).toBeLessThanOrEqual(100);
  });

  test('should implement isEnabled()', () => {
    const analyzer = new WhaleAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should implement getWeight()', () => {
    const analyzer = new WhaleAnalyzerNew(createConfig());
    expect(analyzer.getWeight()).toBe(0.7);
  });

  test('should implement getPriority()', () => {
    const analyzer = new WhaleAnalyzerNew(createConfig());
    expect(analyzer.getPriority()).toBe(7);
  });

  test('should implement getMaxConfidence()', () => {
    const analyzer = new WhaleAnalyzerNew(createConfig());
    expect(analyzer.getMaxConfidence()).toBe(0.95);
  });
});
