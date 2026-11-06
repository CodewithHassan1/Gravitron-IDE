import { DocumentId, SymbolId, ReferenceId } from '../models/EntityIds';
import { SearchQuery } from './ISearchProvider';

/**
 * A Language Service answers semantic questions about documents and symbols,
 * bridging the gap between raw AST graphs and IDE features (autocomplete, hover, definitions).
 *
 * Parsers DO NOT implement this interface. Parsers only extract syntax.
 * Language Services consume the RepositoryModel and semantic tools to answer queries.
 */
export interface ILanguageService {
  /**
   * Identifies the language this service handles (e.g. 'typescript', 'python')
   */
  readonly language: string;

  /**
   * Retrieves hover information (documentation, signature) for a given symbol
   */
  getHoverContent(
    documentId: DocumentId,
    line: number,
    character: number
  ): Promise<any | undefined>;

  /**
   * Finds the definition(s) for a symbol at a given position
   */
  getDefinition(documentId: DocumentId, line: number, character: number): Promise<SymbolId[]>;

  /**
   * Finds all references to a symbol at a given position
   */
  getReferences(documentId: DocumentId, line: number, character: number): Promise<ReferenceId[]>;

  /**
   * Finds workspace symbols matching a query within this language's context
   */
  getWorkspaceSymbols(query: SearchQuery): Promise<SymbolId[]>;
}
