import sqlite3 from 'sqlite3';
import { ISQLiteStore } from './ISQLiteStore';
import { FileDTO, SymbolDTO, ReferenceDTO, ImportDTO, SnapshotDTO, EmbeddingDTO } from '../domain/IndexDTOs';
import { randomUUID } from 'crypto';

export class SQLiteStore implements ISQLiteStore {
  private db: sqlite3.Database;
  private isInitialized = false;

  constructor(private readonly workspaceId: string, private readonly dbPath: string) {
    this.db = new sqlite3.Database(dbPath);
  }

  private run(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private get<T>(sql: string, params: any[] = []): Promise<T | null> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve((row as T) || null);
      });
    });
  }

  private all<T>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await this.run('PRAGMA foreign_keys = ON');

    await this.run(`
      CREATE TABLE IF NOT EXISTS snapshots (
        workspaceId TEXT PRIMARY KEY,
        sequence INTEGER NOT NULL,
        createdAt INTEGER NOT NULL
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        workspaceId TEXT NOT NULL,
        filePath TEXT NOT NULL,
        hash TEXT NOT NULL,
        updatedAt INTEGER NOT NULL,
        UNIQUE(workspaceId, filePath)
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS symbols (
        id TEXT PRIMARY KEY,
        workspaceId TEXT NOT NULL,
        fileId TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        line INTEGER NOT NULL,
        column INTEGER NOT NULL,
        startOffset INTEGER,
        endOffset INTEGER,
        snippet TEXT,
        FOREIGN KEY(fileId) REFERENCES files(id) ON DELETE CASCADE
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS references_t (
        id TEXT PRIMARY KEY,
        workspaceId TEXT NOT NULL,
        fileId TEXT NOT NULL,
        symbolName TEXT NOT NULL,
        line INTEGER NOT NULL,
        column INTEGER NOT NULL,
        startOffset INTEGER,
        endOffset INTEGER,
        FOREIGN KEY(fileId) REFERENCES files(id) ON DELETE CASCADE
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS imports (
        id TEXT PRIMARY KEY,
        workspaceId TEXT NOT NULL,
        fileId TEXT NOT NULL,
        sourceId TEXT,
        moduleName TEXT NOT NULL,
        symbolName TEXT,
        startOffset INTEGER,
        endOffset INTEGER,
        FOREIGN KEY(fileId) REFERENCES files(id) ON DELETE CASCADE
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id TEXT PRIMARY KEY,
        workspaceId TEXT NOT NULL,
        fileId TEXT NOT NULL,
        chunkId TEXT NOT NULL,
        content TEXT NOT NULL,
        vector BLOB NOT NULL,
        symbolName TEXT,
        FOREIGN KEY(fileId) REFERENCES files(id) ON DELETE CASCADE
      )
    `);

    // Ensure there is at least one snapshot entry
    const existingSnapshot = await this.getLatestSnapshot();
    if (!existingSnapshot) {
      await this.run('INSERT INTO snapshots (workspaceId, sequence, createdAt) VALUES (?, ?, ?)', [
        this.workspaceId,
        0,
        Date.now()
      ]);
    }

    this.isInitialized = true;
  }

  public getDb(): sqlite3.Database {
    if (!this.isInitialized || !this.db) {
      throw new Error("Database not initialized");
    }
    return this.db;
  }

  public async close(): Promise<void> {
    if (!this.isInitialized) return;
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err && (err as any).code !== 'SQLITE_MISUSE') reject(err);
        else {
          this.isInitialized = false;
          resolve();
        }
      });
    });
  }

  public async getLatestSnapshot(): Promise<SnapshotDTO | null> {
    const row = await this.get<any>('SELECT * FROM snapshots WHERE workspaceId = ?', [this.workspaceId]);
    if (!row) return null;
    return {
      workspaceId: row.workspaceId,
      sequence: row.sequence,
      createdAt: row.createdAt
    };
  }

  public async commitFileIndex(
    file: FileDTO,
    symbols: Omit<SymbolDTO, 'id' | 'workspaceId' | 'fileId'>[],
    references: Omit<ReferenceDTO, 'id' | 'workspaceId' | 'fileId'>[],
    imports: Omit<ImportDTO, 'id' | 'workspaceId' | 'fileId'>[],
    embeddings: Omit<EmbeddingDTO, 'id' | 'workspaceId' | 'fileId'>[] = []
  ): Promise<SnapshotDTO> {
    return new Promise((resolve, reject) => {
      let hasError = false;
      const handleError = (err: any) => {
        if (hasError) return;
        hasError = true;
        this.db.run('ROLLBACK', () => reject(err));
      };

      this.db.serialize(() => {
        this.db.run('BEGIN EXCLUSIVE TRANSACTION', (err) => { if (err) handleError(err); });

        const fileId = file.id || randomUUID();

        this.db.run('DELETE FROM files WHERE workspaceId = ? AND filePath = ?', [this.workspaceId, file.filePath], (err) => { if (err) handleError(err); });

        this.db.run('INSERT INTO files (id, workspaceId, filePath, hash, updatedAt) VALUES (?, ?, ?, ?, ?)', [
          fileId, this.workspaceId, file.filePath, file.hash, file.updatedAt
        ], (err) => { if (err) handleError(err); });

        const insertSymbol = this.db.prepare('INSERT INTO symbols (id, workspaceId, fileId, name, kind, line, column, startOffset, endOffset, snippet) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (const sym of symbols) {
          insertSymbol.run([randomUUID(), this.workspaceId, fileId, sym.name, sym.kind, sym.line, sym.column, sym.startOffset || null, sym.endOffset || null, sym.snippet || null], (err) => { if (err) handleError(err); });
        }
        insertSymbol.finalize((err) => { if (err) handleError(err); });

        const insertRef = this.db.prepare('INSERT INTO references_t (id, workspaceId, fileId, symbolName, line, column, startOffset, endOffset) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (const ref of references) {
          insertRef.run([randomUUID(), this.workspaceId, fileId, ref.symbolName, ref.line, ref.column, ref.startOffset || null, ref.endOffset || null], (err) => { if (err) handleError(err); });
        }
        insertRef.finalize((err) => { if (err) handleError(err); });

        const insertImport = this.db.prepare('INSERT INTO imports (id, workspaceId, fileId, sourceId, moduleName, symbolName, startOffset, endOffset) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (const imp of imports) {
          insertImport.run([randomUUID(), this.workspaceId, fileId, imp.sourceId || null, imp.moduleName, imp.symbolName || null, imp.startOffset || null, imp.endOffset || null], (err) => { if (err) handleError(err); });
        }
        insertImport.finalize((err) => { if (err) handleError(err); });

        const insertEmbed = this.db.prepare('INSERT INTO embeddings (id, workspaceId, fileId, chunkId, content, vector, symbolName) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const emb of embeddings) {
          // Convert vector to JSON string for BLOB storage, or Buffer if supported.
          // We will store as Buffer for compact size. Float32Array to Buffer.
          const f32 = new Float32Array(emb.vector);
          const buf = Buffer.from(f32.buffer);
          insertEmbed.run([randomUUID(), this.workspaceId, fileId, emb.chunkId, emb.content, buf, emb.symbolName || null], (err) => { if (err) handleError(err); });
        }
        insertEmbed.finalize((err) => { if (err) handleError(err); });

        const now = Date.now();
        this.db.run('UPDATE snapshots SET sequence = sequence + 1, createdAt = ? WHERE workspaceId = ?', [now, this.workspaceId], (err) => { if (err) handleError(err); });

        this.db.get('SELECT * FROM snapshots WHERE workspaceId = ?', [this.workspaceId], (err, row: any) => {
          if (err) return handleError(err);
          if (hasError) return;
          this.db.run('COMMIT', (commitErr) => {
            if (commitErr) return handleError(commitErr);
            resolve({
              workspaceId: row.workspaceId,
              sequence: row.sequence,
              createdAt: row.createdAt
            });
          });
        });
      });
    });
  }

  public async deleteFileIndex(filePath: string): Promise<SnapshotDTO> {
    return new Promise((resolve, reject) => {
      let hasError = false;
      const handleError = (err: any) => {
        if (hasError) return;
        hasError = true;
        this.db.run('ROLLBACK', () => reject(err));
      };

      this.db.serialize(() => {
        this.db.run('BEGIN EXCLUSIVE TRANSACTION', (err) => { if (err) handleError(err); });
        
        this.db.run('DELETE FROM files WHERE workspaceId = ? AND filePath = ?', [this.workspaceId, filePath], (err) => { if (err) handleError(err); });

        const now = Date.now();
        this.db.run('UPDATE snapshots SET sequence = sequence + 1, createdAt = ? WHERE workspaceId = ?', [now, this.workspaceId], (err) => { if (err) handleError(err); });

        this.db.get('SELECT * FROM snapshots WHERE workspaceId = ?', [this.workspaceId], (err, row: any) => {
          if (err) return handleError(err);
          if (hasError) return;
          this.db.run('COMMIT', (commitErr) => {
            if (commitErr) return handleError(commitErr);
            resolve({
              workspaceId: row.workspaceId,
              sequence: row.sequence,
              createdAt: row.createdAt
            });
          });
        });
      });
    });
  }

  public async getFile(filePath: string): Promise<FileDTO | null> {
    return this.get<FileDTO>('SELECT * FROM files WHERE workspaceId = ? AND filePath = ?', [this.workspaceId, filePath]);
  }

  public async getSymbols(filePath: string): Promise<SymbolDTO[]> {
    return this.all<SymbolDTO>(`
      SELECT s.* FROM symbols s
      JOIN files f ON f.id = s.fileId
      WHERE f.workspaceId = ? AND f.filePath = ?
    `, [this.workspaceId, filePath]);
  }

  public async getReferences(filePath: string): Promise<ReferenceDTO[]> {
    return this.all<ReferenceDTO>(`
      SELECT r.* FROM references_t r
      JOIN files f ON f.id = r.fileId
      WHERE f.workspaceId = ? AND f.filePath = ?
    `, [this.workspaceId, filePath]);
  }

  public async getImports(filePath: string): Promise<ImportDTO[]> {
    return this.all<ImportDTO>(`
      SELECT i.* FROM imports i
      JOIN files f ON f.id = i.fileId
      WHERE f.workspaceId = ? AND f.filePath = ?
    `, [this.workspaceId, filePath]);
  }
}
