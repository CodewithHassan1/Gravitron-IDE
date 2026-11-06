import { editorEventBus, EditorEvents } from '../../lib/editor/EditorEvents';
import { EditorManager } from '../editor/EditorManager';
import { useOutlineStore } from '../../stores/ide/outlineStore';
import { OutlineProviderRegistry } from './OutlineProviderRegistry';
import { DocumentSymbol, Position } from '../editor/adapter/EditorAdapter';

class OutlineServiceImpl {
  private rebuildTimeout: any = null;
  private cursorTimeout: any = null;
  private currentUri: string | null = null;

  public initialize() {
    editorEventBus.on(EditorEvents.EditorFocused, this.handleEditorChanged.bind(this));
    editorEventBus.on(EditorEvents.ModelChanged, this.handleModelChanged.bind(this));
    editorEventBus.on(EditorEvents.CursorChanged, this.handleCursorChanged.bind(this));
  }

  private handleEditorChanged() {
    const uri = EditorManager.adapter.getActiveEditorUri();
    if (uri !== this.currentUri) {
      this.currentUri = uri;
      this.rebuildOutline(uri);
    }
  }

  private handleModelChanged() {
    const uri = EditorManager.adapter.getActiveEditorUri();
    if (uri) {
      this.scheduleRebuild(uri);
    }
  }

  private handleCursorChanged(event: any) {
    if (this.cursorTimeout) {
      clearTimeout(this.cursorTimeout);
    }
    this.cursorTimeout = setTimeout(() => {
      this.updateActiveSymbol(event.position);
    }, 50);
  }

  private scheduleRebuild(uri: string) {
    if (this.rebuildTimeout) {
      clearTimeout(this.rebuildTimeout);
    }
    this.rebuildTimeout = setTimeout(() => {
      this.rebuildOutline(uri);
    }, 500);
  }

  private async rebuildOutline(uri: string | null) {
    if (!uri) return;

    const activeEditor = EditorManager.getActiveEditor();
    if (!activeEditor) return;

    const model = activeEditor.getModel();
    if (!model || model.uri.toString() !== uri) return;

    const versionId = model.getVersionId();
    const languageId = model.getLanguageId();

    const store = useOutlineStore.getState();
    const cached = store.cache.get(uri);

    // Check if cache is still valid
    if (cached && cached.versionId === versionId) {
      return;
    }

    const provider = OutlineProviderRegistry.getProviderFor(uri, languageId);
    if (!provider) return;

    try {
      const symbols = await provider.getSymbols(uri);

      useOutlineStore.getState().setCache(uri, {
        uri,
        versionId,
        symbols,
        expandedState: cached ? cached.expandedState : new Set(),
        selectedSymbol: cached ? cached.selectedSymbol : null,
      });

      // Update cursor position immediately after rebuild
      const cursor = EditorManager.adapter.getCurrentCursor();
      if (cursor && cursor.uri === uri) {
        this.updateActiveSymbol(cursor.position);
      }
    } catch (err) {
      console.error('Failed to rebuild outline', err);
    }
  }

  private updateActiveSymbol(position: Position) {
    const uri = EditorManager.adapter.getActiveEditorUri();
    if (!uri) return;

    const store = useOutlineStore.getState();
    if (!store.followCursor) return;

    const cached = store.cache.get(uri);
    if (!cached) return;

    const activeSymbol = this.findDeepestSymbolAtPosition(cached.symbols, position);
    const symbolId = activeSymbol ? this.getSymbolId(activeSymbol) : null;

    store.setSelectedSymbol(uri, symbolId);
  }

  private findDeepestSymbolAtPosition(
    symbols: DocumentSymbol[],
    position: Position
  ): DocumentSymbol | null {
    let bestMatch: DocumentSymbol | null = null;

    for (const symbol of symbols) {
      const range = symbol.range;
      // Note: position is 1-indexed.
      if (
        position.lineNumber > range.startLineNumber &&
        position.lineNumber < range.endLineNumber
      ) {
        // Inside strictly
        bestMatch = symbol;
      } else if (
        position.lineNumber === range.startLineNumber &&
        position.lineNumber === range.endLineNumber
      ) {
        if (position.column >= range.startColumn && position.column <= range.endColumn) {
          bestMatch = symbol;
        }
      } else if (
        position.lineNumber === range.startLineNumber &&
        position.column >= range.startColumn
      ) {
        bestMatch = symbol;
      } else if (
        position.lineNumber === range.endLineNumber &&
        position.column <= range.endColumn
      ) {
        bestMatch = symbol;
      }

      if (bestMatch === symbol && symbol.children && symbol.children.length > 0) {
        const childMatch = this.findDeepestSymbolAtPosition(symbol.children, position);
        if (childMatch) {
          bestMatch = childMatch;
        }
      }
    }

    return bestMatch;
  }

  public getSymbolId(symbol: DocumentSymbol): string {
    // Generate a stable ID for the symbol
    return `${symbol.name}:${symbol.range.startLineNumber}:${symbol.range.startColumn}`;
  }
}

export const OutlineService = new OutlineServiceImpl();
