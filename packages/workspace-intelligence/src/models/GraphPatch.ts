import { GraphNodeId, DocumentId, DirectoryId, SymbolId, ReferenceId } from './EntityIds';

export type PatchOperationType = 'AddNode' | 'RemoveNode' | 'UpdateNode' | 'AddEdge' | 'RemoveEdge';

// We define strongly-typed operations per graph

export type FileGraphPatch =
  | { op: 'AddNode'; nodeId: DocumentId; payload: any }
  | { op: 'RemoveNode'; nodeId: DocumentId }
  | { op: 'UpdateNode'; nodeId: DocumentId; payload: any }
  | { op: 'AddEdge'; sourceId: DocumentId; targetId: DocumentId; relationType: string }
  | { op: 'RemoveEdge'; sourceId: DocumentId; targetId: DocumentId; relationType: string };

export type DirectoryGraphPatch =
  | { op: 'AddNode'; nodeId: DirectoryId; payload: any }
  | { op: 'RemoveNode'; nodeId: DirectoryId }
  | { op: 'UpdateNode'; nodeId: DirectoryId; payload: any }
  | { op: 'AddEdge'; sourceId: DirectoryId; targetId: DirectoryId; relationType: string }
  | { op: 'RemoveEdge'; sourceId: DirectoryId; targetId: DirectoryId; relationType: string };

export type SymbolGraphPatch =
  | { op: 'AddNode'; nodeId: SymbolId; payload: any }
  | { op: 'RemoveNode'; nodeId: SymbolId }
  | { op: 'UpdateNode'; nodeId: SymbolId; payload: any }
  | { op: 'AddEdge'; sourceId: SymbolId; targetId: SymbolId; relationType: string }
  | { op: 'RemoveEdge'; sourceId: SymbolId; targetId: SymbolId; relationType: string };

export type ReferenceGraphPatch =
  | { op: 'AddNode'; nodeId: ReferenceId; payload: any }
  | { op: 'RemoveNode'; nodeId: ReferenceId }
  | { op: 'UpdateNode'; nodeId: ReferenceId; payload: any }
  | { op: 'AddEdge'; sourceId: ReferenceId; targetId: ReferenceId; relationType: string }
  | { op: 'RemoveEdge'; sourceId: ReferenceId; targetId: ReferenceId; relationType: string };

export type ImportGraphPatch =
  | { op: 'AddNode'; nodeId: DocumentId; payload: any }
  | { op: 'RemoveNode'; nodeId: DocumentId }
  | { op: 'UpdateNode'; nodeId: DocumentId; payload: any }
  | { op: 'AddEdge'; sourceId: DocumentId; targetId: DocumentId; relationType: string }
  | { op: 'RemoveEdge'; sourceId: DocumentId; targetId: DocumentId; relationType: string };

export type DependencyGraphPatch =
  | { op: 'AddNode'; nodeId: DocumentId; payload: any }
  | { op: 'RemoveNode'; nodeId: DocumentId }
  | { op: 'UpdateNode'; nodeId: DocumentId; payload: any }
  | { op: 'AddEdge'; sourceId: DocumentId; targetId: DocumentId; relationType: string }
  | { op: 'RemoveEdge'; sourceId: DocumentId; targetId: DocumentId; relationType: string };

// To unify, we can define a wrapped typed patch
export type GraphPatch =
  | { graphName: 'FileGraph'; patch: FileGraphPatch }
  | { graphName: 'DirectoryGraph'; patch: DirectoryGraphPatch }
  | { graphName: 'SymbolGraph'; patch: SymbolGraphPatch }
  | { graphName: 'ReferenceGraph'; patch: ReferenceGraphPatch }
  | { graphName: 'ImportGraph'; patch: ImportGraphPatch }
  | { graphName: 'DependencyGraph'; patch: DependencyGraphPatch };
