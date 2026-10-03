export interface DocumentSymbol {
  name: string;
  detail: string;
  kind: number;
  tags: ReadonlyArray<number>;
  containerName?: string;
  range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  selectionRange: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  children?: DocumentSymbol[];
}

export interface Position {
  lineNumber: number;
  column: number;
}

export interface EditorAdapter {
  /**
   * Returns the document symbols for a given URI.
   */
  getDocumentSymbols(uri: string): Promise<DocumentSymbol[]>;

  /**
   * Reveals a specific symbol in the editor.
   */
  revealSymbol(uri: string, symbol: DocumentSymbol): void;

  /**
   * Returns the current cursor position for the active editor.
   */
  getCurrentCursor(): { uri: string; position: Position } | null;

  /**
   * Returns the active editor's URI, if any.
   */
  getActiveEditorUri(): string | null;
}
