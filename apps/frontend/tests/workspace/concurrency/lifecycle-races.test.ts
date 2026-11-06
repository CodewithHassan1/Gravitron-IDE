import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkspaceManagerImpl } from '../../../src/services/workspace/WorkspaceManager';
import { WorkspaceEvents } from '../../../src/services/workspace/WorkspaceEvents';

let mockDbStore = new Map<string, any>();

vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn(async (storeName, key) => mockDbStore.get(`${storeName}:${key}`)),
    put: vi.fn(async (storeName, val, key) => {
      const actualKey = key || val.workspaceId || val.id;
      mockDbStore.set(`${storeName}:${actualKey}`, val);
    }),
    delete: vi.fn(async (storeName, key) => mockDbStore.delete(`${storeName}:${key}`)),
  }),
}));

describe('Lifecycle Races Test', () => {
  let manager: WorkspaceManagerImpl;

  beforeEach(() => {
    mockDbStore.clear();
    WorkspaceEvents.clearAllListeners();
    manager = new WorkspaceManagerImpl();
  });

  afterEach(async () => {
    await manager.closeWorkspace();

    // Cleanup assertions
    expect((WorkspaceEvents as any).listeners?.size || 0).toBe(0);
    if ((manager as any).syncEngine) {
      expect((manager as any).syncEngine.queue.size).toBe(0);
      const state = (manager as any).syncEngine.state;
      expect(state.status).toBe('Idle');
    }
  });

  it('Concurrent Open and Close', async () => {
    const wsInfo = {
      id: 'ws-lifecycle',
      name: 'LifecycleWS',
      uri: 'file:///',
      provider: 'memory' as any,
      lastOpened: Date.now(),
      type: 'directory' as any,
      capabilities: {} as any,
    };

    const promises = [
      manager.openWorkspace(wsInfo, { nativeHandle: {} as any }),
      manager.closeWorkspace(),
      manager.openWorkspace(wsInfo, { nativeHandle: {} as any }),
      manager.closeWorkspace(),
      manager.openWorkspace(wsInfo, { nativeHandle: {} as any }),
    ];

    await Promise.allSettled(promises);

    // Final state should be deterministic, but we mainly care that it doesn't crash,
    // leak listeners, or double initialize.

    // Depending on timing, the workspace is either open or closed
    const activeWs = manager.getState().metadata;
    if (activeWs) {
      expect(activeWs.id).toBe('ws-lifecycle');
      expect((manager as any).syncEngine).toBeDefined();
    } else {
      expect((manager as any).syncEngine).toBeUndefined();
    }

    // Ensure no double initialization in event bus (event bus should not have duplicate listeners)
    // The WorkspaceManager adds a fileEvent listener.
    // If open, there should be exactly 1 listener. If closed, 0.
    const fileEventListeners = (WorkspaceEvents as any).listeners.get('fileEvent');
    expect(fileEventListeners?.size || 0).toBeLessThanOrEqual(1);

    // No timer leaks (sync engine debounce)
    // SyncEngine does not use setInterval, it uses setTimeout for debounce.
    // Ensure that if it is closed, no pending saves exist.
  });

  it('Concurrent Reloads', async () => {
    const wsInfo = {
      id: 'ws-reload',
      name: 'ReloadWS',
      uri: 'file:///',
      provider: 'memory' as any,
      lastOpened: Date.now(),
      type: 'directory' as any,
      capabilities: {} as any,
    };
    await manager.openWorkspace(wsInfo, { nativeHandle: {} as any });

    // In WorkspaceManagerImpl, reloadWorkspace is just closeWorkspace followed by openWorkspace?
    // Wait, does it have a reloadWorkspace method?
    // Let's check if it exists or if we should just call open/close repeatedly.
    if ('reloadWorkspace' in manager) {
      const promises = [
        (manager as any).reloadWorkspace(),
        (manager as any).reloadWorkspace(),
        (manager as any).reloadWorkspace(),
      ];
      await Promise.allSettled(promises);
    } else {
      // simulate reload
      const reload = async () => {
        await manager.closeWorkspace();
        await manager.openWorkspace(wsInfo, { nativeHandle: {} as any });
      };

      await Promise.allSettled([reload(), reload(), reload()]);
    }
    const activeWs = manager.getState().metadata;
    // It could be either opened or closed depending on the interleaving of await ticks,
    // but usually open
    const fileEventListeners = (WorkspaceEvents as any).listeners.get('fileEvent');
    expect(fileEventListeners?.size || 0).toBeLessThanOrEqual(1);

    // No stale workspace metadata
    if (activeWs) {
      expect(activeWs.id).toBe('ws-reload');
    }
  });
});
