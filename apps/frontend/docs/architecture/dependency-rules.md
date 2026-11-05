# Architectural Dependency Rules

To maintain a clean and scalable architecture, the Workspace Engine enforces strict, one-way dependency rules. Violations of these rules will cause the CI pipeline's `madge` dependency check to fail.

## The Dependency Graph

The overarching rule is: **Dependencies may only flow downward through approved layers. Lower-level layers must never depend on higher-level layers.**

```
UI Layer
   ↓
Application Layer (WorkspaceManager, CommandRegistry)
   ↓
Domain Engines (Search, VFS, Sync, Events)
   ↓
Persistence Layer (IndexedDB / File System APIs / SyncProviders)
```

## Specific Constraints

1. **Zero Circular Dependencies**: Two files may never import each other, directly or indirectly.
2. **Domain Isolation**:
   - `VirtualFileSystem`, `WorkspaceSyncEngine`, and `WorkspaceSearch` must never import from the `UI` components.
   - `VirtualFileSystem` must never import `IndexedDB` or Native APIs. It exists purely in memory.
3. **Persistence Isolation**:
   - `WorkspacePersistence` implements storage. It cannot import React, Monaco, or the Explorer.
4. **SyncProvider Abstraction**:
   - `SyncProvider` belongs strictly to the Infrastructure / Persistence layer.
   - **Allowed**: `SyncEngine` interfaces with an abstract `SyncProvider Interface`, implemented by `LocalFSProvider`, `CloudProvider`, etc.
   - **Forbidden**: The `VFS`, `Search`, or `UI` layers importing `LocalFSProvider` or any native APIs directly.
5. **Adapter Thinness**:
   - Any adapter bridging legacy code to the new engine must act as a shim. It must not house its own business logic or maintain persistent state.
6. **Event Decoupling**:
   - High-level systems (like Shortcuts and Commands) must communicate via `SystemEvents` rather than importing each other directly, preventing tight coupling across distinct subsystems.
