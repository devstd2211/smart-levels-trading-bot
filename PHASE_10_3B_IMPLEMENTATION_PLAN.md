# 🚀 PHASE 10.3B: ISOLATED TRADINGORBCHESTRATOR PER STRATEGY
## Implementation Plan (Week 2)

**Status:** 🎯 Ready for Implementation
**Session:** 22 (2026-01-22)
**Duration:** 2-3 days

---

## 📐 Architecture Pattern (LEGO модули из конфига)

```
IsolatedStrategyContext (contains config + exchange)
    ↓
getOrCreateStrategyOrchestrator()
    ├─ Check cache (hit? return existing)
    ├─ Miss → Create NEW TradingOrchestrator
    │   ├─ Load indicators via IndicatorLoader (только из config)
    │   ├─ Load analyzers via AnalyzerLoader (только из config)
    │   ├─ Create PositionLifecycleService (с strategyId)
    │   ├─ Create ActionQueueService (с strategyId)
    │   ├─ Create EntryOrchestrator, ExitOrchestrator
    │   └─ Cache result
    └─ Return orchestrator

Key: ВСЕ из конфига, НИЧЕГО хардкода!
```

---

## 🎯 TASK 1: Implement getOrCreateStrategyOrchestrator()

**File:** `src/services/multi-strategy/strategy-orchestrator.service.ts` (lines 338-370)

**Current State:**
```typescript
private getOrCreateStrategyOrchestrator(context: IsolatedStrategyContext): any | null {
  // TODO: Implement full orchestrator creation
}
```

**Implementation Steps:**

1. **Check Cache First** (5 LOC)
   - Если в `this.tradingOrchestratorCache` есть ключ `strategyId`
   - Вернуть существующий

2. **Create new TradingOrchestrator** (150 LOC total)
   - Создать конфиг из `context.config`
   - Создать PositionLifecycleService с `strategyId`
   - Создать ActionQueueService с `strategyId`
   - Создать новый TradingOrchestrator через `new TradingOrchestrator(...)`
   - Сохранить в кеш

3. **Wire Event Handlers** (20 LOC)
   - Слушать события от TradingOrchestrator
   - Добавлять `strategyId` к каждому событию

4. **Error Handling** (10 LOC)
   - Try-catch с логированием
   - Вернуть null если ошибка

---

## 🎯 TASK 2: Integrate StrategyOrchestratorCacheService

**File:** `src/services/multi-strategy/strategy-orchestrator.service.ts`

**Changes:**
1. Импортировать `StrategyOrchestratorCacheService`
2. В constructor добавить `private cache: StrategyOrchestratorCacheService`
3. Заменить `this.tradingOrchestratorCache` на методы cache service
4. Использовать `cache.getOrchestrator()`, `cache.cacheOrchestrator()`, `cache.removeOrchestrator()`

---

## 🎯 TASK 3: Add strategyId Tagging to Events

**Files to Modify:**

### 3a. PositionLifecycleService
- Добавить `strategyId?: string` в constructor
- Сохранить `this.strategyId = strategyId`
- В каждом `this.eventBus.publish()` добавить `strategyId: this.strategyId`

### 3b. ActionQueueService
- Добавить `strategyId?: string` в constructor
- В каждом `this.eventBus.publish()` добавить `strategyId: this.strategyId`

### 3c. EntryOrchestrator
- Добавить `strategyId?: string` в constructor
- В `publishSync('SIGNAL_NEW', ...)` добавить `strategyId: this.strategyId`

### 3d. ExitOrchestrator
- Добавить `strategyId?: string` в constructor
- В `publishSync('EXIT_SIGNAL', ...)` добавить `strategyId: this.strategyId`

---

## 🎯 TASK 4: Update BotServices Initialization

**File:** `src/services/bot-services.ts` (lines 559-580)

**Current TODO:**
```typescript
// TODO Phase 10.3: Initialize factory + state manager
```

**Changes:**
1. Создать `StrategyFactoryService` (если null)
2. Создать `StrategyStateManagerService` (если null)
3. Инициализировать `StrategyOrchestratorService` с реальными сервисами

---

## 🧪 TASK 5: Create Integration Tests

**File:** `src/__tests__/phase-10-3b-orchestrator-implementation.test.ts` (NEW - 400 LOC)

**Test Categories:**

### 5a. getOrCreateStrategyOrchestrator() Tests (10 tests)
```
✓ Creates new TradingOrchestrator on first call
✓ Returns cached orchestrator on second call
✓ Loads strategy-specific indicators only
✓ Loads strategy-specific analyzers only
✓ Tags events with strategyId
✓ Handles missing context gracefully
✓ Handles TradingOrchestrator creation error
✓ Cache statistics reflect access patterns
✓ Cleanup removes from cache
✓ Multiple strategies cached independently
```

### 5b. Event Tagging Tests (8 tests)
```
✓ PositionLifecycleService tags POSITION_OPENED
✓ PositionLifecycleService tags POSITION_CLOSED
✓ ActionQueueService tags ACTION_EXECUTED
✓ EntryOrchestrator tags SIGNAL_NEW
✓ ExitOrchestrator tags EXIT_SIGNAL
✓ Events routed to correct strategy listeners
✓ strategyId propagates through system
✓ Events without strategyId still work (backward compat)
```

### 5c. Service Isolation Tests (8 tests)
```
✓ Strategy A positions isolated from Strategy B
✓ Strategy A journal isolated from Strategy B
✓ Strategy A indicators isolated from Strategy B
✓ Strategy A analyzers isolated from Strategy B
✓ Strategy A action queue independent
✓ Position queries filtered by strategyId
✓ No cross-strategy state leakage
✓ Cleanup removes all strategy state
```

### 5d. Multi-Strategy Integration Tests (6 tests)
```
✓ Load 2 strategies successfully
✓ Switch active strategy in <100ms
✓ Inactive strategy dormant (no candles)
✓ Active strategy processes candles
✓ Unload strategy cleanup complete
✓ Reload strategy reuses cache
```

---

## 📝 Implementation Sequence

### Day 1: Core Implementation (5-6 hours)
- [ ] Task 1: Implement getOrCreateStrategyOrchestrator() (150 LOC)
- [ ] Task 2: Integrate StrategyOrchestratorCacheService (20 LOC)
- [ ] Compilation check - 0 TypeScript errors

### Day 2: Event Tagging (4-5 hours)
- [ ] Task 3a: PositionLifecycleService strategyId (20 LOC)
- [ ] Task 3b: ActionQueueService strategyId (20 LOC)
- [ ] Task 3c: EntryOrchestrator strategyId (15 LOC)
- [ ] Task 3d: ExitOrchestrator strategyId (15 LOC)
- [ ] Compilation check - 0 TypeScript errors

### Day 3: Testing & Documentation (4-5 hours)
- [ ] Task 4: Update BotServices (30 LOC)
- [ ] Task 5: Create integration tests (400 LOC, 32 tests)
- [ ] All tests passing (32/32 ✅)
- [ ] Update ARCHITECTURE_QUICK_START.md
- [ ] Update CLAUDE.md
- [ ] Final build success

---

## ✅ Success Criteria

- [ ] 0 TypeScript errors
- [ ] 32 new tests, 100% passing
- [ ] getOrCreateStrategyOrchestrator() fully implemented
- [ ] strategyId tagging on all events
- [ ] Service isolation verified
- [ ] Multi-strategy switching works (<100ms)
- [ ] Cache statistics working
- [ ] Backward compatibility maintained
- [ ] Documentation updated

---

## 🔗 Code References

**Key Files:**
- `src/services/multi-strategy/strategy-orchestrator.service.ts:338` - Main implementation
- `src/services/multi-strategy/strategy-orchestrator-cache.service.ts` - Cache service
- `src/services/bot-services.ts:559` - BotServices integration
- `src/services/position-lifecycle.service.ts` - Event tagging
- `src/services/action-queue.service.ts` - Event tagging
- `src/orchestrators/entry.orchestrator.ts` - Event tagging
- `src/orchestrators/exit.orchestrator.ts` - Event tagging

**Test File:**
- `src/__tests__/phase-10-multi-strategy.test.ts` - Reference tests

---

## 📊 Deliverables

1. ✅ Implemented getOrCreateStrategyOrchestrator() - 150 LOC
2. ✅ Integrated StrategyOrchestratorCacheService - 20 LOC
3. ✅ strategyId tagging throughout - 70 LOC
4. ✅ BotServices initialization - 30 LOC
5. ✅ Integration tests - 400 LOC (32 tests)
6. ✅ Documentation updates
7. ✅ 0 TypeScript errors
8. ✅ Backward compatibility maintained

**Total New Code:** ~670 LOC + 400 LOC tests

---

**Next Phase:** Phase 10.4 - Per-Symbol Strategy Allocation
