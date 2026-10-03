// src/services/workspace/vfs/TreeWalker.ts
import { TreeIndex } from './TreeIndex';
import { WorkspaceNode } from './WorkspaceNode';

export type TraversalCallback = (node: Readonly<WorkspaceNode>) => boolean | void;

export class TreeWalker {
  constructor(private index: TreeIndex) {}

  /**
   * Breadth-First Search traversal.
   * If the callback returns explicitly `false`, it stops traversing children of that node.
   */
  public bfs(startNodeId: string, callback: TraversalCallback): void {
    const startNode = this.index.get(startNodeId);
    if (!startNode) return;

    const queue: WorkspaceNode[] = [startNode];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const shouldContinue = callback(current);

      if (shouldContinue !== false && current.type === 'directory') {
        const childrenIds = this.index.getChildren(current.id);
        for (const childId of childrenIds) {
          const childNode = this.index.get(childId);
          if (childNode) {
            queue.push(childNode);
          }
        }
      }
    }
  }

  /**
   * Depth-First Search traversal (Pre-order).
   * If the callback returns explicitly `false`, it stops traversing children of that node.
   */
  public dfsPreOrder(startNodeId: string, callback: TraversalCallback): void {
    const startNode = this.index.get(startNodeId);
    if (!startNode) return;

    const stack: WorkspaceNode[] = [startNode];

    while (stack.length > 0) {
      const current = stack.pop()!;
      const shouldContinue = callback(current);

      if (shouldContinue !== false && current.type === 'directory') {
        const childrenIds = this.index.getChildren(current.id);
        // Push in reverse order so they pop in correct order
        for (let i = childrenIds.length - 1; i >= 0; i--) {
          const childNode = this.index.get(childrenIds[i]);
          if (childNode) {
            stack.push(childNode);
          }
        }
      }
    }
  }

  /**
   * Depth-First Search traversal (Post-order).
   */
  public dfsPostOrder(startNodeId: string, callback: TraversalCallback): void {
    const startNode = this.index.get(startNodeId);
    if (!startNode) return;

    // Use two stacks for iterative post-order traversal
    const stack1: WorkspaceNode[] = [startNode];
    const stack2: WorkspaceNode[] = [];

    while (stack1.length > 0) {
      const current = stack1.pop()!;
      stack2.push(current);

      if (current.type === 'directory') {
        const childrenIds = this.index.getChildren(current.id);
        for (const childId of childrenIds) {
          const childNode = this.index.get(childId);
          if (childNode) {
            stack1.push(childNode);
          }
        }
      }
    }

    while (stack2.length > 0) {
      const current = stack2.pop()!;
      callback(current);
    }
  }

  /**
   * Filtered traversal returning matching nodes.
   */
  public filter(startNodeId: string, predicate: (node: Readonly<WorkspaceNode>) => boolean): Readonly<WorkspaceNode>[] {
    const results: WorkspaceNode[] = [];
    this.dfsPreOrder(startNodeId, (node) => {
      if (predicate(node)) {
        results.push(node);
      }
    });
    return results;
  }
}
