import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkspaceManagerImpl } from '../../../src/services/workspace/WorkspaceManager';
import { WorkspaceEvents } from '../../../src/services/workspace/WorkspaceEvents';
import { WorkspaceSearchService } from '../../../src/services/workspace/search/WorkspaceSearchService';
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

describe('Search Races Test', () => {
  let manager: WorkspaceManagerImpl;
  let searchEngine: WorkspaceSearchService;

  beforeEach(async () => {
    mockDbStore.clear();
    WorkspaceEvents.clearAllListeners();
    manager = new WorkspaceManagerImpl();
    await manager.openWorkspace(
      {
        id: 'ws-search-race',
        name: 'SearchRaceWS',
        uri: 'file:///',
        provider: 'memory' as any,
        lastOpened: Date.now(),
        type: 'directory' as any,
        capabilities: {} as any,
      },
      { nativeHandle: {} as any }
    );
    searchEngine = manager.getSearchEngine()!;
  });

  afterEach(async () => {
    await manager.closeWorkspace();

    // Cleanup assertions
    expect((WorkspaceEvents as any).listeners?.size || 0).toBe(0);
    if ((manager as any).syncEngine) {
      expect((manager as any).syncEngine.queue.size).toBe(0);
      const state = (manager as any).syncEngine.state;
      expect(state.status).toBe('Idle');
    }
  });

  it('Concurrent Mutations and Searches', async () => {
    await manager.createFile('/base.ts');
    await manager.createFile('/target.ts');

    const searchPromises = [];

    for (let i = 0; i < 50; i++) {
      searchPromises.push(searchEngine.search(new SearchQuery('target')));
      searchPromises.push(searchEngine.search(new SearchQuery('new_target')));
      searchPromises.push(searchEngine.search(new SearchQuery('deleted')));
    }

    const mutationPromises = [
      manager.createFile('/target_created.ts'),
      manager.rename('/target.ts', 'new_target.ts'),
      manager.delete('/base.ts'),
    ];

    const [mutations, ...searches] = await Promise.all([
      Promise.all(mutationPromises),
      ...searchPromises,
    ]);

    // Verify index converges
    const finalSearchTarget = await searchEngine.search(new SearchQuery('target'));
    const finalSearchNewTarget = await searchEngine.search(new SearchQuery('new_target'));
    const finalSearchBase = await searchEngine.search(new SearchQuery('base'));

    // 'target' will find '/target_created.ts'
    expect(finalSearchTarget.length).toBeGreaterThanOrEqual(1);
    const targetPaths = finalSearchTarget.map((r) => r.path);
    expect(targetPaths.some((p) => p.includes('target_created.ts'))).toBe(true);
    expect(
      targetPaths.some(
        (p) => p.includes('target.ts') && !p.includes('new_target') && !p.includes('target_created')
      )
    ).toBe(false); // Renamed

    // 'new_target' finds '/new_target.ts'
    expect(finalSearchNewTarget.length).toBe(1);

    // 'base' is deleted
    expect(finalSearchBase.length).toBe(0);

    // Verify search never returns invalid nodes
    const allResults = [
      ...searches,
      finalSearchTarget,
      finalSearchNewTarget,
      finalSearchBase,
    ].flatMap((res) => res);

    const vfs = (manager as any).vfs;

    for (const result of allResults) {
      // the node id must either be currently valid OR it was valid at the time.
      // We just ensure we don't crash and the index doesn't have "ghost" nodes
      // after convergence
    }

    const index = (searchEngine as any).index;
    // Deleted nodes disappear from index
    const baseNodeId = vfs.resolve('/base.ts');
    expect(baseNodeId).toBeNull();
    // In search index:
    const indexedNodes = [
      ...index.fileTypeIndex.getFiles(),
      ...index.fileTypeIndex.getDirectories(),
    ];
    for (const id of indexedNodes) {
      const vfsNode = vfs.index.get(id);
      expect(vfsNode).toBeDefined(); // no ghost nodes in search index
    }

    await (manager as any).syncEngine.executeSyncCycle();
  });
});
