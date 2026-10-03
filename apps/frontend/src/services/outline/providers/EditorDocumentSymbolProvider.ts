import { OutlineProvider } from '../types';
import { EditorManager } from '../../editor/EditorManager';
import { DocumentSymbol } from '../../editor/adapter/EditorAdapter';

export class EditorDocumentSymbolProvider implements OutlineProvider {
  canHandle(uri: string, languageId: string): boolean {
    // We can handle anything that the editor can provide symbols for.
    return true;
  }

  async getSymbols(uri: string): Promise<DocumentSymbol[]> {
    return await EditorManager.adapter.getDocumentSymbols(uri);
  }
}
