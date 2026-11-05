import React from 'react';
import { ViewRegistry } from '../../../lib/registries/ViewRegistry';
import { ExplorerView } from '../explorer/ExplorerView';
import { registerExplorerContextMenu } from '../explorer/registerExplorerContextMenu';
import {
  Folder,
  Search,
  GitBranch,
  PlaySquare,
  Blocks,
  Minus,
  Plus,
  RefreshCw,
  FilePlus,
  FolderPlus,
  ArrowDownAZ,
  ArrowDown01,
  Clock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { SearchPanel } from '../search/SearchPanel';
import { SourceControlView } from '../scm/SourceControlView';
import { TreeController } from '../../../lib/tree/TreeController';
import { WorkspaceManager } from '../../../services/workspace/WorkspaceManager';
import { useWorkspaceTreeStore } from '../../../stores/ide/workspaceTreeStore';

function ExplorerActions() {
  // HOOKS MUST BE AT THE TOP LEVEL
  const sortOrder = useWorkspaceTreeStore((state) => state.sortOrder);
  const showHidden = useWorkspaceTreeStore((state) => state.showHidden);

  const getParentId = () => {
    const state = useWorkspaceTreeStore.getState();
    const focusedId = state.focusedNode;
    if (!focusedId) return null;
    const node = WorkspaceManager.getNode(focusedId);
    if (!node) return null;
    return node.type === 'directory' ? node.id : node.parentId;
  };

  return (
    <>
      <button
        title="New File"
        className="p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        onClick={() => TreeController.beginCreate(getParentId(), 'file')}
      >
        <FilePlus size={14} />
      </button>
      <button
        title="New Folder"
        className="p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        onClick={() => TreeController.beginCreate(getParentId(), 'directory')}
      >
        <FolderPlus size={14} />
      </button>
      <button
        title="Refresh Workspace"
        className="p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        onClick={() => WorkspaceManager.reloadWorkspace()}
      >
        <RefreshCw size={14} />
      </button>
      <button
        title="Collapse All"
        className="p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        onClick={() => TreeController.collapseAll()}
      >
        <Minus size={14} />
      </button>
      <button
        title="Expand All"
        className="p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        onClick={() => TreeController.expandAll()}
      >
        <Plus size={14} />
      </button>
      <button
        title="Cycle Sort Order"
        className="p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        onClick={() => {
          const store = useWorkspaceTreeStore.getState();
          const current = store.sortOrder;
          const next =
            current === 'default' ? 'modified' : current === 'modified' ? 'size' : 'default';
          store.setSortOrder(next);
        }}
      >
        {sortOrder === 'default' ? (
          <ArrowDownAZ size={14} />
        ) : sortOrder === 'modified' ? (
          <Clock size={14} />
        ) : (
          <ArrowDown01 size={14} />
        )}
      </button>
      <button
        title="Toggle Hidden Files"
        className="p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        onClick={() => {
          const store = useWorkspaceTreeStore.getState();
          store.setShowHidden(!store.showHidden);
        }}
      >
        {showHidden ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
    </>
  );
}

function RunAndDebugView() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground">Run & Debug</h3>
        <p className="text-xs text-muted-foreground">
          Debug support will become available once a launch configuration is created.
        </p>
      </div>
    </div>
  );
}

function ExtensionsView() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground">Extensions</h3>
        <p className="text-xs text-muted-foreground">
          Extension marketplace will be available in a future milestone.
        </p>
      </div>
    </div>
  );
}

// Initialize registries
registerExplorerContextMenu();

export function registerPrimaryViews() {
  ViewRegistry.register({
    id: 'explorer',
    title: 'Explorer',
    icon: Folder,
    placement: 'primary',
    component: ExplorerView,
    actions: ExplorerActions,
  });

  ViewRegistry.register({
    id: 'search',
    title: 'Search',
    icon: Search,
    placement: 'primary',
    component: SearchPanel,
  });

  ViewRegistry.register({
    id: 'source-control',
    title: 'Source Control',
    icon: GitBranch,
    placement: 'primary',
    component: SourceControlView,
  });

  ViewRegistry.register({
    id: 'run-and-debug',
    title: 'Run and Debug',
    icon: PlaySquare,
    placement: 'primary',
    component: RunAndDebugView,
  });

  ViewRegistry.register({
    id: 'extensions',
    title: 'Extensions',
    icon: Blocks,
    placement: 'primary',
    component: ExtensionsView,
  });
}
