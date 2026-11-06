import * as sqlite3 from 'sqlite3';
import { AgentProtocol, IntelligenceProtocol } from '@ag/protocol';
import { IEmbeddingProvider } from '../domain/IEmbeddingProvider';

export class SQLiteProvider {
  private static readonly MAX_RESULTS_DEFAULT = 1000;
  private static readonly MAX_RESULTS_HARD = 1000;

  constructor(
    private readonly db: sqlite3.Database,
    private readonly embeddingProvider?: IEmbeddingProvider
  ) {}

  private getLimit(options?: any): number {
    const limit = options?.limit ?? SQLiteProvider.MAX_RESULTS_DEFAULT;
    return Math.min(limit, SQLiteProvider.MAX_RESULTS_HARD);
  }

  private async executeConsistentQuery<T>(
    workspaceId: string,
    sql: string,
    params: any[]
  ): Promise<AgentProtocol.IntelligenceQueryResult<T>> {
    return new Promise((resolve, reject) => {
      // Instead of manual transactions which conflict in node-sqlite3 when mixed with promises,
      // we inject a subquery to grab the sequence within the same atomic statement.
      // SQLite guarantees statement-level read consistency.
      const wrappedSql = `
        SELECT (SELECT sequence FROM snapshots WHERE workspaceId = ?) as _snapshotSequence,
        * FROM (${sql})
      `;
      const wrappedParams = [workspaceId, ...params];

      this.db.all(wrappedSql, wrappedParams, (err, rows: any[]) => {
        if (err) return reject(err);

        const snapshotSequence = rows.length > 0 ? rows[0]._snapshotSequence : 0;

        // Strip the _snapshotSequence from the results
        const results = rows.map((row) => {
          const { _snapshotSequence, ...rest } = row;
          return rest as T;
        });

        // If no results, we still want the correct snapshot sequence.
        // We can just fetch it separately. Since there are no rows, there's no race condition to worry about
        // regarding the rows themselves mutating underneath us.
        if (rows.length === 0) {
          this.db.get(
            'SELECT sequence FROM snapshots WHERE workspaceId = ?',
            [workspaceId],
            (seqErr, seqRow: any) => {
              if (seqErr) return reject(seqErr);
              resolve({
                workspaceId,
                snapshotSequence: seqRow ? seqRow.sequence : 0,
                results: [],
              });
            }
          );
        } else {
          resolve({
            workspaceId,
            snapshotSequence,
            results,
          });
        }
      });
    });
  }

  public async findDefinition(
    workspaceId: string,
    symbolName: string,
    options?: any
  ): Promise<AgentProtocol.IntelligenceQueryResult<AgentProtocol.DefinitionResult>> {
    const limit = this.getLimit(options);

    // Deterministic sort: exact match > kind > filepath > offset
    const sql = `
      SELECT s.name as symbolName, s.kind, f.filePath, s.line, s.column, s.startOffset, s.endOffset, s.snippet
      FROM symbols s
      JOIN files f ON s.fileId = f.id
      WHERE s.workspaceId = ? AND s.name = ?
      ORDER BY 
        CASE WHEN s.name = ? THEN 0 ELSE 1 END,
        s.kind ASC,
        f.filePath ASC,
        s.startOffset ASC
      LIMIT ?
    `;

    return this.executeConsistentQuery<AgentProtocol.DefinitionResult>(workspaceId, sql, [
      workspaceId,
      symbolName,
      symbolName,
      limit,
    ]);
  }

  public async findReferences(
    workspaceId: string,
    symbolName: string,
    options?: any
  ): Promise<AgentProtocol.IntelligenceQueryResult<AgentProtocol.ReferenceResult>> {
    const limit = this.getLimit(options);

    // References are syntactic identifiers, not definitions.
    // We order them deterministically by file and location.
    const sql = `
      SELECT r.symbolName, f.filePath, r.line, r.column, r.startOffset, r.endOffset
      FROM references_t r
      JOIN files f ON r.fileId = f.id
      WHERE r.workspaceId = ? AND r.symbolName = ?
      ORDER BY 
        f.filePath ASC,
        r.startOffset ASC
      LIMIT ?
    `;

    return this.executeConsistentQuery<AgentProtocol.ReferenceResult>(workspaceId, sql, [
      workspaceId,
      symbolName,
      limit,
    ]);
  }

  public async searchSymbols(
    workspaceId: string,
    query: string,
    options?: any
  ): Promise<AgentProtocol.IntelligenceQueryResult<AgentProtocol.DefinitionResult>> {
    const limit = this.getLimit(options);

    const likeQuery = `%${query}%`;

    // Deterministic sort: exact match first, then by name, kind, file, offset
    const sql = `
      SELECT s.name as symbolName, s.kind, f.filePath, s.line, s.column, s.startOffset, s.endOffset, s.snippet
      FROM symbols s
      JOIN files f ON s.fileId = f.id
      WHERE s.workspaceId = ? AND s.name LIKE ?
      ORDER BY 
        CASE WHEN s.name = ? THEN 0 ELSE 1 END,
        s.name ASC,
        s.kind ASC,
        f.filePath ASC,
        s.startOffset ASC
      LIMIT ?
    `;

    return this.executeConsistentQuery<AgentProtocol.DefinitionResult>(workspaceId, sql, [
      workspaceId,
      likeQuery,
      query,
      limit,
    ]);
  }

  public async getRepositoryMap(
    workspaceId: string
  ): Promise<AgentProtocol.IntelligenceQueryResult<AgentProtocol.RepositoryMapResult>> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT sequence FROM snapshots WHERE workspaceId = ?',
        [workspaceId],
        (seqErr, seqRow: any) => {
          if (seqErr) return reject(seqErr);
          const snapshotSequence = seqRow ? seqRow.sequence : 0;

          this.db.all(
            'SELECT id, filePath FROM files WHERE workspaceId = ? ORDER BY filePath ASC',
            [workspaceId],
            (fileErr, files: any[]) => {
              if (fileErr) return reject(fileErr);

              this.db.all(
                'SELECT fileId, name, kind FROM symbols WHERE workspaceId = ? ORDER BY line ASC',
                [workspaceId],
                (symErr, symbols: any[]) => {
                  if (symErr) return reject(symErr);

                  const fileSymbols = new Map<string, { name: string; kind: string }[]>();
                  for (const sym of symbols) {
                    if (!fileSymbols.has(sym.fileId)) fileSymbols.set(sym.fileId, []);
                    fileSymbols.get(sym.fileId)!.push({ name: sym.name, kind: sym.kind });
                  }

                  let content = 'Project:\n';
                  for (const f of files) {
                    content += `/${f.filePath}\n`;
                    const syms = fileSymbols.get(f.id) || [];
                    const important = syms.filter((s) =>
                      ['Class', 'Function', 'Interface'].includes(s.kind)
                    );
                    for (const sym of important) {
                      content += `  - ${sym.kind}: ${sym.name}\n`;
                    }
                  }

                  resolve({
                    workspaceId,
                    snapshotSequence,
                    results: [
                      { content: content === 'Project:\n' ? 'Empty repository.' : content },
                    ],
                  });
                }
              );
            }
          );
        }
      );
    });
  }

  public async semanticSearch(
    workspaceId: string,
    query: string,
    options?: any
  ): Promise<AgentProtocol.IntelligenceQueryResult<AgentProtocol.SemanticSearchResult>> {
    const limit = this.getLimit(options);

    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT sequence FROM snapshots WHERE workspaceId = ?',
        [workspaceId],
        async (seqErr, seqRow: any) => {
          if (seqErr) return reject(seqErr);
          const snapshotSequence = seqRow ? seqRow.sequence : 0;

          if (!this.embeddingProvider) {
            // If no embedding provider, return empty
            return resolve({ workspaceId, snapshotSequence, results: [] });
          }

          try {
            const queryVector = await this.embeddingProvider.embed(query);

            this.db.all(
              'SELECT e.chunkId, e.content, e.vector, e.symbolName, f.filePath FROM embeddings e JOIN files f ON e.fileId = f.id WHERE e.workspaceId = ?',
              [workspaceId],
              (err, rows: any[]) => {
                if (err) return reject(err);

                const results: (AgentProtocol.SemanticSearchResult & { score: number })[] = [];

                for (const row of rows) {
                  const vectorBuf = row.vector as Buffer;
                  const f32 = new Float32Array(
                    vectorBuf.buffer,
                    vectorBuf.byteOffset,
                    vectorBuf.byteLength / 4
                  );

                  let dot = 0;
                  let magA = 0;
                  let magB = 0;
                  for (let i = 0; i < queryVector.length; i++) {
                    dot += queryVector[i] * f32[i];
                    magA += queryVector[i] * queryVector[i];
                    magB += f32[i] * f32[i];
                  }
                  const score = dot / (Math.sqrt(magA) * Math.sqrt(magB));

                  results.push({
                    filePath: row.filePath,
                    chunkId: row.chunkId,
                    score,
                    content: row.content,
                    symbolName: row.symbolName,
                  });
                }

                results.sort((a, b) => b.score - a.score);

                resolve({
                  workspaceId,
                  snapshotSequence,
                  results: results.slice(0, limit),
                });
              }
            );
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  }
}
