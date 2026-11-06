import * as chokidar from 'chokidar';
import * as crypto from 'crypto';
import { WorkspaceEventBroker } from './WorkspaceEventBroker';
import { WorkspaceWatcherConfig } from './WorkspaceWatcherConfig';
import { WorkspaceProtocol } from '@ag/protocol';

export class FileWatcherService {
  private watcher: chokidar.FSWatcher | null = null;
  private currentWorkspacePath: string | null = null;

  private retryCount = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly BASE_DELAY = 1000;
  private readonly MAX_DELAY = 30000;
  private isReconnect = false;

  constructor(private eventBroker: WorkspaceEventBroker) {}

  public startWatching(workspacePath: string, isReconnect = false): void {
    if (this.watcher) {
      this.stopWatching();
    }

    this.currentWorkspacePath = workspacePath;
    this.isReconnect = isReconnect;

    this.watcher = chokidar.watch(workspacePath, {
      ignored: WorkspaceWatcherConfig.ignored,
      persistent: true,
      ignoreInitial: true,
      usePolling: false, // rely on native OS events for better performance
    });

    this.watcher
      .on('add', (path) => this.handleEvent('created', path))
      .on('change', (path) => this.handleEvent('modified', path))
      .on('unlink', (path) => this.handleEvent('deleted', path))
      .on('addDir', (path) => this.handleEvent('created', path))
      .on('unlinkDir', (path) => this.handleEvent('deleted', path))
      .on('ready', () => this.handleReady())
      .on('error', (error) => this.handleError(error));
  }

  private handleReady(): void {
    this.retryCount = 0; // Successful connection

    if (this.isReconnect && this.currentWorkspacePath) {
      const event: WorkspaceProtocol.WorkspaceExternalEvent = {
        id: crypto.randomUUID(),
        type: 'reconnected',
        path: '/',
        timestamp: Date.now(),
        source: 'filesystem',
      };
      this.eventBroker.emitExternalEvent(event);
    }
    this.isReconnect = false;
  }

  private handleError(error: Error): void {
    console.error(`[FileWatcherService] Error: ${error}`);
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return; // Ignore duplicate attempts

    // Close the current watcher
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    const delay = Math.min(this.MAX_DELAY, this.BASE_DELAY * 2 ** this.retryCount);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.retryCount++;
      if (this.currentWorkspacePath) {
        this.startWatching(this.currentWorkspacePath, true);
      }
    }, delay);
  }

  public stopWatching(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.currentWorkspacePath = null;
  }

  private handleEvent(
    type: 'created' | 'modified' | 'deleted' | 'renamed' | 'reconnected',
    path: string
  ): void {
    if (!this.currentWorkspacePath) return;

    // Convert absolute path from chokidar to workspace relative path
    // For Windows, replace backslashes with forward slashes for cross-platform protocol compatibility
    let relativePath = path.substring(this.currentWorkspacePath.length);
    relativePath = relativePath.replace(/\\/g, '/');
    if (!relativePath.startsWith('/')) {
      relativePath = '/' + relativePath;
    }

    const event: WorkspaceProtocol.WorkspaceExternalEvent = {
      id: crypto.randomUUID(),
      type,
      path: relativePath,
      timestamp: Date.now(),
      source: 'filesystem',
      // We don't have mutationId here because this is from raw chokidar
      // The frontend reconciler will use MutationTracker to deduplicate
    };

    this.eventBroker.emitExternalEvent(event);
  }
}
