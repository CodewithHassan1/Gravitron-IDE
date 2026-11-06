import { QueryEngine, RankedResult } from '../search/QueryEngine';
import { useEditorLayoutStore } from '../../stores/ide/editorLayoutStore';
import { CommandRegistry } from '../../lib/registries/CommandRegistry';
import { systemEventBus, SystemEvents } from '../../lib/events/SystemEvents';
import { WorkspaceManager } from '../workspace/WorkspaceManager';
import { EditorManager } from '../editor/EditorManager';
import { TextSearchResult } from '@ag/protocol';

export class NavigationEngineImpl {
  search(query: string): RankedResult[] {
    return QueryEngine.search(query);
  }

  async searchText(query: string, options?: any): Promise<TextSearchResult[]> {
    return WorkspaceManager.searchText(query, options);
  }

  findSymbol(query: string): RankedResult[] {
    return QueryEngine.search(query, ['symbol']);
  }

  findFile(query: string): RankedResult[] {
    return QueryEngine.search(query, ['file']);
  }

  openFile(path: string, preview: boolean = false) {
    useEditorLayoutStore.getState().openFile({
      path,
      title: path.split('/').pop() || 'Untitled',
      language: 'plaintext', // Could use LanguageRegistry
      dirty: false,
      pinned: !preview,
      isPreview: preview,
    });
    systemEventBus.emit(SystemEvents.FileOpened, { path });
  }

  executeCommand(commandId: string, ...args: any[]) {
    CommandRegistry.executeCommand(commandId, ...args);
  }

  revealLine(path: string, line: number, column?: number) {
    this.openFile(path);
    setTimeout(() => {
      const editor = EditorManager.getActiveEditor();
      if (editor) {
        editor.revealLineInCenter(line);
        editor.setPosition({ lineNumber: line, column: column || 1 });
        editor.focus();
      }
    }, 100); // give editor time to render after opening
  }
}

export const NavigationEngine = new NavigationEngineImpl();
