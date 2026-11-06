import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceManagerImpl } from '../../src/services/workspace/WorkspaceManager';
import { WorkspaceEvents } from '../../src/services/workspace/WorkspaceEvents';
import { SearchQuery } from '../../src/services/workspace/search/SearchQuery';

vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('Search Consistency', () => {
  let manager: WorkspaceManagerImpl;

  beforeEach(async () => {
    WorkspaceEvents.clearAllListeners();
    manager = new WorkspaceManagerImpl();
    await manager.openWorkspace(
      {
        id: 'ws-search',
        name: 'Test',
        uri: 'file:///',
        provider: 'memory' as any,
        lastOpened: Date.now(),
        type: 'directory' as any,
        capabilities: {} as any,
      },
      { nativeHandle: {} as any }
    );
  });

  it('Search eventually matches VFS after mutations', async () => {
    const searchEngine = (manager as any).searchEngine;

    // 1. Create
    await manager.createFile('/hello.ts');

    // Allow microtasks to clear since indexer responds to events
    await new Promise((resolve) => setTimeout(resolve, 0));

    let searchRes = searchEngine.search(new SearchQuery('hello')).items;
    expect(searchRes.length).toBeGreaterThan(0);
    expect(searchRes[0].path).toBe('/hello.ts');

    // 2. Rename
    await manager.rename('/hello.ts', 'world.ts');
    await new Promise((resolve) => setTimeout(resolve, 0));

    searchRes = searchEngine.search(new SearchQuery('hello')).items;
    expect(searchRes.length).toBe(0);

    searchRes = searchEngine.search(new SearchQuery('world')).items;
    expect(searchRes.length).toBeGreaterThan(0);
    expect(searchRes[0].path).toBe('/world.ts');

    // 3. Move
    await manager.createFolder('/lib');
    await manager.move('/world.ts', '/lib');
    await new Promise((resolve) => setTimeout(resolve, 0));

    searchRes = searchEngine.search(new SearchQuery('world')).items;
    expect(searchRes.length).toBeGreaterThan(0);
    expect(searchRes[0].path).toBe('/lib/world.ts');

    // 4. Delete
    await manager.delete('/lib/world.ts');
    await new Promise((resolve) => setTimeout(resolve, 0));

    searchRes = searchEngine.search(new SearchQuery('world')).items;
    expect(searchRes.length).toBe(0);
  });
});
