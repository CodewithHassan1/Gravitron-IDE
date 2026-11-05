// src/services/workspace/WorkspaceManager.ts
import { WorkspaceSession } from './WorkspaceSession';
import { unwrapIpcResponse } from '@ag/protocol';
import { WorkspaceEvents } from './WorkspaceEvents';
import { WorkspaceCache } from './WorkspaceCache';
import { VirtualFileSystem } from './vfs/VirtualFileSystem';
import { WorkspacePersistence } from './WorkspacePersistence';
import { WorkspaceSyncEngine } from './sync/WorkspaceSyncEngine';
import { WorkspaceSearchService } from './search/WorkspaceSearchService';
import { useWorkspaceStore } from '../../stores/ide/workspaceStore';
import { useWorkspaceSettingsStore } from '../../stores/ide/workspaceSettingsStore';
import { WorkspaceHistory } from './WorkspaceHistory';
import { WorkspaceNode } from './vfs/WorkspaceNode';
import { FileContentManager } from './FileContentManager';
import { WorkspaceOperationType, createOperationId } from './sync/WorkspaceOperation';
import { MutationTracker } from './sync/MutationTracker';
import {
  WorkspaceHandle,
  WorkspaceMetadata,
  WorkspaceEventType,
  WorkspaceEventPayloads,
  WorkspaceEvent,
  WorkspaceState,
  WorkspaceOperationResult,
  FileOperationResult,
  WorkspaceLifecycleState,
  WorkspaceSnapshot,
} from './types';

export class WorkspaceManagerImpl {
  private vfs: VirtualFileSystem;
  private persistence: WorkspacePersistence;
  private syncEngine: WorkspaceSyncEngine | null = null;
  private searchEngine: WorkspaceSearchService | null = null;
  private activeWorkspaceId: string | null = null;
  public activeWorkspaceMetadata: WorkspaceMetadata | null = null;
  public readonly history: WorkspaceHistory;
  private lifecycleLock: Promise<void> = Promise.resolve();
  public contentManager: FileContentManager;
  public mutationTracker: MutationTracker;
  public reconciler!: any;

  // Production Telemetry
  public telemetry = {
    operationTimingsMs: [] as number[],
    searchTimingsMs: [] as number[],
  };

  constructor() {
    this.vfs = new VirtualFileSystem();
    this.persistence = new WorkspacePersistence();
    this.mutationTracker = new MutationTracker();
    this.contentManager = new FileContentManager(this);
    this.history = new WorkspaceHistory(50);

    // Start reconciler
    import('./sync/WorkspaceReconciler').then(({ WorkspaceReconciler }) => {
      this.reconciler = new WorkspaceReconciler(this);
      this.reconciler.start();
    });
  }

  private async _initialize(): Promise<void> {
    // DB is initialized in constructor of WorkspacePersistence
  }

  // --- VFS Access API (No direct VFS exposure to UI) ---

  /**
   * Retrieves the root node of the current workspace.
   * @returns A deep clone of the root WorkspaceNode, or undefined if not initialized.
   */
  public getRoot(): Readonly<WorkspaceNode> | undefined {
    const rootId = (this.vfs as any).index?.rootId;
    const root = rootId ? this.vfs.find(rootId) : undefined;
    if (!root) return undefined;
    console.log('[DIAG] getRoot() root:', {
      id: root.id,
      name: root.name,
      childrenCount: root.children?.length,
      childrenLoaded: root.childrenLoaded,
      children: root.children,
    });
    return Object.freeze({
      ...root,
      children: Object.freeze([...root.children]) as unknown as string[],
      metadata: Object.freeze({ ...root.metadata }),
    }) as Readonly<WorkspaceNode>;
  }

  /**
   * Retrieves the full state of the workspace manager.
   * @returns A frozen snapshot of the current workspace state.
   */
  public getState(): Readonly<WorkspaceState> {
    return WorkspaceSession.getState();
  }

  /**
   * Retrieves the active workspace UUID.
   * @returns The active workspace ID, or null if none active.
   */
  public getWorkspaceId(): string | null {
    return WorkspaceSession.getWorkspaceId();
  }

  /**
   * Retrieves the active workspace UUID (private legacy accessor).
   * @returns The active workspace ID, or undefined.
   */
  private _getWorkspaceId(): string | undefined {
    return this.activeWorkspaceId || undefined;
  }

  /**
   * Retrieves all direct children of a given node.
   * @param nodeId The UUID of the parent directory.
   * @returns An array of cloned WorkspaceNodes representing the children.
   */
  public getChildren(nodeId: string): ReadonlyArray<Readonly<WorkspaceNode>> {
    const node = this.vfs?.find(nodeId);
    if (!node) return [];

    const children = (this.vfs as any).tree?.getChildren(nodeId) || [];

    const returnedChildren = children.map((child: any) => ({
      ...child,
      children: [...(child.children || [])],
      metadata: { ...child.metadata },
    }));

    console.log('[EXPLORER FORENSIC] getChildren');
    console.log('requestedNodeId:', nodeId);
    console.log('node.type:', node.type);
    console.log('node.children:', node.children);
    console.log('returnedChildren:', returnedChildren);
    console.log('returnedChildren.length:', returnedChildren.length);

    return Object.freeze(
      returnedChildren.map(
        (child: any) =>
          Object.freeze({
            ...child,
            children: Object.freeze([...(child.children || [])]) as unknown as string[],
            metadata: Object.freeze({ ...child.metadata }),
          }) as Readonly<WorkspaceNode>
      )
    );
  }

  /**
   * Retrieves a specific node by its UUID.
   * @param nodeId The UUID of the node.
   * @returns A deep clone of the WorkspaceNode, or undefined if not found.
   */
  public getNode(nodeId: string): Readonly<WorkspaceNode> | undefined {
    const node = this.vfs.find(nodeId);
    if (!node) return undefined;
    return Object.freeze({
      ...node,
      children: Object.freeze([...(node.children || [])]) as unknown as string[],
      metadata: Object.freeze({ ...node.metadata }),
    }) as Readonly<WorkspaceNode>;
  }

  /**
   * Loads children for a given directory node from the filesystem lazily.
   */
  public async ensureChildrenLoaded(nodeId: string, force: boolean = false): Promise<void> {
    const node = this.vfs.find(nodeId);
    if (!node || node.type !== 'directory') return;

    if (!force && node.childrenLoaded) return;

    const path = this.vfs.getPath(nodeId);
    if (!path) {
      console.error('[WorkspaceManager] INVALID PATH', path);
      return;
    }

    try {
      let entries: { name: string; isDirectory: boolean; isFile: boolean; isSymlink?: boolean }[] =
        [];
      const hasWindow = typeof window !== 'undefined';
      const agApi = hasWindow ? (window as any).agApi : undefined;
      const globalAgApi = typeof globalThis !== 'undefined' ? (globalThis as any).agApi : undefined;
      console.log(
        '[FORENSIC:WM:CHECK_API] hasWindow:',
        hasWindow,
        'agApi:',
        agApi,
        'globalAgApi:',
        globalAgApi,
        'window keys:',
        hasWindow ? Object.keys(window).filter((k) => k.toLowerCase().includes('ag')) : []
      );
      if (hasWindow && agApi) {
        const workspaceId = WorkspaceSession.getState().metadata?.id;
        console.log(
          '[FORENSIC:WM:READDIR:BEFORE] workspaceId:',
          workspaceId,
          'relative path:',
          path
        );
        const result = await (window as any).agApi.workspace.readDirectory(workspaceId, path);
        entries =
          unwrapIpcResponse<
            { name: string; isDirectory: boolean; isFile: boolean; isSymlink?: boolean }[]
          >(result);

        console.log(
          '[FORENSIC:WM:READDIR:AFTER] result length:',
          entries?.length,
          'entries:',
          entries
        );
      } else {
        // Browser handle traversal (simplified for now as fallback)
      }

      if (force) {
        // Targeted subtree reconciliation: prune nodes that exist in VFS but are missing from disk
        const diskPaths = new Set(
          entries.map((entry) => `${path === '/' ? '' : path}/${entry.name}`)
        );
        const existingChildren = this.getChildren(nodeId);
        for (const child of existingChildren) {
          const childPath = this.getPath(child.id);
          if (childPath && !diskPaths.has(childPath)) {
            this.handleExternalDelete(childPath);
          }
        }
      }

      for (const entry of entries) {
        const fullPath = `${path === '/' ? '' : path}/${entry.name}`;
        if (this.vfs.resolve(fullPath)) continue; // Idempotent: Skip if already exists

        if (entry.isDirectory) {
          try {
            this.vfs.createFolder(fullPath);
          } catch (err) {
            console.error('[WorkspaceManager] Failed creating VFS folder:', err);
          }
        } else if (entry.isFile) {
          try {
            this.vfs.createFile(fullPath);
          } catch (err) {
            console.error('[WorkspaceManager] Failed creating VFS file:', err);
          }
        }
      }

      // Mark as loaded immutably
      this.vfs.updateNode(nodeId, { childrenLoaded: true });
      const rootAfterVfs = this.vfs.find(nodeId);
      console.log(
        '[FORENSIC:WM:VFS] root.id:',
        rootAfterVfs?.id,
        'children count:',
        rootAfterVfs?.children?.length,
        'children IDs:',
        rootAfterVfs?.children,
        'childrenLoaded:',
        rootAfterVfs?.childrenLoaded
      );

      WorkspaceEvents.emit(WorkspaceEventType.WorkspaceUpdated, undefined);
    } catch (e: any) {
      console.error(`[WorkspaceManager] Exception in ensureChildrenLoaded for path ${path}:`, e);
      if (e.stack) console.error(e.stack);
      throw e;
    }
  }

  /**
   * Resolves an absolute workspace path to a node UUID.
   * @param path The absolute path (e.g., "/src/index.ts").
   * @returns The UUID of the node, or undefined if not found.
   */
  public resolvePath(path: string): string | undefined {
    return this.vfs.resolve(path) || undefined;
  }

  /**
   * Reconstructs the absolute workspace path for a given node UUID.
   * @param nodeId The UUID of the node.
   * @returns The absolute path, or undefined if not found.
   */
  public getPath(nodeId: string): string | undefined {
    return this.vfs.getPath(nodeId) || undefined;
  }

  // --- Search API ---

  public getSearchEngine(): WorkspaceSearchService | null {
    return this.searchEngine;
  }

  public async searchText(
    query: string,
    options?: import('@ag/protocol').WorkspaceSearchRequest['options']
  ): Promise<import('@ag/protocol').TextSearchResult[]> {
    try {
      const hasWindow = typeof window !== 'undefined';
      const agApi = hasWindow ? (window as any).agApi : undefined;
      if (hasWindow && agApi && agApi.workspace.search) {
        const workspaceId = this.getWorkspaceId();
        if (!workspaceId) return [];
        const result = await agApi.workspace.search(workspaceId, query, options);
        return unwrapIpcResponse<any>(result);
      }
      return [];
    } catch (e) {
      console.error('[WorkspaceManager] Search failed:', e);
      return [];
    }
  }

  // --- Refresh API ---

  /**
   * Refreshes a targeted subtree from the backend.
   * If path is not provided, defaults to the workspace root.
   */
  public async refresh(path: string = '/'): Promise<void> {
    const nodeId = this.resolvePath(path);
    if (nodeId) {
      await this.ensureChildrenLoaded(nodeId, true);
    }
  }

  // --- Events API ---
  public onEvent<T extends keyof WorkspaceEventPayloads>(
    eventType: T,
    callback: (event: WorkspaceEvent<T>) => void
  ): () => void {
    return WorkspaceEvents.on(eventType, callback);
  }

  // --- Intent-Based Mutation API ---

  private async _trackOperationTiming<T>(operation: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await operation();
      this.telemetry.operationTimingsMs.push(performance.now() - start);
      return result;
    } catch (e: any) {
      this.telemetry.operationTimingsMs.push(performance.now() - start);
      throw e;
    }
  }

  public async createFile(path: string): Promise<FileOperationResult> {
    return this._trackOperationTiming(async () => {
      try {
        const workspaceId = this.getWorkspaceId();
        const mutationId = this.mutationTracker.createMutation(path, 'create');
        if (workspaceId && typeof window !== 'undefined' && (window as any).agApi) {
          const result = await (window as any).agApi.workspace.createFile(
            workspaceId,
            path,
            mutationId
          );
          unwrapIpcResponse(result);
        }
        const node = this.vfs.createFile(path);
        const frozenNode = this.getNode(node.id);
        WorkspaceEvents.emit(WorkspaceEventType.FileCreated, { path, nodeId: node.id });
        WorkspaceEvents.emit('fileEvent', { type: 'created', node: frozenNode! });
        return { success: true, path, timestamp: Date.now() };
      } catch (error: any) {
        return { success: false, path, timestamp: Date.now(), error: error.message };
      }
    });
  }

  public async createFolder(path: string): Promise<FileOperationResult> {
    return this._trackOperationTiming(async () => {
      try {
        const workspaceId = this.getWorkspaceId();
        const mutationId = this.mutationTracker.createMutation(path, 'createFolder');
        if (workspaceId && typeof window !== 'undefined' && (window as any).agApi) {
          const result = await (window as any).agApi.workspace.createFolder(
            workspaceId,
            path,
            mutationId
          );
          unwrapIpcResponse(result);
        }
        const node = this.vfs.createFolder(path);
        const frozenNode = this.getNode(node.id);
        WorkspaceEvents.emit(WorkspaceEventType.FolderCreated, { path, nodeId: node.id });
        WorkspaceEvents.emit('fileEvent', { type: 'created', node: frozenNode! });
        return { success: true, path, timestamp: Date.now() };
      } catch (error: any) {
        return { success: false, path, timestamp: Date.now(), error: error.message };
      }
    });
  }

  public async delete(path: string): Promise<FileOperationResult> {
    return this._trackOperationTiming(async () => {
      try {
        const workspaceId = this.getWorkspaceId();
        const nodeId = this.vfs.resolve(path);
        const node = nodeId ? this.vfs.find(nodeId) : null;

        const mutationId = this.mutationTracker.createMutation(path, 'delete');
        if (workspaceId && typeof window !== 'undefined' && (window as any).agApi) {
          let result;
          if (node?.type === 'directory') {
            result = await (window as any).agApi.workspace.deleteFolder(
              workspaceId,
              path,
              mutationId
            );
          } else {
            result = await (window as any).agApi.workspace.deleteFile(
              workspaceId,
              path,
              mutationId
            );
          }
          unwrapIpcResponse(result);
        }

        this.vfs.delete(path);
        if (nodeId) {
          if (node?.type === 'directory') {
            WorkspaceEvents.emit(WorkspaceEventType.FolderDeleted, { path, nodeId });
          } else {
            WorkspaceEvents.emit(WorkspaceEventType.FileDeleted, { path, nodeId });
          }
          WorkspaceEvents.emit('fileEvent', { type: 'deleted', id: nodeId });
        }
        return { success: true, path, timestamp: Date.now() };
      } catch (error: any) {
        return { success: false, path, timestamp: Date.now(), error: error.message };
      }
    });
  }

  public handleExternalDelete(path: string): void {
    const nodeId = this.vfs.resolve(path);
    if (!nodeId) return;

    const node = this.getNode(nodeId);
    this.vfs.delete(path);

    if (node?.type === 'directory') {
      WorkspaceEvents.emit(WorkspaceEventType.FolderDeleted, { path, nodeId });
    } else {
      WorkspaceEvents.emit(WorkspaceEventType.FileDeleted, { path, nodeId });
    }
    WorkspaceEvents.emit('fileEvent', { type: 'deleted', id: nodeId });
  }

  public async handleExternalCreate(path: string): Promise<void> {
    // Idempotency check: abort if node already exists
    if (this.vfs.resolve(path)) {
      return;
    }

    const workspaceId = this.getWorkspaceId();
    if (!workspaceId) return;

    // Resolve the parent directory path
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return; // root
    const parentPath = '/' + parts.slice(0, -1).join('/');

    // We only reconcile if the parent is actually loaded
    const parentNodeId = this.vfs.resolve(parentPath);
    if (!parentNodeId) return;

    const parentNode = this.getNode(parentNodeId);
    if (!parentNode || parentNode.type !== 'directory' || !parentNode.childrenLoaded) {
      // If parent isn't loaded yet, we don't need to eagerly fetch child.
      // When the user expands the parent, it will load correctly.
      return;
    }

    try {
      const response = await (window as any).agApi.workspace.readDirectory(workspaceId, parentPath);
      const entries =
        unwrapIpcResponse<{ name: string; isDirectory: boolean; isFile: boolean }[]>(response);

      const newEntryName = parts[parts.length - 1];
      const newEntry = entries.find((e) => e.name === newEntryName);

      if (!newEntry) {
        console.warn(
          `[WorkspaceManager] handleExternalCreate: could not find ${newEntryName} in backend payload`
        );
        return;
      }

      // Another idempotency check before insertion in case of async race
      if (this.vfs.resolve(path)) return;

      let node;
      if (newEntry.isDirectory) {
        node = this.vfs.createFolder(path);
      } else {
        node = this.vfs.createFile(path);
      }

      const frozenNode = this.getNode(node.id);
      WorkspaceEvents.emit('fileEvent', { type: 'created', node: frozenNode! });
    } catch (e: any) {
      console.error(`[WorkspaceManager] handleExternalCreate error:`, e);
    }
  }

  public async rename(sourcePath: string, newName: string): Promise<FileOperationResult> {
    return this._trackOperationTiming(async () => {
      try {
        const workspaceId = this.getWorkspaceId();
        const renameId = this.vfs.resolve(sourcePath);
        const node = renameId ? this.vfs.find(renameId) : null;
        const newPathParts = sourcePath.split('/');
        newPathParts.pop();
        newPathParts.push(newName);
        const newPath = newPathParts.join('/') || `/${newName}`;

        const mutationId = this.mutationTracker.createMutation(sourcePath, 'rename');
        if (workspaceId && typeof window !== 'undefined' && (window as any).agApi) {
          let result;
          if (node?.type === 'directory') {
            result = await (window as any).agApi.workspace.renameFolder(
              workspaceId,
              sourcePath,
              newPath,
              mutationId
            );
          } else {
            result = await (window as any).agApi.workspace.renameFile(
              workspaceId,
              sourcePath,
              newPath,
              mutationId
            );
          }
          unwrapIpcResponse(result);
        }

        this.vfs.rename(sourcePath, newName);
        if (renameId) {
          const finalNewPath = this.vfs.getPath(renameId)!;
          WorkspaceEvents.emit(WorkspaceEventType.FileRenamed, {
            oldPath: sourcePath,
            newPath: finalNewPath,
            nodeId: renameId,
          });
          WorkspaceEvents.emit('fileEvent', {
            type: 'renamed',
            id: renameId,
            newName,
            newPath: finalNewPath,
          });
        }
        return { success: true, path: newPath, timestamp: Date.now() };
      } catch (error: any) {
        return { success: false, path: sourcePath, timestamp: Date.now(), error: error.message };
      }
    });
  }

  public async move(sourcePath: string, destinationPath: string): Promise<FileOperationResult> {
    return this._trackOperationTiming(async () => {
      try {
        const workspaceId = this.getWorkspaceId();
        const moveId = this.vfs.resolve(sourcePath);

        const mutationId = this.mutationTracker.createMutation(sourcePath, 'move');
        if (workspaceId && typeof window !== 'undefined' && (window as any).agApi) {
          const result = await (window as any).agApi.workspace.moveFile(
            workspaceId,
            sourcePath,
            destinationPath,
            mutationId
          );
          unwrapIpcResponse(result);
        }

        this.vfs.move(sourcePath, destinationPath);
        if (moveId) {
          const newParentId = this.vfs.resolve(destinationPath);
          const newPath = this.vfs.getPath(moveId)!;
          WorkspaceEvents.emit(WorkspaceEventType.FileMoved, {
            oldPath: sourcePath,
            newPath,
            nodeId: moveId,
          });
          WorkspaceEvents.emit('fileEvent', {
            type: 'moved',
            id: moveId,
            newParentId: newParentId!,
          });
        }
        return { success: true, path: destinationPath, timestamp: Date.now() };
      } catch (error: any) {
        return { success: false, path: sourcePath, timestamp: Date.now(), error: error.message };
      }
    });
  }

  public async copy(sourcePath: string, destinationPath: string): Promise<FileOperationResult> {
    return this._trackOperationTiming(async () => {
      try {
        const workspaceId = this.getWorkspaceId();
        const copyId = this.vfs.resolve(sourcePath);
        const node = copyId ? this.vfs.find(copyId) : null;

        const mutationId = this.mutationTracker.createMutation(destinationPath, 'copy');
        if (workspaceId && typeof window !== 'undefined' && (window as any).agApi) {
          const result = await (window as any).agApi.workspace.copy(
            workspaceId,
            sourcePath,
            destinationPath,
            mutationId
          );
          unwrapIpcResponse(result);
        }

        // We could manually clone in VFS, but simpler is to let the watcher or a refresh handle it,
        // or just create the immediate node. For simplicity, we create the root node of the copy.
        if (node?.type === 'directory') {
          this.vfs.createFolder(destinationPath);
        } else if (node?.type === 'file') {
          this.vfs.createFile(destinationPath);
        }

        const newId = this.vfs.resolve(destinationPath);
        if (newId) {
          WorkspaceEvents.emit('fileEvent', { type: 'created', node: this.getNode(newId)! });
        }
        return { success: true, path: destinationPath, timestamp: Date.now() };
      } catch (error: any) {
        return { success: false, path: sourcePath, timestamp: Date.now(), error: error.message };
      }
    });
  }

  public async writeFile(path: string, content: string | Uint8Array): Promise<FileOperationResult> {
    return this._trackOperationTiming(async () => {
      try {
        const workspaceId = this.getWorkspaceId();
        const mutationId = this.mutationTracker.createMutation(path, 'write');
        if (workspaceId && typeof window !== 'undefined' && (window as any).agApi) {
          // write operations are not currently taking mutationId, but we should add it if we want watcher to ignore writes
          const result = await (window as any).agApi.workspace.writeFile(
            workspaceId,
            path,
            content,
            mutationId
          );
          unwrapIpcResponse(result);
        }
        return { success: true, path, timestamp: Date.now() };
      } catch (error: any) {
        return { success: false, path, timestamp: Date.now(), error: error.message };
      }
    });
  }

  public async readFile(path: string): Promise<string> {
    return this._trackOperationTiming(async () => {
      const workspaceId = this.getWorkspaceId();
      if (workspaceId && typeof window !== 'undefined' && (window as any).agApi) {
        const result = await (window as any).agApi.workspace.readFile(workspaceId, path);
        return unwrapIpcResponse<string>(result);
      }
      throw new Error('IPC not available');
    });
  }

  // --- Lifecycle Management ---

  async openWorkspace(metadata: WorkspaceMetadata, handle: WorkspaceHandle): Promise<void> {
    const operation = async () => {
      console.log(
        '[FORENSIC:WM:OPEN] handle:',
        handle,
        'metadata:',
        metadata,
        'metadata.id:',
        metadata?.id,
        'metadata.path:',
        (metadata as any)?.path
      );
      WorkspaceSession.setLifecycleState(WorkspaceLifecycleState.Opening);
      WorkspaceSession.setLoading(true);

      try {
        this.activeWorkspaceId = metadata.id;
        this.activeWorkspaceMetadata = metadata;
        WorkspaceSession.setMetadata(metadata);
        WorkspaceSession.setHandle(handle);
        WorkspaceSession.setSnapshot(null);
        WorkspaceSession.setError(null);
        this.history.clear();
        useWorkspaceSettingsStore.getState().clearSettings();

        WorkspaceSession.setLifecycleState(WorkspaceLifecycleState.Initializing);

        // 1. Snapshot Persistence
        const snapshot = await this.persistence.getSnapshot(metadata.id);

        // 2. VFS Initialization
        if (snapshot && snapshot.nodes && snapshot.nodes.length > 0) {
          try {
            this.vfs.rehydrate(snapshot.nodes);
            this.history.init(snapshot);
          } catch (e: any) {
            console.error('Failed to rehydrate workspace snapshot, initializing fresh root.', e);
            this.vfs.initializeRoot(metadata.name, metadata.type);
          }
        } else {
          this.vfs.initializeRoot(metadata.name, metadata.type);
        }

        // 3. WorkspaceSyncEngine Initialization
        this.syncEngine = new WorkspaceSyncEngine(
          this.vfs,
          this.persistence,
          metadata.id,
          WorkspaceEvents,
          this.history
        );
        this.syncEngine.start(handle.nativeHandle);

        // 4. Load Workspace Settings
        const settings = await this.persistence.getSettings(metadata.id);
        if (settings) {
          useWorkspaceSettingsStore.getState().setSettings(settings);
        }

        // 5. SearchEngine Initialization
        this.searchEngine = new WorkspaceSearchService(this.vfs);

        // 5. Editor Models (Handled via layout restoring later, but readiness established)
        WorkspaceCache.setMetadata(metadata.id, metadata);
        WorkspaceCache.setHandle(metadata.id, handle);

        try {
          const m = await import('../quickInput/providers/RecentWorkspacesProvider');
          m.RecentWorkspacesManager.addWorkspace(metadata.name, metadata.id);
        } catch (e) {
          console.error('[WorkspaceManager] Failed to update recent workspaces', e);
        }

        // Load root node lazily only if the workspace supports it (directories)
        const rootId = (this.vfs as any).index?.rootId;
        const rootNodeForLog = rootId ? this.vfs?.find(rootId) : null;
        console.log(
          '[FORENSIC:WM:LOAD:BEFORE] workspaceId:',
          metadata.id,
          'root.id:',
          rootId,
          'root.path:',
          rootNodeForLog?.path,
          'root.children:',
          rootNodeForLog?.children,
          'root.childrenLoaded:',
          rootNodeForLog?.childrenLoaded
        );
        if (rootId && metadata.capabilities?.explorer) {
          await this.ensureChildrenLoaded(rootId, true);
        }

        // 6. Context Engine (Command Guards)
        const { ContextEngine } = await import('../quickInput/ContextEngine');
        ContextEngine.setContext('workspaceIsOpen', true);
        ContextEngine.setContext('workspaceType', metadata.type);
        ContextEngine.setContext('workspaceHasExplorer', metadata.capabilities?.explorer ?? false);
        ContextEngine.setContext('gitAvailable', metadata.capabilities?.git ?? false);

        WorkspaceSession.setLoading(false);
        WorkspaceSession.setLifecycleState(WorkspaceLifecycleState.Ready);
        WorkspaceEvents.emit(WorkspaceEventType.WorkspaceOpened, { workspaceId: metadata.id });
        WorkspaceEvents.emit(WorkspaceEventType.WorkspaceUpdated, undefined);

        if (typeof window !== 'undefined' && window.location) {
          const targetUrl = `/dashboard/ide?id=${encodeURIComponent(metadata.id)}`;
          if (window.location.pathname !== targetUrl) {
            WorkspaceEvents.emit(WorkspaceEventType.WorkspaceNavigate, { targetUrl });
            return;
          }
        }
      } catch (error: any) {
        WorkspaceSession.setLoading(false);
        console.error('[WorkspaceManager] ERROR in openWorkspace:', error);
        WorkspaceSession.setLifecycleState(WorkspaceLifecycleState.Error);
        WorkspaceSession.setError({ code: 'OPEN_FAILED', message: error.message });
        // Rollback
        await this.closeWorkspace();
        throw error;
      } finally {
        // Handled in success and error cases
      }
    };

    this.lifecycleLock = this.lifecycleLock.then(operation).catch(console.error);
    return this.lifecycleLock;
  }

  async closeWorkspace(): Promise<void> {
    const operation = async () => {
      const currentId = WorkspaceSession.getWorkspaceId();
      if (!currentId && !this.activeWorkspaceId) return;

      // 1. Closing State
      WorkspaceSession.setLifecycleState(WorkspaceLifecycleState.Closing);

      // 2. Dispose Terminal
      const terminalManagerModule = await import('../terminal');
      await terminalManagerModule.TerminalManager.destroyAllSessions();

      // 3. Dispose Git (SyncEngine)
      this.syncEngine?.stop();
      this.syncEngine = null;

      // 4. Dispose Outline
      // Outline disposal is handled by OutlineService

      // 5. Dispose Search
      this.searchEngine?.dispose();
      this.searchEngine = null;

      // 6. Dispose Editor Models
      // Editor models are handled by EditorModelService

      // 7. Dispose VFS
      (this.vfs as any).index = { rootId: null, paths: {} };

      // 8. Empty State
      WorkspaceSession.clear();
      this.activeWorkspaceId = null;
      this.activeWorkspaceMetadata = null;

      const { ContextEngine } = await import('../quickInput/ContextEngine');
      ContextEngine.setContext('workspaceIsOpen', false);
      ContextEngine.setContext('gitAvailable', false);
      ContextEngine.setContext('terminalExists', false);
      ContextEngine.setContext('editorFocused', false);

      WorkspaceEvents.emit(WorkspaceEventType.WorkspaceClosed, {
        workspaceId: currentId || 'unknown',
      });
      WorkspaceEvents.emit(WorkspaceEventType.WorkspaceUpdated, undefined);
    };

    this.lifecycleLock = this.lifecycleLock.then(operation).catch(console.error);
    return this.lifecycleLock;
  }

  public getActiveWorkspaceId(): string | null {
    return this.activeWorkspaceId;
  }

  /**
   * Retrieves the native absolute path for a given URI or the workspace root.
   * This ensures proper path resolution without string regex hacks in consumers.
   * @param uri Optional URI. If not provided, returns the active workspace root path.
   * @returns The native absolute path.
   */
  public getNativeAbsolutePath(uri?: string): string {
    try {
      const targetUri = uri || this.activeWorkspaceMetadata?.uri;

      if (!targetUri) {
        throw new Error('No active workspace available to resolve native absolute path');
      }

      // Ensure we have a decoded URI to work with
      let decoded = decodeURIComponent(targetUri);

      // Strip any file:/// or file:// or file:/ or file://localhost/ prefix
      let pathPart = decoded.replace(/^file:\/+(localhost\/)?/i, '');

      // Check if it's a Windows drive path but has a leading slash (e.g. /D:\ or /D:/)
      if (pathPart.length >= 3 && pathPart.charCodeAt(0) === 47) {
        const c1 = pathPart.charCodeAt(1);
        const c2 = pathPart.charCodeAt(2);
        // c1 is a-z or A-Z, c2 is ':' (58)
        if (((c1 >= 65 && c1 <= 90) || (c1 >= 97 && c1 <= 122)) && c2 === 58) {
          const charAfterDrive = pathPart.charCodeAt(3);
          // NaN (end of string), 47 ('/'), or 92 ('\')
          if (isNaN(charAfterDrive) || charAfterDrive === 47 || charAfterDrive === 92) {
            pathPart = pathPart.substring(1);
          }
        }
      }

      // Check if it's a Windows drive path: C:\ or c:/ or C:
      let isWindowsDrive = false;
      if (pathPart.length >= 2) {
        const c0 = pathPart.charCodeAt(0);
        const c1 = pathPart.charCodeAt(1);
        if (((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122)) && c1 === 58) {
          const charAfter = pathPart.charCodeAt(2);
          if (isNaN(charAfter) || charAfter === 47 || charAfter === 92) {
            isWindowsDrive = true;
          }
        }
      }

      if (isWindowsDrive) {
        // Normalize to Windows backslashes for the native path
        const result = pathPart.split('/').join('\\');
        return result;
      }

      // If it's not a Windows path, it's Posix. Make sure it starts with /
      const result = pathPart.startsWith('/') ? pathPart : '/' + pathPart;
      return result;
    } catch (e) {
      throw e;
    }
  }

  async reloadWorkspace(): Promise<void> {
    const operation = async () => {
      const currentId = WorkspaceSession.getWorkspaceId();
      if (!currentId) return;

      WorkspaceSession.setLoading(true);

      try {
        await this.refresh('/');
        WorkspaceEvents.emit(WorkspaceEventType.WorkspaceUpdated, undefined);
      } catch (error: any) {
        WorkspaceSession.setError({ code: 'RELOAD_FAILED', message: error.message });
      } finally {
        WorkspaceSession.setLoading(false);
      }
    };
    this.lifecycleLock = this.lifecycleLock.then(operation).catch(console.error);
    return this.lifecycleLock;
  }

  async restoreWorkspace(workspaceId: string): Promise<boolean> {
    const cachedMetadata = WorkspaceCache.getMetadata(workspaceId);
    const cachedHandle = WorkspaceCache.getHandle(workspaceId);

    if (cachedMetadata && cachedHandle) {
      await this.openWorkspace(cachedMetadata, cachedHandle);
      return true;
    }
    return false;
  }

  // --- Phase 5: File Upload ---

  public async uploadFiles(files: File[], targetPath: string): Promise<void> {
    const workspaceId = this.getActiveWorkspaceId();
    if (!workspaceId) throw new Error('No active workspace');

    WorkspaceSession.setLoading(true);
    try {
      const normalizedTarget = targetPath.endsWith('/') ? targetPath : targetPath + '/';

      for (const file of files) {
        // Prevent path traversal
        if (file.name.includes('..') || file.name.includes('/')) {
          console.warn('Skipped invalid file upload name:', file.name);
          continue;
        }

        const fullPath = normalizedTarget + file.name;

        // Read file content
        const buffer = await file.arrayBuffer();

        // Save using existing IPC pipeline
        await this.writeFile(fullPath, new Uint8Array(buffer));
      }
    } catch (e: any) {
      console.error('[WorkspaceManager] Error uploading files:', e);
      throw e;
    } finally {
      WorkspaceSession.setLoading(false);
    }
  }

  // --- Phase 6: Workspace History (Undo/Redo) ---

  public async undo(): Promise<boolean> {
    if (!this.history.canUndo) return false;

    const targetSnapshot = this.history.undo();
    if (!targetSnapshot) return false;

    return await this.applySnapshotDelta(targetSnapshot);
  }

  public async redo(): Promise<boolean> {
    if (!this.history.canRedo) return false;

    const targetSnapshot = this.history.redo();
    if (!targetSnapshot) return false;

    return await this.applySnapshotDelta(targetSnapshot);
  }

  private async applySnapshotDelta(targetSnapshot: WorkspaceSnapshot): Promise<boolean> {
    const workspaceId = this.getActiveWorkspaceId();
    if (!workspaceId) return false;

    WorkspaceSession.setLoading(true);
    try {
      // 1. Get current state
      const currentSnapshot = this.vfs.snapshot();

      // 2. Identify missing files (deleted) or new files (created)
      // Since this is a lightweight IDE, we focus on rehydrating the VFS first.
      // A production implementation would compute exact native CRUD operations here.
      // For this targeted fix, we rehydrate the VFS and warn the user.

      this.vfs.rehydrate(targetSnapshot.nodes);

      // Emit update so UI refreshes immediately
      WorkspaceEvents.emit(WorkspaceEventType.WorkspaceUpdated, undefined);

      console.warn(
        '[WorkspaceManager] History reverted VFS state, but native file diffing sync is limited in this phase.'
      );
      return true;
    } catch (e) {
      console.error('[WorkspaceManager] Undo/Redo apply failed', e);
      return false;
    } finally {
      WorkspaceSession.setLoading(false);
    }
  }

  // --- Phase 7: Workspace Settings ---

  public async updateSetting(key: string, value: any): Promise<void> {
    const workspaceId = this.getActiveWorkspaceId();
    if (!workspaceId) throw new Error('No active workspace');

    try {
      useWorkspaceSettingsStore.getState().updateSetting(key, value);
      const currentSettings = useWorkspaceSettingsStore.getState().settings;
      await this.persistence.saveSettings(workspaceId, currentSettings);
    } catch (e) {
      console.error('[WorkspaceManager] Failed to update setting', e);
      throw e;
    }
  }
}

export const WorkspaceManager = new WorkspaceManagerImpl();
