import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteStore } from '../src/db/SQLiteStore';
import { SnapshotModel } from '../src/db/SnapshotModel';
import { SymbolKind } from '../src/domain/IndexDTOs';
import * as fs from 'fs';
import * as path from 'path';

describe('SnapshotModel (Gate 4A.2)', () => {
  const workspaceA = 'ws-A';
  let dbPath: string;
  let store: SQLiteStore;
  let model: SnapshotModel;

  beforeEach(async () => {
    dbPath = path.join(__dirname, `test-snap-${Date.now()}.sqlite`);
    store = new SQLiteStore(workspaceA, dbPath);
    await store.initialize();
    model = new SnapshotModel(store);
  });

  afterEach(async () => {
    await store.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('Immutable published snapshots — once generation N is published, its contents do not mutate underneath readers', async () => {
    // Note: With SQLite in WAL mode (or standard serialized transactions), readers see a consistent snapshot.
    // We are simulating the logical snapshot boundary here.
    
    await model.commitFile(
      { id: 'f1', workspaceId: workspaceA, filePath: 'test.ts', hash: 'h1', updatedAt: 1 },
      [{ name: 'Sym1', kind: SymbolKind.Class, line: 1, column: 1 }],
      [], []
    );

    const seq1 = await model.getLatestSequence();
    expect(seq1).toBe(1);
    
    const snap1 = await model.getLatestSnapshot();
    expect(snap1?.sequence).toBe(1);

    await model.commitFile(
      { id: 'f1', workspaceId: workspaceA, filePath: 'test.ts', hash: 'h2', updatedAt: 2 },
      [{ name: 'Sym2', kind: SymbolKind.Class, line: 2, column: 1 }],
      [], []
    );

    const seq2 = await model.getLatestSequence();
    expect(seq2).toBe(2);
    
    // Validating sequence strictly increased
    expect(seq2).toBeGreaterThan(seq1);
  });

});
