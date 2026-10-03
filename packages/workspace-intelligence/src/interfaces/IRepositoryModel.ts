import { RepositorySnapshot, RepositoryStatistics } from '../models/RepositorySnapshot';
import { DocumentSnapshot } from '../models/DocumentSnapshot';
import { DocumentId, DirectoryId, SymbolId, ReferenceId } from '../models/EntityIds';

export interface IRepositoryQueryService {
  getDocument(id: DocumentId): Readonly<DocumentSnapshot> | undefined;
  getChildren(id: DirectoryId): ReadonlyArray<DocumentId | DirectoryId>;
  getImports(id: DocumentId): ReadonlyArray<DocumentId>;
  getDependents(id: DocumentId): ReadonlyArray<DocumentId>;
  getReferences(id: SymbolId): ReadonlyArray<ReferenceId>;
  search(query: string, options?: any): Promise<any[]>;
  statistics(): Readonly<RepositoryStatistics>;
}

export interface IRepositoryModel extends IRepositoryQueryService {
  getSnapshot(): RepositorySnapshot;
}
