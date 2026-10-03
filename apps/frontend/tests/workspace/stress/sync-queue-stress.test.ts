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

describe('Sync Queue Stress Test', () => {
  let manager: WorkspaceManagerImpl;

  beforeEach(async () => {
    mockDbStore.clear();
    failNextDbPut = false;
    WorkspaceEvents.clearAllListeners();
    manager = new WorkspaceManagerImpl();
    await manager.openWorkspace(
      { id: 'ws-sync', name: 'SyncWS', uri: 'file:///', provider: 'memory' as any, lastOpened: Date.now(), type: 'directory' as any, capabilities: {} as any },
      { nativeHandle: {} as any }
    );
  });

  afterEach(async () => {
    await manager.closeWorkspace();
    
    // Validation Requirements:
    // Verify: listeners = 0, timers = 0, queues flushed
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
        content: 'content'
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

  it('Debounce Stress', async () => {
    const syncEngine = (manager as any).syncEngine;
    let executionCycles = 0;

    // Spy on executeSyncCycle
    const originalExecute = syncEngine.executeSyncCycle.bind(syncEngine);
    vi.spyOn(syncEngine, 'executeSyncCycle').mockImplementation(async () => {
      executionCycles++;
      return originalExecute();
    });

    const OPS_COUNT = 1000;

    // Rapid mutations within milliseconds
    // Since javascript is single threaded, this synchronous loop represents 
    // operations queued within the same event loop tick / microtask.
    for (let i = 0; i < OPS_COUNT; i++) {
      manager.createFile(`/debounce_test_${i}.ts`); // Do not await to let them queue instantly
    }

    // Wait for debounce timeout
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Validations: scheduler correctly batches operations
    // With a 2s debounce, 1000 operations dispatched instantly should result in 
    // EXACTLY ONE sync cycle execution.
    expect(executionCycles).toBe(1);
    expect(syncEngine.queue.size).toBe(0); // queue drained
  });

  it('Failed Sync Recovery', async () => {
    const syncEngine = (manager as any).syncEngine;
    
    // Queue an operation
    await manager.createFile('/recoverable.ts');

    // Inject failure
    failNextDbPut = true;

    await syncEngine.executeSyncCycle();

    // Verify state
    const state = syncEngine.getSyncState();
    expect(state.status).toBe('Failed');
    expect((state.error as Error).message).toBe('Simulated Sync Error');

    // Failed operations remain recoverable (queue state remains valid)
    expect(syncEngine.queue.size).toBe(1);

    // Retry succeeds
    failNextDbPut = false;
    await syncEngine.executeSyncCycle();

    const stateAfter = syncEngine.getSyncState();
    expect(stateAfter.status).toBe('Idle');
    expect(syncEngine.queue.size).toBe(0);
  });
});
