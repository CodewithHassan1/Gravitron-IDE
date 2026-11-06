import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceManagerImpl } from '../../src/services/workspace/WorkspaceManager';
import { WorkspaceEvents } from '../../src/services/workspace/WorkspaceEvents';
import { WorkspacePersistence } from '../../src/services/workspace/WorkspacePersistence';

const mockDbStore = new Map<string, any>();

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

describe('Persistence Recovery', () => {
  beforeEach(() => {
    mockDbStore.clear();
    WorkspaceEvents.clearAllListeners();
  });

  it('Reloads identical structure with preserved UUIDs from snapshot', async () => {
    const manager = new WorkspaceManagerImpl();
    await manager.openWorkspace(
      {
        id: 'ws-recovery',
        name: 'Test',
        uri: 'file:///',
        provider: 'memory' as any,
        lastOpened: Date.now(),
        type: 'directory' as any,
        capabilities: {} as any,
      },
      { nativeHandle: {} as any }
    );

    // Setup files
    await manager.createFolder('/src');
    await manager.createFile('/src/index.ts');

    const rootIdBefore = manager.getRoot()?.id;
    const indexIdBefore = (manager as any).vfs.resolve('/src/index.ts');

    expect(rootIdBefore).toBeDefined();
    expect(indexIdBefore).toBeDefined();

    // Take and save snapshot manually
    const persistence = new WorkspacePersistence();
    await (persistence as any).initDB();
    const snapshot = (manager as any).vfs.snapshot();
    const saveSuccess = await persistence.saveSnapshot('ws-recovery', {
      version: 1,
      nodes: snapshot,
    });

    // We expect undefined because saveSnapshot returns void
    expect(saveSuccess).toBeUndefined();

    // Destroy and reload manager
    await manager.closeWorkspace();
    const newManager = new WorkspaceManagerImpl();
    await newManager.openWorkspace(
      {
        id: 'ws-recovery',
        name: 'Test',
        uri: 'file:///',
        provider: 'memory' as any,
        lastOpened: Date.now(),
        type: 'directory' as any,
        capabilities: {} as any,
      },
      { nativeHandle: {} as any }
    );

    const rootIdAfter = newManager.getRoot()?.id;
    const indexIdAfter = (newManager as any).vfs.resolve('/src/index.ts');

    expect(rootIdAfter).toBe(rootIdBefore);
    expect(indexIdAfter).toBe(indexIdBefore);
  });
});
