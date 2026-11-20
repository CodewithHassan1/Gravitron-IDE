import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkspaceManagerImpl } from '../../../src/services/workspace/WorkspaceManager';
import { WorkspaceEvents } from '../../../src/services/workspace/WorkspaceEvents';
import { WorkspaceOperationType } from '../../../src/services/workspace/sync/WorkspaceOperation';

let mockDbStore = new Map<string, any>();
let failNextDbPut = false;

vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn(async (storeName, key) => mockDbStore.get(`${storeName}:${key}`)),
    put: vi.fn(async (storeName, val, key) => {
      if (failNextDbPut) {
        failNextDbPut = false;
        throw new Error('Simulated Sync Error');
      }
      const actualKey = key || val.workspaceId || val.id;
      mockDbStore.set(`${storeName}:${actualKey}`, val);
    }),
    delete: vi.fn(async (storeName, key) => mockDbStore.delete(`${storeName}:${key}`)),
  }),
}));

describe('Sync Queue Massive Stress Test', () => {
  let manager: WorkspaceManagerImpl;

  beforeEach(async () => {
    mockDbStore.clear();
    failNextDbPut = false;
    WorkspaceEvents.clearAllListeners();
    manager = new WorkspaceManagerImpl();
    await manager.openWorkspace(
      {
        id: 'ws-sync',
        name: 'SyncWS',
        uri: 'file:///',
        provider: 'memory' as any,
        lastOpened: Date.now(),
        type: 'directory' as any,
        capabilities: {} as any,
      },
      { nativeHandle: {} as any }
    );
  });

  afterEach(async () => {
    await manager.closeWorkspace();

    expect((WorkspaceEvents as any).listeners?.size || 0).toBe(0);
    if ((manager as any).syncEngine) {
      expect((manager as any).syncEngine.queue.size).toBe(0);
    }
  });

  it('Massive Queue', async () => {
    const OPS_COUNT = 50000;
    const syncEngine = (manager as any).syncEngine;

    // We enqueue directly instead of using manager because manager has vfs bounds that would
    // be extremely slow if we're just testing the sync queue itself.
    // However, the test requirement is to generate 50,000 WorkspaceOperations.
    for (let i = 0; i < OPS_COUNT; i++) {
      syncEngine.enqueueOperation({
        id: `op-${i}`,
        type: WorkspaceOperationType.WriteFile,
        timestamp: Date.now() + i,
        path: `/file_${i}.ts`,
        content: 'content',
      });
    }

    const queuedOps = syncEngine.queue.getOperations();
    expect(queuedOps.length).toBe(OPS_COUNT);

    // Validate ordering preserved
    for (let i = 0; i < OPS_COUNT; i++) {
      expect(queuedOps[i].id).toBe(`op-${i}`);
    }

    // Validate no dropped operations
    expect(queuedOps.length).toBe(OPS_COUNT);

    // Validate no duplicate operation IDs
    const idSet = new Set(queuedOps.map((op: any) => op.id));
    expect(idSet.size).toBe(OPS_COUNT);

    // Complete queue draining
    // executeSyncCycle will drain it
    await syncEngine.executeSyncCycle();

    expect(syncEngine.queue.size).toBe(0);
  }, 60000);
});
