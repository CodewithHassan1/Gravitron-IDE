import { EditorManager } from '../editor/EditorManager';
import { DocumentSymbol } from '../editor/adapter/EditorAdapter';
import { OutlineService } from './OutlineService';

class SymbolNavigatorImpl {
  public jumpToSymbol(uri: string, symbol: DocumentSymbol) {
    EditorManager.adapter.revealSymbol(uri, symbol);
  }
}

export const SymbolNavigator = new SymbolNavigatorImpl();
