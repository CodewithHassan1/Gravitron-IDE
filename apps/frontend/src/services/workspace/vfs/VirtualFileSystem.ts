// src/services/workspace/vfs/VirtualFileSystem.ts
import { WorkspaceNode } from './WorkspaceNode';
import { WorkspaceTree } from './WorkspaceTree';
import { PathResolver } from './PathResolver';
import { TreeIndex } from './TreeIndex';
import { NodeFactory } from './NodeFactory';
import { TreeWalker, TraversalCallback } from './TreeWalker';

export interface VFSValidationResult {
  isValid: boolean;
  errors: string[];
}

export class VirtualFileSystem {
  private index: TreeIndex;
  private tree: WorkspaceTree;
  private resolver: PathResolver;

  constructor() {
    this.index = new TreeIndex();
    this.tree = new WorkspaceTree(this.index);
    this.resolver = new PathResolver(this.index);
  }

  /**
   * Initializes the VFS with a root node.
   */
  public initializeRoot(name: string = 'workspace', type: string = 'directory'): WorkspaceNode {
    this.index = new TreeIndex();
    this.tree = new WorkspaceTree(this.index);
    this.resolver = new PathResolver(this.index);

    const root =
      type === 'file'
        ? NodeFactory.createFile(name, null, '/', '')
        : NodeFactory.createDirectory(name, null, '/', '');
    this.tree.addNode(root);
    return root;
  }

  // --- Public API ---

  public createFile(path: string): WorkspaceNode {
    const parentPath = this.resolver.dirname(path);
    const parentId = this.resolve(parentPath);
    if (!parentId) throw new Error(`Parent directory ${parentPath} does not exist.`);

    const fileName = this.resolver.basename(path);
    if (!fileName) throw new Error('Filename cannot be empty.');
    const existingChild = this.tree.getChildren(parentId).find((c) => c.name === fileName);
    if (existingChild) throw new Error(`File ${fileName} already exists in ${parentPath}.`);

    const relativePath = path.startsWith('/') ? path.substring(1) : path;
    const file = NodeFactory.createFile(fileName, parentId, path, relativePath);
    this.tree.addNode(file);
    return file;
  }

  public createFolder(path: string): WorkspaceNode {
    const parentPath = this.resolver.dirname(path);
    const parentId = this.resolve(parentPath);
    if (!parentId) throw new Error(`Parent directory ${parentPath} does not exist.`);

    const folderName = this.resolver.basename(path);
    if (!folderName) throw new Error('Folder name cannot be empty.');
    const existingChild = this.tree.getChildren(parentId).find((c) => c.name === folderName);
    if (existingChild) throw new Error(`Folder ${folderName} already exists in ${parentPath}.`);

    const relativePath = path.startsWith('/') ? path.substring(1) : path;
    const folder = NodeFactory.createDirectory(folderName, parentId, path, relativePath);
    this.tree.addNode(folder);
    return folder;
  }

  /**
   * Performs an immutable update of a node and syncs the index.
   */
  public updateNode(nodeId: string, updates: Partial<WorkspaceNode>): void {
    const existing = this.index.get(nodeId);
    if (!existing) return;

    const updated = { ...existing, ...updates };

    // We must manually swap it in the tree and index to preserve immutability
    this.index.remove(existing);
    this.index.add(updated);
  }

  public move(sourcePath: string, destDirPath: string): void {
    const sourceId = this.resolve(sourcePath);
    const destId = this.resolve(destDirPath);

    if (!sourceId) throw new Error(`Source ${sourcePath} not found.`);
    if (!destId) throw new Error(`Destination directory ${destDirPath} not found.`);

    this.tree.moveNode(sourceId, destId);
  }

  public rename(path: string, newName: string): void {
    const nodeId = this.resolve(path);
    if (!nodeId) throw new Error(`Path ${path} not found.`);

    // Check for sibling conflicts
    const parent = this.tree.getParent(nodeId);
    if (parent) {
      const conflict = this.tree.getChildren(parent.id).find((c) => c.name === newName);
      if (conflict)
        throw new Error(`A node named ${newName} already exists in the same directory.`);
    }

    this.tree.renameNode(nodeId, newName);
  }

  public delete(path: string): void {
    const nodeId = this.resolve(path);
    if (!nodeId) return; // Silent if doesn't exist

    if (nodeId === this.index.rootId) {
      throw new Error('Cannot delete the workspace root.');
    }

    this.tree.removeNode(nodeId);
  }

  public find(id: string): Readonly<WorkspaceNode> | undefined {
    return this.index.get(id);
  }

  public resolve(path: string): string | null {
    return this.resolver.resolve(path);
  }

  public getPath(id: string): string | null {
    return this.resolver.getPath(id);
  }

  public walk(startPath: string, callback: TraversalCallback): void {
    const startId = this.resolve(startPath);
    if (!startId) throw new Error(`Path ${startPath} not found.`);
    this.tree.walker.dfsPreOrder(startId, callback);
  }

  /**
   * Serializes the current tree state.
   * Useful for the forthcoming Persistence layer.
   */
  public snapshot(): WorkspaceNode[] {
    const nodes: WorkspaceNode[] = [];
    if (this.index.rootId) {
      this.tree.walker.dfsPreOrder(this.index.rootId, (node) => {
        nodes.push(node);
      });
    }
    return nodes;
  }

  /**
   * Rehydrates a tree from a snapshot list of nodes.
   */
  public rehydrate(nodes: WorkspaceNode[]): void {
    this.index = new TreeIndex();
    this.tree = new WorkspaceTree(this.index);
    this.resolver = new PathResolver(this.index);

    for (let node of nodes) {
      if (!node.parentId) {
        node = { ...node, path: '/', relativePath: '' };
      }
      this.tree.addNode(node);
    }

    const validation = this.validate();
    if (!validation.isValid) {
      throw new Error(`Tree rehydration failed validation: ${validation.errors.join(', ')}`);
    }
  }

  // --- Validation ---

  public validate(): VFSValidationResult {
    const errors: string[] = [];
    let rootCount = 0;

    const visited = new Set<string>();

    this.index.nodes.forEach((node, id) => {
      // Identity Check
      if (id !== node.id) {
        errors.push(`Node mapping mismatch for ID ${id}. Node actually has ID ${node.id}.`);
      }

      // Root Check
      if (!node.parentId) {
        rootCount++;
      } else {
        // Parent Existence Check
        if (!this.index.has(node.parentId)) {
          errors.push(`Orphan node: ${node.id} references missing parent ${node.parentId}.`);
        } else {
          // Parent Child Link Check
          const parentChildren = this.index.getChildren(node.parentId);
          if (!parentChildren.includes(node.id)) {
            errors.push(
              `Node ${node.id} claims parent ${node.parentId}, but parent does not list it as a child.`
            );
          }
        }
      }

      // Cyclic Reference Check (detect cycles by tracing up to root)
      let currentId: string | null = node.parentId;
      const pathSet = new Set<string>();
      pathSet.add(node.id);

      while (currentId) {
        if (pathSet.has(currentId)) {
          errors.push(`Cyclic reference detected involving node ${currentId}.`);
          break;
        }
        pathSet.add(currentId);
        const parent = this.index.get(currentId);
        currentId = parent ? parent.parentId : null;
      }

      // Duplicate child references
      if (node.type === 'directory') {
        const uniqueChildren = new Set(node.children);
        if (uniqueChildren.size !== node.children.length) {
          errors.push(`Node ${node.id} has duplicate references in its children array.`);
        }
      }

      visited.add(id);
    });

    if (rootCount === 0 && this.index.nodes.size > 0) {
      errors.push(`No root node found.`);
    } else if (rootCount > 1) {
      errors.push(`Multiple root nodes found (${rootCount}).`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
