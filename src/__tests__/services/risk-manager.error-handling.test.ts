/**
 * Phase 8.9.1: RiskManager ErrorHandler Integration Tests
 *
 * Tests ErrorHandler integration with RiskManager for:
 * - Validation error handling (THROW strategy)
 * - Account balance error handling (GRACEFUL_DEGRADE)
 * - Calculation error handling (GRACEFUL_DEGRADE)
 * - Trade recording error recovery
 */

import { RiskManager } from '../../services/risk-manager.service';
import { ErrorHandler } from '../../errors/ErrorHandler';
import {
  RiskValidationError,
  RiskCalculationError,
  InsufficientAccountBalanceError,
} from '../../errors/DomainErrors';
import {
  Signal,
  Position,
  TradeRecord,
  RiskManagerConfig,
  SignalDirection,
  SignalType,
  LogLevel,
  PositionSide,
  TakeProfit,
} from '../../types';
import { LoggerService } from '../../services/logger.service';

/**
 * Mock Logger for testing
 */
class MockLogger extends LoggerService {
  constructor() {
    super(LogLevel.INFO, './logs', false);
  }
}

/**
 * Helper to create a valid signal
 */
function createSignal(overrides?: Partial<Signal>): Signal {
  return {
    price: 100,
    confidence: 75,
    type: SignalType.LEVEL_BASED,
    direction: SignalDirection.LONG,
    stopLoss: 90,
    takeProfits: [{ level: 1, percent: 50 }] as TakeProfit[],
    reason: 'test signal',
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Helper to create default RiskManagerConfig
 */
function createConfig(): RiskManagerConfig {
  return {
    dailyLimits: {
      maxDailyLossPercent: 5.0,
      maxDailyProfitPercent: 10.0,
      emergencyStopOnLimit: true,
    },
    lossStreak: {
      reductions: {
        after2Losses: 0.75,
        after3Losses: 0.5,
        after4Losses: 0.25,
      },
    },
    concurrentRisk: {
      enabled: true,
      maxPositions: 3,
      maxRiskPerPosition: 2.0,
      maxTotalExposurePercent: 100.0, // Allow full exposure for tests
    },
    positionSizing: {
      riskPerTradePercent: 1.0,
      minPositionSizeUsdt: 5.0,
      maxPositionSizeUsdt: 1000.0, // Increased for tests
      maxLeverageMultiplier: 2.0,
    },
  };
}

/**
 * Helper to create a valid position
 */
function createPosition(overrides?: Partial<Position>): Position {
  return {
    id: 'pos-123',
    symbol: 'BTCUSDT',
    side: PositionSide.LONG,
    quantity: 1,
    entryPrice: 50000,
    leverage: 1,
    marginUsed: 50000,
    stopLoss: { price: 45000, percent: 10 } as any,
    takeProfits: [{ level: 1, price: 55000, percent: 10 }] as TakeProfit[],
    openedAt: Date.now(),
    unrealizedPnL: 0,
    unrealizedPnLPercent: 0,
    status: 'OPEN' as const,
    ...overrides,
  } as Position;
}

/**
 * Helper to create a valid trade record
 */
function createTrade(overrides?: Partial<TradeRecord>): TradeRecord {
  const quantity = overrides?.quantity !== undefined ? overrides.quantity : 1;
  const entryPrice = overrides?.entryPrice !== undefined ? overrides.entryPrice : 100;
  const realizedPnL = overrides?.realizedPnL !== undefined ? overrides.realizedPnL : 50;
  const exitPrice = overrides?.exitPrice || (entryPrice + realizedPnL / quantity);

  return {
    id: `trade-${Date.now()}`,
    symbol: overrides?.symbol || 'BTCUSDT',
    side: overrides?.side || PositionSide.LONG,
    quantity,
    entryPrice,
    exitPrice,
    leverage: overrides?.leverage || 1,
    entryCondition: (overrides?.entryCondition || { signal: {}, indicators: {} }) as any,
    openedAt: overrides?.openedAt || Date.now(),
    closedAt: overrides?.closedAt || Date.now(),
    realizedPnL,
    status: overrides?.status || 'CLOSED',
  } as TradeRecord;
}

describe('Phase 8.9.1: RiskManager ErrorHandler Integration', () => {
  let riskManager: RiskManager;
  let mockLogger: MockLogger;
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    mockLogger = new MockLogger();
    errorHandler = new ErrorHandler(mockLogger);
    const config = createConfig();
    riskManager = new RiskManager(config, mockLogger, errorHandler);
    riskManager.setAccountBalance(1000);
  });

  // ========================================================================
  // A. VALIDATION ERRORS
  // ========================================================================

  describe('A. Validation Errors - THROW Strategy', () => {
    it('should throw RiskValidationError on negative signal price', async () => {
      const signal = createSignal({ price: -100 });
      await expect(riskManager.canTrade(signal, 1000, [])).rejects.toThrow(
        RiskValidationError
      );
    });

    it('should throw RiskValidationError on zero signal price', async () => {
      const signal = createSignal({ price: 0 });
      await expect(riskManager.canTrade(signal, 1000, [])).rejects.toThrow(
        RiskValidationError
      );
    });

    it('should throw RiskValidationError on invalid confidence (>100)', async () => {
      const signal = createSignal({ confidence: 150 });
      await expect(riskManager.canTrade(signal, 1000, [])).rejects.toThrow(
        RiskValidationError
      );
    });

    it('should throw RiskValidationError on invalid confidence (negative)', async () => {
      const signal = createSignal({ confidence: -10 });
      await expect(riskManager.canTrade(signal, 1000, [])).rejects.toThrow(
        RiskValidationError
      );
    });
  });

  // ========================================================================
  // B. ACCOUNT BALANCE ERRORS
  // ========================================================================

  describe('B. Account Balance Errors - GRACEFUL_DEGRADE Strategy', () => {
    it('should degrade gracefully on zero account balance', async () => {
      const rm = new RiskManager(createConfig(), mockLogger, errorHandler);
      rm.setAccountBalance(1000);
      const signal = createSignal();
      const result = await rm.canTrade(signal, 0, []);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('balance validation failed');
    });

    it('should degrade gracefully on negative account balance', async () => {
      const rm = new RiskManager(createConfig(), mockLogger, errorHandler);
      rm.setAccountBalance(1000);
      const signal = createSignal();
      const result = await rm.canTrade(signal, -500, []);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('balance validation failed');
    });

    it('should allow trade with valid account balance', async () => {
      const rm = new RiskManager(createConfig(), mockLogger, errorHandler);
      rm.setAccountBalance(1000);
      const signal = createSignal();
      const result = await rm.canTrade(signal, 1000, []);
      expect(result.allowed).toBe(true);
      expect(result.adjustedPositionSize).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // C. CALCULATION ERRORS
  // ========================================================================

  describe('C. Calculation Errors - GRACEFUL_DEGRADE Strategy', () => {
    it('should handle NaN in trade value calculation', () => {
      const trade = createTrade({ entryPrice: NaN });
      expect(() => riskManager.recordTradeResult(trade)).not.toThrow();
    });

    it('should handle Infinity in calculations', () => {
      const trade = createTrade({ entryPrice: 0 });
      expect(() => riskManager.recordTradeResult(trade)).not.toThrow();
    });

    it('should handle exposure calculation with invalid positions', async () => {
      const signal = createSignal();
      const badPosition = createPosition({ entryPrice: NaN });
      const result = await riskManager.canTrade(signal, 1000, [badPosition]);
      expect(result).toBeDefined();
    });
  });

  // ========================================================================
  // D. TRADE RECORDING
  // ========================================================================

  describe('D. Trade Recording - Error Recovery', () => {
    it('should record valid trade successfully', () => {
      const trade = createTrade({ realizedPnL: 50 });
      riskManager.recordTradeResult(trade);
      const status = riskManager.getRiskStatus();
      expect(status.dailyPnL).toBeCloseTo(50, 1);
      expect(status.consecutiveLosses).toBe(0);
    });

    it('should skip null trade without crashing', () => {
      const nullTrade = null as unknown as TradeRecord;
      expect(() => riskManager.recordTradeResult(nullTrade)).not.toThrow();
    });

    it('should track consecutive losses correctly', () => {
      const lossTrade = createTrade({ realizedPnL: -50 });
      riskManager.recordTradeResult(lossTrade);
      expect(riskManager.getRiskStatus().consecutiveLosses).toBe(1);
    });

    it('should reset loss streak on winning trade', () => {
      // Record loss
      const lossTrade = createTrade({ realizedPnL: -50 });
      riskManager.recordTradeResult(lossTrade);
      expect(riskManager.getRiskStatus().consecutiveLosses).toBe(1);

      // Record win
      const winTrade = createTrade({ id: 'trade-win', realizedPnL: 75 });
      riskManager.recordTradeResult(winTrade);
      expect(riskManager.getRiskStatus().consecutiveLosses).toBe(0);
      expect(riskManager.getRiskStatus().dailyPnL).toBeCloseTo(25, 1);
    });

    it('should recover from calculation failure without blocking', () => {
      const badTrade = createTrade({ entryPrice: 0, realizedPnL: 50 });
      expect(() => riskManager.recordTradeResult(badTrade)).not.toThrow();

      const goodTrade = createTrade({ id: 'trade-good' });
      expect(() => riskManager.recordTradeResult(goodTrade)).not.toThrow();

      const status = riskManager.getRiskStatus();
      expect(status.dailyPnL).toBeCloseTo(100, 1);
    });
  });

  // ========================================================================
  // E. EXPOSURE CALCULATION
  // ========================================================================

  describe('E. Exposure Calculation - GRACEFUL_DEGRADE', () => {
    it('should calculate exposure with valid positions', async () => {
      const signal = createSignal();
      const position = createPosition();
      const result = await riskManager.canTrade(signal, 1000, [position]);
      expect(result).toBeDefined();
    });

    it('should degrade on invalid position price', async () => {
      const signal = createSignal();
      const badPosition = createPosition({ entryPrice: NaN });
      const result = await riskManager.canTrade(signal, 1000, [badPosition]);
      expect(result).toBeDefined();
    });

    it('should return zero exposure on critical failure', async () => {
      const signal = createSignal();
      const extremePosition = createPosition({
        quantity: Number.MAX_VALUE,
        entryPrice: Number.MAX_VALUE,
      });
      const result = await riskManager.canTrade(signal, 1000, [extremePosition]);
      expect(result).toBeDefined();
    });
  });

  // ========================================================================
  // F. INTEGRATION TESTS
  // ========================================================================

  describe('F. Integration Tests', () => {
    it('should handle complete trade workflow', async () => {
      const rm = new RiskManager(createConfig(), mockLogger, errorHandler);
      rm.setAccountBalance(1000);

      const signal = createSignal();
      const decision = await rm.canTrade(signal, 1000, []);
      expect(decision.allowed).toBe(true);
      expect(decision.adjustedPositionSize).toBeGreaterThan(0);

      const trade = createTrade({ quantity: decision.adjustedPositionSize || 1 });
      rm.recordTradeResult(trade);

      const status = rm.getRiskStatus();
      expect(status.dailyPnL).toBeCloseTo(50, 1);
    });

    it('should recover from error and continue trading', async () => {
      const rm = new RiskManager(createConfig(), mockLogger, errorHandler);
      rm.setAccountBalance(1000);

      const goodSignal = createSignal();
      const badSignal = createSignal({ price: -100 });

      const result1 = await rm.canTrade(goodSignal, 1000, []);
      expect(result1.allowed).toBe(true);

      await expect(rm.canTrade(badSignal, 1000, [])).rejects.toThrow();

      const result3 = await rm.canTrade(goodSignal, 1000, []);
      expect(result3.allowed).toBe(true);
    });

    it('should maintain state during cascading failures', async () => {
      const rm = new RiskManager(createConfig(), mockLogger, errorHandler);
      rm.setAccountBalance(1000);

      // Trade 1: Loss
      const lossTrade = createTrade({ realizedPnL: -50 });
      rm.recordTradeResult(lossTrade);

      // Trade 2: Has NaN calculation due to entryPrice=0 calculation
      // This would be a bad trade that returns NaN in calculations
      const badTrade = createTrade({
        id: 'trade-bad',
        entryPrice: 0,
        realizedPnL: 50,
      });
      rm.recordTradeResult(badTrade);

      // State should show: lossTrade recorded + badTrade recorded (both process through GRACEFUL_DEGRADE)
      // badTrade with entryPrice=0 should degrade gracefully but still record the PnL
      const status = rm.getRiskStatus();
      expect(status.dailyPnL).toBeCloseTo(0, 1); // -50 + 50 = 0
      expect(status.consecutiveLosses).toBe(0); // Loss then Win resets streak
    });

    it('should enforce daily loss limit', async () => {
      const rm = new RiskManager(createConfig(), mockLogger, errorHandler);
      rm.setAccountBalance(1000);

      const signal = createSignal();

      // Record 6% loss (exceeds 5% limit)
      const lossTrade = createTrade({ realizedPnL: -60 });
      rm.recordTradeResult(lossTrade);

      // Next trade should be blocked
      const result = await rm.canTrade(signal, 1000, []);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily loss limit');
    });

    it('should apply loss streak multipliers', async () => {
      const rm = new RiskManager(createConfig(), mockLogger, errorHandler);
      rm.setAccountBalance(1000);

      const signal = createSignal();

      // First trade - get normal size
      let decision1 = await rm.canTrade(signal, 1000, []);
      expect(decision1.allowed).toBe(true);
      const normalSize = decision1.adjustedPositionSize;
      expect(normalSize).toBeGreaterThan(0);

      // Record small loss (2% = -20 to stay under 5% daily limit)
      const lossTrade1 = createTrade({ quantity: normalSize || 1, realizedPnL: -20 });
      rm.recordTradeResult(lossTrade1);

      // Second trade after 1 loss - still normal size (no reduction after 1 loss)
      let decision2 = await rm.canTrade(signal, 1000, []);
      expect(decision2.allowed).toBe(true);
      expect(decision2.adjustedPositionSize).toBeCloseTo(normalSize || 0, 0.1);

      // Record another small loss
      const lossTrade2 = createTrade({
        id: 'trade-loss2',
        quantity: decision2.adjustedPositionSize || 1,
        realizedPnL: -10, // Keep total well below 5% limit (2% + 1% = 3%)
      });
      rm.recordTradeResult(lossTrade2);

      // Third trade after 2 losses - should be 75% of normal
      let decision3 = await rm.canTrade(signal, 1000, []);
      expect(decision3.allowed).toBe(true);
      expect(decision3.adjustedPositionSize).toBeLessThan(normalSize || 0);
      expect(decision3.adjustedPositionSize).toBeCloseTo((normalSize || 0) * 0.75, 1);
    });
  });

  // ========================================================================
  // G. BACKWARD COMPATIBILITY
  // ========================================================================

  describe('G. Backward Compatibility', () => {
    it('should work with direct instantiation', () => {
      const config = createConfig();
      const rm = new RiskManager(config, mockLogger, errorHandler);
      rm.setAccountBalance(1000);
      const status = rm.getRiskStatus();
      expect(status).toBeDefined();
      expect(status.dailyPnL).toBe(0);
    });

    it('should maintain existing behavior without errors', async () => {
      // Create a fresh RiskManager for this test (avoid cascading failures from previous tests)
      const freshLogger = new MockLogger();
      const freshErrorHandler = new ErrorHandler(freshLogger);
      const freshConfig = createConfig();
      const freshRiskManager = new RiskManager(freshConfig, freshLogger, freshErrorHandler);
      freshRiskManager.setAccountBalance(1000);

      const signal = createSignal();
      const result = await freshRiskManager.canTrade(signal, 1000, []);
      expect(result.allowed).toBe(true);
      expect(result.adjustedPositionSize).toBeGreaterThan(0);
    });
  });
});
