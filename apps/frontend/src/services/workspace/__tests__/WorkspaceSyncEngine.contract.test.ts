import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkspaceSyncEngine } from '../sync/WorkspaceSyncEngine';
import { VirtualFileSystem } from '../vfs/VirtualFileSystem';
import { WorkspacePersistence } from '../WorkspacePersistence';
import { WorkspaceEvents } from '../WorkspaceEvents';
import { WorkspaceOperationType } from '../sync/WorkspaceOperation';
import { WorkspaceHistory } from '../WorkspaceHistory';

vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('WorkspaceSyncEngine Contract API', () => {
  let vfs: VirtualFileSystem;
  let persistence: WorkspacePersistence;
  let engine: WorkspaceSyncEngine;

  beforeEach(() => {
    vfs = new VirtualFileSystem();
    vfs.initializeRoot('workspace');
    persistence = new WorkspacePersistence();
    const history = new WorkspaceHistory(50);
    engine = new WorkspaceSyncEngine(vfs, persistence, 'test-id', WorkspaceEvents, history);
  });

  describe('start / stop', () => {
    it('transitions states cleanly', () => {
      engine.start({});
      expect(engine.getSyncState().status).toBe('Idle');

      engine.stop();
      expect(engine.getSyncState().status).toBe('Offline');
    });
  });

  describe('enqueueOperation', () => {
    it('queues an operation and updates pending count', () => {
      engine.start({});

      engine.enqueueOperation({
        id: '1',
        type: WorkspaceOperationType.CreateFile,
        timestamp: Date.now(),
        path: '/test.ts',
      });

      expect(engine.getSyncState().pendingOperationsCount).toBe(1);
    });
  });
});
