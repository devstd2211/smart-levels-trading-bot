# 🚀 PHASE 10.3C: EVENT TAGGING & FILTERING

## Status: 🎯 Ready for Implementation
**Session:** 24 (2026-01-22)
**Duration:** 1-2 days
**Priority:** High (completes multi-strategy event infrastructure)

---

## 📋 Objectives

Complete the multi-strategy event infrastructure by:
1. Add `strategyId` tagging to all core services
2. Implement per-strategy event filtering
3. Enable event routing to strategy-specific listeners
4. Comprehensive testing (30+ tests)

---

## 🎯 TASK 1: Add strategyId Tagging to Core Services

### 1a. PositionLifecycleService
**File:** `src/services/position-lifecycle.service.ts`
**Changes:**
```typescript
// Add to constructor
constructor(
  ...,
  private strategyId?: string  // NEW - Phase 10.3c
) {}

// In event publishing
this.eventBus.publishSync('POSITION_OPENED', {
  ...,
  strategyId: this.strategyId  // NEW - Phase 10.3c
});

this.eventBus.publishSync('POSITION_CLOSED', {
  ...,
  strategyId: this.strategyId  // NEW - Phase 10.3c
});
```

### 1b. ActionQueueService
**File:** `src/services/action-queue.service.ts`
**Changes:**
```typescript
constructor(
  ...,
  private strategyId?: string  // NEW - Phase 10.3c
) {}

// In action handler calls
this.eventBus.publishSync('ACTION_EXECUTED', {
  ...,
  strategyId: this.strategyId  // NEW - Phase 10.3c
});
```

### 1c. EntryOrchestrator
**File:** `src/orchestrators/entry.orchestrator.ts`
**Changes:**
```typescript
constructor(
  ...,
  private strategyId?: string  // NEW - Phase 10.3c
) {}

// In signal emission
this.eventBus.publishSync('SIGNAL_NEW', {
  ...,
  strategyId: this.strategyId  // NEW - Phase 10.3c
});
```

### 1d. ExitOrchestrator
**File:** `src/orchestrators/exit.orchestrator.ts`
**Changes:**
```typescript
constructor(
  ...,
  private strategyId?: string  // NEW - Phase 10.3c
) {}

// In exit signal emission
this.eventBus.publishSync('EXIT_SIGNAL', {
  ...,
  strategyId: this.strategyId  // NEW - Phase 10.3c
});
```

---

## 🎯 TASK 2: Update TradingOrchestrator Creation

### Update getOrCreateStrategyOrchestrator()
**File:** `src/services/multi-strategy/strategy-orchestrator.service.ts`
**Changes:**
```typescript
private async getOrCreateStrategyOrchestrator(
  context: IsolatedStrategyContext
): Promise<TradingOrchestrator | null> {
  // ... existing cache check ...

  try {
    // ... existing orchestrator creation ...

    // Phase 10.3c: Pass strategyId to all services
    const positionLifecycle = new PositionLifecycleService(
      ...,
      context.strategyId  // NEW - Phase 10.3c
    );

    const actionQueue = new ActionQueueService(
      ...,
      context.strategyId  // NEW - Phase 10.3c
    );

    const entryOrch = new EntryOrchestrator(
      ...,
      context.strategyId  // NEW - Phase 10.3c
    );

    const exitOrch = new ExitOrchestrator(
      ...,
      context.strategyId  // NEW - Phase 10.3c
    );

    // ... rest of orchestrator creation ...
  } catch (error) {
    // ... error handling ...
  }
}
```

---

## 🎯 TASK 3: Implement Per-Strategy Event Filtering

### Create Event Filter Service (NEW)
**File:** `src/services/multi-strategy/event-filter.service.ts`
**Implementation:**
```typescript
export class StrategyEventFilterService {
  private strategyListeners = new Map<
    string,  // strategyId
    Map<string, Set<(event: any) => void>>  // eventType -> callbacks
  >();

  /**
   * Register listener for specific strategy + event type
   */
  onStrategyEvent(
    strategyId: string,
    eventType: string,
    callback: (event: any) => void
  ): void {
    if (!this.strategyListeners.has(strategyId)) {
      this.strategyListeners.set(strategyId, new Map());
    }
    const strategyEvents = this.strategyListeners.get(strategyId)!;
    if (!strategyEvents.has(eventType)) {
      strategyEvents.set(eventType, new Set());
    }
    strategyEvents.get(eventType)!.add(callback);
  }

  /**
   * Remove strategy listener
   */
  offStrategyEvent(
    strategyId: string,
    eventType: string,
    callback: (event: any) => void
  ): void {
    const strategyEvents = this.strategyListeners.get(strategyId);
    if (strategyEvents) {
      strategyEvents.get(eventType)?.delete(callback);
    }
  }

  /**
   * Route event to strategy-specific listeners
   */
  routeStrategyEvent(event: any): void {
    if (!event.strategyId) return;  // Skip events without strategyId

    const strategyEvents = this.strategyListeners.get(event.strategyId);
    if (!strategyEvents) return;

    const callbacks = strategyEvents.get(event.type);
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(event);
        } catch (error) {
          // Log but don't propagate
          console.error(`Error in strategy event handler: ${error}`);
        }
      });
    }
  }

  /**
   * Clear all listeners for strategy
   */
  clearStrategyListeners(strategyId: string): void {
    this.strategyListeners.delete(strategyId);
  }
}
```

---

## 🧪 TASK 4: Create Comprehensive Test Suite

### Test File: `src/__tests__/phase-10-3c-event-tagging.test.ts`

**Test Categories (30+ tests):**

#### 4a. strategyId Tagging Tests (10 tests)
```
✓ PositionLifecycleService tags POSITION_OPENED with strategyId
✓ PositionLifecycleService tags POSITION_CLOSED with strategyId
✓ ActionQueueService tags ACTION_EXECUTED with strategyId
✓ EntryOrchestrator tags SIGNAL_NEW with strategyId
✓ ExitOrchestrator tags EXIT_SIGNAL with strategyId
✓ All core events include strategyId
✓ Events without strategyId work for backward compatibility
✓ Multiple strategies emit correct strategyId per event
✓ strategyId preserved through event bus
✓ strategyId in event metadata matches context
```

#### 4b. Event Filtering Tests (8 tests)
```
✓ StrategyEventFilterService registers listener correctly
✓ StrategyEventFilterService routes to correct listener
✓ Filter ignores events without strategyId
✓ Multiple listeners per strategy fire independently
✓ Multiple strategies receive own events only
✓ offStrategyEvent removes listener properly
✓ clearStrategyListeners cleans up all listeners
✓ Event routing handles errors gracefully
```

#### 4c. Integration Tests (8 tests)
```
✓ PositionLifecycleService + EventFilter integration
✓ ActionQueueService + EventFilter integration
✓ Full trading cycle with event tagging
✓ Multi-strategy event isolation
✓ Event ordering maintained per strategy
✓ No cross-strategy event leakage
✓ Performance: 1000 events/second with tagging
✓ Memory: No leaks with large event volumes
```

#### 4d. Backward Compatibility Tests (4 tests)
```
✓ Single-strategy mode works without strategyId
✓ Events without strategyId still emit correctly
✓ Existing listeners work unchanged
✓ Old code compatible with tagged events
```

---

## 📐 Architecture After Phase 10.3c

```
WebSocket Event (candleClosed)
  ↓
WebSocketEventHandlerManager
  ↓
StrategyOrchestratorService.onCandleClosed()
  ├─ Get active context
  ├─ getOrCreateStrategyOrchestrator(context.strategyId)
  │   └─ TradingOrchestrator (with strategyId injection)
  │       ├─ PositionLifecycleService (strategyId)
  │       ├─ ActionQueueService (strategyId)
  │       ├─ EntryOrchestrator (strategyId)
  │       └─ ExitOrchestrator (strategyId)
  │           ↓
  │         All events tagged with strategyId
  │
  └─ EventBus.publishSync(event)
      ↓
    StrategyEventFilterService
      └─ Route to strategy-specific listeners only
          ↓
        Strategy A listeners (receive Strategy A events)
        Strategy B listeners (receive Strategy B events)
```

---

## ✅ Success Criteria

1. ✅ All 4 core services accept optional `strategyId`
2. ✅ All events from services include `strategyId` field
3. ✅ StrategyEventFilterService routes events correctly
4. ✅ 30+ comprehensive tests (100% passing)
5. ✅ 0 TypeScript errors
6. ✅ Full build success
7. ✅ Backward compatibility maintained (no breaking changes)
8. ✅ No cross-strategy event leakage
9. ✅ Performance acceptable (< 5% overhead)

---

## 📊 Files to Modify/Create

**New Files:**
- `src/services/multi-strategy/event-filter.service.ts` (NEW - 100 LOC)
- `src/__tests__/phase-10-3c-event-tagging.test.ts` (NEW - 500 LOC)

**Modified Files:**
- `src/services/position-lifecycle.service.ts` (add strategyId param + tagging)
- `src/services/action-queue.service.ts` (add strategyId param + tagging)
- `src/orchestrators/entry.orchestrator.ts` (add strategyId param + tagging)
- `src/orchestrators/exit.orchestrator.ts` (add strategyId param + tagging)
- `src/services/multi-strategy/strategy-orchestrator.service.ts` (pass strategyId to services)

**Total Impact:**
- ~100 LOC new code (EventFilterService)
- ~50 LOC modifications (strategyId params + tagging)
- ~500 LOC tests (comprehensive coverage)
- **Total: 650 LOC**

---

## 🎯 Implementation Order

1. **Step 1** (30m): Create EventFilterService
2. **Step 2** (1h): Add strategyId tagging to 4 core services
3. **Step 3** (1h): Update TradingOrchestrator creation to pass strategyId
4. **Step 4** (2h): Write 30+ comprehensive tests
5. **Step 5** (30m): Verify build + update documentation

**Total Time: 4-5 hours**

---

## 🔗 Related Files

- `PHASE_10_3B_IMPLEMENTATION_PLAN.md` - Previous phase
- `ARCHITECTURE_QUICK_START.md` - Architecture overview
- `src/services/multi-strategy/strategy-orchestrator.service.ts` - Main orchestration

---

**Version:** 1.0
**Created:** 2026-01-22 (Session 24)
**Status:** Ready for implementation
