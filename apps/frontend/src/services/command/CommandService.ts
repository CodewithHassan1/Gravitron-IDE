import { CommandRegistry } from '../../lib/registries/CommandRegistry';

export const CommandService = {
  execute: (id: string, ...args: any[]) => CommandRegistry.executeCommand(id, ...args),
};

export const WorkbenchCommands = {
  OPEN_FOLDER: 'workbench.action.files.openFolder',
  OPEN_RECENT: 'workbench.action.files.openRecent',
  CLONE_REPOSITORY: 'workbench.action.git.clone',
  SHOW_EXPLORER: 'workbench.action.showExplorer',
  SHOW_SEARCH: 'workbench.action.showSearch',
  SHOW_COMMAND_PALETTE: 'workbench.action.showCommands',
  GO_TO_FILE: 'workbench.action.quickOpen',
} as const;
