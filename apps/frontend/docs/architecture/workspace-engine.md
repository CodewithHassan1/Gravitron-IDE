# Workspace Engine Architecture

The Workspace Engine is the canonical, centralized authority for managing the workspace hierarchy, virtual file system, and persistence within the IDE.

## Responsibilities

- Provide a unified, centralized point of access for all file operations (CRUD).
- Serve as a Virtual File System (VFS) to map files, folders, and operations regardless of the underlying environment (e.g. Browser File System Access API, IndexedDB).
- Persist metadata, project state, and cached node hierarchies to `IndexedDB`.
- Broadcast file and directory updates via a synchronized `WorkspaceEvents` bus to allow reactive UI updates.
- Queue, batch, and execute background synchronizations to coordinate local VFS state with persistent storage.

## Public APIs

The primary entry point is the `WorkspaceManager` singleton.

- **Lifecycle:** `openWorkspace`, `closeWorkspace`, `reloadWorkspace`, `restoreWorkspace`.
- **Node Access:** `getRoot()`, `getChildren(nodeId)`, `getNode(nodeId)`, `resolvePath(path)`, `getPath(nodeId)`.
- **Intended Mutations:** `createFile(path)`, `createFolder(path)`, `delete(path)`, `rename(source, dest)`, `move(source, dest)`, `writeFile(path, content)`.
- **Event Bus:** `onEvent(eventType, callback)` acts as the internal dispatcher.

## Dependency Rules

- **One-Way Strict Dependency Graph:** `UI -> Services -> Domain -> Persistence`.
- UI Components (React, Zustand) MUST NOT be imported into `WorkspaceManager` or any service.
- The VFS should NOT be exposed directly to the UI layer. All UI components MUST consume `WorkspaceManager` facade methods.

## Extension Points

- **Adapters (Removed during Commit 8 but structurally supported):** The architecture allows injection of distinct providers for native or local fallbacks.
- **Sync Operations:** `WorkspaceOperationQueue` supports extending background operations for cloud syncing.
- **Search Engine Integration:** Supports extension through the separate `WorkspaceSearch` pipeline using the `WorkspaceManager.getSearchEngine()` method.

## Lifecycle

1. Application calls `WorkspaceManager.openWorkspace(metadata, nativeHandle)`.
2. Workspace Engine initializes `VirtualFileSystem` and loads previous snapshots from `WorkspacePersistence`.
3. `WorkspaceSyncEngine` starts and attaches a watcher to the native file handle (if provided).
4. `WorkspaceEvents.WorkspaceOpened` is emitted.
5. All file operations queue into the `WorkspaceSyncEngine` batch processing.
6. Upon `WorkspaceManager.closeWorkspace()`, all timers, queue subscriptions, and event broadcasts are cleaned up cleanly.

## Ownership

- **Location:** `src/services/workspace/`
- **Maintainers:** Core IDE Architecture Team.
