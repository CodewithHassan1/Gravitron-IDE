export enum SymbolKind {
  Class = 'Class',
  Interface = 'Interface',
  Function = 'Function',
  Method = 'Method',
  Variable = 'Variable',
  Constant = 'Constant',
  Enum = 'Enum',
  TypeAlias = 'TypeAlias',
  Property = 'Property',
}

export interface FileDTO {
  id: string; // Primary key, unique per workspace
  workspaceId: string;
  filePath: string; // Relative to workspace root
  hash: string; // Hash of file contents to check if changed
  updatedAt: number;
}

export interface SymbolDTO {
  id: string; // Unique identifier
  workspaceId: string;
  fileId: string; // Foreign key to FileDTO
  name: string;
  kind: SymbolKind;
  line: number;
  column: number;
  startOffset?: number;
  endOffset?: number;
  snippet?: string; // Optional brief snippet of the signature
}

export interface ReferenceDTO {
  id: string;
  workspaceId: string;
  fileId: string;
  symbolName: string;
  line: number;
  column: number;
  startOffset?: number;
  endOffset?: number;
}

export interface ImportDTO {
  id: string;
  workspaceId: string;
  fileId: string;
  sourceId?: string; // The file this imports, if resolvable locally
  moduleName: string; // e.g. '@ag/protocol' or './MyClass'
  symbolName?: string; // Optional specific symbol imported
  startOffset?: number;
  endOffset?: number;
}

export interface SnapshotDTO {
  workspaceId: string;
  sequence: number; // Monotonically increasing
  createdAt: number;
}

export interface EmbeddingDTO {
  id: string;
  workspaceId: string;
  fileId: string;
  chunkId: string;
  content: string;
  vector: number[];
  symbolName?: string;
}
