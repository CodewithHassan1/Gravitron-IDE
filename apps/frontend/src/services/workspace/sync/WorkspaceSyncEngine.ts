// src/services/workspace/sync/WorkspaceSyncEngine.ts

import { WorkspaceWatcher } from './WorkspaceWatcher';
import { WorkspaceScheduler } from './WorkspaceScheduler';
import { WorkspaceOperationQueue } from './WorkspaceOperationQueue';
import { WorkspaceBatcher } from './WorkspaceBatcher';
import { WorkspaceConflictDetector } from './WorkspaceConflictDetector';
import { SyncStateManager, SyncStateStatus, WorkspaceSyncState } from './WorkspaceSyncState';
import { WorkspaceOperation, WorkspaceOperationType } from './WorkspaceOperation';
import { VirtualFileSystem } from '../vfs/VirtualFileSystem';
import { WorkspacePersistence } from '../WorkspacePersistence';
import { WorkspaceSerializer } from '../WorkspaceSerializer';
import { WorkspaceHistory } from '../WorkspaceHistory';
// We assume an event emitter is injected.

export class WorkspaceSyncEngine {
  public readonly state: SyncStateManager;
  private watcher: WorkspaceWatcher;
  private scheduler: WorkspaceScheduler;
  private queue: WorkspaceOperationQueue;

  constructor(
    private vfs: VirtualFileSystem,
    private persistence: WorkspacePersistence,
    private workspaceId: string,
    private eventEmitter: any, // Dependency Injection for Event Bus
    private history: WorkspaceHistory
  ) {
    this.state = new SyncStateManager();
    this.queue = new WorkspaceOperationQueue();
    this.scheduler = new WorkspaceScheduler({ debounceMs: 500, maxBatchMs: 2000 });
    this.watcher = new WorkspaceWatcher();
  }

  /**
   * Initializes synchronization and attaches to the native file system handle.
   * @param nativeHandle The native file system handle (if applicable).
   */
  public start(nativeHandle: any): void {
    this.watcher.watch(nativeHandle, (op) => this.enqueueOperation(op));
    this.state.transition(SyncStateStatus.Idle);
  }

  /**
   * Stops the synchronization engine, clearing all timers and active watchers.
   */
  public stop(): void {
    this.watcher.stop();
    this.scheduler.cancel();
    this.state.transition(SyncStateStatus.Offline);
  }

  /**
   * Enqueues a file system operation to be synchronized and scheduled for execution.
   * @param operation The operation to enqueue.
   */
  public enqueueOperation(operation: WorkspaceOperation): void {
    this.queue.enqueue(operation);
    this.state.updatePendingCount(this.queue.size);
    this.scheduler.schedule(() => this.executeSyncCycle());
  }

  private isSyncing = false;

  /**
   * Executes the synchronization cycle.
   */
  public async executeSyncCycle() {
    if (this.queue.size === 0) return;
    if (this.isSyncing) return;

    this.isSyncing = true;
    this.state.transition(SyncStateStatus.Syncing);
    this.eventEmitter.emit('SyncStarted', { timestamp: Date.now() });

    try {
      // 1. Drain queue and batch operations
      const operations = [...this.queue.getOperations()];
      // DO NOT clear queue here. We clear it after successful persistence.

      const batchedOps = WorkspaceBatcher.batch([...operations]);

      // 2. Process each operation
      for (const op of batchedOps) {
        // Detect Conflicts
        const conflict = WorkspaceConflictDetector.detect(op, this.vfs);
        if (conflict) {
          this.state.transition(SyncStateStatus.Conflict);
          this.eventEmitter.emit('ConflictDetected', conflict);
          // For now, we skip conflicted operations rather than halting entirely
          continue;
        }

        // Apply to VirtualFileSystem (REMOVED: Now handled optimistically by WorkspaceManager)
        // this.applyToVfs(op);
      }

      // 3. Persist the updated tree
      const snapshot = WorkspaceSerializer.serialize(this.vfs, Date.now()); // simplified versioning
      await this.persistence.saveSnapshot(this.workspaceId, snapshot);
      this.history.push(snapshot);

      for (const op of operations) {
        this.queue.cancel(op.id);
      }
      this.state.updatePendingCount(this.queue.size);
      this.state.transition(SyncStateStatus.Idle);
      this.eventEmitter.emit('SyncCompleted', {
        timestamp: Date.now(),
        operationsProcessed: batchedOps.length,
      });
    } catch (error: any) {
      this.state.transition(SyncStateStatus.Failed, error);
      this.eventEmitter.emit('SyncFailed', { error: error.message });
      // In a real system we would implement retry logic here via scheduler
    } finally {
      this.isSyncing = false;
      // If there are more items in the queue, we should probably schedule another cycle,
      // but the scheduler already debounces.
      if (this.queue.size > 0 && this.state.getState().status !== SyncStateStatus.Failed) {
        this.scheduler.schedule(() => this.executeSyncCycle());
      }
    }
  }

  public getSyncState(): Readonly<WorkspaceSyncState> {
    return this.state.getState();
  }
}
