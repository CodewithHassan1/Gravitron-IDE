import { TimelineProvider, TimelineItem } from '../types';
import { WorkspaceManager } from '../../workspace/WorkspaceManager';
import { WorkspaceEventType } from '../../workspace/types';

// For this implementation, we will simulate the local history storage.
// In a real implementation, this would save to AppData/Gravitron/History/...
class LocalHistoryProviderImpl implements TimelineProvider {
  public readonly id = 'local';
  private saveCounter: Map<string, number> = new Map();

  constructor() {
    this.initialize();
  }

  private initialize() {
    // Listen for file saves to create snapshots/diffs
    WorkspaceManager.onEvent(WorkspaceEventType.WorkspaceUpdated, (event: any) => {
      // In a real app, listen to specific file save events
      // For now, this is a stub.
    });
  }

  canProvide(uri: string): boolean {
    return true; // We can track local history for any file
  }

  async provideTimeline(uri: string, limit: number = 50): Promise<TimelineItem[]> {
    // Return empty array instead of fake mock snapshots until backend implemented
    return [];
  }
}

export const LocalHistoryProvider = new LocalHistoryProviderImpl();
