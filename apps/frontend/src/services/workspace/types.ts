// src/services/workspace/types.ts
import {
  FileCreatedEventDTO,
  FileDeletedEventDTO,
  FileRenamedEventDTO,
  FileMovedEventDTO,
} from './dto/events';
export type { FileCreatedEventDTO, FileDeletedEventDTO, FileRenamedEventDTO, FileMovedEventDTO };

export type WorkspaceProviderType = 'browser' | 'electron' | 'remote' | 'memory';

export interface WorkspaceHandle {
  /** The native file system directory handle (if browser), or opaque reference */
  nativeHandle: any;
}

export interface WorkspaceCapabilities {
  explorer: boolean;
  recursiveSearch: boolean;
  git: boolean;
  terminal: boolean;
  multipleRoots: boolean;
  writable: boolean;
}

export type WorkspaceType = 'empty' | 'file' | 'directory' | 'multi-root' | 'remote' | string;

export interface WorkspaceMetadata {
  id: string;
  name: string;
  uri: string;
  provider: WorkspaceProviderType;
  lastOpened: number;
  type: WorkspaceType;
  capabilities: WorkspaceCapabilities;
}

export interface WorkspaceSnapshot {
  version: number;
  nodes: any[]; // Will be WorkspaceNode[] but we keep any here or import it
}

export enum WorkspaceLifecycleState {
  Empty = 'Empty',
  Opening = 'Opening',
  Initializing = 'Initializing',
  Ready = 'Ready',
  Closing = 'Closing',
  Error = 'Error',
}

export interface IWorkspaceServiceLifecycle {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  reset(): Promise<void>;
  restore?(): Promise<void>;
}

export interface WorkspaceState {
  metadata: WorkspaceMetadata | null;
  handle: WorkspaceHandle | null;
  snapshot: WorkspaceSnapshot | null;
  isLoading: boolean; // Deprecated by lifecycleState, keep for now or remove? Let's remove. Wait, might be used elsewhere.
  lifecycleState: WorkspaceLifecycleState;
  error: WorkspaceError | null;
}

export interface WorkspaceError {
  code: string;
  message: string;
  details?: any;
}

export enum WorkspaceEventType {
  WorkspaceOpened = 'workspace_opened',
  WorkspaceClosed = 'workspace_closed',
  FileCreated = 'file_created',
  FileDeleted = 'file_deleted',
  FileChanged = 'file_changed', // external change
  FolderLoaded = 'folder_loaded',
  WorkspaceUpdated = 'workspace_updated',

  FileOpened = 'file_opened',
  FileModified = 'file_modified', // editor change
  FileSaved = 'file_saved',
  FileClosed = 'file_closed',

  FileRenamed = 'file_renamed',
  FileMoved = 'file_moved',
  FolderCreated = 'folder_created',
  FolderDeleted = 'folder_deleted',
  WorkspaceNavigate = 'workspace_navigate',
}

export interface WorkspaceOperationResult {
  success: boolean;
  operationId: string;
  error?: string;
}

export interface FileOperationResult {
  success: boolean;
  path: string;
  error?: string;
  timestamp: number;
}

export type WorkspaceEventPayloads = {
  [WorkspaceEventType.WorkspaceOpened]: { workspaceId: string };
  [WorkspaceEventType.WorkspaceClosed]: { workspaceId: string };
  [WorkspaceEventType.FileCreated]: { path: string; nodeId: string };
  [WorkspaceEventType.FileDeleted]: { path: string; nodeId: string };
  [WorkspaceEventType.FileChanged]: { path: string };
  [WorkspaceEventType.FolderLoaded]: { folderId: string };
  [WorkspaceEventType.WorkspaceUpdated]: undefined;

  [WorkspaceEventType.FileOpened]: { path: string; nodeId: string };
  [WorkspaceEventType.FileModified]: { path: string; nodeId: string };
  [WorkspaceEventType.FileSaved]: { path: string; nodeId: string };
  [WorkspaceEventType.FileClosed]: { path: string; nodeId: string };

  [WorkspaceEventType.FileRenamed]: { oldPath: string; newPath: string; nodeId: string };
  [WorkspaceEventType.FileMoved]: { oldPath: string; newPath: string; nodeId: string };
  [WorkspaceEventType.FolderCreated]: { path: string; nodeId: string };
  [WorkspaceEventType.FolderDeleted]: { path: string; nodeId: string };
  [WorkspaceEventType.WorkspaceNavigate]: { targetUrl: string };

  fileEvent: FileCreatedEventDTO | FileDeletedEventDTO | FileRenamedEventDTO | FileMovedEventDTO;
  SnapshotSaving: { timestamp: number };
  SnapshotSaved: { version: number; size?: number };
  SnapshotFailed: { error: string };
  TreeRestored: { timestamp: number; nodeCount?: number };
};

export interface WorkspaceEvent<
  T extends keyof WorkspaceEventPayloads = keyof WorkspaceEventPayloads,
> {
  type: T;
  timestamp: number;
  payload?: WorkspaceEventPayloads[T];
}
