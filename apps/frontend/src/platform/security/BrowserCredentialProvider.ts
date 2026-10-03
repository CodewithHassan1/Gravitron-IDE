import { ICredentialProvider, Credential } from './CredentialProvider';

const DB_NAME = 'ag_credentials';
const STORE_NAME = 'tokens';

export class BrowserCredentialProvider implements ICredentialProvider {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: 'serviceId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  async storeCredential(serviceId: string, token: string, metadata?: any): Promise<void> {
    const db = await this.getDB();
    // In a real browser implementation, you'd want to encrypt `token` using Web Crypto API 
    // before saving to IndexedDB. We simulate the interface here.
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({ serviceId, token, metadata });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getCredential(serviceId: string): Promise<Credential | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(serviceId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteCredential(serviceId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(serviceId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
