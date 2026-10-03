import { DocumentSnapshot } from '../models/DocumentSnapshot';
import { ParsedDocument } from '../interfaces/IParser';

export interface ParserPipeline {
  /**
   * Pushes a document through the parser stage.
   * Returns the parsed representation or undefined if no suitable parser was found.
   */
  process(document: DocumentSnapshot, content: string | Uint8Array): Promise<ParsedDocument | undefined>;
}
