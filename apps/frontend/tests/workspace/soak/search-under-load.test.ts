import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkspaceManagerImpl } from '../../../src/services/workspace/WorkspaceManager';
import { WorkspaceEvents } from '../../../src/services/workspace/WorkspaceEvents';
import { SearchQuery } from '../../../src/services/workspace/search/SearchQuery';

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

describe('Soak: Search Under Load', () => {
  let manager: WorkspaceManagerImpl;

  beforeEach(async () => {
    mockDbStore.clear();
    WorkspaceEvents.clearAllListeners();
    manager = new WorkspaceManagerImpl();
    await manager.openWorkspace(
      {
        id: 'ws-search',
        name: 'SearchWS',
        uri: 'file:///',
        provider: 'memory' as any,
        lastOpened: Date.now(),
        type: 'directory' as any,
        capabilities: {} as any,
      },
      { nativeHandle: {} as any }
    );
  });

  afterEach(async () => {
    await manager.closeWorkspace();
    WorkspaceEvents.clearAllListeners();
  });

  it('maintains search index consistency during continuous concurrent mutations', async () => {
    const searchEngine = manager.getSearchEngine()!;
    let queryHits = 0;

    // Mutate in background
    const mutationPromise = (async () => {
      for (let i = 0; i < 500; i++) {
        await manager.createFile(`/search_soak_${i}.ts`);
        await manager.rename(`/search_soak_${i}.ts`, `search_soak_renamed_${i}.ts`);
        if (i % 2 === 0) {
          await manager.delete(`/search_soak_renamed_${i}.ts`);
        }
      }
    })();

    // Read in foreground
    for (let i = 0; i < 50; i++) {
      const result = await searchEngine.search(new SearchQuery('search_soak'));
      queryHits += result.length;
      await new Promise((r) => setTimeout(r, 10)); // small delay to interleave
    }

    await mutationPromise;

    // Final consistent search
    const finalResult = await searchEngine.search(
      new SearchQuery('search_soak', { maxResults: 1000 })
    );

    // We created 500, deleted 250 (even indices), so exactly 250 should remain.
    expect(finalResult.length).toBe(250);
    // queryHits should be > 0 indicating it successfully searched while mutations happened
    expect(queryHits).toBeGreaterThan(0);
  });
});
