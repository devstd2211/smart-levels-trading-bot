# 🏛️ Architecture Documentation - Complete Reference

**Last Updated:** 2026-01-13 22:15 (Session 2)
**Status:** ✅ Phase 0.2 Core Implementation Complete - Build Successful
**Version:** 1.0 (Core implementation done, integration pending)

---

## 📚 Document Structure

This folder contains **4 comprehensive documents** describing the complete LEGO trading bot architecture:

### 1. **ARCHITECTURE_LEGO_BLUEPRINT.md** (PRIMARY)
**Read this first!**
- Complete list of ALL 35+ components (modules/blocks)
- Responsibilities and inputs/outputs for each
- 10 architectural layers explained
- Data flows from signal → position → close
- Memory management strategy (prevent leaks)
- Assembly instructions (how to build the system)
- Component dependency graph
- Validation checklist for each component

**Use when:**
- Understanding system structure
- Learning what each component does
- Planning new features
- Debugging dependencies
- Optimizing memory

---

### 2. **ARCHITECTURE_IMPLEMENTATION_GUIDE.md**
**Read for implementation details**
- Code examples for 7 major components:
  - 1. IndicatorCache (Phase 0.2 - CRITICAL)
  - 2. Decision Functions (Phase 0.3 - Pure Logic)
  - 3. RiskManager (Gatekeeper)
  - 4. PositionLifecycle (Entry→Close)
  - 5. TradingOrchestrator (Main Loop)
  - 6. EventBus (Decoupling)
  - 7. AnalyzerLoading (Pluggable)
- Full code snippets ready to copy-paste
- Usage patterns for each component
- Testing patterns and examples
- Integration points with other components

**Use when:**
- Implementing a new component
- Refactoring existing code
- Understanding how components connect
- Writing tests
- Finding code examples

---

### 3. **ARCHITECTURE_DATA_FLOW_DIAGRAMS.md**
**Read for visual understanding**
- Visual ASCII diagrams of key flows:
  1. Main Trading Cycle (1 minute loop)
  2. Position Monitoring & Exit
  3. Memory Cache Lifecycle
  4. Event Flow (Decoupled Components)
  5. Strategy Configuration Flow
  6. Component Dependency Tree

**Use when:**
- Debugging signal flow issues
- Understanding event chains
- Tracing memory leaks
- Learning how config drives behavior
- Visualizing dependencies

---

### 4. **ARCHITECTURE_QUICK_START.md** (FOR NOW!)
**Read this to START Phase 0.2/0.3**
- Step-by-step implementation guide
- Phase 0.2 (Indicator Cache) - 5 steps, 3-5 days
- Phase 0.3 (Decision Functions) - 5 steps, 2-3 days
- Checklist for each phase
- Expected outcomes (CPU improvement, memory usage)
- How to verify everything works
- Common pitfalls and how to avoid them
- Success criteria for each phase

**Use when:**
- Starting Phase 0.2 implementation
- Need a checklist
- Want to know expected outcomes
- Stuck and need troubleshooting
- Verifying your implementation

---

## 🎯 Quick Decision Tree

### "I want to understand the whole system"
→ Read: **ARCHITECTURE_LEGO_BLUEPRINT.md**
→ Time: 1-2 hours
→ Output: Complete understanding of architecture

### "I want to understand how data flows"
→ Read: **ARCHITECTURE_DATA_FLOW_DIAGRAMS.md**
→ Time: 30-45 minutes
→ Output: Visual understanding of processes

### "I want to implement Phase 0.2 NOW"
→ Read: **ARCHITECTURE_QUICK_START.md** (Phase 0.2 section)
→ Then: **ARCHITECTURE_IMPLEMENTATION_GUIDE.md** (Section 1)
→ Time: 3-5 days
→ Output: Working IndicatorCache

### "I'm refactoring Component X"
→ Search in: **ARCHITECTURE_LEGO_BLUEPRINT.md** for component
→ Find in: **ARCHITECTURE_IMPLEMENTATION_GUIDE.md** for code
→ Check: **ARCHITECTURE_DATA_FLOW_DIAGRAMS.md** for context
→ Time: 1-2 hours
→ Output: Correct implementation

### "Memory is leaking / CPU is high"
→ Read: **ARCHITECTURE_LEGO_BLUEPRINT.md** → Memory Management section
→ Check: **ARCHITECTURE_DATA_FLOW_DIAGRAMS.md** → Cache Lifecycle
→ Debug: Check if cache.clear() is being called
→ Time: 1 hour
→ Output: Fixed memory leak

---

## 🏗️ System at a Glance

### Components (Simplified View)

```
INPUT: Candles from exchange
  ↓
ANALYSIS: Generate signals (28 analyzers)
  ↓
AGGREGATION: Weight and combine signals
  ↓
FILTERING: Apply 9 filters to block false signals
  ↓
DECISION: Determine ENTER/SKIP/WAIT
  ↓
RISK: Approve trade size and check limits
  ↓
EXECUTION: Open position atomically with SL/TP
  ↓
MONITORING: Track position through all exits
  ↓
EVENT: Emit "positionClosed" → triggers logging, alerts, stats
  ↓
WAIT: Back to start, waiting for next signal

OUTPUT: Trades logged, PnL tracked, alerts sent
```

### Key Design Principles

1. **LEGO Blocks:** Each component is independent
2. **Pure Functions:** Testable without full bot init
3. **Event-Driven:** Loose coupling between services
4. **Dependency Injection:** All dependencies passed in
5. **Pluggable Config:** Behavior changes via JSON, not code
6. **Memory Safe:** LRU caching with explicit TTL
7. **Atomic Operations:** Position SL/TP set with open (no race)
8. **No ANY Types:** Strict ConfigNew typing everywhere

---

## 🔄 The Process (Today & Next 2 Weeks)

### Week 1: Foundation (Now)
- ✅ Phase 0.1: Architecture types (DONE)
- 🔴 Phase 0.2: Indicator Cache (THIS WEEK)
- 🔴 Phase 0.3: Decision Functions (THIS WEEK)

### Week 2-3: Action Queue
- 🟡 Phase 1.1: ActionQueueService
- 🟡 Phase 1.2: Action handlers
- 🟡 Phase 1.3: Orchestrator integration

### Week 4+: Interfaces & Integration
- 🟡 Phase 2: IExchange interface
- 🟡 Phase 3: Pure StrategyCoordinator
- 🟡 Phase 5: Enhanced DI

---

## 📋 Component Checklist (For Reference)

### Core Orchestration (5)
- [ ] TradingOrchestrator - main loop
- [ ] EntryOrchestrator - entry decisions
- [ ] ExitOrchestrator - exit decisions
- [ ] StrategyCoordinator - signal aggregation
- [ ] FilterOrchestrator - filter enforcement

### Decision Layer (4) - Phase 0.3
- [ ] evaluateEntry() - pure function
- [ ] evaluateExit() - pure function
- [ ] validateRisk() - pure function
- [ ] aggregateSignals() - pure function

### Risk & Validation (3)
- [ ] RiskManager - gatekeeper
- [ ] MTFSnapshotGate - race condition prevention
- [ ] EntryConfirmationManager - candle confirmation

### Position Management (4)
- [ ] PositionLifecycleService - open→close
- [ ] PositionExitingService - exit execution
- [ ] TakeProfitManager - TP detection
- [ ] BybitService - exchange API

### Data & Caching (4) - Phase 0.2
- [ ] CandleProvider - candle delivery + LRU
- [ ] TimeframeProvider - TF management
- [ ] IndicatorCache - shared indicator cache (NEW)
- [ ] MarketDataCollector - orderbook, funding

### Context & Analysis (6)
- [ ] MultiTimeframeTrendService - trend analysis
- [ ] SwingPointDetectorService - support/resistance
- [ ] TimeframeWeightingService - HTF weighting
- [ ] VolatilityRegimeService - ATR-based volatility
- [ ] WhaleDetectionService - large orders
- [ ] MarketHealthMonitor - market conditions

### Signal Generation (28)
- [ ] 6 Technical Indicators (EMA, RSI, ATR, Volume, Stochastic, BB)
- [ ] 4 Advanced (Divergence, Breakout, Wick, Momentum)
- [ ] 4 Structure (TBD)
- [ ] 2 Level (TBD)
- [ ] 8 Liquidity & SMC (TBD)
- [ ] 3 Scalping (TBD)
- [ ] 1 Analyzer Registry (factory pattern)

### Events & State (3)
- [ ] BotEventBus - centralized events
- [ ] PositionMonitor - state tracking
- [ ] PositionSyncService - exchange sync

### Monitoring & Logging (5)
- [ ] LoggerService - structured logging
- [ ] TelegramService - alerts
- [ ] BotMetricsService - performance tracking
- [ ] ConsoleDashboard - live display
- [ ] SessionStatsService - session stats

### Persistence (2)
- [ ] TradingJournalService - trade history
- [ ] TradeHistoryService - backtesting data

### Infrastructure (4)
- [ ] BotInitializer - startup
- [ ] ConfigValidator - validation
- [ ] WebSocketManager - live connection
- [ ] BotFactory - dependency injection

**TOTAL: 35+ components**

---

## 🚀 How to Use These Docs (Right Now)

### Step 1: Read This Document (5 min)
✓ You're doing this now!

### Step 2: Read ARCHITECTURE_LEGO_BLUEPRINT.md (1 hour)
Focus on:
- Executive Summary
- Architecture Layers (skim the 10 layers)
- Complete Module Inventory (the table)
- Memory Management section
- Data Flow section

Skip for now:
- Implementation details
- Code examples

### Step 3: Read ARCHITECTURE_QUICK_START.md Phase 0.2 (30 min)
Focus on:
- Why it's critical (problem/solution)
- Implementation checklist (6 steps)
- Success criteria

Skip for now:
- Phase 0.3
- Common pitfalls
- Next steps

### Step 4: Read ARCHITECTURE_IMPLEMENTATION_GUIDE.md Section 1 (30 min)
Focus on:
- IndicatorCache code example
- Usage in analyzers
- Integration in BotFactory

### Step 5: Start Implementing Phase 0.2
Use the checklist in ARCHITECTURE_QUICK_START.md

---

## 💡 Key Insights

### Why This Architecture?

**Problem:** Trading bot has grown to 100+ files, 10K+ lines with:
- Mixed concerns (logic + side effects)
- Tight coupling (hard to test)
- Memory leaks (caches never cleared)
- Configuration hardcoded (can't change strategy without code)
- Duplicate calculations (analyzers recalculate same indicators)

**Solution:** LEGO architecture with:
- **Modularity:** Each block independent
- **Testability:** Pure functions + dependency injection
- **Caching:** Shared IndicatorCache with LRU eviction
- **Configuration:** Strategy JSON controls behavior
- **Events:** Loose coupling via event bus
- **Memory Safety:** Explicit TTL on all caches

### Expected Improvements

| Aspect | Impact |
|--------|--------|
| **CPU** | -40-50% (Phase 0.2 cache) |
| **Memory** | +50KB (cache) - offset by efficiency |
| **Testability** | 10x faster (no bot init) |
| **Maintainability** | 5x clearer (separation of concerns) |
| **Extensibility** | 2x easier (plug-and-play) |
| **Performance** | 0% change (same logic) |

---

## 🎓 Learning Path

**If you're new to this project:**

1. Read this README (5 min)
2. Read ARCHITECTURE_LEGO_BLUEPRINT.md (1 hour)
3. Read ARCHITECTURE_DATA_FLOW_DIAGRAMS.md (30 min)
4. Read ARCHITECTURE_QUICK_START.md (30 min)
5. Implement Phase 0.2 (3-5 days) - Follow checklist!
6. Implement Phase 0.3 (2-3 days) - Follow checklist!
7. Review ARCHITECTURE_IMPLEMENTATION_GUIDE.md as you code
8. Celebrate! 🎉

**Total time investment: ~10 hours reading + 5-7 days coding = 1 week**

---

## 🔗 Related Documents

**In this folder:**
- `ARCHITECTURE_LEGO_BLUEPRINT.md` - Main reference (read first)
- `ARCHITECTURE_IMPLEMENTATION_GUIDE.md` - Code examples
- `ARCHITECTURE_DATA_FLOW_DIAGRAMS.md` - Visual flows
- `ARCHITECTURE_QUICK_START.md` - Implementation guide (for Phase 0.2/0.3)

**In codebase:**
- `MIGRATION_PLAN.md` - Old document (deprecated, use Blueprint instead)
- `ARCHITECTURE_REFACTOR_PLAN.md` - Old document (deprecated, use Blueprint instead)
- `src/types/architecture.types.ts` - Phase 0.1 (DONE)
- `src/interfaces/` - Phase 0.1 interfaces (DONE)
- `src/indicators/ema.indicator-new.ts` - Reference implementation
- `src/__tests__/indicators/ema.indicator-new.test.ts` - Reference tests

---

## 🎯 Success Metrics

### After Phase 0.2
- [ ] CPU usage down 40-50%
- [ ] Backtest results identical
- [ ] No memory growth
- [ ] Cache hit rate > 70%
- [ ] All tests pass

### After Phase 0.3
- [ ] Decision functions have unit tests
- [ ] Testable without bot initialization
- [ ] Same trading behavior
- [ ] Clearer code (50+ lines removed from orchestrator)

### After Phase 1
- [ ] Entry/exit fully decoupled
- [ ] Action queue processing correctly
- [ ] No performance regression
- [ ] Error isolation (one handler failure doesn't crash system)

---

## ❓ FAQ

**Q: Can I run the bot while implementing these phases?**
A: Yes! After Phase 0.1 (already done), Phase 0.2 and 0.3 don't change behavior. Bot works exactly the same.

**Q: What if backtest results change?**
A: Something's wrong! These phases don't change logic, only optimize it. If results differ, you either:
- Changed logic accidentally
- Analyzer isn't using cache correctly
- Cache is being used wrong
See "Common Pitfalls" in ARCHITECTURE_QUICK_START.md

**Q: Do I have to do all phases?**
A: Phase 0.2 (cache) is critical - do it. Phase 0.3 (pure functions) is important but optional. Phases 1+ can be done later.

**Q: What's the minimum viable implementation?**
A: Phase 0.2 only (indicator cache). Gets you -40-50% CPU. Everything else is "nice to have".

**Q: How do I know if implementation is correct?**
A: Backtest results are identical. That's the only metric that matters. If you get same trades, same wins/losses, you're good.

---

## 🆘 Getting Help

**If you get stuck:**

1. Check the relevant document section
2. Find code example in ARCHITECTURE_IMPLEMENTATION_GUIDE.md
3. Compare with reference code: `src/indicators/ema.indicator-new.ts`
4. Run tests: `npm test`
5. Check git diff: `git diff` (what changed?)
6. Revert and try again: `git checkout -- .`

**Common issues & solutions are in ARCHITECTURE_QUICK_START.md → Common Pitfalls**

---

## 📞 When to Ask for Help

- After following the documentation and still stuck (30+ min)
- When tests are failing but you don't know why
- When backtest results change unexpectedly
- When you're unsure about a design decision
- When you want feedback on code quality

**Not for:**
- How do I read the docs? (read them!)
- Is my implementation right? (run backtest!)
- Can you implement it for me? (no, but we can guide you!)

---

## ✅ Checklist Before Starting Phase 0.2

- [ ] Read this README.md (✓ done)
- [ ] Read ARCHITECTURE_LEGO_BLUEPRINT.md (executive + overview sections)
- [ ] Read ARCHITECTURE_QUICK_START.md Phase 0.2 section
- [ ] Have 4-5 hours blocked on calendar
- [ ] Git repo is clean (`git status` shows nothing)
- [ ] Backtest works: `npm run backtest:xrp --limit 10`
- [ ] Tests pass: `npm test`
- [ ] You understand the problem (40+ CPU waste from duplicate calculations)
- [ ] You understand the solution (shared IndicatorCache)

**All ✓? Start Phase 0.2 now! Follow the checklist in ARCHITECTURE_QUICK_START.md**

---

## 🎉 You're Ready!

This documentation is complete and ready to use. Pick up `ARCHITECTURE_QUICK_START.md` and follow the Phase 0.2 checklist.

Expected completion:
- Phase 0.2: 3-5 days
- Phase 0.3: 2-3 days
- Total: 5-7 days

Result:
- 40-50% CPU reduction
- 10x faster testing
- Cleaner, more maintainable code
- Foundation for future improvements

**Let's build a LEGO trading bot! 🧱📊**

---

**Document Version:** 1.0
**Last Updated:** 2026-01-13
**Status:** Complete and Ready
**Next Action:** Start Phase 0.2 Implementation
