import { ContextMenuRegistry } from '../../../lib/registries/ContextMenuRegistry';
import { TreeController } from '../../../lib/tree/TreeController';
import { FileEdit, Trash2, FolderPlus, FilePlus } from 'lucide-react';
import { useWorkspaceTreeStore } from '../../../stores/ide/workspaceTreeStore';

export function registerExplorerContextMenu() {
  ContextMenuRegistry.register({
    id: 'new-file',
    label: 'New File',
    icon: FilePlus,
    order: 10,
    execute: (nodeIds) => {
      const parentId = nodeIds.length > 0 ? nodeIds[0] : null;
      TreeController.beginCreate(parentId, 'file');
    },
  });

  ContextMenuRegistry.register({
    id: 'new-folder',
    label: 'New Folder',
    icon: FolderPlus,
    order: 20,
    execute: (nodeIds) => {
      const parentId = nodeIds.length > 0 ? nodeIds[0] : null;
      TreeController.beginCreate(parentId, 'directory');
    },
  });

  ContextMenuRegistry.register({
    id: 'sep1',
    label: '',
    isSeparator: true,
    order: 30,
    execute: () => {},
  });

  ContextMenuRegistry.register({
    id: 'duplicate',
    label: 'Duplicate',
    order: 35,
    isVisible: (nodeIds) => nodeIds.length === 1,
    execute: (nodeIds) => {
      TreeController.duplicateNode(nodeIds[0]);
    },
  });

  ContextMenuRegistry.register({
    id: 'copy',
    label: 'Copy',
    shortcut: 'Ctrl+C',
    order: 36,
    isVisible: (nodeIds) => nodeIds.length > 0,
    execute: (nodeIds) => {
      TreeController.copyNodes(nodeIds);
    },
  });

  ContextMenuRegistry.register({
    id: 'cut',
    label: 'Cut',
    shortcut: 'Ctrl+X',
    order: 37,
    isVisible: (nodeIds) => nodeIds.length > 0,
    execute: (nodeIds) => {
      TreeController.cutNodes(nodeIds);
    },
  });

  ContextMenuRegistry.register({
    id: 'paste',
    label: 'Paste',
    shortcut: 'Ctrl+V',
    order: 38,
    execute: (nodeIds) => {
      const targetId = nodeIds.length > 0 ? nodeIds[0] : null;
      TreeController.pasteNodes(targetId);
    },
  });

  ContextMenuRegistry.register({
    id: 'rename',
    label: 'Rename',
    icon: FileEdit,
    shortcut: 'F2',
    order: 40,
    isVisible: (nodeIds) => nodeIds.length === 1,
    execute: (nodeIds) => {
      if (nodeIds.length === 1) {
        // Find current name from store
        const tree = useWorkspaceTreeStore.getState().tree;
        let currentName = '';
        const findName = (nodes: any[]) => {
          for (const n of nodes) {
            if (n.id === nodeIds[0]) currentName = n.name;
            if (n.children) findName(n.children);
          }
        };
        findName(tree);
        TreeController.beginRename(nodeIds[0], currentName);
      }
    },
  });

  ContextMenuRegistry.register({
    id: 'delete',
    label: 'Delete',
    icon: Trash2,
    shortcut: 'Del',
    order: 50,
    execute: (nodeIds) => {
      TreeController.promptDeleteNodes(nodeIds);
    },
  });
}
