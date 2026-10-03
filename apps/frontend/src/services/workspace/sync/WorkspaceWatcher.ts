// src/services/workspace/sync/WorkspaceWatcher.ts

import { WorkspaceOperation, WorkspaceOperationType, createOperationId } from './WorkspaceOperation';

export interface WatcherOptions {
  pollingIntervalMs?: number;
}

/**
 * Abstracts native browser filesystem watching.
 * Currently uses polling as a fallback since File System Observer API is not fully standardized.
 */
export class WorkspaceWatcher {
  private nativeHandle: any | null = null;
  private onEvent: ((operation: WorkspaceOperation) => void) | null = null;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number;

  constructor(options: WatcherOptions = {}) {
    this.intervalMs = options.pollingIntervalMs ?? 5000;
  }

  /**
   * Starts watching the given directory handle.
   */
  public watch(handle: any, onEvent: (operation: WorkspaceOperation) => void): void {
    if (this.pollingTimer) this.stop();
    
    this.nativeHandle = handle;
    this.onEvent = onEvent;

    // Simulate watching by polling (In a real implementation, we'd recursively scan timestamps)
    // For this infrastructure commit, we just set up the polling timer.
    this.pollingTimer = setInterval(() => this.poll(), this.intervalMs);
  }

  /**
   * Stops the watcher.
   */
  public stop(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.nativeHandle = null;
    this.onEvent = null;
  }

  /**
   * Manual trigger to refresh / poll for changes
   */
  public async poll(): Promise<void> {
    if (!this.nativeHandle || !this.onEvent) return;

    // Note: Recursive handle traversal is required to detect deep changes
    // comparing against a cached metadata snapshot.
    // When differences are found, emit them via this.onEvent(...)
  }

  // --- Helpers to simulate events for internal mutations ---
  
  public emitLocalCreateFile(path: string) {
    this.emit({ type: WorkspaceOperationType.CreateFile, id: createOperationId(), timestamp: Date.now(), path });
  }

  public emitLocalWriteFile(path: string, content?: string | Uint8Array) {
    this.emit({ type: WorkspaceOperationType.WriteFile, id: createOperationId(), timestamp: Date.now(), path, content });
  }

  public emitLocalDeleteFile(path: string) {
    this.emit({ type: WorkspaceOperationType.DeleteFile, id: createOperationId(), timestamp: Date.now(), path });
  }

  public emitLocalCreateFolder(path: string) {
    this.emit({ type: WorkspaceOperationType.CreateFolder, id: createOperationId(), timestamp: Date.now(), path });
  }

  public emitLocalDeleteFolder(path: string) {
    this.emit({ type: WorkspaceOperationType.DeleteFolder, id: createOperationId(), timestamp: Date.now(), path });
  }

  public emitLocalRename(sourcePath: string, newName: string) {
    this.emit({ type: WorkspaceOperationType.Rename, id: createOperationId(), timestamp: Date.now(), sourcePath, newName });
  }

  public emitLocalMove(sourcePath: string, destinationPath: string) {
    this.emit({ type: WorkspaceOperationType.Move, id: createOperationId(), timestamp: Date.now(), sourcePath, destinationPath });
  }

  private emit(operation: WorkspaceOperation) {
    if (this.onEvent) {
      this.onEvent(operation);
    }
  }
}
