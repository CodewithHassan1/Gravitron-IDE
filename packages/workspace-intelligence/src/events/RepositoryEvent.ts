import { WorkspaceId, DocumentId, DirectoryId } from '../models/EntityIds';

export enum RepositoryEventType {
  FileAdded = 'FileAdded',
  FileModified = 'FileModified',
  FileRemoved = 'FileRemoved',
  FileRenamed = 'FileRenamed',
  DirectoryAdded = 'DirectoryAdded',
  DirectoryRemoved = 'DirectoryRemoved',
  ParseCompleted = 'ParseCompleted',
  GraphPatched = 'GraphPatched',
  SnapshotCommitted = 'SnapshotCommitted',
  RecoveryStarted = 'RecoveryStarted',
  RecoveryCompleted = 'RecoveryCompleted',
}

export interface BaseRepositoryEvent {
  type: RepositoryEventType;
  eventId: string;
  workspaceId: WorkspaceId;
  sequenceNumber: number;
  timestamp: number;
  causationId?: string; // Links to the RepositoryCommand or previous Event that caused this
  correlationId?: string;
  traceContext?: Record<string, string>;
}

export interface FileAddedEvent extends BaseRepositoryEvent {
  type: RepositoryEventType.FileAdded;
  documentId: DocumentId;
  path: string;
}

export interface FileModifiedEvent extends BaseRepositoryEvent {
  type: RepositoryEventType.FileModified;
  documentId: DocumentId;
}

export interface FileRemovedEvent extends BaseRepositoryEvent {
  type: RepositoryEventType.FileRemoved;
  documentId: DocumentId;
}

export interface FileRenamedEvent extends BaseRepositoryEvent {
  type: RepositoryEventType.FileRenamed;
  documentId: DocumentId;
  newPath: string;
}

export interface DirectoryAddedEvent extends BaseRepositoryEvent {
  type: RepositoryEventType.DirectoryAdded;
  directoryId: DirectoryId;
  path: string;
}

export interface DirectoryRemovedEvent extends BaseRepositoryEvent {
  type: RepositoryEventType.DirectoryRemoved;
  directoryId: DirectoryId;
}

export interface ParseCompletedEvent extends BaseRepositoryEvent {
  type: RepositoryEventType.ParseCompleted;
  documentId: DocumentId;
  parserId: string;
}

export interface GraphPatchedEvent extends BaseRepositoryEvent {
  type: RepositoryEventType.GraphPatched;
  patchCount: number;
  affectedGraphs: string[];
}

export interface SnapshotCommittedEvent extends BaseRepositoryEvent {
  type: RepositoryEventType.SnapshotCommitted;
  snapshotId: string;
  generation: number;
}

export interface RecoveryStartedEvent extends BaseRepositoryEvent {
  type: RepositoryEventType.RecoveryStarted;
  reason: string;
}

export interface RecoveryCompletedEvent extends BaseRepositoryEvent {
  type: RepositoryEventType.RecoveryCompleted;
  restoredSequenceNumber: number;
}

export type RepositoryEvent = 
  | FileAddedEvent
  | FileModifiedEvent
  | FileRemovedEvent
  | FileRenamedEvent
  | DirectoryAddedEvent
  | DirectoryRemovedEvent
  | ParseCompletedEvent
  | GraphPatchedEvent
  | SnapshotCommittedEvent
  | RecoveryStartedEvent
  | RecoveryCompletedEvent;
