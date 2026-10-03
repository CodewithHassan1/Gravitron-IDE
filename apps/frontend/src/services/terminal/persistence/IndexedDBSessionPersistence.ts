// src/services/terminal/persistence/IndexedDBSessionPersistence.ts

import { SessionPersistence } from './SessionPersistence';
import { TerminalSnapshot } from '../types';

export class IndexedDBSessionPersistence implements SessionPersistence {
  private dbName = 'TerminalEngineDB';
  private storeName = 'sessions';
  private version = 1;
  private dbPromise: Promise<IDBDatabase> | null = null;

  private async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      // Stubbing indexedDB for environments like Node testing
      const indexedDB = globalThis.indexedDB;
      if (!indexedDB) {
        // Fallback for tests if IDB is totally missing
        reject(new Error('IndexedDB not supported in this environment.'));
        return;
      }

      const request = indexedDB.open(this.dbName, this.version);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  public async save(workspaceId: string, snapshot: TerminalSnapshot): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        store.put({ id: workspaceId, snapshot });
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Failed to save terminal snapshot to IndexedDB:', e);
    }
  }

  public async load(workspaceId: string): Promise<TerminalSnapshot | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const request = store.get(workspaceId);
        
        request.onsuccess = () => {
          if (request.result) resolve(request.result.snapshot as TerminalSnapshot);
          else resolve(null);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn('Failed to load terminal snapshot from IndexedDB:', e);
      return null;
    }
  }

  public async clear(workspaceId: string): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const request = store.delete(workspaceId);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn('Failed to clear terminal snapshot from IndexedDB:', e);
    }
  }
}
