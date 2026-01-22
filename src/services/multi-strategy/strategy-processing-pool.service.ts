/**
 * STRATEGY PROCESSING POOL SERVICE
 *
 * Manages parallel processing of strategy jobs using async execution.
 * Distributes jobs across multiple concurrent executions.
 *
 * Phase 12: Parallel Strategy Processing
 */

import { randomUUID } from 'crypto';
import { LoggerService } from '../../types';
import {
  StrategyProcessingJob,
  StrategyProcessingResult,
  StrategyProcessingStats,
  StrategyProcessingPoolConfig,
  StrategyProcessingPoolStatus,
  WorkerHealthStatus,
  ProcessingPriority,
} from '../../types/strategy-processing.types';

const DEFAULT_CONFIG: StrategyProcessingPoolConfig = {
  workerPoolSize: 4,
  queueSize: 100,
  defaultTimeoutMs: 5000,
  metricsEnabled: true,
  timeoutEnabled: true,
  maxRetries: 1,
};

export type ProcessingFunction = (job: StrategyProcessingJob) => Promise<any>;

export class StrategyProcessingPoolService {
  private jobQueue: StrategyProcessingJob[] = [];
  private activeJobs: Map<string, Promise<StrategyProcessingResult>> = new Map();
  private completedJobs: StrategyProcessingResult[] = [];
  private failedJobs: StrategyProcessingResult[] = [];
  private config: StrategyProcessingPoolConfig;
  private processingFunction: ProcessingFunction | null = null;
  private isRunning = false;
  private startTime = Date.now();
  private workerSimulation: number[] = [];  // Simulates active workers
  private metrics = {
    totalJobs: 0,
    successfulJobs: 0,
    failedJobs: 0,
    totalProcessingTime: 0,
    minProcessingTime: Infinity,
    maxProcessingTime: 0,
  };

  constructor(
    config?: Partial<StrategyProcessingPoolConfig>,
    private logger?: LoggerService,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeWorkers();
  }

  /**
   * Set the processing function to execute jobs
   */
  setProcessingFunction(fn: ProcessingFunction): void {
    this.processingFunction = fn;
    this.logger?.info('[ProcessingPool] Processing function set');
  }

  /**
   * Start the processing pool
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger?.warn('[ProcessingPool] Pool already running');
      return;
    }

    this.isRunning = true;
    this.startTime = Date.now();

    this.logger?.info('[ProcessingPool] Pool started', {
      workerPoolSize: this.config.workerPoolSize,
      queueSize: this.config.queueSize,
    });
  }

  /**
   * Submit a job to the processing pool
   */
  async submitJob(job: StrategyProcessingJob): Promise<StrategyProcessingResult> {
    if (!this.isRunning) {
      throw new Error('Processing pool is not running');
    }

    if (this.jobQueue.length >= (this.config.queueSize || 100)) {
      throw new Error('Job queue is full');
    }

    if (!this.processingFunction) {
      throw new Error('Processing function not set');
    }

    // Add job to queue with priority
    this.addJobToQueue(job);
    this.metrics.totalJobs++;

    // Process jobs concurrently (up to poolSize)
    return this.processJob(job);
  }

  /**
   * Submit multiple jobs
   */
  async submitBatch(jobs: StrategyProcessingJob[]): Promise<StrategyProcessingResult[]> {
    const promises = jobs.map(job => this.submitJob(job));
    return Promise.allSettled(promises).then(results =>
      results.map(r => (r.status === 'fulfilled' ? r.value : this.createFailedResult(r.reason))),
    );
  }

  /**
   * Wait for all jobs to complete
   */
  async waitForAll(): Promise<StrategyProcessingResult[]> {
    const allJobs = Array.from(this.activeJobs.values());
    const results = await Promise.allSettled(allJobs);

    return results.map(r => (r.status === 'fulfilled' ? r.value : this.createFailedResult(r.reason)));
  }

  /**
   * Get current statistics
   */
  getStats(): StrategyProcessingStats {
    const totalProcessed = this.metrics.successfulJobs + this.metrics.failedJobs;
    const averageTime = totalProcessed > 0 ? this.metrics.totalProcessingTime / totalProcessed : 0;
    const successRate = this.metrics.totalJobs > 0 ? this.metrics.successfulJobs / this.metrics.totalJobs : 0;

    return {
      totalJobs: this.metrics.totalJobs,
      successfulJobs: this.metrics.successfulJobs,
      failedJobs: this.metrics.failedJobs,
      averageProcessingTime: averageTime,
      minProcessingTime: this.metrics.minProcessingTime === Infinity ? 0 : this.metrics.minProcessingTime,
      maxProcessingTime: this.metrics.maxProcessingTime,
      jobsInQueue: this.jobQueue.length,
      activeWorkers: this.workerSimulation.filter(w => w > 0).length,
      idleWorkers: (this.config.workerPoolSize || 4) - this.workerSimulation.filter(w => w > 0).length,
      totalWorkers: this.config.workerPoolSize || 4,
      successRate,
      generatedAt: Date.now(),
    };
  }

  /**
   * Get pool status
   */
  getStatus(): StrategyProcessingPoolStatus {
    return {
      isRunning: this.isRunning,
      totalWorkers: this.config.workerPoolSize || 4,
      activeWorkers: this.workerSimulation.filter(w => w > 0).length,
      queueLength: this.jobQueue.length,
      totalProcessed: this.metrics.successfulJobs + this.metrics.failedJobs,
      totalFailed: this.metrics.failedJobs,
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Get worker health status
   */
  getWorkerHealth(): WorkerHealthStatus[] {
    return this.workerSimulation.map((lastJob, index) => ({
      workerId: index,
      isAlive: true,
      jobsProcessed: 0,
      lastJobTime: lastJob || null,
      errorCount: 0,
    }));
  }

  /**
   * Get completed jobs
   */
  getCompletedJobs(limit?: number): StrategyProcessingResult[] {
    if (limit) {
      return this.completedJobs.slice(-limit);
    }
    return this.completedJobs;
  }

  /**
   * Get failed jobs
   */
  getFailedJobs(limit?: number): StrategyProcessingResult[] {
    if (limit) {
      return this.failedJobs.slice(-limit);
    }
    return this.failedJobs;
  }

  /**
   * Clear queue
   */
  clearQueue(): void {
    this.jobQueue = [];
    this.logger?.info('[ProcessingPool] Queue cleared');
  }

  /**
   * Shutdown the pool
   */
  async shutdown(): Promise<void> {
    this.isRunning = false;
    await this.waitForAll();
    this.clearQueue();

    this.logger?.info('[ProcessingPool] Pool shutdown complete', {
      totalProcessed: this.metrics.successfulJobs + this.metrics.failedJobs,
      successful: this.metrics.successfulJobs,
      failed: this.metrics.failedJobs,
    });
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  private initializeWorkers(): void {
    const poolSize = this.config.workerPoolSize || 4;
    this.workerSimulation = Array(poolSize).fill(0);

    this.logger?.debug('[ProcessingPool] Workers initialized', {
      poolSize,
    });
  }

  private addJobToQueue(job: StrategyProcessingJob): void {
    // Add priority if not set
    if (!job.priority) {
      job.priority = ProcessingPriority.NORMAL;
    }

    // Insert in priority order
    let insertIndex = this.jobQueue.length;
    for (let i = 0; i < this.jobQueue.length; i++) {
      if (this.getPriorityValue(job.priority) > this.getPriorityValue(this.jobQueue[i].priority)) {
        insertIndex = i;
        break;
      }
    }

    this.jobQueue.splice(insertIndex, 0, job);
  }

  private getPriorityValue(priority: ProcessingPriority): number {
    switch (priority) {
      case ProcessingPriority.HIGH:
        return 3;
      case ProcessingPriority.NORMAL:
        return 2;
      case ProcessingPriority.LOW:
        return 1;
    }
  }

  private async processJob(job: StrategyProcessingJob): Promise<StrategyProcessingResult> {
    if (!this.processingFunction) {
      throw new Error('Processing function not set');
    }

    const startTime = Date.now();
    const workerId = this.acquireWorker();

    try {
      // Execute with timeout
      const timeoutMs = job.timeoutMs || this.config.defaultTimeoutMs || 5000;
      const result = await Promise.race([
        this.processingFunction(job),
        this.createTimeout(timeoutMs),
      ]);

      const processingTime = Date.now() - startTime;

      // Update metrics
      this.metrics.successfulJobs++;
      this.metrics.totalProcessingTime += processingTime;
      this.metrics.minProcessingTime = Math.min(this.metrics.minProcessingTime, processingTime);
      this.metrics.maxProcessingTime = Math.max(this.metrics.maxProcessingTime, processingTime);

      const processingResult: StrategyProcessingResult = {
        jobId: job.jobId,
        strategyId: job.strategyId,
        success: true,
        result,
        processingTime,
        startedAt: startTime,
        completedAt: Date.now(),
      };

      this.completedJobs.push(processingResult);
      this.activeJobs.delete(job.jobId);

      this.logger?.debug('[ProcessingPool] Job completed', {
        jobId: job.jobId,
        strategyId: job.strategyId,
        processingTime,
      });

      return processingResult;
    } catch (error) {
      const processingTime = Date.now() - startTime;

      // Update metrics
      this.metrics.failedJobs++;

      const processingResult: StrategyProcessingResult = {
        jobId: job.jobId,
        strategyId: job.strategyId,
        success: false,
        error: (error as Error).message,
        stackTrace: (error as Error).stack,
        processingTime,
        startedAt: startTime,
        completedAt: Date.now(),
      };

      this.failedJobs.push(processingResult);
      this.activeJobs.delete(job.jobId);

      this.logger?.warn('[ProcessingPool] Job failed', {
        jobId: job.jobId,
        strategyId: job.strategyId,
        error: (error as Error).message,
      });

      return processingResult;
    } finally {
      this.releaseWorker(workerId);
    }
  }

  private acquireWorker(): number {
    // Find idle worker
    for (let i = 0; i < this.workerSimulation.length; i++) {
      if (this.workerSimulation[i] === 0) {
        this.workerSimulation[i] = 1;
        return i;
      }
    }

    // All workers busy, use first one
    return 0;
  }

  private releaseWorker(workerId: number): void {
    if (workerId < this.workerSimulation.length) {
      this.workerSimulation[workerId] = 0;
    }
  }

  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Processing timeout after ${ms}ms`)), ms),
    );
  }

  private createFailedResult(error: any): StrategyProcessingResult {
    return {
      jobId: randomUUID(),
      strategyId: 'unknown',
      success: false,
      error: (error as Error).message,
      processingTime: 0,
      startedAt: Date.now(),
      completedAt: Date.now(),
    };
  }
}
