import { SettingsRegistry } from '../registries/SettingsRegistry';
import { IConfigurationPropertySchema } from './ConfigurationSchema';

export class ConfigurationDefaults {
  static getDefaults(): Record<string, any> {
    const defaults: Record<string, any> = {};
    const schemas = SettingsRegistry.getAllProperties();

    schemas.forEach((schema: IConfigurationPropertySchema) => {
      defaults[schema.id] = schema.defaultValue;
    });

    return defaults;
  }
}
