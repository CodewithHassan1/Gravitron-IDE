import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkspaceManagerImpl } from '../../../src/services/workspace/WorkspaceManager';
import { WorkspaceEvents } from '../../../src/services/workspace/WorkspaceEvents';
import { SyncStateStatus } from '../../../src/services/workspace/sync/WorkspaceSyncState';
import { WorkspaceOperationType } from '../../../src/services/workspace/sync/WorkspaceOperation';

let mockDbStore = new Map<string, any>();
let dbPutDelay = 0;

vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn(async (storeName, key) => mockDbStore.get(`${storeName}:${key}`)),
    put: vi.fn(async (storeName, val, key) => {
      if (dbPutDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, dbPutDelay));
      }
      const actualKey = key || val.workspaceId || val.id;
      mockDbStore.set(`${storeName}:${actualKey}`, val);
    }),
    delete: vi.fn(async (storeName, key) => mockDbStore.delete(`${storeName}:${key}`)),
  }),
}));

describe('Sync Races Test', () => {
  let manager: WorkspaceManagerImpl;

  beforeEach(async () => {
    mockDbStore.clear();
    dbPutDelay = 0;
    WorkspaceEvents.clearAllListeners();
    manager = new WorkspaceManagerImpl();
    await manager.openWorkspace(
      { id: 'ws-sync-race', name: 'SyncRaceWS', uri: 'file:///', provider: 'memory' as any, lastOpened: Date.now(), type: 'directory' as any, capabilities: {} as any },
      { nativeHandle: {} as any }
    );
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

  it('Concurrent Sync Cycles', async () => {
    const syncEngine = (manager as any).syncEngine;
    
    // Add operations to queue
    syncEngine.enqueueOperation({ id: 'op1', type: WorkspaceOperationType.CreateFile, path: '/file1', timestamp: 1 });
    
    dbPutDelay = 50;

    // Call executeSyncCycle multiple times concurrently
    const promises = [
      syncEngine.executeSyncCycle(),
      syncEngine.executeSyncCycle(),
      syncEngine.executeSyncCycle()
    ];

    await Promise.all(promises);

    dbPutDelay = 0;

    // Verify: Single active sync lock
    // Wait, executeSyncCycle doesn't have a lock currently?
    // Let's see if we get duplicate execution or queue corruption
    // If it doesn't have a lock, multiple cycles will run simultaneously.
    // They will all drain the queue (or copy it), then all try to persist.
    // Since we fixed the queue clearing (cancel by ID), they might cancel it correctly, but we'll see if there's duplicate execution.
    // Actually, executeSyncCycle is private. The scheduler calls it.
    // But if we call it directly, we can test the lock.

    expect(syncEngine.queue.size).toBe(0);
    expect(syncEngine.getSyncState().status).toBe(SyncStateStatus.Idle);
  });
});
