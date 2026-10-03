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

describe('Soak: Idle Stability', () => {
  let manager: WorkspaceManagerImpl;

  beforeEach(async () => {
    vi.useFakeTimers();
    mockDbStore.clear();
    WorkspaceEvents.clearAllListeners();
    manager = new WorkspaceManagerImpl();
    await manager.openWorkspace({ id: 'ws-idle', name: 'IdleWS', uri: 'file:///', provider: 'memory' as any, lastOpened: Date.now(), type: 'directory' as any, capabilities: {} as any }, { nativeHandle: {} as any });
  });

  afterEach(async () => {
    await manager.closeWorkspace();
    WorkspaceEvents.clearAllListeners();
    vi.useRealTimers();
  });

  it('maintains stability during prolonged idle periods after burst mutations', async () => {
    const syncEngine = (manager as any).syncEngine;

    // Burst mutations
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(manager.createFile(`/idle_${i}.ts`));
    }
    await Promise.all(promises);

    // Wait for debounce period (simulate prolonged idle)
    await vi.advanceTimersByTimeAsync(10000); // 10 seconds of idle

    // Should have processed the queue
    expect(syncEngine.queue.size).toBe(0);

    // Expect watcher polling interval to be the only timer
    expect(vi.getTimerCount()).toBe(1);
    
    // Another burst
    const promises2 = [];
    for (let i = 50; i < 100; i++) {
      promises2.push(manager.createFile(`/idle_${i}.ts`));
    }
    await Promise.all(promises2);
    
    await vi.advanceTimersByTimeAsync(10000);
    expect(syncEngine.queue.size).toBe(0);
    
    await manager.closeWorkspace();
    
    expect(syncEngine.queue.size).toBe(0);
  });
});
