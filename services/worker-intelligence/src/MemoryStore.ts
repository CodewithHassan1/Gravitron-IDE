import * as sqlite3 from 'sqlite3';

export interface EpisodicMemory {
  role: string;
  content: string | Record<string, any>;
  timestamp: number;
}

export interface LongTermMemory {
  id?: string;
  content: string;
  embedding?: number[];
  confidence: number;
  timestamp: number;
}

export class MemoryStore {
  constructor(private readonly db: sqlite3.Database) {}

  public async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(`
          CREATE TABLE IF NOT EXISTS episodic_memory (
            id TEXT PRIMARY KEY,
            workspaceId TEXT NOT NULL,
            sessionId TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp INTEGER NOT NULL
          )
        `);
        
        this.db.run(`
          CREATE TABLE IF NOT EXISTS long_term_memory (
            id TEXT PRIMARY KEY,
            workspaceId TEXT NOT NULL,
            content TEXT NOT NULL,
            embedding_json TEXT,
            confidence REAL NOT NULL,
            timestamp INTEGER NOT NULL
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  public async addEpisodic(workspaceId: string, sessionId: string, memory: EpisodicMemory): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).substring(2, 15);
      const contentStr = typeof memory.content === 'string' ? memory.content : JSON.stringify(memory.content);
      this.db.run(
        `INSERT INTO episodic_memory (id, workspaceId, sessionId, role, content, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, workspaceId, sessionId, memory.role, contentStr, memory.timestamp],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  public async getEpisodic(workspaceId: string, sessionId: string, limit = 100): Promise<EpisodicMemory[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT role, content, timestamp FROM episodic_memory WHERE workspaceId = ? AND sessionId = ? ORDER BY timestamp ASC LIMIT ?`,
        [workspaceId, sessionId, limit],
        (err, rows: any[]) => {
          if (err) return reject(err);
          resolve(rows.map(row => ({
            role: row.role,
            content: row.content,
            timestamp: row.timestamp
          })));
        }
      );
    });
  }

  public async addLongTerm(workspaceId: string, memory: LongTermMemory): Promise<void> {
    // Deduplication check: Do we already have this exact content?
    const existing = await this.findExactLongTerm(workspaceId, memory.content);
    if (existing) {
      return new Promise((resolve, reject) => {
        this.db.run(
          `UPDATE long_term_memory SET confidence = ?, timestamp = ? WHERE id = ?`,
          [Math.max(existing.confidence, memory.confidence), memory.timestamp, existing.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    return new Promise((resolve, reject) => {
      const id = memory.id || Math.random().toString(36).substring(2, 15);
      const embStr = memory.embedding ? JSON.stringify(memory.embedding) : null;
      this.db.run(
        `INSERT INTO long_term_memory (id, workspaceId, content, embedding_json, confidence, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, workspaceId, memory.content, embStr, memory.confidence, memory.timestamp],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  private async findExactLongTerm(workspaceId: string, content: string): Promise<LongTermMemory | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT id, content, confidence, timestamp FROM long_term_memory WHERE workspaceId = ? AND content = ?`,
        [workspaceId, content],
        (err, row: any) => {
          if (err) return reject(err);
          if (!row) return resolve(null);
          resolve({
            id: row.id,
            content: row.content,
            confidence: row.confidence,
            timestamp: row.timestamp
          });
        }
      );
    });
  }

  public async getLongTerm(workspaceId: string, limit = 100): Promise<LongTermMemory[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT id, content, confidence, timestamp FROM long_term_memory WHERE workspaceId = ? ORDER BY timestamp DESC LIMIT ?`,
        [workspaceId, limit],
        (err, rows: any[]) => {
          if (err) return reject(err);
          resolve(rows.map(row => ({
            id: row.id,
            content: row.content,
            confidence: row.confidence,
            timestamp: row.timestamp
          })));
        }
      );
    });
  }

  public async searchLongTerm(workspaceId: string, queryEmbedding: number[], limit = 5): Promise<LongTermMemory[]> {
    // In a real SQLite environment with pgvector or custom extension, this would be an exact cosine distance query.
    // For this demonstration and compatibility, we retrieve top N based on confidence, or if a custom math function is registered, we use it.
    // Assuming custom math isn't easily available in standard node-sqlite3 without compiling extensions, 
    // we would theoretically do: SELECT * FROM long_term_memory WHERE workspaceId = ? ORDER BY vec_distance(embedding_json, ?) LIMIT ?
    
    // For the sake of the IDE milestone 6 which uses `sqlite-vec` or `sqlite-vss`, we will simulate a query format that the real implementation would catch.
    return new Promise((resolve, reject) => {
      // Dummy implementation for tests/fallback that just returns highly confident memories
      this.db.all(
        `SELECT id, content, confidence, timestamp FROM long_term_memory WHERE workspaceId = ? ORDER BY confidence DESC LIMIT ?`,
        [workspaceId, limit],
        (err, rows: any[]) => {
          if (err) return reject(err);
          resolve(rows.map(row => ({
            id: row.id,
            content: row.content,
            confidence: row.confidence,
            timestamp: row.timestamp
          })));
        }
      );
    });
  }
}
