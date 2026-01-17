/**
 * Time Service
 * Synchronization with exchange server time
 *
 * Responsibilities:
 * - Time offset calculation and management
 * - Periodic synchronization with exchange
 * - Time conversion (local <-> server)
 * - Sync health monitoring
 */

import { LoggerService } from '../types';
import type { IExchange } from '../interfaces/IExchange';

/**
 * Sync info return type
 */
interface SyncInfo {
  offset: number;
  lastSync: Date;
  isRecent: boolean;
  nextSyncIn: number;
}

/**
 * TimeService - Synchronization with exchange server time
 */
export class TimeService {
  private logger: LoggerService;
  private syncInterval: number;
  private maxSyncFailures: number;
  private bybitService?: IExchange;

  private timeOffset: number = 0; // разница между локальным временем и временем биржи
  private lastSyncTime: number = 0;
  private criticalSyncFailures: number = 0;

  // Constants
  private static readonly TIME_SYNC_DEFAULT_MAX_FAILURES = 3;
  private static readonly TIME_SYNC_LATENCY_DIVISOR = 2;

  constructor(
    logger: LoggerService,
    syncIntervalMs: number,
    maxSyncFailures: number = TimeService.TIME_SYNC_DEFAULT_MAX_FAILURES,
  ) {
    if (!syncIntervalMs || syncIntervalMs <= 0) {
      throw new Error(
        'TimeService: syncIntervalMs is required and must be positive',
      );
    }

    this.logger = logger;
    this.syncInterval = syncIntervalMs;
    this.maxSyncFailures = maxSyncFailures;
  }

  /**
   * Set Bybit service for time synchronization
   */
  public setBybitService(bybitService: IExchange): void {
    this.bybitService = bybitService;
  }

  /**
   * Synchronize time with exchange server
   */
  public async syncWithExchange(): Promise<void> {
    if (!this.bybitService) {
      this.logger.warn('⚠️ Bybit service not set for time sync');
      return;
    }

    try {
      const localTimeBefore = Date.now();

      // Используем getServerTime из bybit-api SDK
      const serverTime = await this.bybitService.getServerTime();

      const localTimeAfter = Date.now();
      const networkLatency =
        (localTimeAfter - localTimeBefore) / TimeService.TIME_SYNC_LATENCY_DIVISOR;

      // Вычисляем разницу времени (серверное - локальное)
      if (serverTime === undefined) {
        throw new Error('CRITICAL: Server time is undefined');
      }

      this.timeOffset = serverTime - localTimeAfter;
      this.lastSyncTime = localTimeAfter;

      // Сбрасываем счетчик ошибок при успешной синхронизации
      this.criticalSyncFailures = 0;

      this.logger.info('⏰ Time synchronized with Bybit', {
        serverTime: new Date(Number(serverTime)).toISOString(),
        localTime: new Date(localTimeAfter).toISOString(),
        offset: this.timeOffset,
        latency: networkLatency,
      });
    } catch (error) {
      this.criticalSyncFailures++;

      this.logger.error('❌ Failed to sync time with exchange', {
        error,
        failureCount: this.criticalSyncFailures,
        maxAllowed: this.maxSyncFailures,
      });

      if (this.criticalSyncFailures >= this.maxSyncFailures) {
        this.logger.warn('⚠️ Time sync failed, continuing with local time', {
          failureCount: this.criticalSyncFailures,
          note: 'Demo trading can continue without precise time sync',
        });
        // Continue without throwing - demo trading is more resilient
      }

      // Не устанавливаем timeOffset = 0 - оставляем последний известный offset
      this.logger.warn(
        `⚠️ Using last known time offset: ${this.timeOffset}ms`,
      );
    }
  }

  /**
   * Ensure time is synchronized (auto-sync if needed)
   */
  public async ensureSync(): Promise<void> {
    const now = Date.now();

    // Синхронизируем если прошло больше syncInterval или еще не синхронизировались
    if (
      now - this.lastSyncTime > this.syncInterval ||
      this.lastSyncTime === 0
    ) {
      await this.syncWithExchange();
    }
  }

  /**
   * Get current timestamp synchronized with exchange
   */
  public now(): number {
    return Date.now() + this.timeOffset;
  }

  /**
   * Get Date object synchronized with exchange
   */
  public nowDate(): Date {
    return new Date(this.now());
  }

  /**
   * Convert local timestamp to server time
   */
  public toServerTime(localTimestamp: number): number {
    return localTimestamp + this.timeOffset;
  }

  /**
   * Convert server timestamp to local time
   */
  public toLocalTime(serverTimestamp: number): number {
    return serverTimestamp - this.timeOffset;
  }

  /**
   * Check if sync is recent (within sync interval)
   */
  public isSyncRecent(): boolean {
    return Date.now() - this.lastSyncTime < this.syncInterval;
  }

  /**
   * Get synchronization information
   */
  public getSyncInfo(): SyncInfo {
    const now = Date.now();
    const nextSyncIn = Math.max(
      0,
      this.syncInterval - (now - this.lastSyncTime),
    );

    return {
      offset: this.timeOffset,
      lastSync: new Date(this.lastSyncTime),
      isRecent: this.isSyncRecent(),
      nextSyncIn,
    };
  }

  /**
   * Get today's date string (for logging filenames)
   */
  public getTodayString(): string {
    const dateStr = this.nowDate().toISOString().split('T')[0];
    if (!dateStr) {
      throw new Error('Failed to get date string');
    }
    return dateStr;
  }

  /**
   * Get bot uptime (for trading statistics)
   */
  public getUptime(startTime: number): number {
    return this.now() - startTime;
  }
}
