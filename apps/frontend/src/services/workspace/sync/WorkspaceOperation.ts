// src/services/workspace/sync/WorkspaceOperation.ts

export enum WorkspaceOperationType {
  CreateFile = 'CreateFile',
  DeleteFile = 'DeleteFile',
  WriteFile = 'WriteFile',
  CreateFolder = 'CreateFolder',
  DeleteFolder = 'DeleteFolder',
  Rename = 'Rename',
  Move = 'Move',
}

export interface BaseOperation {
  id: string; // Unique ID for the operation
  type: WorkspaceOperationType;
  timestamp: number;
}

export interface CreateFileOperation extends BaseOperation {
  type: WorkspaceOperationType.CreateFile;
  path: string;
}

export interface DeleteFileOperation extends BaseOperation {
  type: WorkspaceOperationType.DeleteFile;
  path: string;
}

export interface WriteFileOperation extends BaseOperation {
  type: WorkspaceOperationType.WriteFile;
  path: string;
  content?: string | Uint8Array; // Might be deferred to actual write, but typically included
}

export interface CreateFolderOperation extends BaseOperation {
  type: WorkspaceOperationType.CreateFolder;
  path: string;
}

export interface DeleteFolderOperation extends BaseOperation {
  type: WorkspaceOperationType.DeleteFolder;
  path: string;
}

export interface RenameOperation extends BaseOperation {
  type: WorkspaceOperationType.Rename;
  sourcePath: string;
  newName: string;
}

export interface MoveOperation extends BaseOperation {
  type: WorkspaceOperationType.Move;
  sourcePath: string;
  destinationPath: string;
}

export type WorkspaceOperation =
  | CreateFileOperation
  | DeleteFileOperation
  | WriteFileOperation
  | CreateFolderOperation
  | DeleteFolderOperation
  | RenameOperation
  | MoveOperation;

export function createOperationId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15);
}
