export interface ContextItem {
  id: string;
  type: 'selection' | 'file' | 'editor' | 'diff' | 'diagnostic' | 'search' | 'reference' | 'summary';
  content: string;
  metadata?: any;
}

export class ContextCollector {
  async collect(workspaceId: string): Promise<ContextItem[]> {
    // Gathers items from EditorManager, GitManager, WorkspaceManager, etc.
    return [];
  }
}
