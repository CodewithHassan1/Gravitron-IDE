# ADR 0004: IndexedDB over LocalStorage

**Status:** Accepted
**Date:** 2026-07-17

## Context
The IDE must persist a highly complex Virtual File System tree, consisting of potentially tens of thousands of deeply nested WorkspaceNodes, along with their metadata, to disk. Browsers offer `LocalStorage`, `SessionStorage`, and `IndexedDB`.

## Decision
We chose `IndexedDB` as the persistent backend for `WorkspacePersistence`.

## Consequences
- **Pros:** Capable of storing large, structured cloneable objects (megabytes in size), fully asynchronous (non-blocking to the main thread), and highly robust.
- **Cons:** API is more verbose than `LocalStorage`, requiring a wrapper (like `idb`) to interact with via promises.
