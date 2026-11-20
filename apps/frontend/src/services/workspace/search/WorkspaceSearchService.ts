// src/services/workspace/search/WorkspaceSearchService.ts

import { SearchQuery } from './SearchQuery';
import { SearchResult, WorkerMessage, WorkerResponse, IndexNodePayload } from './SearchTypes';
import { SearchIndex } from './SearchIndex';
import { VirtualFileSystem } from '../vfs/VirtualFileSystem';
import { WorkspaceEvents } from '../WorkspaceEvents';
import { WorkspaceEventType, WorkspaceEvent } from '../types';

export class WorkspaceSearchService {
  private vfs: VirtualFileSystem;
  private worker: Worker | null = null;
  private directIndex: SearchIndex = new SearchIndex();
  private useDirectIndex = false;
  private pendingSearches = new Map<
    string,
    { resolve: (results: SearchResult[]) => void; reject: (err: any) => void }
  >();
  private messageIdCounter = 0;

  constructor(vfs: VirtualFileSystem) {
    this.vfs = vfs;
    this.initialize();
  }

  public initialize(): void {
    if (this.worker || this.useDirectIndex) return;

    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      this.fallbackToDirectIndex();
      this.attachWorkspaceListeners();
      return;
    }

    try {
      this.worker = new Worker(new URL('./SearchWorker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = (err: any) => {
        const errorDetails = {
          message: err?.message || err?.type || 'Unknown worker error',
          filename: err?.filename,
          lineno: err?.lineno,
          colno: err?.colno,
          error: err?.error,
        };
        console.warn(
          '[WorkspaceSearchService] Worker error, switching to direct index fallback:',
          errorDetails
        );
        this.fallbackToDirectIndex();
      };
    } catch (err: any) {
      console.warn(
        '[WorkspaceSearchService] Failed to create Worker, switching to direct index fallback:',
        err?.message || err
      );
      this.fallbackToDirectIndex();
    }

    this.attachWorkspaceListeners();
  }

  private attachWorkspaceListeners(): void {
    WorkspaceEvents.on(WorkspaceEventType.WorkspaceOpened, this.handleWorkspaceOpened);
    WorkspaceEvents.on(WorkspaceEventType.WorkspaceClosed, this.handleWorkspaceClosed);
    WorkspaceEvents.on(WorkspaceEventType.FolderLoaded, this.handleFolderLoaded);
    WorkspaceEvents.on(WorkspaceEventType.FileCreated, this.handleFileCreated);
    WorkspaceEvents.on(WorkspaceEventType.FileDeleted, this.handleFileDeleted);
    WorkspaceEvents.on(WorkspaceEventType.FileRenamed, this.handleFileRenamed);
    WorkspaceEvents.on(WorkspaceEventType.FileMoved, this.handleFileMoved);
  }

  private fallbackToDirectIndex(): void {
    this.useDirectIndex = true;
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }

    // Populate direct index with current snapshot
    this.directIndex.clear();
    const nodes = this.vfs.snapshot();
    for (const node of nodes) {
      const computedPath = this.vfs.getPath(node.id) || node.path;
      this.directIndex.addNode({
        nodeId: node.id,
        path: computedPath,
        name: node.name,
        type: node.type === 'directory' ? 'folder' : (node.type as 'file' | 'folder'),
        extension: node.extension,
      });
    }

    // If any pending searches were awaiting worker, reject them so caller can retry
    if (this.pendingSearches.size > 0) {
      this.pendingSearches.forEach(({ reject }) => {
        reject(new Error('Search worker encountered error, switching to fallback index'));
      });
      this.pendingSearches.clear();
    }
  }

  public dispose(): void {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }

    this.directIndex.clear();
    this.pendingSearches.forEach(({ reject }) => reject(new Error('Search service disposed')));
    this.pendingSearches.clear();

    WorkspaceEvents.off(WorkspaceEventType.WorkspaceOpened, this.handleWorkspaceOpened);
    WorkspaceEvents.off(WorkspaceEventType.WorkspaceClosed, this.handleWorkspaceClosed);
    WorkspaceEvents.off(WorkspaceEventType.FolderLoaded, this.handleFolderLoaded);
    WorkspaceEvents.off(WorkspaceEventType.FileCreated, this.handleFileCreated);
    WorkspaceEvents.off(WorkspaceEventType.FileDeleted, this.handleFileDeleted);
    WorkspaceEvents.off(WorkspaceEventType.FileRenamed, this.handleFileRenamed);
    WorkspaceEvents.off(WorkspaceEventType.FileMoved, this.handleFileMoved);
  }

  public async search(query: SearchQuery): Promise<SearchResult[]> {
    // Fast-path: Check capability
    const caps = await import('../WorkspaceSession')
      .then((m) => m.WorkspaceSession.getState().metadata?.capabilities)
      .catch(() => null);

    if (caps && caps.recursiveSearch === false) {
      // Just filter against the VFS root manually
      const lowerQuery = query.query.toLowerCase();
      const nodes = this.vfs.snapshot();
      const results: SearchResult[] = [];
      for (const node of nodes) {
        if (node.name.toLowerCase().includes(lowerQuery)) {
          results.push({
            nodeId: node.id,
            path: node.path,
            name: node.name,
            type: node.type === 'directory' ? 'folder' : 'file',
            score: 1,
          });
        }
      }
      return results;
    }

    if (this.useDirectIndex || !this.worker) {
      return this.directIndex.search(query);
    }

    const id = (this.messageIdCounter++).toString();

    return new Promise((resolve, reject) => {
      this.pendingSearches.set(id, { resolve, reject });

      const message: WorkerMessage = {
        id,
        type: 'SEARCH',
        payload: {
          query: query.query,
          fileTypes: query.fileTypes,
          includeHidden: query.includeHidden,
          maxResults: query.maxResults,
        },
      };

      try {
        this.worker!.postMessage(message);
      } catch (err) {
        this.pendingSearches.delete(id);
        console.warn('[WorkspaceSearchService] Worker postMessage failed, falling back:', err);
        this.fallbackToDirectIndex();
        resolve(this.directIndex.search(query));
      }
    });
  }

  private handleWorkerMessage(event: MessageEvent<WorkerResponse>) {
    const { id, type, payload, error } = event.data;

    // We only wait for SEARCH results currently. INDEX_COMPLETE is fire-and-forget.
    if (type === 'SEARCH_RESULTS' || type === 'ERROR') {
      const pending = this.pendingSearches.get(id);
      if (pending) {
        this.pendingSearches.delete(id);
        if (type === 'ERROR') {
          pending.reject(new Error(error || 'Worker search error'));
        } else {
          pending.resolve(payload as SearchResult[]);
        }
      }
    }
  }

  private postToWorker(message: WorkerMessage) {
    if (this.useDirectIndex || !this.worker) {
      if (message.type === 'INDEX_NODE' && message.payload) {
        this.directIndex.addNode(message.payload);
      } else if (message.type === 'REMOVE_NODE' && message.payload) {
        this.directIndex.removeNode(message.payload as string);
      } else if (message.type === 'CLEAR') {
        this.directIndex.clear();
      }
      return;
    }

    try {
      this.worker.postMessage(message);
    } catch (err) {
      console.warn('[WorkspaceSearchService] Failed to post to worker, switching to direct index:', err);
      this.fallbackToDirectIndex();
      if (message.type === 'INDEX_NODE' && message.payload) {
        this.directIndex.addNode(message.payload);
      } else if (message.type === 'REMOVE_NODE' && message.payload) {
        this.directIndex.removeNode(message.payload as string);
      } else if (message.type === 'CLEAR') {
        this.directIndex.clear();
      }
    }
  }

  // --- Event Handlers ---

  private handleWorkspaceOpened = () => {
    // A new workspace opened, we should clear and index everything currently in VFS
    this.postToWorker({ id: 'clear', type: 'CLEAR' });
    this.indexAllNodes();
  };

  private handleWorkspaceClosed = () => {
    this.postToWorker({ id: 'clear', type: 'CLEAR' });
  };

  private handleFolderLoaded = (event: WorkspaceEvent<WorkspaceEventType.FolderLoaded>) => {
    const payload = event.payload;
    if (!payload?.folderId) {
      this.indexAllNodes();
      return;
    }

    const childrenIds = (this.vfs as any).index?.getChildren(payload.folderId) || [];
    for (const childId of childrenIds) {
      this.indexNodeById(childId);
    }
  };

  private handleFileCreated = (event: WorkspaceEvent<WorkspaceEventType.FileCreated>) => {
    const payload = event.payload;
    if (!payload?.path) return;
    const nodeId = this.vfs.resolve(payload.path);
    if (nodeId) {
      this.indexNodeById(nodeId);
    }
  };

  private handleFileDeleted = (event: WorkspaceEvent<WorkspaceEventType.FileDeleted>) => {
    const payload = event.payload;
    if (!payload?.path) return;
    this.postToWorker({ id: 'clear', type: 'CLEAR' });
    this.indexAllNodes();
  };

  private handleFileRenamed = (event: WorkspaceEvent<WorkspaceEventType.FileRenamed>) => {
    const payload = event.payload;
    if (!payload?.newPath && !payload?.oldPath) return;
    this.postToWorker({ id: 'clear', type: 'CLEAR' });
    this.indexAllNodes();
  };

  private handleFileMoved = (event: WorkspaceEvent<WorkspaceEventType.FileMoved>) => {
    const payload = event.payload;
    if (!payload?.newPath && !payload?.oldPath) return;
    this.postToWorker({ id: 'clear', type: 'CLEAR' });
    this.indexAllNodes();
  };

  public get index() {
    return {
      fileTypeIndex: {
        getFiles: () =>
          Array.from((this.directIndex as any).nodeIndex?.values() || [])
            .filter((n: any) => n.type === 'file')
            .map((n: any) => n.nodeId),
        getDirectories: () =>
          Array.from((this.directIndex as any).nodeIndex?.values() || [])
            .filter((n: any) => n.type === 'folder' || n.type === 'directory')
            .map((n: any) => n.nodeId),
      },
    };
  }

  private indexAllNodes() {
    const nodes = this.vfs.snapshot();
    for (const node of nodes) {
      this.indexNodePayload(node);
    }
  }

  private indexNodeById(nodeId: string) {
    const node = this.vfs.find(nodeId) || (this.vfs as any).index?.get(nodeId);
    if (node) {
      this.indexNodePayload(node);
    }
  }

  private indexNodePayload(node: any) {
    const computedPath = this.vfs.getPath(node.id) || node.path;
    const payload: IndexNodePayload = {
      nodeId: node.id,
      path: computedPath,
      name: node.name,
      type: node.type === 'directory' ? 'folder' : node.type,
      extension: node.extension,
    };
    this.postToWorker({ id: `index_${node.id}`, type: 'INDEX_NODE', payload });
  }
}
