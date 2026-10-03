import { DocumentSymbol } from '../editor/adapter/EditorAdapter';

export interface OutlineProvider {
  /**
   * Returns true if this provider can handle the given URI and language.
   */
  canHandle(uri: string, languageId: string): boolean;

  /**
   * Retrieves the symbol tree for the given URI.
   */
  getSymbols(uri: string): Promise<DocumentSymbol[]>;
}

export interface CachedOutline {
  uri: string;
  versionId: number;
  symbols: DocumentSymbol[];
  expandedState: Set<string>;
  selectedSymbol: string | null;
}
