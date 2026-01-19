import { OrderFlowAnalyzerNew } from '../../analyzers/order-flow.analyzer-new';
import type { Candle } from '../../types/core';
import type { BreakoutAnalyzerConfigNew } from '../../types/config-new.types';
import { AnalyzerType } from '../../types/analyzer-type.enum';

function createConfig(): BreakoutAnalyzerConfigNew {
  return { enabled: true, weight: 0.7, priority: 6 };
}

function createCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    timestamp: Date.now() + i * 60000,
    open: close - 0.3,
    high: close + 1.5,
    low: close - 1.5,
    close,
    volume: 8000 + Math.random() * 4000,
  }));
}

describe('OrderFlowAnalyzerNew - Configuration Tests', () => {
  test('should create with valid config', () => {
    const analyzer = new OrderFlowAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should throw on missing enabled', () => {
    const config = { ...createConfig() };
    delete (config as any).enabled;
    expect(() => new OrderFlowAnalyzerNew(config as any)).toThrow();
  });
});

describe('OrderFlowAnalyzerNew - Input Validation Tests', () => {
  test('should throw when disabled', () => {
    const analyzer = new OrderFlowAnalyzerNew({ ...createConfig(), enabled: false });
    const candles = createCandles(Array.from({ length: 40 }, (_, i) => 100 + i));
    expect(() => analyzer.analyze(candles)).toThrow();
  });

  test('should handle various candle counts', () => {
    const analyzer = new OrderFlowAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 40 }, (_, i) => 100 + i));
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
  });

  test('should throw on invalid input', () => {
    const analyzer = new OrderFlowAnalyzerNew(createConfig());
    expect(() => analyzer.analyze(null as any)).toThrow();
  });
});

describe('OrderFlowAnalyzerNew - Signal Generation Tests', () => {
  test('should generate signal', () => {
    const analyzer = new OrderFlowAnalyzerNew(createConfig());
    const candles = createCandles(Array.from({ length: 40 }, (_, i) => 100 + i * 0.4));
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.source).toBe('ORDER_FLOW_ANALYZER');
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});

describe('OrderFlowAnalyzerNew - IAnalyzer Interface Tests', () => {
  test('should implement getType()', () => {
    const analyzer = new OrderFlowAnalyzerNew(createConfig());
    expect(analyzer.getType()).toBe(AnalyzerType.ORDER_FLOW);
  });

  test('should implement isReady()', () => {
    const analyzer = new OrderFlowAnalyzerNew(createConfig());
    const ready = createCandles(Array.from({ length: 40 }, (_, i) => 100 + i));
    expect(analyzer.isReady(ready)).toBe(true);
  });

  test('should implement getMinCandlesRequired()', () => {
    const analyzer = new OrderFlowAnalyzerNew(createConfig());
    const min = analyzer.getMinCandlesRequired();
    expect(min).toBeGreaterThan(0);
    expect(min).toBeLessThanOrEqual(100);
  });

  test('should implement isEnabled()', () => {
    const analyzer = new OrderFlowAnalyzerNew(createConfig());
    expect(analyzer.isEnabled()).toBe(true);
  });

  test('should implement getWeight()', () => {
    const analyzer = new OrderFlowAnalyzerNew(createConfig());
    expect(analyzer.getWeight()).toBe(0.7);
  });

  test('should implement getPriority()', () => {
    const analyzer = new OrderFlowAnalyzerNew(createConfig());
    expect(analyzer.getPriority()).toBe(6);
  });

  test('should implement getMaxConfidence()', () => {
    const analyzer = new OrderFlowAnalyzerNew(createConfig());
    expect(analyzer.getMaxConfidence()).toBe(0.95);
  });
});
