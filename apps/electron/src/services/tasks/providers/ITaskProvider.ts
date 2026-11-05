import { TaskDefinition } from '@ag/protocol';

export interface ITaskProvider {
  readonly id: string;
  readonly name: string;

  /**
   * Discovers and returns a list of tasks provided by this provider.
   */
  provideTasks(workspaceId: string): Promise<TaskDefinition[]>;

  /**
   * Resolves an incomplete task definition (e.g. from a user's task.json).
   */
  resolveTask(task: TaskDefinition): Promise<TaskDefinition | undefined>;
}
