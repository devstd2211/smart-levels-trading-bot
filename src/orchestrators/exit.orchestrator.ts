/**
 * Exit Orchestrator - PHASE 4 PRIMARY LAYER (Week 3)
 * SESSION 66: COMPLETE WITH ADVANCED EXIT FEATURES
 *
 * Single state machine for ALL position exit logic.
 * Consolidates:
 * ✅ TakeProfitManagerService (TP hit detection)
 * ✅ SmartBreakevenService (breakeven logic)
 * ✅ SmartTrailingV2Service (trailing stop logic with ATR + volume)
 * ✅ AdaptiveTP3Service (adaptive TP levels based on market conditions)
 * ✅ BBTrailingStop (Bollinger Band trailing for final leg)
 * ✅ Exit logic from PositionLifecycleService
 *
 * NEW FEATURES (Session 66):
 * - Smart Breakeven Pre-BE Mode: Sophisticated candle-based profit locking
 * - Adaptive TP3: Dynamic TP3 adjustment based on volume and volatility
 * - SmartTrailingV2: ATR-aware trailing with volume confirmation
 * - Bollinger Band Trailing: Statistical stop placement for final position
 *
 * SINGLE RESPONSIBILITY:
 * Manage position lifecycle through state transitions:
 * OPEN → TP1_HIT → TP2_HIT → TP3_HIT → CLOSED
 * With SL checks at ANY state
 *
 * ATOMIC OPERATIONS:
 * Each position update triggers state evaluation:
 * 1. Check if SL hit → CLOSED
 * 2. Check if TP3 hit → CLOSED
 * 3. Check if TP2 hit → TP2_HIT (activate trailing)
 * 4. Check if TP1 hit → TP1_HIT (move SL to breakeven)
 * 5. Return action list (close%, update_sl, activate_trail, etc)
 *
 * INTEGRATION POINT:
 * Called by TradingOrchestrator.onCandleClosed() when position open
 * Result determines position updates (close, SL change, trail activation)
 */

import {
  Position,
  PositionState,
  ExitAction,
  ExitOrchestratorResult,
  LoggerService,
  PositionSide,
} from '../types';
import { evaluateExit, ExitDecisionContext, ExitDecisionResult } from '../decision-engine/exit-decisions';
import { PositionStateMachineService } from '../services/position-state-machine.service';

// ============================================================================
// CONSTANTS (PHASE 4: EXPLICIT CONSTANTS - NO MAGIC NUMBERS)
// ============================================================================

// Minimum confidence threshold to stay in position
const EXIT_ORCHESTRATOR_MIN_SL_DISTANCE_PERCENT = 0.1;

// Default TP levels if not provided
const EXIT_ORCHESTRATOR_DEFAULT_TP_LEVELS = 3;

// Breakeven activation profit threshold (%)
const EXIT_ORCHESTRATOR_BE_ACTIVATION_PROFIT = 0.3;

// Pre-breakeven mode settings
const EXIT_ORCHESTRATOR_PRE_BE_MAX_CANDLES = 5;
const EXIT_ORCHESTRATOR_PRE_BE_PROFIT_LOCK = 0.1;

// Trailing stop settings
const EXIT_ORCHESTRATOR_TRAIL_ACTIVATION_PROFIT = 1.0;
const EXIT_ORCHESTRATOR_TRAIL_DISTANCE_ATR = 0.5;

// SmartTrailingV2 settings (enhanced trailing with ATR + volume confirmation)
const SMART_TRAILING_MIN_ATR_PERCENT = 1.5;
const SMART_TRAILING_MAX_ATR_PERCENT = 3.0;
const SMART_TRAILING_VOLUME_THRESHOLD = 1.2; // 120% of average volume

// Adaptive TP3 settings (dynamic adjustment based on market conditions)
const ADAPTIVE_TP3_MIN_PROFIT_PERCENT = 2.0;
const ADAPTIVE_TP3_MAX_PROFIT_PERCENT = 5.0;
const ADAPTIVE_TP3_HIGH_VOLUME_BONUS = 0.5; // Extra % when high volume

// Bollinger Band Trailing settings
const BB_TRAILING_PERIOD = 20;
const BB_TRAILING_STD_DEV = 2.0;
const BB_TRAILING_USE_LOWER_BAND = true; // Use lower band for LONG, upper for SHORT

// ============================================================================
// EXIT ORCHESTRATOR
// ============================================================================

export class ExitOrchestrator {
  // Position state tracking
  private positionStates: Map<string, PositionState> = new Map();
  private preBEModes: Map<string, { activatedAt: number; candlesWaited: number; candleCount: number }> = new Map();
  private trailingModes: Map<string, { isTrailing: boolean; currentTrailingPrice: number; lastUpdatePrice: number }> = new Map();
  private bbTrailingModes: Map<string, { bbLower: number; bbUpper: number; activatedAt: number }> = new Map();

  // PHASE 4.5: Unified Position State Machine (persisted state + closure reasons)
  private stateMachine: PositionStateMachineService;

  constructor(
    private logger: LoggerService,
    stateMachine?: PositionStateMachineService,
    private strategyId?: string,  // Phase 10.3c: Strategy identifier for event tagging
  ) {
    // Use injected state machine or create new one
    this.stateMachine = stateMachine || new PositionStateMachineService(logger);

    this.logger.info('🎯 ExitOrchestrator initialized (PHASE 4.5 INTEGRATION)', {
      role: 'Single position exit state machine',
      statesAvailable: 'OPEN, TP1_HIT, TP2_HIT, TP3_HIT, CLOSED',
      actionsAvailable: 'CLOSE_PERCENT, UPDATE_SL, ACTIVATE_TRAILING, MOVE_SL_TO_BREAKEVEN, CLOSE_ALL',
      stateMachineIntegrated: 'YES (Phase 4.5)',
    });
  }

  /**
   * PRIMARY METHOD: Evaluate position state and determine exit actions
   * ATOMIC decision point for ALL exit logic
   *
   * PHASE 5: Uses pure evaluateExit() function for decision logic
   * Keeps side effects (state machine, logging) in orchestrator
   *
   * @param position - Current position to evaluate
   * @param currentPrice - Current market price
   * @param indicators - Optional indicators (EMA, volume, ATR)
   * @returns ExitOrchestratorResult with state transition and actions
   */
  async evaluateExit(
    position: Position,
    currentPrice: number,
    indicators?: {
      ema20?: number;
      currentVolume?: number;
      avgVolume?: number;
      atrPercent?: number;
    },
  ): Promise<ExitOrchestratorResult> {
    try {
      // =====================================================================
      // PHASE 5: Use pure decision function
      // =====================================================================
      const currentState = this.getCurrentState(position.symbol);

      const decisionContext: ExitDecisionContext = {
        position,
        currentPrice,
        currentState,
        indicators: {
          atrPercent: indicators?.atrPercent,
          currentVolume: indicators?.currentVolume,
          avgVolume: indicators?.avgVolume,
          ema20: indicators?.ema20,
        },
        config: {
          beMarginPercent: EXIT_ORCHESTRATOR_PRE_BE_PROFIT_LOCK,
          minSLDistancePercent: EXIT_ORCHESTRATOR_MIN_SL_DISTANCE_PERCENT,
          trailingDistancePercent: EXIT_ORCHESTRATOR_TRAIL_DISTANCE_ATR,
        },
      };

      // Call pure decision function (no side effects)
      const decisionResult = evaluateExit(decisionContext);

      // =====================================================================
      // APPLY SIDE EFFECTS (Orchestrator responsibility)
      // =====================================================================

      // Update internal state tracking
      this.positionStates.set(position.symbol, decisionResult.state);

      // Handle state machine integration (PHASE 4.5)
      if (decisionResult.state !== currentState) {
        // State transition occurred
        const pnL = decisionResult.metadata?.profitPercent ?? 0;

        this.logger.info(`📊 Exit State Transition: ${decisionResult.state}`, {
          symbol: position.symbol,
          transition: decisionResult.stateTransition,
          trigger: decisionResult.metadata?.closureReason || decisionResult.state,
          profit: pnL.toFixed(2) + '%',
          profitPercent: pnL.toFixed(2) + '%',
          timestamp: Date.now(),
        });

        // Handle special cases for logging
        if (decisionResult.state === PositionState.TP1_HIT) {
          this.logger.info('✅ TP1 HIT - moving SL to breakeven', {
            symbol: position.symbol,
            tp1Price: position.takeProfits[0]?.price.toFixed(8),
            newSL: decisionResult.actions[1]?.newStopLoss?.toFixed(8),
          });
          this.activatePreBEMode(position.symbol);

          this.stateMachine.transitionState({
            symbol: position.symbol,
            positionId: position.id,
            targetState: PositionState.TP1_HIT,
            reason: 'TP1 hit at ' + currentPrice.toFixed(8),
            metadata: {
              preBEMode: {
                activatedAt: Date.now(),
                candlesWaited: 0,
                candleCount: EXIT_ORCHESTRATOR_PRE_BE_MAX_CANDLES,
              },
            },
          });
        } else if (decisionResult.state === PositionState.TP2_HIT) {
          this.logger.info('✅ TP2 HIT - activating trailing stop', {
            symbol: position.symbol,
            tp2Price: position.takeProfits[1]?.price.toFixed(8),
            trailingDistance: decisionResult.actions[1]?.trailingDistance?.toFixed(8),
          });
          this.preBEModes.delete(position.symbol);

          const trailingPrice = position.side === PositionSide.LONG
            ? currentPrice - (decisionResult.actions[1]?.trailingDistance ?? 0)
            : currentPrice + (decisionResult.actions[1]?.trailingDistance ?? 0);

          this.stateMachine.transitionState({
            symbol: position.symbol,
            positionId: position.id,
            targetState: PositionState.TP2_HIT,
            reason: 'TP2 hit at ' + currentPrice.toFixed(8),
            metadata: {
              trailingMode: {
                isTrailing: true,
                currentTrailingPrice: trailingPrice,
                lastUpdatePrice: currentPrice,
              },
            },
          });
        } else if (decisionResult.state === PositionState.TP3_HIT) {
          this.logger.info('✅ TP3 HIT - closing remaining position', {
            symbol: position.symbol,
            tp3Price: position.takeProfits[2]?.price.toFixed(8),
          });

          this.stateMachine.transitionState({
            symbol: position.symbol,
            positionId: position.id,
            targetState: PositionState.TP3_HIT,
            reason: 'TP3 hit at ' + currentPrice.toFixed(8),
          });
        } else if (decisionResult.state === PositionState.CLOSED) {
          // Map closure reason to valid enum value
          const closureReason = (decisionResult.metadata?.closureReason as 'SL_HIT' | 'TP1_HIT' | 'TP2_HIT' | 'TP3_HIT' | 'TRAILING_STOP' | 'MANUAL' | 'OTHER') || 'OTHER';

          this.logger.warn('❌ Position Closed', {
            symbol: position.symbol,
            reason: closureReason,
            closurePrice: currentPrice.toFixed(8),
            profitPercent: pnL.toFixed(2) + '%',
          });

          this.stateMachine.closePosition(position.symbol, position.id, decisionResult.reason, {
            closureReason,
            closurePrice: currentPrice,
            closurePnL: pnL,
          });
        }
      }

      // Return result with converted actions
      return {
        newState: decisionResult.state,
        actions: decisionResult.actions,
        stateTransition: decisionResult.stateTransition,
      };
    } catch (error) {
      this.logger.error('ExitOrchestrator evaluation failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Return safe default: close position on error
      return {
        newState: PositionState.CLOSED,
        actions: [{ action: ExitAction.CLOSE_ALL }],
        stateTransition: `ERROR → CLOSED`,
      };
    }
  }

  /**
   * Check if Stop Loss has been hit
   * @private
   */
  private checkStopLossHit(position: Position, currentPrice: number): boolean {
    const isLong = position.side === PositionSide.LONG;
    const slHit = isLong ? currentPrice <= position.stopLoss.price : currentPrice >= position.stopLoss.price;
    return slHit;
  }

  /**
   * Check if Take Profit level has been hit
   * @param position - Position to check
   * @param currentPrice - Current price
   * @param tpIndex - Which TP level (0 for TP1, 1 for TP2, 2 for TP3)
   * @private
   */
  private checkTPHit(position: Position, currentPrice: number, tpIndex: number): boolean {
    if (tpIndex >= position.takeProfits.length) {
      return false;
    }

    const tp = position.takeProfits[tpIndex];
    if (!tp || !tp.price) {
      return false;
    }

    const isLong = position.side === PositionSide.LONG;
    const tpHit = isLong ? currentPrice >= tp.price : currentPrice <= tp.price;

    return tpHit;
  }

  /**
   * Calculate Stop Loss price for breakeven position
   * Moves to entry price + small profit margin
   * @private
   */
  private calculateBreakevenSL(position: Position): number {
    const isLong = position.side === PositionSide.LONG;
    const profitMargin = position.entryPrice * (EXIT_ORCHESTRATOR_PRE_BE_PROFIT_LOCK / 100);

    return isLong ? position.entryPrice + profitMargin : position.entryPrice - profitMargin;
  }

  /**
   * Calculate trailing stop distance (in absolute price units)
   * Based on ATR if available, otherwise use fixed percent
   * @private
   */
  private calculateTrailingDistance(position: Position, atrPercent?: number): number {
    let trailDistance: number;

    if (atrPercent) {
      trailDistance = (position.entryPrice * atrPercent) / 100;
    } else {
      trailDistance = (position.entryPrice * EXIT_ORCHESTRATOR_TRAIL_DISTANCE_ATR) / 100;
    }

    return Math.max(trailDistance, EXIT_ORCHESTRATOR_MIN_SL_DISTANCE_PERCENT);
  }

  /**
   * Get current state of position
   * @private
   */
  private getCurrentState(symbol: string): PositionState {
    return this.positionStates.get(symbol) || PositionState.OPEN;
  }

  /**
   * Activate Pre-BE mode for a position
   * Tracks how many candles have passed since activation
   * @private
   */
  private activatePreBEMode(symbol: string): void {
    if (!this.preBEModes.has(symbol)) {
      this.preBEModes.set(symbol, {
        activatedAt: Date.now(),
        candlesWaited: 0,
        candleCount: 0,
      });

      this.logger.debug('Pre-BE mode activated for position', {
        symbol,
        maxCandles: EXIT_ORCHESTRATOR_PRE_BE_MAX_CANDLES,
      });
    }
  }

  /**
   * SMART BREAKEVEN PRE-BE MODE ENHANCEMENT
   * Sophisticated breakeven logic with candle counting
   * Waits for specified number of candles after TP1 to lock in profits
   *
   * @private
   */
  private evaluateSmartBreakeven(
    symbol: string,
    position: Position,
    currentPrice: number,
  ): { shouldMoveToBreakeven: boolean; newSL: number } {
    const preBEMode = this.preBEModes.get(symbol);

    if (!preBEMode) {
      return { shouldMoveToBreakeven: false, newSL: 0 };
    }

    // Increment candle count on each evaluation
    preBEMode.candleCount = (preBEMode.candleCount || 0) + 1;

    const isLong = position.side === PositionSide.LONG;
    const currentProfit = isLong
      ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100
      : ((position.entryPrice - currentPrice) / position.entryPrice) * 100;

    // Already profitable, move to breakeven immediately
    if (currentProfit >= EXIT_ORCHESTRATOR_BE_ACTIVATION_PROFIT) {
      this.logger.info('✅ Smart Breakeven: Profit locked', {
        symbol,
        currentProfit: currentProfit.toFixed(2) + '%',
        candlesWaited: preBEMode.candleCount,
      });
      return { shouldMoveToBreakeven: true, newSL: this.calculateBreakevenSL(position) };
    }

    // Wait for candles if not yet profitable
    if (preBEMode.candleCount >= EXIT_ORCHESTRATOR_PRE_BE_MAX_CANDLES) {
      this.logger.info('⏱️ Smart Breakeven: Max candles reached, moving to breakeven', {
        symbol,
        candlesWaited: preBEMode.candleCount,
      });
      return { shouldMoveToBreakeven: true, newSL: this.calculateBreakevenSL(position) };
    }

    return { shouldMoveToBreakeven: false, newSL: 0 };
  }

  /**
   * ADAPTIVE TP3 DYNAMIC ADJUSTMENT
   * Adjusts TP3 level based on market conditions (volume, volatility)
   *
   * @private
   */
  private calculateAdaptiveTP3(
    position: Position,
    currentPrice: number,
    indicators?: { currentVolume?: number; avgVolume?: number; atrPercent?: number },
  ): number {
    const isLong = position.side === PositionSide.LONG;
    const priceRange = Math.abs(position.takeProfits[2]?.price - position.entryPrice) || position.entryPrice * 0.03;

    let profitPercent = ADAPTIVE_TP3_MIN_PROFIT_PERCENT;

    // Adjust based on volume
    if (indicators?.currentVolume && indicators?.avgVolume) {
      const volumeRatio = indicators.currentVolume / indicators.avgVolume;
      if (volumeRatio > SMART_TRAILING_VOLUME_THRESHOLD) {
        profitPercent += ADAPTIVE_TP3_HIGH_VOLUME_BONUS;
      }
    }

    // Adjust based on ATR volatility
    if (indicators?.atrPercent) {
      if (indicators.atrPercent > 2.0) {
        // High volatility - take profit earlier
        profitPercent -= 0.5;
      } else if (indicators.atrPercent < 0.5) {
        // Low volatility - extend for more profit
        profitPercent += 0.5;
      }
    }

    // Cap the profit target
    profitPercent = Math.min(profitPercent, ADAPTIVE_TP3_MAX_PROFIT_PERCENT);
    profitPercent = Math.max(profitPercent, ADAPTIVE_TP3_MIN_PROFIT_PERCENT);

    const adaptiveTP3 = isLong
      ? position.entryPrice * (1 + profitPercent / 100)
      : position.entryPrice * (1 - profitPercent / 100);

    this.logger.debug('Adaptive TP3 calculated', {
      symbol: position.symbol,
      baseTP3: position.takeProfits[2]?.price.toFixed(8),
      adaptiveTP3: adaptiveTP3.toFixed(8),
      profitPercent: profitPercent.toFixed(2) + '%',
    });

    return adaptiveTP3;
  }

  /**
   * SMART TRAILING V2 - ENHANCED TRAILING WITH ATR + VOLUME
   * More sophisticated trailing that accounts for volatility and volume
   *
   * @private
   */
  private calculateSmartTrailingV2(
    symbol: string,
    position: Position,
    currentPrice: number,
    indicators?: { atrPercent?: number; currentVolume?: number; avgVolume?: number },
  ): number {
    let trailingDistance: number;

    // Base distance from ATR
    if (indicators?.atrPercent) {
      const atrPercent = Math.max(indicators.atrPercent, SMART_TRAILING_MIN_ATR_PERCENT);
      const cappedAtr = Math.min(atrPercent, SMART_TRAILING_MAX_ATR_PERCENT);
      trailingDistance = (position.entryPrice * cappedAtr) / 100;
    } else {
      trailingDistance = (position.entryPrice * SMART_TRAILING_MIN_ATR_PERCENT) / 100;
    }

    // Tighten trailing if high volume (possible reversal)
    if (indicators?.currentVolume && indicators?.avgVolume) {
      const volumeRatio = indicators.currentVolume / indicators.avgVolume;
      if (volumeRatio > SMART_TRAILING_VOLUME_THRESHOLD) {
        trailingDistance *= 0.8; // Reduce by 20% on high volume
      }
    }

    const trailingMode = this.trailingModes.get(symbol) || {
      isTrailing: false,
      currentTrailingPrice: currentPrice,
      lastUpdatePrice: currentPrice,
    };

    // Update trailing price if price moved higher (for LONG)
    const isLong = position.side === PositionSide.LONG;
    if (isLong && currentPrice > trailingMode.lastUpdatePrice) {
      trailingMode.currentTrailingPrice = currentPrice - trailingDistance;
    } else if (!isLong && currentPrice < trailingMode.lastUpdatePrice) {
      trailingMode.currentTrailingPrice = currentPrice + trailingDistance;
    }

    trailingMode.lastUpdatePrice = currentPrice;
    this.trailingModes.set(symbol, trailingMode);

    // Return the distance, not the price (price is managed internally for state tracking)
    return trailingDistance;
  }

  /**
   * BOLLINGER BAND TRAILING STOP
   * Uses Bollinger Bands for dynamic stop-loss placement
   * Activates after TP2 hit for final position protection
   *
   * @private
   */
  private calculateBBTrailingStop(
    symbol: string,
    position: Position,
    candles: Array<{ open: number; high: number; low: number; close: number }>,
  ): number {
    // Calculate BB from last 20 candles
    const recentCandles = candles.slice(-BB_TRAILING_PERIOD);
    if (recentCandles.length < BB_TRAILING_PERIOD) {
      // Not enough data, fallback to current SL
      return position.stopLoss.price;
    }

    const closes = recentCandles.map((c) => c.close);
    const sma = closes.reduce((a, b) => a + b, 0) / closes.length;
    const variance = closes.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / closes.length;
    const stdDev = Math.sqrt(variance);

    const bbUpper = sma + BB_TRAILING_STD_DEV * stdDev;
    const bbLower = sma - BB_TRAILING_STD_DEV * stdDev;

    // Update BB tracking
    const bbMode = this.bbTrailingModes.get(symbol) || { bbLower, bbUpper, activatedAt: Date.now() };
    bbMode.bbLower = bbLower;
    bbMode.bbUpper = bbUpper;
    this.bbTrailingModes.set(symbol, bbMode);

    const isLong = position.side === PositionSide.LONG;
    const bbTrailingStop = isLong ? bbLower : bbUpper;

    this.logger.debug('BB Trailing calculated', {
      symbol,
      bbLower: bbLower.toFixed(8),
      bbUpper: bbUpper.toFixed(8),
      bbTrailingStop: bbTrailingStop.toFixed(8),
    });

    return bbTrailingStop;
  }

  /**
   * Reset position state (call when position is closed)
   * Cleans up internal tracking
   * @public
   */
  resetPositionState(symbol: string, positionId?: string): void {
    this.positionStates.delete(symbol);
    this.preBEModes.delete(symbol);
    this.trailingModes.delete(symbol);
    this.bbTrailingModes.delete(symbol);

    // PHASE 4.5: Clear state machine state when position reset
    if (positionId) {
      this.stateMachine.clearState(symbol, positionId);
    }

    this.logger.debug('Position state reset', { symbol, positionId });
  }

  /**
   * Get position state (for debugging/logging)
   * @public
   */
  getPositionState(symbol: string): PositionState {
    return this.getCurrentState(symbol);
  }
}
