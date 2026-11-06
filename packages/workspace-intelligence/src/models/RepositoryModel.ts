import { IRepositoryModel } from '../interfaces/IRepositoryModel';
import { DocumentId, DirectoryId, SymbolId, ReferenceId } from './EntityIds';
import { DocumentSnapshot } from './DocumentSnapshot';
import { RepositorySnapshot, RepositoryStatistics } from './RepositorySnapshot';
import {
  FileGraph,
  DirectoryGraph,
  ImportGraph,
  DependencyGraph,
  SymbolGraph,
  ReferenceGraph,
} from '../graphs/GraphSkeletons';

export class RepositoryModel implements IRepositoryModel {
  // Underlying graphs
  private readonly fileGraph: FileGraph;
  private readonly directoryGraph: DirectoryGraph;
  private readonly importGraph: ImportGraph;
  private readonly dependencyGraph: DependencyGraph;
  private readonly symbolGraph: SymbolGraph;
  private readonly referenceGraph: ReferenceGraph;

  private readonly snapshot: RepositorySnapshot;

  constructor(
    fileGraph: FileGraph,
    directoryGraph: DirectoryGraph,
    importGraph: ImportGraph,
    dependencyGraph: DependencyGraph,
    symbolGraph: SymbolGraph,
    referenceGraph: ReferenceGraph,
    snapshot: RepositorySnapshot
  ) {
    this.fileGraph = fileGraph;
    this.directoryGraph = directoryGraph;
    this.importGraph = importGraph;
    this.dependencyGraph = dependencyGraph;
    this.symbolGraph = symbolGraph;
    this.referenceGraph = referenceGraph;
    this.snapshot = snapshot;
  }

  getDocument(id: DocumentId): Readonly<DocumentSnapshot> | undefined {
    return this.fileGraph.getNode(id);
  }

  getChildren(id: DirectoryId): ReadonlyArray<DocumentId | DirectoryId> {
    const edges = this.directoryGraph.getOutgoingEdges(id);
    return edges.map((e) => e.targetId as DocumentId | DirectoryId);
  }

  getImports(id: DocumentId): ReadonlyArray<DocumentId> {
    const edges = this.importGraph.getOutgoingEdges(id);
    return edges.map((e) => e.targetId as DocumentId);
  }

  getDependents(id: DocumentId): ReadonlyArray<DocumentId> {
    const edges = this.importGraph.getIncomingEdges(id);
    return edges.map((e) => e.sourceId as DocumentId);
  }

  getReferences(id: SymbolId): ReadonlyArray<ReferenceId> {
    const edges = this.referenceGraph.getIncomingEdges(id as any);
    return edges.map((e) => e.sourceId as ReferenceId);
  }

  async search(query: string, options?: any): Promise<any[]> {
    // Skeleton implementation
    return [];
  }

  statistics(): Readonly<RepositoryStatistics> {
    return this.snapshot.statistics;
  }

  getSnapshot(): RepositorySnapshot {
    return this.snapshot;
  }
}
