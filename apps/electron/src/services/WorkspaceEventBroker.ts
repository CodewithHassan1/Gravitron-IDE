import { WindowService } from './WindowService';
import { Channels, WorkspaceProtocol } from '@ag/protocol';

export class WorkspaceEventBroker {
  private eventQueue: WorkspaceProtocol.WorkspaceExternalEvent[] = [];
  private debounceTimer: NodeJS.Timeout | null = null;
  private DEBOUNCE_MS = 200;
  
  // Track recent mutations to echo them back to the frontend
  private recentMutations = new Map<string, { id: string, timestamp: number }>();
  private MUTATION_TTL = 3000;

  constructor(private windowService: WindowService) {}

  public registerMutation(path: string, mutationId: string): void {
    // Normalize path to ensure matches
    let normalized = path.replace(/\\/g, '/');
    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized;
    }
    this.recentMutations.set(normalized, { id: mutationId, timestamp: Date.now() });
  }

  public emitExternalEvent(event: WorkspaceProtocol.WorkspaceExternalEvent): void {
    // Clean up old mutations
    const now = Date.now();
    for (const [path, mutation] of this.recentMutations.entries()) {
      if (now - mutation.timestamp > this.MUTATION_TTL) {
        this.recentMutations.delete(path);
      }
    }

    // Attach mutationId if we have one for this path
    const mutation = this.recentMutations.get(event.path);
    if (mutation) {
      event.mutationId = mutation.id;
    }

    // Basic deduplication in queue based on path and type
    const existingIndex = this.eventQueue.findIndex(e => e.path === event.path && e.type === event.type);
    if (existingIndex >= 0) {
      this.eventQueue[existingIndex] = event; // Keep the latest
    } else {
      this.eventQueue.push(event);
    }
    
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.flush();
    }, this.DEBOUNCE_MS);
  }

  private flush(): void {
    if (this.eventQueue.length === 0) return;

    const eventsToBroadcast = [...this.eventQueue];
    this.eventQueue = [];

    // Broadcast batched events to the frontend
    this.windowService.broadcast(Channels.Workspace.OnEvent, eventsToBroadcast);
  }

  public dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.eventQueue = [];
    this.recentMutations.clear();
  }
}

