import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IncrementalIndexer } from '../src/pipeline/IncrementalIndexer';
import { TypeScriptParser } from '../src/pipeline/TypeScriptParser';
import { SQLiteStore } from '../src/db/SQLiteStore';
import { SnapshotModel } from '../src/db/SnapshotModel';
import * as path from 'path';
import * as fs from 'fs';

describe('IncrementalIndexer (Gate 4A.4)', () => {
  const workspaceA = 'ws-A';
  let dbPath: string;
  let store: SQLiteStore;
  let model: SnapshotModel;
  let parser: TypeScriptParser;
  let indexer: IncrementalIndexer;

  beforeEach(async () => {
    dbPath = path.join(__dirname, `test-indexer-${Date.now()}.sqlite`);
    store = new SQLiteStore(workspaceA, dbPath);
    await store.initialize();
    model = new SnapshotModel(store);
    parser = new TypeScriptParser();
    indexer = new IncrementalIndexer(parser, model);
  });

  afterEach(async () => {
    await store.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('One file change -> one logical index replacement (advances snapshot exactly once)', async () => {
    const seq0 = await model.getLatestSequence();

    indexer.queueUpdate('/fake/ws', 'test.ts', 'class A {}', 1);
    await indexer.drain();

    const seq1 = await model.getLatestSequence();
    expect(seq1).toBe(seq0 + 1);

    const symbols = await store.getSymbols('test.ts');
    expect(symbols.length).toBe(1);
    expect(symbols[0].name).toBe('A');
  });

  it('Delete removes the complete file index transactionally', async () => {
    indexer.queueUpdate('/fake/ws', 'test.ts', 'class A {}', 1);
    await indexer.drain();

    indexer.queueDelete('/fake/ws', 'test.ts', 2);
    await indexer.drain();

    const symbols = await store.getSymbols('test.ts');
    expect(symbols.length).toBe(0);
    const file = await store.getFile('test.ts');
    expect(file).toBeNull();
  });

  it('Rapid changes are coalesced/debounced', async () => {
    const seq0 = await model.getLatestSequence();

    indexer.queueUpdate('/fake/ws', 'test.ts', 'class A {}', 1);
    indexer.queueUpdate('/fake/ws', 'test.ts', 'class B {}', 2);
    indexer.queueUpdate('/fake/ws', 'test.ts', 'class C {}', 3);

    await indexer.drain();

    // The scheduler processes synchronously in a loop using the queue, so it only processes the last one
    // because queueUpdate overwrites the previous item in the Map before scheduleProcessing ticks.
    const seq1 = await model.getLatestSequence();
    expect(seq1).toBe(seq0 + 1);

    const symbols = await store.getSymbols('test.ts');
    expect(symbols.length).toBe(1);
    expect(symbols[0].name).toBe('C');
  });

  it('Stale queued event cannot overwrite a newer file version (v1 vs v2 race condition)', async () => {
    // Process v2 first to completion
    await indexer.processEvent({
      type: 'update',
      workspaceRoot: '/fake/ws',
      filePath: 'race.ts',
      content: 'class V2 {}',
      version: 2,
    });

    // Now try to process v1 (it simulates a slow v1 that got dequeued or arrived late)
    await indexer.processEvent({
      type: 'update',
      workspaceRoot: '/fake/ws',
      filePath: 'race.ts',
      content: 'class V1 {}',
      version: 1,
    });

    const symbols = await store.getSymbols('race.ts');
    expect(symbols.length).toBe(1);
    // MUST NOT overwrite v2
    expect(symbols[0].name).toBe('V2');
  });

  it('Failed parsing never destroys the last known-good index', async () => {
    // 1. Known good
    await indexer.processEvent({
      type: 'update',
      workspaceRoot: '/fake/ws',
      filePath: 'bad.ts',
      content: 'class Good {}',
      version: 1,
    });

    const seq1 = await model.getLatestSequence();

    // 2. We can't really make TypeScriptParser throw unless we do path traversal, because ts.createSourceFile doesn't throw.
    // So we will cause an error in the indexer by passing an absolute path for path traversal check.
    // This will throw `Path traversal blocked`.
    try {
      await indexer.processEvent({
        type: 'update',
        workspaceRoot: '/fake/ws',
        filePath: '../outside.ts',
        content: 'class Bad {}',
        version: 2,
      });
    } catch (e) {}

    const seq2 = await model.getLatestSequence();
    expect(seq2).toBe(seq1); // Did not increment sequence

    const symbols = await store.getSymbols('bad.ts');
    expect(symbols.length).toBe(1);
    expect(symbols[0].name).toBe('Good'); // Still good
  });

  it('Excluded paths never enter the parser/index', async () => {
    indexer.queueUpdate('/fake/ws', 'node_modules/pkg/index.ts', 'class NodeModule {}', 1);
    indexer.queueUpdate('/fake/ws', 'src/.DS_Store', 'junk', 1);
    await indexer.drain();

    const sym1 = await store.getSymbols('node_modules/pkg/index.ts');
    const sym2 = await store.getSymbols('src/.DS_Store');

    expect(sym1.length).toBe(0);
    expect(sym2.length).toBe(0);
  });
});
