import { useTerminalStore } from '../../../stores/ide/terminalStore';
import { TerminalManager } from '../../../services/terminal';
import { WorkspaceManager } from '../../../services/workspace/WorkspaceManager';
import { WorkspaceLifecycleState } from '../../../services/workspace/types';

export const TerminalUIHelper = {
  getSafeCwd(providedCwd?: string): string | undefined {
    if (providedCwd && providedCwd.trim()) {
      return providedCwd.trim();
    }
    try {
      const native = WorkspaceManager.getNativeAbsolutePath();
      if (native && native.trim()) {
        return native.trim();
      }
    } catch {
      // Ignored if no active workspace is open
    }
    const wsId = WorkspaceManager.getWorkspaceId();
    if (wsId && (wsId.includes(':') || wsId.startsWith('/'))) {
      return wsId.trim();
    }
    return undefined;
  },

  async splitTerminal(sourceGroupId: string, profileId?: string) {
    const newGroup = {
      id: `group_${Date.now()}`,
      tabs: [],
      activeTabId: null,
    };
    useTerminalStore.getState().addGroup(newGroup);

    const cwd = this.getSafeCwd();
    const workspaceId = WorkspaceManager.getWorkspaceId() ?? undefined;
    const session = await TerminalManager.createTerminal({
      cwd,
      profileId,
      workspaceId,
      autoConnect: true,
    });

    useTerminalStore.getState().addTab(newGroup.id, {
      id: session.id,
      title: 'Terminal',
      cwd: cwd || '',
      shellId: profileId || 'default',
    });
  },

  async createTerminal(groupId: string, providedCwd?: string, profileId?: string) {
    const cwd = this.getSafeCwd(providedCwd);
    const workspaceId = WorkspaceManager.getWorkspaceId() ?? undefined;
    const session = await TerminalManager.createTerminal({
      cwd,
      profileId,
      workspaceId,
      autoConnect: true,
    });

    useTerminalStore.getState().addTab(groupId, {
      id: session.id,
      title: 'Terminal',
      cwd: cwd || '',
      shellId: profileId || 'default',
    });

    return session;
  },

    initialize(initialWorkspaceId ?: string): () => void {
      let _isRestoring = false;
      let trackedWorkspaceId = initialWorkspaceId || WorkspaceManager.getWorkspaceId();

        const handleWorkspaceOpened = async (event?: any) => {
          if (_isRestoring) return;
          _isRestoring = true;
          try {
            const currentWorkspaceId = event?.payload?.workspaceId || WorkspaceManager.getWorkspaceId();
            if (!currentWorkspaceId) return;

            trackedWorkspaceId = currentWorkspaceId;

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
                activeTabId: null,
              };
              updatedState.addGroup(defaultGroup);
              await this.createTerminal(defaultGroup.id);
            }
          } catch (err) {
            console.error('[TerminalUIHelper] Failed to handle workspace opened:', err);
          } finally {
            _isRestoring = false;
          }
        };

          if (
            trackedWorkspaceId &&
            trackedWorkspaceId !== 'unknown' &&
            WorkspaceManager.getState().lifecycleState === WorkspaceLifecycleState.Ready
          ) {
            handleWorkspaceOpened();
          }

          let unsubscribe: (() => void) | undefined;
          import('../../../services/workspace/WorkspaceEvents').then(({ WorkspaceEvents }) => {
            import('../../../services/workspace/types').then(({ WorkspaceEventType }) => {
              WorkspaceEvents.on(WorkspaceEventType.WorkspaceOpened, handleWorkspaceOpened);
              unsubscribe = () => {
                WorkspaceEvents.off(WorkspaceEventType.WorkspaceOpened, handleWorkspaceOpened);
              };
            });
          });

          return () => {
                if (unsubscribe) {
                  unsubscribe();
                } else {
                  import('../../../services/workspace/WorkspaceEvents').then(({ WorkspaceEvents }) => {
                    import('../../../services/workspace/types').then(({ WorkspaceEventType }) => {
                      WorkspaceEvents.off(WorkspaceEventType.WorkspaceOpened, handleWorkspaceOpened);
                    });
                  });
            }
    };
        },
      };
