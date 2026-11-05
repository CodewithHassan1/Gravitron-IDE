// src/services/workspace/sync/WorkspaceScheduler.ts

export interface SchedulerOptions {
  debounceMs: number;
  maxBatchMs: number;
  retryBaseMs: number;
  maxRetries: number;
}

export class WorkspaceScheduler {
  private options: SchedulerOptions;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxBatchTimer: ReturnType<typeof setTimeout> | null = null;

  private isProcessing: boolean = false;

  constructor(options: Partial<SchedulerOptions> = {}) {
    this.options = {
      debounceMs: options.debounceMs ?? 1000,
      maxBatchMs: options.maxBatchMs ?? 5000,
      retryBaseMs: options.retryBaseMs ?? 2000,
      maxRetries: options.maxRetries ?? 5,
    };
  }

  /**
   * Schedules a sync execution.
   * Debounces repeated calls, but guarantees execution after maxBatchMs.
   */
  public schedule(execute: () => Promise<void>): void {
    if (this.isProcessing) return; // Prevent overlapping schedules

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    if (!this.maxBatchTimer) {
      // Start the max batch timer on the first schedule call
      this.maxBatchTimer = setTimeout(() => {
        this.clearTimers();
        this.run(execute);
      }, this.options.maxBatchMs);
    }

    this.debounceTimer = setTimeout(() => {
      this.clearTimers();
      this.run(execute);
    }, this.options.debounceMs);
  }

  /**
   * Immediately runs the execution, bypassing timers.
   */
  public flush(execute: () => Promise<void>): void {
    this.clearTimers();
    this.run(execute);
  }

  /**
   * Cancels any pending scheduled executions.
   */
  public cancel(): void {
    this.clearTimers();
  }

  /**
   * Calculates exponential backoff for retries.
   */
  public getRetryDelay(attempt: number): number {
    if (attempt > this.options.maxRetries) return -1;
    // exponential backoff with jitter
    const delay = this.options.retryBaseMs * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 500;
    return delay + jitter;
  }

  private clearTimers() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.maxBatchTimer) clearTimeout(this.maxBatchTimer);
    this.debounceTimer = null;
    this.maxBatchTimer = null;
  }

  private async run(execute: () => Promise<void>) {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      await execute();
    } finally {
      this.isProcessing = false;
    }
  }
}
