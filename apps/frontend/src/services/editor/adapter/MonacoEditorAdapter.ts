import { EditorAdapter, DocumentSymbol, Position } from './EditorAdapter';
import { EditorManager } from '../EditorManager';
import { EditorServiceRegistry } from '../EditorServiceRegistry';

export class MonacoEditorAdapter implements EditorAdapter {
  async getDocumentSymbols(uri: string): Promise<DocumentSymbol[]> {
    const monaco = EditorServiceRegistry.monacoService.getMonaco();
    const model = monaco.editor.getModel(monaco.Uri.parse(uri));
    if (!model) return [];

    try {
      // 1. Get the language features service
      // @ts-expect-error - Internal Monaco API
      const StandaloneServices = (
        await import('monaco-editor/esm/vs/editor/standalone/browser/standaloneServices.js')
      ).StandaloneServices;
      // @ts-expect-error - Internal Monaco API
      const ILanguageFeaturesService = (
        await import('monaco-editor/esm/vs/editor/common/services/languageFeatures.js')
      ).ILanguageFeaturesService;
      // @ts-expect-error - Internal Monaco API
      const OutlineModel = (
        await import('monaco-editor/esm/vs/editor/contrib/documentSymbols/browser/outlineModel.js')
      ).OutlineModel;
      // @ts-expect-error - Internal Monaco API
      const CancellationToken = (await import('monaco-editor/esm/vs/base/common/cancellation.js'))
        .CancellationToken;

      const { documentSymbolProvider } = StandaloneServices.get(ILanguageFeaturesService);

      const outline = await OutlineModel.create(
        documentSymbolProvider,
        model,
        CancellationToken.None
      );
      return outline.asListOfDocumentSymbols() as DocumentSymbol[];
    } catch (e) {
      console.error('Failed to get document symbols', e);
      return [];
    }
  }

  revealSymbol(uri: string, symbol: DocumentSymbol): void {
    const activeEditor = EditorManager.getActiveEditor();
    if (!activeEditor) return;

    const currentModel = activeEditor.getModel();
    if (!currentModel || currentModel.uri.toString() !== uri) return;

    activeEditor.revealPositionInCenter({
      lineNumber: symbol.range.startLineNumber,
      column: symbol.range.startColumn,
    });

    activeEditor.setSelection({
      startLineNumber: symbol.selectionRange.startLineNumber,
      startColumn: symbol.selectionRange.startColumn,
      endLineNumber: symbol.selectionRange.endLineNumber,
      endColumn: symbol.selectionRange.endColumn,
    });

    activeEditor.focus();
  }

  getCurrentCursor(): { uri: string; position: Position } | null {
    const activeEditor = EditorManager.getActiveEditor();
    if (!activeEditor) return null;

    const position = activeEditor.getPosition();
    const model = activeEditor.getModel();

    if (!position || !model) return null;

    return {
      uri: model.uri.toString(),
      position: {
        lineNumber: position.lineNumber,
        column: position.column,
      },
    };
  }

  getActiveEditorUri(): string | null {
    const activeEditor = EditorManager.getActiveEditor();
    if (!activeEditor) return null;

    const model = activeEditor.getModel();
    if (!model) return null;

    return model.uri.toString();
  }
}
