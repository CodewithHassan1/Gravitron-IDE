export enum RepositoryEventType {
  WorkspaceOpened = 'WorkspaceOpened',
  WorkspaceClosed = 'WorkspaceClosed',
  WorkspaceReloaded = 'WorkspaceReloaded',
  FileCreated = 'FileCreated',
  FileDeleted = 'FileDeleted',
  FileMoved = 'FileMoved',
  FileModified = 'FileModified',
  FileRenamed = 'FileRenamed',
  DirectoryCreated = 'DirectoryCreated',
  DirectoryDeleted = 'DirectoryDeleted',
  WatcherStarted = 'WatcherStarted',
  WatcherStopped = 'WatcherStopped',
  IndexInvalidated = 'IndexInvalidated',
  RepositoryRefreshed = 'RepositoryRefreshed',
}

export interface RepositoryEventPayload {
  type: RepositoryEventType;
  timestamp: number;
  data?: any;
}
