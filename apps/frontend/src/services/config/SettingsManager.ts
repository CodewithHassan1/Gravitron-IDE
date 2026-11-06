import { ConfigurationProvider } from '../../platform/config/ConfigurationProvider';
import { ConfigurationScope } from '../../lib/config/ConfigurationScopes';
import { IConfigurationRecord } from '../../lib/config/ConfigurationSchema';
import { ConfigurationValidator } from '../../lib/config/ConfigurationValidator';
import { ConfigurationSerializer } from '../../lib/config/ConfigurationSerializer';
import { ConfigurationMigration } from '../../lib/config/ConfigurationMigration';
import { SettingsRegistry } from '../../lib/registries/SettingsRegistry';
import { systemEventBus } from '../../lib/events/SystemEvents';
import { ConfigurationEvents } from '../../lib/config/ConfigurationEvents';

export class SettingsManager {
  constructor(private readonly provider: ConfigurationProvider) {}

  private getStorageKey(scope: ConfigurationScope): string {
    return `config:${scope}`;
  }

  async getRecord(scope: ConfigurationScope): Promise<IConfigurationRecord> {
    const key = this.getStorageKey(scope);
    const serialized = await this.provider.read<string>(key);

    if (serialized) {
      let record = ConfigurationSerializer.deserialize(serialized);
      if (record) {
        record = await ConfigurationMigration.migrate(record);
        return record;
      }
    }

    // Default empty record
    return {
      id: scope.toString(),
      version: 1,
      updatedAt: Date.now(),
      updatedBy: 'system',
      scope,
      values: {},
    };
  }

  async saveRecord(record: IConfigurationRecord): Promise<void> {
    record.updatedAt = Date.now();
    const serialized = ConfigurationSerializer.serialize(record);
    await this.provider.write(this.getStorageKey(record.scope), serialized);
    systemEventBus.emit(ConfigurationEvents.ConfigurationPersisted, record);
  }

  async setValue(key: string, value: any, scope: ConfigurationScope): Promise<void> {
    systemEventBus.emit(ConfigurationEvents.BeforeConfigurationChanged, { key, value, scope });

    const schema = SettingsRegistry.getProperty(key);
    if (schema) {
      const validation = ConfigurationValidator.validate(schema, value);
      if (!validation.valid) {
        throw new Error(`Validation failed for ${key}: ${validation.error}`);
      }
    }

    systemEventBus.emit(ConfigurationEvents.ConfigurationValidated, { key, value, scope });

    const record = await this.getRecord(scope);
    record.values[key] = value;
    await this.saveRecord(record);

    systemEventBus.emit(ConfigurationEvents.ConfigurationChanged, { key, value, scope });
  }

  async resetValue(key: string, scope: ConfigurationScope): Promise<void> {
    const record = await this.getRecord(scope);
    if (key in record.values) {
      delete record.values[key];
      await this.saveRecord(record);
      systemEventBus.emit(ConfigurationEvents.ConfigurationChanged, {
        key,
        value: undefined,
        scope,
      });
    }
  }
}
