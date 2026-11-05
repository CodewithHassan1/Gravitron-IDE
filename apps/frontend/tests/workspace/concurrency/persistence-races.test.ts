import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkspaceManagerImpl } from '../../../src/services/workspace/WorkspaceManager';
import { WorkspaceEvents } from '../../../src/services/workspace/WorkspaceEvents';
import { WorkspacePersistence } from '../../../src/services/workspace/WorkspacePersistence';

let mockDbStore = new Map<string, any>();
let failNextDbPut = false;
let dbPutDelay = 0;
let abortNextDbPut = false;

vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn(async (storeName, key) => mockDbStore.get(`${storeName}:${key}`)),
    put: vi.fn(async (storeName, val, key) => {
      if (failNextDbPut) {
        failNextDbPut = false;
        throw new Error('Rejected Write');
      }
      if (abortNextDbPut) {
        abortNextDbPut = false;
        throw new Error('AbortError');
      }
      if (dbPutDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, dbPutDelay));
      }
      const actualKey = key || val.workspaceId || val.id;
      mockDbStore.set(`${storeName}:${actualKey}`, val);
    }),
    delete: vi.fn(async (storeName, key) => mockDbStore.delete(`${storeName}:${key}`)),
  }),
}));

describe('Persistence Races Test', () => {
  let manager: WorkspaceManagerImpl;

  beforeEach(async () => {
    mockDbStore.clear();
    failNextDbPut = false;
    abortNextDbPut = false;
    dbPutDelay = 0;
    WorkspaceEvents.clearAllListeners();
    manager = new WorkspaceManagerImpl();
    await manager.openWorkspace(
      {
        id: 'ws-persistence',
        name: 'PersistWS',
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

    // Cleanup assertions
    expect((WorkspaceEvents as any).listeners?.size || 0).toBe(0);
    if ((manager as any).syncEngine) {
      expect((manager as any).syncEngine.queue.size).toBe(0);
      const state = (manager as any).syncEngine.state;
      expect(state.status).toBe('Idle');
    }
  });

  it('Overlapping Saves', async () => {
    const persistence = (manager as any).persistence as WorkspacePersistence;

    // Simulate: save(snapshot A), modify, save(B), save(C) without awaiting
    const vfs = (manager as any).vfs;

    // Generate snapshot A
    await manager.createFile('/fileA.ts');
    const snapA = { version: 1, timestamp: 1, nodes: vfs.snapshot() };

    // modify
    await manager.createFile('/fileB.ts');
    const snapB = { version: 1, timestamp: 2, nodes: vfs.snapshot() };

    // modify
    await manager.createFile('/fileC.ts');
    const snapC = { version: 1, timestamp: 3, nodes: vfs.snapshot() };

    // Fire without awaiting in reverse order of intended completion or overlapping
    // By adding a delay we can make them resolve out of order if there's no lock,
    // WorkspacePersistence.saveSnapshot uses a mutex lock to guarantee ordered execution!
    const promises = [
      persistence.saveSnapshot('ws-persistence', snapA),
      persistence.saveSnapshot('ws-persistence', snapB),
      persistence.saveSnapshot('ws-persistence', snapC),
    ];

    await Promise.all(promises);

    // Verify Latest snapshot wins, version ordering preserved
    const finalSnapshot = await persistence.getSnapshot('ws-persistence');
    expect(finalSnapshot).toBeDefined();

    // Should be snapC
    const fileA = finalSnapshot!.nodes.find((n: any) => n.name === 'fileA.ts');
    const fileB = finalSnapshot!.nodes.find((n: any) => n.name === 'fileB.ts');
    const fileC = finalSnapshot!.nodes.find((n: any) => n.name === 'fileC.ts');

    expect(fileA).toBeDefined();
    expect(fileB).toBeDefined();
    expect(fileC).toBeDefined();

    // Empty queue
    await (manager as any).syncEngine.executeSyncCycle();
  });

  it('Transaction Failures and Recovery', async () => {
    const syncEngine = (manager as any).syncEngine;

    // Inject aborted transaction
    await manager.createFile('/file1.ts');
    abortNextDbPut = true;

    await syncEngine.executeSyncCycle();

    expect(syncEngine.getSyncState().status).toBe('Failed');
    // Queue remains valid
    expect(syncEngine.queue.size).toBe(1);

    // Inject delayed transaction
    dbPutDelay = 50;
    // executeSyncCycle will run but take 50ms
    const syncPromise = syncEngine.executeSyncCycle();

    // Meanwhile, try to enqueue another operation
    await manager.createFile('/file2.ts');

    await syncPromise;
    dbPutDelay = 0;

    expect(syncEngine.getSyncState().status).toBe('Idle');

    // Now queue has file2
    expect(syncEngine.queue.size).toBe(1);

    // Inject rejected write
    failNextDbPut = true;
    await syncEngine.executeSyncCycle();

    expect(syncEngine.getSyncState().status).toBe('Failed');
    expect(syncEngine.queue.size).toBe(1); // queue valid

    // Final successful recovery
    await syncEngine.executeSyncCycle();
    expect(syncEngine.getSyncState().status).toBe('Idle');
    expect(syncEngine.queue.size).toBe(0);
  });
});
