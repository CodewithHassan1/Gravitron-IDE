// src/services/workspace/sync/WorkspaceConflictDetector.ts

import { WorkspaceOperation, WorkspaceOperationType } from './WorkspaceOperation';
import { VirtualFileSystem } from '../vfs/VirtualFileSystem';

export enum ConflictType {
  StaleTimestamp = 'StaleTimestamp',
  MissingFile = 'MissingFile',
  DuplicateCreation = 'DuplicateCreation',
  RenameCollision = 'RenameCollision',
}

export interface WorkspaceConflict {
  operationId: string;
  type: ConflictType;
  path: string;
  message: string;
}

export class WorkspaceConflictDetector {
  /**
   * Detects conflicts for a given operation against the current Virtual File System state.
   * Does NOT resolve conflicts, only returns a structured conflict object if one is detected.
   */
  public static detect(operation: WorkspaceOperation, vfs: VirtualFileSystem): WorkspaceConflict | null {
    switch (operation.type) {
      case WorkspaceOperationType.CreateFile:
      case WorkspaceOperationType.CreateFolder:
        if (vfs.resolve(operation.path)) {
          return {
            operationId: operation.id,
            type: ConflictType.DuplicateCreation,
            path: operation.path,
            message: `Cannot create ${operation.path} because it already exists.`,
          };
        }
        break;

      case WorkspaceOperationType.DeleteFile:
      case WorkspaceOperationType.DeleteFolder:
      case WorkspaceOperationType.WriteFile:
        if (!vfs.resolve(operation.path)) {
          return {
            operationId: operation.id,
            type: ConflictType.MissingFile,
            path: operation.path,
            message: `Target ${operation.path} does not exist in the virtual file system.`,
          };
        }
        // Could also check timestamp here if timestamps are sent in operation
        break;

      case WorkspaceOperationType.Rename:
        if (!vfs.resolve(operation.sourcePath)) {
          return {
            operationId: operation.id,
            type: ConflictType.MissingFile,
            path: operation.sourcePath,
            message: `Source ${operation.sourcePath} does not exist for rename.`,
          };
        }
        
        // For rename, check if the parent already has a node with the new name
        const srcId = vfs.resolve(operation.sourcePath);
        if (srcId) {
          const node = vfs.find(srcId);
          if (node && node.parentId) {
            const parent = vfs.find(node.parentId);
            if (parent) {
              const conflictId = parent.children.find(childId => {
                const child = vfs.find(childId);
                return child?.name === operation.newName;
              });
              if (conflictId) {
                return {
                  operationId: operation.id,
                  type: ConflictType.RenameCollision,
                  path: operation.sourcePath,
                  message: `A node named ${operation.newName} already exists in the same directory.`,
                };
              }
            }
          }
        }
        break;

      case WorkspaceOperationType.Move:
        if (!vfs.resolve(operation.sourcePath)) {
          return {
            operationId: operation.id,
            type: ConflictType.MissingFile,
            path: operation.sourcePath,
            message: `Source ${operation.sourcePath} does not exist for move.`,
          };
        }
        if (!vfs.resolve(operation.destinationPath)) {
          return {
            operationId: operation.id,
            type: ConflictType.MissingFile,
            path: operation.destinationPath,
            message: `Destination directory ${operation.destinationPath} does not exist for move.`,
          };
        }
        break;
    }

    return null; // No conflict detected
  }
}
