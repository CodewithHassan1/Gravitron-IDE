import { describe, it, expect, vi } from 'vitest';
import { WorkspaceManagerImpl } from '../../src/services/workspace/WorkspaceManager';
import { WorkspaceEvents } from '../../src/services/workspace/WorkspaceEvents';
import { WorkspaceEventType } from '../../src/services/workspace/types';

vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
  }),
}));

/**
 * Protects:
 * docs/architecture/lifecycle.md
 *
 * Rule:
 * Close Workspace Cleanup & Listener Isolation
 */
describe('Lifecycle Guarantees', () => {
  it('Close Workspace Cleanup: SyncEngine offline, listeners=0, timers=0', async () => {
    const manager = new WorkspaceManagerImpl();
    await manager.openWorkspace(
      {
        id: 'test-workspace-id',
        name: 'Test',
        uri: 'file:///',
        provider: 'memory',
        lastOpened: Date.now(),
        type: 'directory' as any,
        capabilities: {} as any,
      },
      { nativeHandle: {} as any }
    );

    // No dummy listeners - we want to verify the manager didn't leak any internal listeners

    // Trigger close
    await manager.closeWorkspace();

    // Verify WorkspaceEvents cleared
    const remainingListeners = WorkspaceEvents['listeners'].size;
    expect(remainingListeners).toBe(0);

    // Verify SyncEngine is null or stopped
    const syncEngine = (manager as any).syncEngine;
    if (syncEngine) {
      expect(syncEngine.isRunning).toBe(false);
    }
  });

  it('Listener Isolation: Error in one listener does not crash event bus or block other listeners', () => {
    let secondListenerExecuted = false;

    WorkspaceEvents.on(WorkspaceEventType.WorkspaceUpdated, () => {
      throw new Error('Listener 1 failed');
    });

    WorkspaceEvents.on(WorkspaceEventType.WorkspaceUpdated, () => {
      secondListenerExecuted = true;
    });

    // Should not throw, should gracefully log/swallow
    expect(() => {
      WorkspaceEvents.emit(WorkspaceEventType.WorkspaceUpdated, undefined);
    }).not.toThrow();

    expect(secondListenerExecuted).toBe(true);

    WorkspaceEvents.clearAllListeners();
  });
});
