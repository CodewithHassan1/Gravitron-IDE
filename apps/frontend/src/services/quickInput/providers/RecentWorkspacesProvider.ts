import { QuickInputProvider, QuickInputItem, QuickInputProviderMetadata } from '../../../types/quickInput';
import { WorkspaceManager } from '../../workspace/WorkspaceManager';
import { Folder } from 'lucide-react';
import React from 'react';

export interface RecentWorkspace {
  name: string;
  path: string;
  timestamp: number;
}

export const RecentWorkspacesManager = {
  getRecentWorkspaces(): RecentWorkspace[] {
    try {
      const data = localStorage.getItem('ag_recent_workspaces');
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  addWorkspace(name: string, path: string) {
    const workspaces = this.getRecentWorkspaces();
    const existingIndex = workspaces.findIndex(w => w.path === path);
    if (existingIndex >= 0) {
      workspaces.splice(existingIndex, 1);
    }
    workspaces.unshift({ name, path, timestamp: Date.now() });
    // Keep top 20
    localStorage.setItem('ag_recent_workspaces', JSON.stringify(workspaces.slice(0, 20)));
  }
};

export class RecentWorkspacesProvider implements QuickInputProvider {
  metadata: QuickInputProviderMetadata = {
    id: 'recent-workspaces',
    title: 'Open Recent Workspace',
    prefixes: ['~'], 
    priority: 5,
    supportsEmptyQuery: true,
    supportsAsync: false,
    supportsCancellation: false,
    supportsPreview: false,
  };

  async initialize() {}
  async dispose() {}
  async refresh() {}

  async search(query: string, signal: AbortSignal): Promise<QuickInputItem[]> {
    const workspaces = RecentWorkspacesManager.getRecentWorkspaces();
    const lowercaseQuery = query.toLowerCase();

    return workspaces
      .filter(w => w.name.toLowerCase().includes(lowercaseQuery) || w.path.toLowerCase().includes(lowercaseQuery))
      .map(item => ({
        id: `recent_${item.path}`,
        label: item.name,
        description: item.path,
        icon: React.createElement(Folder, { size: 16 }),
        metadata: { path: item.path }
      }));
  }

  async execute(item: QuickInputItem): Promise<void> {
    if (item.metadata?.path) {
      if (typeof window !== 'undefined' && (window as any).agApi) {
        // Use IPC to open the workspace
        await (window as any).agApi.workspace.open(item.metadata.path);
      }
    }
  }

  async preview(item: QuickInputItem): Promise<void> {}
}
