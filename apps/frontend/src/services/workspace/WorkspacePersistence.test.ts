import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WorkspacePersistence } from './WorkspacePersistence';
import { WorkspaceMetadata } from './types';
import 'fake-indexeddb/auto'; // Polyfill IndexedDB for node tests

import { WorkspaceEvents } from './WorkspaceEvents';

// Define window for initDB check
if (typeof global !== 'undefined') {
  (global as any).window = global;
}

describe('WorkspacePersistence', () => {
  let persistence: WorkspacePersistence;

  beforeEach(() => {
    persistence = new WorkspacePersistence();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Workspace Metadata', () => {
    it('should save and retrieve a workspace successfully', async () => {
      const metadata: WorkspaceMetadata = {
        id: 'ws-123',
        name: 'Test Workspace',
        uri: '/test',
        provider: 'browser',
        lastOpened: Date.now(),
        type: 'directory',
        capabilities: { explorer: true, recursiveSearch: true, git: false, terminal: false, multipleRoots: false, writable: true }
      };

      await persistence.saveWorkspace(metadata, { nativeHandle: 'mock-handle' });

      const result = await persistence.getWorkspace('ws-123');
      expect(result).toBeDefined();
      expect(result?.metadata.id).toBe('ws-123');
      expect(result?.metadata.name).toBe('Test Workspace');
      expect(result?.handle?.nativeHandle).toBe('mock-handle');
    });

    it('should return null for non-existent workspace', async () => {
      const result = await persistence.getWorkspace('unknown-ws');
      expect(result).toBeNull();
    });

    it('should list multiple workspaces sorted by lastOpened', async () => {
      const ws1: WorkspaceMetadata = {
        id: 'ws-1', name: 'WS 1', uri: '/w1', provider: 'browser',
        lastOpened: 1000, type: 'directory', capabilities: { explorer: true, recursiveSearch: true, git: false, terminal: false, multipleRoots: false, writable: true }
      };
      const ws2: WorkspaceMetadata = {
        id: 'ws-2', name: 'WS 2', uri: '/w2', provider: 'browser',
        lastOpened: 2000, type: 'directory', capabilities: { explorer: true, recursiveSearch: true, git: false, terminal: false, multipleRoots: false, writable: true }
      };

      await persistence.saveWorkspace(ws1, null);
      await persistence.saveWorkspace(ws2, null);

      const list = await persistence.listWorkspaces();
      expect(list.length).toBeGreaterThanOrEqual(2);
      
      // WS 2 should be first because it was opened later (2000 > 1000)
      const w1Index = list.findIndex(w => w.id === 'ws-1');
      const w2Index = list.findIndex(w => w.id === 'ws-2');
      expect(w2Index).toBeLessThan(w1Index);
    });
  });

  describe('Snapshots (Cross-Workspace Isolation)', () => {
    it('should save and load snapshot for specific workspaceId', async () => {
      const snapshot = {
        version: 1,
        nodes: [
          { id: 'node-1', name: 'root', type: 'directory', path: '/', parentId: null, children: [], childrenLoaded: true, metadata: {}, content: null }
        ]
      } as any;

      await persistence.saveSnapshot('ws-snapshot-1', snapshot);
      
      const result = await persistence.getSnapshot('ws-snapshot-1');
      expect(result).toBeDefined();
      expect(result?.nodes.length).toBe(1);
      expect(result?.nodes[0].name).toBe('root');

      // Should be isolated
      const emptyResult = await persistence.getSnapshot('ws-snapshot-2');
      expect(emptyResult).toBeNull();
    });
  });
});
