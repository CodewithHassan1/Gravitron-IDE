# Event Catalog

The Workspace Engine operates on a reactive, event-driven architecture using `WorkspaceEvents` and `systemEventBus`.

## Lifecycle Events (WorkspaceEvents)

| Event                       | Trigger                                           | Payload                  | Consumers                                 |
| --------------------------- | ------------------------------------------------- | ------------------------ | ----------------------------------------- |
| `workspace.loadingStarted`  | `WorkspaceManager.openWorkspace()` begins         | `{ workspaceId }`        | `IDEProvider` (shows loading spinner)     |
| `workspace.loadingFinished` | `openWorkspace()` or `reloadWorkspace()` finishes | `{ workspaceId }`        | `IDEProvider` (hides loading spinner)     |
| `workspace.opened`          | Workspace successfully loaded and initialized     | `{ workspaceId }`        | `IDEProvider`, Plugins                    |
| `workspace.closed`          | Workspace teardown completed                      | `{ workspaceId }`        | `IDEProvider`, `PluginManager`, Telemetry |
| `workspace.reloaded`        | Workspace data successfully reloaded              | `{ workspaceId }`        | `IDEProvider`                             |
| `workspace.changed`         | Root reference changed                            | `undefined`              | React UI components                       |
| `workspace.error`           | An unhandled error occurred during load/sync      | `{ workspaceId, error }` | Global Error Boundaries                   |

## Synchronization & Snapshot Events (WorkspaceEvents)

Emitted internally by the `WorkspaceSyncEngine` and `WorkspacePersistence`.

| Event              | Trigger                                          | Payload                              | Consumers                           |
| ------------------ | ------------------------------------------------ | ------------------------------------ | ----------------------------------- |
| `SyncStarted`      | Batch scheduler begins processing queue          | `{ timestamp }`                      | Status Bar (shows sync icon)        |
| `SyncCompleted`    | Operation queue flushed successfully             | `{ timestamp, operationsProcessed }` | Status Bar, Telemetry               |
| `SyncFailed`       | Persistent error during sync                     | `{ error }`                          | Notification System                 |
| `ConflictDetected` | Conflict encountered with disk                   | `WorkspaceConflict` Object           | UI Conflict Resolver                |
| `SnapshotSaving`   | Persistence begins serializing the VFS tree      | `{ timestamp }`                      | Telemetry                           |
| `SnapshotSaved`    | Persistence successfully saves tree to IndexedDB | `{ version, size }`                  | Status Bar                          |
| `SnapshotFailed`   | Persistence encounters IDB storage quota limit   | `{ error }`                          | Notification System, Crash Reporter |

## File Events (WorkspaceEvents)

Emitted by `WorkspaceManager` (Optimistically) whenever a mutation is cleanly applied to the `VirtualFileSystem`.

| Event                 | Trigger                               | Payload Structure                                              | Consumers                              |
| --------------------- | ------------------------------------- | -------------------------------------------------------------- | -------------------------------------- |
| `fileEvent` (created) | `CreateFile` / `CreateFolder` applied | `Readonly<{ type: 'created', node: Readonly<WorkspaceNode> }>` | Explorer UI, `WorkspaceSearch`         |
| `fileEvent` (deleted) | `DeleteFile/Folder` applied           | `Readonly<{ type: 'deleted', id: string }>`                    | Explorer UI, Monaco, `WorkspaceSearch` |
| `fileEvent` (renamed) | `Rename` applied                      | `Readonly<{ type: 'renamed', id: string, newName, newPath }>`  | Explorer UI, `WorkspaceSearch`         |
| `fileEvent` (moved)   | `Move` applied                        | `Readonly<{ type: 'moved', id: string, newParentId: string }>` | Explorer UI, `WorkspaceSearch`         |

## System Events (systemEventBus)

Used for decoupling top-level IDE subsystems.

| Event                  | Trigger                                     | Payload                             | Consumers                      |
| ---------------------- | ------------------------------------------- | ----------------------------------- | ------------------------------ |
| `search.started`       | Fuzzy search initiates                      | `{}`                                | Search UI                      |
| `search.completed`     | Fuzzy search completes                      | `{}`                                | Search UI                      |
| `command.registered`   | CommandRegistry registers a command         | `{ id: string, shortcut?: string }` | `ShortcutManager`              |
| `command.unregistered` | CommandRegistry removes a command           | `{ id: string }`                    | `ShortcutManager`              |
| `command.executed`     | A command successfully runs                 | `{ commandId: string }`             | Telemetry                      |
| `navigation.changed`   | Active file or panel changes                | `{}`                                | Navigation Breadcrumbs         |
| `context.changed`      | System context shifts (e.g. editor focused) | `{}`                                | ContextEngine rules evaluation |
