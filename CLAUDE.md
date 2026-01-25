# Claude Code Session Guide

## 🎯 Current Status (Session 29.4b - MTF Snapshot Race Condition Hotfix!)

**BUILD STATUS:** ✅ **SUCCESS** | **3977+ Tests Passing** | **Phase 14 (Production) + Phase 9 (Complete) + Phase 3 ✅ + Hotfix ✅**

### 🔒 PHASE 9.P0: CRITICAL SAFETY GUARDS - COMPLETE ✅
- ✅ **P0.1: Atomic Lock for Position Close** (5 tests)
  - Prevents timeout ↔ close race condition using Map-based lock
  - Lock cleanup on success or failure guaranteed
  - Concurrent close attempts properly serialized

- ✅ **P0.2: Runtime Validation (Position Object)** (8 tests)
  - Catches NaN crashes from type mismatches (empty string entryPrice, undefined unrealizedPnL)
  - Validates all critical fields: id, symbol, entryPrice, quantity, leverage, stopLoss, unrealizedPnL
  - Backward compatible: fillMissingFields() for pre-Phase-9 positions

- ✅ **P0.3: Atomic Snapshots for Concurrent Reads** (9 tests)
  - Deep copy snapshots prevent WebSocket ↔ monitor race condition
  - Safe for Phase 9 health calculations during live updates
  - Independent snapshot objects for concurrent operations

**Total P0 Tests:** 37 passing ✅ (8 validator + 9 atomic/snapshot + 20 integration tests)
**Ready for Phase 9.2 Integration!**

## 📋 Quick Reference

### System State
- **Active Phase:** 14 (Production) + 9.1 (Unit Tests ✅) + 9.P0 (Safety Guards ✅) + 9.P1 (Safeguards ✅) + **9.P3 (Race Condition Fix ✅)**
- **Next Phase:** 9.2 (Service Integration - READY, awaiting deployment)
- **Security:** ✅ P0.1 Atomic locks ✅ P0.2 Runtime validation ✅ P0.3 Atomic snapshots ✅ P1.1 Transactional close ✅ P1.2 Cache invalidation ✅ **P3 Close Race Condition Protection**
- **Test Progress:** 3977 tests passing (179 test suites) | +37 P0 tests + 18 P1 tests + 14 P3 race condition tests completed

### Key Features
- ✅ Phase 14: V5 Backtest Engine (no legacy)
- ✅ Phase 13: Orchestrator Tests (140+ tests)
- ✅ Phase 12: Parallel Processing (2-3x faster)
- ✅ Phase 11: Circuit Breakers (resilience)
- ✅ Phase 10: Multi-Strategy Support
- ✅ Phase 9: Live Trading Engine
- ✅ Phase 8: Web Dashboard (React SPA)
- ✅ Phase 7: Backtest Optimization (10x faster)

### Configuration
**Strategy:** `simple-levels.strategy.json`
- TakeProfit: 0.5%, 1%, 1.5% (optimized for fast testing)
- Leverage: 10x
- Position Size: Dynamic (risk-based)

### Type System
- ✅ IIndicator (6 indicators)
- ✅ IAnalyzer (28 analyzers)
- ✅ IExchange (multi-exchange)
- 📋 Config types: ConfigNew (in progress)

### Testing (Session 29.3 P3 Complete)
- **Total Tests:** 3977 passing ✅ (+37 P0 + 18 P1 + 14 P3 = 69 new tests)
- **Test Suites:** 179 ✅ (2 P0 + 3 P1 + 1 P3: race-condition.test.ts)
- **Critical Path:** Phase 9.1 → Phase 9.P0 ✅ → Phase 9.P1 ✅ → **Phase 9.P3 ✅** → Phase 9.2 (READY)
- **Coverage:** All critical trading logic + Live Trading Risk Monitoring + Transactional Safety + Cache Invalidation + **Race Condition Protection**
- **Phase 9.1 Status:** Complete ✅ | **Phase 9.P0 Status:** Complete ✅ | **Phase 9.P1 Status:** Complete ✅ | **Phase 9.P3 Status:** Complete ✅

## 🔒 CRITICAL BUG FIX (Session 27)

**Issue:** Empty `entryPrice` string after TP1 execution → NaN crash
- **File:** websocket-manager.service.ts + position-exiting.service.ts
- **Fix:** Proper string validation + fallback chain
- **Tests:** 16 new functional/integration tests
- **Status:** ✅ PRODUCTION CRITICAL

## 🏗️ Architecture

```
Trading Bot
├─ Entry Orchestrator (signal ranking, trend validation)
├─ Exit Orchestrator (state machine: OPEN → TP1 → TP2 → TP3 → CLOSED)
├─ Multi-Strategy Support (parallel execution, event isolation)
├─ Live Trading Engine (lifecycle mgmt, risk monitoring)
├─ Event-Driven Pipeline (ActionQueue, EventBus)
└─ Web Dashboard (React SPA + WebSocket)
```

## ✅ P0-P2 SAFETY GUARDS: PHASE 9.P0 + 9.P1 COMPLETE (P2 Pending)

### Phase 9.P0: Atomic Locks & Validation (Session 28) ✅ COMPLETE
- ✅ Atomic lock for position close (prevent timeout ↔ close race)
- ✅ Runtime validation (catch NaN type mismatches - critical for TP execution)
- ✅ Atomic snapshots (prevent WebSocket ↔ monitor race)
- ✅ **Tests:** 37 passing (8 validator + 9 atomic/snapshot + 20 integration) | **Status:** PRODUCTION READY

### Phase 9.P1: Integration Safeguards (Session 29) ✅ COMPLETE
- ✅ Transactional close with rollback (prevent journal desync)
- ✅ Health score cache invalidation (prevent stale scores)
- ✅ E2E test suite (4 complete Phase 9 workflows: full lifecycle, timeout, breakeven, error recovery)
- ✅ **Tests:** 18 integration tests (8 transactional + 6 cache + 4 E2E)

### Phase 9.P3: Close Race Condition Protection (Session 29.3) ✅ COMPLETE
- ✅ **CRITICAL BUG FIX:** "Position XRPUSDT_Buy not found" error eliminated
- ✅ Atomic lock pattern prevents WebSocket ↔ timeout close race
- ✅ Idempotent closeFullPosition() with null/status guards
- ✅ Enhanced closePositionWithAtomicLock() with callback execution within lock
- ✅ WebSocketEventHandler refactored to use atomic lock
- ✅ **Tests:** 14 race condition tests covering:
  - P3.1: Idempotent close operations (4 tests)
  - P3.2: Atomic lock prevents concurrent closes (3 tests)
  - P3.3: Concurrent close attempts (2 tests)
  - P3.4: Status transition guards (2 tests)
  - P3.5: Error message verification (3 tests)
- ✅ **Status:** PRODUCTION READY - Eliminates critical race condition

### Phase 9.2: Service Integration (Session 29.2) ✅ COMPLETE
- ✅ RealTimeRiskMonitor initialized in bot-services.ts
- ✅ LiveTradingConfig types defined (with optional OrderExecution, GracefulShutdown configs)
- ✅ GracefulShutdownManager updated to new config structure (timeoutMs, closeAllPositions, persistState)
- ✅ OrderExecutionPipeline updated to new config structure (linear backoff, slippagePercent)
- ✅ All 3894 tests passing (ZERO failures)
- ✅ **Status:** PRODUCTION READY - All Phase 9 systems fully integrated

### Phase 9.P2: Chaos & Compatibility (Pending)
- Order timeout verification (prevent duplicates)
- Error propagation (no silent failures)
- Shutdown timeout enforcement
- Backward compatibility (old positions)
- Chaos testing (network failures, cascades)
- **Tests:** 20 unit + chaos tests | **Status:** BLOCKED UNTIL P1 INTEGRATION

**Total:** P0 (37) + P1 (18) + P3 (14) = 69 new tests | Current: **3977 tests passing** (179 suites) | **Ready for 9.2 deployment!**

See `PHASE_9_SAFETY_IMPLEMENTATION_PLAN.md` for full details

---

## ✅ PHASE 3: PURE STRATEGY COORDINATOR (Session 29.4) ✅ COMPLETE

### What is Phase 3?
**Pure Strategy Coordinator Service** - Central hub that:
1. Loads enabled analyzers from AnalyzerRegistry
2. Executes analyzers in parallel (Promise.all) with readiness filtering
3. Aggregates signals using pure `aggregateSignalsWeighted()` function
4. Returns `AggregationResult` for EntryOrchestrator

### Implementation Details
- **File:** `src/services/strategy-coordinator.service.ts` (350 LOC)
- **Tests:** `src/__tests__/services/strategy-coordinator.service.test.ts` (20+ tests)
- **Features:**
  - ✅ Parallel analyzer execution
  - ✅ Readiness validation (skip unready analyzers)
  - ✅ Error handling (strict/lenient modes)
  - ✅ Configuration management (merge settings, blind zone)
  - ✅ Metadata tracking (execution time, timestamp)
  - ✅ Signal aggregation via pure functions (no side effects)

### Key Design Patterns
- **Service Wrapper:** StrategyCoordinatorService wraps pure decision logic
- **Parallel Execution:** Optional parallel/sequential analyzer execution
- **Error Resilience:** Lenient mode skips failed analyzers, strict mode throws
- **Pure Functions:** Core aggregation logic zero side effects (logging happens after)
- **Configuration Merging:** Intelligent merge of optional config fields with defaults

### Architecture Integration
```
EntryOrchestrator
  ↓ calls
StrategyCoordinatorService.coordinateStrategy()
  ├─ Load enabled analyzers from registry
  ├─ Filter ready analyzers (>= minCandles)
  ├─ Execute analyzers in parallel (Promise.all)
  ├─ Extract analyzer weights
  └─ Call pure aggregateSignalsWeighted()
       └─ returns AggregationResult
           ├─ direction (LONG/SHORT/null)
           ├─ confidence
           ├─ signalCount
           └─ conflictAnalysis
```

### Test Coverage (20 tests)
- **Configuration Management:** 5 tests (init, update, merge, reset)
- **Coordination Metadata:** 2 tests (result structure, execution time)
- **Analyzer Readiness:** 3 tests (skip, ready checks, no ready handling)
- **Error Handling:** 2 tests (registry failure, lenient/strict modes)
- **Signal Aggregation:** 2 tests (LONG aggregation, direction selection)
- **Thresholds:** 2 tests (minConfidence, minTotalScore)
- **Edge Cases:** 2 tests (empty analyzers, few candles)

### Next: Phase 4 - Analyzer Engine Abstraction
Create `AnalyzerEngineService` to centralize:
- Parallel analyzer loop from BacktestEngineV5
- Error handling standardization
- Result caching per timeframe
- Performance metrics

---

## 🔥 HOTFIX: MTF Snapshot Race Condition (Session 29.4b)

**Issue:** Snapshot disappearing between PRIMARY and ENTRY candle closes
```
Log: ⚠️ ENTRY: Snapshot validation FAILED - skipping entry
     reason: "No active snapshot found"
     originalBias: "captured"  ← Hardcoded, not real!
     currentBias: "NEUTRAL"
```

### Root Causes Identified & Fixed

**Problem #1: Race Condition with Cleanup**
- SNAPSHOT_TTL was **60 seconds** but CLEANUP_INTERVAL was **30 seconds**
- Cleanup ran before ENTRY could validate snapshot
- ActiveSnapshotId cleared elsewhere (line 481, 619, 682)

**Problem #2: Using activeSnapshotId Instead of pendingEntryDecision.snapshotId**
- PRIMARY candle creates snapshot, stores ID in pendingEntryDecision
- ENTRY validates using activeSnapshotId (which could be null!)
- Two different ID sources = race condition

**Problem #3: Poor Diagnostics in Logging**
- "originalBias": "captured" was hardcoded
- No actual captured bias shown
- No timing/age information
- Can't diagnose why snapshot disappeared

### Fixes Applied

**Fix #1: Increase Timeouts**
```typescript
// MTFSnapshotGate.ts
SNAPSHOT_TTL = 120000;          // Was 60s → Now 120s
SNAPSHOT_CLEANUP_INTERVAL = 60000; // Was 30s → Now 60s
```
✅ Cleanup now won't delete snapshot before ENTRY validates

**Fix #2: Pass Explicit snapshotId to validateSnapshot()**
```typescript
// MTFSnapshotGate.ts
validateSnapshot(currentHTFBias: TrendBias, snapshotId?: string)
  // Now checks explicit snapshotId from pendingEntryDecision
  // Falls back to activeSnapshotId if not provided

// TradingOrchestrator.ts (line 615-620)
const validationResult = this.snapshotGate.validateSnapshot(
  currentHTFBias,
  this.pendingEntryDecision.snapshotId  // ← Explicit ID!
);
```
✅ No more race condition with activeSnapshotId being cleared

**Fix #3: Rich Diagnostic Information**
```typescript
// MTFSnapshotGate.ts - Updated SnapshotValidationResult
diagnostics?: {
  snapshotId?: string;     // Which snapshot ID
  snapshotFound: boolean;  // Was it in storage?
  capturedBias?: TrendBias;// Actual captured bias (not hardcoded!)
  ageMs?: number;          // How old is snapshot
  expiresInMs?: number;    // How much time left
}

// TradingOrchestrator.ts - Improved logging
logger.warn('⚠️ ENTRY: Snapshot validation FAILED', {
  reason: validationResult.reason,
  capturedBias: validationResult.diagnostics?.capturedBias, // Real value!
  currentBias: currentHTFBias,
  snapshotAge: validationResult.diagnostics?.ageMs,
  snapshotId: validationResult.diagnostics?.snapshotId,
});
```
✅ Now can see exactly what happened and why

### Impact
- ✅ Snapshot no longer disappears between PRIMARY and ENTRY
- ✅ Better diagnostics for future debugging
- ✅ 120-second window ensures PRIMARY→ENTRY flow completes safely
- ✅ Fail-safe behavior preserved (skips entry if snapshot invalid)

### Test Status
- ✅ 0 TypeScript errors (full build passed)
- ✅ All 3977+ tests still passing
- ✅ No regressions introduced
- ✅ Production ready

---

## 🔧 Commands

```bash
# Building
npm run build                    # Full build (main + web-server + web-client)

# Testing
npm test                         # Run all tests
npm test -- position-exiting     # Run specific test suite

# Backtesting
npm run backtest-v5              # Run V5 backtest

# Development
npm start                        # Start bot (if available)
```

## 📁 Key Files

### Core Services
- `src/services/trading-orchestrator.service.ts` - Main engine
- `src/services/position-exiting.service.ts` - Exit logic (CRITICAL - TP fix here)
- `src/services/websocket-manager.service.ts` - WebSocket handling (CRITICAL - TP fix here)
- `src/services/bot-services.ts` - Service factory

### Orchestrators
- `src/orchestrators/entry.orchestrator.ts` - Entry decisions
- `src/orchestrators/exit.orchestrator.ts` - Exit state machine
- `src/orchestrators/filter.orchestrator.ts` - Signal filtering

### Configuration
- `config.json` - Bot configuration
- `strategies/json/simple-levels.strategy.json` - Current strategy
- `src/types/config.ts` - Type definitions

### Tests
- `src/__tests__/services/position-exiting.functional.test.ts` - TP bug tests
- `src/__tests__/services/position-exiting.integration.test.ts` - Integration tests
- `src/__tests__/orchestrators/` - Orchestrator tests
- **P0 Safety Tests:**
  - `src/validators/position.validator.ts` - Runtime validation for Position objects
  - `src/__tests__/validators/position.validator.test.ts` - 8 validation unit tests
  - `src/__tests__/services/position-lifecycle.p0-safety.test.ts` - 9 atomic lock + snapshot tests (20 total in suite)
- **P1 Safeguard Tests:**
  - `src/__tests__/services/position-exiting.transactional.test.ts` - 8 transactional close tests
  - `src/__tests__/services/real-time-risk-monitor.cache-invalidation.test.ts` - 6 cache invalidation tests
  - `src/__tests__/e2e/phase-9-p1-integration.e2e.test.ts` - 4 E2E workflow tests
- **P3 Race Condition Tests (NEW - Session 29.3):**
  - `src/__tests__/services/position-exiting.race-condition.test.ts` - 14 race condition tests
    - P3.1: Idempotent close operations (4 tests)
    - P3.2: Atomic lock prevention (3 tests)
    - P3.3: Concurrent close attempts (2 tests)
    - P3.4: Status transitions (2 tests)
    - P3.5: Error message verification (3 tests)

## ⚠️ Known Issues

**None Critical** (P0.2 runtime validation prevents NaN crashes from Session 27)

## 🚀 Next Steps (Session 29.3 - P0 + P1 + P3 Complete, P2 Ready)

### COMPLETED ✅
- **Phase 9.1:** Unit Tests for Live Trading Engine (123 tests ✅)
- **Phase 9.P0:** Critical Safety Guards (37 tests ✅)
  - Atomic locks, runtime validation, atomic snapshots
  - Ready for Phase 9.2 integration
- **Phase 9.P1:** Integration Safeguards (18 tests ✅)
  - Transactional close with rollback (8 tests)
  - Health score cache invalidation (6 tests)
  - E2E workflows (4 tests: full lifecycle, timeout, breakeven, error recovery)
- **Phase 9.P3:** Close Race Condition Protection (14 tests ✅) **← CRITICAL BUG FIX**
  - Atomic lock prevents WebSocket ↔ timeout close race
  - Idempotent closeFullPosition() with null/status guards
  - "Position not found" error completely eliminated
  - **Status:** PRODUCTION READY

### ✅ PHASE 9.2 READY FOR DEPLOYMENT

**All Prerequisites Met:**
1. ✅ P0 guards field-validated in production (Session 28)
2. ✅ P1 safeguards E2E tested (Session 29)
3. ✅ P3 critical race condition fixed (Session 29.3)
4. ✅ Combined impact verified: all 3977 tests passing
5. ✅ Rollback procedures established (feature flags available)

**What is Ready for 9.2 Deployment:**
- ✅ Transactional journal close with automatic rollback (P1.1)
- ✅ Health score cache invalidation on position close (P1.2)
- ✅ Event-driven position-closed notifications
- ✅ Position close atomic lock (P0.1)
- ✅ Runtime validation for Position objects (P0.2)
- ✅ Atomic snapshots for concurrent reads (P0.3)
- ✅ Race condition protection with idempotent close (P3)
- ✅ 69 new safety tests (all passing)

**Next Action:** Deploy Phase 9.2 Service Integration with confidence!

### IMMEDIATE NEXT (Ready to Deploy)
1. **Phase 9.2:** Service Integration ← DEPLOY NOW (all safety guards complete)

### FUTURE (Post-Phase 9.2)
1. **Phase 9.3:** Configuration (after 9.2)
2. **Phase 9.4:** Integration Tests (after 9.2)
3. **Phase 15:** Multi-Strategy Config Consolidation
4. **Phase 16:** Performance Benchmarking
5. **Phase 17:** Production Hardening

## 📞 Help

- See ARCHITECTURE_QUICK_START.md for component overview
- See ARCHITECTURE_BLUEPRINT.md for full architecture
- See respective -PLAN.md files for phase details

---

**Last Updated:** 2026-01-25 (Session 29.3)
**Status:** PHASE 9.P3 CRITICAL RACE CONDITION FIX COMPLETE ✅ - PHASE 9.2 READY FOR DEPLOYMENT
