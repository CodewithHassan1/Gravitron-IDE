# Architecture Sequence Diagrams

This document contains Mermaid sequence diagrams detailing the critical workflows of the Workspace Engine.

## 1. File Creation & Synchronization Flow

When a user creates a new file via the UI, the operation flows downward without immediate local VFS mutation until the Sync Engine processes the batch.

```mermaid
sequenceDiagram
    participant UI as React Explorer
    participant WM as WorkspaceManager
    participant Sync as WorkspaceSyncEngine
    participant VFS as VirtualFileSystem
    participant EventBus as WorkspaceEvents
    participant DB as IndexedDB

    UI->>WM: createFile('/src/new.ts')
    WM->>Sync: enqueueOperation(CreateFile)
    Note over Sync: State: Pending (queued)
    
    Sync->>Sync: executeSyncCycle() (batched)
    Sync->>VFS: createFile('/src/new.ts')
    VFS-->>Sync: WorkspaceNode created
    Sync->>EventBus: emit('fileEvent', { created, node })
    EventBus-->>UI: Trigger React Re-render
    
    Sync->>DB: saveSnapshot(VFS)
    DB-->>Sync: success
    Note over Sync: State: Idle
```

## 2. Workspace Open Flow

```mermaid
sequenceDiagram
    participant UI as IDEProvider
    participant WM as WorkspaceManager
    participant DB as IndexedDB
    participant EventBus as WorkspaceEvents

    UI->>WM: openWorkspace(metadata, handle)
    WM->>EventBus: emit('workspace.loadingStarted')
    WM->>DB: loadSnapshot(workspaceId)
    
    alt Snapshot exists
        DB-->>WM: WorkspaceSnapshot
        WM->>WM: deserialize to VFS
    else No Snapshot
        DB-->>WM: null
        WM->>WM: initialize empty VFS root
    end
    
    WM->>EventBus: emit('workspace.opened')
    WM->>EventBus: emit('workspace.loadingFinished')
    WM-->>UI: Promise.resolve()
```

## 3. Open File Flow

```mermaid
sequenceDiagram
    participant UI as Monaco/Editor
    participant WM as WorkspaceManager
    participant DB as IndexedDB

    UI->>WM: readFile('/src/index.ts')
    WM->>DB: fetch native handle / indexed object
    DB-->>WM: file contents string
    WM-->>UI: Promise.resolve("content...")
```

## 4. Save File Flow

```mermaid
sequenceDiagram
    participant UI as Monaco/Editor
    participant WM as WorkspaceManager
    participant Sync as WorkspaceSyncEngine
    participant DB as IndexedDB

    UI->>WM: writeFile('/src/index.ts', content)
    WM->>Sync: enqueueOperation(WriteFile)
    WM-->>UI: Promise<WorkspaceOperationResult>(success)
    
    Note over Sync: State: Pending (queued)
    Sync->>Sync: executeSyncCycle() (batched)
    Sync->>DB: flush writeFile payload to disk
    DB-->>Sync: success
    Sync->>DB: saveSnapshot(VFS)
```

## 5. Rename Folder Flow

```mermaid
sequenceDiagram
    participant UI as Explorer
    participant WM as WorkspaceManager
    participant VFS as VirtualFileSystem
    participant EventBus as WorkspaceEvents
    participant Sync as WorkspaceSyncEngine

    UI->>WM: rename('/src', 'lib')
    WM->>VFS: rename('/src', 'lib')
    VFS->>VFS: Update path prefixes for all descendants
    VFS-->>WM: UUID
    WM->>EventBus: emit('fileEvent', { renamed, id: UUID, newPath })
    WM->>Sync: enqueueOperation(Rename)
    WM-->>UI: Promise<WorkspaceOperationResult>(success)
    
    Note over EventBus: SearchEngine updates index incrementally
```

## 6. Fast Fuzzy Search Query Flow

```mermaid
sequenceDiagram
    participant UI as Quick Input
    participant WM as WorkspaceManager
    participant Search as WorkspaceSearch
    participant Cache as SearchCache
    participant Index as WorkspaceIndex

    UI->>WM: getSearchEngine().search('index.ts')
    WM->>Search: search(query)
    
    Search->>Cache: get(query)
    alt Cache Hit
        Cache-->>Search: Return cached SearchResult
    else Cache Miss
        Search->>Index: execute fuzzy match logic
        Index-->>Search: Array<SearchResultItem>
        Search->>Search: Truncate & Freeze Result
        Search->>Cache: set(query, frozenResult)
    end
    Search-->>WM: Readonly<SearchResult>
    WM-->>UI: Display Results
```
