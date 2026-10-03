import { GitManager } from './GitManager';
import { GlobalGitEvents, GitEventType } from '../../lib/scm/GitEvents';

export class RepositoryDiscovery {
  static async discover(workspaceId: string): Promise<boolean> {
    const provider = GitManager.getProvider();
    const isRepo = await provider.discoverRepository(workspaceId);
    
    if (isRepo) {
      GlobalGitEvents.emit({ type: GitEventType.RepositoryDiscovered, workspaceId });
    }
    
    return isRepo;
  }
}
