import { TimelineProvider, TimelineItem } from '../types';
import { GitManager } from '../../scm/GitManager';
import { HistoryManager } from '../../scm/HistoryManager';
import { WorkspaceManager } from '../../workspace/WorkspaceManager';

export class GitTimelineProvider implements TimelineProvider {
  public readonly id = 'git';

  canProvide(uri: string): boolean {
    return uri.startsWith('file:///');
  }

  async provideTimeline(uri: string, limit: number = 50): Promise<TimelineItem[]> {
    const workspace = WorkspaceManager.getState().metadata;
    if (!workspace) return [];
    if (workspace.capabilities?.git === false) return [];

    const filepath = uri.replace('file:///', ''); // Strip protocol. This might need to be adjusted based on VFS path formats.
    // In our VFS, usually file paths are relative to root, e.g. /src/index.ts
    // If uri is something like `file:///workspaceId/src/index.ts`, we need to extract the relative path.
    // Assuming workspaceId is known:
    
    // Simplification for now, we pass the raw path to HistoryManager and let isomorphic-git handle it 
    // depending on how VFS provides it. Let's assume filepath is the path part.
    let pathPart = uri;
    if (uri.startsWith('file:///')) {
      pathPart = uri.substring(7);
    }
    
    try {
      const commits = await HistoryManager.fetchHistory(workspace.id, limit, pathPart);
      
      return commits.map(commit => ({
        id: `git-${commit.oid}`,
        timestamp: commit.author.timestamp * 1000,
        provider: this.id,
        type: 'commit',
        title: commit.message.split('\n')[0],
        description: commit.author.name,
        icon: 'git-commit',
        command: 'workbench.action.compareEditor',
        metadata: {
          hash: commit.oid,
          author: commit.author,
          branch: 'unknown' // could be fetched if needed
        }
      }));
    } catch (e) {
      console.error('GitTimelineProvider failed to fetch history', e);
      return [];
    }
  }
}
