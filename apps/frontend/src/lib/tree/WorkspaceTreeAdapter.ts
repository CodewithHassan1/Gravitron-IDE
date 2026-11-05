import { WorkspaceManager } from '../../services/workspace/WorkspaceManager';
import { WorkspaceEvents } from '../../services/workspace/WorkspaceEvents';
import { WorkspaceEventType } from '../../services/workspace/types';
import { useWorkspaceTreeStore } from '../../stores/ide/workspaceTreeStore';
import { WorkspaceNode } from '../../services/workspace/vfs/WorkspaceNode';
import { WorkspaceSession } from '../../services/workspace/WorkspaceSession';

class WorkspaceTreeAdapterImpl {
  constructor() {
    WorkspaceEvents.on(WorkspaceEventType.WorkspaceOpened, () => this.syncTree());
    WorkspaceEvents.on(WorkspaceEventType.WorkspaceClosed, () => this.syncTree());
    WorkspaceEvents.on(WorkspaceEventType.WorkspaceUpdated, () => this.syncTree());
    WorkspaceEvents.on('fileEvent', (event: any) => {
      if (!event.payload) return;

      const payload = { ...event.payload };
      if (payload.type === 'created' && payload.node) {
        payload.node = this.mapNode(payload.node);
      }
      useWorkspaceTreeStore.getState().handleFileEvent(payload);
    });

    WorkspaceEvents.on(WorkspaceEventType.FolderLoaded, () => this.syncTree());

    // We rely on syncTree to handle isLoading state updates
  }

  syncTree() {
    const root = WorkspaceManager.getRoot();
    const state = useWorkspaceTreeStore.getState();
    const isLoading = WorkspaceManager.getState().isLoading;

    const updates: any = {
      tree: root ? [this.mapNode(root)] : [],
      isLoading,
    };

    console.log(
      '[FORENSIC:TREE:SYNC] root:',
      root,
      'root.id:',
      root?.id,
      'root.children:',
      root?.children,
      'root.children.length:',
      root?.children?.length,
      'mapped tree length:',
      updates.tree?.length,
      'mapped tree[0].children.length:',
      updates.tree?.[0]?.children?.length
    );
    console.log('[FORENSIC:TREE:SYNC] expandedNodes BEFORE:', Array.from(state.expandedNodes));

    if (root && !state.expandedNodes.has(root.id)) {
      updates.expandedNodes = new Set(state.expandedNodes).add(root.id);
    }
    console.log(
      '[FORENSIC:TREE:SYNC] expandedNodes AFTER:',
      Array.from(updates.expandedNodes || state.expandedNodes)
    );

    useWorkspaceTreeStore.setState(updates);

    const stateAfter = useWorkspaceTreeStore.getState();
    console.log(
      '[FORENSIC:STORE] tree.length:',
      stateAfter.tree?.length,
      'tree[0]:',
      stateAfter.tree?.[0],
      'tree[0].children.length:',
      stateAfter.tree?.[0]?.children?.length,
      'expandedNodes:',
      Array.from(stateAfter.expandedNodes),
      'expandedNodes.has(root.id):',
      root ? stateAfter.expandedNodes.has(root.id) : false
    );
  }

  private mapNode(vfsNode: any): any {
    const workspaceId = WorkspaceManager.getState().metadata?.id || 'unknown';
    const path = WorkspaceManager.getPath(vfsNode.id) || '';

    const node: any = {
      id: vfsNode.id,
      parentId: vfsNode.parentId,
      name: vfsNode.name,
      type: vfsNode.type,
      workspaceId,
      path,
      childrenLoaded: vfsNode.childrenLoaded,
    };

    if (vfsNode.type === 'directory') {
      const children = WorkspaceManager.getChildren(vfsNode.id);
      node.children = children.map((child) => this.mapNode(child));
    }

    return node;
  }

  async fetchInitialTree() {
    this.syncTree();
  }

  async createFile(parentId: string | null, name: string) {}
  async createDirectory(parentId: string | null, name: string) {}
  async renameNode(id: string, newName: string) {}
  async deleteNode(id: string) {}
  async moveNode(id: string, newParentId: string | null) {}
}

export const WorkspaceTreeAdapter = new WorkspaceTreeAdapterImpl();
