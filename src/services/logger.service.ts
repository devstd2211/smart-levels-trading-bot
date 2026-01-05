/**
 * Logger Service
 *
 * Centralized logging service with file and console support
 * Features:
 * - File logging with daily rotation
 * - Console logging with colors
 * - Async queue-based file writes
 * - 7-day log cleanup
 *
 * RULE: NO fallbacks, FAIL FAST
 */

import { existsSync, mkdirSync } from 'fs';
import { appendFile } from 'fs/promises';
import { join } from 'path';
import { LogLevel, LogEntry } from '../types';
import { TIME_INTERVALS } from '../constants/technical.constants';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

interface WriteQueueItem {
  filePath: string;
  content: string;
}

export class LoggerService {
  private readonly minLevel: LogLevel;
  private readonly logDir: string;
  private readonly logToFile: boolean;
  private logs: LogEntry[] = [];
  private writeQueue: WriteQueueItem[] = [];
  private isProcessingQueue: boolean = false;
  private enableConsoleOutput: boolean = true; // Can be disabled for dashboard

  constructor(
    minLevel: LogLevel = LogLevel.INFO,
    logDir: string = './logs',
    logToFile: boolean = true,
  ) {
    this.minLevel = minLevel;
    this.logDir = logDir;
    this.logToFile = logToFile;

    if (this.logToFile) {
      this.ensureLogDirectory();
      // Start cleanup in background
      void this.cleanOldLogs();
    }
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDirectory(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
      console.log(`📁 Created log directory: ${this.logDir}`);
    }
  }

  /**
   * Clean old log files (>7 days)
   */
  private async cleanOldLogs(): Promise<void> {
    try {
      const { readdir, stat, unlink } = await import('fs/promises');
      const files = await readdir(this.logDir);
      const now = Date.now();
      const maxAge = TIME_INTERVALS.MS_PER_7_DAYS; // 7 days in milliseconds

      for (const file of files) {
        if (!file.endsWith('.log')) {
          continue;
        }

        try {
          const filePath = join(this.logDir, file);
          const stats = await stat(filePath);
          const age = now - stats.mtime.getTime();

          if (age > maxAge) {
            await unlink(filePath);
            const daysOld = Math.floor(age / TIME_INTERVALS.MS_PER_DAY);
            console.log(`🗑️ Deleted old log file: ${file} (${daysOld} days old)`);
          }
        } catch (fileError) {
          console.error(`Failed to process log file ${file}:`, fileError);
        }
      }
    } catch (error) {
      console.error('Failed to clean old log files:', error);
    }
  }

  /**
   * Get today's date string for filename
   */
  private getTodayString(): string {
    const today = new Date().toISOString().split('T')[0];
    if (!today) {
      throw new Error('Failed to get date string');
    }
    return today;
  }

  /**
   * Format log entry as string
   */
  private formatLogEntry(entry: LogEntry): string {
    const timestamp = new Date(entry.timestamp).toISOString();
    const contextStr = entry.context ? ` | ${JSON.stringify(entry.context)}` : '';
    return `[${timestamp}] [${entry.level}] ${entry.message}${contextStr}`;
  }

  /**
   * Write log entry to file (async queue)
   */
  private writeToFile(entry: LogEntry): void {
    if (!this.logToFile) {
      return;
    }

    const today = this.getTodayString();
    const fileName = `trading-bot-${today}.log`;
    const filePath = join(this.logDir, fileName);
    const logLine = this.formatLogEntry(entry) + '\n';

    this.writeQueue.push({ filePath, content: logLine });
    void this.processWriteQueue();
  }

  /**
   * Process write queue asynchronously
   */
  private async processWriteQueue(): Promise<void> {
    if (this.isProcessingQueue || this.writeQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      // Group writes by file for efficiency
      const fileGroups = new Map<string, string[]>();

      // Process up to 10 entries at a time
      const batchSize = Math.min(10, this.writeQueue.length);
      const batch = this.writeQueue.splice(0, batchSize);

      for (const { filePath, content } of batch) {
        if (!fileGroups.has(filePath)) {
          fileGroups.set(filePath, []);
        }
        fileGroups.get(filePath)!.push(content);
      }

      // Write all groups in parallel
      const writePromises = Array.from(fileGroups.entries()).map(
        async ([filePath, contents]) => {
          try {
            const combinedContent = contents.join('');
            await appendFile(filePath, combinedContent);
          } catch (error) {
            console.error(`Failed to write to log file ${filePath}:`, error);
          }
        },
      );

      await Promise.all(writePromises);
    } finally {
      this.isProcessingQueue = false;

      // Process remaining queue
      if (this.writeQueue.length > 0) {
        setImmediate(() => void this.processWriteQueue());
      }
    }
  }

  /**
   * Write log entry to console with colors
   */
  private writeToConsole(entry: LogEntry): void {
    // Skip console output if disabled (for dashboard mode)
    if (!this.enableConsoleOutput) {
      return;
    }

    const formattedMessage = this.formatLogEntry(entry);

    switch (entry.level) {
    case LogLevel.DEBUG:
      console.debug('\x1b[36m%s\x1b[0m', formattedMessage); // Cyan
      break;
    case LogLevel.INFO:
      console.info('\x1b[32m%s\x1b[0m', formattedMessage); // Green
      break;
    case LogLevel.WARN:
      console.warn('\x1b[33m%s\x1b[0m', formattedMessage); // Yellow
      break;
    case LogLevel.ERROR:
      console.error('\x1b[31m%s\x1b[0m', formattedMessage); // Red
      break;
    }
  }

  /**
   * Disable console output (useful for dashboard mode)
   */
  public disableConsoleOutput(): void {
    this.enableConsoleOutput = false;
  }

  /**
   * Enable console output
   */
  public enableConsoleOutputMode(): void {
    this.enableConsoleOutput = true;
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log error message
   */
  error(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, context);
  }

  /**
   * Internal log method
   */
  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const levelPriority = LOG_LEVEL_PRIORITY[level];
    const minPriority = LOG_LEVEL_PRIORITY[this.minLevel];

    if (levelPriority < minPriority) {
      return; // Skip logs below minimum level
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      context,
    };

    this.logs.push(entry);
    this.writeToConsole(entry);
    this.writeToFile(entry);
  }

  /**
   * Get all logs
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs by level
   */
  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter((log) => log.level === level);
  }

  /**
   * Clear logs
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Get current log file path
   */
  getLogFilePath(): string | null {
    if (!this.logToFile) {
      return null;
    }
    const today = this.getTodayString();
    const fileName = `trading-bot-${today}.log`;
    return join(this.logDir, fileName);
  }
}
