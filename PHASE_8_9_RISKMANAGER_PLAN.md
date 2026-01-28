# 🎯 Phase 8.9 Stage 1: RiskManager ErrorHandler Integration

**Status:** ACTIVE (Session 41 - Starting)
**Objective:** Integrate ErrorHandler into RiskManager with production-grade error recovery
**Build Impact:** +30-35 tests | Zero regressions
**Session:** 41

---

## 📋 Analysis

### Current Error Handling
- **Lines 147-158, 301-312:** Throws on missing signal.price/confidence (no recovery)
- **Lines 400-432:** recordTradeResult() has no async error handling
- **Lines 370-394:** calculateTotalExposure() has division by zero guard but no structured recovery
- **No ErrorHandler integration:** All services that use RiskManager will fail if it throws

### Identified Issues (HIGH RISK)
1. **AccountBalance Validation** - accountBalanceForPnLCalc could be invalid mid-trade
2. **Concurrent Updates** - recordTradeResult() not protected from concurrent calls
3. **Calculation Failures** - Division by zero, NaN propagation from complex math
4. **Data Validation** - Signal price/confidence validation throws, no graceful failure

---

## 🎬 Implementation Plan

### STAGE 1: Error Class Definition
**File:** `src/errors/DomainErrors.ts` (add 3 new errors)

```typescript
export class RiskValidationError extends TradingError { }
export class RiskCalculationError extends TradingError { }
export class InsufficientAccountBalanceError extends TradingError { }
```

**Tests:** 0 (error class tests generic)

---

### STAGE 2: RiskManager Refactoring
**File:** `src/services/risk-manager.service.ts`

#### Change 1: Constructor - Add ErrorHandler Injection
```typescript
constructor(
  config: RiskManagerConfig,
  private logger: LoggerService,
  private errorHandler: ErrorHandler  // NEW
) {
  // ... existing code
}
```

#### Change 2: canTrade() - THROW + GRACEFUL_DEGRADE
**Strategy:** THROW on critical validation, GRACEFUL_DEGRADE on account balance issues

```typescript
async canTrade(
  signal: Signal,
  accountBalance: number,
  openPositions: Position[]
): Promise<RiskDecision> {
  try {
    // THROW strategy for critical validation
    if (!signal.price || signal.price <= 0) {
      throw new RiskValidationError(
        `Signal.price must be positive: ${signal.price}`
      );
    }

    if (signal.confidence === undefined || signal.confidence < 0 || signal.confidence > 100) {
      throw new RiskValidationError(
        `Signal.confidence must be 0-100: ${signal.confidence}`
      );
    }

    // GRACEFUL_DEGRADE on account balance issues
    if (!accountBalance || accountBalance <= 0) {
      const result = await this.errorHandler.handle(
        new InsufficientAccountBalanceError(`Invalid balance: ${accountBalance}`),
        {
          strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
          context: 'RiskManager.canTrade[accountBalance]',
        }
      );

      if (!result.success) {
        // Use fallback: deny trade if balance invalid
        return {
          allowed: false,
          reason: 'Account balance validation failed - trade denied for safety',
          riskDetails: this.buildRiskDetails(openPositions),
        };
      }
    }

    // ... rest of existing logic
  } catch (error) {
    // Critical validation failure - throw
    if (error instanceof RiskValidationError) {
      const result = await this.errorHandler.handle(error, {
        strategy: RecoveryStrategy.THROW,
        context: 'RiskManager.canTrade[validation]',
      });
      if (!result.success) throw result.error;
    }
    throw error;
  }
}
```

#### Change 3: recordTradeResult() - RETRY + GRACEFUL_DEGRADE
**Strategy:** RETRY on concurrent access, GRACEFUL_DEGRADE on calculation failures

```typescript
recordTradeResult(trade: TradeRecord): void {
  try {
    if (!trade) {
      this.logger.warn('[RiskManager] Trade record is required');
      return;
    }

    const pnl = trade.realizedPnL || 0;
    const tradeValue = (trade.quantity * trade.entryPrice) || 1;

    // GRACEFUL_DEGRADE on calculation errors
    let pnlPercent: number;
    try {
      pnlPercent = (pnl / tradeValue) * 100;
      if (!isFinite(pnlPercent)) {
        throw new RiskCalculationError(`Invalid PnL calculation: ${pnlPercent}`);
      }
    } catch (error) {
      const result = this.errorHandler.wrapSync(
        () => this.handleCalculationFailure(),
        {
          strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
          context: 'RiskManager.recordTradeResult[pnlCalc]',
        }
      );
      // Use fallback values
      pnlPercent = 0;
      this.logger.warn('[RiskManager] PnL calculation degraded, using zero', { pnl, tradeValue });
    }

    // Update daily PnL with safe calculation
    this.dailyPnL += pnl;
    const baseBalance = this.accountBalanceForPnLCalc || tradeValue;
    this.dailyPnLPercent = isFinite((this.dailyPnL / baseBalance) * 100)
      ? (this.dailyPnL / baseBalance) * 100
      : 0;

    // Update loss streak safely
    if (pnl < 0) {
      this.consecutiveLosses++;
    } else {
      this.consecutiveLosses = 0;
    }

    this.logger.debug('📊 RiskManager trade result recorded', {
      pnl: pnl.toFixed(2),
      pnlPercent: pnlPercent.toFixed(2) + '%',
      consecutiveLosses: this.consecutiveLosses,
      dailyPnL: this.dailyPnL.toFixed(2),
      dailyPnLPercent: this.dailyPnLPercent.toFixed(2) + '%',
    });
  } catch (error) {
    // Log error but don't throw - recordTradeResult should never crash trading
    const result = this.errorHandler.wrapSync(
      () => { throw error; },
      {
        strategy: RecoveryStrategy.SKIP,
        context: 'RiskManager.recordTradeResult[critical]',
      }
    );
    this.logger.error('[RiskManager] Critical error recording trade', { error });
  }
}
```

#### Change 4: calculateTotalExposure() - GRACEFUL_DEGRADE
**Strategy:** Return safe zero value on calculation failure

```typescript
private calculateTotalExposure(openPositions: Position[], newSignal: Signal): number {
  try {
    let totalExposure = 0;

    for (const pos of openPositions) {
      const posExposure = Math.abs(pos.quantity * pos.entryPrice);
      if (!isFinite(posExposure)) {
        throw new RiskCalculationError(`Invalid position exposure: ${posExposure}`);
      }
      totalExposure += posExposure;
    }

    if (newSignal && newSignal.price && newSignal.price > 0 && newSignal.confidence >= 0 && this.accountBalanceForPnLCalc > 0) {
      try {
        const riskAmount = this.accountBalanceForPnLCalc * (this.positionSizingConfig.riskPerTradePercent / 100);
        const slDistancePercent = Math.max(
          RISK_MANAGER_MIN_SL_DISTANCE_PERCENT,
          MULTIPLIER_VALUES.TWO - newSignal.confidence / 100
        );
        const slDistance = (newSignal.price * slDistancePercent) / 100;
        const estimatedSize = riskAmount / Math.max(slDistance, 0.01);

        if (!isFinite(estimatedSize)) {
          throw new RiskCalculationError(`Invalid estimated size: ${estimatedSize}`);
        }

        const maxSizeByLeverage = (this.accountBalanceForPnLCalc * this.positionSizingConfig.maxLeverageMultiplier) / newSignal.price;
        const constrainedSize = Math.min(estimatedSize, maxSizeByLeverage);
        const newExposure = constrainedSize * newSignal.price;

        if (!isFinite(newExposure)) {
          throw new RiskCalculationError(`Invalid new exposure: ${newExposure}`);
        }

        totalExposure += newExposure;
      } catch (error) {
        // Graceful degrade: assume no new exposure
        const degradeResult = this.errorHandler.wrapSync(
          () => { throw error; },
          {
            strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
            context: 'RiskManager.calculateTotalExposure[newSignal]',
          }
        );
        this.logger.warn('[RiskManager] New signal exposure calculation failed, using zero', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return totalExposure;
  } catch (error) {
    // Final fallback - return zero exposure
    const result = this.errorHandler.wrapSync(
      () => { throw error; },
      {
        strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
        context: 'RiskManager.calculateTotalExposure[critical]',
      }
    );
    return 0;
  }
}
```

#### Change 5: BotServices DI - Inject ErrorHandler
**File:** `src/services/bot-services.ts`

```typescript
// In createServices() or appropriate factory method
const errorHandler = new ErrorHandler(logger);

const riskManager = new RiskManager(
  botConfig.riskManager,
  logger,
  errorHandler  // NEW
);
```

---

### STAGE 3: Unit Tests
**File:** `src/__tests__/services/risk-manager.error-handling.test.ts`
**Target:** 35+ tests covering all error scenarios

#### Test Categories

**A. Validation Errors (4 tests)**
- ✅ Throws RiskValidationError on negative signal.price
- ✅ Throws RiskValidationError on out-of-range confidence
- ✅ Degrades gracefully on invalid account balance
- ✅ Throws on missing signal required fields

**B. Account Balance Errors (3 tests)**
- ✅ GRACEFUL_DEGRADE on zero account balance
- ✅ GRACEFUL_DEGRADE on negative account balance
- ✅ Denies trade when balance degradation occurs

**C. Calculation Errors (4 tests)**
- ✅ Handles NaN in PnL calculation
- ✅ Handles Infinity in position size calculation
- ✅ Handles division by zero in exposure calculation
- ✅ Recovers from malformed trade records

**D. Trade Recording (6 tests)**
- ✅ Records valid trade successfully
- ✅ Skips invalid trade without crashing
- ✅ Handles concurrent recordTradeResult calls (state consistency)
- ✅ Recovers from PnL calculation failure
- ✅ Updates consecutive losses correctly on errors
- ✅ Degrades gracefully on critical failure

**E. Exposure Calculation (5 tests)**
- ✅ Calculates correct total exposure
- ✅ Degrades gracefully on position calculation failure
- ✅ Handles invalid position prices (NaN/Infinity)
- ✅ Returns zero exposure on critical failure
- ✅ Safely estimates new signal exposure

**F. Integration Tests (8 tests)**
- ✅ canTrade() + recordTradeResult() workflow
- ✅ Error recovery with consecutive calls
- ✅ Daily reset with invalid account balance
- ✅ Loss streak tracking after errors
- ✅ Exposure limits with calculation failures
- ✅ Cascading failures (validation → recording → recovery)
- ✅ Mixed success/failure scenarios
- ✅ ErrorHandler callback execution

**G. Backward Compatibility (3 tests)**
- ✅ Works without ErrorHandler injection (manual instantiation)
- ✅ Existing behavior unchanged when no errors occur
- ✅ Old tests still pass (regression prevention)

**H. Edge Cases (2 tests)**
- ✅ Handle empty position list
- ✅ Handle very large numbers (leverage limits)

---

## 📊 Expected Outcomes

### Code Changes
| File | Changes | LOC Impact | Complexity |
|------|---------|-----------|-----------|
| DomainErrors.ts | +3 error classes | +30 LOC | Low |
| risk-manager.service.ts | 5 methods updated | +150 LOC | Medium |
| bot-services.ts | ErrorHandler injection | +3 LOC | Low |
| error-handling.test.ts (NEW) | 35+ tests | +1200 LOC | Medium |
| **TOTAL** | **4 files** | **~1380 LOC** | **Medium** |

### Test Results
- ✅ 35+ new unit tests
- ✅ 0 regressions in existing tests
- ✅ 4377 → 4412 tests passing (+35)
- ✅ 100% error path coverage

### Performance Impact
- ⚡ Minimal - error paths only execute on failures
- ⚡ No overhead for happy path
- ⚡ Exponential backoff only on retries

---

## ✅ Success Criteria

1. ✅ All 35+ error-handling tests pass
2. ✅ All existing RiskManager tests pass (0 regressions)
3. ✅ RiskManager properly injects ErrorHandler via constructor
4. ✅ Critical validation failures still throw (THROW strategy)
5. ✅ Non-critical failures degrade gracefully (GRACEFUL_DEGRADE)
6. ✅ Trade recording never blocks execution (SKIP/GRACEFUL_DEGRADE)
7. ✅ Calculation errors return safe defaults (zero/previous value)
8. ✅ Backward compatibility verified (works without ErrorHandler)
9. ✅ npm run build: 0 TypeScript errors
10. ✅ ARCHITECTURE_QUICK_START.md updated with Phase 8.9.1 completion

---

## 🚀 Next Phases

**Phase 8.9.2:** TradingJournalService ErrorHandler Integration
**Phase 8.9.3:** PositionMonitorService ErrorHandler Integration
**Phase 8.9.4:** Position Handlers ErrorHandler Integration

---

**Last Updated:** 2026-01-28 (Session 41 - Starting)
**Estimated Duration:** 2-3 hours
**Risk Level:** MEDIUM (touches critical risk logic)
