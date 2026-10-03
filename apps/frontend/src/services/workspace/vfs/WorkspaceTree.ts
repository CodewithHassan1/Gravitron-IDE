// src/services/workspace/vfs/WorkspaceTree.ts
import { TreeIndex } from './TreeIndex';
import { WorkspaceNode, cloneNode } from './WorkspaceNode';
import { TreeWalker } from './TreeWalker';
import { NodeFactory } from './NodeFactory';

export class WorkspaceTree {
  public readonly index: TreeIndex;
  public readonly walker: TreeWalker;

  constructor(index?: TreeIndex) {
    this.index = index || new TreeIndex();
    this.walker = new TreeWalker(this.index);
  }

  /**
   * Adds a new node to the tree.
   * Throws if the parent doesn't exist (unless it's the root node).
   */
  public addNode(node: WorkspaceNode): void {
    if (this.index.has(node.id)) {
      throw new Error(`Node with id ${node.id} already exists.`);
    }

    if (node.parentId && !this.index.has(node.parentId)) {
      throw new Error(`Parent node ${node.parentId} does not exist.`);
    }

    if (!node.parentId && this.index.rootId && this.index.rootId !== node.id) {
      throw new Error(`Cannot have multiple roots. Current root is ${this.index.rootId}.`);
    }

    const cloned = cloneNode(node);
    
    // Add to parent's children array
    if (cloned.parentId) {
      const parent = this.index.get(cloned.parentId);
      if (parent && !parent.children.includes(cloned.id)) {
        parent.children.push(cloned.id);
        parent.metadata.modified = Date.now();
      }
    }

    this.index.add(cloned);
  }

  /**
   * Removes a node and all of its descendants from the tree.
   */
  public removeNode(nodeId: string): void {
    if (!this.index.has(nodeId)) return;

    // Collect all descendants to remove them from index
    const toRemove: string[] = [];
    this.walker.dfsPostOrder(nodeId, (n) => {
      toRemove.push(n.id);
    });

    const rootToRemove = this.index.get(nodeId)!;

    // Detach from parent
    if (rootToRemove.parentId) {
      const parent = this.index.get(rootToRemove.parentId);
      if (parent) {
        parent.children = parent.children.filter((id) => id !== nodeId);
        parent.metadata.modified = Date.now();
      }
    }

    // Remove all from index
    for (const id of toRemove) {
      const node = this.index.get(id);
      if (node) {
        this.index.remove(node);
      }
    }
  }

  /**
   * Moves a node to a new parent directory.
   */
  public moveNode(nodeId: string, newParentId: string): void {
    const node = this.index.get(nodeId);
    const newParent = this.index.get(newParentId);

    if (!node) throw new Error(`Node ${nodeId} not found.`);
    if (!newParent) throw new Error(`Parent ${newParentId} not found.`);
    if (newParent.type !== 'directory') throw new Error(`Target parent is not a directory.`);
    
    // Prevent moving a directory into itself or its descendants
    if (node.type === 'directory') {
      const descendants = this.getDescendants(nodeId);
      if (descendants.some(d => d.id === newParentId) || nodeId === newParentId) {
        throw new Error(`Cannot move a directory into itself or its descendants.`);
      }
    }

    const oldParentId = node.parentId;
    if (oldParentId === newParentId) return;

    // Remove from old parent
    if (oldParentId) {
      const oldParent = this.index.get(oldParentId);
      if (oldParent) {
        oldParent.children = oldParent.children.filter(id => id !== nodeId);
        oldParent.metadata.modified = Date.now();
      }
    }

    // Update node
    this.index.remove(node); // Temporarily remove to update index mappings
    node.parentId = newParentId;
    node.metadata.modified = Date.now();
    this.index.add(node);

    // Add to new parent
    newParent.children.push(nodeId);
    newParent.metadata.modified = Date.now();
  }

  /**
   * Renames a node.
   */
  public renameNode(nodeId: string, newName: string): void {
    const node = this.index.get(nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found.`);

    this.index.remove(node); // Remove from old name maps
    node.name = newName;
    
    // Update extension if it's a file
    if (node.type === 'file') {
      const lastDotIndex = newName.lastIndexOf('.');
      node.extension = (lastDotIndex > 0 && lastDotIndex < newName.length - 1) 
        ? newName.substring(lastDotIndex).toLowerCase() 
        : '';
    }

    node.metadata.modified = Date.now();
    this.index.add(node); // Re-index
  }

  /**
   * Deep clones a subtree, generating new UUIDs for all nodes.
   */
  public cloneSubtree(nodeId: string, newParentId: string, newName?: string): WorkspaceNode {
    const originalRoot = this.index.get(nodeId);
    if (!originalRoot) throw new Error(`Node ${nodeId} not found.`);

    const parentNode = this.index.get(newParentId);
    if (!parentNode) throw new Error(`New parent node ${newParentId} not found.`);

    const finalName = newName || originalRoot.name;
    const newPath = parentNode.path === '/' ? `/${finalName}` : `${parentNode.path}/${finalName}`;
    const newRelativePath = newPath.startsWith('/') ? newPath.substring(1) : newPath;

    const clonedRoot = originalRoot.type === 'directory' 
      ? NodeFactory.createDirectory(finalName, newParentId, newPath, newRelativePath, originalRoot.metadata)
      : NodeFactory.createFile(finalName, newParentId, newPath, newRelativePath, originalRoot.metadata);

    this.addNode(clonedRoot);

    if (originalRoot.type === 'directory') {
      const childrenIds = this.index.getChildren(nodeId);
      for (const childId of childrenIds) {
        this.cloneSubtree(childId, clonedRoot.id);
      }
    }

    return clonedRoot;
  }

  public getChildren(nodeId: string): Readonly<WorkspaceNode>[] {
    const childrenIds = this.index.getChildren(nodeId);
    return childrenIds.map(id => this.index.get(id)!).filter(Boolean);
  }

  public getParent(nodeId: string): Readonly<WorkspaceNode> | null {
    const node = this.index.get(nodeId);
    if (!node || !node.parentId) return null;
    return this.index.get(node.parentId) || null;
  }

  public getAncestors(nodeId: string): Readonly<WorkspaceNode>[] {
    const ancestors: WorkspaceNode[] = [];
    let current = this.getParent(nodeId);
    while (current) {
      ancestors.push(current);
      current = this.getParent(current.id);
    }
    return ancestors;
  }

  public getDescendants(nodeId: string): Readonly<WorkspaceNode>[] {
    const descendants: WorkspaceNode[] = [];
    this.walker.dfsPreOrder(nodeId, (node) => {
      if (node.id !== nodeId) descendants.push(node);
    });
    return descendants;
  }
}
