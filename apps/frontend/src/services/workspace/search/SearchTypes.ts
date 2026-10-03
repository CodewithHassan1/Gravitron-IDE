// src/services/workspace/search/SearchTypes.ts

export interface SearchResult {
  nodeId: string;
  path: string;
  name: string;
  type: 'file' | 'folder';
  score: number;
}

export interface ContentSearchProvider {
  searchContent(query: string, workspace: string): Promise<SearchResult[]>;
}

export class LocalContentSearchProvider implements ContentSearchProvider {
  async searchContent(query: string, workspace: string): Promise<SearchResult[]> {
    throw new Error('LocalContentSearchProvider not yet implemented. Requires ripgrep or similar.');
  }
}

// Worker message interfaces

export type WorkerCommandType = 'INDEX_NODE' | 'REMOVE_NODE' | 'SEARCH' | 'CLEAR';

export interface WorkerMessage<T = any> {
  id: string;
  type: WorkerCommandType;
  payload?: T;
}

export type WorkerResponseType = 'SEARCH_RESULTS' | 'INDEX_COMPLETE' | 'ERROR';

export interface WorkerResponse<T = any> {
  id: string;
  type: WorkerResponseType;
  payload?: T;
  error?: string;
}

export interface IndexNodePayload {
  nodeId: string;
  path: string;
  name: string;
  type: 'file' | 'folder' | 'directory';
  extension?: string;
}

export interface SearchPayload {
  query: string;
  fileTypes?: string[];
  includeHidden?: boolean;
  maxResults?: number;
}
