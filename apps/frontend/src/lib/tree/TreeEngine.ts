import { WorkspaceNode } from '../../types/ide';

export interface VisibleNode {
  id: string;
  node: WorkspaceNode;
  depth: number;
  isExpanded: boolean;
  hasChildren: boolean;
}

export interface TreeEngineOptions {
  expandedNodes: Set<string>;
  searchFilter: string;
  searchResults: Set<string> | null;
  showHidden: boolean;
  sortOrder: string;
  createState: { parentId: string | null; type: 'file' | 'directory' } | null;
}

export class TreeEngine {
  /**
   * Generates a flat list of visible nodes based on expansion state and filters.
   */
  static flattenTree(
    nodes: WorkspaceNode[],
    options: TreeEngineOptions,
    depth: number = 0
  ): VisibleNode[] {
    const { expandedNodes, searchFilter, searchResults, showHidden, sortOrder, createState } =
      options;
    const lowerSearch = searchFilter.toLowerCase();

    if (depth === 0) {
      console.log(
        '[DIAG] TreeEngine.flattenTree() input nodes:',
        nodes.map((n) => ({
          id: n.id,
          name: n.name,
          type: n.type,
          childrenCount: n.children?.length,
          children: n.children,
        }))
      );
      console.log(
        '[FORENSIC:FLATTEN] incoming tree length:',
        nodes.length,
        'root.id:',
        nodes[0]?.id,
        'root.children.length:',
        nodes[0]?.children?.length,
        'expandedNodes:',
        Array.from(options.expandedNodes),
        'expandedNodes.has(root.id):',
        nodes[0] ? options.expandedNodes.has(nodes[0].id) : false
      );
    }

    let result: VisibleNode[] = [];

    // Filter and Sort (directories first, then alphabetical)
    const filteredNodes = nodes
      .filter((node) => {
        if (!showHidden && node.name.startsWith('.')) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortOrder === 'modified') {
          const mTimeA = typeof a.metadata?.modifiedTime === 'number' ? a.metadata.modifiedTime : 0;
          const mTimeB = typeof b.metadata?.modifiedTime === 'number' ? b.metadata.modifiedTime : 0;
          if (mTimeA !== mTimeB) return mTimeB - mTimeA;
        } else if (sortOrder === 'size') {
          const sizeA = typeof a.metadata?.size === 'number' ? a.metadata.size : 0;
          const sizeB = typeof b.metadata?.size === 'number' ? b.metadata.size : 0;
          if (sizeA !== sizeB) return sizeB - sizeA;
        }
        // default: directories first, then alphabetical
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    if (!searchFilter && depth === 0 && createState?.parentId === null) {
      result.push({
        id: '__create__',
        node: {
          id: '__create__',
          workspaceId: '',
          name: '',
          type: createState.type,
          path: '',
          children: [],
          metadata: {},
        },
        depth: 0,
        isExpanded: false,
        hasChildren: createState.type === 'directory',
      });
    }

    for (const node of filteredNodes) {
      const hasChildren = node.type === 'directory';
      const isExpanded = expandedNodes.has(node.id) || !!searchFilter; // auto expand if searching

      console.log('[EXPLORER FORENSIC] FLATTEN');
      console.log('node.id:', node.id);
      console.log('node.name:', node.name);
      console.log('node.type:', node.type);
      console.log('node.children?.length:', node.children?.length);
      console.log('expandedNodes.has(node.id):', expandedNodes.has(node.id));
      console.log('isExpanded:', isExpanded);
      console.log('searchFilter:', searchFilter);

      if (depth === 0) {
        console.log('[DIAG] TreeEngine processing root:', {
          id: node.id,
          name: node.name,
          isExpanded,
          hasChildren,
          hasChildrenProp: !!node.children,
          childrenCount: node.children?.length,
        });
      }

      const visibleNode: VisibleNode = {
        id: node.id,
        node,
        depth,
        isExpanded,
        hasChildren,
      };

      const matchesSearch = searchFilter
        ? searchResults
          ? searchResults.has(node.id)
          : node.name.toLowerCase().includes(lowerSearch)
        : true;

      // If we are searching, we look ahead into children to see if we should include this directory
      if (searchFilter) {
        if (hasChildren && node.children) {
          const childResults = TreeEngine.flattenTree(node.children, options, depth + 1);
          if (childResults.length > 0 || matchesSearch) {
            result.push({ ...visibleNode, isExpanded: true });
            result.push(...childResults);
          }
        } else if (matchesSearch) {
          result.push(visibleNode);
        }
      } else {
        // Normal behavior
        result.push(visibleNode);

        if (isExpanded && node.children) {
          if (createState?.parentId === node.id) {
            result.push({
              id: '__create__',
              node: {
                id: '__create__',
                workspaceId: '',
                name: '',
                type: createState.type,
                path: '',
                parentId: node.id,
                children: [],
                metadata: {},
              },
              depth: depth + 1,
              isExpanded: false,
              hasChildren: createState.type === 'directory',
            });
          }
          result.push(...TreeEngine.flattenTree(node.children, options, depth + 1));
        }
      }
    }

    if (depth === 0) {
      console.log(
        '[DIAG] TreeEngine.flattenTree() output visibleNodes:',
        result.map((n) => ({
          id: n.id,
          name: n.node.name,
          depth: n.depth,
          isExpanded: n.isExpanded,
        }))
      );
      console.log('[FORENSIC:FLATTEN] resulting visibleNodes length:', result.length);
      console.log(
        '[FORENSIC:FLATTEN] resulting visible node IDs/names/types:',
        result.map((n) => `${n.id} (${n.node.name}, depth: ${n.depth})`)
      );
    }

    return result;
  }

  /**
   * Helper to collect all node IDs (used for Ctrl+A or recursive operations)
   */
  static collectAllIds(nodes: WorkspaceNode[]): string[] {
    let ids: string[] = [];
    for (const node of nodes) {
      ids.push(node.id);
      if (node.children) {
        ids.push(...TreeEngine.collectAllIds(node.children));
      }
    }
    return ids;
  }
}
