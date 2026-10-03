# Architectural Invariants

Invariants are mathematical guarantees that the Workspace Engine strictly adheres to. These rules define the architectural bedrock of the IDE. They must never be broken by future contributors, and they are strictly enforced via the automated validation suite in CI.

## 1. Identity & Structure

- **UUIDs Never Change**: Once a `WorkspaceNode` is assigned a UUID, it remains identical forever. Moving, renaming, or modifying the node does NOT alter its UUID.
- **Single Root**: The Virtual File System (VFS) contains exactly one root node, possessing the UUID `root`.
- **No Cycles**: The directory tree structure is strictly acyclic. A node cannot be a descendant of itself.
- **Valid Parentage**: Every child node (except the root) points to exactly one valid, existing parent UUID.

## 2. Abstraction Boundaries

- **UI Isolation from Disk**: The React UI layer MUST NEVER directly import or interact with the native `FileSystemAccessAPI` or `IndexedDB`. All file operations must route through `WorkspaceManager`.
- **VFS Encapsulation**: The VFS internals, search indexes, and internal Queues/Maps are completely hidden. The UI layer receives only frozen, immutable DTOs (`Readonly<WorkspaceNode>`).
- **No Reverse Imports**: `Services` cannot import `UI` components. `Domain` cannot import `Services`. `Persistence` cannot import `Domain` logic.

## 3. Data Integrity & Persistence

- **Atomic Snapshots**: A workspace snapshot save is strictly atomic. The virtual file system is never written to disk in a partially complete state, preventing tearing.
- **Search Eventual Consistency**: The `WorkspaceSearch` engine is strictly read-only and relies exclusively on its memory cache and indices. It never mutates the underlying VFS, and is guaranteed to be eventually consistent with the VFS upon receiving asynchronous `fileEvent` signals.
- **Undo/Redo Stability**: Executing an Undo operation followed by a Redo operation guarantees a restoration to the exact identical snapshot state.

## 4. Operational Guarantees

- **Event Ordering**: Events emitted by `WorkspaceEvents` are synchronously dispatched to listeners in the exact sequential order they occurred. There are no race conditions in local event ordering.
- **Operation Identity**: Every mutation dispatched into the `WorkspaceSyncEngine` generates a globally unique `operationId`. Operations maintain their identity through the entire queue processing lifecycle.

## 5. Lifecycle Guarantees

- **Zero Active Timers on Close**: When `WorkspaceManager.closeWorkspace()` is resolved, the `WorkspaceSyncEngine` guarantees absolutely zero active setTimeouts, setIntervals, or floating promises.
- **Event Disposal**: Closing a workspace ensures that all Event listeners related to file operations return exactly to a count of zero.
- **Listener Isolation**: An unhandled exception thrown inside a subscribed `WorkspaceEvent` callback will be caught and logged. It will NEVER crash the central `WorkspaceEvents` bus or prevent subsequent callbacks from executing.
