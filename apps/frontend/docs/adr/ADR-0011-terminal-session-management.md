# ADR-0011: Terminal Session Management

## Status

Accepted

## Context

When an IDE is reloaded or temporarily disconnected from its backing server, active terminal sessions should not be instantly killed. Long-running processes (e.g., dev servers, builds) must survive UI restarts.

## Decision

We introduce the `TerminalRegistry` to act as the ultimate source of truth for terminal lifecycles.

- A `TerminalSession` must be mapped to an 8-state deterministic state machine (`Created`, `Initializing`, `Connecting`, `Running`, `Suspended`, `Closing`, `Closed`, `Disposed`).
- Network disconnects transition the session to `Suspended` rather than destroying it.
- `SessionPersistence` will save CWD, environment variables, layout, and metadata, but optionally skip deep scrollback buffer serialization to prevent IDB exhaustion.

## Consequences

- **Positive:** UI reloads no longer crash backend shell processes.
- **Positive:** Terminal layout state can be instantly restored on IDE boot (<250ms).
- **Negative:** Managing `Suspended` terminals requires a robust garbage collection routine to ensure orphaned backend processes do not leak system resources over time.
