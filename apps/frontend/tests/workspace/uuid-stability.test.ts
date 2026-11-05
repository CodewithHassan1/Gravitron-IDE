import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceManagerImpl } from '../../src/services/workspace/WorkspaceManager';
import { WorkspaceEvents } from '../../src/services/workspace/WorkspaceEvents';
import { WorkspacePersistence } from '../../src/services/workspace/WorkspacePersistence';

vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('UUID Stability', () => {
  let manager: WorkspaceManagerImpl;

  beforeEach(async () => {
    WorkspaceEvents.clearAllListeners();
    manager = new WorkspaceManagerImpl();
    await manager.openWorkspace(
      {
        id: 'ws-uuid',
        name: 'Test',
        uri: 'file:///',
        provider: 'memory' as any,
        lastOpened: Date.now(),
        type: 'directory' as any,
        capabilities: {} as any,
      },
      { nativeHandle: {} as any }
    );
  });

  it('UUID remains identical through rename, move, and parent rename', async () => {
    // 1. Create file and get UUID
    await manager.createFolder('/folderA');
    await manager.createFolder('/folderB');
    await manager.createFile('/folderA/test.ts');

    const fileId = (manager as any).vfs.resolve('/folderA/test.ts');
    expect(fileId).toBeTruthy();

    const node1 = manager.getNode(fileId!);
    expect(node1?.id).toBe(fileId);

    // 2. Rename
    await manager.rename('/folderA/test.ts', 'renamed.ts');
    const node2Id = (manager as any).vfs.resolve('/folderA/renamed.ts');
    expect(node2Id).toBe(fileId);

    // 3. Move
    await manager.move('/folderA/renamed.ts', '/folderB');
    const node3Id = (manager as any).vfs.resolve('/folderB/renamed.ts');
    expect(node3Id).toBe(fileId);

    // 4. Parent rename
    await manager.rename('/folderB', 'folderC');
    const node4Id = (manager as any).vfs.resolve('/folderC/renamed.ts');
    expect(node4Id).toBe(fileId);
  });

  it('UUID remains identical through snapshot restore', async () => {
    await manager.createFile('/persist.ts');
    const fileId = (manager as any).vfs.resolve('/persist.ts');
    expect(fileId).toBeTruthy();

    const snapshot = (manager as any).vfs.snapshot();
    expect(snapshot.length).toBeGreaterThan(0);

    const persistence = new WorkspacePersistence();
    const saveRes = await persistence.saveSnapshot('ws-uuid', snapshot);
    expect(saveRes).toBeUndefined();

    // Simulate reload
    const newManager = new WorkspaceManagerImpl();
    // We inject the snapshot into openDB mock, but since idb is mocked to return null,
    // we can test rehydrate directly on vfs
    (newManager as any).vfs.rehydrate(snapshot);

    const restoredId = (newManager as any).vfs.resolve('/persist.ts');
    expect(restoredId).toBe(fileId);
  });
});
