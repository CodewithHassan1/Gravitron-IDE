import { TaskRunner } from './TaskRunner';
import { TaskRuntime } from './TaskRuntime';

export interface TaskSchedulerOptions {
  maxConcurrentTasks?: number;
}

export class TaskScheduler {
  private readonly maxConcurrentTasks: number;
  private queue: TaskRunner[] = [];
  private activeCount = 0;

  constructor(
    private readonly runtime: TaskRuntime,
    options?: TaskSchedulerOptions
  ) {
    // Default to a reasonable number of concurrent tasks if not specified
    this.maxConcurrentTasks = options?.maxConcurrentTasks ?? 4;
  }

  public schedule(runner: TaskRunner): void {
    this.queue.push(runner);
    this.tryRunNext();
  }

  private tryRunNext(): void {
    while (this.activeCount < this.maxConcurrentTasks && this.queue.length > 0) {
      // Basic fairness: pop from front
      const runner = this.queue.shift()!;
      this.activeCount++;

      this.runtime.register(runner);

      // Run detached
      runner
        .run()
        .finally(() => {
          this.runtime.unregister(runner.executionId);
          this.activeCount--;
          this.tryRunNext();
        })
        .catch((err) => {
          console.error(`Task ${runner.executionId} failed unexpectedly:`, err);
        });
    }
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public getActiveCount(): number {
    return this.activeCount;
  }
}
