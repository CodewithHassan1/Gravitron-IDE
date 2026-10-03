export type TaskExecutionReason =
  | 'User'
  | 'Startup'
  | 'Dependency'
  | 'Background'
  | 'AutoDetect'
  | 'AI'
  | 'Extension'
  | 'Scheduler';

export type TaskProgressKind = 'Indeterminate' | 'Determinate' | 'Completed' | 'Failed';

export interface TaskProgress {
  readonly kind: TaskProgressKind;
  readonly percentage?: number; // Only for Determinate
  readonly message?: string;
}

export interface TaskDefinition {
  readonly id: string;
  readonly name: string;
  readonly type: string; // e.g. 'npm', 'shell', 'typescript'
  readonly group?: 'build' | 'test' | 'clean' | 'none';
  readonly isBackground?: boolean;
  readonly command?: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly problemMatchers?: readonly string[];
  readonly dependencies?: readonly string[];
}

export interface TaskTraceContext {
  readonly taskId: string;
  readonly executionId: string;
  readonly workspaceId: string;
  readonly traceId: string;
  readonly correlationId: string;
  readonly parentExecutionId?: string;
  readonly reason: TaskExecutionReason;
}

export interface TaskDiagnosticEvent {
  readonly file: string;
  readonly line: number;
  readonly column?: number;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly code?: string;
  readonly source?: string;
}

export interface TaskExecutionSnapshot {
  readonly executionId: string;
  readonly taskId: string;
  readonly trace: TaskTraceContext;
  readonly startTime: number;
  readonly endTime?: number;
  readonly duration?: number;
  readonly exitCode?: number;
  readonly targetKind: string;
  readonly workspaceId: string;
  readonly state: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  readonly problemsFound: readonly TaskDiagnosticEvent[];
}

export interface TaskEvent {
  readonly category: 'lifecycle' | 'output' | 'progress' | 'diagnostic';
  readonly kind: string; // 'started', 'completed', 'stdout', 'stderr', 'percentage', 'problem'
  readonly executionId: string;
  
  // Payload fields based on category/kind
  readonly data?: string | Uint8Array;
  readonly progress?: TaskProgress;
  readonly diagnostic?: TaskDiagnosticEvent;
  readonly snapshot?: TaskExecutionSnapshot;
}
