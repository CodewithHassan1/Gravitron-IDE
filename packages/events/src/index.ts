export enum WorkspaceSagaState {
  PENDING = 'PENDING',
  CONTAINER_CREATED = 'CONTAINER_CREATED',
  REPOSITORY_CLONED = 'REPOSITORY_CLONED',
  DEPENDENCIES_INSTALLED = 'DEPENDENCIES_INSTALLED',
  INDEXING = 'INDEXING',
  READY = 'READY',
  FAILED = 'FAILED'
}

export interface BaseEvent {
  eventId: string;
  correlationId: string;
  timestamp: string;
}

export interface WorkspaceCreatedEvent extends BaseEvent {
  type: 'workspace.created';
  workspaceId: string;
  gitUri: string;
  defaultBranch: string;
}

export interface ExecutionRuntimeStartedEvent extends BaseEvent {
  type: 'execution.runtime_started';
  workspaceId: string;
  containerId: string;
}

export interface GitRepositoryClonedEvent extends BaseEvent {
  type: 'git.repository_cloned';
  workspaceId: string;
  commitHash: string;
}

export interface DependenciesInstalledEvent extends BaseEvent {
  type: 'execution.dependencies_installed';
  workspaceId: string;
}

export interface IndexingCompletedEvent extends BaseEvent {
  type: 'index.completed';
  workspaceId: string;
}

export interface SagaFailedEvent extends BaseEvent {
  type: 'saga.failed';
  workspaceId: string;
  reason: string;
  failedAtState: WorkspaceSagaState;
}

export type SagaEvent = 
  | WorkspaceCreatedEvent
  | ExecutionRuntimeStartedEvent
  | GitRepositoryClonedEvent
  | DependenciesInstalledEvent
  | IndexingCompletedEvent
  | SagaFailedEvent;
