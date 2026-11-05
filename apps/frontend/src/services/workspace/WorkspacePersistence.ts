import { openDB, IDBPDatabase } from 'idb';
import { WorkspaceMetadata, WorkspaceHandle, WorkspaceSnapshot } from './types';
import { WorkspaceNode } from './vfs/WorkspaceNode';

const DB_NAME = 'ag-workspace-engine';
const DB_VERSION = 1;

export interface WorkspaceRecord extends WorkspaceMetadata {
  nativeHandle: any | null;
}

export interface SnapshotRecord {
  workspaceId: string;
  version: number;
  nodes: WorkspaceNode[];
}

export interface WorkspaceSettingsRecord {
  workspaceId: string;
  settings: Record<string, any>;
}

export class WorkspacePersistence {
  private dbPromise: Promise<IDBPDatabase>;

  constructor() {
    this.dbPromise = this.initDB();
  }

  private initDB(): Promise<IDBPDatabase> {
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      return Promise.resolve({} as IDBPDatabase);
    }
    return openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('workspaces')) {
          db.createObjectStore('workspaces', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots', { keyPath: 'workspaceId' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'workspaceId' });
        }
      },
    });
  }

  /**
   * Save workspace metadata and native handle (if any)
   */
  public async saveWorkspace(
    metadata: WorkspaceMetadata,
    handle: WorkspaceHandle | null
  ): Promise<void> {
    const db = await this.dbPromise;
    const record: WorkspaceRecord = {
      ...metadata,
      nativeHandle: handle ? handle.nativeHandle : null,
    };
    await db.put('workspaces', record);
  }

  /**
   * Retrieve workspace metadata and native handle by ID
   */
  public async getWorkspace(
    workspaceId: string
  ): Promise<{ metadata: WorkspaceMetadata; handle: WorkspaceHandle | null } | null> {
    const db = await this.dbPromise;
    const record = (await db.get('workspaces', workspaceId)) as WorkspaceRecord;
    if (!record) return null;

    const metadata: WorkspaceMetadata = {
      id: record.id,
      name: record.name,
      uri: record.uri,
      provider: record.provider,
      lastOpened: record.lastOpened,
      type: record.type,
      capabilities: record.capabilities,
    };

    const handle: WorkspaceHandle | null = record.nativeHandle
      ? { nativeHandle: record.nativeHandle }
      : null;

    return { metadata, handle };
  }

  /**
   * List all saved workspaces
   */
  public async listWorkspaces(): Promise<WorkspaceMetadata[]> {
    const db = await this.dbPromise;
    const records = (await db.getAll('workspaces')) as WorkspaceRecord[];
    return records
      .map((record) => ({
        id: record.id,
        name: record.name,
        uri: record.uri,
        provider: record.provider,
        lastOpened: record.lastOpened,
        type: record.type,
        capabilities: record.capabilities,
      }))
      .sort((a, b) => b.lastOpened - a.lastOpened);
  }

  /**
   * Save a snapshot of the virtual file system
   */
  public async saveSnapshot(workspaceId: string, snapshot: WorkspaceSnapshot): Promise<void> {
    const db = await this.dbPromise;
    const record: SnapshotRecord = {
      workspaceId,
      version: snapshot.version,
      nodes: snapshot.nodes as WorkspaceNode[],
    };
    await db.put('snapshots', record);
  }

  /**
   * Retrieve the latest snapshot of the virtual file system
   */
  public async getSnapshot(workspaceId: string): Promise<WorkspaceSnapshot | null> {
    const db = await this.dbPromise;
    const record = (await db.get('snapshots', workspaceId)) as SnapshotRecord;
    if (!record) return null;
    return {
      version: record.version,
      nodes: record.nodes,
    };
  }

  /**
   * Delete a workspace and its snapshot
   */
  public async deleteWorkspace(workspaceId: string): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction(['workspaces', 'snapshots'], 'readwrite');
    await tx.objectStore('workspaces').delete(workspaceId);
    await tx.objectStore('snapshots').delete(workspaceId);
    await tx.done;
  }

  /**
   * Retrieves workspace settings by workspace ID.
   */
  async getSettings(workspaceId: string): Promise<Record<string, any> | null> {
    try {
      const raw = localStorage.getItem(`workspace_settings_${workspaceId}`);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error('Failed to get workspace settings:', error);
      return null;
    }
  }

  /**
   * Saves workspace settings by workspace ID.
   */
  async saveSettings(workspaceId: string, settings: Record<string, any>): Promise<void> {
    try {
      localStorage.setItem(`workspace_settings_${workspaceId}`, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save workspace settings:', error);
    }
  }
}
