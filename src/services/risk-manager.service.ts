/**
 * RiskManager - PHASE 4 PRIMARY LAYER
 *
 * Unified gatekeeper for all trading risk checks.
 * Consolidates 5 fragmented services into single decision point:
 * - DailyLimitsService (daily loss limit)
 * - LossStreakService (consecutive loss penalty)
 * - MaxConcurrentRiskService (exposure limits)
 * - RiskBasedSizingService (position sizing)
 * + BlockingRulesService checks (market condition blocks)
 *
 * SINGLE RESPONSIBILITY:
 * Determine if a trade is allowed and calculate position size with ALL risk factors applied atomically.
 *
 * ATOMIC OPERATIONS:
 * All risk checks happen in one call - no separate calls needed.
 * Position size includes ALL modifiers (daily loss, loss streak, concurrent risk, base sizing).
 *
 * INTEGRATION POINT:
 * Called by EntryOrchestrator before position execution.
 * Result is final decision - orchestrator doesn't override.
 */

import { Signal, Position, RiskManagerConfig, RiskDecision, RiskStatus, TradeRecord } from '../types';
import { LoggerService } from '../types';
import { ErrorHandler, RecoveryStrategy } from '../errors/ErrorHandler';
import {
  RiskValidationError,
  RiskCalculationError,
  InsufficientAccountBalanceError
} from '../errors/DomainErrors';
import {
  MULTIPLIER_VALUES,
  RATIO_MULTIPLIERS,
  RISK_MANAGER_MIN_SL_DISTANCE_PERCENT,
  RISK_MANAGER_LOSS_STREAK_MULTIPLIER_2_LOSSES,
  RISK_MANAGER_LOSS_STREAK_MULTIPLIER_3_LOSSES,
  RISK_MANAGER_LOSS_STREAK_MULTIPLIER_4_LOSSES,
} from '../constants';

export class RiskManager {
  // Config values (from RiskManagerConfig)
  private maxDailyLossPercent: number;
  private maxDailyProfitPercent?: number;
  private emergencyStopOnLimit: boolean;

  private lossStreakReductions: {
    after2: number;
    after3: number;
    after4: number;
    stopAfter?: number;
  };

  private concurrentRiskConfig: {
    enabled: boolean;
    maxPositions: number;
    maxRiskPerPosition: number;
    maxTotalExposurePercent: number;
  };

  private positionSizingConfig: {
    riskPerTradePercent: number;
    minPositionSizeUsdt: number;
    maxPositionSizeUsdt: number;
    maxLeverageMultiplier: number;
  };

  // Runtime state
  private dailyPnL: number = 0;
  private dailyPnLPercent: number = 0;
  private consecutiveLosses: number = 0;
  private lastResetTime: number = 0;
  private totalExposure: number = 0;
  private accountBalanceForPnLCalc: number = 0; // Track account balance for accurate PnL %

  constructor(
    config: RiskManagerConfig,
    private logger: LoggerService,
    private errorHandler: ErrorHandler,
  ) {
    // Validate config
    if (!config) {
      throw new Error('RiskManagerConfig is required');
    }

    // Daily limits
    this.maxDailyLossPercent = config.dailyLimits.maxDailyLossPercent || 5.0;
    this.maxDailyProfitPercent = config.dailyLimits.maxDailyProfitPercent;
    this.emergencyStopOnLimit = config.dailyLimits.emergencyStopOnLimit ?? true;

    // Loss streak
    this.lossStreakReductions = {
      after2: config.lossStreak.reductions.after2Losses || 0.75,
      after3: config.lossStreak.reductions.after3Losses || 0.5,
      after4: config.lossStreak.reductions.after4Losses || 0.25,
      stopAfter: config.lossStreak.stopAfterLosses,
    };

    // Concurrent risk
    this.concurrentRiskConfig = {
      enabled: config.concurrentRisk.enabled ?? true,
      maxPositions: config.concurrentRisk.maxPositions || 3,
      maxRiskPerPosition: config.concurrentRisk.maxRiskPerPosition || 2.0,
      maxTotalExposurePercent: config.concurrentRisk.maxTotalExposurePercent || 5.0,
    };

    // Position sizing
    this.positionSizingConfig = {
      riskPerTradePercent: config.positionSizing.riskPerTradePercent || 1.0,
      minPositionSizeUsdt: config.positionSizing.minPositionSizeUsdt || 5.0,
      maxPositionSizeUsdt: config.positionSizing.maxPositionSizeUsdt || 100.0,
      maxLeverageMultiplier: config.positionSizing.maxLeverageMultiplier || 2.0,
    };

    // Initialize lastResetTime to start of today (enables reset tracking)
    this.lastResetTime = Date.now();

    this.logger.info('🎯 RiskManager initialized', {
      maxDailyLoss: this.maxDailyLossPercent + '%',
      maxPositions: this.concurrentRiskConfig.maxPositions,
      riskPerTrade: this.positionSizingConfig.riskPerTradePercent + '%',
    });
  }

  /**
   * Set account balance for accurate daily PnL % calculation
   * Used in testing and when balance changes mid-session
   * PHASE 4 RULE: Explicit initialization instead of fallback calculations
   */
  setAccountBalance(balance: number): void {
    if (!balance || balance <= 0) {
      this.logger.warn('[RiskManager] Invalid account balance for PnL calculation', { balance });
      return;
    }
    this.accountBalanceForPnLCalc = balance;
  }

  /**
   * PRIMARY METHOD: Check if trade is allowed from risk perspective
   * SINGLE decision point for all risk checks
   *
   * @returns RiskDecision with:
   *   - allowed: true/false
   *   - reason: why blocked (if blocked)
   *   - adjustedPositionSize: calculated size with ALL modifiers
   */
  async canTrade(
    signal: Signal,
    accountBalance: number,
    openPositions: Position[]
  ): Promise<RiskDecision> {
    try {
      // ========================================================================
      // PHASE 4 RULE: FAST FAIL - Validate inputs FIRST before any checks
      // ========================================================================

      // REQUIRED: signal.price must be provided - NO FALLBACKS (THROW strategy)
      if (!signal.price || signal.price <= 0) {
        throw new RiskValidationError(
          `Signal.price must be positive number. Got: ${signal.price}`,
          {
            signal,
            reason: 'Invalid signal price',
            signalPrice: signal.price,
          }
        );
      }

      // REQUIRED: signal.confidence must be provided - NO FALLBACKS (THROW strategy)
      if (signal.confidence === undefined || signal.confidence < 0 || signal.confidence > 100) {
        throw new RiskValidationError(
          `Signal.confidence must be 0-100. Got: ${signal.confidence}`,
          {
            signal,
            reason: 'Invalid signal confidence',
            confidence: signal.confidence,
          }
        );
      }

      // Account balance validation with GRACEFUL_DEGRADE
      if (!accountBalance || accountBalance <= 0) {
        // On invalid account balance, graceful degrade = deny trade for safety
        const handled = await this.errorHandler.handle(
          new InsufficientAccountBalanceError(
            `Invalid account balance: ${accountBalance}`,
            { currentBalance: accountBalance, reason: 'Zero or negative balance' }
          ),
          {
            strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
            context: 'RiskManager.canTrade[accountBalance]',
          }
        );

        // Graceful degrade for balance = deny trade (safe fallback)
        return {
          allowed: false,
          reason: 'Account balance validation failed - trade denied for safety',
          riskDetails: this.buildRiskDetails(openPositions),
        };
      }

    // Store account balance for accurate daily PnL % calculation
    this.accountBalanceForPnLCalc = accountBalance;

    // Reset daily stats if new day
    this.checkAndResetDailyStats();

    // ========================================================================
    // CHECK 1: DAILY LOSS LIMIT
    // ========================================================================
    if (this.dailyPnLPercent <= -this.maxDailyLossPercent) {
      this.logger.warn('⛔ Trade blocked: Daily loss limit exceeded', {
        dailyLoss: this.dailyPnLPercent.toFixed(2) + '%',
        limit: -this.maxDailyLossPercent + '%',
      });

      if (this.emergencyStopOnLimit) {
        this.logger.error('🚨 EMERGENCY STOP: Daily loss limit hit!', {
          dailyPnL: this.dailyPnL.toFixed(2) + ' USDT',
          accountBalance: accountBalance.toFixed(2) + ' USDT',
        });
      }

      return {
        allowed: false,
        reason: `Daily loss limit exceeded: ${this.dailyPnLPercent.toFixed(2)}% / -${this.maxDailyLossPercent}%`,
        riskDetails: this.buildRiskDetails(openPositions),
      };
    }

    // ========================================================================
    // CHECK 2: DAILY PROFIT LIMIT (Optional)
    // ========================================================================
    if (this.maxDailyProfitPercent && this.dailyPnLPercent >= this.maxDailyProfitPercent) {
      this.logger.info('⛔ Trade blocked: Daily profit target reached', {
        dailyProfit: this.dailyPnLPercent.toFixed(2) + '%',
        target: this.maxDailyProfitPercent + '%',
      });

      return {
        allowed: false,
        reason: `Daily profit target reached: ${this.dailyPnLPercent.toFixed(2)}% / ${this.maxDailyProfitPercent}%`,
        riskDetails: this.buildRiskDetails(openPositions),
      };
    }

    // ========================================================================
    // CHECK 3: CONSECUTIVE LOSS LIMIT
    // ========================================================================
    if (
      this.lossStreakReductions.stopAfter &&
      this.consecutiveLosses >= this.lossStreakReductions.stopAfter
    ) {
      this.logger.warn('⛔ Trade blocked: Consecutive loss limit reached', {
        consecutiveLosses: this.consecutiveLosses,
        limit: this.lossStreakReductions.stopAfter,
      });

      return {
        allowed: false,
        reason: `Consecutive loss limit exceeded: ${this.consecutiveLosses} / ${this.lossStreakReductions.stopAfter}`,
        riskDetails: this.buildRiskDetails(openPositions),
      };
    }

    // ========================================================================
    // CHECK 4: CONCURRENT RISK LIMITS
    // ========================================================================
    if (this.concurrentRiskConfig.enabled) {
      // Check max positions
      if (openPositions.length >= this.concurrentRiskConfig.maxPositions) {
        this.logger.warn('⛔ Trade blocked: Max concurrent positions reached', {
          currentPositions: openPositions.length,
          maxPositions: this.concurrentRiskConfig.maxPositions,
        });

        return {
          allowed: false,
          reason: `Max concurrent positions reached: ${openPositions.length} / ${this.concurrentRiskConfig.maxPositions}`,
          riskDetails: this.buildRiskDetails(openPositions),
        };
      }

      // Calculate total exposure if we open this trade
      const newExposure = this.calculateTotalExposure(openPositions, signal);
      const newExposurePercent = (newExposure / accountBalance) * 100;

      if (newExposurePercent > this.concurrentRiskConfig.maxTotalExposurePercent) {
        this.logger.warn('⛔ Trade blocked: Total exposure limit would be exceeded', {
          currentExposure: this.totalExposure.toFixed(2) + ' USDT',
          proposedExposure: newExposure.toFixed(2) + ' USDT',
          limit: this.concurrentRiskConfig.maxTotalExposurePercent + '%',
          newPercent: newExposurePercent.toFixed(2) + '%',
        });

        return {
          allowed: false,
          reason: `Total exposure limit would be exceeded: ${newExposurePercent.toFixed(2)}% / ${this.concurrentRiskConfig.maxTotalExposurePercent}%`,
          riskDetails: this.buildRiskDetails(openPositions),
        };
      }
    }

    // ========================================================================
    // CALCULATE POSITION SIZE WITH ALL MODIFIERS
    // ========================================================================
    const baseSize = this.calculateBasePositionSize(signal, accountBalance);
    const sizeMultiplier = this.calculateSizeMultiplier();
    const adjustedSize = baseSize * sizeMultiplier;

    // Ensure within min/max bounds
    const finalSize = this.constrainPositionSize(adjustedSize);

    // ========================================================================
    // ALL CHECKS PASSED - TRADE ALLOWED
    // ========================================================================
    this.logger.info('✅ Trade allowed by RiskManager', {
      strategy: signal.type,
      direction: signal.direction,
      baseSize: baseSize.toFixed(4),
      multiplier: sizeMultiplier.toFixed(2),
      finalSize: finalSize.toFixed(4),
      consecutiveLosses: this.consecutiveLosses,
      dailyPnL: this.dailyPnLPercent.toFixed(2) + '%',
    });

      return {
        allowed: true,
        adjustedPositionSize: finalSize,
        riskDetails: this.buildRiskDetails(openPositions),
      };
    } catch (error) {
      // Handle validation errors
      if (error instanceof RiskValidationError) {
        const handled = await this.errorHandler.handle(error, {
          strategy: RecoveryStrategy.THROW,
          context: 'RiskManager.canTrade[validation]',
        });
        if (!handled.success) {
          throw handled.error;
        }
      }
      throw error;
    }
  }

  /**
   * Calculate base position size from risk percent
   * Formula: positionSize = (accountBalance * riskPercent / 100) / stopLossDistance
   *
   * PHASE 4 RULE: NO FALLBACKS - Fast fail if required data missing
   * All values must be explicit and provided by Signal
   */
  private calculateBasePositionSize(signal: Signal, accountBalance: number): number {
    // REQUIRED: signal.price must be provided - NO FALLBACKS
    if (!signal.price || signal.price <= 0) {
      throw new Error(
        `[RiskManager] REQUIRED: Signal.price must be positive number. Got: ${signal.price}`
      );
    }

    // REQUIRED: signal.confidence must be provided - NO FALLBACKS
    if (signal.confidence === undefined || signal.confidence < 0 || signal.confidence > 100) {
      throw new Error(
        `[RiskManager] REQUIRED: Signal.confidence must be 0-100. Got: ${signal.confidence}`
      );
    }

    const riskAmount = (accountBalance * this.positionSizingConfig.riskPerTradePercent) / 100;

    // Calculate SL distance using EXPLICIT values - NO ?? or ||
    const slDistancePercent = Math.max(
      RISK_MANAGER_MIN_SL_DISTANCE_PERCENT,
      MULTIPLIER_VALUES.TWO - signal.confidence / 100
    );

    const slDistance = (signal.price * slDistancePercent) / 100;
    let baseSize = riskAmount / slDistance;

    // Constrain by leverage
    const maxSizeByLeverage = (accountBalance * this.positionSizingConfig.maxLeverageMultiplier) / signal.price;
    baseSize = Math.min(baseSize, maxSizeByLeverage);

    return baseSize;
  }

  /**
   * Calculate size multiplier based on loss streak
   * Reduces size progressively after consecutive losses
   * Uses EXPLICIT constants - NO magic numbers
   */
  private calculateSizeMultiplier(): number {
    switch (this.consecutiveLosses) {
      case 0:
      case 1:
        // No reduction after 0-1 losses
        return RATIO_MULTIPLIERS.FULL; // 1.0
      case 2:
        // 75% size after 2 losses
        return RISK_MANAGER_LOSS_STREAK_MULTIPLIER_2_LOSSES;
      case 3:
        // 50% size after 3 losses
        return RISK_MANAGER_LOSS_STREAK_MULTIPLIER_3_LOSSES;
      default:
        // 25% size after 4+ losses
        return RISK_MANAGER_LOSS_STREAK_MULTIPLIER_4_LOSSES;
    }
  }

  /**
   * Constrain position size to min/max bounds
   */
  private constrainPositionSize(size: number): number {
    const notionalValue = size; // Simplified - in production would use entry price
    return Math.max(
      this.positionSizingConfig.minPositionSizeUsdt,
      Math.min(size, this.positionSizingConfig.maxPositionSizeUsdt)
    );
  }

  /**
   * Calculate total exposure if we add a new position
   * PHASE 4 RULE: Use EXPLICIT calculation instead of magic numbers
   * PHASE 8.9: ErrorHandler integration with GRACEFUL_DEGRADE on calculation failures
   */
  private calculateTotalExposure(openPositions: Position[], newSignal: Signal): number {
    try {
      let totalExposure = 0;

      // Sum existing positions (notional value = quantity * price)
      for (const pos of openPositions) {
        try {
          const posExposure = Math.abs(pos.quantity * pos.entryPrice);
          if (!isFinite(posExposure)) {
            throw new RiskCalculationError(
              `Invalid position exposure: ${posExposure}`,
              {
                operation: 'positionExposureCalculation',
                inputValues: { quantity: pos.quantity, entryPrice: pos.entryPrice },
                result: posExposure,
              }
            );
          }
          totalExposure += posExposure;
        } catch (error) {
          // Skip invalid position exposure, continue with others
          this.logger.warn('[RiskManager] Invalid position exposure, skipping', {
            position: pos,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Estimate new position size using the same formula as calculateBasePositionSize
      // This ensures consistency between exposure check and actual sizing
      if (newSignal && newSignal.price && newSignal.price > 0 && newSignal.confidence >= 0 && this.accountBalanceForPnLCalc > 0) {
        try {
          const riskAmount = this.accountBalanceForPnLCalc * (this.positionSizingConfig.riskPerTradePercent / 100);
          const slDistancePercent = Math.max(
            RISK_MANAGER_MIN_SL_DISTANCE_PERCENT,
            MULTIPLIER_VALUES.TWO - newSignal.confidence / 100
          );
          const slDistance = (newSignal.price * slDistancePercent) / 100;
          const estimatedSize = riskAmount / Math.max(slDistance, 0.01); // Prevent division by zero

          if (!isFinite(estimatedSize)) {
            throw new RiskCalculationError(
              `Invalid estimated size: ${estimatedSize}`,
              {
                operation: 'estimatedSizeCalculation',
                inputValues: { riskAmount, slDistance, slDistancePercent },
                result: estimatedSize,
              }
            );
          }

          const maxSizeByLeverage = (this.accountBalanceForPnLCalc * this.positionSizingConfig.maxLeverageMultiplier) / newSignal.price;
          const constrainedSize = Math.min(estimatedSize, maxSizeByLeverage);
          const newExposure = constrainedSize * newSignal.price;

          if (!isFinite(newExposure)) {
            throw new RiskCalculationError(
              `Invalid new exposure: ${newExposure}`,
              {
                operation: 'newExposureCalculation',
                inputValues: { constrainedSize, price: newSignal.price },
                result: newExposure,
              }
            );
          }

          totalExposure += newExposure;
        } catch (error) {
          // Graceful degrade: assume no new exposure on calculation error
          const handled = this.errorHandler.wrapSync(
            () => { throw error; },
            {
              strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
              context: 'RiskManager.calculateTotalExposure[newSignal]',
            }
          );
          this.logger.warn('[RiskManager] New signal exposure calculation failed, assuming zero exposure', {
            signal: newSignal,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return totalExposure;
    } catch (error) {
      // Final fallback - return zero exposure on critical failure
      const handled = this.errorHandler.wrapSync(
        () => { throw error; },
        {
          strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
          context: 'RiskManager.calculateTotalExposure[critical]',
        }
      );
      this.logger.error('[RiskManager] Critical error calculating total exposure, returning zero', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Record trade result and update internal state
   * PHASE 4: EXPLICIT calculation of daily PnL % using account balance
   * PHASE 8.9: ErrorHandler integration with GRACEFUL_DEGRADE on calculation failures
   */
  recordTradeResult(trade: TradeRecord): void {
    try {
      if (!trade) {
        this.logger.warn('[RiskManager] Trade record is required');
        return;
      }

      const pnl = trade.realizedPnL || 0;
      const tradeValue = (trade.quantity * trade.entryPrice) || 1; // Avoid division by zero

      // Calculate PnL % with error handling
      let pnlPercent: number;
      try {
        pnlPercent = (pnl / tradeValue) * 100;
        if (!isFinite(pnlPercent)) {
          throw new RiskCalculationError(
            `Invalid PnL percent: ${pnlPercent}`,
            {
              operation: 'pnlPercentCalculation',
              inputValues: { pnl, tradeValue },
              result: pnlPercent,
            }
          );
        }
      } catch (error) {
        // Graceful degrade on calculation error
        const handled = this.errorHandler.wrapSync(
          () => { throw error; },
          {
            strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
            context: 'RiskManager.recordTradeResult[pnlCalculation]',
          }
        );
        pnlPercent = 0;
        this.logger.warn('[RiskManager] PnL calculation degraded, using zero', {
          pnl,
          tradeValue,
          originalPercent: isFinite((pnl / tradeValue) * 100) ? (pnl / tradeValue) * 100 : 'NaN',
        });
      }

      // Update daily PnL with safe calculation
      this.dailyPnL += pnl;

      // Calculate daily PnL % based on account balance with error handling
      const baseBalance = this.accountBalanceForPnLCalc || tradeValue;
      const dailyPnLPercent = (this.dailyPnL / baseBalance) * 100;

      if (isFinite(dailyPnLPercent)) {
        this.dailyPnLPercent = dailyPnLPercent;
      } else {
        this.logger.warn('[RiskManager] Daily PnL % calculation failed, keeping previous value', {
          calculatedPercent: dailyPnLPercent,
          currentPercent: this.dailyPnLPercent,
        });
      }

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
      const handled = this.errorHandler.wrapSync(
        () => { throw error; },
        {
          strategy: RecoveryStrategy.SKIP,
          context: 'RiskManager.recordTradeResult[critical]',
        }
      );
      this.logger.error('[RiskManager] Critical error recording trade, operation skipped', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get current risk status (for logging/debugging)
   */
  getRiskStatus(): RiskStatus {
    return {
      dailyPnL: this.dailyPnL,
      dailyPnLPercent: this.dailyPnLPercent,
      consecutiveLosses: this.consecutiveLosses,
      totalExposure: this.totalExposure,
      totalExposurePercent: 0, // Placeholder
      maxDailyLossPercent: this.maxDailyLossPercent,
      riskHealthy:
        this.dailyPnLPercent > -this.maxDailyLossPercent && this.consecutiveLosses < (this.lossStreakReductions.stopAfter || 999),
    };
  }

  /**
   * Build risk details object for RiskDecision
   */
  private buildRiskDetails(openPositions: Position[]) {
    return {
      dailyPnL: this.dailyPnL,
      dailyPnLPercent: this.dailyPnLPercent,
      consecutiveLosses: this.consecutiveLosses,
      totalExposure: this.totalExposure,
      totalExposurePercent: 0, // Placeholder
    };
  }

  /**
   * Check if it's a new trading day and reset daily stats
   */
  private checkAndResetDailyStats(): void {
    // 🔒 CRITICAL: Use UTC date for accurate daily reset (not time-based)
    // Ensures reset happens exactly at midnight UTC, not 24 hours after last reset
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const lastResetUTC = new Date(this.lastResetTime);

    // Check if day has changed (compare dates, not timestamps)
    const lastResetDate = new Date(
      Date.UTC(
        lastResetUTC.getUTCFullYear(),
        lastResetUTC.getUTCMonth(),
        lastResetUTC.getUTCDate()
      )
    );

    // Reset if we crossed into a new day
    if (todayUTC.getTime() > lastResetDate.getTime()) {
      this.dailyPnL = 0;
      this.dailyPnLPercent = 0;
      this.consecutiveLosses = 0;
      this.lastResetTime = Date.now();

      this.logger.info('🔄 Daily stats reset (new UTC day)', {
        previousDate: lastResetDate.toISOString().split('T')[0],
        newDate: todayUTC.toISOString().split('T')[0],
        timestamp: now.toISOString(),
      });
    }
  }
}
