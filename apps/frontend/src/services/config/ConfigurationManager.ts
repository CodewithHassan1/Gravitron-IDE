import { ConfigurationScope } from '../../lib/config/ConfigurationScopes';
import { IConfigurationRecord } from '../../lib/config/ConfigurationSchema';
import { ConfigurationDefaults } from '../../lib/config/ConfigurationDefaults';
import { SettingsRegistry } from '../../lib/registries/SettingsRegistry';
import { SettingsManager } from './SettingsManager';

export class ConfigurationManager {
  private static settingsManager: SettingsManager;
  private static computedCache: Record<string, any> = {};

  static setSettingsManager(manager: SettingsManager) {
    this.settingsManager = manager;
  }

  static async initialize() {
    await this.computeEffectiveConfiguration();
  }

  /**
   * Recomputes the cascading configuration from all layers:
   * Default -> Machine -> User -> Profile -> Workspace -> Folder -> Language -> Override
   */
  static async computeEffectiveConfiguration() {
    const defaults = ConfigurationDefaults.getDefaults();

    // For now we assume only User Scope is fully implemented in the manager
    const userRecord = await this.settingsManager?.getRecord(ConfigurationScope.User);
    const userValues = userRecord?.values || {};

    // Workspace overrides
    const workspaceRecord = await this.settingsManager?.getRecord(ConfigurationScope.Workspace);
    const workspaceValues = workspaceRecord?.values || {};

    // Cascade
    this.computedCache = {
      ...defaults,
      ...userValues,
      ...workspaceValues,
    };
  }

  static get<T>(key: string, fallback?: T): T {
    if (this.computedCache[key] !== undefined) {
      return this.computedCache[key];
    }
    const schema = SettingsRegistry.getProperty(key);
    if (schema !== undefined) {
      return schema.defaultValue;
    }
    return fallback as T;
  }

  static async set(
    key: string,
    value: any,
    scope: ConfigurationScope = ConfigurationScope.User
  ): Promise<void> {
    await this.settingsManager?.setValue(key, value, scope);
    await this.computeEffectiveConfiguration();
  }

  static async reset(
    key: string,
    scope: ConfigurationScope = ConfigurationScope.User
  ): Promise<void> {
    await this.settingsManager?.resetValue(key, scope);
    await this.computeEffectiveConfiguration();
  }
}
