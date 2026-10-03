import { create } from 'zustand';
import { WorkspaceNode } from '../../types/ide';
import { WorkspaceLifecycleState } from '../../services/workspace/types';

interface WorkspaceState {
  tree: WorkspaceNode[];
  isLoading: boolean;
  error: string | null;
  workspaceName: string;
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
  lifecycleState: WorkspaceLifecycleState;
}

interface WorkspaceActions {
  setTree: (tree: WorkspaceNode[]) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  toggleNodeExpansion: (nodeId: string) => void;
  setWorkspaceName: (name: string) => void;
  setConnectionStatus: (status: 'connected' | 'disconnected' | 'reconnecting') => void;
  setLifecycleState: (state: WorkspaceLifecycleState) => void;
}

export const useWorkspaceStore = create<WorkspaceState & WorkspaceActions>((set) => ({
  tree: [],
  isLoading: false,
  error: null,
  workspaceName: 'Local Workspace',
  connectionStatus: 'connected',
  lifecycleState: WorkspaceLifecycleState.Empty,

  setTree: (tree) => set({ tree }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setWorkspaceName: (workspaceName) => set({ workspaceName }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setLifecycleState: (lifecycleState) => set({ lifecycleState }),
  
  toggleNodeExpansion: (nodeId: string) => {
    set((state) => {
      // Recursive function to find and toggle the node
      const toggleNode = (nodes: WorkspaceNode[]): WorkspaceNode[] => {
        return nodes.map(node => {
          if (node.id === nodeId) {
            return { ...node, expanded: !node.expanded };
          }
          if (node.children) {
            return { ...node, children: toggleNode(node.children) };
          }
          return node;
        });
      };

      return { tree: toggleNode(state.tree) };
    });
  }
}));
