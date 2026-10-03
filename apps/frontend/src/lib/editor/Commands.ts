import { useEditorLayoutStore } from '../../stores/ide/editorLayoutStore';
import { EditorManager } from '../../services/editor/EditorManager';

export const EditorCommands = {
  SAVE: 'editor.save',
  SAVE_ALL: 'editor.saveAll',
  SPLIT_HORIZONTAL: 'editor.splitHorizontal',
  SPLIT_VERTICAL: 'editor.splitVertical',
  NEXT_TAB: 'editor.nextTab',
  PREV_TAB: 'editor.prevTab',
  CLOSE_TAB: 'editor.closeTab',
  FORMAT_DOCUMENT: 'editor.formatDocument',
  TOGGLE_WORD_WRAP: 'editor.toggleWordWrap',
  TOGGLE_MINIMAP: 'editor.toggleMinimap',
};

// In a real CommandRegistry implementation, we would register these commands globally
export function registerEditorCommands(registry: any) {
  registry.registerCommand(EditorCommands.SAVE, () => {
    const editor = EditorManager.getActiveEditor();
    if (editor) {
      editor.getAction('editor.action.formatDocument')?.run();
      
      // Save via new WorkspaceManager
      const model = editor.getModel();
      if (model) {
        const uri = model.uri.toString();
        // Extract the path from the URI
        const path = uri.replace('inmemory://', '');
        const content = model.getValue();
        import('../../services/workspace/WorkspaceManager').then(({ WorkspaceManager }) => {
          WorkspaceManager.writeFile(path, content);
          
          // Clear dirty state
          const state = useEditorLayoutStore.getState();
          if (state.activeGroupId) {
            const group = state.groups.find(g => g.id === state.activeGroupId);
            if (group && group.activeTabId) {
              state.updateTabDirtyState(group.id, group.activeTabId, false);
            }
          }
        });
      }
    }
  });

  registry.registerCommand(EditorCommands.SPLIT_VERTICAL, () => {
    const state = useEditorLayoutStore.getState();
    if (state.activeGroupId) {
      useEditorLayoutStore.getState().splitGroup(state.activeGroupId, 'vertical');
    }
  });

  registry.registerCommand(EditorCommands.FORMAT_DOCUMENT, () => {
    const editor = EditorManager.getActiveEditor();
    if (editor) {
      editor.getAction('editor.action.formatDocument')?.run();
    }
  });
}
