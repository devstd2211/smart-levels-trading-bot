/**
 * MTF Snapshot Gate - Functional Tests
 *
 * Tests the snapshot gate in realistic trading scenarios with real market patterns.
 * These tests verify that the snapshot gate works correctly with actual trading flows.
 */

import {
  MTFSnapshotGate,
  MTFSnapshot,
} from '../../services/mtf-snapshot-gate.service';
import { LoggerService } from '../../services/logger.service';
import { Signal, SignalDirection } from '../../types';
import { TrendBias, SignalType } from '../../types/enums';

// Mock logger
const mockLogger: LoggerService = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  setContext: jest.fn(),
} as any;

/**
 * Helper: Create realistic candles for a market pattern
 */
function createRealisticCandles(
  pattern: 'uptrend' | 'downtrend' | 'consolidation' | 'reversal_up' | 'reversal_down',
  basePrice: number,
  count: number = 20
): Array<{ open: number; high: number; low: number; close: number; volume: number; timestamp: number }> {
  const candles = [];
  let currentPrice = basePrice;

  for (let i = 0; i < count; i++) {
    const timestamp = Date.now() - (count - i) * 60000; // 1m candles

    let open, high, low, close, volatility;

    switch (pattern) {
      case 'uptrend':
        // Steady increase with small pullbacks
        volatility = basePrice * 0.005;
        open = currentPrice;
        close = currentPrice + basePrice * 0.01;
        high = close + volatility;
        low = open - volatility * 0.3;
        currentPrice = close;
        break;

      case 'downtrend':
        // Steady decrease with small bounces
        volatility = basePrice * 0.005;
        open = currentPrice;
        close = currentPrice - basePrice * 0.01;
        high = open + volatility * 0.3;
        low = close - volatility;
        currentPrice = close;
        break;

      case 'consolidation':
        // Price oscillating in range
        volatility = basePrice * 0.003;
        open = currentPrice + (Math.random() - 0.5) * volatility * 2;
        close = open + (Math.random() - 0.5) * volatility;
        high = Math.max(open, close) + volatility;
        low = Math.min(open, close) - volatility;
        currentPrice = close;
        break;

      case 'reversal_up':
        // Down for first half, then strong up
        if (i < count / 2) {
          open = currentPrice;
          close = currentPrice - basePrice * 0.005;
          high = open;
          low = close - basePrice * 0.002;
          currentPrice = close;
        } else {
          open = currentPrice;
          close = currentPrice + basePrice * 0.015;
          high = close + basePrice * 0.005;
          low = open;
          currentPrice = close;
        }
        break;

      case 'reversal_down':
        // Up for first half, then strong down
        if (i < count / 2) {
          open = currentPrice;
          close = currentPrice + basePrice * 0.005;
          high = close + basePrice * 0.002;
          low = open;
          currentPrice = close;
        } else {
          open = currentPrice;
          close = currentPrice - basePrice * 0.015;
          high = open;
          low = close - basePrice * 0.005;
          currentPrice = close;
        }
        break;

      default:
        throw new Error(`Unknown pattern: ${pattern}`);
    }

    candles.push({
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: 1000 + Math.random() * 500,
      timestamp,
    });
  }

  return candles;
}

describe('MTFSnapshotGate - Functional Tests', () => {
  let gate: MTFSnapshotGate;

  beforeEach(() => {
    jest.clearAllMocks();
    gate = new MTFSnapshotGate(mockLogger);
  });

  // ========================================================================
  // REALISTIC TRADING SCENARIOS
  // ========================================================================

  describe('Uptrend Market Scenario', () => {
    it('should allow LONG entries in consistent uptrend', () => {
      // Market condition: Uptrend with HH_HL pattern
      const candles = createRealisticCandles('uptrend', 10000, 20);
      const lastCandle = candles[candles.length - 1];

      // PRIMARY (5m) analysis
      const signal: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.TREND_FOLLOWING,
        confidence: 85,
        price: lastCandle.close,
        stopLoss: lastCandle.close * 0.985, // 1.5% below
        takeProfits: [
          {
            level: 1,
            percent: 1,
            sizePercent: 0.33,
            price: lastCandle.close * 1.02,
            hit: false,
          },
          {
            level: 2,
            percent: 2,
            sizePercent: 0.33,
            price: lastCandle.close * 1.04,
            hit: false,
          },
        ],
        reason: 'HH_HL pattern detected, price above EMA',
        timestamp: Date.now(),
      };

      // Create snapshot in BULLISH uptrend
      const snapshot = gate.createSnapshot(TrendBias.BULLISH, {
        bias: TrendBias.BULLISH,
        strength: 0.9, // Strong uptrend
        timeframe: '4h',
        reasoning: ['HH_HL pattern', 'Price above 50 EMA', 'RSI > 60'],
        restrictedDirections: [SignalDirection.SHORT],
      } as any, signal, lastCandle);

      expect(snapshot).toBeDefined();
      expect(snapshot.htfBias).toBe(TrendBias.BULLISH);
      expect(snapshot.signal.direction).toBe(SignalDirection.LONG);

      // ENTRY (1m) phase - validate same bullish bias
      const result = gate.validateSnapshot(TrendBias.BULLISH);

      expect(result.valid).toBe(true);
      expect(result.reason).toContain('consistent');
    });

    it('should prevent LONG entries if uptrend reverses to downtrend', () => {
      const candles = createRealisticCandles('uptrend', 10000, 20);
      const lastCandle = candles[candles.length - 1];

      const signal: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.TREND_FOLLOWING,
        confidence: 85,
        price: lastCandle.close,
        stopLoss: lastCandle.close * 0.985,
        takeProfits: [],
        reason: 'Uptrend pattern',
        timestamp: Date.now(),
      };

      // Snapshot created in uptrend
      gate.createSnapshot(TrendBias.BULLISH, {
        bias: TrendBias.BULLISH,
        strength: 0.9,
        timeframe: '4h',
        reasoning: ['HH_HL', 'Uptrend'],
        restrictedDirections: [],
      } as any, signal, lastCandle);

      // But market reversed to downtrend (4h flipped)
      const result = gate.validateSnapshot(TrendBias.BEARISH);

      expect(result.valid).toBe(false);
      expect(result.biasMismatch).toBe(true);
      expect(result.reason).toContain('reversed');
    });
  });

  describe('Downtrend Market Scenario', () => {
    it('should allow SHORT entries in consistent downtrend', () => {
      const candles = createRealisticCandles('downtrend', 10000, 20);
      const lastCandle = candles[candles.length - 1];

      const signal: Signal = {
        direction: SignalDirection.SHORT,
        type: SignalType.TREND_FOLLOWING,
        confidence: 90,
        price: lastCandle.close,
        stopLoss: lastCandle.close * 1.015, // 1.5% above
        takeProfits: [
          {
            level: 1,
            percent: 1,
            sizePercent: 0.33,
            price: lastCandle.close * 0.98,
            hit: false,
          },
        ],
        reason: 'LH_LL pattern, price below EMA',
        timestamp: Date.now(),
      };

      const snapshot = gate.createSnapshot(TrendBias.BEARISH, {
        bias: TrendBias.BEARISH,
        strength: 0.85,
        timeframe: '4h',
        reasoning: ['LH_LL pattern', 'Price below 50 EMA', 'RSI < 40'],
        restrictedDirections: [SignalDirection.LONG],
      } as any, signal, lastCandle);

      expect(snapshot).toBeDefined();

      const result = gate.validateSnapshot(TrendBias.BEARISH);

      expect(result.valid).toBe(true);
    });

    it('should prevent SHORT entries if downtrend reverses to uptrend', () => {
      const candles = createRealisticCandles('downtrend', 10000, 20);
      const lastCandle = candles[candles.length - 1];

      const signal: Signal = {
        direction: SignalDirection.SHORT,
        type: SignalType.TREND_FOLLOWING,
        confidence: 85,
        price: lastCandle.close,
        stopLoss: lastCandle.close * 1.015,
        takeProfits: [],
        reason: 'Downtrend pattern',
        timestamp: Date.now(),
      };

      // Snapshot in downtrend
      gate.createSnapshot(TrendBias.BEARISH, {
        bias: TrendBias.BEARISH,
        strength: 0.85,
        timeframe: '4h',
        reasoning: ['LH_LL', 'Downtrend'],
        restrictedDirections: [],
      } as any, signal, lastCandle);

      // Market reversed (4h flipped to bullish)
      const result = gate.validateSnapshot(TrendBias.BULLISH);

      expect(result.valid).toBe(false);
      expect(result.biasMismatch).toBe(true);
    });
  });

  describe('Consolidation/Range Scenario', () => {
    it('should allow both LONG and SHORT in consolidation', () => {
      const candles = createRealisticCandles('consolidation', 10000, 20);
      const lastCandle = candles[candles.length - 1];

      // LONG signal in consolidation
      const longSignal: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.REVERSAL,
        confidence: 75,
        price: lastCandle.close,
        stopLoss: lastCandle.close * 0.97,
        takeProfits: [],
        reason: 'Support bounce in range',
        timestamp: Date.now(),
      };

      gate.createSnapshot(TrendBias.NEUTRAL, {
        bias: TrendBias.NEUTRAL,
        strength: 0.5,
        timeframe: '4h',
        reasoning: ['Price in range 9950-10050', 'No clear direction'],
        restrictedDirections: [],
      } as any, longSignal, lastCandle);

      let result = gate.validateSnapshot(TrendBias.NEUTRAL);
      expect(result.valid).toBe(true);

      // SHORT signal also valid in consolidation
      const shortSignal: Signal = {
        direction: SignalDirection.SHORT,
        type: SignalType.REVERSAL,
        confidence: 75,
        price: lastCandle.close,
        stopLoss: lastCandle.close * 1.03,
        takeProfits: [],
        reason: 'Resistance bounce in range',
        timestamp: Date.now(),
      };

      gate.createSnapshot(TrendBias.NEUTRAL, {
        bias: TrendBias.NEUTRAL,
        strength: 0.5,
        timeframe: '4h',
        reasoning: ['Price in range 9950-10050'],
        restrictedDirections: [],
      } as any, shortSignal, lastCandle);

      result = gate.validateSnapshot(TrendBias.NEUTRAL);
      expect(result.valid).toBe(true);
    });
  });

  describe('Reversal Scenarios', () => {
    it('should handle V-shape reversal (down to up) correctly', () => {
      const candles = createRealisticCandles('reversal_up', 10000, 30);
      const lastCandle = candles[candles.length - 1];

      // At reversal point: primary still bearish, but reversal signal detected
      const signal: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.REVERSAL,
        confidence: 80,
        price: lastCandle.close,
        stopLoss: Math.min(...candles.slice(-10).map(c => c.low)),
        takeProfits: [],
        reason: 'V-shape reversal detected',
        timestamp: Date.now(),
      };

      // At PRIMARY close: still in downtrend but reversal pattern detected
      gate.createSnapshot(TrendBias.BEARISH, {
        bias: TrendBias.BEARISH,
        strength: 0.4, // Weakening bearish
        timeframe: '4h',
        reasoning: ['V-shape forming', 'Support holding'],
        restrictedDirections: [],
      } as any, signal, lastCandle);

      // If HTF flips to BULLISH by ENTRY time, entry should be allowed
      const result = gate.validateSnapshot(TrendBias.BULLISH);
      expect(result.valid).toBe(true);

      // If HTF stays BEARISH, entry should be blocked (conservative)
      const resultBearish = gate.validateSnapshot(TrendBias.BEARISH);
      expect(resultBearish.valid).toBe(false); // LONG + BEARISH is incompatible
    });

    it('should handle inverted head-and-shoulders (bottoming pattern)', () => {
      // Simulate: Down, slight up, down again, then strong up
      const downCandles = createRealisticCandles('downtrend', 10000, 8);
      const upCandles = createRealisticCandles('uptrend', downCandles[downCandles.length - 1].close, 8);
      const allCandles = [...downCandles, ...upCandles];

      const lastCandle = allCandles[allCandles.length - 1];

      const signal: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.REVERSAL,
        confidence: 88,
        price: lastCandle.close,
        stopLoss: Math.min(...allCandles.slice(-15).map(c => c.low)),
        takeProfits: [],
        reason: 'Inverted H&S pattern - breakout above neckline',
        timestamp: Date.now(),
      };

      // Snapshot at bottom pattern (still bearish HTF)
      gate.createSnapshot(TrendBias.BEARISH, {
        bias: TrendBias.BEARISH,
        strength: 0.3, // Very weak
        timeframe: '4h',
        reasoning: ['H&S bottoming pattern', 'Support confirmed'],
        restrictedDirections: [],
      } as any, signal, lastCandle);

      // By ENTRY: HTF flipped to BULLISH
      const result = gate.validateSnapshot(TrendBias.BULLISH);
      expect(result.valid).toBe(true);
    });
  });

  describe('Risk Management with Snapshots', () => {
    it('should preserve risk parameters in snapshot', () => {
      const signal: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.TREND_FOLLOWING,
        confidence: 85,
        price: 10000,
        stopLoss: 9850,
        takeProfits: [
          { level: 1, percent: 1, sizePercent: 0.5, price: 10200, hit: false },
          { level: 2, percent: 2, sizePercent: 0.5, price: 10400, hit: false },
        ],
        reason: 'Test',
        timestamp: Date.now(),
      };

      const candle = { open: 10000, high: 10010, low: 9990, close: 10005, volume: 1000, timestamp: Date.now() };

      const snapshot = gate.createSnapshot(TrendBias.BULLISH, {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        timeframe: '4h',
        reasoning: [],
        restrictedDirections: [],
      } as any, signal, candle, 10000, {
        maxRiskPercent: 2,
        maxPositionSize: 5000,
        minSignals: 3,
      });

      expect(snapshot.maxRiskPercent).toBe(2);
      expect(snapshot.maxPositionSize).toBe(5000);
      expect(snapshot.minSignals).toBe(3);
      expect(snapshot.accountBalance).toBe(10000);
    });
  });

  describe('Real-World Edge Cases', () => {
    it('should handle multiple snapshots (sequential entries)', () => {
      const candles1 = createRealisticCandles('uptrend', 10000, 15);
      const candles2 = createRealisticCandles('uptrend', 10300, 15);

      // First entry
      const signal1: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.TREND_FOLLOWING,
        confidence: 80,
        price: candles1[candles1.length - 1].close,
        stopLoss: 9950,
        takeProfits: [],
        reason: 'First signal',
        timestamp: Date.now(),
      };

      gate.createSnapshot(TrendBias.BULLISH, {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        timeframe: '4h',
        reasoning: ['Uptrend 1'],
        restrictedDirections: [],
      } as any, signal1, candles1[candles1.length - 1]);

      // Validate and clear
      expect(gate.validateSnapshot(TrendBias.BULLISH).valid).toBe(true);
      gate.clearActiveSnapshot();

      // Second entry (different snapshot)
      const signal2: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.TREND_FOLLOWING,
        confidence: 85,
        price: candles2[candles2.length - 1].close,
        stopLoss: 10250,
        takeProfits: [],
        reason: 'Second signal',
        timestamp: Date.now(),
      };

      gate.createSnapshot(TrendBias.BULLISH, {
        bias: TrendBias.BULLISH,
        strength: 0.85,
        timeframe: '4h',
        reasoning: ['Uptrend 2'],
        restrictedDirections: [],
      } as any, signal2, candles2[candles2.length - 1]);

      expect(gate.validateSnapshot(TrendBias.BULLISH).valid).toBe(true);
    });

    it('should handle rapid HTF bias changes', () => {
      const signal: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.TREND_FOLLOWING,
        confidence: 80,
        price: 10000,
        stopLoss: 9900,
        takeProfits: [],
        reason: 'Test',
        timestamp: Date.now(),
      };

      const candle = { open: 10000, high: 10010, low: 9990, close: 10005, volume: 1000, timestamp: Date.now() };

      // Initial snapshot: BULLISH
      gate.createSnapshot(TrendBias.BULLISH, {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        timeframe: '4h',
        reasoning: [],
        restrictedDirections: [],
      } as any, signal, candle);

      // T1: Validate BULLISH (should pass)
      let result = gate.validateSnapshot(TrendBias.BULLISH);
      expect(result.valid).toBe(true);

      // T2: HTF flips to NEUTRAL (should pass - NEUTRAL allows LONG)
      result = gate.validateSnapshot(TrendBias.NEUTRAL);
      expect(result.valid).toBe(true);

      // T3: HTF flips to BEARISH (should fail)
      result = gate.validateSnapshot(TrendBias.BEARISH);
      expect(result.valid).toBe(false);
      expect(result.biasMismatch).toBe(true);
    });
  });

  describe('Logging Behavior', () => {
    it('should log snapshot creation with proper details', () => {
      const signal: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.TREND_FOLLOWING,
        confidence: 85,
        price: 10000,
        stopLoss: 9900,
        takeProfits: [],
        reason: 'Test signal',
        timestamp: Date.now(),
      };

      const candle = { open: 10000, high: 10010, low: 9990, close: 10005, volume: 1000, timestamp: Date.now() };

      gate.createSnapshot(TrendBias.BULLISH, {
        bias: TrendBias.BULLISH,
        strength: 0.85,
        timeframe: '4h',
        reasoning: ['HH_HL'],
        restrictedDirections: [],
      } as any, signal, candle);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('[MTF-SNAPSHOT] Created snapshot')
      );
    });

    it('should log validation results', () => {
      const signal: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.TREND_FOLLOWING,
        confidence: 80,
        price: 10000,
        stopLoss: 9900,
        takeProfits: [],
        reason: 'Test',
        timestamp: Date.now(),
      };

      const candle = { open: 10000, high: 10010, low: 9990, close: 10005, volume: 1000, timestamp: Date.now() };

      gate.createSnapshot(TrendBias.BULLISH, {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        timeframe: '4h',
        reasoning: [],
        restrictedDirections: [],
      } as any, signal, candle);

      jest.clearAllMocks();

      // Valid validation
      gate.validateSnapshot(TrendBias.BULLISH);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('[MTF-SNAPSHOT] Snapshot valid')
      );

      jest.clearAllMocks();

      // Invalid validation
      gate.validateSnapshot(TrendBias.BEARISH);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[MTF-SNAPSHOT] Bias mismatch')
      );
    });
  });
});
