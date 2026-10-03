# ADR 0009: Conflict Resolution Strategy

**Status:** Proposed
**Date:** 2026-07-17

## Context
When external file systems (like a native disk modified by another editor, or a cloud source) diverge from the IDE's local `VirtualFileSystem` snapshot, a conflict arises during synchronization. Determining how to resolve these conflicts requires a decoupled, interchangeable mechanism.

## Decision
We delegate conflict resolution from the infrastructure-level `SyncProvider` to the domain-level `WorkspaceSyncEngine`. The `SyncEngine` interfaces with a generic `ConflictResolver Interface`. The specific implementation (e.g., `WorkspaceConflictDetector`) handles the actual isolation of corrupted or torn transactions.
ConflictResolver never mutates the VFS directly. It only produces WorkspaceOperations or ResolutionActions consumed by SyncEngine.

## Consequences
- **Pros:** `SyncProvider` implementations remain simple (they only stream events or snapshot hashes). The `SyncEngine` retains absolute authority over truth, applying conflict resolution policies consistently regardless of where the divergence originated.
- **Cons:** Requires standardizing a complex `WorkspaceConflict` DTO that can represent divergences across any generic provider.
