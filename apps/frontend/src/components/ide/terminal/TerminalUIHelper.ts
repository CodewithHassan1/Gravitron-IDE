import { useTerminalStore } from '../../../stores/ide/terminalStore';
import { TerminalManager } from '../../../services/terminal';
import { WorkspaceManager } from '../../../services/workspace/WorkspaceManager';
import { WorkspaceLifecycleState } from '../../../services/workspace/types';

export const TerminalUIHelper = {
  async splitTerminal(sourceGroupId: string, profileId?: string) {
    const newGroup = {
      id: `group_${Date.now()}`,
      tabs: [],
      activeTabId: null
    };
    useTerminalStore.getState().addGroup(newGroup);
    
    const cwd = WorkspaceManager.getNativeAbsolutePath();
    const workspaceId = WorkspaceManager.getWorkspaceId() ?? undefined;
    const session = await TerminalManager.createTerminal({ cwd, profileId, workspaceId });
    
    useTerminalStore.getState().addTab(newGroup.id, {
      id: session.id,
      title: 'Terminal',
      cwd,
      shellId: profileId || 'default'
    });
  },

  async createTerminal(groupId: string, providedCwd?: string, profileId?: string) {
    const cwd = providedCwd || WorkspaceManager.getNativeAbsolutePath();
    const workspaceId = WorkspaceManager.getWorkspaceId() ?? undefined;
    const session = await TerminalManager.createTerminal({ cwd, profileId, workspaceId });
    
    useTerminalStore.getState().addTab(groupId, {
      id: session.id,
      title: 'Terminal',
      cwd,
      shellId: profileId || 'default'
    });
    
    return session;
  },

  initialize(workspaceId: string): () => void {
    let _isRestoring = false;

    const handleWorkspaceOpened = async () => {
      if (_isRestoring) return;
      _isRestoring = true;
      try {
        const currentWorkspaceId = WorkspaceManager.getWorkspaceId();
        // Check if the workspace changed while we were waiting
        if (!currentWorkspaceId || currentWorkspaceId !== workspaceId) return;

        const state = useTerminalStore.getState();
        if (state.workspaceId !== currentWorkspaceId) {
          state.clearAll(currentWorkspaceId);
        }

        await TerminalManager.restoreSessions(currentWorkspaceId);

        const updatedState = useTerminalStore.getState();
        if (updatedState.groups.length === 0) {
          const defaultGroup = {
            id: `group_${Date.now()}`,
            tabs: [],
            activeTabId: null
          };
          updatedState.addGroup(defaultGroup);
          await this.createTerminal(defaultGroup.id);
        }
      } finally {
        _isRestoring = false;
      }
    };

    if (WorkspaceManager.getState().lifecycleState === WorkspaceLifecycleState.Ready) {
      handleWorkspaceOpened();
    }
    
    import('../../../services/workspace/WorkspaceEvents').then(({ WorkspaceEvents }) => {
      import('../../../services/workspace/types').then(({ WorkspaceEventType }) => {
        WorkspaceEvents.on(WorkspaceEventType.WorkspaceOpened, handleWorkspaceOpened);
      });
    });

    return () => {
      import('../../../services/workspace/WorkspaceEvents').then(({ WorkspaceEvents }) => {
        import('../../../services/workspace/types').then(({ WorkspaceEventType }) => {
          WorkspaceEvents.off(WorkspaceEventType.WorkspaceOpened, handleWorkspaceOpened);
        });
      });
    };
  }
};
