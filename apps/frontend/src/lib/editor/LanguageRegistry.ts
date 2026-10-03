export interface LanguageProvider {
  id: string;
  extensions: string[];
  aliases?: string[];
  
  // Future integrations
  configuration?: any;
  syntaxTokens?: any;
  themeTokens?: any;
  
  completionProvider?: any;
  hoverProvider?: any;
  definitionProvider?: any;
  referencesProvider?: any;
  renameProvider?: any;
  formattingProvider?: any;
  codeActionsProvider?: any;
  diagnosticsProvider?: any;
  
  semanticTokensProvider?: any;
  codeLensProvider?: any;
  inlayHintsProvider?: any;
  signatureHelpProvider?: any;
  
  lspClient?: any;
  aiPromptRules?: string[];
  parser?: any;
  treeSitterGrammar?: any;
  embeddingModel?: any;
  vectorChunker?: any;
  repoIntelligenceAdapter?: any;
}

export class LanguageRegistryImpl {
  private languages: Map<string, LanguageProvider> = new Map();
  private extensionMap: Map<string, string> = new Map();

  registerLanguage(provider: LanguageProvider) {
    this.languages.set(provider.id, provider);
    provider.extensions.forEach(ext => {
      this.extensionMap.set(ext.toLowerCase(), provider.id);
    });
  }

  getLanguage(id: string): LanguageProvider | undefined {
    return this.languages.get(id);
  }

  getLanguageByExtension(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (!ext) return 'plaintext';
    return this.extensionMap.get(`.${ext}`) || 'plaintext';
  }

  getAllLanguages(): LanguageProvider[] {
    return Array.from(this.languages.values());
  }
}

export const LanguageRegistry = new LanguageRegistryImpl();

// Register default languages
const defaults: LanguageProvider[] = [
  { id: 'typescript', extensions: ['.ts', '.tsx'], aliases: ['TypeScript', 'ts', 'tsx'] },
  { id: 'javascript', extensions: ['.js', '.jsx', '.mjs', '.cjs'], aliases: ['JavaScript', 'js', 'jsx'] },
  { id: 'json', extensions: ['.json', '.jsonc'], aliases: ['JSON'] },
  { id: 'markdown', extensions: ['.md', '.mdx'], aliases: ['Markdown'] },
  { id: 'python', extensions: ['.py', '.pyw'], aliases: ['Python', 'py'] },
  { id: 'go', extensions: ['.go'], aliases: ['Go'] },
  { id: 'rust', extensions: ['.rs'], aliases: ['Rust', 'rs'] },
  { id: 'yaml', extensions: ['.yaml', '.yml'], aliases: ['YAML'] },
  { id: 'dockerfile', extensions: ['.dockerfile', 'Dockerfile'], aliases: ['Dockerfile'] },
  { id: 'html', extensions: ['.html', '.htm'], aliases: ['HTML'] },
  { id: 'css', extensions: ['.css'], aliases: ['CSS'] },
  { id: 'scss', extensions: ['.scss'], aliases: ['SCSS'] },
  { id: 'tailwindcss', extensions: [], aliases: ['Tailwind'] },
  { id: 'java', extensions: ['.java'], aliases: ['Java'] },
  { id: 'csharp', extensions: ['.cs'], aliases: ['C#', 'csharp'] },
  { id: 'cpp', extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx'], aliases: ['C++', 'cpp'] },
  { id: 'c', extensions: ['.c', '.h'], aliases: ['C'] },
  { id: 'xml', extensions: ['.xml'], aliases: ['XML'] },
  { id: 'sql', extensions: ['.sql'], aliases: ['SQL'] },
  { id: 'shell', extensions: ['.sh', '.bash', '.zsh'], aliases: ['Bash', 'Shell'] },
];

defaults.forEach(def => LanguageRegistry.registerLanguage(def));
