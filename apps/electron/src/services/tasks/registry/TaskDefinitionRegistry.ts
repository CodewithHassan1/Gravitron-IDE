import { TaskDefinition } from '@ag/protocol';
import { ITaskProvider } from '../providers/ITaskProvider';

export class TaskDefinitionRegistry {
  private providers = new Map<string, ITaskProvider>();

  // Cache of discovered tasks, keyed by workspaceId
  private taskCache = new Map<string, Map<string, TaskDefinition>>();

  public registerProvider(provider: ITaskProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`TaskProvider ${provider.id} is already registered.`);
    }
    this.providers.set(provider.id, provider);
  }

  public unregisterProvider(providerId: string): void {
    this.providers.delete(providerId);
    // Invalidate caches if needed
  }

  public async getTasks(workspaceId: string, forceRefresh = false): Promise<TaskDefinition[]> {
    if (!forceRefresh && this.taskCache.has(workspaceId)) {
      return Array.from(this.taskCache.get(workspaceId)!.values());
    }

    const allTasks = new Map<string, TaskDefinition>();

    // Ask all providers for tasks
    const promises = Array.from(this.providers.values()).map(async (p) => {
      try {
        const tasks = await p.provideTasks(workspaceId);
        for (const task of tasks) {
          allTasks.set(task.id, task);
        }
      } catch (err) {
        console.error(`Error providing tasks from ${p.id}:`, err);
      }
    });

    await Promise.allSettled(promises);
    this.taskCache.set(workspaceId, allTasks);

    return Array.from(allTasks.values());
  }

  public async getTask(workspaceId: string, taskId: string): Promise<TaskDefinition | undefined> {
    const tasks = await this.getTasks(workspaceId);
    return tasks.find((t) => t.id === taskId);
  }
}
