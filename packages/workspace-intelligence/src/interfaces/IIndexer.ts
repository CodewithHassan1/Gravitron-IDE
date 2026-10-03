import { DocumentSnapshot } from '../models/DocumentSnapshot';

export interface IIndexer {
  /**
   * Initializes the indexer
   */
  initialize(): Promise<void>;

  /**
   * Disposes of the indexer resources
   */
  dispose(): Promise<void>;

  /**
   * Requests indexing for a specific document
   */
  indexDocument(document: DocumentSnapshot): Promise<void>;
}
