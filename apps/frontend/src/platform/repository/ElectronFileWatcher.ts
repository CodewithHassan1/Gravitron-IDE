import { IFileWatcher, FileWatcherOptions, FileWatcherCallback } from './FileWatcher';

export class ElectronFileWatcher implements IFileWatcher {
  private callbacks: Set<FileWatcherCallback> = new Set();
  private isWatching = false;

  async start(): Promise<void> {
    this.isWatching = true;
    // IPC call to electron: window.electron.ipcRenderer.invoke('watcher:start')
  }

  async stop(): Promise<void> {
    this.isWatching = false;
    // IPC call
  }

  async watch(path: string, options?: FileWatcherOptions): Promise<void> {
    // IPC call
  }

  async unwatch(path: string): Promise<void> {
    // IPC call
  }

  onEvent(callback: FileWatcherCallback): () => void {
    this.callbacks.add(callback);
    // Listen to IPC events from Electron
    return () => {
      this.callbacks.delete(callback);
    };
  }
}
