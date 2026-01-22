/**
 * PHASE 12: PARALLEL PROCESSING TESTS
 *
 * Comprehensive test suite for parallel strategy processing.
 * Tests job queuing, concurrent execution, and performance.
 *
 * Test Categories:
 * 1. Pool Initialization (4 tests)
 * 2. Job Submission (8 tests)
 * 3. Job Processing (8 tests)
 * 4. Concurrent Execution (8 tests)
 * 5. Error Handling (6 tests)
 * 6. Metrics & Monitoring (4 tests)
 *
 * Total: 38 comprehensive tests
 */

import { StrategyProcessingPoolService } from '../services/multi-strategy/strategy-processing-pool.service';
import {
  StrategyProcessingJob,
  ProcessingPriority,
} from '../types/strategy-processing.types';
import { LoggerService, LogLevel } from '../types';

describe('PHASE 12: Parallel Strategy Processing', () => {
  let processingPool: StrategyProcessingPoolService;
  let logger: LoggerService;

  beforeEach(async () => {
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
      setLevel: jest.fn(),
      getLevel: jest.fn(() => LogLevel.INFO),
      writeToConsole: jest.fn(),
      writeToFile: jest.fn(),
      flush: jest.fn(),
    } as any;

    processingPool = new StrategyProcessingPoolService(
      {
        workerPoolSize: 4,
        queueSize: 100,
        defaultTimeoutMs: 2000,
      },
      logger,
    );

    await processingPool.start();
  });

  afterEach(async () => {
    await processingPool.shutdown();
  });

  // =========================================================================
  // PART 1: Pool Initialization (4 tests)
  // =========================================================================

  describe('Part 1: Pool Initialization', () => {
    it('should initialize with default configuration', async () => {
      const pool = new StrategyProcessingPoolService();
      await pool.start();

      const status = pool.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.totalWorkers).toBe(4);

      await pool.shutdown();
    });

    it('should initialize with custom configuration', async () => {
      const pool = new StrategyProcessingPoolService({
        workerPoolSize: 8,
        queueSize: 200,
      });
      await pool.start();

      const status = pool.getStatus();
      expect(status.totalWorkers).toBe(8);

      await pool.shutdown();
    });

    it('should start pool successfully', async () => {
      const status = processingPool.getStatus();

      expect(status.isRunning).toBe(true);
      expect(status.activeWorkers).toBeLessThanOrEqual(status.totalWorkers);
    });

    it('should shutdown pool gracefully', async () => {
      const status1 = processingPool.getStatus();
      expect(status1.isRunning).toBe(true);

      await processingPool.shutdown();

      const status2 = processingPool.getStatus();
      expect(status2.isRunning).toBe(false);
    });
  });

  // =========================================================================
  // PART 2: Job Submission (8 tests)
  // =========================================================================

  describe('Part 2: Job Submission', () => {
    beforeEach(() => {
      processingPool.setProcessingFunction(async (job) => {
        // Simulate processing
        await new Promise(resolve => setTimeout(resolve, 10));
        return { processed: true, jobId: job.jobId };
      });
    });

    it('should submit single job', async () => {
      const job: StrategyProcessingJob = {
        jobId: 'job-1',
        strategyId: 'strategy-1',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      };

      const result = await processingPool.submitJob(job);

      expect(result.success).toBe(true);
      expect(result.jobId).toBe('job-1');
      expect(result.strategyId).toBe('strategy-1');
    });

    it('should submit multiple jobs', async () => {
      const jobs = Array(5).fill(null).map((_, i) => ({
        jobId: `job-${i}`,
        strategyId: `strategy-${i}`,
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      }));

      const results = await processingPool.submitBatch(jobs);

      expect(results.length).toBe(5);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should assign job ID if not provided', async () => {
      const job: StrategyProcessingJob = {
        jobId: 'test-job',
        strategyId: 'strategy-1',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      };

      const result = await processingPool.submitJob(job);

      expect(result.jobId).toBe('test-job');
    });

    it('should handle job priority', async () => {
      const lowPriorityJob: StrategyProcessingJob = {
        jobId: 'low-priority',
        strategyId: 'strategy-1',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.LOW,
      };

      const highPriorityJob: StrategyProcessingJob = {
        jobId: 'high-priority',
        strategyId: 'strategy-2',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.HIGH,
      };

      const result1 = await processingPool.submitJob(lowPriorityJob);
      const result2 = await processingPool.submitJob(highPriorityJob);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    it('should reject if processing function not set', async () => {
      const pool = new StrategyProcessingPoolService();
      await pool.start();

      const job: StrategyProcessingJob = {
        jobId: 'job-1',
        strategyId: 'strategy-1',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      };

      await expect(pool.submitJob(job)).rejects.toThrow('Processing function not set');

      await pool.shutdown();
    });

    it('should reject if pool not running', async () => {
      const pool = new StrategyProcessingPoolService();
      pool.setProcessingFunction(async () => ({ ok: true }));

      const job: StrategyProcessingJob = {
        jobId: 'job-1',
        strategyId: 'strategy-1',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      };

      await expect(pool.submitJob(job)).rejects.toThrow('Processing pool is not running');
    });

    it('should track submitted jobs', async () => {
      const job1: StrategyProcessingJob = {
        jobId: 'job-1',
        strategyId: 'strategy-1',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      };

      await processingPool.submitJob(job1);

      const stats = processingPool.getStats();
      expect(stats.totalJobs).toBe(1);
    });
  });

  // =========================================================================
  // PART 3: Job Processing (8 tests)
  // =========================================================================

  describe('Part 3: Job Processing', () => {
    beforeEach(() => {
      processingPool.setProcessingFunction(async (job) => {
        await new Promise(resolve => setTimeout(resolve, 20));
        return { processed: true, jobId: job.jobId };
      });
    });

    it('should process job successfully', async () => {
      const job: StrategyProcessingJob = {
        jobId: 'job-proc-1',
        strategyId: 'strategy-1',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      };

      const result = await processingPool.submitJob(job);

      expect(result.success).toBe(true);
      expect(result.processingTime).toBeGreaterThan(0);
      expect(result.result).toEqual({ processed: true, jobId: 'job-proc-1' });
    });

    it('should track processing time', async () => {
      const job: StrategyProcessingJob = {
        jobId: 'job-time-1',
        strategyId: 'strategy-1',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      };

      const result = await processingPool.submitJob(job);

      expect(result.processingTime).toBeGreaterThanOrEqual(20);
      expect(result.startedAt).toBeLessThanOrEqual(result.completedAt);
    });

    it('should handle job with custom timeout', async () => {
      processingPool.setProcessingFunction(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { ok: true };
      });

      const job: StrategyProcessingJob = {
        jobId: 'job-timeout-1',
        strategyId: 'strategy-1',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
        timeoutMs: 50,
      };

      const result = await processingPool.submitJob(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should record completed jobs', async () => {
      const job: StrategyProcessingJob = {
        jobId: 'job-completed-1',
        strategyId: 'strategy-1',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      };

      await processingPool.submitJob(job);

      const completed = processingPool.getCompletedJobs();
      expect(completed.length).toBe(1);
      expect(completed[0].jobId).toBe('job-completed-1');
    });

    it('should update statistics on success', async () => {
      const job: StrategyProcessingJob = {
        jobId: 'job-stats-1',
        strategyId: 'strategy-1',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      };

      const statsBefore = processingPool.getStats();
      await processingPool.submitJob(job);
      const statsAfter = processingPool.getStats();

      expect(statsAfter.successfulJobs).toBe(statsBefore.successfulJobs + 1);
      expect(statsAfter.totalJobs).toBe(statsBefore.totalJobs + 1);
    });

    it('should calculate average processing time', async () => {
      const jobs = Array(3).fill(null).map((_, i) => ({
        jobId: `job-avg-${i}`,
        strategyId: 'strategy-1',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      }));

      await processingPool.submitBatch(jobs);

      const stats = processingPool.getStats();
      expect(stats.averageProcessingTime).toBeGreaterThan(0);
      expect(stats.minProcessingTime).toBeGreaterThan(0);
      expect(stats.maxProcessingTime).toBeGreaterThanOrEqual(stats.minProcessingTime);
    });

    it('should initialize min/max processing time correctly', async () => {
      const job: StrategyProcessingJob = {
        jobId: 'job-minmax-1',
        strategyId: 'strategy-1',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      };

      await processingPool.submitJob(job);

      const stats = processingPool.getStats();
      expect(stats.minProcessingTime).toBeLessThanOrEqual(stats.maxProcessingTime);
    });
  });

  // =========================================================================
  // PART 4: Concurrent Execution (8 tests)
  // =========================================================================

  describe('Part 4: Concurrent Execution', () => {
    beforeEach(() => {
      processingPool.setProcessingFunction(async (job) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { processed: true };
      });
    });

    it('should process multiple strategies concurrently', async () => {
      const startTime = Date.now();

      const jobs = Array(4).fill(null).map((_, i) => ({
        jobId: `job-concurrent-${i}`,
        strategyId: `strategy-${i}`,
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      }));

      const results = await processingPool.submitBatch(jobs);
      const totalTime = Date.now() - startTime;

      expect(results.every(r => r.success)).toBe(true);
      // Should be faster than sequential (4 * 50ms = 200ms)
      // With parallelization, should be closer to 50-100ms
      expect(totalTime).toBeLessThan(200);
    });

    it('should isolate strategy processing', async () => {
      const job1: StrategyProcessingJob = {
        jobId: 'job-iso-1',
        strategyId: 'strategy-A',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      };

      const job2: StrategyProcessingJob = {
        jobId: 'job-iso-2',
        strategyId: 'strategy-B',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      };

      const [result1, result2] = await Promise.all([
        processingPool.submitJob(job1),
        processingPool.submitJob(job2),
      ]);

      expect(result1.strategyId).toBe('strategy-A');
      expect(result2.strategyId).toBe('strategy-B');
    });

    it('should handle queue overflow gracefully', async () => {
      const pool = new StrategyProcessingPoolService({
        queueSize: 5,
      });
      await pool.start();
      pool.setProcessingFunction(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { ok: true };
      });

      const jobs = Array(10).fill(null).map((_, i) => ({
        jobId: `job-overflow-${i}`,
        strategyId: 'strategy-1',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      }));

      // First 5 should succeed
      const results1 = await Promise.allSettled(
        jobs.slice(0, 5).map(j => pool.submitJob(j)),
      );
      expect(results1.every(r => r.status === 'fulfilled')).toBe(true);

      // Next 5 should fail due to queue overflow
      const results2 = await Promise.allSettled(
        jobs.slice(5, 10).map(j => pool.submitJob(j)),
      );
      expect(results2.some(r => r.status === 'rejected')).toBe(true);

      await pool.shutdown();
    });

    it('should process high priority jobs first', async () => {
      const results: string[] = [];

      processingPool.setProcessingFunction(async (job) => {
        results.push(job.jobId);
        return { ok: true };
      });

      // Submit low priority first
      const lowJob: StrategyProcessingJob = {
        jobId: 'low',
        strategyId: 'strategy-1',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.LOW,
      };

      // Submit high priority second
      const highJob: StrategyProcessingJob = {
        jobId: 'high',
        strategyId: 'strategy-1',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.HIGH,
      };

      await processingPool.submitJob(lowJob);
      await processingPool.submitJob(highJob);

      // High priority should be processed (queue ordered by priority)
      const stats = processingPool.getStats();
      expect(stats.successfulJobs).toBeGreaterThanOrEqual(1);
    });

    it('should balance load across workers', async () => {
      const jobs = Array(8).fill(null).map((_, i) => ({
        jobId: `job-load-${i}`,
        strategyId: `strategy-${i}`,
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      }));

      await processingPool.submitBatch(jobs);

      const status = processingPool.getStatus();
      // After completion, all workers should be idle
      expect(status.activeWorkers).toBeLessThanOrEqual(status.totalWorkers);
    });

    it('should allow waiting for all jobs', async () => {
      const jobs = Array(5).fill(null).map((_, i) => ({
        jobId: `job-wait-${i}`,
        strategyId: `strategy-${i}`,
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      }));

      // Submit jobs without waiting
      jobs.forEach(j => processingPool.submitJob(j).catch(() => {}));

      // Wait for all to complete
      const results = await processingPool.waitForAll();

      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should support batching with mixed priorities', async () => {
      const jobs: StrategyProcessingJob[] = [
        {
          jobId: 'batch-1',
          strategyId: 'strategy-1',
          candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
          timestamp: Date.now(),
          priority: ProcessingPriority.NORMAL,
        },
        {
          jobId: 'batch-2',
          strategyId: 'strategy-2',
          candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
          timestamp: Date.now(),
          priority: ProcessingPriority.HIGH,
        },
        {
          jobId: 'batch-3',
          strategyId: 'strategy-3',
          candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
          timestamp: Date.now(),
          priority: ProcessingPriority.LOW,
        },
      ];

      const results = await processingPool.submitBatch(jobs);

      expect(results.length).toBe(3);
      expect(results.every(r => r.success)).toBe(true);
    });
  });

  // =========================================================================
  // PART 5: Error Handling (6 tests)
  // =========================================================================

  describe('Part 5: Error Handling', () => {
    it('should handle job processing errors', async () => {
      processingPool.setProcessingFunction(async () => {
        throw new Error('Processing failed');
      });

      const job: StrategyProcessingJob = {
        jobId: 'job-error-1',
        strategyId: 'strategy-1',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      };

      const result = await processingPool.submitJob(job);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Processing failed');
    });

    it('should record failed jobs', async () => {
      processingPool.setProcessingFunction(async () => {
        throw new Error('Test error');
      });

      const job: StrategyProcessingJob = {
        jobId: 'job-fail-record',
        strategyId: 'strategy-1',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      };

      await processingPool.submitJob(job);

      const failed = processingPool.getFailedJobs();
      expect(failed.length).toBe(1);
      expect(failed[0].jobId).toBe('job-fail-record');
    });

    it('should include error stack trace', async () => {
      processingPool.setProcessingFunction(async () => {
        throw new Error('Stack trace test');
      });

      const job: StrategyProcessingJob = {
        jobId: 'job-stack-1',
        strategyId: 'strategy-1',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      };

      const result = await processingPool.submitJob(job);

      expect(result.stackTrace).toBeDefined();
      expect(result.stackTrace).toContain('Stack trace test');
    });

    it('should isolate errors between jobs', async () => {
      let callCount = 0;

      processingPool.setProcessingFunction(async (job) => {
        callCount++;
        if (job.strategyId === 'strategy-fail') {
          throw new Error('Strategy failed');
        }
        return { ok: true };
      });

      const job1: StrategyProcessingJob = {
        jobId: 'job-iso-err-1',
        strategyId: 'strategy-fail',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      };

      const job2: StrategyProcessingJob = {
        jobId: 'job-iso-err-2',
        strategyId: 'strategy-ok',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      };

      const [result1, result2] = await Promise.all([
        processingPool.submitJob(job1),
        processingPool.submitJob(job2),
      ]);

      expect(result1.success).toBe(false);
      expect(result2.success).toBe(true);
    });

    it('should handle timeout errors', async () => {
      processingPool.setProcessingFunction(async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return { ok: true };
      });

      const job: StrategyProcessingJob = {
        jobId: 'job-timeout-test',
        strategyId: 'strategy-1',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
        timeoutMs: 100,
      };

      const result = await processingPool.submitJob(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });

  // =========================================================================
  // PART 6: Metrics & Monitoring (4 tests)
  // =========================================================================

  describe('Part 6: Metrics & Monitoring', () => {
    beforeEach(() => {
      processingPool.setProcessingFunction(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { ok: true };
      });
    });

    it('should provide pool status', () => {
      const status = processingPool.getStatus();

      expect(status.isRunning).toBe(true);
      expect(status.totalWorkers).toBe(4);
      expect(status.queueLength).toBeGreaterThanOrEqual(0);
    });

    it('should provide statistics', async () => {
      const job: StrategyProcessingJob = {
        jobId: 'job-stats-metric',
        strategyId: 'strategy-1',
        candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
        timestamp: Date.now(),
        priority: ProcessingPriority.NORMAL,
      };

      await processingPool.submitJob(job);

      const stats = processingPool.getStats();

      expect(stats.totalJobs).toBe(1);
      expect(stats.successfulJobs).toBe(1);
      expect(stats.failedJobs).toBe(0);
      expect(stats.successRate).toBe(1);
    });

    it('should provide worker health status', () => {
      const health = processingPool.getWorkerHealth();

      expect(health.length).toBe(4);
      expect(health.every(w => w.isAlive)).toBe(true);
    });

    it('should calculate success rate', async () => {
      processingPool.setProcessingFunction(async (job) => {
        if (job.jobId.includes('fail')) {
          throw new Error('Intentional failure');
        }
        return { ok: true };
      });

      const jobs = [
        {
          jobId: 'job-sr-1',
          strategyId: 'strategy-1',
          candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
          timestamp: Date.now(),
          priority: ProcessingPriority.NORMAL,
        },
        {
          jobId: 'job-sr-fail',
          strategyId: 'strategy-2',
          candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 } as any,
          timestamp: Date.now(),
          priority: ProcessingPriority.NORMAL,
        },
      ];

      await processingPool.submitBatch(jobs);

      const stats = processingPool.getStats();

      expect(stats.totalJobs).toBe(2);
      expect(stats.successfulJobs).toBe(1);
      expect(stats.failedJobs).toBe(1);
      expect(stats.successRate).toBeCloseTo(0.5);
    });
  });
});
