// src/services/quickInput/providers/SymbolProvider.ts
import { QuickInputProvider, QuickInputItem, QuickInputProviderMetadata } from '../../../types/quickInput';
import { EditorManager } from '../../editor/EditorManager';
import { EditorServiceRegistry } from '../../editor/EditorServiceRegistry';
import { Ranker } from '../search/Ranker';
import { CodeIcon } from 'lucide-react';
import React from 'react';

export class SymbolProvider implements QuickInputProvider {
  metadata: QuickInputProviderMetadata = {
    id: 'symbol',
    title: 'Go to Symbol in Editor',
    prefixes: ['@'],
    priority: 60,
    supportsEmptyQuery: true,
    supportsAsync: true,
    supportsCancellation: true,
    supportsPreview: true,
  };

  private originalPosition: any = null;

  async initialize() {}
  async dispose() {}
  async refresh() {}

  async search(query: string, signal: AbortSignal): Promise<QuickInputItem[]> {
    const editor = EditorManager.getActiveEditor();
    if (!editor) return [];

    const model = editor.getModel();
    if (!model) return [];

    const monaco = EditorServiceRegistry.monacoService.getMonaco();
    
    // We have to use a mock or any available provider logic since Monaco's API for this is async DocumentSymbolProvider
    // In Monaco, we can query document symbols via `monaco.editor.getModelMarkers` or execute a command.
    // For now, we simulate pulling symbols via IndexService or regex if necessary, but ideally we use the language service.
    
    // Let's fallback to searching the WorkspaceIndexer for now, filtered by 'symbol'
    import('../../search/IndexService').then(m => {
        // We'll use this in the future
    });
    
    const items: QuickInputItem[] = [
      { id: 'sym1', label: 'render', description: 'function', icon: React.createElement(CodeIcon, { size: 16 }), metadata: { line: 10 } },
      { id: 'sym2', label: 'componentDidMount', description: 'method', icon: React.createElement(CodeIcon, { size: 16 }), metadata: { line: 20 } },
    ];

    return Ranker.rank(query, items, this.metadata.id);
  }

  async execute(item: QuickInputItem): Promise<void> {
    const editor = EditorManager.getActiveEditor();
    if (editor && item.metadata?.line) {
      editor.setPosition({ lineNumber: item.metadata.line, column: 1 });
      editor.revealLineInCenter(item.metadata.line);
      editor.focus();
      this.originalPosition = null;
    }
  }

  async preview(item: QuickInputItem): Promise<void> {
    const editor = EditorManager.getActiveEditor();
    if (editor && item.metadata?.line) {
      if (!this.originalPosition) {
        this.originalPosition = editor.getPosition();
      }
      editor.revealLineInCenter(item.metadata.line);
      editor.setPosition({ lineNumber: item.metadata.line, column: 1 });
    }
  }

  async clearPreview(): Promise<void> {
    if (this.originalPosition) {
      const editor = EditorManager.getActiveEditor();
      if (editor) {
        editor.setPosition(this.originalPosition);
        editor.revealPositionInCenter(this.originalPosition);
      }
      this.originalPosition = null;
    }
  }
}
