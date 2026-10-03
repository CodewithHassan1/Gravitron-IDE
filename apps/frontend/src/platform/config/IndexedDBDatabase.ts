export class IndexedDBDatabase {
  private db: IDBDatabase | null = null;
  
  constructor(
    private readonly dbName: string,
    private readonly version: number,
    private readonly onUpgradeNeeded: (db: IDBDatabase, oldVersion: number, newVersion: number | null) => void
  ) {}

  async connect(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.onUpgradeNeeded(db, event.oldVersion, event.newVersion);
      };
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  getDatabase(): IDBDatabase | null {
    return this.db;
  }
}
