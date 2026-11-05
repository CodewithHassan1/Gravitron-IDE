// src/services/workspace/vfs/PathResolver.ts
import { TreeIndex } from './TreeIndex';
import { WorkspaceNode } from './WorkspaceNode';

export class PathResolver {
  constructor(private index: TreeIndex) {}

  /**
   * Dynamically computes the absolute path of a node by walking up the tree.
   * O(depth) time complexity.
   */
  public getPath(nodeId: string): string | null {
    const node = this.index.get(nodeId);
    if (!node) return null;

    if (!node.parentId) {
      return '/';
    }

    const pathSegments: string[] = [];
    let current: WorkspaceNode | undefined = node;

    while (current && current.parentId !== null) {
      pathSegments.unshift(current.name);
      current = this.index.get(current.parentId);
    }

    // current is now the root node
    if (!current && pathSegments.length > 0) {
      // Orphaned node structure
      return null;
    }

    return '/' + pathSegments.join('/');
  }

  /**
   * Resolves an absolute path string to a node ID.
   * O(depth) time complexity.
   */
  public resolve(path: string): string | null {
    const normalized = this.normalize(path);
    if (normalized === '/') {
      return this.index.rootId;
    }

    if (!this.index.rootId) return null;

    const segments = normalized.split('/').filter(Boolean);
    let currentId = this.index.rootId;

    for (const segment of segments) {
      let foundChildId: string | null = null;
      const childrenIds = this.index.getChildren(currentId);

      for (const childId of childrenIds) {
        const childNode = this.index.get(childId);
        if (childNode && childNode.name === segment) {
          foundChildId = childId;
          break;
        }
      }

      if (!foundChildId) return null; // Path breaks
      currentId = foundChildId;
    }

    return currentId;
  }

  public normalize(path: string): string {
    if (!path) return '/';
    // Remove duplicate slashes
    let normalized = path.replace(/\/+/g, '/');
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized;
    }
    return normalized;
  }

  public join(...segments: string[]): string {
    return this.normalize(segments.join('/'));
  }

  public basename(path: string): string {
    const normalized = this.normalize(path);
    if (normalized === '/') return '';
    const parts = normalized.split('/');
    return parts[parts.length - 1];
  }

  public dirname(path: string): string {
    const normalized = this.normalize(path);
    if (normalized === '/') return '/';
    const parts = normalized.split('/');
    parts.pop();
    if (parts.length === 1 && parts[0] === '') return '/';
    return parts.join('/');
  }

  public extension(path: string): string {
    const base = this.basename(path);
    const lastDotIndex = base.lastIndexOf('.');
    if (lastDotIndex > 0 && lastDotIndex < base.length - 1) {
      return base.substring(lastDotIndex).toLowerCase();
    }
    return '';
  }

  /**
   * Finds the common ancestor node ID of two node IDs.
   */
  public commonAncestor(nodeId1: string, nodeId2: string): string | null {
    const ancestors1 = new Set<string>();
    let current1 = this.index.get(nodeId1);

    while (current1) {
      ancestors1.add(current1.id);
      if (!current1.parentId) break;
      current1 = this.index.get(current1.parentId);
    }

    let current2 = this.index.get(nodeId2);
    while (current2) {
      if (ancestors1.has(current2.id)) {
        return current2.id;
      }
      if (!current2.parentId) break;
      current2 = this.index.get(current2.parentId);
    }

    return null;
  }

  public relativePath(fromNodeId: string, toNodeId: string): string | null {
    const fromPath = this.getPath(fromNodeId);
    const toPath = this.getPath(toNodeId);

    if (!fromPath || !toPath) return null;

    // Simple relative string math (doesn't handle ascending ../ completely yet for simplicity)
    if (toPath.startsWith(fromPath + '/')) {
      return toPath.substring(fromPath.length + 1);
    }

    return null;
  }
}
