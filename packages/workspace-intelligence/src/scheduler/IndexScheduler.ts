import { PriorityQueue } from './PriorityQueue';
import { BatchPlanner, BatchPlan } from './BatchPlanner';
import { ThrottleController } from './ThrottleController';
import { DocumentWorkItem, SchedulerMetrics } from './DocumentWorkItem';

export interface IIndexScheduler {
  schedule(item: DocumentWorkItem): void;
  getNextBatch(): BatchPlan | null;
  getMetrics(): SchedulerMetrics;
}

export class IndexScheduler implements IIndexScheduler {
  private queue = new PriorityQueue();
  private batchPlanner = new BatchPlanner();

  private totalEnqueued = 0;
  private totalDequeued = 0;

  constructor(private throttleController: ThrottleController) {}

  schedule(item: DocumentWorkItem): void {
    this.totalEnqueued++;
    this.queue.enqueue(item);
  }

  getNextBatch(): BatchPlan | null {
    if (!this.throttleController.canAcquireWorker()) {
      return null;
    }
    const batchSize = this.throttleController.getMaxBatchSize();
    const items = this.queue.dequeueBatch(batchSize);

    if (items.length === 0) {
      return null;
    }

    this.totalDequeued += items.length;
    this.throttleController.acquireWorker();

    return this.batchPlanner.plan(items);
  }

  // Note: the worker should call this when done processing the batch
  completeBatch(): void {
    this.throttleController.releaseWorker();
  }

  getMetrics(): SchedulerMetrics {
    // A simplified metric collection
    return {
      queueDepth: this.queue.size(),
      oldestItemAgeMs: this.queue.getOldestAgeMs(),
      coalescedDocuments: this.totalEnqueued - this.totalDequeued - this.queue.size(),
      cancelledJobs: 0,
      workerUtilization:
        this.throttleController.getMaxBatchSize() === 0
          ? 0
          : 1 -
            this.throttleController.getAvailableWorkers() /
              this.throttleController.getMaxBatchSize(), // approx
      averageLatencyMs: 0,
    };
  }
}
