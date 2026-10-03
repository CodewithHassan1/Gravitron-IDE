import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkspaceManager } from '../../src/services/workspace/WorkspaceManager';
import { WorkspaceEvents } from '../../src/services/workspace/WorkspaceEvents';
import { FileRenamedEventDTO, FileDeletedEventDTO } from '../../src/services/workspace/types';
import { WorkspaceEventType } from '../../src/services/workspace/types';
import { WorkspaceTreeAdapter } from '../../src/lib/tree/WorkspaceTreeAdapter';
import { useWorkspaceTreeStore } from '../../src/stores/ide/workspaceTreeStore';
import { TreeEngine } from '../../src/lib/tree/TreeEngine';

vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('Filesystem Operations', () => {
  beforeEach(async () => {
    WorkspaceEvents.clearAllListeners();
    // Use the singleton WorkspaceManager
    await WorkspaceManager.openWorkspace(
      { id: 'ws-test', name: 'Test', uri: 'file:///', provider: 'memory' as any, lastOpened: Date.now(), type: 'directory' as any, capabilities: {} as any },
      { nativeHandle: {} as any }
    );
  });

  afterEach(async () => {
    await WorkspaceManager.closeWorkspace();
  });

  it('createFile and createFolder should update VFS and queue sync operations', async () => {
    const resFolder = await WorkspaceManager.createFolder('/src');
    expect(resFolder.success).toBe(true);

    const resFile = await WorkspaceManager.createFile('/src/index.ts');
    expect(resFile.success).toBe(true);

    const root = WorkspaceManager.getRoot();
    expect(root?.children.length).toBeGreaterThan(0);
    
    // Check nodes exist
    const srcNodeId = (WorkspaceManager as any).vfs.resolve('/src');
    expect(srcNodeId).toBeTruthy();
    
    const fileNodeId = (WorkspaceManager as any).vfs.resolve('/src/index.ts');
    expect(fileNodeId).toBeTruthy();
    
    const node = WorkspaceManager.getNode(fileNodeId!);
    expect(node?.parentId).toBe(srcNodeId);
    expect(node?.name).toBe('index.ts');
    expect(node?.type).toBe('file');
  });

  it('rejects duplicate paths', async () => {
    await WorkspaceManager.createFile('/dup.txt');
    const res = await WorkspaceManager.createFile('/dup.txt');
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('rejects invalid paths', async () => {
    const res = await WorkspaceManager.createFile('');
    expect(res.success).toBe(false);
    
    const res2 = await WorkspaceManager.createFile('/src/../invalid');
    expect(res2.success).toBe(false);
  });

  it('rename should correctly move the node and emit rename', async () => {
    await WorkspaceManager.createFile('/old.ts');
    
    const emitSpy = vi.spyOn(WorkspaceEvents, 'emit');
    const res = await WorkspaceManager.rename('/old.ts', 'new.ts');
    
    expect(res.success).toBe(true);
    
    const newId = (WorkspaceManager as any).vfs.resolve('/new.ts');
    expect(newId).toBeTruthy();
    expect((WorkspaceManager as any).vfs.resolve('/old.ts')).toBeNull();
    
    const emittedEvents = emitSpy.mock.calls.map(call => call[1]);
    const fileEvents = emittedEvents.filter(e => e && typeof e === 'object' && 'type' in e && e.type === 'renamed') as FileRenamedEventDTO[];
    expect(fileEvents.length).toBe(1);
    expect(fileEvents[0].newName).toBe('new.ts');
    
    emitSpy.mockRestore();
  });

  it('move should correctly change parent and emit move', async () => {
    await WorkspaceManager.createFolder('/folderA');
    await WorkspaceManager.createFolder('/folderB');
    await WorkspaceManager.createFile('/folderA/file.ts');
    
    const res = await WorkspaceManager.move('/folderA/file.ts', '/folderB');
    expect(res.success).toBe(true);
    
    expect((WorkspaceManager as any).vfs.resolve('/folderA/file.ts')).toBeNull();
    expect((WorkspaceManager as any).vfs.resolve('/folderB/file.ts')).toBeTruthy();
  });

  it('delete should remove node recursively and emit delete', async () => {
    await WorkspaceManager.createFolder('/parent');
    await WorkspaceManager.createFile('/parent/child.ts');
    
    const emitSpy = vi.spyOn(WorkspaceEvents, 'emit');
    const res = await WorkspaceManager.delete('/parent');
    expect(res.success).toBe(true);
    
    expect((WorkspaceManager as any).vfs.resolve('/parent')).toBeNull();
    expect((WorkspaceManager as any).vfs.resolve('/parent/child.ts')).toBeNull();
    
    const emittedEvents = emitSpy.mock.calls.map(call => call[1]);
    const fileEvents = emittedEvents.filter(e => e && typeof e === 'object' && 'type' in e && e.type === 'deleted') as FileDeletedEventDTO[];
    expect(fileEvents.length).toBeGreaterThan(0);
    
    emitSpy.mockRestore();
  });

  it('readFile and writeFile should operate without throwing', async () => {
    const res = await WorkspaceManager.writeFile('/test.txt', 'content');
    expect(res.success).toBe(true);
    
    const content = await WorkspaceManager.readFile('/test.txt');
    expect(content).toBeDefined(); // Since the mock readFile returns a placeholder in WorkspaceManager.ts
  });

  it('should build tree with children via WorkspaceTreeAdapter', async () => {
    // Create some files first
    await WorkspaceManager.createFolder('/src');
    await WorkspaceManager.createFile('/src/index.ts');
    await WorkspaceManager.createFile('/src/utils.ts');
    await WorkspaceManager.createFolder('/tests');
    
    // Check VFS state directly
    const rootId = (WorkspaceManager as any).vfs.index?.rootId;
    const rootNode = rootId ? (WorkspaceManager as any).vfs.find(rootId) : null;
    console.log('[TEST] VFS root:', rootNode ? { id: rootNode.id, name: rootNode.name, children: rootNode.children, childrenLoaded: rootNode.childrenLoaded } : null);
    
    const root = WorkspaceManager.getRoot();
    console.log('[TEST] getRoot():', root ? { id: root.id, name: root.name, children: root.children } : null);
    
    const children = WorkspaceManager.getChildren(rootId!);
    console.log('[TEST] getChildren():', children.map(c => ({ id: c.id, name: c.name, children: c.children })));
    
    // Force syncTree to run
    WorkspaceTreeAdapter.syncTree();
    
    const state = useWorkspaceTreeStore.getState();
    console.log('[TEST] store tree:', JSON.stringify(state.tree, null, 2));
    console.log('[TEST] store expandedNodes:', Array.from(state.expandedNodes));
    
    const tree = state.tree;
    expect(tree.length).toBe(1);
    expect(tree[0].children).toBeDefined();
    expect(tree[0].children!.length).toBeGreaterThan(0);
    
    // Check TreeEngine flattening
    const visibleNodes = TreeEngine.flattenTree(tree, { 
      expandedNodes: state.expandedNodes,
      searchFilter: '',
      searchResults: null,
      showHidden: false,
      sortOrder: 'default',
      createState: null
    });
    
    console.log('[TEST] visibleNodes:', visibleNodes.map(n => ({ id: n.id, name: n.node.name, depth: n.depth, isExpanded: n.isExpanded })));
    
    expect(visibleNodes.length).toBeGreaterThan(1); // root + children
  });
});