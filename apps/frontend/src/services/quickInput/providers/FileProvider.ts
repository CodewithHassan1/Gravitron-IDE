// src/services/quickInput/providers/FileProvider.ts
import { QuickInputProvider, QuickInputItem, QuickInputProviderMetadata } from '../../../types/quickInput';
import { WorkspaceManager } from '../../workspace/WorkspaceManager';
import { NavigationEngine } from '../../navigation/NavigationEngine';
import { FileIcon } from 'lucide-react';
import React from 'react';

import { SearchQuery } from '../../workspace/search/SearchQuery';

export class FileProvider implements QuickInputProvider {
  metadata: QuickInputProviderMetadata = {
    id: 'file',
    title: 'Go to File',
    prefixes: [''], // Default fallback
    priority: 10,
    supportsEmptyQuery: true,
    supportsAsync: true,
    supportsCancellation: true,
    supportsPreview: true,
  };

  async initialize() {}
  async dispose() {}
  async refresh() {}
  async search(query: string, signal: AbortSignal): Promise<QuickInputItem[]> {
    const searchEngine = WorkspaceManager.getSearchEngine();
    if (!searchEngine) return [];

    // Search via new engine
    const results = await searchEngine.search(new SearchQuery(query, {
      maxResults: 50
    }));

    return results.map(item => ({
      id: item.nodeId,
      label: item.path.split('/').pop() || item.path,
      description: item.path,
      icon: React.createElement(FileIcon, { size: 16 }),
      metadata: { path: item.path }
    }));
  }

  async execute(item: QuickInputItem): Promise<void> {
    if (item.metadata?.path) {
      NavigationEngine.openFile(item.metadata.path, false);
    }
  }

  async preview(item: QuickInputItem): Promise<void> {
    if (item.metadata?.path) {
      NavigationEngine.openFile(item.metadata.path, true);
    }
  }
}
