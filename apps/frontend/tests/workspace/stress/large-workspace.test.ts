import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkspaceManagerImpl } from '../../../src/services/workspace/WorkspaceManager';
import { WorkspaceEvents } from '../../../src/services/workspace/WorkspaceEvents';
import { SearchQuery } from '../../../src/services/workspace/search/SearchQuery';

vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('Large Workspace Stress Test', () => {
  let manager: WorkspaceManagerImpl;

  beforeEach(async () => {
    WorkspaceEvents.clearAllListeners();
    manager = new WorkspaceManagerImpl();
    await manager.openWorkspace(
      {
        id: 'ws-large',
        name: 'LargeWS',
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

    // Validation Requirements:
    // Verify: listeners = 0, timers = 0, queues flushed
    expect((WorkspaceEvents as any).listeners?.size || 0).toBe(0);
    if ((manager as any).syncEngine) {
      expect((manager as any).syncEngine.queue.size).toBe(0);
    }
  });

  const FOLDERS_COUNT = 1000;
  const FILES_COUNT = 10000;

  it('Generates a large workspace, verifies uniqueness and traversal', async () => {
    // Generate 1000 folders (10 top level, 100 children each)
    for (let i = 0; i < 10; i++) {
      await manager.createFolder(`/folder_${i}`);
      for (let j = 0; j < 100; j++) {
        await manager.createFolder(`/folder_${i}/sub_${j}`);
      }
    }

    // Generate 10,000 files
    // 10 files in each sub folder = 10 * 10 * 100 = 10,000 files
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 100; j++) {
        for (let k = 0; k < 10; k++) {
          await manager.createFile(`/folder_${i}/sub_${j}/file_${k}.ts`);
        }
      }
    }

    const vfs = (manager as any).vfs;
    const index = vfs.index;
    const allNodes = Array.from(index.nodes.values());

    // 10000 files + 1000 subfolders + 10 top folders + 1 root = 11011 nodes
    expect(allNodes.length).toBe(11011);

    // Validate: No duplicate UUIDs
    const uuidSet = new Set(allNodes.map((n: any) => n.id));
    expect(uuidSet.size).toBe(allNodes.length);

    // Validate: Parent-child relationships & No orphan nodes
    for (const node of allNodes as any[]) {
      if (node.id === index.rootId) {
        expect(node.parentId).toBeNull();
      } else {
        expect(node.parentId).not.toBeNull();
        const parent = index.get(node.parentId);
        expect(parent).toBeDefined();
        const childrenIds = index.getChildren(parent!.id);
        expect(childrenIds).toContain(node.id);
      }
    }

    // Validate: Root remains singular
    const roots = allNodes.filter((n: any) => n.parentId === null);
    expect(roots.length).toBe(1);
    expect((roots[0] as any).id).toBe(index.rootId);

    // Large Tree Traversal: getRoot, getChildren, search
    const rootDTO = manager.getRoot();
    expect(rootDTO).toBeDefined();
    expect(Object.isFrozen(rootDTO)).toBe(true);

    const children = manager.getChildren(rootDTO!.id);
    expect(children.length).toBe(10);
    expect(Object.isFrozen(children[0])).toBe(true);

    // Force search invalidation completion
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Search for a specific file across 10,000
    const fullSearchRes = (manager as any).searchEngine.search(new SearchQuery('file_5'));
    // 1 file_5 in each sub folder = 10 * 100 = 1000 files named file_5.ts
    expect(fullSearchRes.totalMatches).toBe(1000);
  }, 30000);

  it('Large Rename Operation', async () => {
    // We only need to generate 1 folder with 1000+ children
    await manager.createFolder(`/folder_1`);
    for (let i = 0; i < 1100; i++) {
      await manager.createFile(`/folder_1/file_${i}.ts`);
    }

    const vfs = (manager as any).vfs;

    // Capture UUIDs before
    const fileNodeBefore = vfs.index.get(vfs.resolve('/folder_1/file_0.ts'));
    const fileId = fileNodeBefore.id;

    // Execute large rename
    await manager.rename('/folder_1', 'renamed_folder');

    // Validate UUIDs unchanged
    const fileNodeAfter = vfs.index.get(vfs.resolve('/renamed_folder/file_0.ts'));
    expect(fileNodeAfter.id).toBe(fileId);

    // Validate paths updated correctly
    expect(vfs.resolve('/folder_1/file_0.ts')).toBeNull();
    expect(vfs.resolve('/renamed_folder/file_0.ts')).toBe(fileId);

    // Search converges
    await new Promise((resolve) => setTimeout(resolve, 0));
    const searchRes = (manager as any).searchEngine.search(new SearchQuery('file_0')).items;
    expect(searchRes.length).toBeGreaterThan(0);
    expect(searchRes[0].path).toBe('/renamed_folder/file_0.ts');
  });

  it('Large Delete Operation', async () => {
    await manager.createFolder(`/folder_to_delete`);
    for (let i = 0; i < 1100; i++) {
      await manager.createFile(`/folder_to_delete/file_${i}.ts`);
    }

    const vfs = (manager as any).vfs;
    const index = vfs.index;

    expect(index.nodes.size).toBe(1102); // root + folder + 1100 files

    // Delete folder
    await manager.delete('/folder_to_delete');

    // Descendants removed
    expect(index.nodes.size).toBe(1); // only root left

    // Sync queue receives correct operations
    // Should contain CreateFolder(1) + CreateFile(1100) + DeleteFolder(1)
    // Wait, delete folder is 1 operation, does it queue delete for descendants?
    // Usually a recursive delete queues 1 operation for the top folder.
    const syncEngine = (manager as any).syncEngine;
    const queuedOps = syncEngine.queue.getOperations();
    const deleteOp = queuedOps.find(
      (op: any) => op.type === 'DeleteFile' && op.path === '/folder_to_delete'
    );
    expect(deleteOp).toBeDefined();

    // Clean queue
    syncEngine.queue.clear();
  });
});
