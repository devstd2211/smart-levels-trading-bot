# Claude Code Session Guide

## 🎯 Current Status

**BUILD STATUS:** ✅ **SUCCESS** | **4311 Tests Passing** | **ZERO Regressions**

**Completed Phases:**
- ✅ Phase 0: Core Types & Decision Engine (132 tests)
- ✅ Phase 3: Strategy Coordinator (20 tests)
- ✅ Phase 4: Analyzer Engine (28 tests)
- ✅ Phase 5: Dependency Injection (16 tests)
- ✅ Phase 6: Repository Pattern (152 tests)
- ✅ Phase 7: Error Handling System (138 tests)
- ✅ Phase 8: ErrorHandler Integration (132 tests - Stages 1-5)
- ✅ Phase 9: Live Trading Engine + Safety Guards (123 tests)

**Current Phase:** 8.5 (RealTimeRiskMonitor) ✅ COMPLETE

---

## 📚 Learning Path

**For architecture deep-dive:** See `ARCHITECTURE_QUICK_START.md`
- Component overview and relationships
- Phase implementation details
- System design patterns

---

## 🔧 Commands

```bash
# Testing
npm test                               # Run all tests
npm test -- position-exiting           # Run specific test suite

# Building
npm run build                          # Full build (TypeScript + web server + web client)

# Backtesting
npm run backtest-v5                    # Run V5 backtest
```

---

## 📁 Key Files

### Core Services
- `src/services/trading-orchestrator.service.ts` - Main trading engine
- `src/services/position-exiting.service.ts` - Position exit logic with atomic locks
- `src/services/websocket-manager.service.ts` - Real-time market data handling
- `src/services/bot-services.ts` - Service factory and dependency injection

### Error Handling (Phase 7-8)
- `src/errors/ErrorHandler.ts` - Recovery strategies (RETRY, FALLBACK, GRACEFUL_DEGRADE, SKIP, THROW)
- `src/errors/DomainErrors.ts` - 16 specialized domain error types
- `src/errors/ErrorRegistry.ts` - Centralized error telemetry

### Data Access (Phase 6)
- `src/repositories/IRepositories.ts` - Repository interfaces
- `src/repositories/PositionMemoryRepository.ts` - Position storage (18 tests)
- `src/repositories/JournalFileRepository.ts` - Trade persistence (18 tests)
- `src/repositories/MarketDataCacheRepository.ts` - Candle caching (18 tests)

### Orchestrators
- `src/orchestrators/entry.orchestrator.ts` - Entry decision logic
- `src/orchestrators/exit.orchestrator.ts` - Exit state machine (TP1 → TP2 → TP3)
- `src/orchestrators/filter.orchestrator.ts` - Signal filtering

### Configuration
- `config.json` - Bot configuration
- `strategies/json/simple-levels.strategy.json` - Current strategy (TP: 0.5%, 1%, 1.5%)

### Tests
- `src/__tests__/services/` - All service tests (4000+ tests)
- `src/__tests__/orchestrators/` - Orchestrator tests (140+ tests)
- Phase 8 Error Handling Tests:
  - `trading-orchestrator.error-handling.test.ts` (12 tests)
  - `position-exiting.error-handling.test.ts` (22 tests)
  - `bybit.error-handling.test.ts` (17 tests)
  - `order-execution-pipeline.error-handling.test.ts` (27 tests)
  - `graceful-shutdown.error-handling.test.ts` (22 tests)
  - `real-time-risk-monitor.error-handling.test.ts` (15 tests) ← Phase 8.5

---

## 🏗️ Architecture Overview

```
Trading Bot (Main Engine)
├─ TradingOrchestrator [SKIP recovery]
│  ├─ StrategyCoordinatorService (parallel analyzer execution)
│  ├─ EntryOrchestrator (signal ranking, MTF validation)
│  └─ ExitOrchestrator (state machine for TP levels)
│
├─ BybitService [RETRY + GRACEFUL_DEGRADE recovery] ← Phase 8.3
│  ├─ OrderExecutionPipeline [RETRY strategy] ← Phase 8.3
│  ├─ Positions (open/close operations)
│  ├─ Orders (TP, SL management)
│  └─ MarketData (candle fetching + caching)
│
├─ PositionExitingService [RETRY + FALLBACK + SKIP] ← Phase 8.2
│  ├─ Atomic lock pattern (prevents concurrent closes)
│  ├─ Journal recording (transactional)
│  └─ Telegram notifications (non-blocking)
│
├─ GracefulShutdownManager [RETRY + GRACEFUL_DEGRADE + FALLBACK] ← Phase 8.4
│  ├─ Order cancellation with RETRY strategy
│  ├─ State persistence with GRACEFUL_DEGRADE (never blocks)
│  └─ State recovery with FALLBACK strategy
│
├─ RealTimeRiskMonitor [GRACEFUL_DEGRADE + SKIP] ← Phase 8.5
│  ├─ Position validation with cached health scores
│  ├─ Price validation with fallback to entry price
│  └─ Event publishing with non-blocking failure handling
│
├─ Data Layer (Phase 6)
│  ├─ PositionRepository (in-memory, O(1) access)
│  ├─ JournalRepository (file-based persistence)
│  └─ MarketDataRepository (LRU cache with TTL)
│
└─ Error Handling (Phase 7-8)
   ├─ ErrorHandler (5 recovery strategies)
   ├─ Error classification (domain-specific errors)
   └─ ErrorRegistry (telemetry & statistics)
```

---

## ✅ Key Features

### Error Handling (Phase 7-8)
- **5 Recovery Strategies:** RETRY (exponential backoff), FALLBACK, GRACEFUL_DEGRADE, SKIP, THROW
- **Error Classification:** Bybit retCodes → domain-specific errors (PositionNotFound, InsufficientBalance, etc.)
- **Exponential Backoff:** 100ms → 200ms → 400ms (configurable multiplier)
- **Callbacks:** onRetry, onRecover, onFailure for monitoring

### Data Management (Phase 6)
- **Repository Pattern:** Abstracts data access layer
- **LRU Caching:** Bounded memory with TTL expiration
- **Concurrent Safety:** Atomic operations for race condition prevention

### Live Trading (Phase 9)
- **Atomic Locks:** Prevents WebSocket ↔ timeout close race condition
- **Runtime Validation:** Catches NaN crashes from type mismatches
- **Atomic Snapshots:** Safe concurrent reads during live updates

---

## 🧪 Testing

- **Total Tests:** 4311 passing (100% pass rate)
- **Test Suites:** 200 test files
- **Coverage:** All critical trading logic
- **Latest Tests:** Phase 8.5 (15 new tests for RealTimeRiskMonitor)

Run specific test categories:
```bash
npm test -- "error-handling"           # All error handling tests
npm test -- "bybit"                    # All Bybit service tests
npm test -- "position-exiting"         # Position close tests
```

---

## ⚠️ Known Issues

**None Critical.** Phase 9 runtime validation prevents NaN crashes from type mismatches.

Pre-existing TypeScript errors in test utilities (non-production code) don't affect runtime execution.

---

## 🚀 Next Steps

**Phase 8 Stages 6-7:** ErrorHandler integration into remaining services
- ✅ RealTimeRiskMonitor (GRACEFUL_DEGRADE with fallback cache) ← Phase 8.5 COMPLETE
- WebSocketEventHandler (SKIP for invalid data, error propagation)
- Additional services (~25+ new tests remaining)

**Phase 9 Continuation:** Advanced trading features
- Dynamic position sizing
- Advanced order management
- Real-time risk limits

---

**Last Updated:** 2026-01-27 | **Session:** 37
**Status:** Phase 8.1-8.5 ✅ COMPLETE | Phase 9 ✅ COMPLETE | 4311 Tests Passing
