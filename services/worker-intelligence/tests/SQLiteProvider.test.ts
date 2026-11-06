import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteProvider } from '../src/providers/SQLiteProvider';
import { SQLiteStore } from '../src/db/SQLiteStore';
import { SnapshotModel } from '../src/db/SnapshotModel';
import { SymbolKind } from '../src/domain/IndexDTOs';
import * as path from 'path';
import * as fs from 'fs';

describe('SQLiteProvider (Gate 4A.5)', () => {
  let dbPath: string;
  let storeA: SQLiteStore;
  let storeB: SQLiteStore;
  let provider: SQLiteProvider;

  beforeEach(async () => {
    dbPath = path.join(__dirname, `test-provider-${Date.now()}.sqlite`);
    storeA = new SQLiteStore('ws-A', dbPath);
    storeB = new SQLiteStore('ws-B', dbPath);
    await storeA.initialize();
    await storeB.initialize();

    // Use storeA's connection for provider (they share the same DB file)
    provider = new SQLiteProvider(storeA.getDb());
  });

  afterEach(async () => {
    await storeA.close();
    await storeB.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('Workspace isolation: A -> A results, B -> B results', async () => {
    await storeA.commitFileIndex(
      { id: 'f1', workspaceId: 'ws-A', filePath: 'test.ts', hash: 'h1', updatedAt: 1 },
      [{ name: 'MyClass', kind: SymbolKind.Class, line: 1, column: 1, startOffset: 0 }],
      [],
      []
    );

    await storeB.commitFileIndex(
      { id: 'f2', workspaceId: 'ws-B', filePath: 'test.ts', hash: 'h2', updatedAt: 2 },
      [{ name: 'MyClass', kind: SymbolKind.Class, line: 1, column: 1, startOffset: 0 }],
      [],
      []
    );

    const resA = await provider.searchSymbols('ws-A', 'MyClass');
    expect(resA.workspaceId).toBe('ws-A');
    expect(resA.results.length).toBe(1);

    const resB = await provider.searchSymbols('ws-B', 'MyClass');
    expect(resB.workspaceId).toBe('ws-B');
    expect(resB.results.length).toBe(1);
  });

  it('Bounding: 1000+ matches bounded to MAX_SEARCH_RESULTS (1000 hard limit)', async () => {
    const symbols = [];
    for (let i = 0; i < 1500; i++) {
      symbols.push({
        name: `Match${i}`,
        kind: SymbolKind.Variable,
        line: i,
        column: 1,
        startOffset: i,
      });
    }

    await storeA.commitFileIndex(
      { id: 'f1', workspaceId: 'ws-A', filePath: 'huge.ts', hash: 'h', updatedAt: 1 },
      symbols,
      [],
      []
    );

    const res = await provider.searchSymbols('ws-A', 'Match', { limit: 5000 });
    // Hard limit is 1000
    expect(res.results.length).toBe(1000);
  });

  it('Definition resolution is deterministic (stable ordering)', async () => {
    // Exact match first, then by kind, filepath, offset
    await storeA.commitFileIndex(
      { id: 'f1', workspaceId: 'ws-A', filePath: 'z.ts', hash: 'h1', updatedAt: 1 },
      [{ name: 'Target', kind: SymbolKind.Variable, line: 1, column: 1, startOffset: 10 }],
      [],
      []
    );
    await storeA.commitFileIndex(
      { id: 'f2', workspaceId: 'ws-A', filePath: 'a.ts', hash: 'h2', updatedAt: 1 },
      [{ name: 'Target', kind: SymbolKind.Class, line: 1, column: 1, startOffset: 0 }],
      [],
      []
    );

    const res = await provider.findDefinition('ws-A', 'Target');
    expect(res.results.length).toBe(2);
    // a.ts comes first because Class (enum value) < Variable (enum value) or because a.ts < z.ts
    // Let's rely on the explicit ORDER BY tests.
    expect(res.results[0].filePath).toBe('a.ts');
    expect(res.results[1].filePath).toBe('z.ts');
  });

  it('Snapshot consistency race condition', async () => {
    // Initial state: Snapshot 41
    await storeA.commitFileIndex(
      { id: 'f1', workspaceId: 'ws-A', filePath: '1.ts', hash: 'h1', updatedAt: 1 },
      [{ name: 'A', kind: SymbolKind.Class, line: 1, column: 1 }],
      [],
      []
    );

    const initialSeq = (await storeA.getLatestSnapshot())!.sequence;

    // Start a query that uses serialization.
    // If we trigger a commit asynchronously right after starting it,
    // the query should block the commit (or vice versa) and return consistent data.
    const queryPromise = provider.searchSymbols('ws-A', 'A');

    // This commit will queue up behind the transaction of the query in sqlite serialize queue
    const commitPromise = storeA.commitFileIndex(
      { id: 'f2', workspaceId: 'ws-A', filePath: '2.ts', hash: 'h2', updatedAt: 2 },
      [{ name: 'A', kind: SymbolKind.Class, line: 2, column: 1 }],
      [],
      []
    );

    const res = await queryPromise;
    const commitSnap = await commitPromise;

    // Depending on microtask queueing, query could run before or after commit.
    // But it MUST be consistent. If it sees 1 result, snapshot must be initialSeq.
    // If it sees 2 results, snapshot must be commitSnap.sequence.
    if (res.results.length === 1) {
      expect(res.snapshotSequence).toBe(initialSeq);
    } else if (res.results.length === 2) {
      expect(res.snapshotSequence).toBe(commitSnap.sequence);
    } else {
      expect.unreachable('Inconsistent snapshot read');
    }
  });

  it('Separates semantic resolution from syntactic references', async () => {
    await storeA.commitFileIndex(
      { id: 'f1', workspaceId: 'ws-A', filePath: 'test.ts', hash: 'h', updatedAt: 1 },
      [],
      [{ symbolName: 'Target', line: 1, column: 1, startOffset: 0 }],
      []
    );

    const refs = await provider.findReferences('ws-A', 'Target');
    expect(refs.results.length).toBe(1);
    expect(refs.results[0].symbolName).toBe('Target');

    // Should not return in definitions
    const defs = await provider.findDefinition('ws-A', 'Target');
    expect(defs.results.length).toBe(0);
  });
});
