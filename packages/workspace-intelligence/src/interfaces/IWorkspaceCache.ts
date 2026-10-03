export interface CacheVersionInfo {
  readonly cacheVersion: string;
  readonly schemaVersion: string;
  readonly workspaceVersion: string;
}

export interface IWorkspaceCache<T> {
  /**
   * Retrieves the version information for the current cache
   */
  getVersion(): CacheVersionInfo;

  /**
   * Checks whether the cache is valid for the given workspace version
   */
  isValid(workspaceVersion: string): boolean;

  /**
   * Gets an item from the cache
   */
  get(key: string): Promise<T | undefined>;

  /**
   * Sets an item in the cache
   */
  set(key: string, value: T): Promise<void>;

  /**
   * Clears the entire cache
   */
  clear(): Promise<void>;
}
