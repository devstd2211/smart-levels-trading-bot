# ConfigNew Migration Plan

**Objective:** Complete refactor of all indicators and analyzers with strict ConfigNew typing

**Status:** IN PROGRESS (Phase 1: Indicators - 5/6 complete, Bollinger Bands remaining)

**Summary of Completed Work:**
- ✅ 5 Indicators complete with full test coverage (EMA, RSI, ATR, Volume, Stochastic)
- ✅ Total tests: 215 (56 + 47 + 49 + 63 + 54 all passing)
- ✅ Functional patterns tested: uptrend, downtrend, consolidation, reversals, divergences, gaps
- ✅ Config fixes: minStopLossPercent added, blind zone thresholds corrected

---

## 📋 Phase Overview

### Phase 1: Indicators (6 total)
✅ = Type definition + Technical tests + Functional tests
🔄 = In progress
📋 = Planned

### Phase 2: Analyzers (28 total)
- After all indicators complete

### Phase 3: Integration
- Replace old code one-by-one
- Run full test suite after each integration

---

## ✅ INDICATORS CHECKLIST

### TECHNICAL INDICATORS (6)

#### 1. EMA Indicator
- [x] Type definition (EmaIndicatorConfigNew)
- [x] Implementation (ema.indicator-new.ts)
- [x] Technical tests (36 tests passing)
- [x] Functional tests (real market patterns)
- [ ] Integration into code

**Expected Behavior:**
- Fast EMA should be above slow EMA in uptrends
- Fast EMA should be below slow EMA in downtrends
- Should lag behind price (smoothing effect)
- Should respond faster with shorter periods

---

#### 2. RSI Indicator
- [x] Type definition (RsiIndicatorConfigNew)
- [x] Implementation (rsi.indicator-new.ts)
- [x] Technical tests (47 tests passing)
- [x] Functional tests (real market patterns)
- [ ] Integration into code

**Expected Behavior:**
- RSI > 70: Overbought (sell signal potential)
- RSI < 30: Oversold (buy signal potential)
- RSI = 100: Perfect uptrend (all gains)
- RSI = 0: Perfect downtrend (all losses)
- Wilder's smoothing: Should be stable, not jumpy

---

#### 3. ATR Indicator
- [x] Type definition (AtrIndicatorConfigNew)
- [x] Implementation (atr.indicator-new.ts)
- [x] Technical tests (35 tests passing)
- [x] Functional tests (14 tests passing)
- [ ] Integration into code

**Expected Behavior:**
- ATR increases during volatile periods
- ATR decreases during calm/consolidation
- Reflects true range (H-L, H-PC, L-PC)
- Useful for stop loss sizing

---

#### 4. Volume Indicator
- [x] Type definition (VolumeIndicatorConfigNew)
- [x] Implementation (volume.indicator-new.ts)
- [x] Technical tests (46 tests passing)
- [x] Functional tests (17 tests passing)
- [ ] Integration into code

**Expected Behavior:**
- High volume confirms trend
- Low volume during consolidation
- Volume spikes at trend reversals
- Rising volume = trend strength

---

#### 5. Stochastic Indicator
- [x] Type definition (StochasticIndicatorConfigNew)
- [x] Implementation (stochastic.indicator-new.ts)
- [x] Technical tests (41 tests passing)
- [x] Functional tests (13 tests passing)
- [ ] Integration into code

**Expected Behavior:**
- Oscillates 0-100
- %K crosses %D = momentum change signal
- > 80: Overbought
- < 20: Oversold

---

#### 6. Bollinger Bands Indicator
- [ ] Type definition (BollingerBandsConfigNew)
- [ ] Implementation (bollinger.indicator-new.ts)
- [ ] Technical tests
- [ ] Functional tests
- [ ] Integration into code

**Expected Behavior:**
- Upper/Middle/Lower bands track volatility
- Price touches bands = mean reversion likely
- Bands expand in volatile markets
- Bands contract in calm markets

---

## 📊 ANALYZERS CHECKLIST (28 total)

### TECHNICAL INDICATORS (6)
- [ ] EMA Analyzer
- [ ] RSI Analyzer
- [ ] ATR Analyzer
- [ ] Volume Analyzer
- [ ] Stochastic Analyzer
- [ ] Bollinger Bands Analyzer

### ADVANCED ANALYSIS (4)
- [ ] Divergence Analyzer
- [ ] Breakout Analyzer
- [ ] Wick Analyzer
- [ ] Price Momentum Analyzer

### STRUCTURE ANALYSIS (4)
- [ ] Trend Detector
- [ ] CHOCH/BOS Analyzer
- [ ] Swing Analyzer
- [ ] Trend Conflict Analyzer

### LEVEL ANALYSIS (2)
- [ ] Level Analyzer
- [ ] Volume Profile Analyzer

### LIQUIDITY & SMC (8)
- [ ] Liquidity Sweep Analyzer
- [ ] Liquidity Zone Analyzer
- [ ] Order Block Analyzer
- [ ] Fair Value Gap Analyzer
- [ ] Footprint Analyzer
- [ ] Micro Wall Analyzer
- [ ] Whale Analyzer
- [ ] Price Action Analyzer

### SCALPING (3)
- [ ] Tick Delta Analyzer
- [ ] Order Flow Analyzer
- [ ] Delta Analyzer

---

## 🔧 TESTING STRATEGY

For each component:

### 1. Technical Tests
- ✅ Already created
- Verify code executes without errors
- Check basic functionality
- Edge cases (large/small numbers)

### 2. Functional Tests (NEW)
- Real market pattern simulation
- Verify indicator behaves correctly
- Test known scenarios with known outcomes

**Patterns to test:**

#### Uptrend Pattern
```
Price: 100 → 102 → 105 → 107 → 110 → 112 → 115
Expected:
- EMA fast > EMA slow
- RSI > 70 (overbought)
- ATR increasing
- Volume strong
```

#### Downtrend Pattern
```
Price: 100 → 98 → 95 → 93 → 90 → 88 → 85
Expected:
- EMA fast < EMA slow
- RSI < 30 (oversold)
- ATR increasing
- Volume strong
```

#### Consolidation Pattern
```
Price: 100 → 101 → 100 → 102 → 99 → 101 → 100
Expected:
- RSI near 50
- ATR low
- Volume low
- EMAs close together
```

#### V-Shaped Reversal
```
Price: 100 → 95 → 90 → 92 → 97 → 102 → 105
Expected:
- Initial: EMA down, RSI low
- Reversal: EMA switches, RSI rises
- End: Uptrend established
```

#### Double Top / Head & Shoulders
- Test rejection at resistance
- Volume divergence
- Price action patterns

#### Gap Up / Gap Down
- How indicators handle discontinuity
- Volatility spike detection

---

## 📈 Progress Tracking

### Session 1
- [x] Create ConfigNew types (all indicators + analyzers)
- [x] Create EMA Indicator NEW (type + impl + tech + functional tests)
- [x] Create RSI Indicator NEW (type + impl + tech + functional tests)
- [x] Create ATR Indicator NEW (type + impl + tech + functional tests)

### Session 2
- [x] Create Volume Indicator NEW (type + impl + 46 tech + 17 functional tests)
- [x] Create Stochastic Indicator NEW (type + impl + 41 tech + 13 functional tests)
- [x] Fix blind zone hardcoded constants to use config values
- [x] Add minStopLossPercent to config.json

### Session 3 (Current)
- [ ] Create Bollinger Bands Indicator NEW (type + impl + tests)
- [ ] Begin Analyzer implementations (28 total)
- [ ] Priority: EMA, RSI, ATR, Volume analyzers

### Session 4+
- [ ] Complete all 28 analyzers
- [ ] Integration phase begins
- [ ] Replace one indicator at a time
- [ ] Full regression testing

---

## 🚨 Critical Rules

1. **NO ANY TYPES** - All config fields strictly typed
2. **FAIL FAST** - Missing config throws errors immediately
3. **Functional tests first** - Code behavior verified before integration
4. **One at a time** - Complete indicator before starting next
5. **No integration yet** - All *-new files exist alongside originals
6. **Full test coverage** - Both technical + functional tests passing

---

## 📂 File Structure

```
src/
├── types/
│   ├── config-new.types.ts          ✅ All type definitions
│   └── index.ts                      ✅ Re-exports
├── indicators/
│   ├── ema.indicator.ts              (original - keep)
│   ├── ema.indicator-new.ts          ✅ New strict version
│   ├── rsi.indicator.ts              (original - keep)
│   ├── rsi.indicator-new.ts          ✅ New strict version
│   ├── atr.indicator-new.ts          (next)
│   ├── volume.indicator-new.ts       (next)
│   ├── stochastic.indicator-new.ts   (next)
│   └── bollinger.indicator-new.ts    (next)
├── __tests__/
│   ├── indicators/
│   │   ├── ema.indicator.test.ts                  (original - keep)
│   │   ├── ema.indicator-new.test.ts             ✅ Technical tests
│   │   ├── ema.indicator-new.functional.test.ts  (next)
│   │   ├── rsi.indicator.test.ts                 (original - keep)
│   │   ├── rsi.indicator-new.test.ts             ✅ Technical tests
│   │   └── rsi.indicator-new.functional.test.ts  (next)
```

---

## 🎯 Next Immediate Steps

1. ✅ Create functional tests for EMA (real patterns)
2. ✅ Create functional tests for RSI (real patterns)
3. Create ATR Indicator NEW (type + impl + tests)
4. Create Volume Indicator NEW (type + impl + tests)
5. Update this plan with progress

---

## 📝 Notes

- Keep original indicator files - no breaking changes
- Test both technical accuracy AND real-world behavior
- Real patterns: uptrend, downtrend, consolidation, reversals, gaps
- Document expected vs actual behavior
- This is foundation work - quality over speed

