import { IFileWatcher } from '../../platform/repository/FileWatcher';

export class WatcherRegistry {
  private static watchers = new Map<string, IFileWatcher>();

  static register(id: string, watcher: IFileWatcher) {
    this.watchers.set(id, watcher);
  }

  static unregister(id: string) {
    this.watchers.delete(id);
  }

  static get(id: string): IFileWatcher | undefined {
    return this.watchers.get(id);
  }

  static getAll(): IFileWatcher[] {
    return Array.from(this.watchers.values());
  }
}
