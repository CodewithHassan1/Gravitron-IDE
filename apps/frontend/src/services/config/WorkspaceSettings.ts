import { SettingsManager } from './SettingsManager';
import { ConfigurationScope } from '../../lib/config/ConfigurationScopes';
import { systemEventBus } from '../../lib/events/SystemEvents';
import { ConfigurationEvents } from '../../lib/config/ConfigurationEvents';

export class WorkspaceSettings {
  constructor(private readonly settingsManager: SettingsManager) {}

  async applyOverrides(overrides: Record<string, any>) {
    const record = await this.settingsManager.getRecord(ConfigurationScope.Workspace);
    record.values = { ...record.values, ...overrides };
    await this.settingsManager.saveRecord(record);
    systemEventBus.emit(ConfigurationEvents.WorkspaceSettingsChanged, record);
  }
}
