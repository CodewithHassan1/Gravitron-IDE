import { IStorageAdapter } from './StorageAdapter';
import { IndexedDBDatabase } from './IndexedDBDatabase';
import { IndexedDBTransaction } from './IndexedDBTransaction';
import { IndexedDBMigration } from './IndexedDBMigration';

export class IndexedDBAdapter implements IStorageAdapter {
  private db: IndexedDBDatabase;

  constructor(
    private readonly dbName: string = 'AntiGravityIDE',
    private readonly storeName: string = 'configuration',
    private readonly version: number = 1
  ) {
    this.db = new IndexedDBDatabase(this.dbName, this.version, IndexedDBMigration.run);
  }

  private async getTransaction(
    mode: IDBTransactionMode = 'readonly'
  ): Promise<IndexedDBTransaction> {
    const dbInstance = await this.db.connect();
    return new IndexedDBTransaction(dbInstance, this.storeName, mode);
  }

  async get<T>(key: string): Promise<T | null> {
    const tx = await this.getTransaction('readonly');
    return tx.get<T>(key);
  }

  async set<T>(key: string, value: T): Promise<void> {
    const tx = await this.getTransaction('readwrite');
    return tx.set<T>(key, value);
  }

  async remove(key: string): Promise<void> {
    const tx = await this.getTransaction('readwrite');
    return tx.remove(key);
  }

  async clear(): Promise<void> {
    const tx = await this.getTransaction('readwrite');
    return tx.clear();
  }

  async keys(): Promise<string[]> {
    const tx = await this.getTransaction('readonly');
    return tx.keys();
  }

  async getAll(): Promise<Record<string, any>> {
    const tx = await this.getTransaction('readonly');
    return tx.getAll();
  }
}
