import { GitProviderRegistry } from '../../lib/registries/GitProviderRegistry';
import { GlobalGitEvents, GitEventType } from '../../lib/scm/GitEvents';
import { WorkspaceManager } from '../workspace/WorkspaceManager';
import { WorkspaceEventType } from '../workspace/types';
import { useGitStore } from '../../stores/ide/gitStore';

export class GitManagerImpl {
  public getProvider() {
    return GitProviderRegistry.getDefault();
  }

  public async initialize() {
    WorkspaceManager.onEvent(WorkspaceEventType.WorkspaceOpened, async (event: any) => {
      const state = WorkspaceManager.getState();
      if (state.metadata?.capabilities?.git === false) return;
      const workspaceId = event.payload?.workspaceId || state.metadata?.id;
      if (!workspaceId) return;
      const isRepo = await this.getProvider().discoverRepository(workspaceId);
      if (isRepo) {
        useGitStore.getState().setCurrentRepository(workspaceId);
        await this.status(workspaceId);
      }
    });

    WorkspaceManager.onEvent(WorkspaceEventType.WorkspaceUpdated, async (event: any) => {
      const state = WorkspaceManager.getState();
      if (state.metadata?.capabilities?.git === false) return;
      const workspaceId = event.payload?.workspaceId || state.metadata?.id;
      if (!workspaceId) return;
      const isRepo = await this.getProvider().discoverRepository(workspaceId);
      if (isRepo) {
        useGitStore.getState().setCurrentRepository(workspaceId);
        await this.status(workspaceId);
      }
    });
  }

  public async status(workspaceId: string) {
    const status = await this.getProvider().status(workspaceId);
    GlobalGitEvents.emit({ type: GitEventType.StatusChanged, workspaceId, payload: status });
    return status;
  }

  public async commit(workspaceId: string, message: string) {
    const oid = await this.getProvider().commit(workspaceId, message);
    GlobalGitEvents.emit({ type: GitEventType.CommitCreated, workspaceId, payload: oid });
    await this.status(workspaceId);
    return oid;
  }

  // Other delegations to specific managers
}

export const GitManager = new GitManagerImpl();
