import { useWorkspaceTreeStore } from '../../stores/ide/workspaceTreeStore';
import { WorkspaceManager } from '../../services/workspace/WorkspaceManager';

export class TreeControllerImpl {
  expandNode(id: string) {
    useWorkspaceTreeStore.getState().toggleExpansion(id, true);
    WorkspaceManager.ensureChildrenLoaded(id).catch(console.error);
  }

  collapseNode(id: string) {
    useWorkspaceTreeStore.getState().toggleExpansion(id, false);
  }

  collapseAll() {
    useWorkspaceTreeStore.getState().collapseAll();
  }

  expandAll() {
    useWorkspaceTreeStore.getState().expandAll();
    // We would need to ensure children are loaded for everything recursively,
    // but in practice, expansion will only show what's already loaded,
    // and children that aren't loaded will render as empty directories or triggers.
    // For a true "expand all", we should probably trigger a recursive load,
    // but that's very expensive for large workspaces.
    // We will leave the lazy loading for when they scroll into view or expand individually.
  }

  toggleNode(id: string) {
    const store = useWorkspaceTreeStore.getState();
    const isExpanded = store.expandedNodes.has(id);
    store.toggleExpansion(id);
    if (!isExpanded) {
      WorkspaceManager.ensureChildrenLoaded(id).catch(console.error);
    }
  }

  selectNode(id: string, multi: boolean = false, range: boolean = false) {
    const store = useWorkspaceTreeStore.getState();
    if (multi) {
      store.addSelection(id);
    } else {
      store.setSelection([id]);
    }
    store.setFocusedNode(id);
  }

  beginRename(id: string, initialValue: string) {
    useWorkspaceTreeStore.getState().setRenameState({ id, initialValue });
  }

  async commitRename(id: string, newName: string) {
    useWorkspaceTreeStore.getState().setRenameState(null);
    const path = WorkspaceManager.getPath(id);
    if (path) WorkspaceManager.rename(path, newName);
  }

  cancelRename() {
    useWorkspaceTreeStore.getState().setRenameState(null);
  }

  promptDeleteNodes(ids: string[]) {
    useWorkspaceTreeStore.getState().setConfirmDeleteState({ nodeIds: ids });
  }

  async duplicateNode(id: string) {
    const path = WorkspaceManager.getPath(id);
    if (!path) return;
    const parts = path.split('/');
    const originalName = parts.pop()!;
    let newName = originalName.includes('.')
      ? originalName.replace(/\.([^.]+)$/, ' copy.$1')
      : `${originalName} copy`;

    // We could loop to check for "copy 2" if it exists, but for simplicity this works
    parts.push(newName);
    const newPath = parts.join('/') || `/${newName}`;
    await WorkspaceManager.copy(path, newPath);
  }

  copyNodes(ids: string[]) {
    useWorkspaceTreeStore.getState().setClipboardState({ action: 'copy', nodes: ids });
  }

  cutNodes(ids: string[]) {
    useWorkspaceTreeStore.getState().setClipboardState({ action: 'cut', nodes: ids });
  }

  async pasteNodes(targetParentId: string | null) {
    const state = useWorkspaceTreeStore.getState().clipboardState;
    if (!state || state.nodes.length === 0) return;

    const parentPath = targetParentId ? WorkspaceManager.getPath(targetParentId) : '';

    for (const id of state.nodes) {
      const sourcePath = WorkspaceManager.getPath(id);
      if (!sourcePath) continue;

      const nodeName = sourcePath.split('/').pop()!;
      const destinationPath =
        parentPath === '/' || !parentPath ? `/${nodeName}` : `${parentPath}/${nodeName}`;

      if (sourcePath === destinationPath) continue;

      if (state.action === 'copy') {
        await WorkspaceManager.copy(sourcePath, destinationPath);
      } else {
        await WorkspaceManager.move(sourcePath, destinationPath);
      }
    }

    if (state.action === 'cut') {
      useWorkspaceTreeStore.getState().setClipboardState(null);
    }
  }

  async deleteNodes(ids: string[]) {
    useWorkspaceTreeStore.getState().setConfirmDeleteState(null);
    for (const id of ids) {
      const path = WorkspaceManager.getPath(id);
      if (path) WorkspaceManager.delete(path);
    }
    useWorkspaceTreeStore.getState().clearSelection();
  }

  beginCreate(parentId: string | null, type: 'file' | 'directory') {
    useWorkspaceTreeStore.getState().setCreateState({ parentId, type });
    if (parentId) {
      this.expandNode(parentId);
    }
  }

  async commitCreate(name: string) {
    const state = useWorkspaceTreeStore.getState().createState;
    useWorkspaceTreeStore.getState().setCreateState(null);
    if (!state || !name.trim()) return;

    if (state.type === 'file') {
      await this.createFile(state.parentId, name.trim());
    } else {
      await this.createDirectory(state.parentId, name.trim());
    }
  }

  cancelCreate() {
    useWorkspaceTreeStore.getState().setCreateState(null);
  }

  async createFile(parentId: string | null, name: string) {
    const parentPath = parentId ? WorkspaceManager.getPath(parentId) : '';
    const fullPath = parentPath === '/' || !parentPath ? `/${name}` : `${parentPath}/${name}`;
    WorkspaceManager.createFile(fullPath);
    if (parentId) this.expandNode(parentId);
  }

  async createDirectory(parentId: string | null, name: string) {
    const parentPath = parentId ? WorkspaceManager.getPath(parentId) : '';
    const fullPath = parentPath === '/' || !parentPath ? `/${name}` : `${parentPath}/${name}`;
    WorkspaceManager.createFolder(fullPath);
    if (parentId) this.expandNode(parentId);
  }

  async moveNode(id: string, newParentId: string | null) {
    const sourcePath = WorkspaceManager.getPath(id);
    const destPath = newParentId ? WorkspaceManager.getPath(newParentId) : '/';
    if (sourcePath && destPath) {
      WorkspaceManager.move(sourcePath, destPath);
    }
  }
}

export const TreeController = new TreeControllerImpl();
