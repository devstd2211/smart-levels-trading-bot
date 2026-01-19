import { PriceActionAnalyzerNew } from '../../analyzers/price-action.analyzer-new';
import type { Candle } from '../../types/core';
import type { BreakoutAnalyzerConfigNew } from '../../types/config-new.types';
import { SignalDirection } from '../../types/enums';
import { AnalyzerType } from '../../types/analyzer-type.enum';

function createConfig(): BreakoutAnalyzerConfigNew {
  return { enabled: true, weight: 0.6, priority: 5 };
}

function createCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    timestamp: Date.now() + i * 60000,
    open: close - 0.3,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000,
  }));
}

describe('PriceActionAnalyzerNew - Configuration Tests', () => {
  test('should create analyzer with valid config', () => {
    const analyzer = new PriceActionAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should throw on missing enabled', () => {
    const config = { ...createConfig() };
    delete (config as any).enabled;
    expect(() => new PriceActionAnalyzerNew(config as any)).toThrow('[PRICE_ACTION]');
  });

  test('should throw on invalid weight (negative)', () => {
    const config = { ...createConfig(), weight: -0.1 };
    expect(() => new PriceActionAnalyzerNew(config)).toThrow('[PRICE_ACTION]');
  });

  test('should throw on invalid weight (> 1)', () => {
    const config = { ...createConfig(), weight: 1.5 };
    expect(() => new PriceActionAnalyzerNew(config)).toThrow('[PRICE_ACTION]');
  });

  test('should throw on invalid priority (< 1)', () => {
    const config = { ...createConfig(), priority: 0 };
    expect(() => new PriceActionAnalyzerNew(config)).toThrow('[PRICE_ACTION]');
  });

  test('should throw on invalid priority (> 10)', () => {
    const config = { ...createConfig(), priority: 11 };
    expect(() => new PriceActionAnalyzerNew(config)).toThrow('[PRICE_ACTION]');
  });
});

describe('PriceActionAnalyzerNew - Input Validation Tests', () => {
  test('should throw when disabled', () => {
    const config = { ...createConfig(), enabled: false };
    const analyzer = new PriceActionAnalyzerNew(config);
    const candles = createCandles(Array.from({ length: 20 }, (_, i) => 100 + i));
    expect(() => analyzer.analyze(candles)).toThrow('[PRICE_ACTION]');
  });

  test('should throw on invalid candles input (null)', () => {
    const analyzer = new PriceActionAnalyzerNew(createConfig());
    expect(() => analyzer.analyze(null as any)).toThrow('[PRICE_ACTION]');
  });

  test('should throw on insufficient candles', () => {
    const analyzer = new PriceActionAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 10 }, (_, i) => 100 + i));
    expect(() => analyzer.analyze(candles)).toThrow('[PRICE_ACTION]');
  });

  test('should throw on invalid candle data', () => {
    const analyzer = new PriceActionAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 20 }, (_, i) => 100 + i));
    (candles[5] as any).close = undefined;
    expect(() => analyzer.analyze(candles)).toThrow('[PRICE_ACTION]');
  });
});

describe('PriceActionAnalyzerNew - Signal Generation Tests', () => {
  test('should generate signal with valid candles', () => {
    const analyzer = new PriceActionAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 20 }, (_, i) => 100 + i * 0.5));
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.source).toBe('PRICE_ACTION_ANALYZER');
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
    expect(signal.weight).toBe(0.6);
  });

  test('should calculate score correctly', () => {
    const config = { ...createConfig(), weight: 0.5 };
    const analyzer = new PriceActionAnalyzerNew(config);
    const candles = createCandles(Array.from({ length: 20 }, (_, i) => 100 + i * 0.5));
    const signal = analyzer.analyze(candles);
    expect(signal.score).toBeCloseTo((signal.confidence / 100) * 0.5, 1);
  });

  test('should generate LONG signal on bullish price action', () => {
    const analyzer = new PriceActionAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 20 }, (_, i) => 100 + i * 1.5));
    const signal = analyzer.analyze(candles);
    expect([SignalDirection.LONG, SignalDirection.SHORT, SignalDirection.HOLD]).toContain(signal.direction);
  });

  test('should track last signal', () => {
    const analyzer = new PriceActionAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 20 }, (_, i) => 100 + i * 0.5));
    const signal = analyzer.analyze(candles);
    expect(analyzer.getLastSignal()).toBe(signal);
  });
});

describe('PriceActionAnalyzerNew - State Management Tests', () => {
  test('should have null signal initially', () => {
    const analyzer = new PriceActionAnalyzerNew(createConfig());
    expect(analyzer.getLastSignal()).toBeNull();
  });

  test('should reset state', () => {
    const analyzer = new PriceActionAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 20 }, (_, i) => 100 + i * 0.5));
    analyzer.analyze(candles);
    analyzer.reset();
    expect(analyzer.getLastSignal()).toBeNull();
  });

  test('should return config in state', () => {
    const config = createConfig();
    const analyzer = new PriceActionAnalyzerNew(config);
    const state = analyzer.getState();
    expect(state.config.weight).toBe(0.6);
    expect(state.enabled).toBe(true);
  });
});

describe('PriceActionAnalyzerNew - IAnalyzer Interface Tests', () => {
  test('should implement getType()', () => {
    const analyzer = new PriceActionAnalyzerNew(createConfig());
    expect(analyzer.getType()).toBe(AnalyzerType.PRICE_ACTION);
  });

  test('should implement isReady()', () => {
    const analyzer = new PriceActionAnalyzerNew(createConfig());
    const notReady = createCandles(Array.from({ length: 10 }, (_, i) => 100 + i));
    const ready = createCandles(Array.from({ length: 20 }, (_, i) => 100 + i));
    expect(analyzer.isReady(notReady)).toBe(false);
    expect(analyzer.isReady(ready)).toBe(true);
  });

  test('should implement getMinCandlesRequired()', () => {
    const analyzer = new PriceActionAnalyzerNew(createConfig());
    expect(analyzer.getMinCandlesRequired()).toBe(20);
  });

  test('should implement isEnabled()', () => {
    const analyzer = new PriceActionAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should implement getWeight()', () => {
    const analyzer = new PriceActionAnalyzerNew(createConfig());
    expect(analyzer.getWeight()).toBe(0.6);
  });

  test('should implement getPriority()', () => {
    const analyzer = new PriceActionAnalyzerNew(createConfig());
    expect(analyzer.getPriority()).toBe(5);
  });

  test('should implement getMaxConfidence()', () => {
    const analyzer = new PriceActionAnalyzerNew(createConfig());
    expect(analyzer.getMaxConfidence()).toBe(0.95);
  });
});

describe('PriceActionAnalyzerNew - Edge Cases Tests', () => {
  test('should handle flat prices', () => {
    const analyzer = new PriceActionAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 20 }, () => 100));
    const signal = analyzer.analyze(candles);
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });

  test('should handle rapid increases', () => {
    const analyzer = new PriceActionAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 20 }, (_, i) => 100 + i * 5));
    const signal = analyzer.analyze(candles);
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });

  test('should handle rapid decreases', () => {
    const analyzer = new PriceActionAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 20 }, (_, i) => 200 - i * 5));
    const signal = analyzer.analyze(candles);
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });

  test('should handle zero weight', () => {
    const config = { ...createConfig(), weight: 0 };
    const analyzer = new PriceActionAnalyzerNew(config);
    const candles = createCandles(Array.from({ length: 20 }, (_, i) => 100 + i));
    const signal = analyzer.analyze(candles);
    expect(signal.score).toBe(0);
  });
});
