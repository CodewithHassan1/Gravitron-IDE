import { SettingsRegistry } from '../../../lib/registries/SettingsRegistry';
import { ConfigurationScope } from '../../../lib/config/ConfigurationScopes';

export function registerGitSettings() {
  SettingsRegistry.register({
    id: 'git',
    title: 'Git',
    properties: [
      { id: 'git.enabled', title: 'Enabled', description: '', type: 'boolean', defaultValue: true, category: 'Git', scope: ConfigurationScope.Machine },
      { id: 'git.autorefresh', title: 'Auto Refresh', description: '', type: 'boolean', defaultValue: true, category: 'Git', scope: ConfigurationScope.Machine },
      { id: 'git.decorations.enabled', title: 'Decorations Enabled', description: '', type: 'boolean', defaultValue: true, category: 'Git', scope: ConfigurationScope.Machine },
      { id: 'git.history.limit', title: 'History Limit', description: '', type: 'number', defaultValue: 50, category: 'Git', scope: ConfigurationScope.Machine },
    ]
  });
}
