// src/services/workspace/WorkspaceCache.ts
import { WorkspaceMetadata, WorkspaceHandle, WorkspaceSnapshot } from './types';

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  lastAccessed: number;
}

export class WorkspaceCacheImpl {
  private metadataCache = new Map<string, CacheEntry<WorkspaceMetadata>>();
  private handleCache = new Map<string, CacheEntry<WorkspaceHandle>>();
  private snapshotCache = new Map<string, CacheEntry<WorkspaceSnapshot>>();

  // Default Time-To-Live (e.g. 1 hour)
  private readonly DEFAULT_TTL = 1000 * 60 * 60;

  /**
   * Sets workspace metadata in the cache.
   */
  setMetadata(id: string, metadata: WorkspaceMetadata): void {
    this.metadataCache.set(id, this.createEntry(metadata));
    this.evictLRU(this.metadataCache, 50); // LRU bound
  }

  getMetadata(id: string): WorkspaceMetadata | null {
    return this.getEntry(this.metadataCache, id);
  }

  /**
   * Sets the native directory handle in the cache.
   */
  setHandle(id: string, handle: WorkspaceHandle): void {
    this.handleCache.set(id, this.createEntry(handle));
    this.evictLRU(this.handleCache, 10);
  }

  getHandle(id: string): WorkspaceHandle | null {
    return this.getEntry(this.handleCache, id);
  }

  /**
   * Sets the workspace snapshot (virtual file tree).
   */
  setSnapshot(id: string, snapshot: WorkspaceSnapshot): void {
    this.snapshotCache.set(id, this.createEntry(snapshot));
    this.evictLRU(this.snapshotCache, 5); // Snapshots are large, strict bound
  }

  getSnapshot(id: string): WorkspaceSnapshot | null {
    return this.getEntry(this.snapshotCache, id);
  }

  /**
   * Invalidates all cache entries for a specific workspace.
   */
  invalidate(id: string): void {
    this.metadataCache.delete(id);
    this.handleCache.delete(id);
    this.snapshotCache.delete(id);
  }

  /**
   * Clears the entire cache.
   */
  clearAll(): void {
    this.metadataCache.clear();
    this.handleCache.clear();
    this.snapshotCache.clear();
  }

  private createEntry<T>(value: T): CacheEntry<T> {
    const now = Date.now();
    return { value, timestamp: now, lastAccessed: now };
  }

  private getEntry<T>(cache: Map<string, CacheEntry<T>>, id: string): T | null {
    const entry = cache.get(id);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this.DEFAULT_TTL) {
      cache.delete(id);
      return null;
    }

    entry.lastAccessed = now;
    return entry.value;
  }

  /**
   * Least Recently Used (LRU) eviction policy.
   */
  private evictLRU<T>(cache: Map<string, CacheEntry<T>>, maxItems: number): void {
    if (cache.size <= maxItems) return;

    let oldestId: string | null = null;
    let oldestAccess = Infinity;

    cache.forEach((entry, id) => {
      if (entry.lastAccessed < oldestAccess) {
        oldestAccess = entry.lastAccessed;
        oldestId = id;
      }
    });

    if (oldestId) {
      cache.delete(oldestId);
    }
  }
}

// Export singleton instance
export const WorkspaceCache = new WorkspaceCacheImpl();
