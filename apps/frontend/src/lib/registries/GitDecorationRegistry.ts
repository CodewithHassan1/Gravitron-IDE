export interface GitDecoration {
  path: string;
  type: 'added' | 'modified' | 'deleted' | 'untracked' | 'conflict';
  tooltip?: string;
}

class GitDecorationRegistryImpl {
  private activeDecorations = new Map<string, GitDecoration[]>();

  setDecorations(workspaceId: string, decorations: GitDecoration[]) {
    this.activeDecorations.set(workspaceId, decorations);
  }

  getDecorations(workspaceId: string): GitDecoration[] {
    return this.activeDecorations.get(workspaceId) || [];
  }

  getDecorationForPath(workspaceId: string, path: string): GitDecoration | undefined {
    const decorations = this.getDecorations(workspaceId);
    return decorations.find((d) => d.path === path);
  }
}

export const GitDecorationRegistry = new GitDecorationRegistryImpl();
