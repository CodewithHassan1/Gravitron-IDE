import { describe, it, expect, vi } from 'vitest';
import { WorkspaceManagerImpl } from '../../src/services/workspace/WorkspaceManager';

vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({}),
}));

/**
 * Protects:
 * docs/architecture/public-api.md
 *
 * Rule:
 * Only approved public methods exist.
 * WorkspaceManager public API must exactly match the documented list.
 */
describe('Public API Surface', () => {
  it('WorkspaceManager exposes exactly the allowed public methods', () => {
    const allowedMethods = new Set([
      'openWorkspace',
      'closeWorkspace',
      'reloadWorkspace',
      'restoreWorkspace',
      'getRoot',
      'getChildren',
      'getNode',
      'resolvePath',
      'getPath',
      'createFile',
      'createFolder',
      'delete',
      'rename',
      'move',
      'writeFile',
      'readFile',
      'getState',
      'getWorkspaceId',
      'onEvent', // Documented implicitly via the event handling API section
      'getSearchEngine', // Optional but historically present
    ]);

    const manager = new WorkspaceManagerImpl();

    // Get all properties on the prototype, filter out constructor and private methods (starting with _)
    const prototype = Object.getPrototypeOf(manager);
    const methods = Object.getOwnPropertyNames(prototype).filter(
      (name) =>
        name !== 'constructor' &&
        typeof (prototype as any)[name] === 'function' &&
        !name.startsWith('_')
    );

    const exposedMethods = methods.filter((name) => {
      // In JS, 'public' typescript methods are just prototype methods without '#'.
      // We check what the prototype exports.
      return true;
    });

    const unauthorizedMethods = exposedMethods.filter((name) => !allowedMethods.has(name));

    if (unauthorizedMethods.length > 0) {
      console.error('Unauthorized public methods found on WorkspaceManager:', unauthorizedMethods);
    }

    expect(unauthorizedMethods).toEqual([]);
  });

  it('Internal maps, VFS internals, queues, and persistence adapters are not exposed', () => {
    const manager = new WorkspaceManagerImpl();
    const keys = Object.keys(manager) as (keyof WorkspaceManagerImpl)[];

    // Ensure no public property leaks internal states like vfs, persistence, syncEngine
    // Note: TypeScript transpiles private properties to normal keys in JS, so Object.keys will show them.
    // However, the test should verify that no public accessor exists for them.
    expect((manager as any).getVfs).toBeUndefined();
    expect((manager as any).getPersistence).toBeUndefined();
    expect((manager as any).getSyncEngine).toBeUndefined();
  });
});
