import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkspaceManagerImpl } from '../../../src/services/workspace/WorkspaceManager';
import { WorkspaceEvents } from '../../../src/services/workspace/WorkspaceEvents';
import { WorkspacePersistence } from '../../../src/services/workspace/WorkspacePersistence';

let mockDbStore = new Map<string, any>();
let failNextDbPut = false;

vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn(async (storeName, key) => mockDbStore.get(`${storeName}:${key}`)),
    put: vi.fn(async (storeName, val, key) => {
      if (failNextDbPut) {
        failNextDbPut = false;
        throw new Error('Simulated QuotaExceededError or AbortError');
      }
      const actualKey = key || val.workspaceId || val.id;
      mockDbStore.set(`${storeName}:${actualKey}`, val);
    }),
    delete: vi.fn(async (storeName, key) => mockDbStore.delete(`${storeName}:${key}`)),
    transaction: vi.fn().mockReturnValue({
      objectStore: vi.fn().mockReturnValue({
        delete: vi.fn(async (key) => mockDbStore.delete(key))
      })
    })
  }),
}));

describe('Persistence Stress Test', () => {
  let manager: WorkspaceManagerImpl;

  beforeEach(async () => {
    mockDbStore.clear();
    failNextDbPut = false;
    WorkspaceEvents.clearAllListeners();
    manager = new WorkspaceManagerImpl();
    await manager.openWorkspace(
      { id: 'ws-persistence', name: 'PersistenceWS', uri: 'file:///', provider: 'memory' as any, lastOpened: Date.now(), type: 'directory' as any, capabilities: {} as any },
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

  it('Repeated Snapshot Saves', async () => {
    const RUNS = 1000;
    const persistence = (manager as any).persistence as WorkspacePersistence;

    for (let i = 0; i < RUNS; i++) {
      await manager.createFile(`/file_${i}.ts`);
      
      const vfs = (manager as any).vfs;
      const snapshot = { version: 1, nodes: vfs.snapshot() };
      
      // Save snapshot
      await persistence.saveSnapshot('ws-persistence', snapshot);
    }

    // Verify latest version wins and restore works
    const restoredSnapshot = await persistence.getSnapshot('ws-persistence');
    expect(restoredSnapshot).toBeDefined();
    // 1000 files + 1 root = 1001 nodes
    expect(restoredSnapshot!.nodes.length).toBe(1001);
    
    const lastFileNode = restoredSnapshot!.nodes.find((n: any) => n.name === `file_${RUNS - 1}.ts`);
    expect(lastFileNode).toBeDefined();
  });

  it('Large Snapshot Restore', async () => {
    // Generate 10,000 node workspace
    const FOLDER_COUNT = 100;
    const FILES_PER_FOLDER = 99; // 100*99 = 9900 files. 100 folders. 1 root. Total 10001 nodes
    
    for (let i = 0; i < FOLDER_COUNT; i++) {
      await manager.createFolder(`/folder_${i}`);
      for (let j = 0; j < FILES_PER_FOLDER; j++) {
        await manager.createFile(`/folder_${i}/file_${j}.ts`);
      }
    }

    const vfsBefore = (manager as any).vfs;
    const indexBefore = vfsBefore.index;
    const uuidSetBefore = new Set(Array.from(indexBefore.nodes.values() as Iterable<any>).map((n: any) => n.id));

    const persistence = (manager as any).persistence as WorkspacePersistence;
    const snapshot = { version: 1, nodes: vfsBefore.snapshot() };
    await persistence.saveSnapshot('ws-large-snap', snapshot);

    // Destroy and reload manager
    await manager.closeWorkspace();
    
    const newManager = new WorkspaceManagerImpl();
    await newManager.openWorkspace(
      { id: 'ws-large-snap', name: 'PersistenceWS', uri: 'file:///', provider: 'memory' as any, lastOpened: Date.now(), type: 'directory' as any, capabilities: {} as any },
      { nativeHandle: {} as any }
    );

    const vfsAfter = (newManager as any).vfs;
    const indexAfter = vfsAfter.index;
    
    expect(indexAfter.nodes.size).toBe(indexBefore.nodes.size);

    const uuidSetAfter = new Set(Array.from(indexAfter.nodes.values() as Iterable<any>).map((n: any) => n.id));
    
    expect(uuidSetBefore).toEqual(uuidSetAfter);

    await newManager.closeWorkspace();
    // We re-assigned manager so the afterEach works correctly on the latest manager reference
    manager = newManager;
  });

  it('Persistence Failure Injection', async () => {
    const persistence = (manager as any).persistence as WorkspacePersistence;
    const syncEngine = (manager as any).syncEngine;
    
    // Create some data
    await manager.createFile('/important.ts');

    // Trigger sync cycle which calls saveSnapshot
    // We mock saveSnapshot or the underlying db
    // Since we mock db in this file via idb mock, we can just set a flag to fail the next put
    failNextDbPut = true;

    // Simulate the sync cycle which catches errors
    await (syncEngine as any).executeSyncCycle();

    // The SyncEngine should catch the persistence error and not crash the IDE
    const state = syncEngine.getSyncState();
    expect(state.status).toBe('Failed');
    expect(state.error).toBeDefined();

    // Retry possible (second cycle should succeed if fail flag is cleared, which it is)
    // Add another op to trigger queue
    await manager.createFile('/retry.ts');
    await (syncEngine as any).executeSyncCycle();

    const stateAfter = syncEngine.getSyncState();
    expect(stateAfter.status).toBe('Idle');
    
    // Verify that data was eventually saved
    const savedSnapshot = await persistence.getSnapshot('ws-persistence');
    expect(savedSnapshot).toBeDefined();
    expect(savedSnapshot!.nodes.find((n: any) => n.name === 'retry.ts')).toBeDefined();
  });
});
