import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

// Define window for initDB check in WorkspacePersistence BEFORE importing it
if (typeof global !== 'undefined') {
  (global as any).window = {
    agApi: {
      workspace: {
        subscribe: vi.fn(),
        readDirectory: vi.fn().mockResolvedValue([])
      }
    }
  };
}

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
    capabilities: {} as any
  };

  const mockHandle: WorkspaceHandle = {
    nativeHandle: {}
  };

  beforeEach(() => {
    manager = new WorkspaceManagerImpl();
    WorkspaceEvents.clearAllListeners();
    // Provide a default mock for window.agApi to prevent unhandled rejections during test
    (global as any).window = {
      agApi: {
        workspace: {
          subscribe: vi.fn(),
          readDirectory: vi.fn().mockResolvedValue([])
        }
      }
    };
    
    // Mock Persistence to avoid IDB init issues during singleton instantiation
    vi.spyOn((manager as any).persistence, 'getSnapshot').mockResolvedValue(null);
    vi.spyOn((manager as any).persistence, 'saveSnapshot').mockResolvedValue(undefined);
    vi.spyOn((manager as any).persistence, 'getSettings').mockResolvedValue(null);
  });

  afterEach(() => {
    delete (global as any).window;
  });

  describe('openWorkspace', () => {
    it('successfully opens a workspace and emits events', async () => {
      const emitSpy = vi.spyOn(WorkspaceEvents, 'emit');
      await manager.openWorkspace(mockMetadata, mockHandle);
      
      expect(manager.getWorkspaceId()).toBe('test-workspace-id');
      expect(emitSpy).toHaveBeenCalledWith(WorkspaceEventType.WorkspaceOpened, expect.anything());
      expect(emitSpy).toHaveBeenCalledWith(WorkspaceEventType.WorkspaceUpdated, expect.anything());
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
    it('handleExternalCreate does not crash on missing payload (Regression Test)', async () => {
      // Override mock specifically for this test if needed
      (global as any).window.agApi.workspace.readDirectory.mockResolvedValue([
        { name: 'newfile.txt', isFile: true, isDirectory: false }
      ]);

      await manager.openWorkspace(mockMetadata, mockHandle);
      
      // Simulate external create
      // It should NOT throw TypeError: Cannot read properties of undefined (reading 'find')
      // and should successfully resolve.
      await expect(manager.handleExternalCreate('/newfile.txt')).resolves.toBeUndefined();
    });
  });
});
