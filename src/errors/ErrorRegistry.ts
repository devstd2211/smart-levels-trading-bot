/**
 * Global error registry for error tracking, classification, and telemetry
 *
 * Provides:
 * - Error statistics aggregation
 * - Recovery rate tracking
 * - Error trend analysis
 * - Diagnostic reporting
 *
 * Usage:
 * ```
 * // Record an error
 * ErrorRegistry.record(error, true, recoveryTimeMs);
 *
 * // Get statistics
 * const stats = ErrorRegistry.getStats();
 *
 * // Get summary
 * const summary = ErrorRegistry.getSummary();
 *
 * // Clear for testing
 * ErrorRegistry.clear();
 * ```
 */

import { TradingError, ErrorDomain, ErrorSeverity } from './BaseError';

/**
 * Error statistics for a specific error code
 */
export interface ErrorStats {
  /** Error code (e.g., 'EXCHANGE_API_ERROR') */
  code: string;

  /** Error domain */
  domain: ErrorDomain;

  /** Error severity */
  severity: ErrorSeverity;

  /** Total occurrences */
  count: number;

  /** When this error last occurred */
  lastOccurrence: number;

  /** When this error first occurred */
  firstOccurrence: number;

  /** Average recovery time in milliseconds (only for recovered errors) */
  averageRecoveryMs?: number;

  /** Number of times this error was successfully recovered */
  recoveredCount: number;

  /** Recovery rate (0-1) */
  recoveryRate: number;
}

/**
 * Summary of all tracked errors
 */
export interface ErrorSummary {
  /** Total number of errors tracked */
  totalErrors: number;

  /** Number of unique error codes */
  uniqueCodes: number;

  /** Errors grouped by domain */
  byDomain: Record<ErrorDomain, number>;

  /** Errors grouped by severity */
  bySeverity: Record<ErrorSeverity, number>;

  /** Overall recovery rate (0-1) */
  recoveryRate: number;

  /** Average recovery time across all errors */
  averageRecoveryMs: number;

  /** Top 10 most common errors */
  topErrors: Array<{ code: string; count: number }>;
}

/**
 * Global error registry
 * Tracks all errors for diagnostics and monitoring
 */
export class ErrorRegistry {
  /** Storage for error statistics */
  private static errors: Map<string, ErrorStats> = new Map();

  /** Maximum number of unique error codes to track */
  private static readonly MAX_TRACKED_ERRORS = 1000;

  /**
   * Record an error occurrence
   *
   * @param error - The trading error to record
   * @param recovered - Whether the error was recovered from
   * @param recoveryTimeMs - Time taken to recover (if recovered)
   */
  static record(
    error: TradingError,
    recovered: boolean = false,
    recoveryTimeMs: number = 0,
  ): void {
    const key = this.getErrorKey(error);

    // Create new stats entry if needed
    if (!this.errors.has(key)) {
      this.errors.set(key, {
        code: error.metadata.code,
        domain: error.metadata.domain,
        severity: error.metadata.severity,
        count: 0,
        lastOccurrence: 0,
        firstOccurrence: Date.now(),
        recoveredCount: 0,
        recoveryRate: 0,
      });
    }

    const stats = this.errors.get(key)!;

    // Update statistics
    stats.count++;
    stats.lastOccurrence = Date.now();

    if (recovered) {
      stats.recoveredCount++;
      stats.averageRecoveryMs = (
        (stats.averageRecoveryMs || 0) * (stats.recoveredCount - 1) +
        recoveryTimeMs
      ) / stats.recoveredCount;
    }

    stats.recoveryRate = stats.recoveredCount / stats.count;

    // Keep memory bounded
    if (this.errors.size > this.MAX_TRACKED_ERRORS) {
      const oldestKey = Array.from(this.errors.entries()).sort(
        ([, a], [, b]) => a.firstOccurrence - b.firstOccurrence,
      )[0][0];
      this.errors.delete(oldestKey);
    }
  }

  /**
   * Get statistics for all tracked errors
   */
  static getStats(): ErrorStats[] {
    return Array.from(this.errors.values());
  }

  /**
   * Get statistics for a specific error code
   */
  static getStatsByCode(code: string): ErrorStats | undefined {
    for (const [, stats] of this.errors) {
      if (stats.code === code) {
        return stats;
      }
    }
    return undefined;
  }

  /**
   * Get statistics by error domain
   */
  static getStatsByDomain(domain: ErrorDomain): ErrorStats[] {
    return Array.from(this.errors.values()).filter(stats => stats.domain === domain);
  }

  /**
   * Get statistics by severity
   */
  static getStatsBySeverity(severity: ErrorSeverity): ErrorStats[] {
    return Array.from(this.errors.values()).filter(
      stats => stats.severity === severity,
    );
  }

  /**
   * Get comprehensive error summary
   */
  static getSummary(): ErrorSummary {
    const stats = Array.from(this.errors.values());

    if (stats.length === 0) {
      return {
        totalErrors: 0,
        uniqueCodes: 0,
        byDomain: this.initializeDomainMap(),
        bySeverity: this.initializeSeverityMap(),
        recoveryRate: 0,
        averageRecoveryMs: 0,
        topErrors: [],
      };
    }

    // Calculate totals
    const totalErrors = stats.reduce((sum, s) => sum + s.count, 0);
    const totalRecovered = stats.reduce((sum, s) => sum + s.recoveredCount, 0);
    const totalRecoveryTime = stats.reduce((sum, s) => sum + (s.averageRecoveryMs || 0) * s.recoveredCount, 0);

    // Group by domain and severity
    const byDomain = this.initializeDomainMap();
    const bySeverity = this.initializeSeverityMap();

    stats.forEach(s => {
      byDomain[s.domain] = (byDomain[s.domain] || 0) + s.count;
      bySeverity[s.severity] = (bySeverity[s.severity] || 0) + s.count;
    });

    // Get top errors
    const topErrors = stats
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(s => ({ code: s.code, count: s.count }));

    return {
      totalErrors,
      uniqueCodes: stats.length,
      byDomain,
      bySeverity,
      recoveryRate: totalErrors > 0 ? totalRecovered / totalErrors : 0,
      averageRecoveryMs: totalRecovered > 0 ? totalRecoveryTime / totalRecovered : 0,
      topErrors,
    };
  }

  /**
   * Check if error rate is acceptable (> threshold)
   */
  static isHealthy(recoveryThreshold: number = 0.8): boolean {
    const summary = this.getSummary();
    if (summary.totalErrors === 0) {
      return true;
    }
    return summary.recoveryRate >= recoveryThreshold;
  }

  /**
   * Get critical errors (not recovered)
   */
  static getCriticalErrors(): ErrorStats[] {
    return Array.from(this.errors.values()).filter(s => s.recoveryRate < 0.5);
  }

  /**
   * Get error trend (errors in last N milliseconds)
   */
  static getRecentErrors(windowMs: number = 60000): ErrorStats[] {
    const cutoff = Date.now() - windowMs;
    return Array.from(this.errors.values()).filter(s => s.lastOccurrence > cutoff);
  }

  /**
   * Generate diagnostic report
   */
  static generateReport(): string {
    const summary = this.getSummary();

    const lines: string[] = [];
    lines.push('=== ERROR REGISTRY REPORT ===');
    lines.push(`Total Errors: ${summary.totalErrors}`);
    lines.push(`Unique Codes: ${summary.uniqueCodes}`);
    lines.push(`Recovery Rate: ${(summary.recoveryRate * 100).toFixed(2)}%`);
    lines.push(`Avg Recovery Time: ${summary.averageRecoveryMs.toFixed(2)}ms`);
    lines.push('');

    lines.push('By Domain:');
    Object.entries(summary.byDomain)
      .filter(([, count]) => count > 0)
      .forEach(([domain, count]) => {
        lines.push(`  ${domain}: ${count}`);
      });
    lines.push('');

    lines.push('By Severity:');
    Object.entries(summary.bySeverity)
      .filter(([, count]) => count > 0)
      .forEach(([severity, count]) => {
        lines.push(`  ${severity}: ${count}`);
      });
    lines.push('');

    lines.push('Top 10 Errors:');
    summary.topErrors.forEach(({ code, count }, index) => {
      lines.push(`  ${index + 1}. ${code}: ${count}`);
    });

    const criticalErrors = this.getCriticalErrors();
    if (criticalErrors.length > 0) {
      lines.push('');
      lines.push('Critical Errors (low recovery rate):');
      criticalErrors.forEach(stats => {
        lines.push(
          `  ${stats.code}: ${stats.count} (${(stats.recoveryRate * 100).toFixed(2)}% recovered)`,
        );
      });
    }

    return lines.join('\n');
  }

  /**
   * Clear all tracked errors (for testing)
   */
  static clear(): void {
    this.errors.clear();
  }

  /**
   * Get raw error statistics map
   */
  static getRaw(): Map<string, ErrorStats> {
    return new Map(this.errors);
  }

  /**
   * Generate unique key for error statistics
   */
  private static getErrorKey(error: TradingError): string {
    return `${error.metadata.code}:${error.metadata.domain}`;
  }

  /**
   * Initialize domain map with all domains
   */
  private static initializeDomainMap(): Record<ErrorDomain, number> {
    return {
      [ErrorDomain.TRADING]: 0,
      [ErrorDomain.EXCHANGE]: 0,
      [ErrorDomain.POSITION]: 0,
      [ErrorDomain.ORDER]: 0,
      [ErrorDomain.CONFIGURATION]: 0,
      [ErrorDomain.INTERNAL]: 0,
      [ErrorDomain.PERFORMANCE]: 0,
      [ErrorDomain.PERSISTENCE]: 0,
    };
  }

  /**
   * Initialize severity map with all severities
   */
  private static initializeSeverityMap(): Record<ErrorSeverity, number> {
    return {
      [ErrorSeverity.CRITICAL]: 0,
      [ErrorSeverity.HIGH]: 0,
      [ErrorSeverity.MEDIUM]: 0,
      [ErrorSeverity.LOW]: 0,
    };
  }
}
