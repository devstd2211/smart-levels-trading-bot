/**
 * Position State Machine Service
 * PHASE 4.5: Unified position state management
 *
 * Responsibilities:
 * 1. Maintain single source of truth for position state
 * 2. Persist state to disk (JSONL format) - survives bot restart
 * 3. Validate state transitions (prevent invalid sequences)
 * 4. Track advanced exit modes (pre-BE, trailing, BB trailing)
 * 5. Provide deterministic state recovery on startup
 *
 * Key Problems Solved:
 * - State fragmentation (was scattered across 3 services)
 * - State loss on restart (now persisted to disk)
 * - Invalid state transitions (now validated)
 * - Race conditions (atomic state updates)
 * - Divergence between Position.status and PositionState enum
 *
 * Integration Points:
 * - ExitOrchestrator: Use transitionState() instead of Map updates
 * - PositionLifecycleService: Initialize position state when opening
 * - TradingOrchestrator: Restore state on restart
 */

import * as fs from 'fs';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import { PositionState } from '../types/enums';
import {
  IPositionStateMachine,
  PositionStateMachineState,
  StateTransitionRequest,
  StateTransitionResult,
  VALID_STATE_TRANSITIONS,
  ACTIVE_EXIT_MODES_BY_STATE,
  PreBEMode,
  TrailingMode,
  BBTrailingMode,
} from '../types/position-state-machine.interface';
import { LoggerService } from './logger.service';

/**
 * In-memory state cache
 * Key: "symbol:positionId"
 */
type StateCache = Map<string, PositionStateMachineState>;

/**
 * Transition history entry (for debugging/auditing)
 */
interface TransitionHistoryEntry {
  request: StateTransitionRequest;
  result: StateTransitionResult;
  timestamp: number;
}

/**
 * Transition history cache
 * Key: "symbol:positionId"
 */
type TransitionHistoryCache = Map<string, TransitionHistoryEntry[]>;

export class PositionStateMachineService implements IPositionStateMachine {
  private stateCache: StateCache = new Map();
  private transitionHistory: TransitionHistoryCache = new Map();
  private stateFilePath: string;
  private historyFilePath: string;
  private initialized = false;

  constructor(private logger: LoggerService) {
    this.stateFilePath = path.join(process.cwd(), 'data', 'position-states.jsonl');
    this.historyFilePath = path.join(process.cwd(), 'data', 'position-transitions.jsonl');

    this.logger.info('📍 PositionStateMachineService created', {
      stateFile: this.stateFilePath,
      historyFile: this.historyFilePath,
    });
  }

  // ============================================================================
  // INITIALIZATION & PERSISTENCE
  // ============================================================================

  /**
   * Initialize state machine and recover states from disk
   */
  async initialize(): Promise<void> {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.stateFilePath);
      if (!fs.existsSync(dataDir)) {
        await fsPromises.mkdir(dataDir, { recursive: true });
      }

      // Load existing states from disk
      await this.loadStatesFromDisk();

      // Load transition history for debugging
      await this.loadTransitionHistoryFromDisk();

      this.initialized = true;

      this.logger.info('✅ PositionStateMachineService initialized', {
        loadedPositions: this.stateCache.size,
        stateFile: this.stateFilePath,
      });
    } catch (error) {
      this.logger.error('❌ Failed to initialize PositionStateMachineService', { error });
      throw error;
    }
  }

  /**
   * Load all states from JSONL file
   */
  private async loadStatesFromDisk(): Promise<void> {
    try {
      if (!fs.existsSync(this.stateFilePath)) {
        this.logger.info('📁 State file not found, starting fresh', {
          path: this.stateFilePath,
        });
        return;
      }

      const content = await fsPromises.readFile(this.stateFilePath, 'utf-8');
      const lines = content.trim().split('\n').filter((line: string) => line.length > 0);

      for (const line of lines) {
        try {
          const state = JSON.parse(line) as PositionStateMachineState;
          const key = this.getStateKey(state.symbol, state.positionId);
          this.stateCache.set(key, state);
        } catch (err) {
          this.logger.warn('⚠️ Failed to parse state line', { line, error: err });
        }
      }

      this.logger.info('📖 Loaded position states from disk', {
        count: this.stateCache.size,
      });
    } catch (error) {
      this.logger.error('❌ Failed to load states from disk', { error });
      throw error;
    }
  }

  /**
   * Load transition history from JSONL file (optional, for debugging)
   */
  private async loadTransitionHistoryFromDisk(): Promise<void> {
    try {
      if (!fs.existsSync(this.historyFilePath)) {
        return;
      }

      const content = await fsPromises.readFile(this.historyFilePath, 'utf-8');
      const lines = content.trim().split('\n').filter((line: string) => line.length > 0);

      // Keep last 1000 transitions per position for memory efficiency
      const maxPerPosition = 1000;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as TransitionHistoryEntry;
          const key = this.getStateKey(entry.request.symbol, entry.request.positionId);

          if (!this.transitionHistory.has(key)) {
            this.transitionHistory.set(key, []);
          }

          const history = this.transitionHistory.get(key)!;
          history.push(entry);

          // Keep only recent transitions
          if (history.length > maxPerPosition) {
            history.shift();
          }
        } catch (err) {
          this.logger.warn('⚠️ Failed to parse history line', { error: err });
        }
      }
    } catch (error) {
      this.logger.error('⚠️ Failed to load transition history', { error });
      // Don't throw - history is optional
    }
  }

  /**
   * Persist state to disk (append-only JSONL)
   */
  private async persistStateToDisk(state: PositionStateMachineState): Promise<void> {
    try {
      const dataDir = path.dirname(this.stateFilePath);
      if (!fs.existsSync(dataDir)) {
        await fsPromises.mkdir(dataDir, { recursive: true });
      }

      const line = JSON.stringify(state) + '\n';
      await fsPromises.appendFile(this.stateFilePath, line);
    } catch (error) {
      this.logger.error('❌ Failed to persist state to disk', { error });
      throw error;
    }
  }

  /**
   * Persist transition to history file
   */
  private async persistTransitionToDisk(entry: TransitionHistoryEntry): Promise<void> {
    try {
      const dataDir = path.dirname(this.historyFilePath);
      if (!fs.existsSync(dataDir)) {
        await fsPromises.mkdir(dataDir, { recursive: true });
      }

      const line = JSON.stringify(entry) + '\n';
      await fsPromises.appendFile(this.historyFilePath, line);
    } catch (error) {
      this.logger.warn('⚠️ Failed to persist transition to disk', { error });
      // Don't throw - history is optional
    }
  }

  // ============================================================================
  // STATE QUERIES
  // ============================================================================

  /**
   * Get current state for a position
   */
  getState(symbol: string, positionId: string): PositionState | null {
    const key = this.getStateKey(symbol, positionId);
    const state = this.stateCache.get(key);
    return state ? state.currentState : null;
  }

  /**
   * Get full state with metadata
   */
  getFullState(symbol: string, positionId: string): PositionStateMachineState | null {
    const key = this.getStateKey(symbol, positionId);
    return this.stateCache.get(key) || null;
  }

  /**
   * Get all states for a symbol
   */
  getStatesBySymbol(symbol: string): Map<string, PositionStateMachineState> {
    const result = new Map<string, PositionStateMachineState>();

    for (const [key, state] of this.stateCache) {
      if (state.symbol === symbol && state.currentState !== PositionState.CLOSED) {
        result.set(state.positionId, state);
      }
    }

    return result;
  }

  // ============================================================================
  // STATE TRANSITIONS
  // ============================================================================

  /**
   * Validate and execute state transition
   * Returns result indicating success and current state
   */
  transitionState(request: StateTransitionRequest): StateTransitionResult {
    const key = this.getStateKey(request.symbol, request.positionId);
    const currentStateObj = this.stateCache.get(key);
    const currentState = currentStateObj?.currentState || PositionState.OPEN;

    // Validate transition is allowed
    const validNextStates = VALID_STATE_TRANSITIONS[currentState];
    if (!validNextStates.includes(request.targetState)) {
      const error = `Invalid state transition: ${currentState} → ${request.targetState}`;
      this.logger.warn('⚠️ Invalid state transition attempted', {
        symbol: request.symbol,
        positionId: request.positionId,
        currentState,
        targetState: request.targetState,
        reason: request.reason,
      });

      return {
        allowed: false,
        currentState,
        error,
        stateChange: `${currentState} ✗ ${request.targetState}`,
      };
    }

    // Create new state object
    const newState: PositionStateMachineState = {
      symbol: request.symbol,
      positionId: request.positionId,
      currentState: request.targetState,
      stateChangedAt: Date.now(),
      createdAt: currentStateObj?.createdAt || Date.now(),
      closedAt: request.targetState === PositionState.CLOSED ? Date.now() : undefined,
      reason: request.reason,
      preBEMode: request.metadata?.preBEMode,
      trailingMode: request.metadata?.trailingMode,
      bbTrailingMode: request.metadata?.bbTrailingMode,
      // Add closure details if closing
      closureReason: request.closureReason,
      closurePrice: request.closurePrice,
      closurePnL: request.closurePnL,
    };

    // Update cache
    this.stateCache.set(key, newState);

    // Persist to disk (async, don't wait)
    this.persistStateToDisk(newState).catch(err => {
      this.logger.error('❌ Failed to persist state transition', { error: err });
    });

    // Record transition history
    const historyEntry: TransitionHistoryEntry = {
      request,
      result: {
        allowed: true,
        currentState: request.targetState,
        previousState: currentState,
        stateChange: `${currentState} → ${request.targetState}`,
      },
      timestamp: Date.now(),
    };

    if (!this.transitionHistory.has(key)) {
      this.transitionHistory.set(key, []);
    }
    this.transitionHistory.get(key)!.push(historyEntry);

    // Persist history (async, don't wait)
    this.persistTransitionToDisk(historyEntry).catch(err => {
      this.logger.warn('⚠️ Failed to persist transition history', { error: err });
    });

    this.logger.info('📍 Position state transitioned', {
      symbol: request.symbol,
      positionId: request.positionId,
      transition: `${currentState} → ${request.targetState}`,
      reason: request.reason,
    });

    return {
      allowed: true,
      currentState: request.targetState,
      previousState: currentState,
      stateChange: `${currentState} → ${request.targetState}`,
    };
  }

  /**
   * Update advanced exit modes without changing state
   */
  updateExitMode(
    symbol: string,
    positionId: string,
    mode: {
      preBEMode?: PreBEMode;
      trailingMode?: TrailingMode;
      bbTrailingMode?: BBTrailingMode;
    }
  ): void {
    const key = this.getStateKey(symbol, positionId);
    const state = this.stateCache.get(key);

    if (!state) {
      this.logger.warn('⚠️ Cannot update exit mode - position state not found', {
        symbol,
        positionId,
      });
      return;
    }

    // Update modes
    if (mode.preBEMode) {
      state.preBEMode = mode.preBEMode;
    }
    if (mode.trailingMode) {
      state.trailingMode = mode.trailingMode;
    }
    if (mode.bbTrailingMode) {
      state.bbTrailingMode = mode.bbTrailingMode;
    }

    // Persist to disk
    this.persistStateToDisk(state).catch(err => {
      this.logger.error('❌ Failed to persist exit mode update', { error: err });
    });

    this.logger.debug('📍 Position exit mode updated', {
      symbol,
      positionId,
      modes: Object.keys(mode).filter(k => mode[k as keyof typeof mode]),
    });
  }

  /**
   * Close position (terminal state)
   */
  closePosition(
    symbol: string,
    positionId: string,
    reason: string,
    closureDetails?: {
      closureReason?: 'SL_HIT' | 'TP1_HIT' | 'TP2_HIT' | 'TP3_HIT' | 'TRAILING_STOP' | 'MANUAL' | 'OTHER';
      closurePrice?: number;
      closurePnL?: number;
    }
  ): StateTransitionResult {
    return this.transitionState({
      symbol,
      positionId,
      targetState: PositionState.CLOSED,
      reason,
      closureReason: closureDetails?.closureReason,
      closurePrice: closureDetails?.closurePrice,
      closurePnL: closureDetails?.closurePnL,
    });
  }

  // ============================================================================
  // STATISTICS & DIAGNOSTICS
  // ============================================================================

  /**
   * Get statistics about state machine
   */
  getStatistics(): {
    totalPositions: number;
    byState: Record<string, number>;
    averageStateHoldTime: number;
  } {
    const byState: Record<string, number> = {
      [PositionState.OPEN]: 0,
      [PositionState.TP1_HIT]: 0,
      [PositionState.TP2_HIT]: 0,
      [PositionState.TP3_HIT]: 0,
      [PositionState.CLOSED]: 0,
    };

    let totalHoldTime = 0;
    let positionCount = 0;

    for (const state of this.stateCache.values()) {
      if (state.currentState !== PositionState.CLOSED) {
        byState[state.currentState]++;
        positionCount++;
      } else {
        byState[state.currentState]++;
      }

      // Calculate hold time for closed positions
      if (state.closedAt && state.createdAt) {
        totalHoldTime += state.closedAt - state.createdAt;
      }
    }

    return {
      totalPositions: this.stateCache.size,
      byState,
      averageStateHoldTime:
        positionCount > 0 ? totalHoldTime / this.stateCache.size : 0,
    };
  }

  /**
   * Clear state for a position
   */
  clearState(symbol: string, positionId: string): void {
    const key = this.getStateKey(symbol, positionId);
    this.stateCache.delete(key);
    this.transitionHistory.delete(key);

    this.logger.info('🗑️ Cleared position state', {
      symbol,
      positionId,
    });
  }

  /**
   * Get transition history for debugging
   */
  getTransitionHistory(symbol: string, positionId: string, limit = 10): StateTransitionRequest[] {
    const key = this.getStateKey(symbol, positionId);
    const history = this.transitionHistory.get(key) || [];

    return history
      .slice(-limit)
      .map(entry => entry.request);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private getStateKey(symbol: string, positionId: string): string {
    return `${symbol}:${positionId}`;
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get size of state cache (for testing)
   */
  getStateCount(): number {
    return this.stateCache.size;
  }
}
