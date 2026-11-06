import { GlobalGitEvents, GitEventType } from '../../lib/scm/GitEvents';
import { EditorServiceRegistry } from '../editor/EditorServiceRegistry';
import { DecorationManager } from '../editor/DecorationManager';
import { EditorManager } from '../editor/EditorManager';
import { GitDiffEngine } from '../../lib/scm/GitDiffEngine';

export class MonacoGitDecorator {
  public initialize() {
    GlobalGitEvents.on(GitEventType.DiffUpdated, (event) => {
      if (!event.payload || !event.payload.diffText || !event.payload.path) return;

      const decorations = GitDiffEngine.parseDecorations(event.payload.diffText);
      const monaco = EditorServiceRegistry.monacoService?.getMonaco();
      if (!monaco) return;

      const editorDecorations = decorations.map((d) => ({
        range: new monaco.Range(d.line, 1, d.line, 1),
        options: {
          isWholeLine: true,
          linesDecorationsClassName: `git-gutter-${d.type}`, // added, deleted, modified
        },
      }));

      // Find all editor instances displaying this model and apply decorations
      // In our single instance architecture per group, we can iterate active editors.
      const editorInstance = EditorManager.getActiveEditor();
      if (editorInstance) {
        const model = editorInstance.getModel();
        if (model && model.uri.path === event.payload.path) {
          DecorationManager.setDecorations(editorInstance, 'git', editorDecorations);
        }
      }
    });
  }
}

export const GitDecorator = new MonacoGitDecorator();
