# 🚀 Architecture LEGO Quick Start Guide

**Purpose:** Get started with Phase 0.2 and 0.3 implementation
**Duration:** 3-4 weeks (2-3 days per phase)
**Status:** Ready to implement NOW

---

## 📋 What Was Created

Four comprehensive documents defining the entire architecture:

```
ARCHITECTURE_LEGO_BLUEPRINT.md
  └─ Complete list of ALL 35+ components
  └─ How they integrate
  └─ Memory management strategy
  └─ Assembly instructions
  └─ Component dependency graph

ARCHITECTURE_IMPLEMENTATION_GUIDE.md
  └─ Code examples for each major component
  └─ How to write each block correctly
  └─ Testing patterns

ARCHITECTURE_DATA_FLOW_DIAGRAMS.md
  └─ Visual data flows for main cycle
  └─ Cache lifecycle
  └─ Event flows
  └─ Config-driven loading

THIS FILE: QUICK START
  └─ How to implement Phase 0.2 and 0.3
  └─ Checklist for each phase
  └─ Expected outcomes
```

---

## ⏱️ Timeline

| Phase | Name | Duration | Files | Status |
|-------|------|----------|-------|--------|
| **0.1** | Architecture Types | ✅ DONE | architecture.types.ts + 6 interfaces | COMPLETE |
| **0.2** | Indicator Cache | 3-5 days | Core: ✅ DONE, Integration: IN PROGRESS | **BUILD SUCCESSFUL** |
| **0.3** | Decision Functions | 2-3 days | src/decision-engine/*.ts | **AFTER 0.2** |
| **1** | Action Queue | 5-7 days | ActionQueueService + handlers | Later |
| **2+** | External Interfaces | 4+ weeks | IExchange, ICandleProvider, etc | Later |

---

## 🎯 Phase 0.2: Indicator Cache (The Critical Bottleneck)

### Why It's Critical

**Current Problem:**
```
Loop 1 (1m candle):
  ├─ RSI Analyzer calculates: RSI-14-1h
  ├─ EMA Analyzer calculates: RSI-14-1h AGAIN
  ├─ Trend Analyzer calculates: RSI-14-1h AGAIN
  ├─ [25 more analyzers...] → RSI-14-1h calculated 28 times!
  └─ Total CPU waste: 27 duplicate calculations per minute
```

**Solution:**
```
With IndicatorCache:
  ├─ RSI Analyzer: cache miss → calculate → store
  ├─ EMA Analyzer: cache hit → return (NO RECALCULATION)
  ├─ Trend Analyzer: cache hit → return (NO RECALCULATION)
  ├─ [25 more analyzers...] → use cached values
  └─ Total CPU saved: ~40-50%
```

### Implementation Checklist

#### Step 1: Create Cache Service (1 hour)

**File:** `src/services/indicator-cache.service.ts`

Copy from: `ARCHITECTURE_IMPLEMENTATION_GUIDE.md` → Section 1

```bash
# Create file
touch src/services/indicator-cache.service.ts

# Add code from guide
```

**Validation:**
```bash
npm run build
# ✓ Should compile without errors
```

---

#### Step 2: Inject Cache into BotFactory (30 min)

**File:** `src/services/bot-services.ts`

Change:
```typescript
// BEFORE
constructor(config: Config, logger: LoggerService) {
  this.rsiAnalyzer = new RsiAnalyzerNew(logger);
  this.emaAnalyzer = new EmaAnalyzerNew(logger);
  // ... other analyzers
}

// AFTER
constructor(config: Config, logger: LoggerService) {
  this.indicatorCache = new IndicatorCacheService();

  this.rsiAnalyzer = new RsiAnalyzerNew(logger, this.indicatorCache);
  this.emaAnalyzer = new EmaAnalyzerNew(logger, this.indicatorCache);
  // ... pass to all analyzers
}
```

**Validation:**
```bash
npm run build
# ✓ Should compile
```

---

#### Step 3: Update Analyzers (2-3 hours)

Update 3 main analyzers to use cache:

**File:** `src/analyzers/rsi.analyzer-new.ts`

Add to constructor:
```typescript
constructor(
  private logger: LoggerService,
  private indicatorCache: IndicatorCacheService,  // NEW
) {}
```

Add to analyze():
```typescript
async analyze(candles: Candle[]): Promise<AnalyzerSignal> {
  const cacheKey = `RSI-${period}-${timeframe}`;

  // Check cache first
  let rsiValue = this.indicatorCache.get(cacheKey);

  if (rsiValue === null) {
    // Calculate only if not cached
    rsiValue = calculateRSI(candles, period);
    this.indicatorCache.set(cacheKey, rsiValue);
  }

  // Rest of logic...
}
```

**Repeat for:**
- `src/analyzers/ema.analyzer-new.ts`
- `src/analyzers/atr.analyzer-new.ts`

**Validation:**
```bash
npm run build
# ✓ Should compile

npm test -- rsi.analyzer-new.test.ts
# ✓ Tests should pass (same results)
```

---

#### Step 4: Clear Cache on New Candle (30 min)

**File:** `src/services/trading-orchestrator.service.ts`

Add to onCandleClosed():
```typescript
async onCandleClosed(candle: Candle): Promise<void> {
  // Clear cache at start of new candle
  this.indicatorCache.clear();

  // ... rest of logic
}
```

**Validation:**
```bash
npm run build
# ✓ Should compile
```

---

#### Step 5: Test Backtest (2-3 hours)

Run backtest to verify results unchanged:

```bash
# Run backtest (example)
npm run backtest:xrp

# Check results:
# - Win rate: should be SAME as before
# - Trades count: should be SAME as before
# - Entry/exit prices: should be SAME as before
# - Total PnL: should be SAME as before
```

**Expected Output:**
```
Backtest Results:
  Total Trades: 145
  Win Rate: 52.4%
  Total PnL: +$2,340

Cache Stats:
  Entries cached: 128
  Hit rate: 71%
  CPU improvement: ~45%
```

---

#### Step 6: Commit (30 min)

```bash
git add src/services/indicator-cache.service.ts
git add src/services/bot-services.ts
git add src/analyzers/rsi.analyzer-new.ts
git add src/analyzers/ema.analyzer-new.ts
git add src/analyzers/atr.analyzer-new.ts
git add src/services/trading-orchestrator.service.ts

git commit -m "Feat: Add indicator cache to prevent duplicate calculations

- Create IndicatorCacheService with LRU eviction
- Inject into BotFactory, pass to all analyzers
- Clear cache on every new candle
- Expected: 40-50% CPU reduction, zero behavior change

Results:
- Backtest shows identical results (win rate, PnL)
- Cache hit rate: ~70% (analyzers share indicators)
- Memory: +50KB max cache usage"
```

---

### Phase 0.2 Success Criteria

✅ All these must be true:

- [ ] IndicatorCacheService compiles
- [ ] BotFactory compiles with cache injection
- [ ] 3 analyzers updated with cache usage
- [ ] Cache clears on new candle
- [ ] Backtest results IDENTICAL (same win rate, PnL, trade count)
- [ ] Code compiles: `npm run build`
- [ ] Git commit created

**If all ✓ → Phase 0.2 COMPLETE**

---

## 🎯 Phase 0.3: Decision Functions (Extract Pure Logic)

### Why It's Important

**Current Problem:**
```
EntryOrchestrator.evaluate() has:
  - Business logic (IF confidence > 60%)
  - Service calls (trendService.getTrend())
  - Side effects (logger.debug())
  - State mutations (this.state = ...)

Cannot test without initializing entire bot
Cannot reuse in different context (backtester, ML)
Hard to understand what logic actually is
```

**Solution:**
```typescript
// Pure function in separate file
export function evaluateEntry(context): Decision {
  // ONLY decision logic
  // NO side effects
  // NO service calls
  // TESTABLE with single function call
  if (context.signal.confidence < 60) return 'SKIP';
  if (context.openPositions.length > 0) return 'SKIP';
  // ...
  return 'ENTER';
}

// Can test:
const decision = evaluateEntry({...}); // Single line, no setup
expect(decision).toBe('ENTER');
```

### Implementation Checklist

#### Step 1: Create Decision Module (2 hours)

**File:** `src/decision-engine/entry-decisions.ts`

Copy from: `ARCHITECTURE_IMPLEMENTATION_GUIDE.md` → Section 2

```bash
mkdir -p src/decision-engine
touch src/decision-engine/entry-decisions.ts
```

Content:
```typescript
export type EntryDecision = 'ENTER' | 'SKIP' | 'WAIT';

export interface EntryContext {
  signal: { direction: 'LONG' | 'SHORT'; confidence: number };
  trend: { bias: 'UP' | 'DOWN' | 'NEUTRAL'; strength: number };
  openPositions: Position[];
  rules: { minConfidence: number; ... };
}

export function evaluateEntry(context: EntryContext): EntryDecision {
  // Pure logic, see guide for full implementation
}
```

**Validation:**
```bash
npm run build
# ✓ Should compile
```

---

#### Step 2: Write Unit Tests (2 hours)

**File:** `src/__tests__/decision-engine/entry-decisions.test.ts`

Copy from: `ARCHITECTURE_IMPLEMENTATION_GUIDE.md` → Section 2 (Testing)

```typescript
describe('evaluateEntry', () => {
  it('should SKIP when already in position', () => {
    const context = { ... };
    const decision = evaluateEntry(context);
    expect(decision).toBe('SKIP');
  });

  // 4-5 more test cases
});
```

**Run:**
```bash
npm test -- entry-decisions.test.ts

# Expected: All tests pass ✓
```

---

#### Step 3: Update EntryOrchestrator (1 hour)

**File:** `src/orchestrators/entry.orchestrator.ts`

Change:
```typescript
// BEFORE
class EntryOrchestrator {
  evaluate(signal, context): EntryDecision {
    // 50+ lines of logic
  }
}

// AFTER
import { evaluateEntry, type EntryContext } from '../decision-engine/entry-decisions';

class EntryOrchestrator {
  evaluate(signal, context): EntryDecision {
    // Prepare context for pure function
    const decisionContext: EntryContext = {
      signal: { direction: signal.direction, confidence: signal.confidence },
      trend: { bias: context.trend.bias, strength: context.trend.strength },
      openPositions,
      rules: this.rules,
    };

    // Call pure function
    const decision = evaluateEntry(decisionContext);

    // Log after decision (side effect allowed after pure logic)
    this.logger.debug('Entry decision:', decision);

    return decision;
  }
}
```

**Validation:**
```bash
npm run build
# ✓ Should compile

npm test -- entry.orchestrator.test.ts
# ✓ Existing tests should pass
```

---

#### Step 4: Create Exit Decisions (Optional, 2 hours)

Similar to Entry:

**File:** `src/decision-engine/exit-decisions.ts`

```typescript
export type ExitAction = 'CLOSE' | 'UPDATE_SL' | 'ACTIVATE_TRAILING' | 'WAIT';

export function evaluateExit(position, price, context): ExitAction {
  // Pure exit logic
}
```

---

#### Step 5: Test Everything Works (1 hour)

```bash
npm run build
# ✓ Should compile

npm test
# ✓ All tests should pass

npm run backtest:xrp
# ✓ Results should be IDENTICAL to before
```

---

#### Step 6: Commit (30 min)

```bash
git add src/decision-engine/
git add src/orchestrators/entry.orchestrator.ts
git add src/__tests__/decision-engine/

git commit -m "Refactor: Extract decision logic to pure functions

- Create decision-engine module with evaluateEntry()
- Move 50+ lines of logic out of EntryOrchestrator
- Add unit tests (4 test cases for evaluateEntry)
- Update orchestrator to call pure function
- Zero behavior change, same results in backtest

Benefits:
- Testable without initializing bot
- Reusable in backtester, ML models
- Clear separation of concerns
- Easier to understand logic"
```

---

### Phase 0.3 Success Criteria

✅ All these must be true:

- [ ] `src/decision-engine/entry-decisions.ts` created
- [ ] Pure `evaluateEntry()` function works
- [ ] Unit tests for pure function pass
- [ ] EntryOrchestrator updated to call pure function
- [ ] Backtest results IDENTICAL
- [ ] Code compiles: `npm run build`
- [ ] All tests pass: `npm test`
- [ ] Git commit created

**If all ✓ → Phase 0.3 COMPLETE**

---

## 📊 Expected Outcomes

### After Phase 0.2 (Indicator Cache)

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| CPU Usage | 100% | ~55% | -45% |
| Memory | 1.2 MB | 1.3 MB | +0.1 MB (negligible) |
| Latency (analysis) | 500ms | 300ms | -40% |
| Trades per day | 25 | 28 | +12% (more responsive) |
| Win rate | 52% | 52% | 0% (unchanged ✓) |

---

### After Phase 0.3 (Decision Functions)

| Metric | Before | After |
|--------|--------|-------|
| Testability | Need full bot init | Single function call |
| Lines of logic in orchestrator | 150+ | 50 |
| Reusability | Not reusable | Can use in backtester, ML |
| Code clarity | Mixed concerns | Clear separation |

---

## 🔍 How to Verify Everything Works

### Quick Sanity Check

```bash
# 1. Compile
npm run build

# 2. Run tests
npm test

# 3. Run short backtest
npm run backtest:xrp --limit 100  # Last 100 candles

# Expected:
# ✓ Compiles without errors
# ✓ All tests pass
# ✓ Trades open/close at same times as before
```

### Full Verification

```bash
# 1. Full backtest
npm run backtest:xrp

# 2. Check results match previous run
# - Same trade count
# - Same win rate (±0.5%)
# - Same total PnL (±$10)

# 3. Check memory
node --trace-gc src/bot.ts 2>&1 | grep "heap" | head -10
# Expected: ~1.5 MB stable, no growth

# 4. Run bot for 1 hour
npm start
# Watch for:
# - No errors in logs
# - Positions open/close correctly
# - Telegram alerts working
# - CPU usage down ~40%
```

---

## 🚨 Common Pitfalls to Avoid

### Phase 0.2 Issues

❌ **Don't:** Update all 28 analyzers at once
✅ **Do:** Update 3 main ones first (RSI, EMA, ATR), verify, then others

❌ **Don't:** Forget to clear cache on new candle
✅ **Do:** Call `cache.clear()` in `onCandleClosed()` at the start

❌ **Don't:** Use analyzer-specific cache
✅ **Do:** Share cache across all analyzers (that's the point!)

❌ **Don't:** Change analyzer logic
✅ **Do:** Only add cache checks, keep everything else the same

---

### Phase 0.3 Issues

❌ **Don't:** Make pure functions with service calls
✅ **Do:** Pass all dependencies as parameters

❌ **Don't:** Change logic
✅ **Do:** Extract existing logic as-is to pure function

❌ **Don't:** Test pure function with mocked services
✅ **Do:** Test with just data objects, no mocks needed

❌ **Don't:** Write complex pure functions
✅ **Do:** Keep functions < 30 lines, one decision per function

---

## 📚 Documentation Map

When you need to understand something:

| Question | Document | Section |
|----------|----------|---------|
| "What are all the components?" | ARCHITECTURE_LEGO_BLUEPRINT.md | Complete Module Inventory |
| "How does component X work?" | ARCHITECTURE_LEGO_BLUEPRINT.md | TIER sections |
| "How do I write component X?" | ARCHITECTURE_IMPLEMENTATION_GUIDE.md | Section for component |
| "How does data flow in the system?" | ARCHITECTURE_DATA_FLOW_DIAGRAMS.md | Main Trading Cycle |
| "How do I implement Phase 0.2?" | This file | Phase 0.2 section |
| "Memory issues?" | ARCHITECTURE_LEGO_BLUEPRINT.md | Memory Management |

---

## 🎯 Next Steps After 0.3

Once Phase 0.3 is complete:

### Short-term (1-2 weeks)
- Implement Phase 1 (Action Queue)
- Extract Exit decision logic
- Add Decision Engine service wrapper

### Medium-term (2-4 weeks)
- Phase 2: IExchange interface
- Phase 3: Pure StrategyCoordinator
- Phase 5: Enhanced dependency injection

### Long-term (4+ weeks)
- Phase 4: Analyzer engine
- Phase 6: Decision engine service
- Phase 7: Repository pattern
- Phase 8: Integration & cleanup

---

## 💡 Pro Tips

1. **Test After Each Step**
   - After creating cache: `npm run build`
   - After injecting cache: `npm run build && npm test`
   - After updating analyzer: run specific test
   - Don't wait to test at the end!

2. **Use Git Frequently**
   - Commit after each working step
   - Easy to rollback if something breaks
   - Clear history of what changed

3. **Reference Existing Code**
   - Check `src/indicators/ema.indicator-new.ts` for pattern
   - Check existing tests for test patterns
   - Copy-paste-adapt is faster than writing from scratch

4. **Run Backtest Often**
   - Don't go more than 2 hours without verifying results
   - Small changes can have unexpected effects
   - Quick backtest: `npm run backtest:xrp --limit 100`

5. **Keep It Simple**
   - Don't optimize prematurely
   - Don't add features not asked for
   - Don't refactor old code (yet)

---

## 🎓 Learning Resources

**Inside this project:**
- `ARCHITECTURE_LEGO_BLUEPRINT.md` - Main reference
- `ARCHITECTURE_IMPLEMENTATION_GUIDE.md` - Code examples
- `ARCHITECTURE_DATA_FLOW_DIAGRAMS.md` - Visual flows
- `src/indicators/ema.indicator-new.ts` - Reference implementation
- `src/__tests__/indicators/ema.indicator-new.test.ts` - Reference tests

**General concepts:**
- Dependency Injection: allows easy testing
- Pure Functions: testable, reusable, understandable
- Event-Driven Architecture: decouples components
- LRU Cache: memory-safe caching strategy

---

## ✅ Final Checklist

Before starting Phase 0.2:

- [ ] Read ARCHITECTURE_LEGO_BLUEPRINT.md (30 min)
- [ ] Read ARCHITECTURE_IMPLEMENTATION_GUIDE.md sections 1-2 (30 min)
- [ ] Understand Phase 0.2 goal: indicator cache (10 min)
- [ ] Understand Phase 0.3 goal: pure functions (10 min)
- [ ] Have 4-5 hours blocked for Phase 0.2 (today or tomorrow)
- [ ] Have 3-4 hours blocked for Phase 0.3 (after 0.2 complete)
- [ ] Git repository clean (no uncommitted changes)
- [ ] Tests passing: `npm test`
- [ ] Backtest working: `npm run backtest:xrp --limit 10`

**All ✓? You're ready! Start Phase 0.2 now.**

---

**Version:** 1.0
**Created:** 2026-01-13
**Status:** Ready to implement
**Estimated Timeline:** 5-7 days total (Phase 0.2 + 0.3)
