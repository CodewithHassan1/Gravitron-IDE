// src/services/workspace/sync/WorkspaceBatcher.ts

import {
  WorkspaceOperation,
  WorkspaceOperationType,
  WriteFileOperation,
} from './WorkspaceOperation';

export class WorkspaceBatcher {
  /**
   * Batches an array of operations into a compressed, logical sequence.
   * Collapses redundant operations (like multiple consecutive writes to the same file).
   */
  public static batch(operations: WorkspaceOperation[]): WorkspaceOperation[] {
    if (operations.length <= 1) return operations;

    const batched: WorkspaceOperation[] = [];
    const writeMap = new Map<string, number>(); // path -> index in batched array

    for (const op of operations) {
      if (op.type === WorkspaceOperationType.WriteFile) {
        // If we already have a WriteFile in the current batch for this path, replace it
        if (writeMap.has(op.path)) {
          const index = writeMap.get(op.path)!;
          batched[index] = op;
        } else {
          batched.push(op);
          writeMap.set(op.path, batched.length - 1);
        }
      } else {
        // For other operations, just append. If a file is renamed or deleted,
        // we should probably clear the write cache for that file, but for a
        // basic infrastructure batcher, we just append.
        if (
          op.type === WorkspaceOperationType.DeleteFile ||
          op.type === WorkspaceOperationType.Rename
        ) {
          const targetPath =
            op.type === WorkspaceOperationType.DeleteFile ? op.path : (op as any).sourcePath;
          if (writeMap.has(targetPath)) {
            writeMap.delete(targetPath);
          }
        }
        batched.push(op);
      }
    }

    return batched;
  }
}
