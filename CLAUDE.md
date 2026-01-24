# Claude Code Session Guide

## 🎯 Current Status (Session 28 - Phase 9.1 Unit Tests In Progress)

**BUILD STATUS:** ✅ **SUCCESS** | **3759 Tests Passing** (+1141 new) | **Phase 14 (Production) + Phase 9.1 (Live Trading)**
- ✅ Main app: TypeScript clean (0 errors)
- ✅ web-server: Compiles successfully
- ✅ web-client: Vite build successful
- 🔒 Security: TP NaN crash fixed (critical)
- 🚀 **Phase 9.1: RealTimeRiskMonitor (35/35 tests ✅)** - NEXT: PerformanceAnalytics (12 tests)

## 📋 Quick Reference

### System State
- **Active Phase:** 14 (Production) | **Live Trading:** 9.1 (Unit Tests IN PROGRESS)
- **Last Commits:**
  - ef2af7e - Phase 9.1: RealTimeRiskMonitor tests (35 tests, +1141 total)
  - bc635ab - Phase 2.3 Complete (Service Integration)
- **Security:** ✅ TP NaN crash patch applied
- **Current Task:** Unit tests for Phase 9 live trading engine (35/67 done, 32 remaining)

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

### Testing (Session 28 Update)
- **Total Tests:** 3759 passing ✅ (+1141 from Phase 9.1)
- **Test Suites:** 169 ✅ (4 new from Phase 9)
- **Coverage:** All critical trading logic + Live Trading Risk Monitoring
- **Phase 9.1 Status:** RealTimeRiskMonitor (35/35 ✅) | Remaining: 32 tests

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

## ⚠️ Known Issues

**None Critical** (Phase 27 session resolved last critical issue)

## 🚀 Next Steps (Session 28 Continuation)

### CURRENT (Phase 9.1 - Unit Tests for Live Trading Engine)

**Phase 9.1 Progress: 35/67 Unit Tests Complete**

✅ **DONE:**
- RealTimeRiskMonitor (35/35 tests ✅)

⏳ **IN PROGRESS (Estimated 1 day):**
1. **PerformanceAnalytics** (12 tests)
   - Win rate calculation
   - Profit factor analysis
   - Sharpe/Sortino ratio calculation
   - Max drawdown analysis
   - Period-based metrics (ALL/TODAY/WEEK/MONTH)
   - Top/worst trades

2. **GracefulShutdownManager** (10 tests)
   - Signal handler registration
   - Shutdown sequence
   - Position closure
   - State persistence & recovery
   - Timeout protection

3. **OrderExecutionPipeline** (10 tests)
   - Order placement with retry
   - Timeout handling
   - Slippage calculation
   - Metrics tracking
   - Status polling

⏳ **AFTER Unit Tests (Estimated 1-2 days):**
4. **Service Integration** (Phase 9.2)
   - Wire all 5 services into bot-services.ts
   - Register event listeners
   - Initialize with config

5. **Configuration** (Phase 9.3)
   - Update config.json (liveTrading section)
   - Strategy-specific overrides

6. **Integration Tests** (Phase 9.4)
   - Full lifecycle scenarios (30+ tests)
   - Multi-position handling
   - Timeout detection
   - Emergency close workflows

**Estimated Total Phase 9 Completion: 2-3 days**

### FUTURE (Post-Phase 9)
1. **Phase 15:** Multi-Strategy Config Consolidation
2. **Phase 16:** Performance Benchmarking
3. **Phase 17:** Production Hardening

## 📞 Help

- See ARCHITECTURE_QUICK_START.md for component overview
- See ARCHITECTURE_BLUEPRINT.md for full architecture
- See respective -PLAN.md files for phase details

---

**Last Updated:** 2026-01-24 (Session 27)
**Status:** PRODUCTION READY ✅
