import { GitManager } from './GitManager';
import { GlobalGitEvents, GitEventType } from '../../lib/scm/GitEvents';

export class DiffManager {
  static async getDiff(workspaceId: string, path?: string) {
    const diffText = await GitManager.getProvider().diff(workspaceId, path);
    GlobalGitEvents.emit({ type: GitEventType.DiffUpdated, workspaceId, payload: { path, diffText } });
    return diffText;
  }
}
