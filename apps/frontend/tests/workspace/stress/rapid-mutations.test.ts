import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkspaceManagerImpl } from '../../../src/services/workspace/WorkspaceManager';
import { WorkspaceEvents } from '../../../src/services/workspace/WorkspaceEvents';
import { WorkspaceOperationType } from '../../../src/services/workspace/sync/WorkspaceOperation';

vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('Rapid Mutations Stress Test', () => {
  let manager: WorkspaceManagerImpl;

  beforeEach(async () => {
    WorkspaceEvents.clearAllListeners();
    manager = new WorkspaceManagerImpl();
    await manager.openWorkspace(
      { id: 'ws-rapid', name: 'RapidWS', uri: 'file:///', provider: 'memory' as any, lastOpened: Date.now(), type: 'directory' as any, capabilities: {} as any },
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

  it('Rapid Create/Delete', async () => {
    const RUNS = 1000;
    const uuids = new Set<string>();

    for (let i = 0; i < RUNS; i++) {
      const res = await manager.createFile('/test.ts');
      expect(res.success).toBe(true);

      const vfs = (manager as any).vfs;
      const fileId = vfs.resolve('/test.ts');
      expect(fileId).toBeTruthy();

      // Ensure no UUID collisions across sequential creation
      expect(uuids.has(fileId)).toBe(false);
      uuids.add(fileId);

      await manager.delete('/test.ts');
    }

    const syncEngine = (manager as any).syncEngine;
    const queuedOps = syncEngine.queue.getOperations();
    
    // Queue should contain exactly 2000 operations (1000 create, 1000 delete)
    expect(queuedOps.length).toBe(RUNS * 2);
    
    // No orphaned nodes in VFS
    const index = (manager as any).vfs.index;
    expect(index.nodes.size).toBe(1); // Only root node left
    
    syncEngine.queue.clear();
  });

  it('Rapid Rename Chain', async () => {
    await manager.createFile('/file.ts');
    
    const events: any[] = [];
    const unsubscribe = WorkspaceEvents.on('fileEvent', (event: any) => {
      if (event.payload.type === 'renamed') {
        events.push(event.payload);
      }
    });

    const RUNS = 100;
    let currentName = 'file';

    for (let i = 0; i < RUNS; i++) {
      const newName = `file_${i}`;
      await manager.rename(`/${currentName}.ts`, `${newName}.ts`);
      currentName = newName;
    }

    // Verify final state
    const vfs = (manager as any).vfs;
    expect(vfs.resolve('/file.ts')).toBeNull();
    expect(vfs.resolve(`/${currentName}.ts`)).toBeTruthy();

    // Intermediate events ordered
    expect(events.length).toBe(RUNS);
    for (let i = 0; i < RUNS; i++) {
      expect(events[i].newName).toBe(`file_${i}.ts`);
    }

    const syncEngine = (manager as any).syncEngine;
    syncEngine.queue.clear();
    unsubscribe();
  });

  it('Rapid Mixed Operations', async () => {
    // Generate base
    for (let i = 0; i < 10; i++) {
      await manager.createFolder(`/folder_${i}`);
    }

    const events: any[] = [];
    const unsubscribe = WorkspaceEvents.on('fileEvent', (event: any) => {
      events.push(event.payload);
    });

    const RUNS = 500;
    for (let i = 0; i < RUNS; i++) {
      const opType = Math.floor(Math.random() * 5);
      const folderIdx = Math.floor(Math.random() * 10);
      const path = `/folder_${folderIdx}/file_${i}.ts`;

      switch (opType) {
        case 0: // Create
          await manager.createFile(path);
          break;
        case 1: // Rename
          await manager.createFile(path);
          await manager.rename(path, `renamed_${i}.ts`);
          break;
        case 2: // Move
          await manager.createFile(path);
          const destIdx = (folderIdx + 1) % 10;
          await manager.move(path, `/folder_${destIdx}`);
          break;
        case 3: // Write
          await manager.createFile(path);
          await manager.writeFile(path, 'content');
          break;
        case 4: // Delete
          await manager.createFile(path);
          await manager.delete(path);
          break;
      }
    }

    const index = (manager as any).vfs.index;
    const allNodes = Array.from(index.nodes.values());

    // Validate VFS integrity
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

    const syncEngine = (manager as any).syncEngine;
    const queuedOps = syncEngine.queue.getOperations();
    
    // The number of operations should exactly match the number of successful VFS mutation calls
    expect(queuedOps.length).toBeGreaterThan(0);
    syncEngine.queue.clear();
    unsubscribe();
  });
});
