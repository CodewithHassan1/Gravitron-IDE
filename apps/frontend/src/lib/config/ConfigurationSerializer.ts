import { IConfigurationRecord } from './ConfigurationSchema';

export class ConfigurationSerializer {
  static serialize(record: IConfigurationRecord): string {
    return JSON.stringify(record, null, 2);
  }

  static deserialize(data: string): IConfigurationRecord | null {
    try {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object' && 'version' in parsed && 'values' in parsed) {
        return parsed as IConfigurationRecord;
      }
      return null;
    } catch {
      return null;
    }
  }
}
