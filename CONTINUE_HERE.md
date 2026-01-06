# 🚨 CRITICAL REFACTORING PLAN - Edison Bot Architecture Cleanup

**Status**: ❌ BROKEN - Too many hacks, unclear which parts actually work
**Last Updated**: 2026-01-06
**Responsibility Disclaimer**: All architectural decisions made by Claude AI. User assumes no responsibility.

---

## 📋 EXECUTIVE SUMMARY

Bot is **technically functional** (2579 tests passing) but **architecturally broken**:

### Current Problems:
- **Excessive filtering**: 5+ decision points kill viable signals
- **DI hell**: Dependencies passed through 4+ layers (mainConfig hack)
- **Unclear effectiveness**: No backtest metrics, can't see profitability
- **Code duplication**: DivergenceDetector created twice
- **Fragile architecture**: Many "archived" services = unstable design
- **Type safety lost**: Using `any` types for config injection

### Root Cause:
Started with TDD, evolved into tangled ball of "add another filter". Each new feature added a layer instead of simplifying.

---

## 🎯 PHASE 1: DIAGNOSTIC (Week 1)

### ☐ 1.1 Run Complete Backtest & Collect Metrics
**Files**: `scripts/run-backtest.ts`
**Goal**: Understand if strategy is profitable

- [ ] Run backtest on 90+ days data
- [ ] Collect: signal count, filter pass rates, win rate, max drawdown, Sharpe ratio
- [ ] Compare: "No filters" vs "Current filters"
- [ ] Document in `BACKTEST_RESULTS.md`

**Acceptance**: We have hard numbers on profitability

---

## 🏗️ PHASE 2: SIMPLIFY ARCHITECTURE (Week 2-3)

### ☐ 2.1 Eliminate DI Hell - Remove mainConfig Hack
**Files**: `src/services/trading-orchestrator.service.ts`, `src/services/indicator-initialization.service.ts`, `src/services/bot-services.ts`

- [ ] Remove `mainConfig?: any` parameter from TradingOrchestrator
- [ ] Remove `mainConfig?: any` parameter from IndicatorInitializationService  
- [ ] Move `divergenceDetector` into OrchestratorConfig.entryConfig PROPERLY
- [ ] Update BotServices to pass complete OrchestratorConfig
- [ ] Remove all `any` type hacks from service signatures
- [ ] Update tests to match clean signatures

**Acceptance**: No `any` types, no config through 3+ layers

### ☐ 2.2 Remove DivergenceDetector Duplication
**Files**: `src/analyzers/entry.scanner.ts`, `src/services/indicator-initialization.service.ts`

- [ ] EntryScanner gets DivergenceDetector via dependency injection ONLY
- [ ] Remove optional constructor parameter
- [ ] Make it mandatory with proper typing
- [ ] Verify tests mock correctly

**Acceptance**: DivergenceDetector created exactly once

### ☐ 2.3 Consolidate Filter Layers (5+ → 2-3)
**Current filter stack**:
1. LevelBased Strategy
2. TrendAnalyzer
3. RiskManager
4. BTC_CORRELATION
5. TrendConfirmationService
6. EntryOrchestrator

- [ ] Measure impact of EACH filter on signal count
- [ ] Identify redundant filters
- [ ] Keep only filters with >10% independent blocking power
- [ ] Merge related logic (TrendAnalyzer + TrendConfirmationService → one)
- [ ] Document filter decision tree

**Acceptance**: Max 3 sequential filters, each with clear responsibility

---

## 🧹 PHASE 3: CLEAN UP CODE (Week 3-4)

### ☐ 3.1 Remove Dead Code
**Files**: Whole codebase

- [ ] Delete all archived services (FastEntryService, SmartBreakevenService, etc.)
- [ ] Remove commented-out code blocks
- [ ] Clean up stale TODO/FIXME comments
- [ ] Delete `src/archive` folder if exists

**Acceptance**: No dead code references in active code

### ☐ 3.2 Fix Type Definitions
**Files**: `src/types.ts`

- [ ] Replace all `any` with proper types
- [ ] Add JSDoc for config objects
- [ ] Run `npx tsc --noImplicitAny` → 0 errors
- [ ] All public methods have return types

**Acceptance**: Strict TypeScript mode passes

### ☐ 3.3 Simplify Position Opening
**Files**: `src/services/position-opening.service.ts`

- [ ] Verify atomic SL+TP is clean
- [ ] Additional TP failures don't break position
- [ ] Add explicit comments on why atomic matters
- [ ] Tests verify both success and failure scenarios

**Acceptance**: Position opens with SL+TP atomically, additional TPs fail gracefully

---

## 📊 PHASE 4: VALIDATE & OPTIMIZE (Week 4-5)

### ☐ 4.1 Create Comprehensive Backtest v2
**Files**: New `scripts/backtest-metrics.ts`

- [ ] Run on 90+ days of real data
- [ ] Output: signal count, filter pass rates (%), win rate, PnL, Sharpe, max drawdown
- [ ] Generate HTML report
- [ ] Show which filter combination is optimal

**Acceptance**: Clear metrics show profitability or not

### ☐ 4.2 Optimize Signal Generation
**IF backtest shows too few signals** (<5 per 100 candles):
- [ ] Reduce filter strictness
- [ ] Test each filter independently
- [ ] Find optimal filter balance

**IF backtest shows low win rate**:
- [ ] Accept current filter mix
- [ ] OR add better entry confirmation logic

**Acceptance**: Backtest validates filter choices

### ☐ 4.3 Fix Test Coverage
**Files**: All test files

- [ ] Audit mocks - are they realistic?
- [ ] Add integration tests (real services, not mocks)
- [ ] Coverage >80% on critical paths
- [ ] All 2579 tests still pass

**Acceptance**: Tests validate behavior, not implementation

---

## 🚀 PHASE 5: PRODUCTION READINESS (Week 5+)

### ☐ 5.1 Error Handling & Recovery
- [ ] Document all possible failures
- [ ] Add circuit breaker patterns where needed
- [ ] Test recovery scenarios
- [ ] Add graceful degradation

### ☐ 5.2 Logging & Monitoring
- [ ] Structured logging with trace IDs
- [ ] Metrics export (Prometheus format)
- [ ] Dashboard: signals, filters, trades, PnL
- [ ] Alert thresholds

### ☐ 5.3 Documentation
- [ ] Architecture diagram
- [ ] Data flow document
- [ ] Filter decision tree
- [ ] Tuning guide for parameters

---

## 🔴 CRITICAL ISSUES (START HERE)

### Issue 1: Backtest Shows ZERO Trades
**Evidence**: Logs show `❌ LevelBased BLOCKED | NO_SIGNIFICANT_TREND` repeatedly
**Impact**: Can't validate strategy works
**Fix**: 
- [ ] Lower EMA distance threshold (0.5% → 0.1%)
- [ ] Run backtest again
- [ ] If signals appear: filters too strict
- [ ] If no signals: config is broken

### Issue 2: mainConfig DI Hack
**Evidence**: `mainConfig?: any` passed through 3+ layers
**Impact**: Hard to refactor, lost type safety
**Fix**: Phase 2.1 above

### Issue 3: No Backtest Metrics
**Evidence**: Backtest runs but no output, can't see profitability  
**Impact**: Can't validate if profitable
**Fix**: Phase 4.1 above

---

## ✅ SUCCESS CRITERIA (End Goal)

When done:
- ✅ Clean architecture (no `any`, no hacks, max 3 filters)
- ✅ Know if strategy is profitable (backtest metrics)
- ✅ Tests validate behavior (not implementation)
- ✅ Code maintainable (easy to understand/modify/test)
- ✅ Bot generates consistent signals
- ✅ No dead code

---

## 📝 UPDATE LOG

### 2026-01-06 (Initial)
- [x] Created CONTINUE_HERE.md with full plan
- [x] Identified 5+ critical hacks
- [x] Planned 5 phases (Diagnostic → Production)
- [ ] Starting Phase 1: Backtest diagnostics
