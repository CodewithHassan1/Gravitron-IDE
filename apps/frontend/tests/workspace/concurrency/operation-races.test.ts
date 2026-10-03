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

describe('Operation Races Test', () => {
  let manager: WorkspaceManagerImpl;

  beforeEach(async () => {
    mockDbStore.clear();
    WorkspaceEvents.clearAllListeners();
    manager = new WorkspaceManagerImpl();
    await manager.openWorkspace(
      { id: 'ws-races', name: 'RacesWS', uri: 'file:///', provider: 'memory' as any, lastOpened: Date.now(), type: 'directory' as any, capabilities: {} as any },
      { nativeHandle: {} as any }
    );
  });

  afterEach(async () => {
    await manager.closeWorkspace();
    
    // Required Cleanup assertions
    expect((WorkspaceEvents as any).listeners?.size || 0).toBe(0);
    // VFS active timers? Workspace sync engine doesn't have active timers except debounce which is cleared on close
    if ((manager as any).syncEngine) {
      expect((manager as any).syncEngine.queue.size).toBe(0);
      const state = (manager as any).syncEngine.state;
      expect(state.status).toBe('Idle');
    }
  });

  it('Concurrent Rename', async () => {
    await manager.createFile('/file.ts');
    
    const vfs = (manager as any).vfs;
    const originalNode = vfs.index.get(vfs.resolve('/file.ts'));
    const fileId = originalNode.id;

    // Execute rename(file,A), rename(file,B), rename(file,C) simultaneously
    // Depending on execution order, one will succeed on /file.ts, others might fail or apply to renamed
    // Because path resolution is synchronous in VirtualFileSystem, the first one resolves and renames.
    // The subsequent ones will fail because '/file.ts' no longer exists.
    const promises = [
      manager.rename('/file.ts', 'A.ts'),
      manager.rename('/file.ts', 'B.ts'),
      manager.rename('/file.ts', 'C.ts')
    ];

    const results = await Promise.all(promises);

    // Verify Final state deterministic
    const successes = results.filter(r => r.success);
    const failures = results.filter(r => !r.success);

    // Expected: 1 success, 2 failures
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(2);

    // Verify UUID unchanged
    const allNodes = Array.from(vfs.index.nodes.values() as Iterable<any>);
    const files = allNodes.filter((n: any) => n.type === 'file');
    expect(files.length).toBe(1);
    expect(files[0].id).toBe(fileId);

    // Verify No corrupted path
    const resolvedPath = vfs.getPath(fileId);
    expect(['/A.ts', '/B.ts', '/C.ts']).toContain(resolvedPath);
    
    // Check queue
    await (manager as any).syncEngine.executeSyncCycle();
  });

  it('Concurrent Move', async () => {
    await manager.createFile('/file.ts');
    await manager.createFolder('/folder_a');
    await manager.createFolder('/folder_b');
    await manager.createFolder('/folder_c');
    
    const vfs = (manager as any).vfs;
    const originalNode = vfs.index.get(vfs.resolve('/file.ts'));
    const fileId = originalNode.id;

    // Move the same file into multiple folders simultaneously
    const promises = [
      manager.move('/file.ts', '/folder_a'),
      manager.move('/file.ts', '/folder_b'),
      manager.move('/file.ts', '/folder_c')
    ];

    const results = await Promise.all(promises);

    const successes = results.filter(r => r.success);
    const failures = results.filter(r => !r.success);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(2);

    // Verify: File has exactly one parent
    const fileNode = vfs.index.get(fileId);
    expect(fileNode.parentId).not.toBeNull();
    
    // Parent references remain valid
    const parentNode = vfs.index.get(fileNode.parentId);
    expect(parentNode).toBeDefined();
    
    const childrenIds = vfs.index.getChildren(parentNode.id);
    expect(childrenIds).toContain(fileId);

    // No orphan nodes
    const otherFolders = ['/folder_a', '/folder_b', '/folder_c'].filter(p => vfs.resolve(p) !== fileNode.parentId);
    for (const f of otherFolders) {
      const fNodeId = vfs.resolve(f);
      const fChildren = vfs.index.getChildren(fNodeId);
      expect(fChildren).not.toContain(fileId);
    }
    
    // Check queue
    await (manager as any).syncEngine.executeSyncCycle();
  });

  it('Concurrent Delete + Read', async () => {
    await manager.createFile('/file.ts');
    await manager.writeFile('/file.ts', 'hello');

    const vfs = (manager as any).vfs;
    const fileId = vfs.resolve('/file.ts');

    // Run delete(file) and readFile(file) simultaneously
    const promises = [
      manager.delete('/file.ts'),
      manager.readFile('/file.ts')
    ];

    const results = await Promise.allSettled(promises);

    // Verify: No crashes
    // Correct error handling
    const deleteResult = results[0];
    const readResult = results[1];
    
    expect(deleteResult.status).toBe('fulfilled');
    expect((deleteResult as any).value.success).toBe(true);
    
    // Read might succeed or fail depending on sync resolution, but it shouldn't crash
    if (readResult.status === 'rejected') {
      expect(readResult.reason).toBeDefined();
    }

    // Verify: No ghost nodes
    expect(vfs.resolve('/file.ts')).toBeNull();
    expect(vfs.index.get(fileId)).toBeUndefined();
    
    // Check queue
    await (manager as any).syncEngine.executeSyncCycle();
  });
});
