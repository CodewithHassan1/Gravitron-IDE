import { CommandRegistry } from '../../../lib/registries/CommandRegistry';
import { GitManager } from '../../../services/scm/GitManager';
import { useGitStore } from '../../../stores/ide/gitStore';

export function registerGitCommands() {
  CommandRegistry.registerCommand({
    id: 'git.init',
    title: 'Git: Initialize Repository',
    handler: async () => {
      const current = useGitStore.getState().currentRepository;
      if (current) await GitManager.getProvider().init(current);
    },
  });

  CommandRegistry.registerCommand({
    id: 'git.refresh',
    title: 'Git: Refresh',
    handler: async () => {
      const current = useGitStore.getState().currentRepository;
      if (current) await GitManager.status(current);
    },
  });

  CommandRegistry.registerCommand({
    id: 'git.stageAll',
    title: 'Git: Stage All',
    handler: async () => {
      const state = useGitStore.getState();
      if (state.currentRepository && state.dirtyFiles.length > 0) {
        await GitManager.getProvider().stage(
          state.currentRepository,
          state.dirtyFiles.map((f) => f.path)
        );
        await GitManager.status(state.currentRepository);
      }
    },
  });

  // Other commands: Checkout Branch, Create Branch, Delete Branch, Pull, Push, Fetch, Stash, etc.
}
