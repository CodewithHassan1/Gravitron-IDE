export interface QueryResult<T> {
  workspaceId: string;
  snapshotSequence: number;
  results: T[];
}

export interface ProviderOptions {
  limit?: number;
}

export interface DefinitionResult {
  symbolName: string;
  kind: string;
  filePath: string;
  line: number;
  column: number;
  startOffset?: number;
  endOffset?: number;
  snippet?: string;
}

export interface ReferenceResult {
  symbolName: string;
  filePath: string;
  line: number;
  column: number;
  startOffset?: number;
  endOffset?: number;
}

export interface ISearchProvider {
  findDefinition(
    workspaceId: string,
    symbolName: string,
    options?: ProviderOptions
  ): Promise<QueryResult<DefinitionResult>>;
  findReferences(
    workspaceId: string,
    symbolName: string,
    options?: ProviderOptions
  ): Promise<QueryResult<ReferenceResult>>;
  searchSymbols(
    workspaceId: string,
    query: string,
    options?: ProviderOptions
  ): Promise<QueryResult<DefinitionResult>>;
}
