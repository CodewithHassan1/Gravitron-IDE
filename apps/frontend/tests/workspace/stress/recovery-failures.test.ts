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

describe('Recovery Failures Test', () => {
  let manager: WorkspaceManagerImpl;

  beforeEach(async () => {
    mockDbStore.clear();
    WorkspaceEvents.clearAllListeners();
    manager = new WorkspaceManagerImpl();
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

  it('Corrupted Snapshot Recovery', async () => {
    // Provide invalid snapshot (missing nodes, broken references)
    const badSnapshot = {
      workspaceId: 'ws-corrupt',
      version: 1,
      nodes: [
        { id: 'broken1', type: 'file', parentId: 'missing-parent', name: 'ghost.ts' },
        // completely malformed node
        { id: 'broken2', type: 'unknown_type' },
      ],
    };

    mockDbStore.set('snapshots:ws-corrupt', badSnapshot);

    // Should not crash IDE
    await expect(
      manager.openWorkspace(
        {
          id: 'ws-corrupt',
          name: 'CorruptWS',
          uri: 'file:///',
          provider: 'memory' as any,
          lastOpened: Date.now(),
          type: 'directory' as any,
          capabilities: {} as any,
        },
        { nativeHandle: {} as any }
      )
    ).resolves.not.toThrow();

    // VFS should gracefully reject the corrupt data or fallback to empty root
    const vfs = (manager as any).vfs;
    const index = vfs.index;

    // Usually it resets to a clean root
    expect(index.rootId).toBeDefined();
    expect(index.nodes.size).toBeGreaterThanOrEqual(1);

    const root = manager.getRoot();
    expect(root).toBeDefined();
  });

  it('Missing Root Recovery', async () => {
    // Remove root node from snapshot
    const missingRootSnapshot = {
      workspaceId: 'ws-no-root',
      version: 1,
      nodes: [{ id: 'file1', type: 'file', parentId: 'non-existent-root', name: 'alone.ts' }],
    };

    mockDbStore.set('snapshots:ws-no-root', missingRootSnapshot);

    await expect(
      manager.openWorkspace(
        {
          id: 'ws-no-root',
          name: 'NoRootWS',
          uri: 'file:///',
          provider: 'memory' as any,
          lastOpened: Date.now(),
          type: 'directory' as any,
          capabilities: {} as any,
        },
        { nativeHandle: {} as any }
      )
    ).resolves.not.toThrow();

    const root = manager.getRoot();
    expect(root).toBeDefined(); // Engine reconstructs or safely rejects
  });

  it('Out-of-order Events', async () => {
    await manager.openWorkspace(
      {
        id: 'ws-events',
        name: 'EventsWS',
        uri: 'file:///',
        provider: 'memory' as any,
        lastOpened: Date.now(),
        type: 'directory' as any,
        capabilities: {} as any,
      },
      { nativeHandle: {} as any }
    );

    const vfs = (manager as any).vfs;

    // Rename before create
    expect(() => vfs.rename('/ghost.ts', 'ghost2.ts')).toThrow();

    // Delete before create
    expect(() => vfs.delete('/ghost.ts')).not.toThrow(); // Delete is idempotent/silent on missing

    // Ensure state machine prevents corruption
    expect(vfs.index.nodes.size).toBe(1); // Only root
  });

  it('Duplicate Events', async () => {
    await manager.openWorkspace(
      {
        id: 'ws-duplicate',
        name: 'DupWS',
        uri: 'file:///',
        provider: 'memory' as any,
        lastOpened: Date.now(),
        type: 'directory' as any,
        capabilities: {} as any,
      },
      { nativeHandle: {} as any }
    );

    await manager.createFile('/dup.ts');

    const vfs = (manager as any).vfs;

    // Emit same create event twice (simulate double call)
    expect(() => vfs.createFile('/dup.ts')).toThrow(/already exists/);

    // Emit same rename twice
    await manager.rename('/dup.ts', 'renamed.ts');
    expect(() => vfs.rename('/dup.ts', 'renamed2.ts')).toThrow(/not found/);

    // Emit same delete twice
    await manager.delete('/renamed.ts');
    expect(() => vfs.delete('/renamed.ts')).not.toThrow(); // Safe

    // Consumers remain idempotent
    expect(vfs.index.nodes.size).toBe(1); // Root
  });
});
