// src/services/workspace/vfs/TreeIndex.ts
import { WorkspaceNode } from './WorkspaceNode';

export class TreeIndex {
  // Primary indices
  public nodes: Map<string, WorkspaceNode> = new Map();
  public children: Map<string, Set<string>> = new Map();
  public pathMap: Map<string, string> = new Map();

  // Secondary indices
  public extensionMap: Map<string, Set<string>> = new Map();
  public nameMap: Map<string, Set<string>> = new Map();

  public rootId: string | null = null;

  /**
   * Adds or updates a node in the index.
   */
  public add(node: WorkspaceNode): void {
    this.nodes.set(node.id, node);
    this.pathMap.set(node.path, node.id);

    // Parent -> Children tracking
    if (node.parentId) {
      if (!this.children.has(node.parentId)) {
        this.children.set(node.parentId, new Set());
      }
      this.children.get(node.parentId)!.add(node.id);
    } else {
      // Must be the root node
      this.rootId = node.id;
    }

    // Extension tracking (files only)
    if (node.type === 'file' && node.extension) {
      if (!this.extensionMap.has(node.extension)) {
        this.extensionMap.set(node.extension, new Set());
      }
      this.extensionMap.get(node.extension)!.add(node.id);
    }

    // Name tracking (for fast exact name searches)
    if (!this.nameMap.has(node.name)) {
      this.nameMap.set(node.name, new Set());
    }
    this.nameMap.get(node.name)!.add(node.id);
  }

  /**
   * Removes a node from the index.
   */
  public remove(node: WorkspaceNode): void {
    this.nodes.delete(node.id);
    this.pathMap.delete(node.path);

    if (node.parentId && this.children.has(node.parentId)) {
      this.children.get(node.parentId)!.delete(node.id);
    }

    if (node.type === 'file' && node.extension && this.extensionMap.has(node.extension)) {
      this.extensionMap.get(node.extension)!.delete(node.id);
      if (this.extensionMap.get(node.extension)!.size === 0) {
        this.extensionMap.delete(node.extension);
      }
    }

    if (this.nameMap.has(node.name)) {
      this.nameMap.get(node.name)!.delete(node.id);
      if (this.nameMap.get(node.name)!.size === 0) {
        this.nameMap.delete(node.name);
      }
    }

    if (this.rootId === node.id) {
      this.rootId = null;
    }
  }

  public get(id: string): WorkspaceNode | undefined {
    return this.nodes.get(id);
  }

  public getByPath(path: string): string | undefined {
    return this.pathMap.get(path);
  }

  public has(id: string): boolean {
    return this.nodes.has(id);
  }

  public getChildren(parentId: string): string[] {
    const set = this.children.get(parentId);
    return set ? Array.from(set) : [];
  }
}
