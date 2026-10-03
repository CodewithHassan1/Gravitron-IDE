// src/services/workspace/WorkspaceSession.ts
import { 
  WorkspaceState, 
  WorkspaceMetadata, 
  WorkspaceHandle, 
  WorkspaceSnapshot, 
  WorkspaceError,
  WorkspaceLifecycleState
} from './types';
import { useWorkspaceStore } from '../../stores/ide/workspaceStore';

export class WorkspaceSessionImpl {
  private state: WorkspaceState = {
    metadata: null,
    handle: null,
    snapshot: null,
    isLoading: false,
    lifecycleState: WorkspaceLifecycleState.Empty,
    error: null,
  };

  /**
   * Returns a deep clone of the current session state to ensure immutability
   * for external consumers.
   */
  getState(): Readonly<WorkspaceState> {
    return Object.freeze({
      metadata: this.state.metadata ? { ...this.state.metadata } : null,
      handle: this.state.handle ? { ...this.state.handle } : null,
      snapshot: this.state.snapshot ? { ...this.state.snapshot } : null, // VFS nodes deep clone in Commits 3+
      isLoading: this.state.isLoading,
      lifecycleState: this.state.lifecycleState,
      error: this.state.error ? { ...this.state.error } : null,
    });
  }

  getWorkspaceId(): string | null {
    return this.state.metadata?.id || null;
  }

  setMetadata(metadata: WorkspaceMetadata | null): void {
    this.state.metadata = metadata;
  }

  setHandle(handle: WorkspaceHandle | null): void {
    this.state.handle = handle;
  }

  setSnapshot(snapshot: WorkspaceSnapshot | null): void {
    this.state.snapshot = snapshot;
  }

  setLoading(isLoading: boolean): void {
    this.state.isLoading = isLoading;
  }

  setLifecycleState(lifecycleState: WorkspaceLifecycleState): void {
    this.state.lifecycleState = lifecycleState;
    useWorkspaceStore.getState().setLifecycleState(lifecycleState);
  }

  setError(error: WorkspaceError | null): void {
    this.state.error = error;
  }

  /**
   * Resets the entire session state, effectively closing the workspace.
   */
  clear(): void {
    this.state = {
      metadata: null,
      handle: null,
      snapshot: null,
      isLoading: false,
      lifecycleState: WorkspaceLifecycleState.Empty,
      error: null,
    };
    useWorkspaceStore.getState().setLifecycleState(WorkspaceLifecycleState.Empty);
  }
}

// Export singleton instance
export const WorkspaceSession = new WorkspaceSessionImpl();
