import { MonacoService } from './MonacoService';
import { ModelManager } from './ModelManager';
import { CursorManager } from './CursorManager';
import { DecorationManager } from './DecorationManager';
import { EditorHistory } from './EditorHistory';
import { EditorThemeManager } from './EditorThemeManager';
import { SessionManager } from './SessionManager';
import { LanguageRegistry } from '../../lib/editor/LanguageRegistry';

export class EditorServiceRegistryImpl {
  public monacoService!: any;
  public modelManager = ModelManager;
  public cursorManager = CursorManager;
  public decorationManager = DecorationManager;
  public editorHistory = EditorHistory;
  public themeManager = EditorThemeManager;
  public sessionManager!: any;
  public languageRegistry = LanguageRegistry;

  public initialize(services: {
    monacoService: any;
    modelManager: any;
    cursorManager: any;
    decorationManager: any;
    editorHistory: any;
    themeManager: any;
    sessionManager: any;
  }) {
    this.monacoService = services.monacoService;
    this.sessionManager = services.sessionManager;
  }
}

export const EditorServiceRegistry = new EditorServiceRegistryImpl();
