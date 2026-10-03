import { GitManager } from './GitManager';
import { GlobalGitEvents, GitEventType } from '../../lib/scm/GitEvents';

export class BranchManager {
  static async list(workspaceId: string) {
    return await GitManager.getProvider().branch(workspaceId, 'list');
  }

  static async checkout(workspaceId: string, ref: string) {
    await GitManager.getProvider().checkout(workspaceId, ref);
    GlobalGitEvents.emit({ type: GitEventType.CheckoutCompleted, workspaceId, payload: ref });
  }

  static async create(workspaceId: string, name: string) {
    await GitManager.getProvider().branch(workspaceId, 'create', name);
    GlobalGitEvents.emit({ type: GitEventType.BranchChanged, workspaceId, payload: name });
  }

  static async deleteBranch(workspaceId: string, name: string) {
    await GitManager.getProvider().branch(workspaceId, 'delete', name);
    GlobalGitEvents.emit({ type: GitEventType.BranchChanged, workspaceId, payload: name });
  }
}
