/**
 * Bot Store Tests (Phase 8)
 *
 * Tests for bot state management using Zustand
 */

import { useBotStore } from '../../stores/botStore';

describe('Phase 8: Web Dashboard - Bot Store', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useBotStore.getState().reset();
  });

  describe('Initial State', () => {
    test('should have default initial state', () => {
      const state = useBotStore.getState();
      expect(state.isRunning).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.currentPosition).toBeNull();
      expect(state.balance).toBe(0);
      expect(state.unrealizedPnL).toBe(0);
      expect(state.recentSignals).toEqual([]);
    });
  });

  describe('Bot Status Management', () => {
    test('should set running state', () => {
      const { setRunning } = useBotStore.getState();
      setRunning(true);
      expect(useBotStore.getState().isRunning).toBe(true);
      setRunning(false);
      expect(useBotStore.getState().isRunning).toBe(false);
    });

    test('should set loading state', () => {
      const { setLoading } = useBotStore.getState();
      setLoading(true);
      expect(useBotStore.getState().isLoading).toBe(true);
      setLoading(false);
      expect(useBotStore.getState().isLoading).toBe(false);
    });

    test('should set and clear error', () => {
      const { setError } = useBotStore.getState();
      setError('Test error');
      expect(useBotStore.getState().error).toBe('Test error');
      setError(null);
      expect(useBotStore.getState().error).toBeNull();
    });
  });

  describe('Position Management', () => {
    test('should set current position', () => {
      const { setPosition } = useBotStore.getState();
      const testPosition = {
        id: '1',
        symbol: 'BTCUSDT',
        side: 'LONG',
        entryPrice: 50000,
      };
      setPosition(testPosition);
      expect(useBotStore.getState().currentPosition).toEqual(testPosition);
    });

    test('should clear position', () => {
      const { setPosition } = useBotStore.getState();
      setPosition(null);
      expect(useBotStore.getState().currentPosition).toBeNull();
    });
  });

  describe('Balance Management', () => {
    test('should set balance', () => {
      const { setBalance } = useBotStore.getState();
      setBalance(1000);
      expect(useBotStore.getState().balance).toBe(1000);
    });

    test('should handle balance updates', () => {
      const { setBalance } = useBotStore.getState();
      setBalance(1000);
      setBalance(1500);
      expect(useBotStore.getState().balance).toBe(1500);
    });
  });

  describe('PnL Management', () => {
    test('should set unrealized PnL', () => {
      const { setUnrealizedPnL } = useBotStore.getState();
      setUnrealizedPnL(150);
      expect(useBotStore.getState().unrealizedPnL).toBe(150);
    });

    test('should handle negative PnL', () => {
      const { setUnrealizedPnL } = useBotStore.getState();
      setUnrealizedPnL(-50);
      expect(useBotStore.getState().unrealizedPnL).toBe(-50);
    });
  });

  describe('Signal Management', () => {
    test('should add signals', () => {
      const { addSignal } = useBotStore.getState();
      const testSignal = {
        id: '1',
        type: 'ENTRY',
        direction: 'LONG',
        confidence: 75,
      };
      addSignal(testSignal);
      expect(useBotStore.getState().recentSignals).toContain(testSignal);
    });

    test('should maintain signal order (newest first)', () => {
      const { addSignal } = useBotStore.getState();
      const signal1 = { id: '1', type: 'ENTRY' };
      const signal2 = { id: '2', type: 'ENTRY' };
      addSignal(signal1);
      addSignal(signal2);
      const signals = useBotStore.getState().recentSignals;
      expect(signals[0]).toEqual(signal2);
      expect(signals[1]).toEqual(signal1);
    });

    test('should limit recent signals to 10', () => {
      const { addSignal } = useBotStore.getState();
      for (let i = 0; i < 15; i++) {
        addSignal({ id: `${i}`, type: 'ENTRY' });
      }
      expect(useBotStore.getState().recentSignals.length).toBe(10);
    });

    test('should clear signals', () => {
      const { addSignal, clearSignals } = useBotStore.getState();
      addSignal({ id: '1', type: 'ENTRY' });
      clearSignals();
      expect(useBotStore.getState().recentSignals).toEqual([]);
    });
  });

  describe('Store Reset', () => {
    test('should reset all state to initial values', () => {
      const state = useBotStore.getState();
      state.setRunning(true);
      state.setLoading(true);
      state.setError('Error');
      state.setBalance(1000);
      state.addSignal({ id: '1' });

      state.reset();

      expect(useBotStore.getState().isRunning).toBe(false);
      expect(useBotStore.getState().isLoading).toBe(false);
      expect(useBotStore.getState().error).toBeNull();
      expect(useBotStore.getState().balance).toBe(0);
      expect(useBotStore.getState().recentSignals).toEqual([]);
    });
  });
});
