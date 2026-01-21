/**
 * Phase 9: Trading Lifecycle Manager Service
 *
 * Orchestrates the full position lifecycle with:
 * - Position timeout detection and handling
 * - Holding time tracking from open → close
 * - Emergency close triggers
 * - State validation before transitions
 *
 * Subscribes to EventBus events:
 * - position-opened: Track new positions
 * - position-closed: Stop tracking closed positions
 *
 * Emits EventBus events:
 * - position-timeout-warning: Position approaching timeout
 * - position-timeout-critical: Position at timeout threshold
 * - position-timeout-triggered: Emergency close initiated
 */

import { BotEventBus } from './event-bus';
import { LoggerService, PositionSide } from '../types';
import { ActionType } from '../types/architecture.types';
import {
  PositionLifecycleConfig,
  TrackedPosition,
  TimeoutCheckResult,
  TimeoutAlert,
  EmergencyCloseRequest,
  EmergencyCloseReason,
  PositionLifecycleState,
  ITradingLifecycleManager,
  LiveTradingEventType,
  PositionTimeoutWarningEvent,
} from '../types/live-trading.types';
import { ActionQueueService } from './action-queue.service';
import { Position } from '../types/core';

/**
 * TradingLifecycleManager: Orchestrates position lifecycle with timeout detection
 *
 * Responsibilities:
 * 1. Track all open positions with timing metadata
 * 2. Detect positions approaching/exceeding timeout thresholds
 * 3. Emit warnings before emergency close
 * 4. Execute emergency closes via ActionQueue
 * 5. Validate state transitions
 *
 * Architecture:
 * - Subscribes to position lifecycle events
 * - Maintains in-memory map of tracked positions
 * - Checks timeouts on each candle or explicit call
 * - Delegates emergency close execution to ActionQueue
 */
export class TradingLifecycleManager implements ITradingLifecycleManager {
  private config: PositionLifecycleConfig;
  private trackedPositions: Map<string, TrackedPosition>;
  private warningEmittedFor: Set<string>; // Track which positions we've warned about
  private logger: LoggerService;
  private eventBus: BotEventBus;
  private actionQueue: ActionQueueService;

  // State machine: Valid transitions for position lifecycle
  private readonly VALID_STATE_TRANSITIONS: Map<PositionLifecycleState, PositionLifecycleState[]> = new Map([
    [PositionLifecycleState.OPEN, [PositionLifecycleState.WARNING, PositionLifecycleState.CLOSING, PositionLifecycleState.CLOSED]],
    [PositionLifecycleState.WARNING, [PositionLifecycleState.CRITICAL, PositionLifecycleState.CLOSING, PositionLifecycleState.CLOSED]],
    [PositionLifecycleState.CRITICAL, [PositionLifecycleState.CLOSING, PositionLifecycleState.CLOSED]],
    [PositionLifecycleState.CLOSING, [PositionLifecycleState.CLOSED]],
    [PositionLifecycleState.CLOSED, []],
  ]);

  constructor(config: PositionLifecycleConfig, logger: LoggerService, eventBus: BotEventBus, actionQueue: ActionQueueService) {
    this.config = config;
    this.logger = logger;
    this.eventBus = eventBus;
    this.actionQueue = actionQueue;
    this.trackedPositions = new Map();
    this.warningEmittedFor = new Set();

    this.initializeEventSubscriptions();
  }

  /**
   * Subscribe to position lifecycle events
   */
  private initializeEventSubscriptions(): void {
    // Listen for position opens
    this.eventBus.subscribe('position-opened', (event: any) => {
      const position: Position = event.position;
      if (position && position.id) {
        this.trackPosition({
          positionId: position.id,
          symbol: position.symbol,
          direction: position.side as 'LONG' | 'SHORT',
          entryPrice: position.entryPrice,
          entryTime: position.openedAt || Date.now(),
          quantity: position.quantity,
          totalExposureUsdt: position.marginUsed || position.quantity * position.entryPrice,
          state: PositionLifecycleState.OPEN,
          lastUpdateTime: Date.now(),
        });
        this.logger.info(`[TradingLifecycleManager] Tracking position: ${position.id} (${position.symbol})`);
      }
    });

    // Listen for position closes
    this.eventBus.subscribe('position-closed', (event: any) => {
      const positionId = event.positionId || event.position?.id;
      if (positionId) {
        this.untrackPosition(positionId);
        this.logger.info(`[TradingLifecycleManager] Untracking closed position: ${positionId}`);
      }
    });
  }

  /**
   * Track a position for timeout monitoring
   */
  public trackPosition(position: TrackedPosition): void {
    if (!position.positionId) {
      this.logger.warn('[TradingLifecycleManager] Cannot track position without ID');
      return;
    }

    this.trackedPositions.set(position.positionId, {
      ...position,
      lastUpdateTime: Date.now(),
    });

    this.logger.debug(`[TradingLifecycleManager] Tracking position: ${position.positionId}`, {
      symbol: position.symbol,
      quantity: position.quantity,
      maxHoldingMinutes: this.config.maxHoldingTimeMinutes,
    });
  }

  /**
   * Stop tracking a closed position
   */
  public untrackPosition(positionId: string): void {
    const existed = this.trackedPositions.delete(positionId);
    if (existed) {
      this.warningEmittedFor.delete(positionId);
      this.logger.debug(`[TradingLifecycleManager] Untracked position: ${positionId}`);
    }
  }

  /**
   * Check all tracked positions for timeout conditions
   * Returns comprehensive timeout detection result
   */
  public async checkPositionTimeouts(): Promise<TimeoutCheckResult> {
    const now = Date.now();
    const alerts: TimeoutAlert[] = [];
    let anyWarnings = false;
    let anyCritical = false;

    for (const [positionId, position] of this.trackedPositions.entries()) {
      const holdingTimeMs = now - position.entryTime;
      const holdingTimeMinutes = holdingTimeMs / 1000 / 60;

      const maxHoldingMinutes = this.config.maxHoldingTimeMinutes;
      const warningThresholdMinutes = this.config.warningThresholdMinutes;

      let newState = position.state;
      let isWarning = false;
      let isCritical = false;

      // Check timeout thresholds
      if (holdingTimeMinutes >= maxHoldingMinutes) {
        // Position has exceeded maximum holding time
        newState = PositionLifecycleState.CRITICAL;
        isCritical = true;
        anyCritical = true;

        // Emit critical alert
        const criticalAlert: TimeoutAlert = {
          positionId: position.positionId,
          symbol: position.symbol,
          holdingTimeMinutes: Math.round(holdingTimeMinutes),
          state: newState,
          minutesUntilTimeout: Math.round(holdingTimeMinutes - maxHoldingMinutes) * -1,
        };
        alerts.push(criticalAlert);

        this.logger.warn(`[TradingLifecycleManager] CRITICAL TIMEOUT: ${position.symbol} position has exceeded max holding time (${holdingTimeMinutes.toFixed(1)} minutes)`);

        // Trigger emergency close if enabled
        if (this.config.enableAutomaticTimeout) {
          await this.handlePositionTimeout(position);
        }
      } else if (holdingTimeMinutes >= warningThresholdMinutes) {
        // Position is approaching timeout threshold
        newState = PositionLifecycleState.WARNING;
        isWarning = true;
        anyWarnings = true;

        // Emit warning alert only once per position
        if (!this.warningEmittedFor.has(positionId)) {
          const warningAlert: TimeoutAlert = {
            positionId: position.positionId,
            symbol: position.symbol,
            holdingTimeMinutes: Math.round(holdingTimeMinutes),
            state: newState,
            minutesUntilTimeout: Math.round(maxHoldingMinutes - holdingTimeMinutes),
          };
          alerts.push(warningAlert);

          // Emit warning event
          this.eventBus.publishSync({
            type: LiveTradingEventType.POSITION_TIMEOUT_WARNING,
            data: {
              positionId: position.positionId,
              symbol: position.symbol,
              holdingTimeMinutes: Math.round(holdingTimeMinutes),
              minutesUntilTimeout: Math.round(maxHoldingMinutes - holdingTimeMinutes),
            } as PositionTimeoutWarningEvent,
            timestamp: now,
          });

          this.warningEmittedFor.add(positionId);
          this.logger.warn(`[TradingLifecycleManager] WARNING TIMEOUT: ${position.symbol} position approaching max holding time (${holdingTimeMinutes.toFixed(1)} minutes)`);
        }
      } else {
        // Position is safe
        newState = PositionLifecycleState.OPEN;
      }

      // Update position state if changed
      if (newState !== position.state) {
        if (this.validateStateTransition(position.state, newState)) {
          position.state = newState;
          position.lastUpdateTime = now;
        }
      }
    }

    return {
      positions: alerts,
      anyWarnings,
      anyCritical,
    };
  }

  /**
   * Handle a position timeout by initiating emergency close
   */
  public async handlePositionTimeout(position: TrackedPosition): Promise<void> {
    this.logger.warn(`[TradingLifecycleManager] Initiating emergency close for ${position.symbol} position: ${position.positionId}`);

    // Create emergency close request
    const request: EmergencyCloseRequest = {
      positionId: position.positionId,
      reason: EmergencyCloseReason.POSITION_TIMEOUT,
      priority: 'CRITICAL',
      details: {
        holdingTimeMinutes: (Date.now() - position.entryTime) / 1000 / 60,
        maxHoldingMinutes: this.config.maxHoldingTimeMinutes,
        symbol: position.symbol,
        quantity: position.quantity,
      },
    };

    // Delegate to triggerEmergencyClose
    await this.triggerEmergencyClose(request);
  }

  /**
   * Trigger emergency close via ActionQueue
   * Closes entire position (100%)
   */
  public async triggerEmergencyClose(request: EmergencyCloseRequest): Promise<void> {
    const position = this.trackedPositions.get(request.positionId);
    if (!position) {
      this.logger.warn(`[TradingLifecycleManager] Position not found for emergency close: ${request.positionId}`);
      return;
    }

    try {
      // Update position state to CLOSING
      if (this.validateStateTransition(position.state, PositionLifecycleState.CLOSING)) {
        position.state = PositionLifecycleState.CLOSING;
        position.lastUpdateTime = Date.now();
      }

      // Emit emergency close event
      this.eventBus.publishSync({
        type: LiveTradingEventType.POSITION_TIMEOUT_TRIGGERED,
        data: {
          positionId: request.positionId,
          reason: request.reason,
          priority: request.priority,
          details: request.details,
        },
        timestamp: Date.now(),
      });

      // Enqueue close action via ActionQueue
      // Close entire position (100%)
      const closeAction = {
        id: `action-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        type: ActionType.CLOSE_PERCENT,
        timestamp: Date.now(),
        priority: 'HIGH' as const,
        metadata: {
          positionId: request.positionId,
          percent: 100,
          reason: request.reason,
        },
      };
      this.actionQueue.enqueue(closeAction as any);

      this.logger.info(`[TradingLifecycleManager] Emergency close queued for ${position.symbol} (${request.reason})`);
    } catch (error) {
      this.logger.error(`[TradingLifecycleManager] Error triggering emergency close: ${error}`, {
        positionId: request.positionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Validate state transition according to state machine
   */
  public validateStateTransition(from: PositionLifecycleState, to: PositionLifecycleState): boolean {
    const allowedTransitions = this.VALID_STATE_TRANSITIONS.get(from);
    if (!allowedTransitions) {
      this.logger.warn(`[TradingLifecycleManager] Unknown state: ${from}`);
      return false;
    }

    const isValid = allowedTransitions.includes(to);
    if (!isValid) {
      this.logger.warn(`[TradingLifecycleManager] Invalid state transition: ${from} → ${to}`);
    }
    return isValid;
  }

  /**
   * Get all currently tracked positions
   */
  public getTrackedPositions(): TrackedPosition[] {
    return Array.from(this.trackedPositions.values());
  }

  /**
   * Get a specific tracked position
   */
  public getTrackedPosition(positionId: string): TrackedPosition | undefined {
    return this.trackedPositions.get(positionId);
  }

  /**
   * Get count of tracked positions
   */
  public getTrackedPositionCount(): number {
    return this.trackedPositions.size;
  }

  /**
   * Clear all tracked positions (used during shutdown)
   */
  public clearAllTrackedPositions(): void {
    this.trackedPositions.clear();
    this.warningEmittedFor.clear();
    this.logger.info('[TradingLifecycleManager] Cleared all tracked positions');
  }

  /**
   * Get lifecycle statistics
   */
  public getStatistics(): {
    totalTracked: number;
    byState: Record<string, number>;
    earliestOpenTime: number | null;
    averageHoldingMinutes: number;
  } {
    const now = Date.now();
    const positions = Array.from(this.trackedPositions.values());

    const byState: Record<string, number> = {
      [PositionLifecycleState.OPEN]: 0,
      [PositionLifecycleState.WARNING]: 0,
      [PositionLifecycleState.CRITICAL]: 0,
      [PositionLifecycleState.CLOSING]: 0,
      [PositionLifecycleState.CLOSED]: 0,
    };

    for (const pos of positions) {
      byState[pos.state]++;
    }

    const holdingTimes = positions.map((p) => (now - p.entryTime) / 1000 / 60);
    const averageHoldingMinutes = holdingTimes.length > 0 ? holdingTimes.reduce((a, b) => a + b, 0) / holdingTimes.length : 0;

    const earliestOpenTime = positions.length > 0 ? Math.min(...positions.map((p) => p.entryTime)) : null;

    return {
      totalTracked: positions.length,
      byState,
      earliestOpenTime,
      averageHoldingMinutes: Math.round(averageHoldingMinutes * 10) / 10,
    };
  }
}
