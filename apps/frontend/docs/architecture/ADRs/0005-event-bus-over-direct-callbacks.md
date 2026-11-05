# ADR 0005: Event Bus over Direct Callbacks

**Status:** Accepted
**Date:** 2026-07-17

## Context

Various decoupled subsystems (UI Explorer, Search Engine, Sync Queue, Plugin system) all need to know exactly when a file is created, moved, renamed, or deleted in order to update their respective UI states or memory caches.

## Decision

We implemented a strict publish/subscribe model via `WorkspaceEvents` (specifically the `fileEvent` channel) and `systemEventBus`, rather than passing direct callbacks or relying on React Context to trigger non-UI systems.

## Consequences

- **Pros:** Completely eliminates circular dependencies. Search Engine and Sync Engine do not need to import each other. Subsystems can safely attach or detach based on their lifecycle.
- **Cons:** Tracing the exact origin of a file change can be marginally harder to debug without robust telemetry logs.
