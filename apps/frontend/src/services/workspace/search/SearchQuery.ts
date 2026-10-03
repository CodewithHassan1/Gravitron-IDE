// src/services/workspace/search/SearchQuery.ts

export class SearchQuery {
  public readonly query: string;
  public readonly fileTypes?: string[];
  public readonly includeHidden?: boolean;
  public readonly maxResults?: number;

  constructor(
    query: string,
    options: {
      fileTypes?: string[];
      includeHidden?: boolean;
      maxResults?: number;
    } = {}
  ) {
    this.query = query;
    this.fileTypes = options.fileTypes;
    this.includeHidden = options.includeHidden ?? false;
    this.maxResults = options.maxResults ?? 100;
  }
}
