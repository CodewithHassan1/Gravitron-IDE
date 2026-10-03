# Architecture State Machines

This document illustrates the internal state machines of the primary managers and engines within the Workspace system.

## WorkspaceSyncEngine State Machine

The sync engine handles transitions automatically via `WorkspaceSyncState.ts`.

```mermaid
stateDiagram-v2
    [*] --> Offline: engine.stop()
    Offline --> Idle: engine.start()
    
    Idle --> Syncing: enqueueOperation() (via Scheduler)
    Syncing --> Idle: sync complete (success)
    
    Syncing --> Conflict: detect(conflict) == true
    Conflict --> Idle: User resolves conflict & retries
    
    Syncing --> Failed: Unhandled Exception during saveSnapshot()
    Failed --> Syncing: auto-retry / manual-retry
```

## WorkspaceManager State Machine

Represents the high-level `WorkspaceState` exposed to the React UI provider (`IDEProvider.tsx`).

```mermaid
stateDiagram-v2
    [*] --> NoWorkspaceOpened: default
    NoWorkspaceOpened --> Loading: openWorkspace()
    
    Loading --> Active: snapshot deserialized & VFS ready
    Loading --> Error: snapshot corruption or disk error
    
    Active --> Reloading: reloadWorkspace()
    Reloading --> Active: success
    
    Active --> NoWorkspaceOpened: closeWorkspace()
    Error --> NoWorkspaceOpened: closeWorkspace()
```
