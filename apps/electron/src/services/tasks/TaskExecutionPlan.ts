import { TaskDefinition, TaskTraceContext, ExecutionTarget, ExecutionProfile } from '@ag/protocol';

export interface TaskExecutionPlan {
  readonly definition: TaskDefinition;
  readonly target: ExecutionTarget;
  readonly profile?: ExecutionProfile;
  readonly traceContext: TaskTraceContext;

  // Fully resolved parameters independent of the target backend
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
}
