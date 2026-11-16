import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkspaceSearchService } from './WorkspaceSearchService';
import { VirtualFileSystem } from '../vfs/VirtualFileSystem';
import { SearchQuery } from './SearchQuery';
import { WorkspaceEvents } from '../WorkspaceEvents';
import { WorkspaceEventType } from '../types';

describe('WorkspaceSearchService', () => {
  let vfs: VirtualFileSystem;
  let searchService: WorkspaceSearchService;

  beforeEach(() => {
    WorkspaceEvents.clearAllListeners();
    vfs = new VirtualFileSystem();
    vfs.initializeRoot('root', 'directory');
    vfs.createFile('/index.ts');
    vfs.createFile('/app.tsx');
    vfs.createFolder('/src');
    vfs.createFile('/src/utils.ts');

    searchService = new WorkspaceSearchService(vfs);
  });

  afterEach(() => {
    searchService.dispose();
    WorkspaceEvents.clearAllListeners();
  });

  it('initializes in direct index fallback mode when Web Worker is not available', async () => {
    // In Node / Vitest, Worker is undefined, so it should cleanly use directIndex
    const results = await searchService.search(new SearchQuery('index'));
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('index.ts');
  });

  it('performs fuzzy matching and returns sorted results', async () => {
    const results = await searchService.search(new SearchQuery('utils'));
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('utils.ts');
    expect(results[0].path).toBe('/src/utils.ts');
  });

  it('filters results by file extension', async () => {
    const queryTsx = new SearchQuery('app', { fileTypes: ['tsx'] });
    const resultsTsx = await searchService.search(queryTsx);
    expect(resultsTsx.length).toBe(1);
    expect(resultsTsx[0].name).toBe('app.tsx');

    const queryTs = new SearchQuery('app', { fileTypes: ['ts'] });
    const resultsTs = await searchService.search(queryTs);
    expect(resultsTs.length).toBe(0);
  });

  it('updates index when a new file is created', async () => {
    vfs.createFile('/readme.md');
    WorkspaceEvents.emit(WorkspaceEventType.FileCreated, {
      path: '/readme.md',
    });

    const results = await searchService.search(new SearchQuery('readme'));
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('readme.md');
  });

  it('updates index when a file is deleted', async () => {
    vfs.delete('/index.ts');
    WorkspaceEvents.emit(WorkspaceEventType.FileDeleted, {
      path: '/index.ts',
    });

    const results = await searchService.search(new SearchQuery('index'));
    expect(results.length).toBe(0);
  });

  it('re-indexes everything when workspace is opened', async () => {
    vfs.createFile('/config.json');
    WorkspaceEvents.emit(WorkspaceEventType.WorkspaceOpened, {
      workspaceId: 'test-ws',
    });

    const results = await searchService.search(new SearchQuery('config'));
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('config.json');
  });

  it('gracefully recovers and falls back to direct index if Worker errors out', async () => {
    class FailingWorker {
      onerror: ((err: any) => void) | null = null;
      onmessage: ((event: any) => void) | null = null;
      constructor() {
        setTimeout(() => {
          if (this.onerror) {
            this.onerror(new Error('Simulated worker crash'));
          }
        }, 0);
      }
      postMessage() {
        throw new Error('Worker is dead');
      }
      terminate() {}
    }

    const originalWorker = globalThis.Worker;
    (globalThis as any).Worker = FailingWorker;

    try {
      const failingService = new WorkspaceSearchService(vfs);
      // Wait for the simulated error event
      await new Promise((resolve) => setTimeout(resolve, 20));

      const results = await failingService.search(new SearchQuery('app'));
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('app.tsx');
      failingService.dispose();
    } finally {
      (globalThis as any).Worker = originalWorker;
    }
  });
});
