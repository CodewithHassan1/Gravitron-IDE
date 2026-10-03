import { useEditorStore } from '../../stores/ide/editorStore';

export class EditorThemeManagerImpl {
  private monacoInstance: any = null;

  setMonaco(monaco: any) {
    this.monacoInstance = monaco;
    this.applyTheme(useEditorStore.getState().config.theme);
  }

  applyTheme(theme: string) {
    if (!this.monacoInstance) return;
    try {
      this.monacoInstance.editor.setTheme(theme);
    } catch (e) {
      console.warn(`Failed to set monaco theme: ${theme}`, e);
    }
  }

  defineCustomTheme(themeName: string, themeData: any) {
    if (!this.monacoInstance) return;
    this.monacoInstance.editor.defineTheme(themeName, themeData);
  }
  
  dispose() {
    this.monacoInstance = null;
  }
}

export const EditorThemeManager = new EditorThemeManagerImpl();
