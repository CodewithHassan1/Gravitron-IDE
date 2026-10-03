import { EditorServiceRegistry } from './EditorServiceRegistry';
import { MonacoService } from './MonacoService';
import { ModelManager } from './ModelManager';
import { CursorManager } from './CursorManager';
import { DecorationManager } from './DecorationManager';
import { EditorHistory } from './EditorHistory';
import { EditorThemeManager } from './EditorThemeManager';
import { SessionManager } from './SessionManager';
import { DisposableRegistry } from './DisposableRegistry';
import { editorEventBus, EditorEvents } from '../../lib/editor/EditorEvents';
import { WorkerManager } from './WorkerManager';
import { ProviderRegistry } from './ProviderRegistry';
import { EditorCommandRegistry } from './EditorCommandRegistry';
import { ViewStateManager } from './ViewStateManager';
import { EditorAdapter } from './adapter/EditorAdapter';
import { MonacoEditorAdapter } from './adapter/MonacoEditorAdapter';

export class EditorManagerImpl {
  private syncContexts(editor: any) {
    import('../quickInput/ContextEngine').then(({ ContextEngine }) => {
      const selections = editor.getSelections() || [];
      const hasSelection = selections.some((s: any) => !s.isEmpty());
      const isReadOnly = editor.getOptions().get(104); // readOnly is 104 in current monaco enum (was 76)
      ContextEngine.setContext('editorHasSelection', hasSelection);
      ContextEngine.setContext('multipleSelections', selections.length > 1);
      ContextEngine.setContext('selectionEmpty', !hasSelection);
      ContextEngine.setContext('selectionCount', selections.length);
      ContextEngine.setContext('editorReadOnly', isReadOnly);
      ContextEngine.setContext('editorWritable', !isReadOnly);
      
      const model = editor.getModel();
      if (model && typeof model.canUndo === 'function') {
        ContextEngine.setContext('canUndo', !isReadOnly && model.canUndo());
        ContextEngine.setContext('canRedo', !isReadOnly && model.canRedo());
      } else {
        ContextEngine.setContext('canUndo', false);
        ContextEngine.setContext('canRedo', false);
      }
      
      const formatAction = editor.getAction('editor.action.formatDocument');
      if (formatAction) {
        ContextEngine.setContext('formatterAvailable', formatAction.isSupported());
      }
      
      const blockCommentAction = editor.getAction('editor.action.blockComment');
      if (blockCommentAction) {
        ContextEngine.setContext('languageSupportsBlockComments', blockCommentAction.isSupported());
      }
    });
  }

  private initialized = false;
  private activeEditorInstance: any = null;
  private initPromise: Promise<void> | null = null;
  // Map of groupId -> editor instance to support one instance per group
  private groupEditors: Map<string, any> = new Map();
  public adapter: EditorAdapter;

  constructor() {
    this.adapter = new MonacoEditorAdapter();
  }

  async initialize() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const monacoService = new MonacoService();
      const sessionManager = new SessionManager();

      EditorServiceRegistry.initialize({
        monacoService,
        modelManager: ModelManager,
        cursorManager: CursorManager,
        decorationManager: DecorationManager,
        editorHistory: EditorHistory,
        themeManager: EditorThemeManager,
        sessionManager,
      });

      const monaco = await monacoService.loadMonaco();
      
      WorkerManager.initialize(monaco);
      ModelManager.setMonaco(monaco);
      ProviderRegistry.setMonaco(monaco);
      EditorCommandRegistry.setMonaco(monaco);
      DecorationManager.setMonaco(monaco);
      EditorThemeManager.setMonaco(monaco);

      sessionManager.initializeSession();
      this.initialized = true;
    })();

    return this.initPromise;
  }

  /**
   * Retrieves or creates a singleton editor instance for a specific editor group.
   * This ensures we never destroy and recreate editors unnecessarily.
   */
  getOrCreateEditor(groupId: string, container: HTMLElement, options: any) {
    if (!this.initialized) throw new Error("EditorManager not initialized");
    const monaco = EditorServiceRegistry.monacoService.getMonaco();
    
    let editor = this.groupEditors.get(groupId);
    
    if (!editor) {
      editor = monaco.editor.create(container, options);
      DisposableRegistry.register(`editorManager-${groupId}`, editor);
      this.groupEditors.set(groupId, editor);

      editor.onDidFocusEditorWidget(() => {
        this.activeEditorInstance = editor;
        editorEventBus.emit(EditorEvents.EditorFocused, { editorId: editor.getId(), groupId });
        this.syncContexts(editor);
        import('../quickInput/ContextEngine').then(({ ContextEngine }) => {
          ContextEngine.setContext('activeEditorExists', true);
          ContextEngine.setContext('editorIsOpen', true);
          ContextEngine.setContext('editorFocused', true);
          ContextEngine.setContext('explorerFocused', false);
          ContextEngine.setContext('terminalFocused', false);
        });
      });

      editor.onDidBlurEditorWidget(() => {
        import('../quickInput/ContextEngine').then(({ ContextEngine }) => {
          ContextEngine.setContext('editorFocused', false);
        });
      });

      editor.onDidChangeCursorSelection((e: any) => {
        editorEventBus.emit(EditorEvents.CursorChanged, { editorId: editor.getId(), groupId, position: e.selection.getStartPosition() });
        this.syncContexts(editor);
      });
      
      editor.onDidChangeModelContent((e: any) => {
        editorEventBus.emit(EditorEvents.ModelChanged, { editorId: editor.getId(), groupId });
        this.syncContexts(editor);
      });
      
      editor.onDidChangeModelLanguage(() => {
        this.syncContexts(editor);
      });
      
      editor.onDidChangeConfiguration(() => {
        this.syncContexts(editor);
      });

    } else {
      // If editor already exists for this group, we just need to ensure it's mounted to the provided container
      // However, usually we don't move the container for the same group. 
      // If the container changed, we might need to call editor.layout() or append the editor's DOM node.
      const editorDomNode = editor.getDomNode();
      if (editorDomNode && container !== editorDomNode.parentElement) {
        container.appendChild(editorDomNode);
        editor.layout();
      }
      editor.updateOptions(options);
    }

    return editor;
  }

  getActiveEditor() {
    return this.activeEditorInstance;
  }
  
  getEditorByGroup(groupId: string) {
    return this.groupEditors.get(groupId);
  }

  disposeEditorGroup(groupId: string) {
    const editor = this.groupEditors.get(groupId);
    if (editor) {
      if (this.activeEditorInstance === editor) {
        this.activeEditorInstance = null;
      }
      // Save view state before disposing if needed
      const model = editor.getModel();
      if (model) {
        ViewStateManager.saveViewState(model.uri.toString(), editor);
      }
      
      DisposableRegistry.unregister(`editorManager-${groupId}`, editor);
      editor.dispose();
      this.groupEditors.delete(groupId);
    }
  }
  
  dispose() {
    this.groupEditors.forEach((editor, groupId) => {
      this.disposeEditorGroup(groupId);
    });
    this.initialized = false;
  }
}

export const EditorManager = new EditorManagerImpl();
