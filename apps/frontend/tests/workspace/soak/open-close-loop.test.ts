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

describe('Soak: Open/Close Loop', () => {
  let manager: WorkspaceManagerImpl;

  beforeEach(() => {
    mockDbStore.clear();
    WorkspaceEvents.clearAllListeners();
    manager = new WorkspaceManagerImpl();
  });

  afterEach(async () => {
    await manager.closeWorkspace();
    WorkspaceEvents.clearAllListeners();
  });

  it('runs 100 open/close cycles without listener or memory leaks', async () => {
    const wsInfo = { id: 'ws-soak', name: 'SoakWS', uri: 'file:///', provider: 'memory' as any, lastOpened: Date.now(), type: 'directory' as any, capabilities: {} as any };

    for (let i = 0; i < 100; i++) {
      await manager.openWorkspace(wsInfo, { nativeHandle: {} as any });
      await manager.closeWorkspace();
      
      // Memory Check per loop (Ensure no listener leaks)
      const listeners = (WorkspaceEvents as any).listeners;
      let totalListeners = 0;
      for (const callbacks of listeners.values()) {
        totalListeners += callbacks.size;
      }
      // After close, there should be zero active listeners from Workspace components
      expect(totalListeners).toBe(0);
      
      if ((manager as any).syncEngine) {
        throw new Error('Sync engine failed to dispose');
      }
    }
  });
});
