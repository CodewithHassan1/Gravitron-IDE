export interface TextSearchResult {
  path: string;
  line: number;
  column: number;
  match: string;
  preview: string;
}

export interface WorkspaceSearchRequest {
  workspaceId: string;
  query: string;
  options?: {
    isRegex?: boolean;
    isCaseSensitive?: boolean;
    isWordMatch?: boolean;
    maxResults?: number;
    maxFileSize?: number; // bytes
  };
}
