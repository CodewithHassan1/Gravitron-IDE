import { EditorManager } from './EditorManager';
import { CommandExecutionContext } from '../../lib/registries/CommandRegistry';
import { DocumentFormattingService } from './DocumentFormattingService';

class EditorCommandServiceImpl {
  
  async undo(context: CommandExecutionContext) {
    EditorManager.getActiveEditor()?.trigger('keyboard', 'undo', null);
  }

  async redo(context: CommandExecutionContext) {
    EditorManager.getActiveEditor()?.trigger('keyboard', 'redo', null);
  }

  async cut(context: CommandExecutionContext) {
    EditorManager.getActiveEditor()?.trigger('keyboard', 'editor.action.clipboardCutAction', null);
  }

  async copy(context: CommandExecutionContext) {
    EditorManager.getActiveEditor()?.trigger('keyboard', 'editor.action.clipboardCopyAction', null);
  }

  async paste(context: CommandExecutionContext) {
    EditorManager.getActiveEditor()?.trigger('keyboard', 'editor.action.clipboardPasteAction', null);
  }

  async delete(context: CommandExecutionContext) {
    const editor = EditorManager.getActiveEditor();
    if (!editor) return;
    
    if (context.selectionEmpty) {
      editor.trigger('keyboard', 'deleteRight', null);
    } else {
      editor.trigger('keyboard', 'deleteLeft', null); // deletes the selection
    }
  }

  async selectAll(context: CommandExecutionContext) {
    EditorManager.getActiveEditor()?.trigger('keyboard', 'editor.action.selectAll', null);
  }

  async find(context: CommandExecutionContext) {
    EditorManager.getActiveEditor()?.trigger('keyboard', 'actions.find', null);
  }

  async replace(context: CommandExecutionContext) {
    EditorManager.getActiveEditor()?.trigger('keyboard', 'editor.action.startFindReplaceAction', null);
  }

  async toggleLineComment(context: CommandExecutionContext) {
    EditorManager.getActiveEditor()?.trigger('keyboard', 'editor.action.commentLine', null);
  }

  async toggleBlockComment(context: CommandExecutionContext) {
    EditorManager.getActiveEditor()?.trigger('keyboard', 'editor.action.blockComment', null);
  }

  async formatDocument(context: CommandExecutionContext) {
    await DocumentFormattingService.formatDocument(context);
  }
  
  async formatSelection(context: CommandExecutionContext) {
    await DocumentFormattingService.formatSelection(context);
  }

  async triggerAction(context: CommandExecutionContext, actionId: string) {
    EditorManager.getActiveEditor()?.trigger('keyboard', actionId, null);
  }
  
  async goDefinition(context: CommandExecutionContext) {
    EditorManager.getActiveEditor()?.trigger('keyboard', 'editor.action.revealDefinition', null);
  }
  
  async goReferences(context: CommandExecutionContext) {
    EditorManager.getActiveEditor()?.trigger('keyboard', 'editor.action.referenceSearch.trigger', null);
  }
}

export const EditorCommandService = new EditorCommandServiceImpl();
