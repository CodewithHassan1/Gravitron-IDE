import { ISQLiteStore } from './ISQLiteStore';
import {
  SnapshotDTO,
  FileDTO,
  SymbolDTO,
  ReferenceDTO,
  ImportDTO,
  EmbeddingDTO,
} from '../domain/IndexDTOs';

export class SnapshotModel {
  constructor(private readonly store: ISQLiteStore) {}

  public async getLatestSequence(): Promise<number> {
    const snapshot = await this.store.getLatestSnapshot();
    return snapshot ? snapshot.sequence : 0;
  }

  public async getLatestSnapshot(): Promise<SnapshotDTO | null> {
    return this.store.getLatestSnapshot();
  }

  public async commitFile(
    file: FileDTO,
    symbols: Omit<SymbolDTO, 'id' | 'workspaceId' | 'fileId'>[],
    references: Omit<ReferenceDTO, 'id' | 'workspaceId' | 'fileId'>[],
    imports: Omit<ImportDTO, 'id' | 'workspaceId' | 'fileId'>[],
    embeddings: Omit<EmbeddingDTO, 'id' | 'workspaceId' | 'fileId'>[] = []
  ): Promise<SnapshotDTO> {
    // We could add business logic here (e.g. validating limits, triggering events)
    // For now, it delegates to the atomic store transaction
    return this.store.commitFileIndex(file, symbols, references, imports, embeddings);
  }

  public getWorkspaceId(): string {
    return (this.store as any).workspaceId; // SQLiteStore exposes workspaceId
  }

  public async deleteFile(filePath: string): Promise<SnapshotDTO> {
    return this.store.deleteFileIndex(filePath);
  }

  public async getFile(filePath: string): Promise<FileDTO | null> {
    return this.store.getFile(filePath);
  }

  public async getFileSymbols(filePath: string): Promise<SymbolDTO[]> {
    return this.store.getSymbols(filePath);
  }

  public async getFileReferences(filePath: string): Promise<ReferenceDTO[]> {
    return this.store.getReferences(filePath);
  }

  public async getFileImports(filePath: string): Promise<ImportDTO[]> {
    return this.store.getImports(filePath);
  }
}
