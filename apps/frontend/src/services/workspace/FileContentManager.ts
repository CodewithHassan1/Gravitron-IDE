// src/services/workspace/FileContentManager.ts

import { WorkspaceManagerImpl } from './WorkspaceManager';
import { WorkspaceEvents } from './WorkspaceEvents';
import { WorkspaceEventType } from './types';

export interface OpenFileBuffer {
  nodeId: string;
  path: string;
  content: string;
  dirty: boolean;
  lastSaved: number;
  lastSavedHash: string;
  lastDiskHash: string;
}

import { FileConflictManager } from './sync/FileConflictManager';

export class FileContentManager {
  private buffers: Map<string, OpenFileBuffer> = new Map();
  private saveQueue: Set<string> = new Set();
  private isSaving: boolean = false;
  private conflictManager: FileConflictManager;
  
  constructor(private workspaceManager: WorkspaceManagerImpl) {
    this.conflictManager = new FileConflictManager(workspaceManager);
    this.setupEventListeners();
  }

  private setupEventListeners() {
    WorkspaceEvents.on(WorkspaceEventType.WorkspaceClosed, () => {
      this.buffers.clear();
      this.saveQueue.clear();
    });

    WorkspaceEvents.on(WorkspaceEventType.FileRenamed, (event) => {
      const { nodeId, newPath } = event.payload!;
      const buffer = this.buffers.get(nodeId);
      if (buffer) {
        buffer.path = newPath;
      }
    });

    WorkspaceEvents.on(WorkspaceEventType.FileMoved, (event) => {
      const { nodeId, newPath } = event.payload!;
      const buffer = this.buffers.get(nodeId);
      if (buffer) {
        buffer.path = newPath;
      }
    });

    // We do NOT immediately delete the buffer on FileDeleted.
    // It remains in memory until explicitly closed.
  }

  public async openFile(nodeId: string): Promise<OpenFileBuffer> {
    if (this.buffers.has(nodeId)) {
      return this.buffers.get(nodeId)!;
    }

    const node = this.workspaceManager.getNode(nodeId);
    if (!node || node.type !== 'file') {
      throw new Error(`Cannot open file: node ${nodeId} not found or is not a file`);
    }

    const path = this.workspaceManager.getPath(nodeId);
    if (!path) {
      throw new Error(`Cannot resolve path for node ${nodeId}`);
    }

    let content = '';
    try {
      content = await this.workspaceManager.readFile(path);
    } catch (e) {
      console.error(`[FileContentManager] Failed to read file ${path}`, e);
      throw e;
    }

    const hash = await this.conflictManager.hashString(content);
    
    const buffer: OpenFileBuffer = {
      nodeId,
      path,
      content,
      dirty: false,
      lastSaved: Date.now(),
      lastSavedHash: hash,
      lastDiskHash: hash
    };

    this.buffers.set(nodeId, buffer);
    WorkspaceEvents.emit(WorkspaceEventType.FileOpened, { path, nodeId });
    return buffer;
  }

  public closeFile(nodeId: string): void {
    const buffer = this.buffers.get(nodeId);
    if (buffer) {
      this.buffers.delete(nodeId);
      this.saveQueue.delete(nodeId);
      WorkspaceEvents.emit(WorkspaceEventType.FileClosed, { path: buffer.path, nodeId });
    }
  }

  public getBuffer(nodeId: string): OpenFileBuffer | undefined {
    return this.buffers.get(nodeId);
  }

  public silentReload(nodeId: string, newContent: string): void {
    const buffer = this.buffers.get(nodeId);
    if (!buffer) return;
    
    this.conflictManager.hashString(newContent).then(hash => {
      buffer.content = newContent;
      buffer.dirty = false;
      buffer.lastSavedHash = hash;
      buffer.lastDiskHash = hash;
      WorkspaceEvents.emit(WorkspaceEventType.FileOpened, { path: buffer.path, nodeId }); // notify listeners of reload
    });
  }

  public handleExternalModification(path: string): void {
    this.conflictManager.handleExternalModification(path);
  }

  public getContent(nodeId: string): string {
    const buffer = this.buffers.get(nodeId);
    if (!buffer) {
      throw new Error(`Buffer not found for node ${nodeId}`);
    }
    return buffer.content;
  }

  public updateContent(nodeId: string, content: string): void {
    const buffer = this.buffers.get(nodeId);
    if (!buffer) {
      throw new Error(`Buffer not found for node ${nodeId}`);
    }
    buffer.content = content;
    buffer.dirty = true;
    WorkspaceEvents.emit(WorkspaceEventType.FileModified, { path: buffer.path, nodeId });
  }

  public async saveFile(nodeId: string): Promise<void> {
    const buffer = this.buffers.get(nodeId);
    if (!buffer || !buffer.dirty) {
      return;
    }

    this.saveQueue.add(nodeId);
    await this.processSaveQueue();
  }

  public async saveAll(): Promise<void> {
    Array.from(this.buffers.entries()).forEach(([nodeId, buffer]) => {
      if (buffer.dirty) {
        this.saveQueue.add(nodeId);
      }
    });
    await this.processSaveQueue();
  }

  public isDirty(nodeId: string): boolean {
    const buffer = this.buffers.get(nodeId);
    return buffer ? buffer.dirty : false;
  }

  private async processSaveQueue(): Promise<void> {
    if (this.isSaving || this.saveQueue.size === 0) {
      return;
    }

    this.isSaving = true;

    try {
      while (this.saveQueue.size > 0) {
        // Get the first item from the Set
        const nodeId = this.saveQueue.values().next().value as string;
        this.saveQueue.delete(nodeId);
        
        const buffer = this.buffers.get(nodeId);
        if (!buffer || !buffer.dirty) {
          continue;
        }

        try {
          await this.workspaceManager.writeFile(buffer.path, buffer.content);
          buffer.dirty = false;
          buffer.lastSaved = Date.now();
          const hash = await this.conflictManager.hashString(buffer.content);
          buffer.lastSavedHash = hash;
          buffer.lastDiskHash = hash;
          WorkspaceEvents.emit(WorkspaceEventType.FileSaved, { path: buffer.path, nodeId });
        } catch (error) {
          console.error(`[FileContentManager] Failed to save file ${buffer.path}`, error);
          // Re-add to queue or handle retry logic?
          // For now, leave dirty so the user can try again
        }
      }
    } finally {
      this.isSaving = false;
      
      // Check if more items were added while saving
      if (this.saveQueue.size > 0) {
        setTimeout(() => this.processSaveQueue(), 0);
      }
    }
  }
}
