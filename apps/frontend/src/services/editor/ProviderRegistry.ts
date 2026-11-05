export class ProviderRegistryImpl {
  private monacoInstance: any = null;
  private disposables: any[] = [];

  setMonaco(monaco: any) {
    this.monacoInstance = monaco;
  }

  registerCompletionProvider(language: string, provider: any) {
    if (!this.monacoInstance) return;
    const disposable = this.monacoInstance.languages.registerCompletionItemProvider(
      language,
      provider
    );
    this.disposables.push(disposable);
    return disposable;
  }

  registerHoverProvider(language: string, provider: any) {
    if (!this.monacoInstance) return;
    const disposable = this.monacoInstance.languages.registerHoverProvider(language, provider);
    this.disposables.push(disposable);
    return disposable;
  }

  registerCodeActionProvider(language: string, provider: any) {
    if (!this.monacoInstance) return;
    const disposable = this.monacoInstance.languages.registerCodeActionProvider(language, provider);
    this.disposables.push(disposable);
    return disposable;
  }

  registerRenameProvider(language: string, provider: any) {
    if (!this.monacoInstance) return;
    const disposable = this.monacoInstance.languages.registerRenameProvider(language, provider);
    this.disposables.push(disposable);
    return disposable;
  }

  registerSignatureHelpProvider(language: string, provider: any) {
    if (!this.monacoInstance) return;
    const disposable = this.monacoInstance.languages.registerSignatureHelpProvider(
      language,
      provider
    );
    this.disposables.push(disposable);
    return disposable;
  }

  registerInlineCompletionsProvider(language: string, provider: any) {
    if (!this.monacoInstance) return;
    const disposable = this.monacoInstance.languages.registerInlineCompletionsProvider(
      language,
      provider
    );
    this.disposables.push(disposable);
    return disposable;
  }

  registerDocumentSemanticTokensProvider(language: string, provider: any) {
    if (!this.monacoInstance) return;
    const disposable = this.monacoInstance.languages.registerDocumentSemanticTokensProvider(
      language,
      provider
    );
    this.disposables.push(disposable);
    return disposable;
  }

  registerFoldingRangeProvider(language: string, provider: any) {
    if (!this.monacoInstance) return;
    const disposable = this.monacoInstance.languages.registerFoldingRangeProvider(
      language,
      provider
    );
    this.disposables.push(disposable);
    return disposable;
  }

  registerDocumentFormattingEditProvider(language: string, provider: any) {
    if (!this.monacoInstance) return;
    const disposable = this.monacoInstance.languages.registerDocumentFormattingEditProvider(
      language,
      provider
    );
    this.disposables.push(disposable);
    return disposable;
  }

  dispose() {
    this.disposables.forEach((d) => {
      if (typeof d.dispose === 'function') d.dispose();
    });
    this.disposables = [];
    this.monacoInstance = null;
  }
}

export const ProviderRegistry = new ProviderRegistryImpl();
