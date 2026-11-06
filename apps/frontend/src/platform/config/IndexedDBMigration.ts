export class IndexedDBMigration {
  static run(db: IDBDatabase, oldVersion: number, newVersion: number | null) {
    if (oldVersion < 1) {
      if (!db.objectStoreNames.contains('configuration')) {
        db.createObjectStore('configuration');
      }
      if (!db.objectStoreNames.contains('workspace')) {
        db.createObjectStore('workspace');
      }
      if (!db.objectStoreNames.contains('profiles')) {
        db.createObjectStore('profiles');
      }
      // Future extensions, AI cache, etc. can be added here in v2+
    }

    // Future migrations
    // if (oldVersion < 2) { ... }
  }
}
