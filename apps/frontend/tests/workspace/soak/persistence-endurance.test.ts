import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkspaceManagerImpl } from '../../../src/services/workspace/WorkspaceManager';
import { WorkspaceEvents } from '../../../src/services/workspace/WorkspaceEvents';
import { WorkspaceSession } from '../../../src/services/workspace/WorkspaceSession';

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

describe('Soak: Persistence Endurance', () => {
  let manager: WorkspaceManagerImpl;

  beforeEach(async () => {
    mockDbStore.clear();
    WorkspaceEvents.clearAllListeners();
    manager = new WorkspaceManagerImpl();
    await manager.openWorkspace(
      {
        id: 'ws-persist',
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
    WorkspaceEvents.clearAllListeners();
  });

  it('preserves snapshot integrity across rapid save/restore cycles', async () => {
    // Stage initial state
    for (let i = 0; i < 50; i++) {
      await manager.createFile(`/persist_${i}.ts`);
    }

    // Simulate 20 rapid snapshot generations and restores
    for (let cycle = 0; cycle < 20; cycle++) {
      await manager.createFile(`/persist_cycle_${cycle}.ts`);

      // Force snapshot
      await (manager as any).syncEngine.executeSyncCycle();

      const currentSessionId = WorkspaceSession.getWorkspaceId();
      expect(currentSessionId).toBe('ws-persist');

      const snapshotRecord = mockDbStore.get(`snapshots:ws-persist`);
      expect(snapshotRecord).toBeDefined();
      expect(snapshotRecord.nodes.length).toBe(50 + cycle + 1 + 1); // 50 initial + 1 for each cycle + 1 root node

      // Close and restore
      await manager.closeWorkspace();

      manager = new WorkspaceManagerImpl();
      await manager.openWorkspace(
        {
          id: 'ws-persist',
          name: 'PersistWS',
          uri: 'file:///',
          provider: 'memory' as any,
          lastOpened: Date.now(),
          type: 'directory' as any,
          capabilities: {} as any,
        },
        { nativeHandle: {} as any }
      );

      // Verification after restore
      const newSyncEngine = (manager as any).syncEngine;
      expect(newSyncEngine.queue.size).toBe(0); // Queue should be drained
    }
  });
});
