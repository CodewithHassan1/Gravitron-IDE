import { IFileWatcher, FileWatcherOptions, FileWatcherCallback, FileWatcherEvent } from './FileWatcher';

export class BrowserFileWatcher implements IFileWatcher {
  private callbacks: Set<FileWatcherCallback> = new Set();
  private isWatching = false;
  private watchPaths: Map<string, FileWatcherOptions> = new Map();
  private pollInterval: any = null;

  async start(): Promise<void> {
    if (this.isWatching) return;
    this.isWatching = true;
    
    // Fallback polling mechanism if native FileSystemObserver is not available
    // For this enterprise implementation, we mock the polling interval
    this.pollInterval = setInterval(() => {
      this.poll();
    }, 5000);
  }

  async stop(): Promise<void> {
    this.isWatching = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async watch(path: string, options?: FileWatcherOptions): Promise<void> {
    this.watchPaths.set(path, options || {});
  }

  async unwatch(path: string): Promise<void> {
    this.watchPaths.delete(path);
  }

  onEvent(callback: FileWatcherCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  private poll() {
    // In a real browser fallback, this would recursively scan tracked directories 
    // and compare last modified dates. 
    // We will leave this as a stub that the Scanner or mock can manually trigger for now.
  }

  /**
   * Utility for internal services (e.g. mock editor saves) to manually trigger events
   * in the browser environment since real filesystem events aren't standard yet.
   */
  public emitEvent(event: FileWatcherEvent) {
    for (const cb of Array.from(this.callbacks)) {
      cb([event]);
    }
  }
}
