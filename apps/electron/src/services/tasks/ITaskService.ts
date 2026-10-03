import { TaskDefinition, TaskExecutionSnapshot } from '@ag/protocol';
import { ITaskProvider } from './providers/ITaskProvider';

export interface ITaskService {
  /**
   * Initialize the task service and its core registries.
   */
  initialize(): Promise<void>;

  /**
   * Register a new task provider (e.g. PackageJson, Extension).
   */
  registerProvider(provider: ITaskProvider): void;

  /**
   * Get all tasks discovered across all providers.
   */
  getTasks(workspaceId: string, forceRefresh?: boolean): Promise<TaskDefinition[]>;

  /**
   * Execute a task by ID.
   */
  executeTask(workspaceId: string, taskId: string): Promise<string>; // Returns executionId

  /**
   * Cancel a running task execution.
   */
  cancelTask(executionId: string): void;

  /**
   * Get history of task executions.
   */
  getHistory(workspaceId: string): TaskExecutionSnapshot[];
}
