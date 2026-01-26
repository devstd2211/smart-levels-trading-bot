# Phase 6: Pure Functions & Repository Pattern - Architecture Plan

**Status:** Planning ⏳ | **Session:** S30
**Goal:** Extract core business logic to pure functions + implement repository pattern

---

## 🎯 Vision

Transform from **service-oriented** to **domain-driven** architecture:

```
BEFORE (Service-centric):
Service → decides → saves → notifies
(mixed concerns, hard to test independently)

AFTER (Domain-driven with Pure Functions):
Decision Function → Repository → Service
(pure logic, testable, composable)
```

---

## 📋 Phase 6 Breakdown

### Phase 6.0: Pure Functions Extraction (Entry/Exit Logic)

**Goal:** Extract decision logic from orchestrators into pure functions

#### 6.0.1: Entry Decision Functions

**File:** `src/decision-engine/entry-decisions.ts`

```typescript
/**
 * Pure function: Determine if entry signal is valid
 * No side effects, no service calls
 */
export function evaluateEntry(
  signal: AggregatedSignal,
  context: TrendContext,
  openPositions: Position[],
  rules: EntryRules,
): 'ENTER' | 'SKIP' | 'WAIT' {
  // 1. Check confidence threshold
  if (signal.confidence < rules.minConfidence) return 'SKIP';

  // 2. Check if already in position
  if (openPositions.length > 0) return 'SKIP';

  // 3. Check trend alignment
  if (!context.trendBias) return 'WAIT';
  if (signal.direction !== context.trendBias) return 'SKIP';

  // 4. All checks passed
  return 'ENTER';
}

export function calculateEntryPrice(
  signal: AggregatedSignal,
  currentPrice: number,
  tolerance: number,
): number {
  // Entry price = signal entry level or current price within tolerance
  return Math.abs(signal.entryLevel - currentPrice) < tolerance
    ? currentPrice
    : signal.entryLevel;
}
```

**Tests:** `src/__tests__/decision-engine/entry-decisions.test.ts`
- 10 tests for evaluateEntry()
- 5 tests for calculateEntryPrice()
- 3 tests for edge cases (null signals, zero confidence)

#### 6.0.2: Exit Decision Functions

**File:** `src/decision-engine/exit-decisions.ts`

```typescript
export function evaluateExit(
  position: Position,
  currentPrice: number,
  tpPrices: number[],
  slPrice: number,
): ExitAction[] {
  const actions: ExitAction[] = [];

  // 1. Check stop loss
  if (position.side === 'LONG' && currentPrice <= slPrice) {
    actions.push({
      type: 'CLOSE',
      percent: 100,
      reason: 'STOP_LOSS',
      price: currentPrice,
    });
    return actions;
  }

  // 2. Check take profits
  for (let i = 0; i < tpPrices.length; i++) {
    if (position.side === 'LONG' && currentPrice >= tpPrices[i]) {
      actions.push({
        type: 'CLOSE_PERCENT',
        percent: 60, // TP1 = 60% close
        reason: `TP${i + 1}`,
        price: currentPrice,
      });
    }
  }

  return actions;
}
```

**Tests:** `src/__tests__/decision-engine/exit-decisions.test.ts`
- 8 tests for evaluateExit() SL scenarios
- 8 tests for TP hit detection
- 4 tests for trailing stop logic

#### 6.0.3: Risk Decision Functions

**File:** `src/decision-engine/risk-decisions.ts`

```typescript
export function calculatePositionSize(
  accountBalance: number,
  entryPrice: number,
  stopPrice: number,
  riskPercent: number,
  leverage: number,
): number {
  // Risk amount = accountBalance × riskPercent
  const riskAmount = accountBalance * (riskPercent / 100);

  // Distance to stop = abs(entry - stop)
  const distance = Math.abs(entryPrice - stopPrice);

  // Position size = riskAmount / distance
  const baseSize = riskAmount / distance;

  // Adjusted for leverage
  return baseSize * leverage;
}

export function validateRisk(
  portfolio: {
    dailyLoss: number;
    lossStreak: number;
    currentRiskPercentage: number;
  },
  newTradeRisk: number,
  maxDailyLoss: number,
  maxConcurrentRisk: number,
): { approved: boolean; reason?: string } {
  // Daily loss check
  if (portfolio.dailyLoss + newTradeRisk > maxDailyLoss) {
    return { approved: false, reason: 'EXCEEDS_DAILY_LOSS' };
  }

  // Concurrent risk check
  if (portfolio.currentRiskPercentage + newTradeRisk > maxConcurrentRisk) {
    return { approved: false, reason: 'EXCEEDS_CONCURRENT_RISK' };
  }

  return { approved: true };
}
```

**Tests:** `src/__tests__/decision-engine/risk-decisions.test.ts`
- 6 tests for position sizing
- 5 tests for risk validation
- 4 tests for loss streak penalties

#### 6.0.4: Validation Functions

**File:** `src/decision-engine/validation.ts`

```typescript
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePosition(position: Position): ValidationResult {
  const errors: string[] = [];

  if (!position.id) errors.push('Missing position ID');
  if (typeof position.entryPrice !== 'number') errors.push('Invalid entry price');
  if (position.quantity <= 0) errors.push('Invalid quantity');

  return { valid: errors.length === 0, errors };
}

export function validateSignal(signal: Signal): ValidationResult {
  const errors: string[] = [];

  if (signal.confidence < 0 || signal.confidence > 1) {
    errors.push('Invalid confidence (must be 0-1)');
  }

  return { valid: errors.length === 0, errors };
}
```

**Tests:** `src/__tests__/decision-engine/validation.test.ts`
- 5 tests for position validation
- 5 tests for signal validation
- 3 tests for context validation

---

### Phase 6.1: Repository Pattern (Data Access Layer)

**Goal:** Abstract data access for positions, trades, market data

#### 6.1.1: Repository Interfaces

**File:** `src/repositories/IRepository.ts`

```typescript
// Position Repository
export interface IPositionRepository {
  // Get current position
  getCurrent(): Position | null;

  // Save position
  save(position: Position): Promise<void>;

  // Update position
  update(id: string, changes: Partial<Position>): Promise<void>;

  // Close position
  close(id: string, closeData: ClosedPositionData): Promise<void>;

  // Get history
  getHistory(limit: number): Promise<Position[]>;

  // Clear
  clear(): void;
}

// Journal Repository
export interface IJournalRepository {
  // Record trade opening
  recordOpen(trade: TradeRecord): Promise<void>;

  // Record trade closing
  recordClose(id: string, closeData: CloseData): Promise<void>;

  // Get all trades
  getAll(): Promise<TradeRecord[]>;

  // Get session trades
  getSessionTrades(): Promise<TradeRecord[]>;

  // Calculate PnL
  calculateSessionPnL(): Promise<number>;
}

// Market Data Repository
export interface IMarketDataRepository {
  // Get candles
  getCandles(symbol: string, tf: string, limit: number): Promise<Candle[]>;

  // Get latest candle
  getLatestCandle(symbol: string, tf: string): Promise<Candle | null>;

  // Cache indicator result
  cacheIndicator(key: string, value: any, ttlMs: number): void;

  // Get cached indicator
  getCachedIndicator(key: string): any | null;

  // Clear old indicators
  clearExpiredCache(): void;
}
```

#### 6.1.2: In-Memory Implementation

**File:** `src/repositories/position.memory-repository.ts`

```typescript
export class PositionMemoryRepository implements IPositionRepository {
  private current: Position | null = null;
  private history: Position[] = [];
  private maxHistory = 100;

  getCurrent(): Position | null {
    return this.current;
  }

  async save(position: Position): Promise<void> {
    this.current = position;
  }

  async update(id: string, changes: Partial<Position>): Promise<void> {
    if (this.current?.id === id) {
      this.current = { ...this.current, ...changes };
    }
  }

  async close(id: string, closeData: ClosedPositionData): Promise<void> {
    if (this.current?.id === id) {
      this.history.push({ ...this.current, ...closeData, closedAt: Date.now() });
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
      this.current = null;
    }
  }

  async getHistory(limit: number): Promise<Position[]> {
    return this.history.slice(-limit);
  }

  clear(): void {
    this.current = null;
    this.history = [];
  }
}
```

**Tests:** `src/__tests__/repositories/position.memory-repository.test.ts`
- 5 tests for save/retrieve
- 3 tests for update
- 3 tests for close
- 2 tests for history management

---

### Phase 6.2: Service Refactoring (Using Pure Functions)

**Goal:** Refactor services to use pure functions + repositories

#### Before (Service-centric):
```typescript
class EntryOrchestrator {
  async decideEntry(signal) {
    // Mixed: logic + logging + service calls
    const decision = this.evaluateEntry(signal); // Logic
    this.logger.debug(...); // Side effect
    await this.riskManager.approve(signal); // Service call
    // Hard to test, coupled to services
  }
}
```

#### After (Pure Function + Service):
```typescript
class EntryOrchestrator {
  async decideEntry(signal) {
    // 1. Pure function: logic only
    const decision = evaluateEntry(
      signal, context, positions, rules
    );

    // 2. Service: logging + side effects
    this.logger.debug('Entry decision:', decision);

    // 3. Repository: persistence
    if (decision === 'ENTER') {
      await this.positionRepo.save(...);
    }
  }
}
```

**Services to Refactor (Phase 6.3):**
1. EntryOrchestrator → use evaluateEntry()
2. ExitOrchestrator → use evaluateExit()
3. RiskManager → use calculatePositionSize(), validateRisk()
4. PositionLifecycleService → use IPositionRepository
5. TradingJournalService → use IJournalRepository

---

## 📊 Testing Strategy

### Unit Tests (Pure Functions)
- **Entry Decisions:** 15 tests
- **Exit Decisions:** 18 tests
- **Risk Decisions:** 15 tests
- **Validation:** 13 tests
- **Total:** ~60 unit tests

### Repository Tests
- **Position Repo:** 10 tests
- **Journal Repo:** 10 tests
- **Market Data Repo:** 8 tests
- **Total:** ~30 tests

### Integration Tests (Services using Pure Functions)
- Entry workflow: 5 tests
- Exit workflow: 5 tests
- Risk management: 5 tests
- **Total:** ~15 tests

**Total Phase 6:** ~105 new tests

---

## 🎯 Acceptance Criteria

- ✅ 60+ unit tests for pure functions (all passing)
- ✅ 30+ repository tests (all passing)
- ✅ 15+ integration tests (all passing)
- ✅ npm run build: 0 TypeScript errors
- ✅ No regressions: 4021+ existing tests still passing
- ✅ Code coverage: 95%+ on decision-engine/
- ✅ Documentation: JSDoc on all functions

---

## 📅 Implementation Plan

### Session 30 (This Session):
- [ ] 6.0.0: Create decision-engine/ directory structure
- [ ] 6.0.1: Implement entry-decisions.ts (+ 15 tests)
- [ ] 6.0.2: Implement exit-decisions.ts (+ 18 tests)
- [ ] 6.0.3: Implement risk-decisions.ts (+ 15 tests)
- [ ] 6.0.4: Implement validation.ts (+ 13 tests)

### Session 31:
- [ ] 6.1: Repository interfaces + implementations
- [ ] Repository tests (30 tests)
- [ ] 6.2: Service refactoring with DI
- [ ] Integration tests (15 tests)

### Session 32:
- [ ] Final verification: all 105 tests passing
- [ ] Documentation: Architecture guide for Phase 6
- [ ] Performance benchmark: Pure functions vs service methods

---

## 📁 File Structure After Phase 6

```
src/
├── decision-engine/
│   ├── entry-decisions.ts
│   ├── exit-decisions.ts
│   ├── risk-decisions.ts
│   ├── validation.ts
│   └── index.ts (exports)
│
├── repositories/
│   ├── IRepository.ts
│   ├── position.memory-repository.ts
│   ├── journal.file-repository.ts
│   ├── market-data.cache-repository.ts
│   └── index.ts (exports)
│
├── __tests__/
│   ├── decision-engine/
│   │   ├── entry-decisions.test.ts
│   │   ├── exit-decisions.test.ts
│   │   ├── risk-decisions.test.ts
│   │   └── validation.test.ts
│   │
│   └── repositories/
│       ├── position.memory-repository.test.ts
│       ├── journal.file-repository.test.ts
│       └── market-data.cache-repository.test.ts
```

---

## 🚀 Benefits After Phase 6

1. **Testability:** Pure functions are 10x easier to test
2. **Reusability:** Same logic works in backtest, live, analysis
3. **Maintainability:** Clear separation of concerns
4. **Performance:** No object allocations in tight loops
5. **Composability:** Functions can be combined in new ways

---

**Document Version:** 1.0
**Created:** 2026-01-26
**Status:** Planning ⏳
