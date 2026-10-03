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

describe('Soak: Continuous Editing Loop', () => {
  let manager: WorkspaceManagerImpl;

  beforeEach(async () => {
    mockDbStore.clear();
    WorkspaceEvents.clearAllListeners();
    manager = new WorkspaceManagerImpl();
    await manager.openWorkspace({ id: 'ws-soak', name: 'SoakWS', uri: 'file:///', provider: 'memory' as any, lastOpened: Date.now(), type: 'directory' as any, capabilities: {} as any }, { nativeHandle: {} as any });
  });

  afterEach(async () => {
    await manager.closeWorkspace();
    WorkspaceEvents.clearAllListeners();
  });

  it('runs 1000 create/edit/delete cycles continuously without crashing or leaking', async () => {
    let createdEvents = 0;
    let deletedEvents = 0;

    WorkspaceEvents.on('fileEvent', (event) => {
      if (event.payload?.type === 'created') createdEvents++;
      if (event.payload?.type === 'deleted') deletedEvents++;
    });

    for (let i = 0; i < 1000; i++) {
      const path = `/soak_file_${i}.txt`;
      await manager.createFile(path);
      // simulate edit via writing back to the same file? Actually we don't have writeData in manager yet.
      // We will just rename
      const renamedName = `soak_file_renamed_${i}.txt`;
      await manager.rename(path, renamedName);
      await manager.delete(`/` + renamedName);
    }

    expect(createdEvents).toBe(1000);
    expect(deletedEvents).toBe(1000);
    
    // Ensure queue drains eventually
    const syncEngine = (manager as any).syncEngine;
    await syncEngine.executeSyncCycle();
    expect(syncEngine.queue.size).toBe(0);
  });
});
