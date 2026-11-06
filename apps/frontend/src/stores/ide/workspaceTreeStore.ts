import { create } from 'zustand';
import { WorkspaceNode } from '../../types/ide';
import { FileEvent } from '../../lib/tree/FileWatcher';
import { WorkspaceManager } from '../../services/workspace/WorkspaceManager';
import { WorkspaceEvents } from '../../services/workspace/WorkspaceEvents';
import { WorkspaceEventType } from '../../services/workspace/types';

export type SortOrder = 'default' | 'modified' | 'size';

export interface DragState {
  activeId: string;
  overId: string | null;
  isOverFolder: boolean;
}

export interface TreeState {
  tree: WorkspaceNode[];
  expandedNodes: Set<string>;
  selectedNodes: Set<string>;
  focusedNode: string | null;
  dragState: DragState | null;
  renameState: { id: string; initialValue: string } | null;
  createState: { parentId: string | null; type: 'file' | 'directory' } | null;
  confirmDeleteState: { nodeIds: string[] } | null;
  clipboardState: { action: 'copy' | 'cut'; nodes: string[] } | null;
  searchFilter: string;
  searchResults: Set<string> | null;
  showHidden: boolean;
  sortOrder: SortOrder;
  isLoading: boolean;
  favorites: string[];
}

export interface TreeActions {
  setTree: (tree: WorkspaceNode[]) => void;
  toggleExpansion: (id: string, force?: boolean) => void;
  collapseAll: () => void;
  expandAll: () => void;
  setSelectedNodes: (nodes: Set<string>) => void;
  toggleNodeSelection: (id: string, multi?: boolean) => void;
  setSelection: (ids: string[]) => void;
  addSelection: (id: string) => void;
  clearSelection: () => void;
  setFocusedNode: (id: string | null) => void;
  setDragState: (dragState: DragState | null) => void;
  setRenameState: (state: { id: string; initialValue: string } | null) => void;
  setCreateState: (state: { parentId: string | null; type: 'file' | 'directory' } | null) => void;
  setConfirmDeleteState: (state: { nodeIds: string[] } | null) => void;
  setClipboardState: (state: { action: 'copy' | 'cut'; nodes: string[] } | null) => void;
  setSearchFilter: (filter: string) => void;
  setSearchResults: (results: Set<string> | null) => void;
  setShowHidden: (show: boolean) => void;
  setSortOrder: (order: SortOrder) => void;
  setIsLoading: (isLoading: boolean) => void;
  toggleFavorite: (id: string) => void;
  handleFileEvent: (event: FileEvent) => void;
}

export const useWorkspaceTreeStore = create<TreeState & TreeActions>((set) => ({
  tree: [],
  expandedNodes: new Set(),
  selectedNodes: new Set(),
  focusedNode: null,
  dragState: null,
  renameState: null,
  createState: null,
  confirmDeleteState: null,
  clipboardState: null,
  searchFilter: '',
  searchResults: null,
  showHidden: false,
  sortOrder: 'default',
  isLoading: false,
  favorites: [],

  setTree: (tree) => {
    set({ tree });
  },

  toggleExpansion: (id, force) =>
    set((state) => {
      const next = new Set(state.expandedNodes);
      const shouldExpand = force !== undefined ? force : !next.has(id);
      if (shouldExpand) next.add(id);
      else next.delete(id);
      return { expandedNodes: next };
    }),

  collapseAll: () =>
    set((state) => {
      const next = new Set(state.expandedNodes);

      // Recursive post-order traversal
      const postOrderCollapse = (nodes: WorkspaceNode[]) => {
        for (const node of nodes) {
          if (node.type === 'directory') {
            if (node.children) {
              postOrderCollapse(node.children);
            }
            next.delete(node.id);
          }
        }
      };

      postOrderCollapse(state.tree);
      return { expandedNodes: next };
    }),

  expandAll: () =>
    set((state) => {
      const allIds = new Set<string>();
      const collectDirIds = (nodes: WorkspaceNode[]) => {
        for (const node of nodes) {
          if (node.type === 'directory') {
            allIds.add(node.id);
            if (node.children) collectDirIds(node.children);
          }
        }
      };
      collectDirIds(state.tree);
      return { expandedNodes: allIds };
    }),

  setSelectedNodes: (nodes) => set({ selectedNodes: nodes }),
  toggleNodeSelection: (id, multi) =>
    set((state) => {
      const next = new Set(state.selectedNodes);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedNodes: next };
    }),
  setSelection: (ids) => set({ selectedNodes: new Set(ids) }),

  addSelection: (id) =>
    set((state) => {
      const next = new Set(state.selectedNodes);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedNodes: next };
    }),

  clearSelection: () => set({ selectedNodes: new Set() }),

  setFocusedNode: (focusedNode) => set({ focusedNode }),
  setDragState: (dragState) => set({ dragState }),
  setRenameState: (renameState) => set({ renameState }),
  setCreateState: (createState) => set({ createState }),
  setConfirmDeleteState: (confirmDeleteState) => set({ confirmDeleteState }),
  setClipboardState: (clipboardState) => set({ clipboardState }),
  setSearchFilter: (searchFilter) => set({ searchFilter }),
  setSearchResults: (searchResults) => set({ searchResults }),
  setShowHidden: (showHidden) => set({ showHidden }),
  setSortOrder: (sortOrder) => set({ sortOrder }),
  setIsLoading: (isLoading) => set({ isLoading }),

  toggleFavorite: (id) =>
    set((state) => {
      if (state.favorites.includes(id)) {
        return { favorites: state.favorites.filter((f) => f !== id) };
      }
      return { favorites: [...state.favorites, id] };
    }),

  handleFileEvent: (event) =>
    set((state) => {
      // Immutable updates to the tree structure based on events
      // This allows the UI to react to external changes (e.g. from backend/FileWatcher)

      const removeNode = (nodes: WorkspaceNode[], id: string): WorkspaceNode[] => {
        return nodes
          .filter((n) => n.id !== id)
          .map((n) => {
            if (n.children) {
              return { ...n, children: removeNode(n.children, id) };
            }
            return n;
          });
      };

      const addNode = (
        nodes: WorkspaceNode[],
        parentId: string | null,
        newNode: WorkspaceNode
      ): WorkspaceNode[] => {
        if (parentId === null) {
          return [...nodes, newNode];
        }
        return nodes.map((n) => {
          if (n.id === parentId) {
            return { ...n, children: [...(n.children || []), newNode] };
          }
          if (n.children) {
            return { ...n, children: addNode(n.children, parentId, newNode) };
          }
          return n;
        });
      };

      const renameNode = (
        nodes: WorkspaceNode[],
        id: string,
        newName: string,
        newPath: string
      ): WorkspaceNode[] => {
        return nodes.map((n) => {
          if (n.id === id) {
            return { ...n, name: newName, path: newPath };
          }
          if (n.children) {
            return { ...n, children: renameNode(n.children, id, newName, newPath) };
          }
          return n;
        });
      };

      let newTree = state.tree;

      switch (event.type) {
        case 'created':
          newTree = addNode(newTree, event.node.parentId || null, event.node);
          break;
        case 'deleted':
          newTree = removeNode(newTree, event.id);
          break;
        case 'renamed':
          newTree = renameNode(newTree, event.id, event.newName, event.newPath);
          break;
        case 'moved':
          // Find the node first. (Requires a helper function to find the node)
          let foundNode: WorkspaceNode | null = null;
          const findNode = (nodes: WorkspaceNode[]) => {
            for (const n of nodes) {
              if (n.id === event.id) foundNode = n;
              if (n.children) findNode(n.children);
            }
          };
          findNode(newTree);

          if (foundNode) {
            newTree = removeNode(newTree, event.id);
            newTree = addNode(newTree, event.newParentId, {
              ...(foundNode as WorkspaceNode),
              parentId: event.newParentId || undefined,
            });
          }
          break;
      }

      return { tree: newTree };
    }),
}));
