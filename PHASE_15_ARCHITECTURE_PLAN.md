# PHASE 15: Configuration Architecture Plan
## Multi-Strategy Configuration System Design

**Date:** 2026-01-23 (Session 27)
**Status:** 🎯 PLANNING PHASE
**Impact:** CRITICAL - Foundation for entire multi-strategy support

---

## 🔍 PROBLEM ANALYSIS

### Current State: Single-Strategy Config
```json
{
  "meta": {
    "strategy": "simple-levels",          // ← SINGLE STRATEGY
    "strategyFile": "simple-levels.json"  // ← SINGLE FILE
  },
  "trading": { ... },
  "riskManagement": { ... },
  "indicators": { ... },
  "analyzerDefaults": { ... }
}
```

**Issues:**
1. ❌ Only supports ONE active strategy at a time
2. ❌ No way to store multi-strategy configuration
3. ❌ Phase 10+ multi-strategy code tries to load from undefined fields
4. ❌ analyzerDefaults is global, not per-strategy
5. ❌ Risk management same for all strategies
6. ❌ No strategy-specific parameter overrides

### System Capability Gap
- ✅ Code supports: Multi-strategy execution (Phase 10: StrategyOrchestratorService, StrategyRegistryService)
- ❌ Config supports: Single strategy only
- ❌ Result: Mismatch between architecture and configuration!

---

## 🎯 SOLUTION: Multi-Strategy Config Structure

### Option A: Embedded Strategies (RECOMMENDED)
```json
{
  "version": 2,
  "meta": {
    "description": "Multi-Strategy Trading Bot",
    "lastUpdated": "2026-01-23",
    "activeStrategy": "simple-levels",      // ← Single active for backward compat
    "multiStrategyEnabled": true            // ← NEW: Enable multi-strategy mode
  },

  // ============= GLOBAL DEFAULTS (Applied to all strategies) =============
  "exchange": { ... },
  "system": { ... },
  "dashboard": { ... },

  // ============= STRATEGY-SPECIFIC CONFIGS =============
  "strategies": {
    "simple-levels": {
      "enabled": true,
      "description": "Level-based entry/exit strategy",
      "strategyFile": "strategies/json/simple-levels.strategy.json",

      // Strategy-specific overrides
      "trading": {
        "leverage": 10,
        "positionSizeUsdt": 10,
        "maxPositions": 1
        // Others inherit from global if not specified
      },

      "riskManagement": {
        "stopLossPercent": 2.0,
        "takeProfits": [...]
        // Others inherit from global
      },

      "indicators": {
        "ema": { "enabled": true, ... },
        "rsi": { "enabled": true, ... },
        "atr": { "enabled": true, ... },
        "volume": { "enabled": false, ... }
      },

      "analyzerDefaults": {
        "EMA_ANALYZER_NEW": { ... },
        "LEVEL_ANALYZER_NEW": { ... }
      },

      "filters": {
        "btcCorrelation": { "enabled": false },
        "nightTrading": { "enabled": false },
        "blindZone": { "enabled": true }
      }
    },

    "scalping": {
      "enabled": false,
      "description": "Scalping micro-movements",
      "strategyFile": "strategies/json/scalping.strategy.json",

      // Different params for this strategy
      "trading": {
        "leverage": 20,
        "positionSizeUsdt": 5,
        "maxPositions": 5
      },

      "riskManagement": {
        "stopLossPercent": 0.5,
        "takeProfits": [...]
      },

      // ... rest of config
    },

    "trend-following": {
      "enabled": false,
      // ... config for this strategy
    }
  },

  // ============= GLOBAL DEFAULTS (Fallback for all strategies) =============
  "timeframes": { ... },
  "confidence": { ... },
  "monitoring": { ... },
  "services": { ... },
  "logging": { ... }
}
```

**Benefits:**
- ✅ All strategies in ONE config file
- ✅ Per-strategy overrides clear and explicit
- ✅ Global defaults reduce duplication
- ✅ Backward compatible (activeStrategy field)
- ✅ Easy to enable/disable strategies
- ✅ Clear inheritance: global → strategy-specific

---

## 🏗️ ARCHITECTURE: Config Resolution Algorithm

```
For each strategy:
  1. Start with GLOBAL defaults (trading, risk, timeframes, etc)
  2. Apply STRATEGY-SPECIFIC overrides (if present)
  3. Load strategy.json file (strategy parameters)
  4. Result: Final config for that strategy

Example:
  Global trading.leverage = 10
  Strategy scalping.trading.leverage = 20
  → Scalping uses leverage 20
  → Others use leverage 10
```

### Code Architecture

```typescript
// ConfigResolutionService pseudo-code
export class ConfigResolutionService {

  // Load config for a specific strategy
  loadStrategyConfig(strategyName: string): ConfigNew {
    const baseConfig = this.globalConfig;
    const strategySection = this.config.strategies[strategyName];

    // Deep merge: strategy overrides global
    const merged = deepMerge(baseConfig, strategySection);

    // Load strategy.json file
    const strategyFile = strategySection.strategyFile;
    const strategyParams = loadStrategyFile(strategyFile);

    // Final merge: strategy file overrides everything
    return deepMerge(merged, strategyParams);
  }

  // Get all enabled strategies
  getEnabledStrategies(): StrategyName[] {
    return Object.entries(this.config.strategies)
      .filter(([_, config]) => config.enabled)
      .map(([name, _]) => name);
  }

  // Get active strategy for backward compatibility
  getActiveStrategy(): string {
    return this.config.meta.activeStrategy;
  }
}
```

---

## 📊 Type System (ConfigNew v2)

```typescript
export interface ConfigNew {
  version: number;
  meta: ConfigMetaNew;

  // GLOBAL DEFAULTS (inherited by all strategies)
  exchange: ExchangeConfigNew;
  system?: SystemConfigNew;
  dashboard?: DashboardConfigNew;
  timeframes: TimeframesConfigNew;
  confidence: ConfidenceConfigNew;
  monitoring: MonitoringConfigNew;
  services: ServicesConfigNew;
  logging?: LoggingConfigNew;

  // NEW: Multi-strategy section
  strategies: StrategiesCollectionConfigNew;
}

// NEW INTERFACE
export interface StrategiesCollectionConfigNew {
  [strategyName: string]: StrategyConfigNew;
}

export interface StrategyConfigNew {
  enabled: boolean;
  description?: string;
  strategyFile: string; // Path to strategy.json

  // Strategy-specific overrides (all optional)
  trading?: Partial<TradingConfigNew>;
  riskManagement?: Partial<RiskManagementConfigNew>;
  indicators?: Partial<IndicatorsConfigNew>;
  analyzerDefaults?: Record<string, Record<string, unknown>>;
  filters?: Partial<FiltersConfigNew>;
  // ... other overridable sections
}

export interface ConfigMetaNew {
  description: string;
  lastUpdated: string;
  activeStrategy?: string;        // For backward compat: which strategy to run
  multiStrategyEnabled?: boolean; // NEW: Enable multi-strategy mode
  // ... other meta fields
}
```

---

## 🚀 Migration Path

### Phase 1: Update ConfigNew Type System (1-2 hours)
- Add StrategiesCollectionConfigNew interface
- Update ConfigNew root structure
- Create StrategyConfigNew interface
- Add multiStrategyEnabled flag

### Phase 2: Create ConfigResolutionService (1-2 hours)
- Load config.json with new structure
- Implement strategy config merging
- Handle missing fields with defaults
- Cache resolved configs per strategy

### Phase 3: Update Service Layer (2-3 hours)
- BotServices: Accept strategy name parameter
- StrategyOrchestratorService: Use resolved strategy config
- All services: Get config from resolver, not global

### Phase 4: Backward Compatibility (1 hour)
- If config has old single-strategy format, auto-convert
- activeStrategy → which strategy is currently running
- Support both old and new formats

### Phase 5: Update config.json (30 min)
- Convert from single-strategy to multi-strategy format
- Add simple-levels, scalping, trend-following examples
- Set activeStrategy = "simple-levels" for current mode

---

## ✅ Success Criteria

### Type Safety
- ✅ ConfigNew fully typed (no Record<string, unknown> for core fields)
- ✅ Strategy-specific configs properly nested
- ✅ Per-strategy overrides optional but typed

### Functionality
- ✅ Single-strategy config (activeStrategy) still works
- ✅ Multi-strategy mode loads all enabled strategies
- ✅ Config merging: global → strategy-specific → strategy.json
- ✅ Services can load config for any strategy name

### Developer Experience
- ✅ Clear structure in config.json
- ✅ Easy to add new strategies (copy section)
- ✅ Per-strategy parameter visibility
- ✅ No guessing about inheritance

### Build Status
- ✅ 0 TypeScript errors
- ✅ All 3708 tests passing
- ✅ No regressions

---

## 🔄 Current Code Pain Points

### Problem 1: services/bot-services.ts
```typescript
const multiStrategyMode = (config as any).multiStrategy?.enabled || false;
// ↑ This field doesn't exist! We need to add it properly
```

### Problem 2: Entry/Exit Orchestrators
```typescript
// They try to load strategy.json but config structure is ambiguous
const strategyFile = (config as any).meta?.strategyFile;
// ↑ What if we have multiple strategies?
```

### Problem 3: Risk Manager Per Strategy
```typescript
// Risk management is global, should be per-strategy
config.riskManagement.stopLossPercent  // ← Same for all strategies!
```

---

## 🎯 Decision Matrix

| Aspect | Current | New | Why |
|--------|---------|-----|-----|
| Strategy count | 1 | N | Multi-strategy support (Phase 10+) |
| Config location | Root | Nested per strategy | Better organization |
| Overrides | Not possible | Per-strategy | Different strategies need different params |
| Inheritance | N/A | Global → strategy | Reduce duplication |
| Backward compat | N/A | activeStrategy field | Support existing configs |

---

## 📋 Implementation Checklist

### Phase 1: Type System (Today)
- [ ] Create StrategyConfigNew interface
- [ ] Update ConfigNew root with strategies section
- [ ] Add multiStrategyEnabled to meta
- [ ] Create StrategiesCollectionConfigNew
- [ ] Update config-new.types.ts

### Phase 2: Service
- [ ] Create ConfigResolutionService
- [ ] Implement deepMerge utility
- [ ] Implement loadStrategyFile
- [ ] Cache resolved configs per strategy
- [ ] Add 20+ tests

### Phase 3: Integration
- [ ] Update BotServices to use resolver
- [ ] Update StrategyOrchestratorService
- [ ] Pass strategy name to TradingOrchestrator
- [ ] Update entry/exit orchestrators

### Phase 4: Config Migration
- [ ] Update config.json structure
- [ ] Create auto-converter for old format
- [ ] Add example strategies
- [ ] Document structure

### Phase 5: Testing
- [ ] Verify backward compatibility
- [ ] Test strategy loading
- [ ] Test config merging
- [ ] Full integration test

---

## ⏱️ Estimated Time

| Phase | Time | Priority |
|-------|------|----------|
| 1: Type System | 2h | CRITICAL |
| 2: Service | 2h | CRITICAL |
| 3: Integration | 3h | HIGH |
| 4: Migration | 1h | MEDIUM |
| 5: Testing | 1-2h | HIGH |
| **TOTAL** | **9-10h** | **CRITICAL ARCHITECTURE** |

---

## 🚨 Why This Matters

**Current situation:**
- Code: Multi-strategy ready (Phase 10 services exist)
- Config: Single-strategy only
- Result: Configuration bottleneck! Can't actually run multiple strategies with proper config

**This plan:**
- Aligns config with code architecture
- Enables proper multi-strategy operation
- Provides foundation for rest of bot
- Unblocks live trading with multiple strategies

---

## 🎓 Key Architectural Principles

1. **Inheritance over duplication**: Global defaults → strategy overrides
2. **Explicit over implicit**: Clear nesting, no magic field resolution
3. **Type-safe over flexible**: ConfigNew fully typed, no as any
4. **Backward compatible**: Old single-strategy configs still work
5. **Composable**: Config + strategy.json + defaults = final config

---

**Status:** Ready for User Approval

Should we:
1. ✅ Start implementing this plan? (Recommended - CRITICAL foundation)
2. ⏸️ Pause and discuss changes?
3. 🔄 Revise the architecture?

---

**Created:** 2026-01-23
**Severity:** CRITICAL - Architecture mismatch between config and code
