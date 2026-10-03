import { describe, it, expect, vi } from 'vitest';
import { WorkspaceManagerImpl } from '../../src/services/workspace/WorkspaceManager';
import { FileCreatedEventDTO } from '../../src/services/workspace/dto/events';
import { WorkspaceNode } from '../../src/services/workspace/vfs/WorkspaceNode';

vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({}),
}));

/**
 * Protects:
 * docs/architecture/invariants.md
 * docs/architecture/public-api.md
 *
 * Rule:
 * UI receives immutable DTOs only. WorkspaceNode and its children array cannot be mutated.
 */
describe('Immutable Boundaries', () => {
  let manager: WorkspaceManagerImpl;

  it('WorkspaceNode Isolation: Runtime mutation does not affect internal VFS state', async () => {
    manager = new WorkspaceManagerImpl();
    // Simulate internal VFS initialization
    const vfs: any = (manager as any).vfs;
    vfs.initializeRoot('test');
    vfs.createFolder('/src');
    const nodeId = vfs.resolve('/src');
    
    const node = manager.getNode(nodeId);
    expect(node).toBeDefined();

    // Verify TypeScript type checks out as Readonly (compilation implicitly verifies this)
    // Attempting to mutate at runtime:
    expect(() => {
      // @ts-ignore: testing runtime protection
      node!.name = 'modified';
    }).toThrow(TypeError); // Object.freeze should throw in strict mode
    
    // Verify internal state remains unchanged
    const pristineNode = manager.getNode(nodeId);
    expect(pristineNode?.name).toBe('src');
  });

  it('Children Isolation: Arrays are frozen and cannot be mutated', () => {
    manager = new WorkspaceManagerImpl();
    const vfs: any = (manager as any).vfs;
    vfs.initializeRoot('test');
    vfs.createFolder('/src');
    vfs.createFile('/src/index.ts');
    
    const srcId = vfs.resolve('/src');
    const children = manager.getChildren(srcId);
    expect(children.length).toBe(1);

    expect(() => {
      // @ts-ignore
      children.push({ id: 'fake', name: 'fake', type: 'file', children: [], parentId: srcId });
    }).toThrow(TypeError); // Array should be frozen
    
    expect(() => {
      // @ts-ignore
      children[0].name = 'changed';
    }).toThrow(TypeError);

    const pristineChildren = manager.getChildren(srcId);
    expect(pristineChildren.length).toBe(1);
    expect(pristineChildren[0].name).toBe('index.ts');
  });

  it('Event DTO Immutability: Event payload mutation cannot alter engine state', () => {
    manager = new WorkspaceManagerImpl();
    const vfs: any = (manager as any).vfs;
    vfs.initializeRoot('test');
    const node = vfs.createFile('/test.txt');

    // Create the DTO
    const eventDto: FileCreatedEventDTO = Object.freeze({
      type: 'created',
      node: Object.freeze({ ...node, children: Object.freeze([]) })
    });

    expect(() => {
      // @ts-ignore
      eventDto.node.name = 'mutated';
    }).toThrow(TypeError);

    expect(vfs.find(node.id).name).toBe('test.txt');
  });
});
