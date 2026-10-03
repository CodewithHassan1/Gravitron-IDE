export interface SearchCapabilities {
  readonly supportsRegex: boolean;
  readonly supportsFuzzy: boolean;
  readonly supportsSemantic: boolean;
  readonly supportsRanking: boolean;
}

export interface SearchQuery {
  readonly text: string;
  readonly maxResults?: number;
  readonly options?: Record<string, any>;
}

export interface ISearchProvider {
  /**
   * The name or identifier for this search provider (e.g. 'FileSearch', 'SemanticSearch')
   */
  readonly name: string;

  /**
   * Capabilities supported by this provider
   */
  readonly capabilities: SearchCapabilities;

  /**
   * Executes a search query and returns an array of result objects
   */
  search(query: SearchQuery): Promise<any[]>;
}
