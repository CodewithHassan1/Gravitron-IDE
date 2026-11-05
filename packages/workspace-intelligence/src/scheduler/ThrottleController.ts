export interface ThrottleConfig {
  maxConcurrentWorkers: number;
  maxBatchSize: number;
}

export class ThrottleController {
  private activeWorkers = 0;

  constructor(private config: ThrottleConfig) {}

  canAcquireWorker(): boolean {
    return this.activeWorkers < this.config.maxConcurrentWorkers;
  }

  acquireWorker(): void {
    if (!this.canAcquireWorker()) {
      throw new Error('Worker limit exceeded');
    }
    this.activeWorkers++;
  }

  releaseWorker(): void {
    if (this.activeWorkers > 0) {
      this.activeWorkers--;
    }
  }

  getAvailableWorkers(): number {
    return this.config.maxConcurrentWorkers - this.activeWorkers;
  }

  getMaxBatchSize(): number {
    return this.config.maxBatchSize;
  }
}
