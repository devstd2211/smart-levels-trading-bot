/**
 * Architecture Refactoring - Core Type Definitions
 *
 * Defines the interfaces for the 4-layer modular LEGO architecture:
 * Layer 1: Decision Logic (pure functions)
 * Layer 2: Action Queue (event-driven)
 * Layer 3: Domain Logic (business services)
 * Layer 4: External Integrations (interfaces)
 */

import { SignalDirection, EntryDecision, PositionState, ExitAction } from './enums';
import type { Position, Signal, AggregatedSignal, Candle } from './core';

// ============================================================================
// EXIT ACTION DTOs - Proper types for exit actions
// ============================================================================

/**
 * DTO for CLOSE_PERCENT exit action
 */
export interface ClosePercentExitActionDTO {
  action: ExitAction.CLOSE_PERCENT;
  percent: number; // 0-100
  reason?: string;
}

/**
 * DTO for UPDATE_SL exit action
 */
export interface UpdateSLExitActionDTO {
  action: ExitAction.UPDATE_SL;
  newStopLoss: number;
  reason?: string;
}

/**
 * DTO for ACTIVATE_TRAILING exit action
 */
export interface ActivateTrailingExitActionDTO {
  action: ExitAction.ACTIVATE_TRAILING;
  trailingPercent: number;
  reason?: string;
}

/**
 * DTO for MOVE_SL_TO_BREAKEVEN exit action
 */
export interface MoveSLToBEExitActionDTO {
  action: ExitAction.MOVE_SL_TO_BREAKEVEN;
  reason?: string;
}

/**
 * DTO for CLOSE_ALL exit action
 */
export interface CloseAllExitActionDTO {
  action: ExitAction.CLOSE_ALL;
  reason?: string;
}

/**
 * Union type of all exit action DTOs
 */
export type ExitActionDTO =
  | ClosePercentExitActionDTO
  | UpdateSLExitActionDTO
  | ActivateTrailingExitActionDTO
  | MoveSLToBEExitActionDTO
  | CloseAllExitActionDTO;

// ============================================================================
// LAYER 2: ACTION QUEUE SYSTEM
// ============================================================================

/**
 * Base action interface - all actions in the system extend this
 * Actions are immutable data objects that represent a decision to do something
 */
export interface IAction {
  /** Unique action identifier (UUID) */
  id: string;

  /** Action type - discriminator for handlers */
  type: ActionType;

  /** When action was created */
  timestamp: number;

  /** Priority for queue processing */
  priority: 'HIGH' | 'NORMAL' | 'LOW';

  /** Additional context/metadata */
  metadata: Record<string, any>;

  /** Number of retry attempts */
  retries?: number;

  /** Maximum retry attempts allowed */
  maxRetries?: number;
}

/**
 * Action type discriminator
 * Used to route actions to appropriate handlers
 */
export enum ActionType {
  OPEN_POSITION = 'OPEN_POSITION',
  CLOSE_POSITION = 'CLOSE_POSITION',
  UPDATE_STOP_LOSS = 'UPDATE_STOP_LOSS',
  ACTIVATE_TRAILING = 'ACTIVATE_TRAILING',
  CLOSE_PERCENT = 'CLOSE_PERCENT',
  MOVE_SL_TO_BREAKEVEN = 'MOVE_SL_TO_BREAKEVEN',
  // Can extend with more actions later
}

/**
 * Action to open a new position
 */
export interface OpenPositionAction extends IAction {
  type: ActionType.OPEN_POSITION;
  signal: Signal; // Proper Signal object with entry parameters
  positionSize: number;
  stopLoss: number;
  takeProfits: number[];
  leverage: number;
  symbol: string;
}

/**
 * Action to close entire position
 */
export interface ClosePositionAction extends IAction {
  type: ActionType.CLOSE_POSITION;
  positionId: string;
  reason: string;
}

/**
 * Action to update stop loss price
 */
export interface UpdateStopLossAction extends IAction {
  type: ActionType.UPDATE_STOP_LOSS;
  positionId: string;
  newStopLossPrice: number;
  reason: string;
}

/**
 * Action to activate trailing stop
 */
export interface ActivateTrailingAction extends IAction {
  type: ActionType.ACTIVATE_TRAILING;
  positionId: string;
  trailingPercent: number;
}

/**
 * Action to close percentage of position
 */
export interface ClosePercentAction extends IAction {
  type: ActionType.CLOSE_PERCENT;
  positionId: string;
  percent: number; // 0-100
  reason: string;
}

/**
 * Action to move stop loss to breakeven
 */
export interface MoveSLToBreakeven extends IAction {
  type: ActionType.MOVE_SL_TO_BREAKEVEN;
  positionId: string;
  offset?: number; // Optional offset from breakeven
}

/**
 * Union type of all possible actions
 */
export type AnyAction =
  | OpenPositionAction
  | ClosePositionAction
  | UpdateStopLossAction
  | ActivateTrailingAction
  | ClosePercentAction
  | MoveSLToBreakeven;

/**
 * Result of action processing
 */
export interface ActionResult {
  success: boolean;
  actionId: string;
  error?: Error;
  metadata?: Record<string, any>;
  timestamp: number;
}

/**
 * Action handler interface - all handlers implement this
 * Handlers execute actions and return results
 */
export interface IActionHandler {
  /**
   * Check if this handler can process the action
   */
  canHandle(action: IAction): action is AnyAction;

  /**
   * Execute the action
   * Should not throw - return error in result
   */
  handle(action: AnyAction): Promise<ActionResult>;

  /**
   * Name of handler (for logging/debugging)
   */
  readonly name: string;
}

/**
 * Action queue interface
 * Manages processing of actions in order
 */
export interface IActionQueue {
  /**
   * Add action to queue
   */
  enqueue(action: IAction): Promise<void>;

  /**
   * Get next action from queue (without removing)
   */
  peek(): IAction | undefined;

  /**
   * Remove and get next action
   */
  dequeue(): IAction | undefined;

  /**
   * Process queue (run all pending actions)
   * Handlers are tried in order until one succeeds
   */
  process(handlers: IActionHandler[]): Promise<ActionResult[]>;

  /**
   * Clear all pending actions
   */
  clear(): void;

  /**
   * Get current queue size
   */
  size(): number;

  /**
   * Check if queue is processing
   */
  isProcessing(): boolean;

  /**
   * Wait for queue to be empty
   */
  waitEmpty(timeoutMs?: number): Promise<void>;
}

// ============================================================================
// LAYER 1: DECISION ENGINE - PURE FUNCTIONS & TYPES
// ============================================================================

/**
 * Entry decision context - all data needed for entry decision
 */
export interface EntryContext {
  signal: AggregatedSignal;
  trendContext: TrendContext;
  currentPrice: number;
  volatility: VolatilityContext;
  riskLimits: RiskLimits;
  recentTrades: Position[];
  marketConditions: MarketConditions;
}

/**
 * Entry decision result from pure decision function
 */
export interface EntryDecisionResult {
  decision: EntryDecision;
  reason: string;
  confidence: number; // 0-1, how confident in the decision
  riskMetrics?: {
    potentialLoss: number;
    riskRewardRatio: number;
  };
}

/**
 * Exit decision context
 */
export interface ExitContext {
  position: Position;
  currentPrice: number;
  marketTrend: TrendContext;
  timeElapsed: number;
}

/**
 * Exit decision result
 */
export interface ExitDecisionResult {
  state: PositionState;
  actions: ExitAction[];
  reason: string;
}

/**
 * Trade validation result
 */
export interface TradeValidationResult {
  isValid: boolean;
  reason: string;
  violations: string[];
}

/**
 * Risk approval result
 */
export interface RiskApprovalResult {
  approved: boolean;
  reason: string;
  positionSize?: number;
  potentialLoss?: number;
  violations: string[];
}

// ============================================================================
// LAYER 1/3: CONTEXT TYPES
// ============================================================================

/**
 * Trend analysis context
 */
export interface TrendContext {
  globalBias: SignalDirection | null; // LONG, SHORT, or null
  primaryTrendStrength: number; // 0-1
  isFlatMarket: boolean;
  emaCrossover?: {
    fast: number;
    slow: number;
    isBullish: boolean;
  };
  recentHighs: number[];
  recentLows: number[];
}

/**
 * Volatility context
 */
export interface VolatilityContext {
  atr: number;
  atrPercent: number; // relative to price
  volatilityRegime: 'LOW' | 'MEDIUM' | 'HIGH';
  bollingerBandWidth?: number; // bandwidth %
}

/**
 * Market conditions
 */
export interface MarketConditions {
  isAsianSession: boolean;
  isEuropeanSession: boolean;
  isUSSession: boolean;
  volumeRatio: number; // current vs average
  isHighVolume: boolean;
}

/**
 * Risk limits context
 */
export interface RiskLimits {
  maxDailyLoss: number;
  currentDailyLoss: number;
  maxConcurrentPositions: number;
  currentPositions: number;
  lossPenaltyMultiplier: number; // from risk manager
}

// AggregatedSignal is defined in core.ts and imported above

// ============================================================================
// LAYER 3/4: SERVICE INTERFACES
// ============================================================================

/**
 * Position lifecycle service interface
 * Responsible for opening and closing positions
 */
export interface IPositionLifecycle {
  /**
   * Open a new position based on signal
   */
  openPosition(signal: AggregatedSignal, context: EntryContext): Promise<Position>;

  /**
   * Close entire position
   */
  closePosition(position: Position, reason: string): Promise<void>;

  /**
   * Update position stop loss
   */
  updateStopLoss(position: Position, newPrice: number): Promise<void>;

  /**
   * Activate trailing stop
   */
  activateTrailing(position: Position, trailingPercent: number): Promise<void>;

  /**
   * Close percentage of position
   */
  closePercent(position: Position, percent: number): Promise<void>;
}

/**
 * Risk gatekeeper interface
 * Approves or rejects trades based on risk rules
 */
export interface IRiskGatekeeper {
  /**
   * Check if entry is allowed by risk rules
   */
  approveEntry(context: EntryContext): RiskApprovalResult;

  /**
   * Calculate position size given risk parameters
   */
  calculatePositionSize(entryPrice: number, stopLoss: number, riskAmount: number): number;

  /**
   * Check if we hit daily loss limit
   */
  isDailyLossExceeded(): boolean;

  /**
   * Check if we hit concurrent position limit
   */
  isConcurrentLimitExceeded(): boolean;
}

/**
 * Decision engine interface
 * Encapsulates all decision-making logic
 */
export interface IDecisionEngine {
  /**
   * Evaluate if we should enter trade
   */
  evaluateEntry(context: EntryContext): EntryDecisionResult;

  /**
   * Evaluate position state changes
   */
  evaluateExit(context: ExitContext): ExitDecisionResult;

  /**
   * Validate trade against all filters
   */
  validateTrade(context: EntryContext): TradeValidationResult;
}

/**
 * Event emitter interface for action completion
 * Allows handlers to emit events after action completion
 */
export interface IEventEmitter {
  /**
   * Emit event
   */
  emit(event: string, data?: any): void;

  /**
   * Subscribe to event
   */
  on(event: string, listener: (data?: any) => void): void;

  /**
   * Unsubscribe from event
   */
  off(event: string, listener: (data?: any) => void): void;
}

// ============================================================================
// MEMORY MANAGEMENT & MONITORING
// ============================================================================

/**
 * Memory usage snapshot for leak detection
 */
export interface MemorySnapshot {
  timestamp: number;
  heapUsedMB: number;
  heapTotalMB: number;
  rss: number; // resident set size
  externalMB: number;
  actionQueueSize: number;
  processedActions: number;
}

/**
 * Queue monitoring interface
 * Tracks queue health and memory usage
 */
export interface IQueueMonitor {
  /**
   * Get memory snapshot
   */
  getSnapshot(): MemorySnapshot;

  /**
   * Check for memory leaks (heuristic)
   */
  detectLeaks(): boolean;

  /**
   * Get queue stats
   */
  getStats(): {
    totalEnqueued: number;
    totalProcessed: number;
    totalFailed: number;
    averageProcessingTimeMs: number;
    currentQueueSize: number;
    memoryTrendMB: number[]; // last N measurements
  };

  /**
   * Clear monitoring data
   */
  reset(): void;
}

/**
 * Health status
 */
export interface HealthStatus {
  isHealthy: boolean;
  warnings: string[];
  memoryOK: boolean;
  queueOK: boolean;
  handlerOK: boolean;
  lastCheck: number;
}
