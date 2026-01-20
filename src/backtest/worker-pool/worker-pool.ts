/**
 * Generic Worker Pool
 *
 * Manages a pool of worker threads for parallel task processing
 * Features:
 * - Configurable worker count
 * - Task queue with fair distribution
 * - Error handling and worker restart
 * - Resource cleanup
 *
 * Architecture:
 * 1. Main thread maintains worker pool
 * 2. Task queue distributes work to idle workers
 * 3. Workers process tasks independently
 * 4. Results collected and merged
 * 5. Errors handled with fallback
 */

import { Worker } from 'worker_threads';
import * as path from 'path';
import { EventEmitter } from 'events';

export interface WorkerPoolConfig {
  workerScript: string;        // Path to worker script
  workers: number;              // Number of worker threads
  maxQueueSize?: number;        // Max pending tasks (default: 1000)
  workerRestartAttempts?: number; // Restart attempts on crash (default: 3)
}

export interface TaskMessage<T = any> {
  taskId: string;
  type: 'task' | 'ready' | 'result' | 'error';
  data?: T;
  error?: string;
}

/**
 * Generic Worker Pool
 */
export class WorkerPool<TTask = any, TResult = any> extends EventEmitter {
  private workers: Worker[] = [];
  private taskQueue: Array<{ taskId: string; task: TTask; resolve: (r: TResult) => void; reject: (e: Error) => void }> = [];
  private activeWorkers: Map<string, number> = new Map(); // taskId -> workerIndex
  private taskCounter = 0;
  private config: Required<WorkerPoolConfig>;

  constructor(config: WorkerPoolConfig) {
    super();
    this.config = {
      maxQueueSize: config.maxQueueSize || 1000,
      workerRestartAttempts: config.workerRestartAttempts || 3,
      ...config,
    };

    this.initializeWorkers();
  }

  /**
   * Initialize worker threads
   */
  private initializeWorkers(): void {
    for (let i = 0; i < this.config.workers; i++) {
      this.createWorker(i);
    }
  }

  /**
   * Create a single worker thread
   */
  private createWorker(index: number, attempt: number = 0): void {
    try {
      const worker = new Worker(this.config.workerScript);

      worker.on('message', (message: TaskMessage) => {
        this.handleWorkerMessage(index, message);
      });

      worker.on('error', (error) => {
        this.handleWorkerError(index, error, attempt);
      });

      worker.on('exit', (code) => {
        if (code !== 0 && attempt < this.config.workerRestartAttempts) {
          // Restart worker on crash
          this.createWorker(index, attempt + 1);
        }
      });

      this.workers[index] = worker;
    } catch (error) {
      throw new Error(`Failed to create worker: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Process worker message
   */
  private handleWorkerMessage(workerIndex: number, message: TaskMessage): void {
    if (message.type === 'result') {
      const taskId = message.taskId || `task-${workerIndex}`;
      const task = this.taskQueue.shift();

      if (task) {
        task.resolve(message.data as TResult);
        this.activeWorkers.delete(taskId);

        // Process next task in queue
        if (this.taskQueue.length > 0) {
          this.assignTaskToWorker(workerIndex);
        }
      }
    }
  }

  /**
   * Handle worker errors
   */
  private handleWorkerError(workerIndex: number, error: Error, attempt: number): void {
    console.error(`Worker ${workerIndex} error (attempt ${attempt}):`, error.message);
    this.emit('error', { workerIndex, error, attempt });
  }

  /**
   * Assign a task to a worker
   */
  private assignTaskToWorker(workerIndex: number): void {
    if (this.taskQueue.length === 0) {
      return;
    }

    const task = this.taskQueue.shift();
    if (!task) return;

    this.activeWorkers.set(task.taskId, workerIndex);

    const message: TaskMessage = {
      taskId: task.taskId,
      type: 'task',
      data: task.task,
    };

    this.workers[workerIndex].postMessage(message);
  }

  /**
   * Submit a task for processing
   */
  async execute(task: TTask): Promise<TResult> {
    if (this.taskQueue.length >= this.config.maxQueueSize) {
      throw new Error(`Task queue full (${this.config.maxQueueSize} pending)`);
    }

    return new Promise((resolve, reject) => {
      const taskId = `task-${this.taskCounter++}`;

      this.taskQueue.push({
        taskId,
        task,
        resolve,
        reject,
      });

      // Try to assign to idle worker
      for (let i = 0; i < this.workers.length; i++) {
        if (!Array.from(this.activeWorkers.values()).includes(i)) {
          this.assignTaskToWorker(i);
          break;
        }
      }
    });
  }

  /**
   * Execute multiple tasks in parallel
   */
  async executeBatch(tasks: TTask[]): Promise<TResult[]> {
    const promises = tasks.map(task => this.execute(task));
    return Promise.all(promises);
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      workers: this.config.workers,
      activeWorkers: this.activeWorkers.size,
      queuedTasks: this.taskQueue.length,
      totalTasksProcessed: this.taskCounter,
    };
  }

  /**
   * Terminate all workers
   */
  async terminate(): Promise<void> {
    const terminatePromises = this.workers.map(worker =>
      worker.terminate().catch(err => {
        console.warn('Error terminating worker:', err);
      })
    );

    await Promise.all(terminatePromises);
    this.workers = [];
    this.taskQueue = [];
    this.activeWorkers.clear();
  }
}

/**
 * Minimal worker message handler template for worker script
 */
export function createWorkerHandler<TTask, TResult>(
  processor: (task: TTask) => TResult | Promise<TResult>
): void {
  const { parentPort } = require('worker_threads');

  if (parentPort) {
    parentPort.on('message', async (message: TaskMessage<TTask>) => {
      try {
        if (message.type === 'task') {
          const result = await processor(message.data!);
          parentPort.postMessage({
            taskId: message.taskId,
            type: 'result',
            data: result,
          });
        }
      } catch (error) {
        parentPort.postMessage({
          taskId: message.taskId,
          type: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Signal ready
    parentPort.postMessage({ type: 'ready' });
  }
}
