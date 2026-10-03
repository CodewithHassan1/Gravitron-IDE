export class IndexedDBTransaction {
  constructor(
    private readonly db: IDBDatabase,
    private readonly storeName: string,
    private readonly mode: IDBTransactionMode = 'readonly'
  ) {}

  async get<T>(key: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(this.storeName, this.mode);
        const store = transaction.objectStore(this.storeName);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result !== undefined ? request.result : null);
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async set<T>(key: string, value: T): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.put(value, key);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async remove(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.delete(key);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.clear();

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async keys(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.getAllKeys();

        request.onsuccess = () => resolve(request.result as string[]);
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async getAll(): Promise<Record<string, any>> {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);
        
        const keysRequest = store.getAllKeys();
        const valuesRequest = store.getAll();

        transaction.oncomplete = () => {
          const keys = keysRequest.result as string[];
          const values = valuesRequest.result;
          const result: Record<string, any> = {};
          keys.forEach((key, index) => {
            result[key] = values[index];
          });
          resolve(result);
        };
        transaction.onerror = () => reject(transaction.error);
      } catch (err) {
        reject(err);
      }
    });
  }
}
