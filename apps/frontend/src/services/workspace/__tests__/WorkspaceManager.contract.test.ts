import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

import { WorkspaceManagerImpl } from '../WorkspaceManager';
import { WorkspaceEvents } from '../WorkspaceEvents';
import { WorkspaceMetadata, WorkspaceHandle, WorkspaceEventType } from '../types';

describe('WorkspaceManager Contract API', () => {
  let manager: WorkspaceManagerImpl;

  const mockMetadata: WorkspaceMetadata = {
    id: 'test-workspace-id',
    name: 'test-workspace',
    uri: 'file:///test',
    provider: 'memory',
    lastOpened: Date.now(),
    type: 'directory' as any,
    capabilities: {} as any,
  };

  const mockHandle: WorkspaceHandle = {
    nativeHandle: {},
  };

  beforeEach(() => {
    manager = new WorkspaceManagerImpl();
    WorkspaceEvents.clearAllListeners();

    // Mock Persistence to avoid IDB init issues during singleton instantiation
    vi.spyOn((manager as any).persistence, 'getSnapshot').mockResolvedValue(null);
    vi.spyOn((manager as any).persistence, 'saveSnapshot').mockResolvedValue(undefined);
    vi.spyOn((manager as any).persistence, 'getSettings').mockResolvedValue(null);
  });

  describe('openWorkspace', () => {
    it('successfully opens a workspace and emits events', async () => {
      const emitSpy = vi.spyOn(WorkspaceEvents, 'emit');
      await manager.openWorkspace(mockMetadata, mockHandle);

      expect(manager.getWorkspaceId()).toBe('test-workspace-id');
      expect(emitSpy).toHaveBeenCalledWith(WorkspaceEventType.WorkspaceOpened, expect.anything());
      expect(emitSpy).toHaveBeenCalledWith(WorkspaceEventType.WorkspaceUpdated, undefined);
    });
  });

  describe('closeWorkspace', () => {
    it('clears active workspace and cleans up engines', async () => {
      await manager.openWorkspace(mockMetadata, mockHandle);
      await manager.closeWorkspace();

      expect(manager.getWorkspaceId()).toBeNull();
      expect(manager.getSearchEngine()).toBeNull();
    });
  });

  describe('VFS Access Methods (Immutable)', () => {
    it('returns deep clones to prevent internal mutation', async () => {
      await manager.openWorkspace(mockMetadata, mockHandle);

      const root = manager.getRoot();
      expect(root).toBeDefined();

      // Attempt to mutate the returned object
      if (root) {
        expect(() => {
          (root as any).name = 'mutated';
        }).toThrow(TypeError);
      }

      const newRoot = manager.getRoot();
      expect(newRoot?.name).not.toBe('mutated'); // Must remain clean
    });
  });

  describe('File Mutations', () => {
    it('queues create/delete operations via SyncEngine without exposing VFS directly', async () => {
      await manager.openWorkspace(mockMetadata, mockHandle);

      await manager.createFile('/src/index.ts');

      // Since it's batched asynchronously, we just assert no throw occurs and telemetry tracks
      expect(manager.telemetry.operationTimingsMs.length).toBeGreaterThan(0);
    });
  });

  describe('External Watcher Events', () => {
    let originalWindow: any;
    let windowExisted = false;

    beforeEach(() => {
      windowExisted = typeof global !== 'undefined' && 'window' in global;
      originalWindow = (global as any).window;
      (global as any).window = {
        agApi: {
          workspace: {
            subscribe: vi.fn(),
            readDirectory: vi.fn().mockResolvedValue([
              { name: 'newfile.txt', isFile: true, isDirectory: false },
            ]),
          },
        },
      };
    });

    afterEach(() => {
      if (windowExisted) {
        (global as any).window = originalWindow;
      } else {
        delete (global as any).window;
      }
    });

    it('handleExternalCreate does not crash on missing payload (Regression Test)', async () => {
      await manager.openWorkspace(mockMetadata, mockHandle);

      // Simulate external create
      // It should NOT throw TypeError: Cannot read properties of undefined (reading 'find')
      // and should successfully resolve.
      await expect(manager.handleExternalCreate('/newfile.txt')).resolves.toBeUndefined();
    });
  });

  describe('VFS Index Lifecycle Contract (Regression Gate C.2)', () => {
    it('preserves valid TreeIndex contract and remains usable after closeWorkspace', async () => {
      await manager.openWorkspace(mockMetadata, mockHandle);
      expect(manager.getRoot()).toBeDefined();

      await manager.closeWorkspace();

      // After close, getRoot() should safely return undefined (no crash)
      expect(manager.getRoot()).toBeUndefined();

      // VFS find/getChildren should safely return empty/undefined without TypeError: this.index.get is not a function
      expect(manager.getChildren('non-existent-id')).toEqual([]);

      // Reopening workspace should succeed and leave VFS completely functional
      await manager.openWorkspace(mockMetadata, mockHandle);
      const reopenedRoot = manager.getRoot();
      expect(reopenedRoot).toBeDefined();
      expect(reopenedRoot?.name).toBe('test-workspace');

      // File creation should succeed on reopened workspace
      const res = await manager.createFile('/test.txt');
      expect(res.success).toBe(true);
    });
  });

  describe('Lifecycle Rejection and Rollback (Regression Gate C.2)', () => {
    it('propagates initialization failure to caller and rolls back cleanly without leaving broken state', async () => {
      // Force an initialization failure in persistence.getSnapshot
      vi.spyOn((manager as any).persistence, 'getSnapshot').mockRejectedValueOnce(
        new Error('Simulated persistence failure')
      );

      // Caller should receive the rejected error
      await expect(manager.openWorkspace(mockMetadata, mockHandle)).rejects.toThrow(
        'Simulated persistence failure'
      );

      // Manager should be rolled back to Error/Empty state, engines cleaned up
      expect(manager.getWorkspaceId()).toBeNull();
      expect((manager as any).syncEngine).toBeNull();
      expect(manager.getSearchEngine()).toBeNull();
      expect(manager.getRoot()).toBeUndefined();

      // Subsequent openWorkspace should succeed once underlying failure is resolved
      vi.spyOn((manager as any).persistence, 'getSnapshot').mockResolvedValue(null);
      await expect(manager.openWorkspace(mockMetadata, mockHandle)).resolves.toBeUndefined();
      expect(manager.getWorkspaceId()).toBe('test-workspace-id');
      expect(manager.getRoot()).toBeDefined();
    });
  });
});
