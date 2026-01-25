/**
 * MTF Snapshot Gate Service
 *
 * Implements the "MTF Snapshot Gate" pattern to fix the race condition
 * between HTF bias changes and ENTRY timeframe execution.
 *
 * PROBLEM:
 * - PRIMARY (5m) candle closes → HTF bias calculated, decision cached
 * - Between PRIMARY and ENTRY (1-55 secs), HTF bias can CHANGE
 * - ENTRY (1m) closes → uses STALE cached decision
 * - Result: Trades entered against REVERSED HTF bias
 *
 * SOLUTION:
 * - Capture complete trading context as immutable snapshot at PRIMARY close
 * - At ENTRY close, validate snapshot: verify HTF bias hasn't reversed
 * - If valid: execute trade
 * - If invalid: skip entry (conservative approach)
 *
 * SNAPSHOT STRUCTURE:
 * ├─ id: Unique snapshot ID
 * ├─ timestamp: When snapshot was created (PRIMARY candle close)
 * ├─ htfBias: Captured HTF bias
 * ├─ htfBiasHash: Hash of HTF bias for detecting changes
 * ├─ signal: Entry signal with direction
 * ├─ entryRules: Risk management rules valid at PRIMARY close
 * └─ primaryCandle: The PRIMARY candle that triggered the snapshot
 *
 * VALIDATION AT ENTRY:
 * 1. Retrieve current HTF bias (live)
 * 2. Compare with snapshot's htfBias
 * 3. Check: signal direction still aligns with current bias
 * 4. If bias reversed against signal: SKIP entry
 * 5. If bias compatible: EXECUTE trade
 */

import {
  Signal,
  TrendAnalysis,
  Candle,
  LoggerService,
  SignalDirection,
  TrendBias,
} from '../types';
import * as crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Immutable snapshot of trading context at PRIMARY candle close
 * Used by ENTRY timeframe to avoid race condition with HTF bias changes
 */
export interface MTFSnapshot {
  // Identification
  id: string; // Unique snapshot ID
  timestamp: number; // When snapshot was created (PRIMARY close)
  expiresAt: number; // When snapshot becomes invalid (PRIMARY + 60s)

  // HTF Context (Frozen at PRIMARY close)
  htfBias: TrendBias; // Primary trend direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  htfBiasHash: string; // Hash of HTF bias for change detection
  htfStrength: number; // Trend strength 0-1 at snapshot time
  htfRestricted: SignalDirection[]; // Blocked directions from HTF

  // Signal (What triggered the snapshot)
  signal: Signal; // Entry signal with direction
  signalConfidence: number; // Signal confidence at PRIMARY close

  // Rules (Valid at PRIMARY close)
  maxRiskPercent?: number; // Risk management rule
  maxPositionSize?: number; // Position sizing rule
  minSignals?: number; // Minimum signals required

  // Reference Data
  primaryCandle: Candle; // The PRIMARY candle that triggered snapshot
  accountBalance?: number; // Account state at snapshot time
}

/**
 * Result of snapshot validation at ENTRY close
 */
export interface SnapshotValidationResult {
  valid: boolean; // Is snapshot still valid?
  expired: boolean; // Did snapshot expire (>TTL old)?
  biasMismatch: boolean; // Did HTF bias reverse against signal?
  reason: string; // Human-readable reason
  currentBias?: TrendBias; // Current HTF bias at validation time
  conflictingDirections?: {
    signal: SignalDirection; // Signal direction
    currentBias: TrendBias; // Current HTF bias
  };

  // FIX: Add diagnostic information for better logging
  diagnostics?: {
    snapshotId?: string; // Which snapshot was being validated
    snapshotFound: boolean; // Was snapshot in storage?
    capturedBias?: TrendBias; // What bias was captured (not hardcoded)
    ageMs?: number; // How old was snapshot
    expiresInMs?: number; // How much time left before expiry
  };
}

// ============================================================================
// MTF SNAPSHOT GATE SERVICE
// ============================================================================

export class MTFSnapshotGate {
  private snapshots = new Map<string, MTFSnapshot>();
  private activeSnapshotId: string | null = null;
  private readonly SNAPSHOT_TTL = 120000; // 120 seconds (FIX: was 60s, too short for PRIMARY→ENTRY delay)
  private readonly SNAPSHOT_CLEANUP_INTERVAL = 60000; // 60 seconds (FIX: was 30s, too aggressive)

  constructor(private logger: LoggerService) {
    // Periodically clean up expired snapshots
    setInterval(() => this.cleanupExpiredSnapshots(), this.SNAPSHOT_CLEANUP_INTERVAL);
  }

  /**
   * Create new snapshot at PRIMARY candle close
   * Freezes all trading context for safe ENTRY execution
   */
  createSnapshot(
    htfBias: TrendBias,
    htfAnalysis: TrendAnalysis,
    signal: Signal,
    primaryCandle: Candle,
    accountBalance?: number,
    rules?: {
      maxRiskPercent?: number;
      maxPositionSize?: number;
      minSignals?: number;
    }
  ): MTFSnapshot {
    const now = Date.now();
    const id = this.generateSnapshotId();

    const snapshot: MTFSnapshot = {
      id,
      timestamp: now,
      expiresAt: now + this.SNAPSHOT_TTL,

      // Freeze HTF context
      htfBias,
      htfBiasHash: this.hashBias(htfBias),
      htfStrength: htfAnalysis.strength,
      htfRestricted: htfAnalysis.restrictedDirections || [],

      // Signal that triggered snapshot
      signal,
      signalConfidence: signal.confidence,

      // Rules
      maxRiskPercent: rules?.maxRiskPercent,
      maxPositionSize: rules?.maxPositionSize,
      minSignals: rules?.minSignals,

      // Reference data
      primaryCandle,
      accountBalance,
    };

    // Store snapshot
    this.snapshots.set(id, snapshot);
    this.activeSnapshotId = id;

    this.logger.info(
      `[MTF-SNAPSHOT] Created snapshot ${id.substring(0, 8)}... ` +
      `| HTF: ${htfBias} | Signal: ${signal.direction} @ ${signal.price}`
    );

    return snapshot;
  }

  /**
   * Retrieve active snapshot for ENTRY execution
   */
  getActiveSnapshot(): MTFSnapshot | null {
    if (!this.activeSnapshotId) return null;
    return this.snapshots.get(this.activeSnapshotId) || null;
  }

  /**
   * Validate snapshot at ENTRY close
   * FIX: Now accepts explicit snapshotId to avoid race conditions with activeSnapshotId
   *
   * Checks: 1) Not expired, 2) HTF bias hasn't reversed against signal
   *
   * @param currentHTFBias Current HTF bias at ENTRY validation time
   * @param snapshotId Optional explicit snapshot ID (from pendingEntryDecision)
   *                   If provided, checks this specific snapshot instead of activeSnapshotId
   */
  validateSnapshot(currentHTFBias: TrendBias, snapshotId?: string): SnapshotValidationResult {
    // FIX: Use explicit snapshotId if provided (from pendingEntryDecision)
    // Otherwise fall back to activeSnapshotId
    const targetSnapshotId = snapshotId || this.activeSnapshotId;
    const snapshot = targetSnapshotId ? this.snapshots.get(targetSnapshotId) : null;

    if (!snapshot) {
      const now = Date.now();
      return {
        valid: false,
        expired: false,
        biasMismatch: false,
        reason: 'No active snapshot found',
        // FIX: Add diagnostic information
        diagnostics: {
          snapshotId: targetSnapshotId || 'none',
          snapshotFound: false,
          ageMs: undefined,
          expiresInMs: undefined,
        },
      };
    }

    // Check 1: Expiration
    const now = Date.now();
    const ageMs = now - snapshot.timestamp;
    const expiresInMs = snapshot.expiresAt - now;

    if (now > snapshot.expiresAt) {
      this.logger.warn(
        `[MTF-SNAPSHOT] Snapshot expired (${Math.round(ageMs / 1000)}s old, TTL=${Math.round(this.SNAPSHOT_TTL / 1000)}s)`
      );
      return {
        valid: false,
        expired: true,
        biasMismatch: false,
        reason: `Snapshot expired (${Math.round(ageMs / 1000)}s old)`,
        currentBias: currentHTFBias,
        diagnostics: {
          snapshotId: snapshot.id,
          snapshotFound: true,
          capturedBias: snapshot.htfBias,
          ageMs,
          expiresInMs,
        },
      };
    }

    // Check 2: HTF Bias mismatch
    // Determine what bias direction the signal expects
    const currentBiasAllowsSignal = this.isBiasCompatibleWithSignal(
      currentHTFBias,
      snapshot.signal.direction
    );

    if (!currentBiasAllowsSignal) {
      this.logger.warn(
        `[MTF-SNAPSHOT] Bias mismatch! Snapshot: ${snapshot.htfBias} (now ${currentHTFBias}) | ` +
        `Signal: ${snapshot.signal.direction}`
      );
      return {
        valid: false,
        expired: false,
        biasMismatch: true,
        reason: `HTF bias reversed: was ${snapshot.htfBias}, now ${currentHTFBias} ` +
                `(signal expects ${snapshot.signal.direction})`,
        currentBias: currentHTFBias,
        conflictingDirections: {
          signal: snapshot.signal.direction,
          currentBias: currentHTFBias,
        },
        diagnostics: {
          snapshotId: snapshot.id,
          snapshotFound: true,
          capturedBias: snapshot.htfBias,
          ageMs,
          expiresInMs,
        },
      };
    }

    // Snapshot is valid!
    this.logger.info(
      `[MTF-SNAPSHOT] Snapshot valid (${Math.round(ageMs / 1000)}s old, ${Math.round(expiresInMs / 1000)}s left) | ` +
      `HTF: ${currentHTFBias} (consistent) | Signal: ${snapshot.signal.direction}`
    );

    return {
      valid: true,
      expired: false,
      biasMismatch: false,
      reason: 'Snapshot valid - HTF bias consistent with signal',
      currentBias: currentHTFBias,
      diagnostics: {
        snapshotId: snapshot.id,
        snapshotFound: true,
        capturedBias: snapshot.htfBias,
        ageMs,
        expiresInMs,
      },
    };
  }

  /**
   * Clear active snapshot (call after ENTRY execution or skip)
   */
  clearActiveSnapshot(): void {
    if (this.activeSnapshotId) {
      const id = this.activeSnapshotId;
      this.snapshots.delete(id);
      this.activeSnapshotId = null;
      this.logger.debug(`[MTF-SNAPSHOT] Cleared snapshot ${id.substring(0, 8)}...`);
    }
  }

  /**
   * Check if current HTF bias is compatible with signal direction
   */
  private isBiasCompatibleWithSignal(
    bias: TrendBias,
    direction: SignalDirection
  ): boolean {
    if (bias === 'NEUTRAL') return true; // NEUTRAL allows both directions

    if (direction === SignalDirection.LONG) {
      // LONG only allowed in BULLISH
      return bias === 'BULLISH';
    } else if (direction === SignalDirection.SHORT) {
      // SHORT only allowed in BEARISH
      return bias === 'BEARISH';
    }

    return false;
  }

  /**
   * Generate unique snapshot ID
   */
  private generateSnapshotId(): string {
    return `snap_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Create hash of HTF bias for change detection
   */
  private hashBias(bias: TrendBias): string {
    return crypto
      .createHash('sha256')
      .update(bias + Date.now())
      .digest('hex')
      .substring(0, 8);
  }

  /**
   * Clean up expired snapshots
   */
  private cleanupExpiredSnapshots(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [id, snapshot] of this.snapshots.entries()) {
      if (now > snapshot.expiresAt) {
        this.snapshots.delete(id);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`[MTF-SNAPSHOT] Cleaned up ${cleanedCount} expired snapshots`);
    }
  }

  /**
   * Get snapshot count (for debugging/monitoring)
   */
  getSnapshotCount(): number {
    return this.snapshots.size;
  }

  /**
   * Get active snapshot info (for debugging)
   */
  getSnapshotDebugInfo(): { id: string; age: number; expiresIn: number } | null {
    const snapshot = this.getActiveSnapshot();
    if (!snapshot) return null;

    const now = Date.now();
    return {
      id: snapshot.id.substring(0, 8),
      age: now - snapshot.timestamp,
      expiresIn: snapshot.expiresAt - now,
    };
  }
}
