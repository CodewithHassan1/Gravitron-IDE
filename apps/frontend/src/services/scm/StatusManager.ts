import { GitManager } from './GitManager';
import { GlobalGitEvents, GitEventType } from '../../lib/scm/GitEvents';

export class StatusManager {
  static async refresh(workspaceId: string) {
    const status = await GitManager.getProvider().status(workspaceId);
    GlobalGitEvents.emit({ type: GitEventType.StatusChanged, workspaceId, payload: status });
    return status;
  }

  static async stage(workspaceId: string, paths: string[]) {
    await GitManager.getProvider().stage(workspaceId, paths);
    await this.refresh(workspaceId);
  }

  static async unstage(workspaceId: string, paths: string[]) {
    await GitManager.getProvider().unstage(workspaceId, paths);
    await this.refresh(workspaceId);
  }
}
