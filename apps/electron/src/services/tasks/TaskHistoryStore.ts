import { TaskExecutionSnapshot } from '@ag/protocol';

export class TaskHistoryStore {
  private history = new Map<string, TaskExecutionSnapshot>();
  private ordering: string[] = [];

  // Maximum number of snapshots to keep in memory to prevent leaks
  private readonly MAX_HISTORY = 1000;

  public save(snapshot: TaskExecutionSnapshot): void {
    if (!this.history.has(snapshot.executionId)) {
      this.ordering.push(snapshot.executionId);
    }

    this.history.set(snapshot.executionId, snapshot);

    if (this.ordering.length > this.MAX_HISTORY) {
      const idToRemove = this.ordering.shift();
      if (idToRemove) {
        this.history.delete(idToRemove);
      }
    }
  }

  public get(executionId: string): TaskExecutionSnapshot | undefined {
    return this.history.get(executionId);
  }

  public getByWorkspace(workspaceId: string): TaskExecutionSnapshot[] {
    return Array.from(this.history.values()).filter((s) => s.workspaceId === workspaceId);
  }

  public getByTask(taskId: string): TaskExecutionSnapshot[] {
    return Array.from(this.history.values()).filter((s) => s.taskId === taskId);
  }

  public getAll(): TaskExecutionSnapshot[] {
    return Array.from(this.history.values());
  }

  public clear(): void {
    this.history.clear();
    this.ordering = [];
  }
}
