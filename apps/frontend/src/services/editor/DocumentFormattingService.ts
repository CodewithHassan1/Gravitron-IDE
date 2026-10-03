import { EditorManager } from './EditorManager';
import { CommandExecutionContext } from '../../lib/registries/CommandRegistry';

class DocumentFormattingServiceImpl {
  async formatDocument(context: CommandExecutionContext) {
    const editor = EditorManager.getActiveEditor();
    if (editor) {
      editor.trigger('keyboard', 'editor.action.formatDocument', null);
    }
  }

  async formatSelection(context: CommandExecutionContext) {
    const editor = EditorManager.getActiveEditor();
    if (editor) {
      editor.trigger('keyboard', 'editor.action.formatSelection', null);
    }
  }
}

export const DocumentFormattingService = new DocumentFormattingServiceImpl();
