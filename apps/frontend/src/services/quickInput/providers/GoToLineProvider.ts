// src/services/quickInput/providers/GoToLineProvider.ts
import {
  QuickInputProvider,
  QuickInputItem,
  QuickInputProviderMetadata,
} from '../../../types/quickInput';
import { EditorManager } from '../../editor/EditorManager';
import { CornerDownRightIcon } from 'lucide-react';
import React from 'react';

export class GoToLineProvider implements QuickInputProvider {
  metadata: QuickInputProviderMetadata = {
    id: 'gotoline',
    title: 'Go to Line...',
    prefixes: [':'],
    priority: 50,
    supportsEmptyQuery: true,
    supportsAsync: false,
    supportsCancellation: false,
    supportsPreview: true,
  };

  private originalPosition: any = null;

  async initialize() {}
  async dispose() {}
  async refresh() {}

  async search(query: string, signal: AbortSignal): Promise<QuickInputItem[]> {
    const editor = EditorManager.getActiveEditor();
    if (!editor) {
      return [{ id: 'error', label: 'No active editor', alwaysShow: true }];
    }

    const model = editor.getModel();
    if (!model) return [];

    const lineCount = model.getLineCount();

    // Parse query
    const match = query.match(/^(\d+)?(:\d+)?$/);
    if (!query || !match) {
      return [
        {
          id: 'prompt',
          label: `Type a line number between 1 and ${lineCount} to navigate to`,
          icon: React.createElement(CornerDownRightIcon, { size: 16 }),
          alwaysShow: true,
        },
      ];
    }

    const lineStr = match[1] || '1';
    let line = parseInt(lineStr, 10);

    if (line > lineCount) line = lineCount;
    if (line < 1) line = 1;

    return [
      {
        id: `goto-${line}`,
        label: `Go to line ${line}`,
        icon: React.createElement(CornerDownRightIcon, { size: 16 }),
        metadata: { line },
        alwaysShow: true, // Bypasses ranking completely
      },
    ];
  }

  async execute(item: QuickInputItem): Promise<void> {
    const editor = EditorManager.getActiveEditor();
    if (editor && item.metadata?.line) {
      editor.setPosition({ lineNumber: item.metadata.line, column: 1 });
      editor.revealLineInCenter(item.metadata.line);
      editor.focus();
      this.originalPosition = null; // Commit it
    }
  }

  async preview(item: QuickInputItem): Promise<void> {
    const editor = EditorManager.getActiveEditor();
    if (editor && item.metadata?.line) {
      if (!this.originalPosition) {
        this.originalPosition = editor.getPosition();
      }
      editor.revealLineInCenter(item.metadata.line);
      // Just preview the scroll, don't set cursor to avoid dirtying history unless executed
      // Or actually VS Code sets cursor too:
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
