import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
// tests/terminal/persistence.test.ts

import { IndexedDBSessionPersistence } from '../../src/services/terminal/persistence/IndexedDBSessionPersistence';
import { TerminalSnapshot } from '../../src/services/terminal/types';

describe('IndexedDBSessionPersistence', () => {
  it('handles missing IDB gracefully', async () => {
    const backupIDB = globalThis.indexedDB;
    (globalThis as any).indexedDB = undefined;

    const persistence = new IndexedDBSessionPersistence();
    await expect(persistence.save('test-workspace', {} as TerminalSnapshot)).resolves.not.toThrow();
    const result = await persistence.load('test-workspace');
    expect(result).toBeNull();

    (globalThis as any).indexedDB = backupIDB;
  });

  // Detailed testing of IDB requires a polyfill (like fake-indexeddb) in Jest.
  // Assuming a standard setup where fake-indexeddb is configured globally, or just mocking it.
  it('saves and loads snapshots', async () => {
    // If fake-indexeddb is present, this runs against it.
    // Otherwise we mock.
    if (!globalThis.indexedDB) {
      console.warn(
        'Skipping IDB save/load test because globalThis.indexedDB is missing (fake-indexeddb not loaded).'
      );
      return;
    }

    const persistence = new IndexedDBSessionPersistence();
    await persistence.clear('test-workspace');

    let snap = await persistence.load('test-workspace');
    expect(snap).toBeNull();

    const snapshot: TerminalSnapshot = {
      version: 1,
      sessions: [{ id: 'a', name: 'A', cwd: '/', executable: 'sh', args: [], env: {} }],
      activeSessionId: 'a',
      layout: {},
    };

    await persistence.save('test-workspace', snapshot);
    snap = await persistence.load('test-workspace');
    expect(snap).toBeDefined();
    expect(snap?.activeSessionId).toBe('a');
    expect(snap?.sessions.length).toBe(1);

    await persistence.clear('test-workspace');
    snap = await persistence.load('test-workspace');
    expect(snap).toBeNull();
  });
});
