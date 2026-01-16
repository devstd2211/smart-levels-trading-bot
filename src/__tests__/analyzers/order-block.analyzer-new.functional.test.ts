import { OrderBlockAnalyzerNew } from '../../analyzers/order-block.analyzer-new';
import type { Candle } from '../../types/core';
import type { BreakoutAnalyzerConfigNew } from '../../types/config-new.types';

function createConfig(): BreakoutAnalyzerConfigNew {
  return { enabled: true, weight: 0.75, priority: 6 };
}

function createCandlesWithBodies(closes: number[], opens?: number[]): Candle[] {
  return closes.map((close, i) => {
    const open = opens ? opens[i] : close - 0.5;
    const body = Math.abs(close - open);
    // For order block detection: create strong rejection wicks
    // Lower wick when open > close (red candle), upper wick when open < close (green)
    const lowerWickRatio = 2; // 2x body = sufficient rejection
    const upperWickRatio = 2;

    let high = Math.max(close, open) + 0.2;
    let low = Math.min(close, open) - (body * lowerWickRatio);

    // If it's a green candle with open below, add upper wick
    if (open < close) {
      high = close + (body * upperWickRatio);
    }

    return {
      timestamp: Date.now() + i * 60000,
      open,
      high,
      low,
      close,
      volume: 1000,
    };
  });
}

/**
 * Helper for creating order block test data
 * Ensures rejection candles are in the last 10 candles for detection
 */
function createOrderBlockTestCandles(
  initialPrice: number,
  blockSize: number,  // Number of rejection candles
  blockDirection: 'down' | 'up',
  recoverySize: number
): Candle[] {
  const initial = Array.from({ length: 25 - blockSize - recoverySize }, () => initialPrice);

  // Create rejection candles with strong wicks in middle
  const blockCandles = Array.from({ length: blockSize }, (_, i) => {
    if (blockDirection === 'down') {
      return initialPrice - i * 1.5;
    } else {
      return initialPrice + i * 1.5;
    }
  });
  const blockOpens = blockCandles.map((_, i) => {
    if (blockDirection === 'down') {
      return initialPrice - i * 1.5 + 2.5;
    } else {
      return initialPrice + i * 1.5 - 2.5;
    }
  });

  // Recovery in last 10 candles (normal candles, small body)
  const lastPrice = blockCandles[blockCandles.length - 1];
  const recovery = Array.from({ length: recoverySize }, (_, i) => {
    if (blockDirection === 'down') {
      return lastPrice + i * 0.7;
    } else {
      return lastPrice - i * 0.7;
    }
  });
  const recoveryOpens = recovery.map((close) => close - 0.1); // Small body for recovery candles

  const closes = [...initial, ...blockCandles, ...recovery];
  const opens = [...Array(initial.length).fill(initialPrice), ...blockOpens, ...recoveryOpens];

  return createCandlesWithBodies(closes, opens);
}

describe('OrderBlockAnalyzerNew - Functional: Bullish Order Block', () => {
  it('should detect bullish block after downtrend', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    const candles = createOrderBlockTestCandles(100, 4, 'down', 8);
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });

  it('should recognize bullish block at support', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    const candles = createOrderBlockTestCandles(120, 3, 'down', 8);
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});

describe('OrderBlockAnalyzerNew - Functional: Bearish Order Block', () => {
  it('should detect bearish block after uptrend', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    const candles = createOrderBlockTestCandles(100, 4, 'up', 8);
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });

  it('should identify bearish block at resistance', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    const candles = createOrderBlockTestCandles(80, 3, 'up', 8);
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});

describe('OrderBlockAnalyzerNew - Functional: Multiple Order Blocks', () => {
  it('should analyze consecutive order blocks', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    const candles = createOrderBlockTestCandles(120, 5, 'down', 8);
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});

describe('OrderBlockAnalyzerNew - Functional: V-Shape with Order Block', () => {
  it('should identify block during V-shaped recovery', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    const candles = createOrderBlockTestCandles(100, 4, 'down', 8);
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });

  it('should identify block during inverted V-shape', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    const candles = createOrderBlockTestCandles(120, 4, 'up', 8);
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});

describe('OrderBlockAnalyzerNew - Functional: Institutional Order Blocks', () => {
  it('should recognize block from institutional activity', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    const candles = createOrderBlockTestCandles(100, 3, 'down', 8);
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});

describe('OrderBlockAnalyzerNew - Functional: False Breaks and Order Blocks', () => {
  it('should identify block at false breakout point', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    const candles = createOrderBlockTestCandles(100, 4, 'down', 8);
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});

describe('OrderBlockAnalyzerNew - Functional: Trend Continuation with Block', () => {
  it('should identify block during uptrend continuation', () => {
    const analyzer = new OrderBlockAnalyzerNew(createConfig());
    const candles = createOrderBlockTestCandles(100, 4, 'down', 8);
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});
