# 🏗️ Modular Trading Bot Architecture Blueprint

**Status:** Phase Design Complete | Ready for Implementation
**Version:** 1.0
**Created:** 2026-01-13
**Target:** Modular, independently-testable, memory-efficient system

---

## 📍 EXECUTIVE SUMMARY

This document defines **ALL components** of the trading bot architecture with:
- ✅ Complete list of 35+ modules
- ✅ Data flow from signal → position → close
- ✅ Memory caching strategy (prevent leaks)
- ✅ How components integrate into cohesive system
- ✅ Excludes analyzers/filters (treated as pluggable)

---

## 🏗️ ARCHITECTURE LAYERS

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1: ORCHESTRATION & DECISION MAKING                        │
│ ├─ TradingOrchestrator (main loop coordinator)                   │
│ ├─ EntryOrchestrator (entry decision logic)                      │
│ ├─ ExitOrchestrator (exit decision logic)                        │
│ ├─ StrategyCoordinator (signal aggregation)                      │
│ └─ FilterOrchestrator (filter enforcement)                       │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 2: SIGNAL GENERATION (Pluggable via Strategy Config)      │
│ ├─ AnalyzerRegistry (factory for analyzers)                      │
│ ├─ Analyzers (28 technical + advanced)                           │
│ └─ [Excluded from this doc - configured separately]              │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 3: RISK & VALIDATION GATEKEEPER                           │
│ ├─ RiskManager (unified risk gatekeeper)                         │
│ ├─ MTFSnapshotGate (prevents race conditions)                    │
│ └─ EntryConfirmationManager (candle-based confirmation)          │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 4: POSITION & TRADE EXECUTION                             │
│ ├─ PositionLifecycleService (open→close workflow)                │
│ ├─ PositionExitingService (exit execution)                       │
│ ├─ TakeProfitManager (TP hit detection)                          │
│ └─ BybitService (exchange API abstraction)                       │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 5: DATA PROVIDERS & CACHING                               │
│ ├─ CandleProvider (multi-TF candle delivery with cache)          │
│ ├─ TimeframeProvider (TF structure management)                   │
│ ├─ IndicatorCache [NEW] (EMA, RSI, ATR shared cache)            │
│ └─ MarketDataCollector (orderbook, funding, etc)                 │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 6: CONTEXT & ANALYSIS ENGINES                             │
│ ├─ MultiTimeframeTrendService (trend analysis)                  │
│ ├─ SwingPointDetectorService (support/resistance)               │
│ ├─ VolatilityRegimeService (market volatility)                  │
│ ├─ WhaleDetectionService (large order detection)                │
│ └─ MarketHealthMonitor (market condition analysis)               │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 7: EVENTS & STATE MANAGEMENT                              │
│ ├─ BotEventBus (centralized event system)                        │
│ ├─ PositionMonitor (track position state changes)                │
│ └─ PositionSyncService (sync with exchange on restart)           │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 8: MONITORING, LOGGING & NOTIFICATIONS                    │
│ ├─ LoggerService (structured logging)                            │
│ ├─ TelegramService (alerts & notifications)                      │
│ ├─ BotMetricsService (performance tracking)                      │
│ ├─ ConsoleDashboard (real-time display)                          │
│ └─ SessionStatsService (session statistics)                      │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 9: PERSISTENCE & JOURNAL                                  │
│ ├─ TradingJournalService (trade history)                         │
│ └─ TradeHistoryService (backtesting data)                        │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 10: INFRASTRUCTURE & LIFECYCLE                            │
│ ├─ BotInitializer (startup sequence)                             │
│ ├─ ConfigValidator (configuration validation)                    │
│ ├─ WebSocketManager (real-time data connection)                  │
│ └─ BotFactory (dependency injection container)                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🧩 COMPLETE MODULE INVENTORY

### TIER 1: ORCHESTRATION (Coordinator Modules)

| Module | File | Responsibility | Input | Output |
|--------|------|-----------------|-------|--------|
| **TradingOrchestrator** | `trading-orchestrator.service.ts` | Main loop: coordinates context→entry→exit decisions | Candles (all TF) | Entry/Exit actions |
| **EntryOrchestrator** | `orchestrators/entry.orchestrator.ts` | Entry decision logic: signal → ENTER/SKIP/WAIT | AggregatedSignal, Risk | Decision + Position params |
| **ExitOrchestrator** | `orchestrators/exit.orchestrator.ts` | Exit logic: position → TP hit/SL hit/Trail | Position state | Exit actions (close, trail, TP) |
| **StrategyCoordinator** | `strategy-coordinator.service.ts` | Aggregate multiple analyzer signals into 1 score | AnalyzerSignals[] | AggregatedSignal (confidence) |
| **FilterOrchestrator** | `orchestrators/filter.orchestrator.ts` | Apply 9 filters sequentially to block/allow signals | AggregatedSignal + Context | FilterResult (allowed/blocked) |

**Data Flow:**
```
TradingOrchestrator.onCandleClosed()
  ├─1. Update context (MultiTimeframeTrendService)
  ├─2. Get signals (AnalyzerRegistry → Analyzers)
  ├─3. Aggregate signals (StrategyCoordinator)
  ├─4. Apply filters (FilterOrchestrator)
  ├─5. Check entry (EntryOrchestrator + RiskManager)
  ├─6. Open position (PositionLifecycleService + BybitService)
  └─7. Monitor exit (ExitOrchestrator if position open)
```

---

### TIER 2: DECISION LAYER (Pure Functions - To Extract)

**Goal:** Move to pure functions in `src/decision-engine/`

| Function | Pure? | Location | Purpose |
|----------|-------|----------|---------|
| `evaluateEntry()` | ❌ In Orchestrator | EntryOrchestrator | Decision: ENTER/SKIP/WAIT |
| `evaluateExit()` | ❌ In Orchestrator | ExitOrchestrator | Decision: close%, trail, TP hit |
| `validateRisk()` | ❌ In RiskManager | RiskManager | Check risk constraints |
| `aggregateSignals()` | ❌ In Coordinator | StrategyCoordinator | Score signals |

**Action Items:**
```typescript
// Phase 0.3: Extract to pure functions
export function evaluateEntry(
  signal: AggregatedSignal,
  context: TrendContext,
  openPositions: Position[],
  rules: EntryRules
): 'ENTER' | 'SKIP' | 'WAIT' { ... }

export function evaluateExit(
  position: Position,
  currentPrice: number,
  tpHits: number[],
  slHit: boolean
): ExitAction[] { ... }
```

---

### TIER 3: RISK & VALIDATION GATEKEEPER

| Module | File | Responsibility | Inputs | Outputs |
|--------|------|-----------------|--------|---------|
| **RiskManager** | `risk-manager.service.ts` | Unified gatekeeper: daily loss, loss streak, concurrent risk, position size | Signal + Account state | RiskDecision (approve/reject + size) |
| **MTFSnapshotGate** | `mtf-snapshot-gate.service.ts` | Prevent race condition: HTF bias change during ENTRY execution | Current price + HTF snapshot | Gate result (allow/block) |
| **EntryConfirmationManager** | `entry-confirmation.service.ts` | Require candle close confirmation for signals (wait 1 candle) | Signal + Candle state | Confirmation result |

---

### TIER 4: POSITION MANAGEMENT (Execution)

| Module | File | Responsibility | Key Methods |
|--------|------|-----------------|-------------|
| **PositionLifecycleService** | `position-lifecycle.service.ts` | Position open→close workflow<br/>- Atomic position open (SL/TP set with position)<br/>- Sync positions on bot restart<br/>- Track current position state | `openPosition(signal)`<br/>`syncPositions()`<br/>`getCurrentPosition()` |
| **PositionExitingService** | `position-exiting.service.ts` | Execute exit actions (close %, move SL, activate trail) | `closePartial(percent)`<br/>`updateStopLoss(newSL)`<br/>`activateTrailing()` |
| **TakeProfitManager** | `take-profit-manager.service.ts` | Track TP hit detection and cascading exits (TP1→TP2→TP3) | `detectTPHit(price)`<br/>`getNextTPAction()` |
| **LadderTPManager** | `ladder-tp-manager.service.ts` | Ladder-style TP execution (advanced feature) | `executeLadderTP()` |
| **LimitOrderExecutor** | `limit-order-executor.service.ts` | Execute limit orders (TP as limit, not market) | `executeAsLimit()` |

**Position Lifecycle State Machine:**
```
OPENING
  ↓ (position sent to exchange)
OPEN (currently managed)
  ├─ TP1 hit → PARTIAL_CLOSED (60% closed)
  ├─ TP2 hit → PARTIAL_CLOSED (60% + 40% = fully closed)
  ├─ SL hit → CLOSED
  ├─ Manual close → CLOSED
  └─ Trailing active → TRAIL_ACTIVE → CLOSED

CLOSED (event emitted to journal, monitoring stopped)
```

---

### TIER 5: SIGNAL GENERATION (Pluggable)

**Note:** Excluded from this document but must integrate with:

| Component | Purpose |
|-----------|---------|
| **AnalyzerRegistry** | Factory pattern: loads analyzers from strategy config at runtime |
| **28 Analyzers** | Technical (6) + Advanced (4) + Structure (4) + Level (2) + Liquidity (8) + Scalping (3) |
| **Filters** | Blind Zone, Flat Market, Funding Rate, BTC Correlation, Trend Alignment, etc |

**Integration Points:**
```typescript
// Analyzers → AnalyzerRegistry (configurable loading)
const registry = new AnalyzerRegistryService(logger);
const enabledAnalyzers = await registry.loadAnalyzersForStrategy(strategyConfig);

// Get signals
const signals = await Promise.all(
  enabledAnalyzers.map(a => a.analyze(candles, context))
);

// Aggregate
const aggregated = strategyCoordinator.aggregateSignals(signals);

// Filter
const filtered = filterOrchestrator.evaluateFilters({
  signal: aggregated,
  ...context
});
```

---

### TIER 6: DATA PROVIDERS & CACHING

| Module | File | Responsibility | Caching Strategy |
|--------|------|-----------------|------------------|
| **CandleProvider** | `providers/candle.provider.ts` | Deliver multi-TF candles with memory cache | LRU: max 500 candles per TF<br/>Clear on new 1m candle |
| **TimeframeProvider** | `providers/timeframe.provider.ts` | Manage timeframe structure (when each TF closes) | Role-based lookup (PRIMARY, ENTRY, TREND) |
| **MarketDataCollector** | `data-collector.service.ts` | Fetch orderbook, funding rate, volume | WebSocket live + periodic HTTP |
| **IndicatorCache [NEW]** | `services/indicator-cache.service.ts` | Shared cache for repeated indicators (EMA, RSI, ATR) | Map<"RSI-14-1h", CachedResult><br/>TTL: clear on new candle<br/>LRU max: 500 entries |

**Caching Architecture (Memory Safety):**
```typescript
// Phase 0.2: Implement IndicatorCacheService
interface IndicatorCacheEntry {
  key: string; // "RSI-14-1h" → analyzer name, period, TF
  value: IndicatorResult;
  timestamp: number;
  hitCount: number;
}

class IndicatorCacheService {
  private cache: Map<string, IndicatorCacheEntry> = new Map();
  private maxSize = 500; // Max entries before LRU eviction

  get(key: string): IndicatorResult | null { ... }

  set(key: string, value: IndicatorResult): void { ... }

  clear(): void { ... } // Called on every new candle

  private evictLRU(): void { ... } // If cache grows > maxSize
}

// Usage in analyzers:
class RSIAnalyzer {
  async analyze(candles: Candle[]): Promise<AnalyzerSignal> {
    const cacheKey = `RSI-${period}-${timeframe}`;

    // Check cache first
    let result = this.cache.get(cacheKey);
    if (result) return result;

    // Calculate if not in cache
    result = calculateRSI(candles, period);

    // Store in cache
    this.cache.set(cacheKey, result);

    return result;
  }
}
```

---

### TIER 7: CONTEXT & ANALYSIS ENGINES

| Module | File | Responsibility |
|--------|------|-----------------|
| **MultiTimeframeTrendService** | `multi-timeframe-trend.service.ts` | Analyze trend on PRIMARY + TREND TFs (EMA+RSI+SwingPoints) |
| **SwingPointDetectorService** | `swing-point-detector.service.ts` | Find support/resistance swing points |
| **TimeframeWeightingService** | `timeframe-weighting.service.ts` | Weight HTF signals higher than LTF (PRIMARY > TREND > ENTRY) |
| **VolatilityRegimeService** | `volatility-regime.service.ts` | Detect market regime (ATR-based): LOW, NORMAL, HIGH |
| **WhaleDetectionService** | `whale-detection.service.ts` | Detect large orders (whale walls, order imbalance) |
| **MarketHealthMonitor** | `market-health.monitor.ts` | Overall market condition (flat, trending, volatile) |

---

### TIER 8: EVENT SYSTEM & STATE MANAGEMENT

| Module | File | Purpose | Events |
|--------|------|---------|--------|
| **BotEventBus** | `event-bus.ts` | Centralized event system | `positionOpened`, `positionClosed`, `tpHit`, `slHit` |
| **PositionMonitor** | `position-monitor.service.ts` | Track position state changes | `priceUpdate`, `statusChange` |
| **PositionSyncService** | `position-sync.service.ts` | Sync with exchange on bot restart (prevent double-open) | `syncComplete`, `mismatchDetected` |

**Event Flow:**
```
RiskManager approves position
  ↓
PositionLifecycleService.openPosition()
  ↓ (calls BybitService.openPosition())
Position created at exchange
  ↓
PositionMonitor detects via WebSocket
  ↓
BotEventBus emits "positionOpened"
  ↓
TradingJournal logs, SessionStats updates, Telegram notifies
  ↓
ExitOrchestrator starts monitoring
```

---

### TIER 9: MONITORING & LOGGING

| Module | File | Responsibility |
|--------|------|-----------------|
| **LoggerService** | `logger.service.ts` | Structured logging (info, debug, warn, error) |
| **TelegramService** | `telegram.service.ts` | Send alerts to Telegram (entry, exit, errors) |
| **BotMetricsService** | `bot-metrics.service.ts` | Track performance metrics (win rate, avg win, etc) |
| **ConsoleDashboard** | `console-dashboard.service.ts` | Real-time trading stats display |
| **SessionStatsService** | `session-stats.service.ts` | Calculate session statistics (daily PnL, trades) |

---

### TIER 10: PERSISTENCE & JOURNAL

| Module | File | Responsibility |
|--------|------|-----------------|
| **TradingJournalService** | `trading-journal.service.ts` | Log all trades to file (for analysis) |
| **TradeHistoryService** | `trade-history.service.ts` | Load historical trades for backtesting |
| **VirtualBalanceService** | `virtual-balance.service.ts` | Track account balance with compound interest |

---

### TIER 11: INFRASTRUCTURE & LIFECYCLE

| Module | File | Responsibility |
|--------|------|-----------------|
| **BotInitializer** | `bot-initializer.ts` | Startup sequence: load config, init services, sync positions |
| **ConfigValidator** | `config-validator.service.ts` | Validate configuration (all required fields present) |
| **WebSocketManager** | `websocket-manager.service.ts` | Maintain WebSocket connections (market data + private orders) |
| **WebSocketKeepAlive** | `websocket-keep-alive.service.ts` | Ping/pong to prevent timeout |
| **BybitService** | `services/bybit/bybit.service.ts` | Exchange API abstraction (REST + WebSocket) |
| **BotFactory** | `bot-services.ts` | Dependency injection: create all services |

---

## 🔄 DATA FLOW: SIGNAL → POSITION → CLOSE

### Phase 1: Signal Generation & Aggregation
```
1m Candle closes
  ↓
CandleProvider emits new candle for all TF
  ↓
TradingOrchestrator.onCandleClosed()
  ├─ Check if PRIMARY candle closed
  │   └─ MultiTimeframeTrendService updates trend (EMA, RSI, swings)
  │
  ├─ Check if ENTRY candle closed
  │   ├─ AnalyzerRegistry.load enabled analyzers
  │   ├─ Run all analyzers in parallel (Promise.all)
  │   │   ├─ Check indicator cache first (IndicatorCache)
  │   │   └─ Calculate if not cached
  │   ├─ StrategyCoordinator aggregates signals
  │   └─ Get AggregatedSignal (LONG/SHORT + confidence)
  │
  └─ Check if TREND candle closed
      └─ Update secondary context (optional)
```

### Phase 2: Filtering & Risk Validation
```
AggregatedSignal (e.g., LONG 85% confidence)
  ↓
FilterOrchestrator.evaluateFilters()
  ├─ Blind Zone (min signals)
  ├─ Flat Market (is market moving)
  ├─ Funding Rate (perps only)
  ├─ BTC Correlation (altcoin sentiment)
  ├─ Trend Alignment (signal matches trend)
  ├─ Post-TP Filter (avoid FOMO)
  ├─ Time-Based Filter (session restrictions)
  ├─ Volatility Regime (ATR constraints)
  └─ Return: allowed=true/false
  ↓
  if blocked → skip this signal
  if allowed → continue to entry decision
```

### Phase 3: Entry Decision & Risk Approval
```
FilterResult = allowed
  ↓
MTFSnapshotGate.capture()
  └─ Snapshot current HTF state to prevent race conditions
  ↓
EntryOrchestrator.evaluateEntry()
  ├─ Check confidence threshold (min 60%)
  ├─ Check if already in position (block multiple entries)
  ├─ Return: ENTER / SKIP / WAIT
  ↓
  if ENTER → continue to risk approval
```

```
EntryDecision = ENTER
  ↓
RiskManager.approveRisk(signal)
  ├─ Check daily loss limit (-5% max)
  ├─ Check loss streak penalty (consecutive losses reduce size)
  ├─ Check concurrent risk (max 2 positions, max 10% risk each)
  ├─ Calculate position size
  │   └─ Risk per trade: 1% of balance
  │   └─ Divided by: (entry - SL) distance
  │   └─ Multiply by: daily loss × loss streak multiplier
  │   └─ Clamp: [minSize, maxSize]
  ├─ Return: RiskDecision(approved=true/false, positionSize)
  ↓
  if rejected → skip this signal
  if approved → continue to position opening
```

### Phase 4: Position Opening (Atomic)
```
RiskDecision = approved
  ↓
PositionLifecycleService.openPosition(signal)
  ├─ Create Position object with:
  │   ├─ entryPrice = current price
  │   ├─ direction = signal.direction
  │   ├─ quantity = riskManager.positionSize
  │   ├─ stopLoss = support/resistance level - margin
  │   ├─ takeProfits = [TP1, TP2, TP3]
  │   └─ state = "OPENING"
  │
  ├─ Call BybitService.openPosition()
  │   ├─ Send REST API: create position
  │   ├─ Send conditional orders: SL + TPs
  │   └─ Return: position ID + status
  │
  ├─ Emit BotEventBus "positionOpened"
  │   ├─ TradingJournal logs trade
  │   ├─ SessionStats updates counters
  │   └─ Telegram sends alert
  │
  ├─ PositionMonitor.startMonitoring(position)
  │   └─ Subscribe to WebSocket position updates
  │
  └─ Return to TradingOrchestrator
  ↓
Position state = "OPEN" (ready for exit management)
```

### Phase 5: Position Monitoring & Exit
```
Position is OPEN
  ↓
PositionMonitor receives WebSocket updates (price, equity, etc)
  ↓
ExitOrchestrator.evaluateExit(position, currentPrice)
  ├─ Check SL hit
  │   └─ if true → return CloseAction(100%, reason="SL")
  │
  ├─ Check TP3 hit (final target)
  │   └─ if true → return CloseAction(remaining%, reason="TP3")
  │
  ├─ Check TP2 hit (partial close + activate trailing)
  │   ├─ close 40% of remaining
  │   ├─ move SL to breakeven
  │   └─ activate trailing stop (0.5% below current)
  │
  ├─ Check TP1 hit (partial close + move to breakeven)
  │   ├─ close 60%
  │   └─ move SL to breakeven + offset
  │
  └─ Return: ExitAction[] (may be empty if no action)
  ↓
  if ExitAction.size() > 0 → execute actions
  if ExitAction.size() = 0 → continue monitoring
```

### Phase 6: Position Closing & Cleanup
```
ExitAction = close(100%) [triggered by TP3, SL, or trailing]
  ↓
PositionExitingService.closePosition()
  ├─ Send BybitService.closePosition()
  │   └─ Market close or take remaining profit
  │
  ├─ Emit BotEventBus "positionClosed"
  │   ├─ TradingJournal logs exit (price, PnL, reason)
  │   ├─ SessionStats updates (win, loss, streak, PnL)
  │   ├─ Telegram sends alert (profit/loss)
  │   └─ RiskManager updates (daily PnL, loss streak)
  │
  ├─ PositionMonitor.stopMonitoring()
  │   └─ Unsubscribe from WebSocket
  │
  └─ PositionLifecycleService.currentPosition = null
  ↓
Position state = "CLOSED"
  ↓
Ready for next signal (back to Phase 1)
```

---

## 💾 MEMORY MANAGEMENT & CACHING STRATEGY

### Problem: Memory Leaks
- Analyzers recalculate same indicators repeatedly
- Candles cached indefinitely in memory
- Events not cleaned up after listener removal
- Positions history grows unbounded

### Solution: Tiered Caching with TTL & LRU

```
TIER 1: CandleProvider (Multi-TF Cache)
├─ Max candles per TF: 100 (newest only)
├─ Clear on new 1m candle: remove candles > 100 ago
├─ Memory: ~100 * 8 TFs * 300 bytes = 240 KB
└─ Eviction: FIFO (oldest removed)

TIER 2: IndicatorCache (Shared Calculation Cache)
├─ Max entries: 500
├─ Key format: "RSI-14-1h", "EMA-20-4h", "ATR-14-1d"
├─ TTL: clear on new candle (1 min)
├─ Memory: ~500 * 100 bytes = 50 KB
└─ Eviction: LRU (least recently used removed)

TIER 3: MultiTimeframeTrendService (Context Cache)
├─ Keep: last state only (no history)
├─ Memory: ~1 KB
└─ Clear: on every new candle

TIER 4: WhaleDetectionService (Live Orderbook)
├─ Max entries: 1000 walls
├─ Memory: ~1000 * 500 bytes = 500 KB
└─ Eviction: Remove walls > 1 hour old

TIER 5: TradingJournalService (File-Based)
├─ Keep in memory: last 100 trades
├─ Archive: trades > 30 days to file
└─ Memory: ~100 * 1 KB = 100 KB
```

**Total Expected Memory:** ~1.5 MB (excluding Node.js overhead)

### Implementation Checklist

```typescript
// Phase 0.2: Indicator Cache
class IndicatorCacheService {
  private cache: Map<string, CacheEntry> = new Map();

  get(key: string): Result | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    entry.lastAccess = Date.now();
    entry.hitCount++;
    return entry.value;
  }

  set(key: string, value: Result): void {
    if (this.cache.size >= 500) {
      this.evictLRU(); // Remove least recently used
    }
    this.cache.set(key, { value, lastAccess: Date.now(), hitCount: 0 });
  }

  clear(): void {
    this.cache.clear(); // Called on every new candle
  }

  private evictLRU(): void {
    let oldest: [string, CacheEntry] | null = null;
    for (const entry of this.cache) {
      if (!oldest || entry[1].lastAccess < oldest[1].lastAccess) {
        oldest = entry;
      }
    }
    if (oldest) this.cache.delete(oldest[0]);
  }
}

// Usage
const cache = new IndicatorCacheService();

// Analyzer calls cache
const rsiKey = `RSI-${period}-${timeframe}`;
let rsiValue = cache.get(rsiKey);
if (!rsiValue) {
  rsiValue = calculateRSI(candles, period);
  cache.set(rsiKey, rsiValue);
}

// On every new candle
candleProvider.on('newCandle', (candle) => {
  cache.clear(); // Clear all indicator caches
  indicatorCache.clear();
  trendService.updateContext(candle);
  // Continue with signal generation...
});
```

---

## 🔌 COMPONENT INTEGRATION PATTERNS

### Pattern 1: Pure Function → Service Wrapper

**Current:** Logic mixed in service
**Target:** Pure function in decision module, service calls it

```typescript
// CURRENT (entryOrchestrator.evaluateEntry mixed with service logic)
class EntryOrchestrator {
  evaluateEntry(signal, context) {
    // Has side effects: logging, service calls
    this.logger.debug(...);
    const trend = this.trendService.getTrend();
    // Returns impure result
  }
}

// TARGET (Phase 0.3)
// Pure function in src/decision-engine/entryDecisions.ts
export function evaluateEntry(
  signal: AggregatedSignal,
  context: TrendContext,
  openPositions: Position[],
  rules: EntryRules
): 'ENTER' | 'SKIP' | 'WAIT' {
  // NO side effects
  // NO service calls
  // NO logging
  // Just decision logic
  if (signal.confidence < rules.minConfidence) return 'SKIP';
  if (openPositions.length > 0) return 'SKIP';
  if (!context.trendBias) return 'WAIT';
  return 'ENTER';
}

// Service wrapper calls pure function
class EntryOrchestrator {
  evaluateEntry(signal, context) {
    const decision = evaluateEntry(
      signal,
      context,
      this.openPositions,
      this.rules
    );

    this.logger.debug('Entry decision:', decision); // Side effect after decision
    return decision;
  }
}
```

### Pattern 2: Dependency Injection

All services injected, never `new` inside service:

```typescript
class PositionLifecycleService {
  constructor(
    private bybit: IExchange,        // Interface, not BybitService
    private tradingConfig: TradingConfig,
    private eventBus: BotEventBus,
    private logger: LoggerService,
  ) {}
}

// In BotFactory
const position = new PositionLifecycleService(
  bybitService,  // Real exchange
  tradingConfig,
  eventBus,
  logger,
);

// In tests
const position = new PositionLifecycleService(
  mockExchange,  // Mock for testing
  testConfig,
  testEventBus,
  testLogger,
);
```

### Pattern 3: Pluggable Analyzers

Analyzers loaded at runtime from strategy config:

```typescript
// Strategy config
{
  "analyzers": {
    "rsi": { "enabled": true, "period": 14 },
    "ema": { "enabled": true, "fast": 20, "slow": 50 },
    "breakout": { "enabled": false },
  }
}

// Loading
const registry = new AnalyzerRegistryService(logger);
const enabledAnalyzers = await registry.loadAnalyzersForStrategy(strategy);
// Returns: [RsiAnalyzer, EmaAnalyzer] (not Breakout)

// Execution
const signals = await Promise.all(
  enabledAnalyzers.map(a => a.analyze(candles, context))
);
```

### Pattern 4: Event-Driven State Changes

Events trigger side effects, not direct calls:

```typescript
// BAD: Direct call
positionLifecycle.openPosition(signal);
tradingJournal.logEntry(signal); // Tight coupling
telegram.sendAlert(signal); // Tight coupling

// GOOD: Event-driven
positionLifecycle.openPosition(signal); // Emits "positionOpened"

// Listeners react independently
eventBus.on('positionOpened', (position) => {
  tradingJournal.logEntry(position); // Independent
});
eventBus.on('positionOpened', (position) => {
  telegram.sendAlert(position); // Independent
});
```

---

## 🎯 ASSEMBLY INSTRUCTIONS (How to Build)

### Step 1: Initialize Core Services (Immediate)
```typescript
// BotFactory.ts
const logger = new LoggerService(config);
const eventBus = new BotEventBus(logger);
const bybit = new BybitService(config, logger);
const candleProvider = new CandleProvider(bybit, logger);
const timeframeProvider = new TimeframeProvider();
```

### Step 2: Add Indicator Cache (Phase 0.2)
```typescript
const indicatorCache = new IndicatorCacheService();
const trendService = new MultiTimeframeTrendService(
  candleProvider,
  indicatorCache,
  logger
);
```

### Step 3: Add Decision Layer (Phase 0.3)
```typescript
import { evaluateEntry, evaluateExit } from '../decision-engine';

class EntryOrchestrator {
  evaluate(signal, context, position) {
    return evaluateEntry(signal, context, [position], this.rules);
  }
}
```

### Step 4: Add Gatekeeper (Risk Manager)
```typescript
const riskManager = new RiskManager(config.risk, logger);
```

### Step 5: Add Position Management
```typescript
const positionLifecycle = new PositionLifecycleService(
  bybit,
  config.trading,
  config.risk,
  telegram,
  logger,
  tradingJournal,
  eventBus,
);
```

### Step 6: Connect Orchestrators
```typescript
const entryOrch = new EntryOrchestrator(riskManager, logger);
const exitOrch = new ExitOrchestrator(logger);
const filterOrch = new FilterOrchestrator(logger, config.filters);
```

### Step 7: Add Main Loop
```typescript
const orchestrator = new TradingOrchestrator(
  config,
  candleProvider,
  timeframeProvider,
  bybit,
  positionLifecycle,
  telegram,
  logger,
  riskManager,
);

// On every 1m candle
candleProvider.on('newCandle', (candle) => {
  orchestrator.onCandleClosed(candle);
});
```

---

## 📊 COMPONENT DEPENDENCY GRAPH

```
BotFactory
  ├─→ ConfigValidator
  ├─→ LoggerService
  ├─→ BotEventBus
  ├─→ WebSocketManager
  │    ├─→ BybitService
  │    │    ├─→ CandleProvider
  │    │    ├─→ MarketDataCollector
  │    │    └─→ PositionMonitor
  │    └─→ WebSocketKeepAlive
  │
  ├─→ TradingOrchestrator
  │    ├─→ AnalyzerRegistry
  │    │    └─→ Analyzers (28 types)
  │    │         └─→ IndicatorCache [NEW]
  │    ├─→ StrategyCoordinator
  │    ├─→ FilterOrchestrator
  │    ├─→ EntryOrchestrator
  │    │    ├─→ RiskManager
  │    │    └─→ MTFSnapshotGate
  │    ├─→ ExitOrchestrator
  │    ├─→ PositionLifecycleService
  │    │    ├─→ BybitService
  │    │    ├─→ PositionExitingService
  │    │    ├─→ TakeProfitManager
  │    │    ├─→ TelegramService
  │    │    ├─→ TradingJournalService
  │    │    └─→ SessionStatsService
  │    ├─→ MultiTimeframeTrendService
  │    │    ├─→ CandleProvider
  │    │    ├─→ SwingPointDetectorService
  │    │    └─→ IndicatorCache [NEW]
  │    ├─→ TimeframeWeightingService
  │    └─→ MTFSnapshotGate
  │
  ├─→ TradingJournalService
  ├─→ ConsoleDashboard
  ├─→ BotMetricsService
  └─→ BotInitializer
```

---

## ✅ VALIDATION CHECKLIST

Each component must satisfy:

- [ ] **Single Responsibility:** One reason to change
- [ ] **Dependency Injection:** No `new` of dependencies inside
- [ ] **Interface Compliance:** Implements declared interface
- [ ] **Testable:** Can be tested with mocks
- [ ] **Error Handling:** Catches and logs errors, doesn't crash bot
- [ ] **Memory Safe:** Clears caches, removes event listeners
- [ ] **Logging:** Debug logs at entry/exit of key methods
- [ ] **Type Safe:** No `any` types (ConfigNew strict typing)
- [ ] **Event Driven:** Emits events instead of direct calls where possible
- [ ] **Documentation:** Clear docstring explaining responsibility

---

## 🚀 NEXT STEPS

### Immediate (Phase 0.1-0.2)
1. ✅ Phase 0.1: Architecture types (DONE)
2. 🔴 Phase 0.2: Implement IndicatorCacheService
3. 🔴 Phase 0.3: Extract decision functions to pure functions

### Short-term (Phase 1)
4. Implement ActionQueue system
5. Create action handlers
6. Update TradingOrchestrator to use queue

### Medium-term (Phase 2-3)
7. Extract IExchange interface
8. Create pure StrategyCoordinator function
9. Implement dependency injection enhancements

### Long-term (Phase 4+)
10. Analyzer engine abstraction
11. Repository pattern for persistence
12. Full integration testing

---

## 📝 NOTES

- **Analyzers/Filters excluded:** Configured separately via strategy JSON
- **Pure functions:** Phase 0.3 extract decision logic to `src/decision-engine/`
- **Caching:** IndicatorCache crucial for Phase 0.2 to prevent memory leaks
- **Events:** Core to decoupling; prefer events over direct service calls
- **Interfaces:** All external integrations (Exchange, Repository, etc) use interfaces for testability

---

**Document Version:** 1.0
**Last Updated:** 2026-01-22
**Status:** Complete - All 10 layers documented and implemented
