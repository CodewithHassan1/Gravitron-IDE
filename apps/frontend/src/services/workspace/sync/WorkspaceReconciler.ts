import { WorkspaceManagerImpl } from '../WorkspaceManager';
import { WorkspaceProtocol } from '@ag/protocol';

export class WorkspaceReconciler {
  constructor(private workspaceManager: WorkspaceManagerImpl) {}

  public start(): void {
    if (typeof window !== 'undefined' && (window as any).agApi) {
      (window as any).agApi.workspace.subscribe((events: WorkspaceProtocol.WorkspaceExternalEvent[]) => {
        this.handleExternalEvents(events);
      });
    }
  }

  private async handleExternalEvents(events: WorkspaceProtocol.WorkspaceExternalEvent[]): Promise<void> {
    for (const event of events) {
      // 1. Check if this event was initiated by us
      if (event.mutationId) {
        if (this.workspaceManager.mutationTracker.hasMutationForPath(event.path)) {
          // It's an echo of our own mutation, ignore it.
          this.workspaceManager.mutationTracker.resolveMutation(event.mutationId);
          continue;
        }
      }

      // 2. Not ours, reconcile VFS and buffers
      switch (event.type) {
        case 'created':
          await this.workspaceManager.handleExternalCreate(event.path);
          break;
        case 'deleted':
          this.workspaceManager.handleExternalDelete(event.path);
          break;
        case 'modified':
          // FileContentManager will handle this in ConflictManager
          this.workspaceManager.contentManager.handleExternalModification(event.path);
          break;
        case 'renamed':
          // Need new path for rename
          break;
        case 'reconnected':
          await this.workspaceManager.refresh('/');
          break;
      }
    }
  }

  private getParentPath(path: string): string {
    const parts = path.split('/');
    parts.pop();
    return parts.join('/') || '/';
  }
}
