import { TaskRunner } from './TaskRunner';

export class TaskRuntime {
  private activeRunners = new Map<string, TaskRunner>();

  public register(runner: TaskRunner): void {
    if (this.activeRunners.has(runner.executionId)) {
      throw new Error(`Execution ID ${runner.executionId} is already running.`);
    }
    this.activeRunners.set(runner.executionId, runner);
  }

  public unregister(executionId: string): void {
    this.activeRunners.delete(executionId);
  }

  public getRunner(executionId: string): TaskRunner | undefined {
    return this.activeRunners.get(executionId);
  }

  public cancel(executionId: string): void {
    const runner = this.activeRunners.get(executionId);
    if (runner) {
      runner.cancel();
    }
  }

  public cancelAll(): void {
    for (const runner of this.activeRunners.values()) {
      runner.cancel();
    }
  }

  public dispose(): void {
    for (const runner of this.activeRunners.values()) {
      runner.dispose();
    }
    this.activeRunners.clear();
  }
}
