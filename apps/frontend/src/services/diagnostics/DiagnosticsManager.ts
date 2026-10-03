import { useDiagnosticsStore, Diagnostic } from '../../stores/ide/diagnosticsStore';
import { EditorServiceRegistry } from '../editor/EditorServiceRegistry';
import { EditorManager } from '../editor/EditorManager';
import { WorkspaceManager } from '../workspace/WorkspaceManager';
import { WorkspaceEventType } from '../workspace/types';

export class DiagnosticsManagerImpl {
  public initialize() {
    // Clear diagnostics when file is deleted
    WorkspaceManager.onEvent(WorkspaceEventType.FileDeleted, (event: any) => {
      const path = event.payload?.path;
      if (path) {
        this.clearDiagnostics(path);
      }
    });

    // We subscribe to diagnostics store to update monaco markers
    useDiagnosticsStore.subscribe((state) => {
      this.syncMonacoMarkers(state.diagnostics);
    });
  }

  public publishDiagnostics(uri: string, diagnostics: Diagnostic[]) {
    useDiagnosticsStore.getState().publishDiagnostics(uri, diagnostics);
  }

  public clearDiagnostics(uri?: string) {
    useDiagnosticsStore.getState().clearDiagnostics(uri);
  }

  private syncMonacoMarkers(diagnostics: Diagnostic[]) {
    const monaco = EditorServiceRegistry.monacoService?.getMonaco();
    if (!monaco) return;

    // Group diagnostics by URI
    const grouped = new Map<string, Diagnostic[]>();
    for (const d of diagnostics) {
      if (!grouped.has(d.uri)) grouped.set(d.uri, []);
      grouped.get(d.uri)!.push(d);
    }

    // For all active models, update their markers
    const editorInstance = EditorManager.getActiveEditor();
    if (editorInstance) {
      const model = editorInstance.getModel();
      if (model) {
        const fileUri = model.uri.path;
        const fileDiagnostics = grouped.get(fileUri) || [];
        
        const markers = fileDiagnostics.map(d => ({
          severity: this.mapSeverity(monaco, d.severity),
          message: d.message,
          startLineNumber: d.line,
          startColumn: d.column,
          endLineNumber: d.endLine || d.line,
          endColumn: d.endColumn || d.column + 1,
          source: d.source,
          code: d.code ? String(d.code) : undefined
        }));

        monaco.editor.setModelMarkers(model, 'ide-diagnostics', markers);
      }
    }
  }

  private mapSeverity(monaco: any, severity: string) {
    switch (severity) {
      case 'error': return monaco.MarkerSeverity.Error;
      case 'warning': return monaco.MarkerSeverity.Warning;
      case 'info': return monaco.MarkerSeverity.Info;
      default: return monaco.MarkerSeverity.Hint;
    }
  }
}

export const DiagnosticsManager = new DiagnosticsManagerImpl();
