# ADR 0008: Layered Architecture

**Status:** Accepted
**Date:** 2026-07-17

## Context
As the IDE expanded, early iterations tightly coupled UI rendering with mock file services and repository layers. This caused massive unmaintainability and blocked offline support or collaborative features.

## Decision
We enforce a strict, 4-tier Layered Architecture enforcing a one-way dependency graph:
1. **UI Layer** (React, Components)
2. **Application Layer** (WorkspaceManager, CommandRegistry)
3. **Domain Engines** (VFS, Search, Sync, Events)
4. **Persistence Layer** (IndexedDB, Native Handles)

## Consequences
- **Pros:** A completely predictable acyclic graph validated continuously in CI by `madge`.
- **Cons:** Some tasks require writing passing-through code inside the facade (`WorkspaceManager` in the Application Layer) to bridge the UI to the deeper engine layers.
