import { FileDTO, SymbolDTO, ReferenceDTO, ImportDTO, SnapshotDTO, EmbeddingDTO } from '../domain/IndexDTOs';

export interface ISQLiteStore {
  /**
   * Initialize the database schema for the given workspace
   */
  initialize(): Promise<void>;

  /**
   * Close the database connection
   */
  close(): Promise<void>;

  /**
   * Get the current snapshot generation sequence
   */
  getLatestSnapshot(): Promise<SnapshotDTO | null>;

  /**
   * Execute a transaction that fully replaces a file and increments the snapshot generation.
   * This must be atomic: if it fails, the previous state and snapshot sequence must remain intact.
   */
  commitFileIndex(
    file: FileDTO,
    symbols: Omit<SymbolDTO, 'id' | 'workspaceId' | 'fileId'>[],
    references: Omit<ReferenceDTO, 'id' | 'workspaceId' | 'fileId'>[],
    imports: Omit<ImportDTO, 'id' | 'workspaceId' | 'fileId'>[],
    embeddings?: Omit<EmbeddingDTO, 'id' | 'workspaceId' | 'fileId'>[]
  ): Promise<SnapshotDTO>;

  /**
   * Execute a transaction that removes a file and its associated index entries,
   * incrementing the snapshot generation.
   */
  deleteFileIndex(filePath: string): Promise<SnapshotDTO>;

  // Basic query methods for test assertions
  getFile(filePath: string): Promise<FileDTO | null>;
  getSymbols(filePath: string): Promise<SymbolDTO[]>;
  getReferences(filePath: string): Promise<ReferenceDTO[]>;
  getImports(filePath: string): Promise<ImportDTO[]>;
}
