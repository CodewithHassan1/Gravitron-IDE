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

describe('Multi Consumer Test', () => {
  let manager: WorkspaceManagerImpl;

  beforeEach(async () => {
    mockDbStore.clear();
    WorkspaceEvents.clearAllListeners();
    manager = new WorkspaceManagerImpl();
    await manager.openWorkspace(
      { id: 'ws-consumers', name: 'ConsumersWS', uri: 'file:///', provider: 'memory' as any, lastOpened: Date.now(), type: 'directory' as any, capabilities: {} as any },
      { nativeHandle: {} as any }
    );
  });

  afterEach(async () => {
    await manager.closeWorkspace();
    WorkspaceEvents.clearAllListeners();
    expect((WorkspaceEvents as any).listeners?.size || 0).toBe(0);
  });

  it('Immutable Event Payloads across Consumers', async () => {
    const explorerLog: any[] = [];
    const searchLog: any[] = [];
    const gitLog: any[] = [];
    const aiAgentLog: any[] = [];

    const unsubscribeExplorer = WorkspaceEvents.on('fileEvent', (e) => {
      // Simulate explorer mutating payload accidentally
      const payload = e.payload as any;
      if (payload.node) {
        try {
          payload.node.name = 'mutated_by_explorer';
        } catch {
          // Expect to throw if frozen
        }
      }
      explorerLog.push(e);
    });

    const unsubscribeSearch = WorkspaceEvents.on('fileEvent', (e) => {
      // Search engine does work
      searchLog.push(e);
    });

    const unsubscribeGit = WorkspaceEvents.on('fileEvent', (e) => {
      // Git integration checks something
      gitLog.push(e);
    });

    const unsubscribeAi = WorkspaceEvents.on('fileEvent', (e) => {
      // AI listener mutates accidentally
      const payload = e.payload as any;
      if (payload.type === 'created') {
        try {
          payload.type = 'mutated';
        } catch {
          // Error expected
        }
      }
      aiAgentLog.push(e);
    });

    await manager.createFile('/new_file.ts');

    // Wait for event loop to clear just in case (though fileEvent is sync)
    await new Promise(r => setTimeout(r, 0));

    expect(explorerLog.length).toBe(1);
    expect(searchLog.length).toBe(1);
    expect(gitLog.length).toBe(1);
    expect(aiAgentLog.length).toBe(1);

    // Verify ordering is preserved, payload not mutated for later consumers
    // Wait, the payload is an object. Is it frozen?
    // WorkspaceManager freezes the `node` object before emitting.
    // Let's verify `node.name` wasn't mutated.
    const searchPayload = searchLog[0].payload;
    expect(searchPayload.node.name).toBe('new_file.ts');
    expect(searchPayload.type).toBe('created');

    // Clean up
    unsubscribeExplorer();
    unsubscribeSearch();
    unsubscribeGit();
    unsubscribeAi();
    
    await (manager as any).syncEngine.executeSyncCycle();
  });
});
