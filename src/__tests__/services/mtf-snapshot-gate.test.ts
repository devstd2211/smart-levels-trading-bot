/**
 * MTF Snapshot Gate Tests
 *
 * Tests for the snapshot system that prevents race conditions between
 * HTF bias changes and ENTRY timeframe execution.
 */

import {
  MTFSnapshotGate,
  MTFSnapshot,
  SnapshotValidationResult,
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

describe('MTFSnapshotGate', () => {
  let gate: MTFSnapshotGate;

  beforeEach(() => {
    jest.clearAllMocks();
    gate = new MTFSnapshotGate(mockLogger);
  });

  // ========================================================================
  // SNAPSHOT CREATION TESTS
  // ========================================================================

  describe('createSnapshot', () => {
    it('should create a snapshot with all required fields', () => {
      const signal: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.TREND_FOLLOWING,
        confidence: 85,
        price: 1000,
        stopLoss: 990,
        takeProfits: [],
        reason: 'Test signal',
        timestamp: Date.now(),
      };

      const candle = {
        open: 1000,
        high: 1010,
        low: 995,
        close: 1005,
        volume: 1000,
        timestamp: Date.now(),
      };

      const snapshot = gate.createSnapshot(TrendBias.BULLISH, {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        timeframe: '4h',
        reasoning: ['HH_HL pattern'],
        restrictedDirections: [],
      } as any, signal, candle);

      expect(snapshot).toBeDefined();
      expect(snapshot.htfBias).toBe(TrendBias.BULLISH);
      expect(snapshot.signal.direction).toBe(SignalDirection.LONG);
      expect(snapshot.expiresAt).toBeGreaterThan(Date.now());
      expect(snapshot.id).toMatch(/^snap_/);
    });

    it('should set expiration time to 60 seconds', () => {
      const signal: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.TREND_FOLLOWING,
        confidence: 80,
        price: 1000,
        stopLoss: 990,
        takeProfits: [],
        reason: 'Test',
        timestamp: Date.now(),
      };

      const candle = { open: 1000, high: 1010, low: 990, close: 1005, volume: 1000, timestamp: Date.now() };

      const snapshot = gate.createSnapshot(TrendBias.BULLISH, {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        timeframe: '4h',
        reasoning: [],
        restrictedDirections: [],
      } as any, signal, candle);

      const expirationTime = snapshot.expiresAt - snapshot.timestamp;
      expect(expirationTime).toBe(120000); // 120 seconds (increased from 60s to prevent race conditions)
    });

    it('should store and retrieve active snapshot', () => {
      const signal: Signal = {
        direction: SignalDirection.SHORT,
        type: SignalType.TREND_FOLLOWING,
        confidence: 90,
        price: 2000,
        stopLoss: 2050,
        takeProfits: [],
        reason: 'Test',
        timestamp: Date.now(),
      };

      const candle = { open: 2000, high: 2010, low: 1990, close: 1995, volume: 1000, timestamp: Date.now() };

      const snapshot = gate.createSnapshot(TrendBias.BEARISH, {
        bias: TrendBias.BEARISH,
        strength: 0.9,
        timeframe: '4h',
        reasoning: ['LH_LL'],
        restrictedDirections: [],
      } as any, signal, candle);

      const retrieved = gate.getActiveSnapshot();
      expect(retrieved).toEqual(snapshot);
      expect(retrieved?.id).toBe(snapshot.id);
    });
  });

  // ========================================================================
  // SNAPSHOT VALIDATION TESTS
  // ========================================================================

  describe('validateSnapshot', () => {
    it('should return valid when HTF bias is consistent with signal', () => {
      const signal: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.TREND_FOLLOWING,
        confidence: 80,
        price: 1000,
        stopLoss: 990,
        takeProfits: [],
        reason: 'Test',
        timestamp: Date.now(),
      };

      const candle = { open: 1000, high: 1010, low: 990, close: 1005, volume: 1000, timestamp: Date.now() };

      // Create snapshot with BULLISH bias and LONG signal
      gate.createSnapshot(TrendBias.BULLISH, {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        timeframe: '4h',
        reasoning: [],
        restrictedDirections: [],
      } as any, signal, candle);

      // Validate with same BULLISH bias
      const result = gate.validateSnapshot(TrendBias.BULLISH);

      expect(result.valid).toBe(true);
      expect(result.biasMismatch).toBe(false);
      expect(result.expired).toBe(false);
    });

    it('should detect bias mismatch when bias reverses to opposite direction', () => {
      const signal: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.TREND_FOLLOWING,
        confidence: 80,
        price: 1000,
        stopLoss: 990,
        takeProfits: [],
        reason: 'Test',
        timestamp: Date.now(),
      };

      const candle = { open: 1000, high: 1010, low: 990, close: 1005, volume: 1000, timestamp: Date.now() };

      // Create snapshot with BULLISH bias and LONG signal
      gate.createSnapshot(TrendBias.BULLISH, {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        timeframe: '4h',
        reasoning: [],
        restrictedDirections: [],
      } as any, signal, candle);

      // Validate with reversed BEARISH bias
      const result = gate.validateSnapshot(TrendBias.BEARISH);

      expect(result.valid).toBe(false);
      expect(result.biasMismatch).toBe(true);
      expect(result.conflictingDirections).toEqual({
        signal: SignalDirection.LONG,
        currentBias: TrendBias.BEARISH,
      });
    });

    it('should allow SHORT signal with BEARISH bias', () => {
      const signal: Signal = {
        direction: SignalDirection.SHORT,
        type: SignalType.TREND_FOLLOWING,
        confidence: 85,
        price: 2000,
        stopLoss: 2050,
        takeProfits: [],
        reason: 'Test',
        timestamp: Date.now(),
      };

      const candle = { open: 2000, high: 2010, low: 1990, close: 1995, volume: 1000, timestamp: Date.now() };

      // Create snapshot with BEARISH bias and SHORT signal
      gate.createSnapshot(TrendBias.BEARISH, {
        bias: TrendBias.BEARISH,
        strength: 0.9,
        timeframe: '4h',
        reasoning: [],
        restrictedDirections: [],
      } as any, signal, candle);

      // Validate with same BEARISH bias
      const result = gate.validateSnapshot(TrendBias.BEARISH);

      expect(result.valid).toBe(true);
      expect(result.biasMismatch).toBe(false);
    });

    it('should allow both signal directions with NEUTRAL bias', () => {
      // Test LONG with NEUTRAL
      const longSignal: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.TREND_FOLLOWING,
        confidence: 80,
        price: 1000,
        stopLoss: 990,
        takeProfits: [],
        reason: 'Test',
        timestamp: Date.now(),
      };

      const candle = { open: 1000, high: 1010, low: 990, close: 1005, volume: 1000, timestamp: Date.now() };

      gate.createSnapshot(TrendBias.NEUTRAL, {
        bias: TrendBias.NEUTRAL,
        strength: 0.5,
        timeframe: '4h',
        reasoning: [],
        restrictedDirections: [],
      } as any, longSignal, candle);

      let result = gate.validateSnapshot(TrendBias.NEUTRAL);
      expect(result.valid).toBe(true);

      // Test SHORT with NEUTRAL
      const shortSignal: Signal = {
        direction: SignalDirection.SHORT,
        type: SignalType.TREND_FOLLOWING,
        confidence: 80,
        price: 1000,
        stopLoss: 1050,
        takeProfits: [],
        reason: 'Test',
        timestamp: Date.now(),
      };

      gate.createSnapshot(TrendBias.NEUTRAL, {
        bias: TrendBias.NEUTRAL,
        strength: 0.5,
        timeframe: '4h',
        reasoning: [],
        restrictedDirections: [],
      } as any, shortSignal, candle);

      result = gate.validateSnapshot(TrendBias.NEUTRAL);
      expect(result.valid).toBe(true);
    });

    it('should return error when no active snapshot', () => {
      // Don't create any snapshot
      const result = gate.validateSnapshot(TrendBias.BULLISH);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('No active snapshot');
    });

    it('should detect expired snapshots', (done) => {
      jest.useFakeTimers();

      const signal: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.TREND_FOLLOWING,
        confidence: 80,
        price: 1000,
        stopLoss: 990,
        takeProfits: [],
        reason: 'Test',
        timestamp: Date.now(),
      };

      const candle = { open: 1000, high: 1010, low: 990, close: 1005, volume: 1000, timestamp: Date.now() };

      gate.createSnapshot(TrendBias.BULLISH, {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        timeframe: '4h',
        reasoning: [],
        restrictedDirections: [],
      } as any, signal, candle);

      // Advance time by 121 seconds (past expiration of 120 seconds)
      jest.advanceTimersByTime(121000);

      const result = gate.validateSnapshot(TrendBias.BULLISH);

      expect(result.valid).toBe(false);
      expect(result.expired).toBe(true);
      expect(result.reason).toContain('expired');

      jest.useRealTimers();
      done();
    });
  });

  // ========================================================================
  // SNAPSHOT CLEARING TESTS
  // ========================================================================

  describe('clearActiveSnapshot', () => {
    it('should clear active snapshot', () => {
      const signal: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.TREND_FOLLOWING,
        confidence: 80,
        price: 1000,
        stopLoss: 990,
        takeProfits: [],
        reason: 'Test',
        timestamp: Date.now(),
      };

      const candle = { open: 1000, high: 1010, low: 990, close: 1005, volume: 1000, timestamp: Date.now() };

      gate.createSnapshot(TrendBias.BULLISH, {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        timeframe: '4h',
        reasoning: [],
        restrictedDirections: [],
      } as any, signal, candle);

      expect(gate.getActiveSnapshot()).toBeDefined();

      gate.clearActiveSnapshot();

      expect(gate.getActiveSnapshot()).toBeNull();
    });

    it('should handle clearing when no active snapshot', () => {
      expect(() => gate.clearActiveSnapshot()).not.toThrow();
      expect(gate.getActiveSnapshot()).toBeNull();
    });
  });

  // ========================================================================
  // DEBUG/MONITORING TESTS
  // ========================================================================

  describe('getSnapshotCount', () => {
    it('should return correct snapshot count', () => {
      const signal: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.TREND_FOLLOWING,
        confidence: 80,
        price: 1000,
        stopLoss: 990,
        takeProfits: [],
        reason: 'Test',
        timestamp: Date.now(),
      };

      const candle = { open: 1000, high: 1010, low: 990, close: 1005, volume: 1000, timestamp: Date.now() };

      expect(gate.getSnapshotCount()).toBe(0);

      gate.createSnapshot(TrendBias.BULLISH, {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        timeframe: '4h',
        reasoning: [],
        restrictedDirections: [],
      } as any, signal, candle);

      expect(gate.getSnapshotCount()).toBe(1);

      gate.clearActiveSnapshot();

      expect(gate.getSnapshotCount()).toBe(0);
    });
  });

  describe('getSnapshotDebugInfo', () => {
    it('should return debug info for active snapshot', () => {
      const signal: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.TREND_FOLLOWING,
        confidence: 80,
        price: 1000,
        stopLoss: 990,
        takeProfits: [],
        reason: 'Test',
        timestamp: Date.now(),
      };

      const candle = { open: 1000, high: 1010, low: 990, close: 1005, volume: 1000, timestamp: Date.now() };

      gate.createSnapshot(TrendBias.BULLISH, {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        timeframe: '4h',
        reasoning: [],
        restrictedDirections: [],
      } as any, signal, candle);

      const info = gate.getSnapshotDebugInfo();

      expect(info).toBeDefined();
      expect(info?.id).toBeDefined();
      expect(info?.age).toBeGreaterThanOrEqual(0);
      expect(info?.expiresIn).toBeGreaterThan(0);
    });

    it('should return null when no active snapshot', () => {
      const info = gate.getSnapshotDebugInfo();
      expect(info).toBeNull();
    });
  });

  // ========================================================================
  // RACE CONDITION SCENARIO TESTS
  // ========================================================================

  describe('Race condition scenarios', () => {
    it('should prevent LONG entry when HTF bias flips from BULLISH to BEARISH', () => {
      // T1: PRIMARY closes with BULLISH bias, LONG signal
      const longSignal: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.TREND_FOLLOWING,
        confidence: 85,
        price: 1000,
        stopLoss: 990,
        takeProfits: [],
        reason: 'Bullish pattern',
        timestamp: Date.now(),
      };

      const candle = { open: 1000, high: 1010, low: 990, close: 1005, volume: 1000, timestamp: Date.now() };

      gate.createSnapshot(TrendBias.BULLISH, {
        bias: TrendBias.BULLISH,
        strength: 0.85,
        timeframe: '4h',
        reasoning: ['HH_HL'],
        restrictedDirections: [],
      } as any, longSignal, candle);

      // T2: HTF updates - bias flips to BEARISH (race condition!)
      const result = gate.validateSnapshot(TrendBias.BEARISH);

      // T3: ENTRY should SKIP (snapshot validation fails)
      expect(result.valid).toBe(false);
      expect(result.biasMismatch).toBe(true);
      expect(result.conflictingDirections?.signal).toBe(SignalDirection.LONG);
      expect(result.conflictingDirections?.currentBias).toBe(TrendBias.BEARISH);
    });

    it('should prevent SHORT entry when HTF bias flips from BEARISH to BULLISH', () => {
      // T1: PRIMARY closes with BEARISH bias, SHORT signal
      const shortSignal: Signal = {
        direction: SignalDirection.SHORT,
        type: SignalType.TREND_FOLLOWING,
        confidence: 90,
        price: 2000,
        stopLoss: 2050,
        takeProfits: [],
        reason: 'Bearish pattern',
        timestamp: Date.now(),
      };

      const candle = { open: 2000, high: 2010, low: 1990, close: 1995, volume: 1000, timestamp: Date.now() };

      gate.createSnapshot(TrendBias.BEARISH, {
        bias: TrendBias.BEARISH,
        strength: 0.9,
        timeframe: '4h',
        reasoning: ['LH_LL'],
        restrictedDirections: [],
      } as any, shortSignal, candle);

      // T2: HTF updates - bias flips to BULLISH (race condition!)
      const result = gate.validateSnapshot(TrendBias.BULLISH);

      // T3: ENTRY should SKIP (snapshot validation fails)
      expect(result.valid).toBe(false);
      expect(result.biasMismatch).toBe(true);
      expect(result.conflictingDirections?.signal).toBe(SignalDirection.SHORT);
      expect(result.conflictingDirections?.currentBias).toBe(TrendBias.BULLISH);
    });

    it('should allow entry when HTF bias changes but remains compatible', () => {
      // Signal: LONG (expects BULLISH)
      const signal: Signal = {
        direction: SignalDirection.LONG,
        type: SignalType.TREND_FOLLOWING,
        confidence: 80,
        price: 1000,
        stopLoss: 990,
        takeProfits: [],
        reason: 'Test',
        timestamp: Date.now(),
      };

      const candle = { open: 1000, high: 1010, low: 990, close: 1005, volume: 1000, timestamp: Date.now() };

      // Create with BULLISH
      gate.createSnapshot(TrendBias.BULLISH, {
        bias: TrendBias.BULLISH,
        strength: 0.8,
        timeframe: '4h',
        reasoning: [],
        restrictedDirections: [],
      } as any, signal, candle);

      // Validate: still BULLISH (no change) or could change to stronger BULLISH
      let result = gate.validateSnapshot(TrendBias.BULLISH);
      expect(result.valid).toBe(true);

      // Validate: NEUTRAL also allows LONG
      result = gate.validateSnapshot(TrendBias.NEUTRAL);
      expect(result.valid).toBe(true);
    });
  });
});
