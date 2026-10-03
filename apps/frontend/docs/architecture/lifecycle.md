# Workspace Lifecycle

This document describes the phases of a workspace's existence during an IDE session, from initialization to disposal.

## 1. Workspace Initialization
When a user opens a project, `WorkspaceManager.openWorkspace()` is invoked.
- `workspace.loadingStarted` is emitted.
- `WorkspacePersistence` checks IndexedDB for an existing serialized snapshot of the root directory.
- **If found:** The snapshot is deserialized directly into the `VirtualFileSystem`, bypassing slow disk reads.
- **If missing:** The VFS initializes an empty root.
- `WorkspaceSearch` performs its initial indexing sweep of the VFS tree.
- A `SyncProvider` abstraction is attached to monitor external file system changes (e.g., native OS watchers or remote web sockets) and feeds operations to the `WorkspaceSyncEngine`.
- `workspace.opened` and `workspace.loadingFinished` are emitted.

## 2. Synchronization Lifecycle
Mutations to the file system follow a continuous, optimistic lifecycle:
- The user triggers an action (e.g., creating a file).
- `WorkspaceManager` updates the local `VirtualFileSystem` immediately (Optimistic UI).
- `WorkspaceEvents` broadcasts a `fileEvent` to immediately update Search and UI caches.
- `WorkspaceSyncEngine` enqueues the `WorkspaceOperation`.
- The `WorkspaceScheduler` debounces rapid operations (default: 500ms).
- A background `SyncCycle` runs, persisting the new snapshot to IndexedDB via `WorkspacePersistence`.

## 3. Recovery Lifecycle
If the IDE encounters an unhandled exception or power loss:
- On reboot, the `SyncProvider` compares the last known snapshot hash with the external truth (native disk or cloud).
- If divergences exist, the `SyncEngine` delegates them to the `ConflictResolver Interface`.
- The `WorkspaceConflictDetector` (a specific implementation of the interface) isolates corrupted or torn transactions.
- Offline operations stored in the queue are re-applied, synchronized, or presented to the user for manual resolution.

## 4. Persistence Lifecycle
Persistence is entirely non-blocking to the main thread.
- Serialized trees (`WorkspaceSnapshot`) are saved asynchronously.
- The state machine isolates failures, allowing graceful retries without locking the UI.

## 5. Disposal & Teardown
When a user closes the workspace or the IDE unloads:
- `WorkspaceManager.closeWorkspace()` is triggered.
- The `SyncProvider` halts external file watchers and remote socket connections.
- `WorkspaceSyncEngine.stop()` flushes the pending queue.
- `WorkspaceSearch` cache is explicitly invalidated and cleared.
- `WorkspaceEvents.clearAllListeners()` ensures no memory leaks or dangling UI closures remain.
- `workspace.closed` is emitted to safely dismount any lingering plugins.
