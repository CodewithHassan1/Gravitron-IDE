import { IStorageAdapter } from './StorageAdapter';

export class ConfigurationProvider {
  constructor(private readonly adapter: IStorageAdapter) {}

  async read<T>(key: string): Promise<T | null> {
    return this.adapter.get<T>(key);
  }

  async write<T>(key: string, value: T): Promise<void> {
    await this.adapter.set<T>(key, value);
  }

  async delete(key: string): Promise<void> {
    await this.adapter.remove(key);
  }

  async clearAll(): Promise<void> {
    await this.adapter.clear();
  }

  async readAll(): Promise<Record<string, any>> {
    if (this.adapter.getAll) {
      return this.adapter.getAll();
    }
    return {};
  }
}
