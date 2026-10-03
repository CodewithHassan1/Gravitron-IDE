export interface FileWatcherOptions {
  recursive?: boolean;
  excludes?: string[];
}

export interface FileWatcherEvent {
  type: 'created' | 'modified' | 'deleted' | 'renamed' | 'moved';
  path: string;
  oldPath?: string; // used for renamed/moved
}

export type FileWatcherCallback = (events: FileWatcherEvent[]) => void;

export interface IFileWatcher {
  start(): Promise<void>;
  stop(): Promise<void>;
  watch(path: string, options?: FileWatcherOptions): Promise<void>;
  unwatch(path: string): Promise<void>;
  onEvent(callback: FileWatcherCallback): () => void;
}
