/**
 * Market Store Tests (Phase 8)
 *
 * Tests for market data state management using Zustand
 */

import { useMarketStore } from '../../stores/marketStore';

describe('Phase 8: Web Dashboard - Market Store', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useMarketStore.getState().reset();
  });

  describe('Initial State', () => {
    test('should have default initial state', () => {
      const state = useMarketStore.getState();
      expect(state.currentPrice).toBe(0);
      expect(state.priceChange).toBe(0);
      expect(state.priceChangePercent).toBe(0);
      expect(state.trend).toBeUndefined();
    });
  });

  describe('Price Management', () => {
    test('should set current price', () => {
      const { setPrice } = useMarketStore.getState();
      setPrice(50000);
      expect(useMarketStore.getState().currentPrice).toBe(50000);
    });

    test('should set price with change', () => {
      const { setPrice } = useMarketStore.getState();
      setPrice(50000, 1000, 2.0);
      const state = useMarketStore.getState();
      expect(state.currentPrice).toBe(50000);
      expect(state.priceChange).toBe(1000);
      expect(state.priceChangePercent).toBe(2.0);
    });

    test('should handle price updates', () => {
      const { setPrice } = useMarketStore.getState();
      setPrice(50000);
      setPrice(51000, 1000, 2.0);
      expect(useMarketStore.getState().currentPrice).toBe(51000);
    });
  });

  describe('Indicator Management', () => {
    test('should set RSI', () => {
      const { setIndicators } = useMarketStore.getState();
      setIndicators({ rsi: 65 });
      expect(useMarketStore.getState().rsi).toBe(65);
    });

    test('should set multiple indicators', () => {
      const { setIndicators } = useMarketStore.getState();
      setIndicators({
        rsi: 65,
        ema20: 50000,
        ema50: 49500,
        atr: 500,
      });
      const state = useMarketStore.getState();
      expect(state.rsi).toBe(65);
      expect(state.ema20).toBe(50000);
      expect(state.ema50).toBe(49500);
      expect(state.atr).toBe(500);
    });

    test('should update indicators without removing others', () => {
      const { setIndicators } = useMarketStore.getState();
      setIndicators({ rsi: 65 });
      setIndicators({ ema20: 50000 });
      const state = useMarketStore.getState();
      expect(state.rsi).toBe(65);
      expect(state.ema20).toBe(50000);
    });
  });

  describe('Trend Management', () => {
    test('should set bullish trend', () => {
      const { setTrend } = useMarketStore.getState();
      setTrend('BULLISH');
      expect(useMarketStore.getState().trend).toBe('BULLISH');
    });

    test('should set bearish trend', () => {
      const { setTrend } = useMarketStore.getState();
      setTrend('BEARISH');
      expect(useMarketStore.getState().trend).toBe('BEARISH');
    });

    test('should set neutral trend', () => {
      const { setTrend } = useMarketStore.getState();
      setTrend('NEUTRAL');
      expect(useMarketStore.getState().trend).toBe('NEUTRAL');
    });
  });

  describe('BTC Correlation', () => {
    test('should set BTC correlation', () => {
      const { setBtcCorrelation } = useMarketStore.getState();
      setBtcCorrelation(0.85);
      expect(useMarketStore.getState().btcCorrelation).toBe(0.85);
    });

    test('should handle negative correlation', () => {
      const { setBtcCorrelation } = useMarketStore.getState();
      setBtcCorrelation(-0.3);
      expect(useMarketStore.getState().btcCorrelation).toBe(-0.3);
    });
  });

  describe('Level Management', () => {
    test('should set support/resistance level', () => {
      const { setLevel } = useMarketStore.getState();
      setLevel(49500, 500);
      const state = useMarketStore.getState();
      expect(state.nearestLevel).toBe(49500);
      expect(state.distanceToLevel).toBe(500);
    });

    test('should update level information', () => {
      const { setLevel } = useMarketStore.getState();
      setLevel(49500, 500);
      setLevel(50000, 0);
      const state = useMarketStore.getState();
      expect(state.nearestLevel).toBe(50000);
      expect(state.distanceToLevel).toBe(0);
    });
  });

  describe('Complex Scenarios', () => {
    test('should handle market update with all data', () => {
      const { setPrice, setIndicators, setTrend, setBtcCorrelation, setLevel } = useMarketStore.getState();

      setPrice(50000, 1000, 2.0);
      setIndicators({
        rsi: 65,
        ema20: 50000,
        ema50: 49500,
        atr: 500,
      });
      setTrend('BULLISH');
      setBtcCorrelation(0.85);
      setLevel(49500, 500);

      const state = useMarketStore.getState();
      expect(state.currentPrice).toBe(50000);
      expect(state.rsi).toBe(65);
      expect(state.trend).toBe('BULLISH');
      expect(state.btcCorrelation).toBe(0.85);
      expect(state.nearestLevel).toBe(49500);
    });
  });

  describe('Store Reset', () => {
    test('should reset all state to initial values', () => {
      const state = useMarketStore.getState();
      state.setPrice(50000, 1000, 2.0);
      state.setIndicators({ rsi: 65 });
      state.setTrend('BULLISH');

      state.reset();

      expect(useMarketStore.getState().currentPrice).toBe(0);
      expect(useMarketStore.getState().priceChange).toBe(0);
      expect(useMarketStore.getState().rsi).toBeUndefined();
      expect(useMarketStore.getState().trend).toBeUndefined();
    });
  });
});
