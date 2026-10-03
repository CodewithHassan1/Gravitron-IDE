import { DocumentSnapshot } from '../models/DocumentSnapshot';

export interface ParsedDocument {
  readonly uri: string;
  readonly language: string;
  readonly symbols: readonly any[]; // Will be strongly typed later
  readonly imports: readonly any[];
  readonly exports: readonly any[];
  readonly syntaxTree?: any; // IR
}

export interface ParserCapabilities {
  readonly language: string;
  readonly priority: number;
  readonly supportsIncremental: boolean;
  readonly supportsSemantic: boolean;
  readonly supportedExtensions: string[];
  readonly supportedMimeTypes: string[];
  readonly version: string;
}

export interface IParser extends ParserCapabilities {
  /**
   * Parses the given document into a ParsedDocument IR
   */
  parse(document: DocumentSnapshot, content: string | Uint8Array): Promise<ParsedDocument>;
}
