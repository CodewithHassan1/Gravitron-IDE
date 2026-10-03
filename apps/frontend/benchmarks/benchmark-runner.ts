import { vi } from 'vitest';
import { performance } from 'perf_hooks';
import { calculateStatistics, BenchmarkStats } from './statistics';
import { BenchmarkReporter } from './reporter';
import { WorkspaceManagerImpl } from '../src/services/workspace/WorkspaceManager';
import { SearchQuery } from '../src/services/workspace/search/SearchQuery';

// Mock IDB for Node.js environment
const mockDbStore = new Map<string, any>();
vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn(async (storeName: string, key: string) => mockDbStore.get(`${storeName}:${key}`)),
    put: vi.fn(async (storeName: string, val: any, key?: string) => {
      const actualKey = key || val.workspaceId || val.id;
      mockDbStore.set(`${storeName}:${actualKey}`, val);
    }),
    delete: vi.fn(async (storeName: string, key: string) => mockDbStore.delete(`${storeName}:${key}`)),
  }),
}));

async function measure(name: string, fn: () => Promise<void> | void, iterations: number = 100, warmups: number = 10): Promise<{ name: string, stats: BenchmarkStats }> {
  // Warmup
  for (let i = 0; i < warmups; i++) {
    await fn();
  }

  const durations: number[] = [];
  
  // Measure
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    durations.push(end - start);
  }

  return {
    name,
    stats: calculateStatistics(durations)
  };
}

async function runBenchmarks() {
  console.log('🚀 Starting Workspace Engine Benchmarks...\n');
  const results: { name: string, stats: BenchmarkStats }[] = [];
  let manager = new WorkspaceManagerImpl();
  const wsMeta: any = {
    id: 'test-bench',
    name: 'test-bench',
    uri: 'memory://test',
    provider: 'memory' as any,
    lastOpened: Date.now(),
    type: 'directory',
    capabilities: {
      explorer: true,
      recursiveSearch: true,
      git: false,
      terminal: false,
      multipleRoots: false,
      writable: true,
    }
  };

  results.push(await measure('Warm Startup (Manager Instantiation)', () => {
    new WorkspaceManagerImpl();
  }, 1000, 100));

  results.push(await measure('Workspace Open', async () => {
    await manager.openWorkspace(wsMeta, { nativeHandle: {} as any });
    await manager.closeWorkspace();
  }, 100, 10));

  await manager.openWorkspace(wsMeta, { nativeHandle: {} as any });

  // 10k file creation & indexing
  results.push(await measure('10k File Creation & Indexing', async () => {
    for (let i = 0; i < 10000; i++) {
      await manager.createFile(`/bench_file_${i}.ts`);
    }
  }, 1, 0)); // Only run once due to time constraints

  // Search Latency
  const searchEngine = manager.getSearchEngine();
  if (searchEngine) {
    results.push(await measure('Search Latency', async () => {
      await searchEngine.search(new SearchQuery('bench_file_5000'));
    }, 1000, 100));
  }

  // Rename Latency
  let renameCounter = 0;
  results.push(await measure('Rename Latency', async () => {
    await manager.rename(`/bench_file_${renameCounter}.ts`, `renamed_file_${renameCounter}.ts`);
    renameCounter++;
  }, 1000, 10));

  // Move Latency
  await manager.createFolder('/moved_dir');
  let moveCounter = 0;
  results.push(await measure('Move Latency', async () => {
    await manager.move(`/bench_file_${1000 + moveCounter}.ts`, `/moved_dir/bench_file_${1000 + moveCounter}.ts`);
    moveCounter++;
  }, 1000, 10));

  // Delete Latency
  let deleteCounter = 0;
  results.push(await measure('Delete Latency', async () => {
    await manager.delete(`/bench_file_${2000 + deleteCounter}.ts`);
    deleteCounter++;
  }, 1000, 10));

  // Sync Queue Throughput (Simulate adding 1000 items and waiting for empty)
  results.push(await measure('Sync Queue Throughput (1000 items)', async () => {
    const syncEngine = (manager as any).syncEngine;
    for (let i = 0; i < 1000; i++) {
      syncEngine.enqueueOperation({ id: `op_${i}`, type: 'CreateFile', path: `/sync_file_${i}.ts`, timestamp: Date.now() });
    }
    // force cycle
    await syncEngine.executeSyncCycle();
    while (syncEngine.queue.size > 0) {
      await syncEngine.executeSyncCycle();
    }
  }, 5, 1));

  await manager.closeWorkspace();

  const reporter = new BenchmarkReporter(__dirname);
  reporter.report(results);
}

import { it, describe } from 'vitest';

describe('Workspace Engine Benchmark Suite', () => {
  it('executes benchmarks', async () => {
    await runBenchmarks();
  }, 300000); // 5 minute timeout
});
