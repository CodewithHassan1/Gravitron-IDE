import { IConfigurationRecord } from './ConfigurationSchema';

export class ConfigurationMigration {
  static async migrate(record: IConfigurationRecord): Promise<IConfigurationRecord> {
    const currentVersion = 1; // Assuming 1 is the latest for now

    let migratedRecord = { ...record };

    if (!migratedRecord.version) {
      migratedRecord.version = 0;
    }

    // Example Migration from v0 to v1
    if (migratedRecord.version < 1) {
      // Apply mutations
      if (migratedRecord.values['editor.fontSize'] === '14px') {
        migratedRecord.values['editor.fontSize'] = 14;
      }
      migratedRecord.version = 1;
    }

    // Future v1 -> v2
    // if (migratedRecord.version < 2) { ... migratedRecord.version = 2; }

    return migratedRecord;
  }
}
