import { useEditorStore } from '../../../stores/ide/editorStore';
import { EditorServiceRegistry } from '../../../services/editor/EditorServiceRegistry';
import { DecorationManager } from '../../../services/editor/DecorationManager';

export class MinimapController {
  static updateMinimapOptions(editorInstance: any) {
    if (!editorInstance) return;
    const config = useEditorStore.getState().config;
    editorInstance.updateOptions({
      minimap: { enabled: config.minimap }
    });
  }

  static addHighlight(editorInstance: any, startLine: number, endLine: number, colorClass: string) {
    if (!editorInstance) return;
    const monaco = EditorServiceRegistry.monacoService.getMonaco();
    DecorationManager.setDecorations(editorInstance, 'minimap', [
      {
        range: new monaco.Range(startLine, 1, endLine, 1),
        options: {
          minimap: {
            color: colorClass,
            position: 1 // monaco.editor.MinimapPosition.Inline
          }
        }
      }
    ]);
  }
}
