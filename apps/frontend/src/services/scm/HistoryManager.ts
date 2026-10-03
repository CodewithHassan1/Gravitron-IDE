import { GitManager } from './GitManager';
import { GlobalGitEvents, GitEventType } from '../../lib/scm/GitEvents';

export class HistoryManager {
  static async fetchHistory(workspaceId: string, limit: number = 50, filepath?: string) {
    const commits = await GitManager.getProvider().history(workspaceId, limit, filepath);
    GlobalGitEvents.emit({ type: GitEventType.HistoryUpdated, workspaceId, payload: commits });
    return commits;
  }
}
