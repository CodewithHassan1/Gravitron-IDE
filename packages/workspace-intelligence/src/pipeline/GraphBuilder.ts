import { ParsedDocument } from '../interfaces/IParser';
import { DocumentSnapshot } from '../models/DocumentSnapshot';
import { GraphPatchCollection } from '../models/GraphPatchCollection';

export interface GraphBuilder {
  /**
   * Compares the old document state (if any) against the new parsed representation
   * to emit a comprehensive collection of graph patches.
   *
   * The GraphBuilder NEVER mutates graphs directly.
   */
  buildPatches(newDocument: ParsedDocument, oldDocument?: DocumentSnapshot): GraphPatchCollection;
}
