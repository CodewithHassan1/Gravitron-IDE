export interface IStorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;

  // Future capabilities
  keys?(): Promise<string[]>;
  getAll?(): Promise<Record<string, any>>;
}
