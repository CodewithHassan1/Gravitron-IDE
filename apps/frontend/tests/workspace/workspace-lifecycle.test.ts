import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceManagerImpl } from '../../src/services/workspace/WorkspaceManager';
import { WorkspaceEvents } from '../../src/services/workspace/WorkspaceEvents';
import { WorkspaceEventType } from '../../src/services/workspace/types';

vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('Workspace Lifecycle', () => {
  beforeEach(() => {
    WorkspaceEvents.clearAllListeners();
  });

  it('openWorkspace() should emit workspace_opened and workspace_updated', async () => {
    const manager = new WorkspaceManagerImpl();

    const emitSpy = vi.spyOn(WorkspaceEvents, 'emit');

    await manager.openWorkspace(
      {
        id: 'ws-test',
        name: 'Test',
        uri: 'file:///',
        provider: 'memory' as any,
        lastOpened: Date.now(),
        type: 'directory' as any,
        capabilities: {} as any,
      },
      { nativeHandle: {} as any }
    );

    const emittedEvents = emitSpy.mock.calls.map((call) => call[0]);
    expect(emittedEvents).toContain(WorkspaceEventType.WorkspaceOpened);
    expect(emittedEvents).toContain(WorkspaceEventType.WorkspaceUpdated);

    emitSpy.mockRestore();

    const state = manager.getState();
    expect(state.metadata?.id).toBe('ws-test');
    expect(state.isLoading).toBe(false);
  });

  it('closeWorkspace() should emit workspace_closed and workspace_updated', async () => {
    const manager = new WorkspaceManagerImpl();
    await manager.openWorkspace(
      {
        id: 'ws-test',
        name: 'Test',
        uri: 'file:///',
        provider: 'memory' as any,
        lastOpened: Date.now(),
        type: 'directory' as any,
        capabilities: {} as any,
      },
      { nativeHandle: {} as any }
    );

    const emitSpy = vi.spyOn(WorkspaceEvents, 'emit');

    await manager.closeWorkspace();

    const emittedEvents = emitSpy.mock.calls.map((call) => call[0]);
    expect(emittedEvents).toContain(WorkspaceEventType.WorkspaceClosed);
    expect(emittedEvents).toContain(WorkspaceEventType.WorkspaceUpdated);
    emitSpy.mockRestore();

    const state = manager.getState();
    expect(state.metadata).toBeNull();
  });

  it('reloadWorkspace() should emit workspace_updated', async () => {
    const manager = new WorkspaceManagerImpl();
    await manager.openWorkspace(
      {
        id: 'ws-test',
        name: 'Test',
        uri: 'file:///',
        provider: 'memory' as any,
        lastOpened: Date.now(),
        type: 'directory' as any,
        capabilities: {} as any,
      },
      { nativeHandle: {} as any }
    );

    const emitSpy = vi.spyOn(WorkspaceEvents, 'emit');

    await manager.reloadWorkspace();

    const emittedEvents = emitSpy.mock.calls.map((call) => call[0]);
    expect(emittedEvents).toContain(WorkspaceEventType.WorkspaceUpdated);
    emitSpy.mockRestore();
  });
});
