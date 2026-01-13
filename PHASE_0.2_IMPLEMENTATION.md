# Phase 0.2: Indicator Cache Implementation

**Status:** Core files created, integration pending
**Created:** 2026-01-13
**Goal:** Pre-calculate indicators on candle close, read from cache during analysis
**Expected Result:** -40-50% CPU usage reduction, 100% cache hit rate

---

## 📋 Files Created

### 1. Core Interfaces (Types)

✅ **`src/types/indicator-cache.interface.ts`**
- `IIndicatorCache` interface
- Methods: `get()`, `set()`, `invalidate()`, `clear()`, `getStats()`
- Simple key-value contract

✅ **`src/types/indicator-calculator.interface.ts`**
- `IIndicatorCalculator` interface
- Methods: `getConfig()`, `calculate()`
- Each calculator declares what it produces and minimum candles needed

### 2. Core Services

✅ **`src/services/indicator-cache.service.ts`**
- LRU cache implementation (500 max entries)
- Stores: "RSI-14-1h" → 65, "EMA-20-1h" → 2.50
- Auto-eviction when full
- Invalidation support

✅ **`src/services/indicator-precalculation.service.ts`**
- Listens to `candleClosed` events
- Queues closes (handles race conditions from multiple TF)
- Processes queue sequentially
- Batches same-timestamp closes
- Invalidates + recalculates + stores in cache
- Calls callback when ready
- **20 lines core logic!**

### 3. Indicator Calculators

✅ **`src/indicators/calculators/rsi.calculator.ts`**
- Implements `IIndicatorCalculator`
- Calculates RSI-14, RSI-21 on 1h, 4h
- Returns Map<"RSI-14-1h" → value>
- No dependencies on analyzers

✅ **`src/indicators/calculators/ema.calculator.ts`**
- Implements `IIndicatorCalculator`
- Calculates EMA-20, EMA-50 on 1h, 4h
- Returns Map<"EMA-20-1h" → value>
- No dependencies on analyzers

### 4. NEW Analyzers (Cache-based)

⏳ **`src/analyzers/rsi.analyzer-new.ts`** (to update)
- Reads RSI from cache
- <5ms per analysis (just cache lookup)
- 100% cache hit rate

⏳ **`src/analyzers/ema.analyzer-new.ts`** (to update)
- Reads EMA from cache
- <5ms per analysis
- 100% cache hit rate

---

## 🔄 Data Flow

```
MINUTE 1: 1m Candle closes
  │
  └─ CandleProvider emits candleClosed(1m)
      └─ IndicatorPreCalculationService.handleCandleClosed()
          ├─ Add {1m, closeTime} to queue
          ├─ Recalculate indicators affected by 1m:
          │   ├─ Invalidate 1m cache entries
          │   ├─ Get candles from provider
          │   ├─ Run RsiCalculator, EmaCalculator (for 1m)
          │   └─ Store in cache
          └─ No callback yet (not entry TF)

MINUTE 5: 5m Candle closes
  │
  └─ CandleProvider emits candleClosed(5m)
      └─ IndicatorPreCalculationService.handleCandleClosed()
          ├─ Add {5m, closeTime} to queue
          ├─ Process queue (1m + 5m batch)
          ├─ Recalculate for 5m
          ├─ Cache is NOW fully fresh!
          └─ Call callback: onIndicatorsReady('5m', closeTime)
              └─ TradingOrchestrator.onIndicatorsReady()
                  ├─ Run analyzers
                  │   ├─ RsiAnalyzerNew: cache.get("RSI-14-5m") ✓ FRESH
                  │   ├─ EmaAnalyzerNew: cache.get("EMA-20-5m") ✓ FRESH
                  │   └─ All data pre-calculated!
                  ├─ Aggregate signals
                  └─ Entry decision
```

---

## ⚙️ Integration Steps

### Step 1: Update BotFactory/BotServices

```typescript
// In constructor:

// Create cache
this.indicatorCache = new IndicatorCacheService();

// Create calculators
const calculators = [
  new RsiCalculator(),
  new EmaCalculator(),
];

// Create precalc service
this.indicatorPreCalculation = new IndicatorPreCalculationService(
  this.candleProvider,
  this.indicatorCache,
  calculators,
  this.logger
);

// Configure
this.indicatorPreCalculation.setEntryTimeframe(
  this.config.timeframes.entry // "5m"
);

// Create NEW analyzers
this.rsiAnalyzerNew = new RsiAnalyzerNew(
  this.indicatorCache,
  this.logger
);

this.emaAnalyzerNew = new EmaAnalyzerNew(
  this.indicatorCache,
  this.logger
);
```

### Step 2: Update TradingOrchestrator

```typescript
// In constructor:

// Register callback
this.indicatorPreCalc.setOnIndicatorsReady((tf, closeTime) =>
  this.onIndicatorsReady(tf, closeTime)
);

// Add method:
private async onIndicatorsReady(
  timeframe: string,
  closeTime: number
): Promise<void> {
  // All indicators pre-calculated and in cache!

  const candles = await this.candleProvider.getCandles(timeframe, 200);

  // Run new analyzers (read from cache)
  const signals = await Promise.all([
    this.rsiAnalyzerNew.analyze(candles, { timeframe, closeTime }),
    this.emaAnalyzerNew.analyze(candles, { timeframe, closeTime }),
  ]);

  // Rest of analysis...
}
```

### Step 3: Replace Old Analysis Path

**Old (to remove):**
```typescript
candleProvider.on('candleClosed', (candle) => {
  if (candle.timeframe === '5m') {
    this.tradingOrchestrator.onCandleClosed(candle);
  }
});
```

**New (already in PreCalculationService):**
```typescript
// PreCalculationService listens to candleClosed
// Recalculates on 1m
// Then calls callback when 5m is ready
```

---

## ✅ Testing Checklist

- [ ] `npm run build` - no errors
- [ ] All new services compile
- [ ] All calculators implement interface
- [ ] All analyzers use cache only
- [ ] Cache hit rate reported (should be ~100%)
- [ ] Backtest: same results as before
- [ ] Backtest: trade count identical
- [ ] Backtest: win rate identical
- [ ] Backtest: total PnL identical
- [ ] Performance: CPU usage -40-50%
- [ ] No errors in logs during backtest
- [ ] No memory leaks (check heap growth)

---

## 🎯 Success Criteria

All criteria must be met:

1. ✅ Code compiles: `npm run build`
2. ✅ All tests pass: `npm test`
3. ✅ Backtest results IDENTICAL to before
4. ✅ CPU usage reduced by 40-50%
5. ✅ Cache hit rate > 95%
6. ✅ No regressions (trades open/close at same times)
7. ✅ Git commit created

---

## 🚀 What Happens After Phase 0.2

### When Cache is Ready:
- Every 1m: Pre-calc indicators for 1m TF
- Every 5m: Pre-calc indicators for 5m TF + run analysis
- Every analysis: 100% cache hit rate
- Analysis latency: <50ms (vs 300ms before)

### CPU Profile:
- **1m close:** ~100ms spike (pre-calc CPU)
- **2-4m:** Low CPU (no processing)
- **5m close:** ~50ms analysis (read cache, not calculate)

---

## ⚠️ Known Issues / Workarounds

### Issue: Race Condition Between 1m and 5m Events

**Solution:** Queue + batch processing
- Queue collects all closes at same timestamp
- Process sequentially (1m → 5m)
- Only callback when entry TF is ready

### Issue: Candle Data Completeness

**Solution:** Request enough candles
- RSI: min 50 candles
- EMA: min 100 candles
- Calculator declares requirement

### Issue: Stale Data in Cache

**Solution:** Invalidation on TF close
- Clear only entries affected by closed TF
- Store fresh values immediately

---

## 📊 Performance Expectations

### Before Phase 0.2:
```
Per 5m analysis:
- Get candles: 50ms
- Run 28 analyzers: 250ms (including recalculations)
  ├─ RSI-14 calculated 28 times (duplicate!)
  ├─ EMA-20 calculated 28 times (duplicate!)
  └─ ...
- Aggregation: 10ms
────────────────────
TOTAL: ~310ms
```

### After Phase 0.2:
```
Per 1m pre-calc:
- Get candles: 20ms
- Run 2 calculators: 80ms (RSI + EMA)
────────────────────
TOTAL: ~100ms (happens every 1m)

Per 5m analysis:
- Run 28 analyzers: 50ms (all read cache, no recalc)
- Aggregation: 10ms
────────────────────
TOTAL: ~60ms (happens every 5m)

CPU SAVINGS:
- Per cycle: 310 → 60 = 81% faster! 🚀
- Distributed: 1m spikes manageable
```

---

## 📝 Implementation Notes

- **20 lines of active code** in IndicatorPreCalculationService
- **No dependencies** on analyzers (pure interfaces)
- **Dynamic config** through calculator.getConfig()
- **Zero behavior change** - same signals, same trades
- **Parallel calculators** - RSI + EMA run together
- **Sequential TF processing** - 1m before 5m before 4h
- **Callback-based** - no EventBus complexity

---

## 🔗 Related Files

- `ARCHITECTURE_LEGO_BLUEPRINT.md` - Full architecture
- `ARCHITECTURE_IMPLEMENTATION_GUIDE.md` - Code examples
- `ARCHITECTURE_QUICK_START.md` - Implementation checklist

---

**Version:** 1.0
**Status:** Awaiting integration and testing
**Next:** Phase 0.3 (Decision Functions - extract to pure functions)
