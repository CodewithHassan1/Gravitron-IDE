# Public API Reference

This document serves as the canonical inventory for the officially supported public API of the Workspace Engine. All methods listed here cross the module boundary and adhere strictly to the rule of returning immutable Data Transfer Objects (DTOs).

## WorkspaceManager

The `WorkspaceManager` singleton is the primary orchestration façade for all interaction with the file system. UI components must interface through this manager.

### Lifecycle Methods

#### `openWorkspace(metadata: WorkspaceMetadata, handle: WorkspaceHandle): Promise<void>`
- **Inputs:** `WorkspaceMetadata` (id, name, uri, provider), `WorkspaceHandle` (native Handle reference).
- **Outputs:** Resolves when snapshot is loaded, VFS is initialized, and sync is started.
- **Errors:** `OPEN_FAILED` on bad handle or snapshot corruption.
- **Invariants:** Root node is cleared and re-initialized. Emits `WorkspaceOpened`.

#### `closeWorkspace(): Promise<void>`
- **Inputs:** None.
- **Outputs:** Resolves after stopping SyncEngine, clearing Search caches, and unbinding listeners.
- **Invariants:** Emits `WorkspaceClosed`. Active Workspace ID becomes `undefined`. No timers remain active.

#### `reloadWorkspace(): Promise<void>`
- **Inputs:** None.
- **Outputs:** Resolves after triggering a UI refresh.
- **Invariants:** Maintains current metadata/handle but resets internal VFS state if needed.

#### `restoreWorkspace(workspaceId: string): Promise<boolean>`
- **Inputs:** UUID of the workspace.
- **Outputs:** `true` if restored from local cache, `false` otherwise.

#### `getState(): Readonly<WorkspaceState>`
- **Outputs:** Full frozen snapshot of the workspace state metadata, handles, loading, and errors.

### Node Access Methods (Immutable Returns)

#### `getRoot(): Readonly<WorkspaceNode> | undefined`
- **Outputs:** Returns an `Object.freeze` cloned instance of the root node.
- **Invariants:** Cannot be mutated to affect the underlying VFS.

#### `getChildren(nodeId: string): ReadonlyArray<Readonly<WorkspaceNode>>`
- **Inputs:** Parent Node UUID.
- **Outputs:** Frozen array of cloned children.
- **Invariants:** Array and its items cannot be mutated.

#### `getNode(nodeId: string): Readonly<WorkspaceNode> | undefined`
- **Outputs:** Single frozen DTO of a node.

#### `resolvePath(path: string): string | undefined`
- **Outputs:** Translates absolute string path to unique UUID.

#### `getPath(nodeId: string): string | undefined`
- **Outputs:** Translates UUID back to absolute path.

### Mutation Methods (Operation Queuing)

All mutations execute optimistically on the Virtual File System, emit a `fileEvent` synchronously, and return a `WorkspaceOperationResult` Promise indicating success before the persistence batch catches up.

#### `createFile(path: string): Promise<WorkspaceOperationResult>`
- **Invariants:** Mutates VFS directly, emits Event, and enqueues `CreateFile` op.

#### `createFolder(path: string): Promise<WorkspaceOperationResult>`
- **Invariants:** Mutates VFS directly, emits Event, and enqueues `CreateFolder` op.

#### `delete(path: string): Promise<WorkspaceOperationResult>`
- **Invariants:** Resolves UUID, mutates VFS directly, emits `deleted` fileEvent, queues `DeleteFile/Folder` op.

#### `rename(sourcePath: string, newName: string): Promise<WorkspaceOperationResult>`
- **Invariants:** UUID remains identically mapped, emits Event, queues `Rename` op.

#### `move(sourcePath: string, destinationPath: string): Promise<WorkspaceOperationResult>`
- **Invariants:** UUID remains identically mapped, updates parent pointer, queues `Move` op.

#### `writeFile(path: string, content: string | Uint8Array): Promise<WorkspaceOperationResult>`
- **Invariants:** Queues `WriteFile` op for background sync.

#### `readFile(path: string): Promise<string>`
- **Outputs:** Retrieves contents natively or from indexedDB snapshot cache.

## WorkspaceSearch

#### `search(query: SearchQuery): Readonly<SearchResult>`
- **Inputs:** `SearchQuery` (string, maxResults, mode).
- **Outputs:** Frozen `SearchResult` object containing frozen items.
- **Invariants:** Does NOT access disk. Reads purely from in-memory cache and Tries.

## WorkspaceSyncEngine

#### `start(nativeHandle: any): void`
#### `stop(): void`
#### `enqueueOperation(operation: WorkspaceOperation): void`
#### `getSyncState(): Readonly<WorkspaceSyncState>`

## WorkspaceEvents

#### `on(eventType: string, callback: function): function`
- **Outputs:** Returns a disposable unsubscribe function.
- **Invariants:** Safely catches all errors inside subscriber callbacks to prevent Bus crashes.

#### `off(eventType: string, callback: function): void`
#### `emit(eventType: string, payload: any): void`
#### `clearAllListeners(): void`
