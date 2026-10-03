# Architecture Extension Points

The Workspace Engine defines rigid boundaries to prevent tight coupling, but it is explicitly designed to support robust enterprise features. This document outlines exactly where future capabilities should integrate without violating the dependency graph.

## 1. Language Server Protocol (LSP) Integration

**Location:** `src/services/editor/lsp/`
**Dependency Path:** `LSP Service -> WorkspaceManager`
**Rules:**
- The LSP integration must NEVER access the VFS directly.
- It should read file contents using `WorkspaceManager.readFile()`.
- It should listen to `WorkspaceEvents.on('fileEvent')` to synchronize the remote LSP server's tree with the local VFS.
- Diagnostics and hovers are provided to the `MonacoEditor` wrapper.

## 2. Git & Source Control

**Location:** `src/services/scm/`
**Dependency Path:** `GitManager -> WorkspaceManager`
**Rules:**
- Git status calculations should traverse `WorkspaceManager.getChildren()`.
- Diffing should fetch disk files via `WorkspaceManager.readFile()`.
- Uncommitted file changes should hook into the editor's dirty buffers (`ModelManager`).
- Committing pushes the final output via `WorkspaceSyncEngine`.

## 3. Semantic / Vector Search

**Location:** `src/services/workspace/search/`
**Dependency Path:** `SemanticSearch -> WorkspaceManager.getSearchEngine()`
**Rules:**
- Semantic embedding logic should live alongside the fast fuzzy search.
- It must observe the same `fileEvent` payload to invalidate and re-embed documents.
- Results should be merged into the standard `SearchResult` object.

## 4. AI Services

**Location:** `src/services/ai/`
**Dependency Path:** `AI Assistant -> WorkspaceManager` & `CommandRegistry`
**Rules:**
- AI tools must not bypass the standard mutation functions. If an AI refactors code, it must enqueue `WorkspaceManager.writeFile()`.
- AI intent mapping (e.g. "open this file") should fire via `CommandRegistry.executeCommand()`.

## 5. Collaborative Editing

**Location:** `src/services/workspace/sync/providers/`
**Dependency Path:** `CollabProvider -> WorkspaceSyncEngine -> WorkspaceOperationQueue`
**Rules:**
- Conflict resolution happens inside `WorkspaceConflictDetector`.
- Remote operational transformations (OT) or CRDT states inject synthetic `WorkspaceOperation` entries into the Queue.
- The VFS treats remote and local actions symmetrically.

## 6. Alternative Persistence Providers

**Location:** `src/services/workspace/persistence/`
**Dependency Path:** `WorkspaceManager -> PersistenceAdapter -> IndexedDB / CloudStore`
**Rules:**
- `WorkspacePersistence` can be extended into an interface to support remote storage (e.g., S3).
- The SyncEngine does not care where the snapshot is serialized to, provided it fulfills the `saveSnapshot` promise.
