import { RepositorySnapshot, RepositoryNode } from './Snapshot';

export interface TreeDiffResult {
  added: RepositoryNode[];
  removed: RepositoryNode[];
  modified: RepositoryNode[];
  moved: { oldNode: RepositoryNode, newNode: RepositoryNode }[];
  renamed: { oldNode: RepositoryNode, newNode: RepositoryNode }[];
}

export class RepositoryDiff {
  static compute(oldSnapshot: RepositorySnapshot, newSnapshot: RepositorySnapshot): TreeDiffResult {
    const result: TreeDiffResult = {
      added: [],
      removed: [],
      modified: [],
      moved: [],
      renamed: []
    };

    const oldNodes = oldSnapshot.nodesById;
    const newNodes = newSnapshot.nodesById;

    // Detect Additions and Modifications
    for (const [id, newNode] of Array.from(newNodes.entries())) {
      if (!oldNodes.has(id)) {
        result.added.push(newNode);
      } else {
        const oldNode = oldNodes.get(id)!;
        if (oldNode.updatedAt !== newNode.updatedAt || oldNode.size !== newNode.size) {
          result.modified.push(newNode);
        }
        if (oldNode.parentId !== newNode.parentId) {
          result.moved.push({ oldNode, newNode });
        }
        if (oldNode.name !== newNode.name && oldNode.parentId === newNode.parentId) {
          result.renamed.push({ oldNode, newNode });
        }
      }
    }

    // Detect Removals
    for (const [id, oldNode] of Array.from(oldNodes.entries())) {
      if (!newNodes.has(id)) {
        result.removed.push(oldNode);
      }
    }

    return result;
  }
}
