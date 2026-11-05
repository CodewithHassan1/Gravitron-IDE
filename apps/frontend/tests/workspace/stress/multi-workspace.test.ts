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

describe('Multi-Workspace Test', () => {
  beforeEach(async () => {
    mockDbStore.clear();
    WorkspaceEvents.clearAllListeners();
  });

  afterEach(async () => {
    expect((WorkspaceEvents as any).listeners?.size || 0).toBe(0);
  });

  it('Parallel Workspace Instances', async () => {
    const managerA = new WorkspaceManagerImpl();
    const managerB = new WorkspaceManagerImpl();
    const managerC = new WorkspaceManagerImpl();

    await Promise.all([
      managerA.openWorkspace(
        {
          id: 'ws-a',
          name: 'WS_A',
          uri: 'file:///',
          provider: 'memory' as any,
          lastOpened: Date.now(),
          type: 'directory' as any,
          capabilities: {} as any,
        },
        { nativeHandle: {} as any }
      ),
      managerB.openWorkspace(
        {
          id: 'ws-b',
          name: 'WS_B',
          uri: 'file:///',
          provider: 'memory' as any,
          lastOpened: Date.now(),
          type: 'directory' as any,
          capabilities: {} as any,
        },
        { nativeHandle: {} as any }
      ),
      managerC.openWorkspace(
        {
          id: 'ws-c',
          name: 'WS_C',
          uri: 'file:///',
          provider: 'memory' as any,
          lastOpened: Date.now(),
          type: 'directory' as any,
          capabilities: {} as any,
        },
        { nativeHandle: {} as any }
      ),
    ]);

    await Promise.all([
      managerA.createFile('/file_a.ts'),
      managerB.createFile('/file_b.ts'),
      managerC.createFile('/file_c.ts'),
    ]);

    const vfsA = (managerA as any).vfs;
    const vfsB = (managerB as any).vfs;
    const vfsC = (managerC as any).vfs;

    // Validate no shared VFS state
    expect(vfsA.resolve('/file_a.ts')).toBeDefined();
    expect(vfsA.resolve('/file_b.ts')).toBeNull();

    expect(vfsB.resolve('/file_b.ts')).toBeDefined();
    expect(vfsB.resolve('/file_c.ts')).toBeNull();

    // Separate persistence
    // simulate sync cycles
    await (managerA as any).syncEngine.executeSyncCycle();
    await (managerB as any).syncEngine.executeSyncCycle();
    await (managerC as any).syncEngine.executeSyncCycle();

    const snapA = mockDbStore.get('snapshots:ws-a');
    const snapB = mockDbStore.get('snapshots:ws-b');

    expect(snapA.nodes.find((n: any) => n.name === 'file_a.ts')).toBeDefined();
    expect(snapA.nodes.find((n: any) => n.name === 'file_b.ts')).toBeUndefined();

    expect(snapB.nodes.find((n: any) => n.name === 'file_b.ts')).toBeDefined();
    expect(snapB.nodes.find((n: any) => n.name === 'file_a.ts')).toBeUndefined();

    await managerA.closeWorkspace();
    await managerB.closeWorkspace();
    await managerC.closeWorkspace();
  });

  it('Workspace Switching', async () => {
    let manager = new WorkspaceManagerImpl();

    const RUNS = 100;

    for (let i = 0; i < RUNS; i++) {
      const id = i % 2 === 0 ? 'ws-even' : 'ws-odd';

      await manager.openWorkspace(
        {
          id,
          name: id,
          uri: 'file:///',
          provider: 'memory' as any,
          lastOpened: Date.now(),
          type: 'directory' as any,
          capabilities: {} as any,
        },
        { nativeHandle: {} as any }
      );
      await manager.createFile(`/file_${i}.ts`);

      // We manually clear the event listeners created inside `new WorkspaceSearch(...)` or similar internally
      // Wait, if it leaks listeners, then `closeWorkspace` should remove them.
      // So we just close it.
      await manager.closeWorkspace();

      // Memory cleanup check:
      expect((WorkspaceEvents as any).listeners?.size || 0).toBe(0);

      if ((manager as any).syncEngine) {
        expect((manager as any).syncEngine.queue.size).toBe(0);
        expect((manager as any).syncEngine.state.status).toBe('Idle');
      }
    }
  });

  it('Same Filename Collision', async () => {
    const managerA = new WorkspaceManagerImpl();
    const managerB = new WorkspaceManagerImpl();

    await managerA.openWorkspace(
      {
        id: 'ws-a',
        name: 'WS_A',
        uri: 'file:///',
        provider: 'memory' as any,
        lastOpened: Date.now(),
        type: 'directory' as any,
        capabilities: {} as any,
      },
      { nativeHandle: {} as any }
    );
    await managerB.openWorkspace(
      {
        id: 'ws-b',
        name: 'WS_B',
        uri: 'file:///',
        provider: 'memory' as any,
        lastOpened: Date.now(),
        type: 'directory' as any,
        capabilities: {} as any,
      },
      { nativeHandle: {} as any }
    );

    await managerA.createFolder('/src');
    await managerA.createFile('/src/index.ts');

    await managerB.createFolder('/src');
    await managerB.createFile('/src/index.ts');

    const idA = (managerA as any).vfs.resolve('/src/index.ts');
    const idB = (managerB as any).vfs.resolve('/src/index.ts');

    expect(idA).toBeDefined();
    expect(idB).toBeDefined();
    expect(idA).not.toBe(idB); // Different UUIDs and isolated identity

    await managerA.closeWorkspace();
    await managerB.closeWorkspace();
  });
});
