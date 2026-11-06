import React, { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  useSensor,
  useSensors,
  PointerSensor,
} from '@dnd-kit/core';
import { useWorkspaceTreeStore } from '../../../stores/ide/workspaceTreeStore';
import { TreeEngine } from '../../../lib/tree/TreeEngine';
import { ExplorerNode } from './ExplorerNode';
import { WorkspaceTreeAdapter } from '../../../lib/tree/WorkspaceTreeAdapter';
import { ExplorerContextMenu } from './ExplorerContextMenu';
import { TreeController } from '../../../lib/tree/TreeController';
import { useEditorLayoutStore } from '../../../stores/ide/editorLayoutStore';
import { LanguageRegistry } from '../../../lib/editor/LanguageRegistry';
import { ExplorerEmptyState } from './ExplorerEmptyState';
import { ConfirmDialog } from '../../ui/confirm-dialog';
import { WorkspaceManager } from '../../../services/workspace/WorkspaceManager';
import { OutlineView } from '../outline/OutlineView';
import { TimelineView } from '../timeline/TimelineView';
import { ContextEngine } from '../../../services/quickInput/ContextEngine';

export function ExplorerView() {
  const {
    tree,
    expandedNodes,
    searchFilter,
    searchResults,
    showHidden,
    sortOrder,
    isLoading,
    createState,
    confirmDeleteState,
  } = useWorkspaceTreeStore();
  const parentRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCopyDragRef = useRef<boolean>(false);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt' || e.key === 'Control') isCopyDragRef.current = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt' || e.key === 'Control') isCopyDragRef.current = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    WorkspaceTreeAdapter.fetchInitialTree();
  }, []);

  const visibleNodes = useMemo(() => {
    return TreeEngine.flattenTree(tree, {
      expandedNodes,
      searchFilter,
      searchResults,
      showHidden,
      sortOrder,
      createState,
    });
  }, [tree, expandedNodes, searchFilter, searchResults, showHidden, sortOrder, createState]);

  console.log(
    '[FORENSIC:EXPLORER:RENDER] tree length:',
    tree.length,
    'visibleNodes length:',
    visibleNodes.length
  );
  if (visibleNodes.length > 0) {
    console.log(
      '[FORENSIC:EXPLORER:RENDER] every visible node:',
      visibleNodes.map((n) => `${n.id} (${n.node.name}, type: ${n.node.type}, depth: ${n.depth})`)
    );
  }

  const activeGroupId = useEditorLayoutStore((state) => state.activeGroupId);
  const activeTabId = useEditorLayoutStore((state) => {
    const group = state.groups.find((g) => g.id === state.activeGroupId);
    return group?.activeTabId;
  });
  const activeTabPath = useEditorLayoutStore((state) => {
    const group = state.groups.find((g) => g.id === state.activeGroupId);
    const tab = group?.tabs.find((t) => t.id === group.activeTabId);
    return tab?.path;
  });

  useEffect(() => {
    if (activeTabPath && tree.length > 0) {
      const nodeId = WorkspaceManager.resolvePath(activeTabPath);
      if (nodeId) {
        let current = WorkspaceManager.getNode(nodeId);
        const parentsToExpand: string[] = [];
        while (current && current.parentId) {
          parentsToExpand.push(current.parentId);
          current = WorkspaceManager.getNode(current.parentId);
        }
        if (parentsToExpand.length > 0) {
          const store = useWorkspaceTreeStore.getState();
          const nextExpanded = new Set(store.expandedNodes);
          let changed = false;
          parentsToExpand.forEach((pid) => {
            if (!nextExpanded.has(pid)) {
              nextExpanded.add(pid);
              changed = true;
            }
          });
          if (changed) {
            useWorkspaceTreeStore.setState({ expandedNodes: nextExpanded });
          }
        }

        // Wait for next render to compute visibleNodes, then scroll
        setTimeout(() => {
          const state = useWorkspaceTreeStore.getState();
          // Only focus if we haven't manually focused something else in the meantime
          // Or just unconditionally focus it for auto-reveal
          TreeController.selectNode(nodeId, false, false);

          // We can't easily get the index from outside the render cycle without re-flattening,
          // but `virtualizer.scrollToIndex` needs it. We will use a separate effect for scrolling
          // or just find it from the DOM/latest visibleNodes.
        }, 50);
      }
    }
  }, [activeTabPath, tree]);

  const focusedNode = useWorkspaceTreeStore((state) => state.focusedNode);

  // Search/Filter is now handled directly by ExplorerFilterService which can be used in TreeEngine
  // or right here to update the searchResults state.
  useEffect(() => {
    if (!searchFilter) {
      useWorkspaceTreeStore.getState().setSearchResults(null);
      return;
    }
    // We import and use ExplorerFilterService
    import('../../../services/explorer/ExplorerFilterService').then(({ explorerFilterService }) => {
      const results = explorerFilterService.filter(tree, searchFilter);
      useWorkspaceTreeStore.getState().setSearchResults(results);
    });
  }, [searchFilter, tree]);

  // Effect to handle scrolling after selection
  useEffect(() => {
    if (focusedNode) {
      const idx = visibleNodes.findIndex((n) => n.id === focusedNode);
      if (idx !== -1) {
        virtualizer.scrollToIndex(idx, { align: 'auto' });
      }
    }
  }, [focusedNode, visibleNodes.length]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const virtualizer = useVirtualizer({
    count: visibleNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 22,
    overscan: 20,
  });

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id;
    if (overId) {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = setTimeout(() => {
        TreeController.expandNode(overId as string);
      }, 500);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const activeNode = active.data.current?.node;
      const overNode = over.data.current?.node;
      if (activeNode && overNode && overNode.type === 'directory') {
        if (isCopyDragRef.current) {
          useWorkspaceTreeStore
            .getState()
            .setClipboardState({ action: 'copy', nodes: [activeNode.id] });
          TreeController.pasteNodes(overNode.id);
        } else {
          TreeController.moveNode(activeNode.id, overNode.id);
        }
      }
    }
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const state = useWorkspaceTreeStore.getState();
      const focused = state.focusedNode;
      if (!focused) return;

      if (state.renameState) return; // Do not intercept if currently renaming

      const idx = visibleNodes.findIndex((n) => n.id === focused);
      if (idx === -1) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (idx < visibleNodes.length - 1) {
            TreeController.selectNode(visibleNodes[idx + 1].id, e.shiftKey, false);
            virtualizer.scrollToIndex(idx + 1);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (idx > 0) {
            TreeController.selectNode(visibleNodes[idx - 1].id, e.shiftKey, false);
            virtualizer.scrollToIndex(idx - 1);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          const currRight = visibleNodes[idx];
          if (currRight.hasChildren && !currRight.isExpanded) {
            TreeController.expandNode(currRight.id);
          } else if (
            currRight.hasChildren &&
            currRight.isExpanded &&
            idx < visibleNodes.length - 1
          ) {
            TreeController.selectNode(visibleNodes[idx + 1].id);
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          const currLeft = visibleNodes[idx];
          if (currLeft.hasChildren && currLeft.isExpanded) {
            TreeController.collapseNode(currLeft.id);
          } else if (currLeft.node.parentId) {
            TreeController.selectNode(currLeft.node.parentId);
            const pIdx = visibleNodes.findIndex((n) => n.id === currLeft.node.parentId);
            if (pIdx !== -1) virtualizer.scrollToIndex(pIdx);
          }
          break;
        case 'Enter':
          e.preventDefault();
          const nodeToOpen = visibleNodes[idx].node;
          if (nodeToOpen.type === 'file') {
            useEditorLayoutStore.getState().openFile({
              path: nodeToOpen.path,
              title: nodeToOpen.name,
              language: LanguageRegistry.getLanguageByExtension(nodeToOpen.name),
              dirty: false,
              pinned: false,
              isPreview: false,
            });
          }
          break;
        case 'F2':
          e.preventDefault();
          TreeController.beginRename(focused, visibleNodes[idx].node.name);
          break;
        case 'Delete':
          e.preventDefault();
          TreeController.promptDeleteNodes([focused]);
          break;
        case 'c':
        case 'C':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const nodesToCopy = Array.from(
              state.selectedNodes.size > 0 ? state.selectedNodes : [focused]
            );
            TreeController.copyNodes(nodesToCopy);
          }
          break;
        case 'x':
        case 'X':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const nodesToCut = Array.from(
              state.selectedNodes.size > 0 ? state.selectedNodes : [focused]
            );
            TreeController.cutNodes(nodesToCut);
          }
          break;
        case 'v':
        case 'V':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            TreeController.pasteNodes(focused);
          }
          break;
      }
    },
    [visibleNodes, virtualizer]
  );

  if (isLoading) {
    return <ExplorerEmptyState type="loading" />;
  }

  if (tree.length === 0) {
    return <ExplorerEmptyState type="no-workspace" />;
  }

  if (visibleNodes.length === 0) {
    if (searchFilter) {
      return <ExplorerEmptyState type="no-results" />;
    } else {
      return <ExplorerEmptyState type="empty-folder" />;
    }
  }

  console.log('[EXPLORER FORENSIC] EXPLORER RENDER');
  console.log('tree length:', tree.length);
  console.log('visibleNodes length:', visibleNodes.length);
  console.log(
    'visibleNodes IDs:',
    visibleNodes.map((n) => n.id)
  );
  console.log(
    'visibleNodes names:',
    visibleNodes.map((n) => n.node.name)
  );
  console.log('expandedNodes:', Array.from(expandedNodes));

  return (
    <>
      <ConfirmDialog
        open={confirmDeleteState !== null}
        onOpenChange={(open) =>
          !open && useWorkspaceTreeStore.getState().setConfirmDeleteState(null)
        }
        title="Delete Selection?"
        description={`Are you sure you want to delete ${confirmDeleteState?.nodeIds.length} item(s)? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={() => {
          if (confirmDeleteState) {
            TreeController.deleteNodes(confirmDeleteState.nodeIds);
          }
        }}
      />
      <div className="flex flex-col w-full h-full">
        <div className="px-2 py-1 flex-shrink-0 border-b border-border/50">
          <input
            type="text"
            placeholder="Filter explorer..."
            className="w-full text-xs bg-muted border border-border/50 rounded-sm px-2 py-1 outline-none focus:ring-1 focus:ring-ring transition-all"
            value={searchFilter}
            onChange={(e) => useWorkspaceTreeStore.getState().setSearchFilter(e.target.value)}
          />
        </div>
        <DndContext sensors={sensors} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <div
            ref={parentRef}
            className={`flex-1 w-full overflow-auto outline-none transition-all ${isFocused ? 'ring-1 ring-blue-500' : ''}`}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              setIsFocused(true);
              ContextEngine.setContext('explorerFocused', true);
              ContextEngine.setContext('editorFocused', false);
              ContextEngine.setContext('terminalFocused', false);
            }}
            onBlur={() => {
              setIsFocused(false);
              ContextEngine.setContext('explorerFocused', false);
            }}
          >
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const visibleNode = visibleNodes[virtualRow.index];
                return (
                  <ExplorerContextMenu key={visibleNode.id} nodeIds={[visibleNode.id]}>
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <ExplorerNode
                        visibleNode={visibleNode}
                        visibleNodes={visibleNodes}
                        style={{ width: '100%' }}
                      />
                    </div>
                  </ExplorerContextMenu>
                );
              })}
            </div>
          </div>
        </DndContext>
        <div className="flex-shrink-0 border-t border-border/50">
          <details className="group">
            <summary className="flex items-center px-4 py-1 text-xs font-semibold uppercase tracking-wider text-foreground cursor-pointer hover:bg-accent/50 select-none">
              <span className="flex-1">Outline</span>
              <svg
                className="w-4 h-4 transition-transform group-open:rotate-180"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </summary>
            <div className="bg-background h-[200px]">
              <OutlineView />
            </div>
          </details>
          <details className="group border-t border-border/50">
            <summary className="flex items-center px-4 py-1 text-xs font-semibold uppercase tracking-wider text-foreground cursor-pointer hover:bg-accent/50 select-none">
              <span className="flex-1">Timeline</span>
              <svg
                className="w-4 h-4 transition-transform group-open:rotate-180"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </summary>
            <div className="bg-background h-[200px]">
              <TimelineView />
            </div>
          </details>
        </div>
      </div>
    </>
  );
}
