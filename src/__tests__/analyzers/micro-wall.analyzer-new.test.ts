import { MicroWallAnalyzerNew } from '../../analyzers/micro-wall.analyzer-new';
import type { Candle } from '../../types/core';
import type { BreakoutAnalyzerConfigNew } from '../../types/config-new.types';
import { AnalyzerType } from '../../types/analyzer-type.enum';

function createConfig(): BreakoutAnalyzerConfigNew {
  return { enabled: true, weight: 0.55, priority: 5 };
}

function createCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    timestamp: Date.now() + i * 60000,
    open: close - 0.2,
    high: close + 1,
    low: close - 1,
    close,
    volume: 2000 + Math.random() * 1000,
  }));
}

describe('MicroWallAnalyzerNew - Configuration Tests', () => {
  test('should create with valid config', () => {
    const analyzer = new MicroWallAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should throw on invalid weight', () => {
    expect(() => new MicroWallAnalyzerNew({ ...createConfig(), weight: -0.1 })).toThrow();
  });
});

describe('MicroWallAnalyzerNew - Input Validation Tests', () => {
  test('should throw when disabled', () => {
    const analyzer = new MicroWallAnalyzerNew({ ...createConfig(), enabled: false });
    const candles = createCandles(Array.from({ length: 30 }, (_, i) => 100 + i));
    expect(() => analyzer.analyze(candles)).toThrow();
  });

  test('should throw on insufficient candles', () => {
    const analyzer = new MicroWallAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 5 }, (_, i) => 100 + i));
    expect(() => analyzer.analyze(candles)).toThrow();
  });
});

describe('MicroWallAnalyzerNew - Signal Generation Tests', () => {
  test('should generate signal', () => {
    const analyzer = new MicroWallAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 30 }, (_, i) => 100 + i * 0.3));
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.source).toBe('MICRO_WALL_ANALYZER');
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});

describe('MicroWallAnalyzerNew - IAnalyzer Interface Tests', () => {
  test('should implement getType()', () => {
    const analyzer = new MicroWallAnalyzerNew(createConfig());
    expect(analyzer.getType()).toBe(AnalyzerType.MICRO_WALL);
  });

  test('should implement isReady()', () => {
    const analyzer = new MicroWallAnalyzerNew(createConfig());
    const ready = createCandles(Array.from({ length: 30 }, (_, i) => 100 + i));
    expect(analyzer.isReady(ready)).toBe(true);
  });

  test('should implement getMinCandlesRequired()', () => {
    const analyzer = new MicroWallAnalyzerNew(createConfig());
    expect(analyzer.getMinCandlesRequired()).toBeGreaterThan(0);
  });

  test('should implement isEnabled()', () => {
    const analyzer = new MicroWallAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should implement getWeight()', () => {
    const analyzer = new MicroWallAnalyzerNew(createConfig());
    expect(analyzer.getWeight()).toBe(0.55);
  });

  test('should implement getPriority()', () => {
    const analyzer = new MicroWallAnalyzerNew(createConfig());
    expect(analyzer.getPriority()).toBe(5);
  });

  test('should implement getMaxConfidence()', () => {
    const analyzer = new MicroWallAnalyzerNew(createConfig());
    expect(analyzer.getMaxConfidence()).toBe(0.95);
  });
});
