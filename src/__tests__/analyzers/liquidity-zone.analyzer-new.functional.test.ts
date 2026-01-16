import { LiquidityZoneAnalyzerNew } from '../../analyzers/liquidity-zone.analyzer-new';
import type { Candle } from '../../types/core';
import type { BreakoutAnalyzerConfigNew } from '../../types/config-new.types';

function createConfig(): BreakoutAnalyzerConfigNew {
  return { enabled: true, weight: 0.7, priority: 5 };
}

function createCandlesWithVolume(closes: number[], volumes: number[]): Candle[] {
  return closes.map((close, i) => ({
    timestamp: Date.now() + i * 60000,
    open: close - 0.1,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: volumes[i] || 1000,
  }));
}

describe('LiquidityZoneAnalyzerNew - Functional: Consolidation with High Volume', () => {
  it('should detect liquidity zone during consolidation', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    // Consolidation with varying volume - ensure high volumes in last 30 candles
    const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i * 0.3) * 1);
    // Very high volume during consolidation (last 20 bars with 5000 volume)
    const volumes = closes.map((_, i) => {
      if (i >= 20) return 5000; // High volume in last 20 bars (within last 30)
      return 500; // Normal volume
    });
    const candles = createCandlesWithVolume(closes, volumes);
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});

describe('LiquidityZoneAnalyzerNew - Functional: Accumulation Phase', () => {
  it('should detect accumulation zone with volume clusters', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    // Price consolidating while volume builds
    const closes = Array.from({ length: 35 }, () => 100);
    // Progressive volume increase - strong in last 30 candles
    const volumes = closes.map((_, i) => {
      if (i >= 5) return 2000 + i * 150; // Strong volume build
      return 500;
    });
    const candles = createCandlesWithVolume(closes, volumes);
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});

describe('LiquidityZoneAnalyzerNew - Functional: Distribution Phase', () => {
  it('should identify zone during distribution', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    // Uptrend with volume that increases at top
    const closes = Array.from({ length: 35 }, (_, i) => 100 + i * 0.4);
    // High volume at the top (last 15 bars)
    const volumes = closes.map((_, i) => {
      if (i >= 20) return 4000;
      return 1000;
    });
    const candles = createCandlesWithVolume(closes, volumes);
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});

describe('LiquidityZoneAnalyzerNew - Functional: Uptrend with Volume Confirmation', () => {
  it('should detect liquidity during strong uptrend', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    // Strong uptrend with confirmation volume
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i * 0.8);
    // Strong volume on all bars in last 30
    const volumes = closes.map((_, i) => {
      if (i >= 10) return 3500; // High volume in last 30 bars
      return 500;
    });
    const candles = createCandlesWithVolume(closes, volumes);
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});

describe('LiquidityZoneAnalyzerNew - Functional: Downtrend with Volume', () => {
  it('should detect liquidity during downtrend', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    // Strong downtrend with volume
    const closes = Array.from({ length: 40 }, (_, i) => 150 - i * 0.8);
    // Strong volume in last 30 bars
    const volumes = closes.map((_, i) => {
      if (i >= 10) return 3500; // High volume in last 30 bars
      return 500;
    });
    const candles = createCandlesWithVolume(closes, volumes);
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});

describe('LiquidityZoneAnalyzerNew - Functional: Reversal with Volume Spike', () => {
  it('should detect zone at reversal point', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    // Downtrend then reversal with volume spike
    const down = Array.from({ length: 15 }, (_, i) => 150 - i * 1.2);
    const reversal = Array.from({ length: 25 }, (_, i) => 132 + i * 0.8);
    const closes = [...down, ...reversal];
    // Strong volume in last 30 candles
    const volumes = closes.map((_, i) => {
      if (i >= 10) return 4000; // High volume in last 30 bars
      return 500;
    });
    const candles = createCandlesWithVolume(closes, volumes);
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});

describe('LiquidityZoneAnalyzerNew - Functional: Gap with Volume', () => {
  it('should identify liquidity zone after gap up', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    // Consolidation, gap up, then more consolidation with strong volume
    const closes = Array.from({ length: 40 }, (_, i) => {
      if (i < 5) return 100;
      if (i < 15) return 110 + (i - 5) * 0.2;
      return 112 + (i - 15) * 0.1;
    });
    // Strong volume in last 30 bars
    const volumes = closes.map((_, i) => {
      if (i >= 10) return 3500;
      return 500;
    });
    const candles = createCandlesWithVolume(closes, volumes);
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});

describe('LiquidityZoneAnalyzerNew - Functional: Volume Profile', () => {
  it('should detect balanced liquidity distribution', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    // Balanced price action with strong volume
    const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i * 0.25) * 2);
    // Consistent high volume
    const volumes = closes.map((_, i) => {
      if (i >= 10) return 3000; // High volume in last 30
      return 500;
    });
    const candles = createCandlesWithVolume(closes, volumes);
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});

describe('LiquidityZoneAnalyzerNew - Functional: Support Level with Volume', () => {
  it('should recognize support zone with volume bounce', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    // Strong downtrend to support
    const down = Array.from({ length: 12 }, (_, i) => 150 - i * 2);
    // Bounce from support with volume
    const bounce = Array.from({ length: 23 }, (_, i) => 126 + i * 0.5);
    const closes = [...down, ...bounce];
    // High volume at support bounce
    const volumes = closes.map((_, i) => {
      if (i >= 11 && i <= 20) return 4000;
      return 1000;
    });
    const candles = createCandlesWithVolume(closes, volumes);
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});

describe('LiquidityZoneAnalyzerNew - Functional: Resistance Rejection', () => {
  it('should identify resistance zone with volume', () => {
    const analyzer = new LiquidityZoneAnalyzerNew(createConfig());
    // Uptrend to resistance
    const up = Array.from({ length: 12 }, (_, i) => 100 + i * 1.5);
    // Rejection at resistance
    const rejection = Array.from({ length: 23 }, (_, i) => 118 - i * 0.5);
    const closes = [...up, ...rejection];
    // High volume at resistance
    const volumes = closes.map((_, i) => {
      if (i >= 11 && i <= 22) return 4500;
      return 1000;
    });
    const candles = createCandlesWithVolume(closes, volumes);
    const signal = analyzer.analyze(candles);
    expect(signal).toBeDefined();
    expect(signal.confidence).toBeGreaterThanOrEqual(10);
  });
});
