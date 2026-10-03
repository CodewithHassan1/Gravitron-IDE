import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceManagerImpl } from '../../src/services/workspace/WorkspaceManager';
import { WorkspaceEvents } from '../../src/services/workspace/WorkspaceEvents';
import { WorkspaceOperationType, WorkspaceOperation } from '../../src/services/workspace/sync/WorkspaceOperation';

vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('Sync Engine', () => {
  let manager: WorkspaceManagerImpl;

  beforeEach(async () => {
    WorkspaceEvents.clearAllListeners();
    manager = new WorkspaceManagerImpl();
    await manager.openWorkspace(
      { id: 'ws-sync', name: 'Test', uri: 'file:///', provider: 'memory' as any, lastOpened: Date.now(), type: 'directory' as any, capabilities: {} as any },
      { nativeHandle: {} as any }
    );
  });

  it('File operations return FileOperationResult without operationId', async () => {
    const res = await manager.createFile('/sync.ts');
    expect(res.success).toBe(true);
    expect((res as any).operationId).toBeUndefined();

    // VFS update
    const fileId = (manager as any).vfs.resolve('/sync.ts');
    expect(fileId).toBeTruthy();
  });

  it('Failed operations handling', async () => {
    const syncEngine = (manager as any).syncEngine;
    
    // Add a failed operation manually to test its recovery
    // WorkspacePersistence will throw
    const persistenceSpy = vi.spyOn((manager as any).persistence, 'saveSnapshot').mockRejectedValue(new Error('Sync failed'));

    // To simulate sync failure, we must enqueue manually now that mutations skip the sync queue
    syncEngine.enqueueOperation({ id: 'test-op', type: WorkspaceOperationType.WriteFile, timestamp: Date.now(), path: '/fail.txt', content: 'test' });
    
    await (syncEngine as any).executeSyncCycle();

    // The SyncEngine catches the error and transitions state to Failed
    const state = syncEngine.getSyncState();
    expect(state.status).toBe('Failed');
    expect(state.error).toBeDefined();
    
    persistenceSpy.mockRestore();
  });
});

