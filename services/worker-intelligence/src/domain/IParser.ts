import { SymbolDTO, ReferenceDTO, ImportDTO } from './IndexDTOs';

export interface ParsedDocument {
  symbols: Omit<SymbolDTO, 'id' | 'workspaceId' | 'fileId'>[];
  references: Omit<ReferenceDTO, 'id' | 'workspaceId' | 'fileId'>[];
  imports: Omit<ImportDTO, 'id' | 'workspaceId' | 'fileId'>[];
  diagnostics?: { message: string, line: number, column: number }[];
}

export interface IParser {
  /**
   * Parse a single file and extract its semantic/syntactic meaning.
   *
   * @param workspaceRoot - The absolute path to the workspace root for security/boundary checks
   * @param filePath - The relative path of the file being parsed
   * @param content - The file content
   */
  parse(workspaceRoot: string, filePath: string, content: string): ParsedDocument;
}
