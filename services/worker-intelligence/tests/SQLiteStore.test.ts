import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteStore } from '../src/db/SQLiteStore';
import { SymbolKind } from '../src/domain/IndexDTOs';
import * as fs from 'fs';
import * as path from 'path';

describe('SQLiteStore Invariants (Gate 4A.2)', () => {
  const workspaceA = 'ws-A';
  const workspaceB = 'ws-B';
  let dbPath: string;
  let storeA: SQLiteStore;
  let storeB: SQLiteStore;

  beforeEach(async () => {
    // Use a temp file for restart persistence tests
    dbPath = path.join(__dirname, `test-${Date.now()}.sqlite`);
    storeA = new SQLiteStore(workspaceA, dbPath);
    storeB = new SQLiteStore(workspaceB, dbPath);
    await storeA.initialize();
    await storeB.initialize();
  });

  afterEach(async () => {
    await storeA.close();
    await storeB.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('Workspace isolation — A cannot read B records', async () => {
    // Add file to A
    await storeA.commitFileIndex(
      { id: 'file-1', workspaceId: workspaceA, filePath: 'src/main.ts', hash: 'hash1', updatedAt: Date.now() },
      [{ name: 'MainClass', kind: SymbolKind.Class, line: 1, column: 1 }],
      [],
      []
    );

    // Add file to B
    await storeB.commitFileIndex(
      { id: 'file-2', workspaceId: workspaceB, filePath: 'src/main.ts', hash: 'hash2', updatedAt: Date.now() },
      [{ name: 'OtherClass', kind: SymbolKind.Class, line: 1, column: 1 }],
      [],
      []
    );

    // A queries for main.ts
    const fileA = await storeA.getFile('src/main.ts');
    expect(fileA).toBeDefined();
    expect(fileA?.workspaceId).toBe(workspaceA);

    const symbolsA = await storeA.getSymbols('src/main.ts');
    expect(symbolsA).toHaveLength(1);
    expect(symbolsA[0].name).toBe('MainClass');

    // B queries for main.ts
    const symbolsB = await storeB.getSymbols('src/main.ts');
    expect(symbolsB).toHaveLength(1);
    expect(symbolsB[0].name).toBe('OtherClass');
  });

  it('Snapshot monotonicity — sequence never decreases', async () => {
    const snap1 = await storeA.getLatestSnapshot();
    expect(snap1?.sequence).toBe(0);

    const snap2 = await storeA.commitFileIndex(
      { id: 'f1', workspaceId: workspaceA, filePath: '1.ts', hash: 'h', updatedAt: 1 },
      [], [], []
    );
    expect(snap2.sequence).toBe(1);

    const snap3 = await storeA.deleteFileIndex('1.ts');
    expect(snap3.sequence).toBe(2);

    const current = await storeA.getLatestSnapshot();
    expect(current?.sequence).toBe(2);
  });

  it('Idempotent replacement — re-indexing the same file does not duplicate entities', async () => {
    await storeA.commitFileIndex(
      { id: 'f1', workspaceId: workspaceA, filePath: 'test.ts', hash: 'h1', updatedAt: 1 },
      [{ name: 'Sym1', kind: SymbolKind.Class, line: 1, column: 1 }],
      [],
      [{ moduleName: 'fs' }]
    );

    let symbols = await storeA.getSymbols('test.ts');
    let imports = await storeA.getImports('test.ts');
    expect(symbols).toHaveLength(1);
    expect(imports).toHaveLength(1);

    // Re-index with new contents
    await storeA.commitFileIndex(
      { id: 'f1', workspaceId: workspaceA, filePath: 'test.ts', hash: 'h2', updatedAt: 2 },
      [{ name: 'Sym2', kind: SymbolKind.Class, line: 2, column: 1 }],
      [],
      [{ moduleName: 'path' }]
    );

    symbols = await storeA.getSymbols('test.ts');
    imports = await storeA.getImports('test.ts');
    
    // Should still have length 1, but with new names
    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('Sym2');
    expect(imports).toHaveLength(1);
    expect(imports[0].moduleName).toBe('path');
  });

  it('Transactional deletion — deleting a file removes all associated indexed entities atomically', async () => {
    await storeA.commitFileIndex(
      { id: 'f1', workspaceId: workspaceA, filePath: 'test.ts', hash: 'h1', updatedAt: 1 },
      [{ name: 'Sym1', kind: SymbolKind.Class, line: 1, column: 1 }],
      [{ symbolName: 'Ref1', line: 1, column: 2 }],
      [{ moduleName: 'fs' }]
    );

    await storeA.deleteFileIndex('test.ts');

    const file = await storeA.getFile('test.ts');
    expect(file).toBeNull();

    const symbols = await storeA.getSymbols('test.ts');
    expect(symbols).toHaveLength(0);

    const refs = await storeA.getReferences('test.ts');
    expect(refs).toHaveLength(0);

    const imports = await storeA.getImports('test.ts');
    expect(imports).toHaveLength(0);
  });

  it('Restart persistence — kill/restart worker and reopen the DB; committed state survives', async () => {
    await storeA.commitFileIndex(
      { id: 'f1', workspaceId: workspaceA, filePath: 'persisted.ts', hash: 'h1', updatedAt: 1 },
      [{ name: 'PersistedSym', kind: SymbolKind.Class, line: 1, column: 1 }],
      [], []
    );

    await storeA.close(); // simulate kill/restart

    // Reopen DB with a new instance
    const storeRestarted = new SQLiteStore(workspaceA, dbPath);
    await storeRestarted.initialize();

    const symbols = await storeRestarted.getSymbols('persisted.ts');
    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('PersistedSym');

    await storeRestarted.close();
  });

  it('Atomic snapshot commit — partial indexing cannot become the authoritative generation', async () => {
    // SQLiteStore uses EXCLUSIVE TRANSACTION, so it's guaranteed atomic at the SQLite level.
    // If we throw an error midway, the sequence shouldn't increment.
    
    // We can simulate an error by violating a constraint (e.g., duplicate IDs)
    const initialSnap = await storeA.getLatestSnapshot();
    
    try {
      await storeA.commitFileIndex(
        { id: 'f1', workspaceId: workspaceA, filePath: 'test.ts', hash: 'h1', updatedAt: 1 },
        // Two symbols with the same explicit ID would violate PRIMARY KEY constraint if we exposed ID, 
        // but we omit ID in the API. Wait, file is uniquely constrained on (workspaceId, filePath), but we explicitly delete first.
        // What if we pass invalid constraint data? e.g. null for a NOT NULL field.
        [{ name: null as any, kind: SymbolKind.Class, line: 1, column: 1 }],
        [], []
      );
      expect.unreachable('Should have failed constraint');
    } catch (err) {
      // expected
    }

    const currentSnap = await storeA.getLatestSnapshot();
    expect(currentSnap?.sequence).toBe(initialSnap?.sequence); // Sequence did not increment
    
    const symbols = await storeA.getSymbols('test.ts');
    expect(symbols).toHaveLength(0); // No partial commit
  });

});
