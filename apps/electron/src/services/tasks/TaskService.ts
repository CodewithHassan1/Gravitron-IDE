import { ITaskService } from './ITaskService';
import { ITaskProvider } from './providers/ITaskProvider';
import { TaskDefinitionRegistry } from './registry/TaskDefinitionRegistry';
import { TaskScheduler } from './TaskScheduler';
import { TaskRuntime } from './TaskRuntime';
import { TaskHistoryStore } from './TaskHistoryStore';
import { ProblemMatcherRegistry } from './diagnostics/ProblemMatcherRegistry';
import { IWorkspaceExecutionService } from '../execution/IWorkspaceExecutionService';
import { IWindowService } from '../WindowService';
import { TaskDefinition, TaskExecutionSnapshot, TaskEvent, Channels } from '@ag/protocol';
import { ServiceId, ServiceIds } from '../ServiceIds';
import { TaskRunner } from './TaskRunner';
import { TaskExecutionPlan } from './TaskExecutionPlan';
import { randomUUID } from 'crypto';

export class TaskService implements ITaskService {
  public readonly id = ServiceIds.Tasks;
  public readonly dependencies: readonly ServiceId[] = [ServiceIds.WorkspaceExecution, ServiceIds.Window];

  private definitionRegistry = new TaskDefinitionRegistry();
  private problemMatcherRegistry = new ProblemMatcherRegistry();
  private historyStore = new TaskHistoryStore();
  private runtime = new TaskRuntime();
  private scheduler = new TaskScheduler(this.runtime);

  constructor(
    private readonly windowServiceFactory: () => IWindowService,
    private readonly executionServiceFactory: () => IWorkspaceExecutionService
  ) {}

  public async initialize(): Promise<void> {
    // Initial setup if necessary
  }

  public async start(): Promise<void> {
    // Start listeners if necessary
  }

  public async stop(): Promise<void> {
    this.dispose();
  }

  public dispose(): void {
    this.runtime.dispose();
  }

  public registerProvider(provider: ITaskProvider): void {
    this.definitionRegistry.registerProvider(provider);
  }

  public async getTasks(workspaceId: string, forceRefresh = false): Promise<TaskDefinition[]> {
    return this.definitionRegistry.getTasks(workspaceId, forceRefresh);
  }

  public async executeTask(workspaceId: string, taskId: string): Promise<string> {
    const task = await this.definitionRegistry.getTask(workspaceId, taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found in workspace ${workspaceId}`);
    }

    const executionId = randomUUID();

    // Create execution plan
    // In a full implementation, we'd resolve env vars and check dependencies via TaskDependencyResolver
    const plan: TaskExecutionPlan = {
      definition: task,
      target: { kind: 'local' }, // Default to local, could be resolved
      traceContext: {
        taskId: task.id,
        executionId,
        workspaceId,
        traceId: randomUUID(),
        correlationId: randomUUID(),
        reason: 'User'
      },
      executable: task.command || 'sh',
      args: task.args || [],
      cwd: task.cwd || '/',
      environment: task.env || {}
    };

    const runner = new TaskRunner(
      executionId,
      plan,
      this.executionServiceFactory(),
      this.problemMatcherRegistry,
      (event: TaskEvent) => this.handleTaskEvent(event)
    );

    this.scheduler.schedule(runner);
    return executionId;
  }

  public cancelTask(executionId: string): void {
    this.runtime.cancel(executionId);
  }

  public getHistory(workspaceId: string): TaskExecutionSnapshot[] {
    return this.historyStore.getByWorkspace(workspaceId);
  }

  private handleTaskEvent(event: TaskEvent): void {
    if (event.category === 'lifecycle' && event.snapshot) {
      this.historyStore.save(event.snapshot);
    }
    
    // Broadcast event to renderer via WindowService
    this.windowServiceFactory().broadcast(Channels.Tasks.OnEvent, event);
  }
}
