export enum GitEventType {
  RepositoryDiscovered = 'RepositoryDiscovered',
  RepositoryChanged = 'RepositoryChanged',
  StatusChanged = 'StatusChanged',
  IndexChanged = 'IndexChanged',
  BranchChanged = 'BranchChanged',
  CommitCreated = 'CommitCreated',
  CommitAmended = 'CommitAmended',
  CommitPushed = 'CommitPushed',
  CommitPulled = 'CommitPulled',
  MergeStarted = 'MergeStarted',
  MergeCompleted = 'MergeCompleted',
  MergeConflict = 'MergeConflict',
  CheckoutCompleted = 'CheckoutCompleted',
  RebaseStarted = 'RebaseStarted',
  RebaseCompleted = 'RebaseCompleted',
  DiffUpdated = 'DiffUpdated',
  HistoryUpdated = 'HistoryUpdated',
}

export interface GitEvent {
  type: GitEventType;
  workspaceId: string;
  payload?: any;
}

export class GitEventEmitter {
  private listeners: Map<GitEventType, Set<(event: GitEvent) => void>> = new Map();

  on(type: GitEventType, callback: (event: GitEvent) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);
    return () => this.listeners.get(type)!.delete(callback);
  }

  emit(event: GitEvent) {
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      handlers.forEach(h => h(event));
    }
  }
}

export const GlobalGitEvents = new GitEventEmitter();
