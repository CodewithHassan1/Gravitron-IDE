import { SettingsRegistry } from '../../../lib/registries/SettingsRegistry';
import { ConfigurationScope } from '../../../lib/config/ConfigurationScopes';

export function registerRepositorySettings() {
  SettingsRegistry.register({
    id: 'repository',
    title: 'Repository',
    properties: [
      {
        id: 'repository.watcher.polling',
        title: 'Watcher Polling',
        description:
          'Use polling instead of native filesystem events (useful for certain network drives)',
        type: 'boolean',
        defaultValue: false,
        category: 'Repository',
        scope: ConfigurationScope.Machine,
      },
      {
        id: 'repository.watcher.ignoredFolders',
        title: 'Ignored Folders',
        description: 'Comma separated list of folders to completely ignore during scanning',
        type: 'string',
        defaultValue: 'node_modules,.git,.next',
        category: 'Repository',
        scope: ConfigurationScope.Workspace,
      },
      {
        id: 'repository.autoRefresh',
        title: 'Auto Refresh',
        description: 'Automatically refresh the workspace on external changes',
        type: 'boolean',
        defaultValue: true,
        category: 'Repository',
        scope: ConfigurationScope.Workspace,
      },
      {
        id: 'repository.maxFileSize',
        title: 'Max File Size for Indexing (MB)',
        description: 'Files larger than this will not be fully indexed',
        type: 'number',
        defaultValue: 5,
        category: 'Repository',
        scope: ConfigurationScope.Workspace,
      },
    ],
  });
}
