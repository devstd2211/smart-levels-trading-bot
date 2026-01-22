/**
 * STRATEGY PROCESSING TYPES
 *
 * Type definitions for parallel strategy processing.
 * Supports concurrent execution via worker pools.
 *
 * Phase 12: Parallel Strategy Processing
 */

import { Candle } from './core';

/**
 * Processing job priority
 */
export enum ProcessingPriority {
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',
  LOW = 'LOW',
}

/**
 * Strategy processing job
 */
export interface StrategyProcessingJob {
  /**
   * Unique job identifier
   */
  jobId: string;

  /**
   * Strategy identifier
   */
  strategyId: string;

  /**
   * Candle to process
   */
  candle: Candle;

  /**
   * Job creation timestamp
   */
  timestamp: number;

  /**
   * Processing priority
   * @default NORMAL
   */
  priority: ProcessingPriority;

  /**
   * Maximum time to process (ms)
   * @default 5000
   */
  timeoutMs?: number;

  /**
   * Optional retry count
   * @default 0
   */
  retryCount?: number;
}

/**
 * Strategy processing result
 */
export interface StrategyProcessingResult {
  /**
   * Job identifier (matches StrategyProcessingJob.jobId)
   */
  jobId: string;

  /**
   * Strategy identifier (matches StrategyProcessingJob.strategyId)
   */
  strategyId: string;

  /**
   * Whether processing succeeded
   */
  success: boolean;

  /**
   * Processing result (if successful)
   */
  result?: any;

  /**
   * Error message (if failed)
   */
  error?: string;

  /**
   * Stack trace (if error)
   */
  stackTrace?: string;

  /**
   * Time spent processing (ms)
   */
  processingTime: number;

  /**
   * When processing started
   */
  startedAt: number;

  /**
   * When processing completed
   */
  completedAt: number;
}

/**
 * Worker pool statistics
 */
export interface StrategyProcessingStats {
  /**
   * Total jobs submitted
   */
  totalJobs: number;

  /**
   * Successful jobs
   */
  successfulJobs: number;

  /**
   * Failed jobs
   */
  failedJobs: number;

  /**
   * Average processing time (ms)
   */
  averageProcessingTime: number;

  /**
   * Min processing time (ms)
   */
  minProcessingTime: number;

  /**
   * Max processing time (ms)
   */
  maxProcessingTime: number;

  /**
   * Jobs currently in queue
   */
  jobsInQueue: number;

  /**
   * Active workers
   */
  activeWorkers: number;

  /**
   * Idle workers
   */
  idleWorkers: number;

  /**
   * Total workers
   */
  totalWorkers: number;

  /**
   * Success rate (0-1)
   */
  successRate: number;

  /**
   * When stats were generated
   */
  generatedAt: number;
}

/**
 * Worker pool configuration
 */
export interface StrategyProcessingPoolConfig {
  /**
   * Number of worker threads
   * @default 4
   */
  workerPoolSize?: number;

  /**
   * Maximum queue size
   * @default 100
   */
  queueSize?: number;

  /**
   * Default job timeout (ms)
   * @default 5000
   */
  defaultTimeoutMs?: number;

  /**
   * Enable metrics collection
   * @default true
   */
  metricsEnabled?: boolean;

  /**
   * Enable job timeout handling
   * @default true
   */
  timeoutEnabled?: boolean;

  /**
   * Max retries per job
   * @default 1
   */
  maxRetries?: number;
}

/**
 * Worker pool status
 */
export interface StrategyProcessingPoolStatus {
  /**
   * Is pool running
   */
  isRunning: boolean;

  /**
   * Total workers
   */
  totalWorkers: number;

  /**
   * Active workers
   */
  activeWorkers: number;

  /**
   * Queue length
   */
  queueLength: number;

  /**
   * Total processed
   */
  totalProcessed: number;

  /**
   * Total failed
   */
  totalFailed: number;

  /**
   * Uptime (ms)
   */
  uptime: number;
}

/**
 * Worker health check
 */
export interface WorkerHealthStatus {
  /**
   * Worker ID
   */
  workerId: number;

  /**
   * Is worker alive
   */
  isAlive: boolean;

  /**
   * Jobs processed by this worker
   */
  jobsProcessed: number;

  /**
   * Last job completion time
   */
  lastJobTime: number | null;

  /**
   * Error count
   */
  errorCount: number;

  /**
   * Current job (if any)
   */
  currentJob?: string;
}

/**
 * Parallel processing configuration
 */
export interface ParallelProcessingConfig {
  /**
   * Enable parallel processing
   * @default true
   */
  enabled: boolean;

  /**
   * Worker pool configuration
   */
  poolConfig: StrategyProcessingPoolConfig;

  /**
   * Default job priority
   * @default NORMAL
   */
  defaultPriority?: ProcessingPriority;

  /**
   * Enable priority queue
   * @default true
   */
  enablePriorityQueue?: boolean;

  /**
   * Load balancing strategy
   * @default 'ROUND_ROBIN'
   */
  loadBalancingStrategy?: 'ROUND_ROBIN' | 'LEAST_LOADED' | 'RANDOM';
}
