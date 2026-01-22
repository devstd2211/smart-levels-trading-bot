# 🚀 PHASE 10.3: ISOLATED TRADINGORBCHESTRATOR PER STRATEGY

**Status:** 🎯 WEEK 1 COMPLETE - CORE INFRASTRUCTURE IMPLEMENTED (e33312f)

**Session 21:** Plan & Architecture Analysis
**Session 21+:** Week 1 Implementation Complete! ✅

**Objective:** Create completely isolated TradingOrchestrator instances per strategy with full service separation, enabling true parallel execution while maintaining independent state, decision logic, and event handling.

**Duration:** 2-3 weeks

**Expected Outcomes:**
- ✅ Isolated TradingOrchestrator creation per strategy
- ✅ Per-strategy service instances (PositionManager, ActionQueue, Analyzers)
- ✅ Strategy-specific indicator loading
- ✅ Event tagging with strategyId throughout system
- ✅ 60+ comprehensive tests (100% passing)
- ✅ 0 TypeScript errors
- ✅ Backward compatibility maintained

---

## 📊 Current State (Phase 10.2)

### What's Working ✅
- ✅ Candle routing framework implemented
- ✅ Event infrastructure with optional strategyId
- ✅ Position/Event interfaces enhanced
- ✅ StrategyOrchestratorService.onCandleClosed() routing logic
- ✅ Backward compatibility with single-strategy mode

### What's Missing ❌
- ❌ TradingOrchestrator creation not implemented (placeholder at line 338-370)
- ❌ Per-strategy service instances not created
- ❌ Per-strategy indicator loading not implemented
- ❌ strategyId event tagging incomplete
- ❌ Service isolation verification tests missing

---

## 🏗️ Architecture Design

### Service Dependency Graph Per Strategy

```
IsolatedStrategyContext (from StrategyFactoryService)
    ├─ config: ConfigNew (merged base + strategy)
    ├─ strategy: StrategyConfig (strategy.json)
    ├─ exchange: IExchange
    └─ journal: IPositionJournal
            ↓
    [NEW] TradingOrchestratorFactory.create()
            ↓
TradingOrchestrator [Per-Strategy Instance]
    ├─ [NEW] PositionLifecycleService [Per-Strategy]
    │   ├─ exchange: IExchange
    │   ├─ journal: IPositionJournal (strategy-scoped)
    │   ├─ logger: LoggerService
    │   └─ strategyId: string (for event tagging)
    │
    ├─ [NEW] ActionQueueService [Per-Strategy]
    │   ├─ OpenPositionHandler (strategy-scoped)
    │   ├─ ClosePercentHandler (strategy-scoped)
    │   ├─ UpdateStopLossHandler (strategy-scoped)
    │   └─ ActivateTrailingHandler (strategy-scoped)
    │
    ├─ [NEW] AnalyzerRegistryService [Per-Strategy]
    │   ├─ Strategy-specific analyzers (from strategy.json)
    │   └─ Strategy-specific indicators (loaded by strategy)
    │
    ├─ [NEW] IndicatorRegistry [Per-Strategy]
    │   └─ Only indicators used by strategy (not all 6)
    │
    ├─ Shared Services (from BotServices):
    │   ├─ CandleProvider (shared - market data)
    │   ├─ RiskManager (TBD - per-strategy or shared?)
    │   ├─ BotEventBus (shared - filtered by strategyId)
    │   └─ Logger (shared)
    │
    └─ Per-Strategy Decision Engine:
        ├─ EntryOrchestrator (per-strategy)
        ├─ ExitOrchestrator (per-strategy)
        ├─ MTFSnapshotGate (per-strategy)
        └─ FilterOrchestrator (per-strategy)
```

---

## 📋 Implementation Tasks

### Task 1: Create TradingOrchestratorFactory (Week 1)

**File:** `src/services/multi-strategy/trading-orchestrator-factory.ts` (NEW - ~250 LOC)

**Responsibilities:**
1. Create isolated TradingOrchestrator instance
2. Load strategy-specific configuration
3. Create per-strategy service instances
4. Wire up event handlers with strategyId
5. Initialize analyzers with strategy weights
6. Load only used indicators

**Key Methods:**
```typescript
class TradingOrchestratorFactory {
  constructor(
    private exchangeFactory: ExchangeFactory,
    private logger: LoggerService,
    private sharedServices: SharedServiceContainer
  ) {}

  async createStrategyOrchestrator(
    context: IsolatedStrategyContext
  ): Promise<TradingOrchestrator>

  private async createPerStrategyServices(
    context: IsolatedStrategyContext
  ): Promise<StrategyServiceContainer>

  private async loadStrategyIndicators(
    config: ConfigNew
  ): Promise<IIndicator[]>

  private initializeStrategyAnalyzers(
    context: IsolatedStrategyContext,
    indicators: IIndicator[]
  ): IAnalyzer[]
}
```

**Testing:**
- Factory creates valid TradingOrchestrator
- Services are properly isolated
- Config merging applied
- Indicators loaded correctly
- Analyzers initialized with weights
- Event handlers wired with strategyId

### Task 2: Create StrategyServiceContainer (Week 1)

**File:** `src/services/multi-strategy/strategy-service-container.ts` (NEW - ~150 LOC)

**Purpose:** Hold all per-strategy service instances

**Structure:**
```typescript
interface IStrategyServiceContainer {
  // Core services
  positionManager: IPositionLifecycleService;
  actionQueue: ActionQueueService;
  analyzerRegistry: AnalyzerRegistryService;
  indicatorRegistry: IndicatorRegistry;

  // Decision engines
  entryOrchestrator: EntryOrchestrator;
  exitOrchestrator: ExitOrchestrator;
  filterOrchestrator: FilterOrchestrator;
  mtfGate: MTFSnapshotGate;

  // Strategy metadata
  strategyId: string;
  config: ConfigNew;
  strategy: StrategyConfig;
}
```

**Benefits:**
- Centralized access to all strategy services
- Easier cleanup/destruction
- Type-safe service references
- Clear dependency graph

### Task 3: Implement getOrCreateStrategyOrchestrator() (Week 1)

**File:** `src/services/multi-strategy/strategy-orchestrator.service.ts` (MODIFY - lines 338-370)

**Current Placeholder:**
```typescript
private getOrCreateStrategyOrchestrator(context: IsolatedStrategyContext): any | null {
    // TODO: Implement full orchestrator creation
}
```

**New Implementation (100-150 LOC):**
```typescript
private async getOrCreateStrategyOrchestrator(
  context: IsolatedStrategyContext
): Promise<TradingOrchestrator | null> {
  try {
    // Check cache first
    if (this.tradingOrchestratorCache.has(context.strategyId)) {
      return this.tradingOrchestratorCache.get(context.strategyId)!;
    }

    // Create factory if not exists
    if (!this.orchestratorFactory) {
      this.orchestratorFactory = new TradingOrchestratorFactory(
        this.logger,
        this.sharedServices
      );
    }

    // Create isolated orchestrator
    const orchestrator = await this.orchestratorFactory.create(
      context,
      this.sharedServices
    );

    // Cache for reuse
    this.tradingOrchestratorCache.set(context.strategyId, orchestrator);

    // Wire event listeners with strategyId
    orchestrator.on('candleProcessed', (data) => {
      this.eventBus.publish({
        type: 'CANDLE_ROUTED_TO_STRATEGY',
        strategyId: context.strategyId,
        data
      });
    });

    return orchestrator;
  } catch (error) {
    this.logger.error(`Failed to create orchestrator for ${context.strategyId}:`, error);
    return null;
  }
}
```

**Cache Management:**
- Key: strategyId
- Value: TradingOrchestrator instance
- Lifetime: Strategy lifecycle
- Cleanup: On strategy unload

### Task 4: Add strategyId Event Tagging (Week 1-2)

**Files to Modify:**

1. **`src/services/position-lifecycle.service.ts`** (~20 LOC)
   ```typescript
   constructor(
     // ... existing params
     private strategyId?: string  // NEW
   ) {}

   // All event emissions add strategyId
   this.eventBus.publish('POSITION_OPENED', {
     position: pos,
     strategyId: this.strategyId  // NEW
   });
   ```

2. **`src/services/action-queue.service.ts`** (~20 LOC)
   ```typescript
   constructor(
     // ... existing params
     private strategyId?: string  // NEW
   ) {}

   // Tag action execution events
   this.eventBus.publish('ACTION_EXECUTED', {
     action,
     strategyId: this.strategyId  // NEW
   });
   ```

3. **`src/orchestrators/entry.orchestrator.ts`** (~20 LOC)
   ```typescript
   // Tag entry signals
   this.eventBus.publish('SIGNAL_NEW', {
     signal,
     strategyId: this.strategyId  // NEW if available
   });
   ```

4. **`src/orchestrators/exit.orchestrator.ts`** (~20 LOC)
   ```typescript
   // Tag exit decisions
   this.eventBus.publish('EXIT_SIGNAL', {
     signal,
     strategyId: this.strategyId  // NEW
   });
   ```

### Task 5: Update BotServices Initialization (Week 1-2)

**File:** `src/services/bot-services.ts` (MODIFY - lines 559-590)

**Current State:**
```typescript
if (this.configService.config.multiStrategy?.enabled) {
  // TODO Phase 10.3: Initialize factory + create per-strategy orchestrators
}
```

**New Implementation:**
```typescript
if (this.configService.config.multiStrategy?.enabled) {
  // Initialize orchestrator factory
  this.orchestratorFactory = new TradingOrchestratorFactory(
    this.logger,
    this.createSharedServiceContainer()
  );

  // Initialize strategy orchestrator with factory
  this.strategyOrchestrator = new StrategyOrchestratorService(
    this.logger,
    this.configService,
    this.orchestratorFactory,
    this.eventBus,
    this.riskManager
  );

  // Load initial strategies
  await this.strategyOrchestrator.loadInitialStrategies();

  // Wire WebSocket routing to strategy orchestrator
  this.websocketManager.setStrategyOrchestrator(this.strategyOrchestrator);
}
```

### Task 6: Comprehensive Test Suite (Week 2-3)

**File:** `src/__tests__/phase-10-3-orchestrator-isolation.test.ts` (NEW - ~500 LOC)

**Test Coverage: 60+ tests**

#### Unit Tests: TradingOrchestratorFactory (15 tests)
```typescript
describe('TradingOrchestratorFactory', () => {
  // Creation tests
  test('creates TradingOrchestrator with isolated services')
  test('loads strategy-specific configuration')
  test('merges base and strategy configs correctly')
  test('creates per-strategy PositionLifecycleService')
  test('creates per-strategy ActionQueueService')
  test('creates per-strategy AnalyzerRegistry')
  test('loads only used indicators from strategy')
  test('initializes analyzers with strategy weights')
  test('wires event handlers with strategyId')
  test('caches created orchestrators')
  test('returns cached orchestrator on second call')
  test('throws error on invalid context')
  test('cleanup removes from cache')
  test('handles missing strategy config gracefully')
  test('applies environment variable overrides')
})
```

#### Unit Tests: Service Isolation (20 tests)
```typescript
describe('Service Isolation', () => {
  // Position manager isolation
  test('strategy 1 positions isolated from strategy 2')
  test('position queries filtered by strategyId')
  test('position events tagged with strategyId')

  // Action queue isolation
  test('strategy 1 actions processed independently')
  test('action execution isolated by strategyId')
  test('no action cross-contamination')

  // Analyzer isolation
  test('strategy-specific analyzer weights applied')
  test('strategy-specific indicators loaded')
  test('no analyzer state sharing')

  // Indicator isolation
  test('only used indicators loaded per strategy')
  test('indicator cache per-strategy')
  test('no indicator data leakage')

  // Event isolation
  test('events tagged with correct strategyId')
  test('event listeners filtered by strategyId')
  test('no cross-strategy event interference')
})
```

#### Integration Tests: Multi-Strategy Workflow (15 tests)
```typescript
describe('Multi-Strategy Workflow', () => {
  test('load 2 strategies successfully')
  test('switch active strategy in <100ms')
  test('inactive strategy dormant (no processing)')
  test('active strategy receives all candles')
  test('position isolation verified across strategies')
  test('event stream isolated per strategy')
  test('journal entries per-strategy')
  test('P&L calculation per-strategy correct')
  test('unload strategy and cleanup resources')
  test('reload strategy reuses cached orchestrator')
  test('strategy config hot-reload works')
  test('multiple symbol trading across strategies')
  test('performance metrics aggregation')
  test('graceful shutdown cleanup all strategies')
  test('recovery from partial strategy failure')
})
```

#### Functional Tests: Real Scenarios (10 tests)
```typescript
describe('Functional: Multi-Strategy Execution', () => {
  test('Strategy A (Scalping) on BTC with 5m timeframe')
  test('Strategy B (Trend) on ETH with 15m timeframe')
  test('Both strategies trading same symbol')
  test('Both strategies trading different symbols')
  test('Strategy switch during live trading')
  test('Position management across strategy switch')
  test('Risk limits per-strategy')
  test('Journal integrity with multiple strategies')
  test('Event order consistency')
  test('Error in one strategy does not crash others')
})
```

---

## 🔄 Implementation Sequence

### Phase 1: Core Infrastructure (Days 1-3)

**Day 1:**
- [ ] Create `trading-orchestrator-factory.ts` (250 LOC)
- [ ] Create `strategy-service-container.ts` (150 LOC)
- [ ] Define factory interfaces

**Day 2:**
- [ ] Implement `TradingOrchestratorFactory.create()`
- [ ] Implement per-strategy service creation
- [ ] Add indicator loading logic

**Day 3:**
- [ ] Implement caching strategy
- [ ] Add cleanup/destruction logic
- [ ] Write 15 factory unit tests

### Phase 2: Integration (Days 4-7)

**Day 4:**
- [ ] Implement `getOrCreateStrategyOrchestrator()`
- [ ] Add event handler wiring
- [ ] Update StrategyOrchestratorService

**Day 5:**
- [ ] Add strategyId to PositionLifecycleService
- [ ] Add strategyId to ActionQueueService
- [ ] Add strategyId to Orchestrators

**Day 6:**
- [ ] Update BotServices initialization
- [ ] Wire WebSocket routing
- [ ] Integration with WebSocketEventHandlerManager

**Day 7:**
- [ ] Write 20 service isolation unit tests
- [ ] Write 15 integration tests
- [ ] Fix any compilation errors

### Phase 3: Testing & Documentation (Days 8-10)

**Day 8:**
- [ ] Write 10 functional tests
- [ ] Test multi-strategy scenarios
- [ ] Test performance characteristics

**Day 9:**
- [ ] Run full test suite (60+ tests)
- [ ] Verify 0 TypeScript errors
- [ ] Performance profiling

**Day 10:**
- [ ] Update ARCHITECTURE_QUICK_START.md
- [ ] Update CLAUDE.md
- [ ] Create comprehensive Phase 10.3 summary

---

## ✅ Success Criteria

### Functional Requirements
- [ ] TradingOrchestrator created per strategy
- [ ] All service instances isolated per strategy
- [ ] Candles routed to active strategy only
- [ ] Events tagged with strategyId
- [ ] Position isolation verified
- [ ] Journal isolation verified
- [ ] Analyzer weights per-strategy honored
- [ ] Indicator loading strategy-specific
- [ ] Strategy switching works seamlessly
- [ ] Caching works correctly

### Non-Functional Requirements
- [ ] 0 TypeScript errors
- [ ] 60+ tests with 100% pass rate
- [ ] Backward compatibility maintained
- [ ] Memory usage acceptable with 2+ strategies
- [ ] Performance: <100ms strategy switch
- [ ] Event latency: <1ms additional overhead
- [ ] Documentation complete

### Code Quality
- [ ] No code duplication
- [ ] SOLID principles followed
- [ ] Type-safe throughout
- [ ] Clear separation of concerns
- [ ] Comprehensive error handling
- [ ] Production-ready logging

---

## 🔍 Key Implementation Insights

### 1. **Service Instance Pattern**

Each strategy needs isolated instances:
```typescript
// Don't do this (shared state):
const positionManager = BotServices.positionLifecycleService;

// Do this (per-strategy):
const positionManager = new PositionLifecycleService(
  exchange,
  strategyJournal,
  logger,
  strategyId  // NEW: for event tagging
);
```

### 2. **Configuration Merging**

Strategy config overrides base config:
```typescript
const mergedConfig = {
  ...baseConfig,           // Defaults from config.json
  ...strategyConfig,       // Overrides from strategy.json
  exchange: context.exchange  // From context
};
```

### 3. **Event Tagging Strategy**

All events propagate strategyId:
```typescript
this.eventBus.publish('POSITION_OPENED', {
  position: pos,
  strategyId: context.strategyId,  // NEW
  timestamp: Date.now()
});
```

### 4. **Caching Strategy**

```typescript
// Cache key: strategyId
// Cache lifetime: strategy lifecycle
// Cache invalidation: on strategy unload
const cache = new Map<string, TradingOrchestrator>();
```

### 5. **Cleanup Operations**

When strategy unloads:
```typescript
// 1. Stop processing new candles
// 2. Persist state snapshot
// 3. Close active positions (optional)
// 4. Flush event queue
// 5. Clear indicator caches
// 6. Unregister event listeners
// 7. Remove from cache
```

---

## 📈 Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Strategy switch time | <100ms | TBD |
| Event overhead per strategy | <1ms | TBD |
| Memory per strategy | <50MB | TBD |
| Concurrent strategies supported | 10+ | TBD |
| Indicator loading time | <100ms per strategy | TBD |

---

## 🎯 Deliverables

By end of Phase 10.3:

1. ✅ **TradingOrchestratorFactory** - 250 LOC
2. ✅ **StrategyServiceContainer** - 150 LOC
3. ✅ **getOrCreateStrategyOrchestrator()** implementation - 150 LOC
4. ✅ **strategyId tagging** throughout - 100 LOC
5. ✅ **BotServices integration** - 50 LOC
6. ✅ **60+ comprehensive tests** - 500 LOC
7. ✅ **Documentation updates** - ARCHITECTURE_QUICK_START.md + CLAUDE.md
8. ✅ **0 TypeScript errors**
9. ✅ **Full backward compatibility**
10. ✅ **Production-ready code**

---

## 🔗 Related Phases

**Completed:**
- ✅ Phase 10 - Multi-Strategy Foundation
- ✅ Phase 10.1 - Comprehensive Test Suite
- ✅ Phase 10.2 - Candle Routing Framework

**This Phase:**
- 🎯 Phase 10.3 - Isolated TradingOrchestrator Per Strategy

**Following:**
- Phase 10.4 - Per-Symbol Strategy Allocation
- Phase 10.5 - Risk Coordination
- Phase 11 - Live Multi-Strategy Trading

---

## 📚 References

**Current Code:**
- StrategyOrchestratorService: `src/services/multi-strategy/strategy-orchestrator.service.ts`
- TradingOrchestrator: `src/services/trading-orchestrator.service.ts`
- BotServices: `src/services/bot-services.ts`
- StrategyFactoryService: `src/services/multi-strategy/strategy-factory.service.ts`

**Type Definitions:**
- MultiStrategy types: `src/types/multi-strategy-types.ts`
- Config types: `src/types/config.types.ts`
- Position types: `src/types/core.ts`

**Documentation:**
- Phase 10 Plan: `PHASE_10_PLAN.md`
- Phase 10.1 Plan: (in ARCHITECTURE_QUICK_START.md)
- Architecture Quick Start: `ARCHITECTURE_QUICK_START.md`

---

**Version:** 1.0
**Last Updated:** 2026-01-22
**Status:** 🎯 READY FOR IMPLEMENTATION
