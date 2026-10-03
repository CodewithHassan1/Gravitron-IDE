// src/services/workspace/search/WorkspaceSearchService.ts

import { SearchQuery } from './SearchQuery';
import { SearchResult, WorkerMessage, WorkerResponse, IndexNodePayload } from './SearchTypes';
import { VirtualFileSystem } from '../vfs/VirtualFileSystem';
import { WorkspaceEvents } from '../WorkspaceEvents';
import { WorkspaceEventType, WorkspaceEvent } from '../types';



export class WorkspaceSearchService {
  private vfs: VirtualFileSystem;
  private worker: Worker | null = null;
  private pendingSearches = new Map<string, { resolve: (results: SearchResult[]) => void, reject: (err: any) => void }>();
  private messageIdCounter = 0;

  constructor(vfs: VirtualFileSystem) {
    this.vfs = vfs;
    this.initialize();
  }

  public initialize(): void {
    if (this.worker) return;

    this.worker = new Worker(new URL('./SearchWorker.ts', import.meta.url));
    this.worker.onmessage = this.handleWorkerMessage.bind(this);
    this.worker.onerror = (err: any) => console.error('[WorkspaceSearchService] Worker error', err);

    WorkspaceEvents.on(WorkspaceEventType.WorkspaceOpened, this.handleWorkspaceOpened);
    WorkspaceEvents.on(WorkspaceEventType.WorkspaceClosed, this.handleWorkspaceClosed);
    WorkspaceEvents.on(WorkspaceEventType.FolderLoaded, this.handleFolderLoaded);
    WorkspaceEvents.on(WorkspaceEventType.FileCreated, this.handleFileCreated);
    WorkspaceEvents.on(WorkspaceEventType.FileDeleted, this.handleFileDeleted);
  }

  public dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    
    this.pendingSearches.forEach(({ reject }) => reject(new Error('Search service disposed')));
    this.pendingSearches.clear();

    WorkspaceEvents.off(WorkspaceEventType.WorkspaceOpened, this.handleWorkspaceOpened);
    WorkspaceEvents.off(WorkspaceEventType.WorkspaceClosed, this.handleWorkspaceClosed);
    WorkspaceEvents.off(WorkspaceEventType.FolderLoaded, this.handleFolderLoaded);
    WorkspaceEvents.off(WorkspaceEventType.FileCreated, this.handleFileCreated);
    WorkspaceEvents.off(WorkspaceEventType.FileDeleted, this.handleFileDeleted);
  }

  public async search(query: SearchQuery): Promise<SearchResult[]> {
    if (!this.worker) {
      throw new Error('WorkspaceSearchService is not initialized');
    }

    // Fast-path: Check capability
    import('../WorkspaceSession').then(({ WorkspaceSession }) => {
      const caps = WorkspaceSession.getState().metadata?.capabilities;
      if (caps && caps.recursiveSearch === false) {
        // Just search the root node if it's a file
        console.log('[WorkspaceSearchService] recursiveSearch disabled, bypassing worker index');
      }
    });

    const caps = await import('../WorkspaceSession').then(m => m.WorkspaceSession.getState().metadata?.capabilities);
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
            score: 1
          });
        }
      }
      return results;
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
          maxResults: query.maxResults
        }
      };

      this.worker!.postMessage(message);
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
    if (this.worker) {
      this.worker.postMessage(message);
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
    const node = (this.vfs as any).index?.getByPath(payload.path);
    if (node) {
      this.indexNodeById(node.id);
    }
  };

  private handleFileDeleted = (event: WorkspaceEvent<WorkspaceEventType.FileDeleted>) => {
    const payload = event.payload;
    if (!payload?.path) return;
    this.postToWorker({ id: 'clear', type: 'CLEAR' });
    this.indexAllNodes();
  };

  private indexAllNodes() {
    const nodes = this.vfs.snapshot();
    for (const node of nodes) {
      this.indexNodePayload(node);
    }
  }

  private indexNodeById(nodeId: string) {
    const node = (this.vfs as any).index?.get(nodeId);
    if (node) {
      this.indexNodePayload(node);
    }
  }

  private indexNodePayload(node: any) {
    const payload: IndexNodePayload = {
      nodeId: node.id,
      path: node.path,
      name: node.name,
      type: node.type,
      extension: node.extension
    };
    this.postToWorker({ id: `index_${node.id}`, type: 'INDEX_NODE', payload });
  }
}
