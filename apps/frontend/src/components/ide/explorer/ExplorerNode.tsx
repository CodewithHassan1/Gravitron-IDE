import React from 'react';
import { VisibleNode } from '../../../lib/tree/TreeEngine';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { IconRegistry } from '../../../lib/registries/IconRegistry';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspaceTreeStore } from '../../../stores/ide/workspaceTreeStore';
import { useGitStore } from '../../../stores/ide/gitStore';
import { TreeController } from '../../../lib/tree/TreeController';
import { useEditorLayoutStore } from '../../../stores/ide/editorLayoutStore';
import { LanguageRegistry } from '../../../lib/editor/LanguageRegistry';

interface ExplorerNodeProps {
  visibleNode: VisibleNode;
  visibleNodes?: VisibleNode[];
  style: React.CSSProperties;
}

export const ExplorerNode = React.memo(
  ({ visibleNode, visibleNodes, style }: ExplorerNodeProps) => {
    const { node, depth, isExpanded, hasChildren } = visibleNode;
    const isSelected = useWorkspaceTreeStore((state) => state.selectedNodes.has(node.id));
    const isFocused = useWorkspaceTreeStore((state) => state.focusedNode === node.id);
    const renameState = useWorkspaceTreeStore((state) => state.renameState);
    const isRenaming = renameState?.id === node.id;
    const isCreating = node.id === '__create__';

    const gitStatus = useGitStore((state) => {
      if (isCreating) return undefined;
      if (node.type === 'file') {
        return state.dirtyFiles.find((f) => f.path === node.path)?.status;
      }
      if (node.type === 'directory') {
        return state.dirtyFiles.some((f) => f.path.startsWith(node.path + '/'))
          ? 'modified'
          : undefined;
      }
      return undefined;
    });

    const {
      attributes,
      listeners,
      setNodeRef: setDraggableRef,
      isDragging,
    } = useDraggable({
      id: node.id,
      data: { node },
    });

    const { setNodeRef: setDroppableRef, isOver } = useDroppable({
      id: node.id,
      data: { node },
      disabled: node.type !== 'directory', // only folders are droppable
    });

    const setRefs = (el: HTMLElement | null) => {
      setDraggableRef(el);
      setDroppableRef(el);
    };

    const IconComponent = IconRegistry.getIcon(node.name, node.type === 'directory', isExpanded);

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();

      if (e.shiftKey && visibleNodes && visibleNodes.length > 0) {
        const state = useWorkspaceTreeStore.getState();
        const lastFocused = state.focusedNode;
        if (lastFocused) {
          const lastIdx = visibleNodes.findIndex((n) => n.id === lastFocused);
          const currIdx = visibleNodes.findIndex((n) => n.id === node.id);
          if (lastIdx !== -1 && currIdx !== -1) {
            const start = Math.min(lastIdx, currIdx);
            const end = Math.max(lastIdx, currIdx);
            const nodesToSelect = visibleNodes.slice(start, end + 1).map((n) => n.id);
            const newSelection = new Set(e.ctrlKey || e.metaKey ? state.selectedNodes : []);
            nodesToSelect.forEach((id) => newSelection.add(id));
            state.setSelectedNodes(newSelection);
            state.setFocusedNode(node.id);
          }
        } else {
          TreeController.selectNode(node.id, e.ctrlKey || e.metaKey, false);
        }
      } else {
        TreeController.selectNode(node.id, e.ctrlKey || e.metaKey, false);
      }

      if (node.type === 'directory' && !e.shiftKey && !(e.ctrlKey || e.metaKey)) {
        TreeController.toggleNode(node.id);
      } else if (node.type === 'file' && !e.shiftKey && !(e.ctrlKey || e.metaKey)) {
        const openFile = useEditorLayoutStore.getState().openFile;
        openFile({
          path: node.path,
          title: node.name,
          language: LanguageRegistry.getLanguageByExtension(node.name),
          dirty: false,
          pinned: false,
          isPreview: true,
        });
      }
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (node.type === 'file') {
        const openFile = useEditorLayoutStore.getState().openFile;
        openFile({
          path: node.path,
          title: node.name,
          language: LanguageRegistry.getLanguageByExtension(node.name),
          dirty: false,
          pinned: true,
          isPreview: false,
        });
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (isRenaming) {
        if (e.key === 'Enter') {
          TreeController.commitRename(node.id, e.currentTarget.value);
        } else if (e.key === 'Escape') {
          TreeController.cancelRename();
        }
      } else if (isCreating) {
        if (e.key === 'Enter') {
          TreeController.commitCreate(e.currentTarget.value);
        } else if (e.key === 'Escape') {
          TreeController.cancelCreate();
        }
      }
    };

    return (
      <div
        ref={setRefs}
        style={{ ...style, paddingLeft: `${depth * 16 + 8}px` }}
        className={cn(
          'flex items-center h-[22px] cursor-pointer text-sm select-none border border-transparent outline-none group',
          isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted text-muted-foreground',
          isFocused && 'border-blue-500',
          isOver && 'bg-blue-500/20 ring-1 ring-blue-500',
          isDragging && 'opacity-50'
        )}
        {...attributes}
        {...listeners}
      >
        <div
          className="flex items-center w-4 h-4 mr-1 shrink-0 text-muted-foreground group-hover:text-foreground"
          onClick={handleClick}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )
          ) : (
            <span className="w-4 h-4" /> // spacing for files
          )}
        </div>

        <div
          className={cn(
            'flex-1 flex items-center h-full min-w-0 pr-2 relative overflow-hidden',
            gitStatus === 'untracked' && 'text-green-500/90',
            gitStatus === 'added' && 'text-green-500/90',
            gitStatus === 'modified' && 'text-yellow-500/90',
            gitStatus === 'deleted' && 'text-red-500/90'
          )}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
        >
          <IconComponent className="w-4 h-4 mr-1.5 shrink-0" />

          {isRenaming ? (
            <input
              autoFocus
              defaultValue={renameState.initialValue}
              onKeyDown={handleKeyDown}
              onBlur={(e) => TreeController.commitRename(node.id, e.currentTarget.value)}
              onClick={(e) => e.stopPropagation()}
              className="bg-background text-foreground text-sm border border-blue-500 outline-none w-full h-[20px] px-1"
            />
          ) : isCreating ? (
            <input
              autoFocus
              defaultValue=""
              onKeyDown={handleKeyDown}
              onBlur={(e) => TreeController.commitCreate(e.currentTarget.value)}
              onClick={(e) => e.stopPropagation()}
              className="bg-background text-foreground text-sm border border-blue-500 outline-none w-full h-[20px] px-1"
            />
          ) : (
            <span className="truncate whitespace-nowrap text-xs select-none relative z-10 block pr-6">
              {node.name}
            </span>
          )}

          {/* Git Badge */}
          {gitStatus && !isRenaming && !isCreating && node.type === 'file' && (
            <span
              className={cn(
                'absolute right-2 text-[10px] font-bold z-10',
                gitStatus === 'untracked' && 'text-green-500',
                gitStatus === 'added' && 'text-green-500',
                gitStatus === 'modified' && 'text-yellow-500',
                gitStatus === 'deleted' && 'text-red-500'
              )}
            >
              {gitStatus === 'untracked'
                ? 'U'
                : gitStatus === 'added'
                  ? 'A'
                  : gitStatus === 'modified'
                    ? 'M'
                    : gitStatus === 'deleted'
                      ? 'D'
                      : gitStatus === 'conflict'
                        ? 'C'
                        : ''}
            </span>
          )}
        </div>
      </div>
    );
  }
);

ExplorerNode.displayName = 'ExplorerNode';
