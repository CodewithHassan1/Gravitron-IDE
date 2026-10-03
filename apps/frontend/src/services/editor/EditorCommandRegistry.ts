export class EditorCommandRegistryImpl {
  private monacoInstance: any = null;
  private disposables: any[] = [];
  // Store pending commands if registered before monaco is loaded
  private pendingCommands: Array<{ id: string; handler: (editor: any, ...args: any[]) => void }> = [];

  setMonaco(monaco: any) {
    this.monacoInstance = monaco;
    this.pendingCommands.forEach(cmd => this.registerCommand(cmd.id, cmd.handler));
    this.pendingCommands = [];
  }

  registerCommand(id: string, handler: (editor: any, ...args: any[]) => void) {
    if (!this.monacoInstance) {
      this.pendingCommands.push({ id, handler });
      return;
    }

    const disposable = this.monacoInstance.editor.addEditorAction({
      id,
      label: id, // label is required, use id as fallback
      run: handler
    });
    
    // In Monaco, addEditorAction doesn't explicitly return a disposable that is globally manageable easily via the static API
    // if using `editor.addCommand()`, it returns a string ID or is tied to a specific instance.
    // For global commands, usually we rely on `editor.addAction` on the instance itself.
    
    if (disposable && typeof disposable.dispose === 'function') {
      this.disposables.push(disposable);
    }
  }

  dispose() {
    this.disposables.forEach(d => {
      if (typeof d.dispose === 'function') d.dispose();
    });
    this.disposables = [];
    this.pendingCommands = [];
    this.monacoInstance = null;
  }
}

export const EditorCommandRegistry = new EditorCommandRegistryImpl();
