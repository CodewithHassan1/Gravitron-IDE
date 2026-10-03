import { ReadonlyGraph } from './BaseGraph';
import { DocumentId, DirectoryId, SymbolId, ReferenceId } from '../models/EntityIds';

export interface FileGraph extends ReadonlyGraph<DocumentId> {
  readonly name: 'FileGraph';
}

export interface DirectoryGraph extends ReadonlyGraph<DirectoryId> {
  readonly name: 'DirectoryGraph';
}

export interface ImportGraph extends ReadonlyGraph<DocumentId> {
  readonly name: 'ImportGraph';
}

export interface DependencyGraph extends ReadonlyGraph<DocumentId> {
  readonly name: 'DependencyGraph';
}

export interface SymbolGraph extends ReadonlyGraph<SymbolId> {
  readonly name: 'SymbolGraph';
}

export interface ReferenceGraph extends ReadonlyGraph<ReferenceId> {
  readonly name: 'ReferenceGraph';
}
