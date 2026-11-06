# ADR 0006: Snapshot History

**Status:** Accepted
**Date:** 2026-07-17

## Context

A persistent file system cache needs a mechanism to maintain reliability in the event of IDE crashes, unexpected browser closures, or power loss during a write cycle.

## Decision

We utilize a Snapshot Strategy for the Virtual File System tree and workspace metadata. The entire serialized directory structure and state is treated as a single immutable snapshot with an associated timestamp/version.

_(Note: This applies purely to structure and metadata. Future implementations will store raw file contents in a separate content-addressable Blob/Chunk storage layer.)_

## Consequences

- **Pros:** Guarantees atomic restores. The VFS is never partially rebuilt or left in a torn state. Recovery guarantees structural integrity.
- **Cons:** Serializing and saving the entire tree for minor structural modifications incurs a slightly higher IndexedDB write cost, which we mitigate through debounce scheduling in the `WorkspaceScheduler`.
