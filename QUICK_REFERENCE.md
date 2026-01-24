# ⚡ Quick Reference - Edison Trading Bot

**Developer quick reference. All essential commands and files in one place.**

---

## 🎯 QUICK START (5 minutes)

### 1. Build and Tests
```bash
npm run build           # Full build (main + web-server + web-client)
npm test               # Run all tests
npm test -- position   # Run specific test
```

### 2. Run Bot
```bash
npm start              # Start bot (if available)
npm run backtest-v5    # Run V5 backtest
```

### 3. Git Operations
```bash
git status             # Check status
git commit -m "msg"    # Create commit
git push               # Push to remote
```

---

## 📁 KEY FILES

### 🔴 CRITICAL (IMPORTANT!)
| File | Purpose | TP Fix? |
|------|---------|---------|
| `src/services/websocket-manager.service.ts` | WebSocket handling | ✅ YES |
| `src/services/position-exiting.service.ts` | Position exit logic | ✅ YES |
| `src/orchestrators/exit.orchestrator.ts` | Exit state machine | ✅ YES |

### 🟢 CONFIG
| File | Purpose |
|------|---------|
| `config.json` | Main bot configuration |
| `strategies/json/simple-levels.strategy.json` | Strategy (TP: 0.5%, 1%, 1.5%) |
| `settings.json` | Claude Code settings |

### 🔵 ARCHITECTURE
| Component | File |
|-----------|------|
| Main service | `src/services/trading-orchestrator.service.ts` |
| Entry decisions | `src/orchestrators/entry.orchestrator.ts` |
| Exit decisions | `src/orchestrators/exit.orchestrator.ts` |
| Signal filtering | `src/orchestrators/filter.orchestrator.ts` |

### 📊 TESTS (Where is TP fix?)
```
src/__tests__/
├── services/
│   ├── position-exiting.functional.test.ts     ← TP fix tests
│   └── position-exiting.integration.test.ts    ← TP fix tests
├── orchestrators/
│   ├── entry.orchestrator.test.ts
│   ├── exit.orchestrator.test.ts
│   └── filter-strategy.test.ts
└── indicators/
    ├── ema.indicator-new.test.ts
    ├── rsi.indicator-new.test.ts
    └── ...
```

---

## 🔒 CRITICAL TP BUG FIX (Session 27)

### THE PROBLEM
```
After TP1 execution:
WebSocket → entryPrice="" → parseFloat("") = NaN
↓
TakeProfitManager.entryPrice = NaN
↓
Position orphaned (unmanaged)
↓
MONEY LOSS
```

### THE SOLUTION
**Files:** `websocket-manager.service.ts` + `position-exiting.service.ts`

```typescript
// BEFORE (incorrect):
const price = parseFloat(entryPrice ?? avgPrice ?? "0");
// Problem: parseFloat("") = NaN, doesn't trigger nullish coalescing!

// AFTER (correct):
const price = parseFloat(entryPrice?.trim?.() || avgPrice || "0");
// 1. Check for empty strings
// 2. Validate parseFloat result
// 3. Proper fallback chain
```

### TESTS
- **Functional:** `position-exiting.functional.test.ts` (9 tests)
- **Integration:** `position-exiting.integration.test.ts` (7 tests)
- **Status:** ✅ All passing

---

## 🏗️ ARCHITECTURE (TL;DR)

```
┌─────────────────────────────────────┐
│     WebSocket → Market Data         │
└──────────┬──────────────────────────┘
           │
           ↓
┌─────────────────────────────────────┐
│    Entry Orchestrator               │
│  (Ranking signals by confidence)    │
└──────────┬──────────────────────────┘
           │
           ↓
┌─────────────────────────────────────┐
│    Exit Orchestrator                │
│  (State: OPEN → TP1 → TP2 → CLOSED) │ ← TP FIX HERE!
└──────────┬──────────────────────────┘
           │
           ↓
┌─────────────────────────────────────┐
│    Position Lifecycle Service       │
│  (Manage position state)            │ ← TP FIX HERE!
└──────────┬──────────────────────────┘
           │
           ↓
┌─────────────────────────────────────┐
│    Action Queue + Event Bus         │
│  (Execute trades)                   │
└──────────┬──────────────────────────┘
           │
           ↓
┌─────────────────────────────────────┐
│    Exchange API (Bybit/Binance)     │
│  (Real trades)                      │
└─────────────────────────────────────┘
```

---

## 📊 ANALYZERS (28 total)

### Primary (used frequently)
| Analyzer | Purpose |
|----------|---------|
| LEVEL_ANALYZER_NEW | Support/resistance levels |
| BREAKOUT_ANALYZER_NEW | Level breakouts |
| TREND_DETECTOR_ANALYZER_NEW | Trend detection |
| EMA_ANALYZER_NEW | EMA crossovers |
| RSI_ANALYZER_NEW | Overbought/oversold |

### Advanced
| Analyzer | Purpose |
|----------|---------|
| DIVERGENCE_ANALYZER_NEW | Divergences |
| VOLATILITY_SPIKE_ANALYZER_NEW | Volatility spikes |
| ORDER_BLOCK_ANALYZER_NEW | Order blocks |
| LIQUIDITY_SWEEP_ANALYZER_NEW | Liquidity sweeps |

---

## ⚙️ COMMON TASKS

### Task: Run TP fix tests
```bash
npm test -- position-exiting
```

### Task: Change TakeProfit
```json
// strategies/json/simple-levels.strategy.json
"takeProfits": [
  {"level": 1, "percent": 0.5, "sizePercent": 33},   // Change here
  {"level": 2, "percent": 1.0, "sizePercent": 33},
  {"level": 3, "percent": 1.5, "sizePercent": 34}
]
```

### Task: Add new analyzer
```bash
# 1. Create file
src/analyzers/my-analyzer-new.ts

# 2. Implement IAnalyzer interface
export class MyAnalyzerNew implements IAnalyzer {
  analyze(candles: Candle[], config: any): Signal | null {
    // Your logic
  }
}

# 3. Add to registry (if needed)
src/services/analyzer-registry.service.ts
```

### Task: Run backtest
```bash
npm run backtest-v5 -- --symbol XRPUSDT --days 30
```

---

## 🚨 TROUBLESHOOTING

### Problem: Tests failing
```bash
npm test 2>&1 | head -50    # See first errors
npm test -- --verbose      # Verbose output
```

### Problem: Build error
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Problem: TypeScript error
```bash
npm run build 2>&1 | grep "error TS"    # See all TS errors
```

### Problem: WebSocket not connecting
Check:
- `config.json` → `exchange.apiKey` + `exchange.apiSecret`
- `src/services/websocket-manager.service.ts` (TP fixes added!)
- WebSocket logs

---

## 📈 CURRENT STATE

| Component | Status | Notes |
|-----------|--------|-------|
| Phase 14 | ✅ Complete | V5 backtest only |
| TP Bug Fix | ✅ Fixed | Critical security patch |
| Multi-Strategy | ✅ Working | Phase 10 complete |
| Live Trading | ✅ Ready | Phase 9 complete |
| Tests | ✅ 2618 passing | All green |
| Build | ✅ SUCCESS | TypeScript clean |

---

## 🔗 FULL DOCUMENTATION

- **ARCHITECTURE_QUICK_START.md** — Architecture overview
- **ARCHITECTURE_BLUEPRINT.md** — Complete blueprint
- **CLAUDE.md** — History and phases (minimized)
- **PHASE_15_ARCHITECTURE_PLAN.md** — Future plans

---

## 💡 KEY TAKEAWAYS

1. **TP Bug Fix = CRITICAL** — Read `position-exiting.service.ts` (lines 50-100)
2. **TakeProfit already optimized** — 0.5%, 1%, 1.5% for fast testing cycles
3. **settings.json** — Russian language, MCP enabled, AutoCompact 85%
4. **Build = SUCCESS** — Everything compiles, all tests passing

---

**Last Updated:** 2026-01-24 (Session 27)
**Status:** Production Ready ✅

*This file is updated with each new session. Use it for quick information lookup!*
