import Fuse from 'fuse.js';
import { WorkspaceNode } from '../../types/ide';

export class ExplorerFilterService {
  private fuseOptions = {
    keys: ['name'],
    threshold: 0.4,
    ignoreLocation: true,
  };

  /**
   * Returns a set of node IDs that match the search filter.
   * If the searchFilter is empty, returns null.
   */
  public filter(nodes: WorkspaceNode[], searchFilter: string): Set<string> | null {
    if (!searchFilter) {
      return null;
    }

    // Flatten all nodes to feed into Fuse
    const flatNodes: WorkspaceNode[] = [];
    const flatten = (nodeList: WorkspaceNode[]) => {
      for (const node of nodeList) {
        flatNodes.push(node);
        if (node.children) {
          flatten(node.children as unknown as WorkspaceNode[]);
        }
      }
    };
    flatten(nodes);

    const fuse = new Fuse(flatNodes, this.fuseOptions);
    const results = fuse.search(searchFilter);
    
    return new Set(results.map(r => r.item.id));
  }
}

export const explorerFilterService = new ExplorerFilterService();
