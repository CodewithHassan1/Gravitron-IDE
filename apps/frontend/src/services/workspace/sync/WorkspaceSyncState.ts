// src/services/workspace/sync/WorkspaceSyncState.ts

export enum SyncStateStatus {
  Idle = 'Idle',
  Scanning = 'Scanning',
  Syncing = 'Syncing',
  Waiting = 'Waiting',
  Conflict = 'Conflict',
  Failed = 'Failed',
  Offline = 'Offline',
}

export interface WorkspaceSyncState {
  status: SyncStateStatus;
  lastSyncTime: number | null;
  pendingOperationsCount: number;
  error: Error | null;
}

export class SyncStateManager {
  private state: WorkspaceSyncState;
  private listeners: Set<(state: WorkspaceSyncState) => void> = new Set();

  constructor() {
    this.state = {
      status: SyncStateStatus.Idle,
      lastSyncTime: null,
      pendingOperationsCount: 0,
      error: null,
    };
  }

  public getState(): Readonly<WorkspaceSyncState> {
    return this.state;
  }

  public transition(status: SyncStateStatus, error?: Error | null) {
    this.state.status = status;
    if (error !== undefined) {
      this.state.error = error;
    }
    if (status === SyncStateStatus.Idle || status === SyncStateStatus.Failed) {
      this.state.lastSyncTime = Date.now();
    }
    this.notify();
  }

  public updatePendingCount(count: number) {
    if (this.state.pendingOperationsCount !== count) {
      this.state.pendingOperationsCount = count;
      this.notify();
    }
  }

  public subscribe(listener: (state: WorkspaceSyncState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(listener => listener(this.state));
  }
}
