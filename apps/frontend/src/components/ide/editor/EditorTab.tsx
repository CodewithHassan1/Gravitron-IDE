import React, { useRef } from 'react';
import { EditorTab as EditorTabType } from '../../../types/ide';
import { X, File, Circle, Pin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEditorLayoutStore } from '../../../stores/ide/editorLayoutStore';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu';

interface EditorTabProps {
  tab: EditorTabType;
  groupId: string;
  isActive: boolean;
}

export function EditorTab({ tab, groupId, isActive }: EditorTabProps) {
  const setActiveTab = useEditorLayoutStore((state) => state.setActiveTab);
  const closeFile = useEditorLayoutStore((state) => state.closeFile);
  const pinTab = useEditorLayoutStore((state) => state.pinTab);
  const unpinTab = useEditorLayoutStore((state) => state.unpinTab);
  const groups = useEditorLayoutStore((state) => state.groups);
  const group = groups.find(g => g.id === groupId);

  const handleMiddleClick = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      closeFile(groupId, tab.id);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (tab.pinned) {
      unpinTab(groupId, tab.id);
    } else {
      pinTab(groupId, tab.id);
    }
  };

  // Context Menu Actions
  const handleClose = () => closeFile(groupId, tab.id);
  const handleCloseOthers = () => {
    if (!group) return;
    group.tabs.forEach(t => {
      if (t.id !== tab.id && !t.pinned) closeFile(groupId, t.id);
    });
  };
  const handleCloseToRight = () => {
    if (!group) return;
    const idx = group.tabs.findIndex(t => t.id === tab.id);
    if (idx === -1) return;
    group.tabs.forEach((t, i) => {
      if (i > idx && !t.pinned) closeFile(groupId, t.id);
    });
  };
  const handleCloseSaved = () => {
    if (!group) return;
    group.tabs.forEach(t => {
      if (!t.dirty && !t.pinned) closeFile(groupId, t.id);
    });
  };
  const handleTogglePin = () => tab.pinned ? unpinTab(groupId, tab.id) : pinTab(groupId, tab.id);
  const handleCopyPath = () => navigator.clipboard.writeText(tab.path);

  // Pinned UI logic
  const isPinned = tab.pinned;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="tab"
          aria-selected={isActive}
          title={tab.path}
          onClick={() => setActiveTab(groupId, tab.id)}
          onAuxClick={handleMiddleClick}
          onDoubleClick={handleDoubleClick}
          className={cn(
            "group flex items-center h-full px-3 text-[13px] border-r border-border cursor-pointer shrink-0 select-none transition-colors relative min-w-[120px] max-w-[200px]",
            isActive 
              ? "bg-background border-t-2 border-t-primary text-foreground" 
              : "bg-card text-muted-foreground hover:bg-muted/50 border-t-2 border-t-transparent",
            tab.isPreview && "italic"
          )}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/json', JSON.stringify({ tabId: tab.id, groupId }));
          }}
        >
          {/* Icon always visible */}
          <span className="shrink-0 mr-1.5">
            <File className="w-3.5 h-3.5 text-muted-foreground" />
          </span>

          {/* Title */}
          <span className="truncate flex-1">
            {tab.title}
          </span>

          {/* Close/Dirty Buttons */}
          <div className="relative ml-1.5 shrink-0 w-4 h-4 flex items-center justify-center">
              {tab.dirty ? (
                <>
                  <Circle className="w-2 h-2 fill-primary text-primary group-hover:opacity-0 absolute" />
                  <button
                    onClick={(e) => { e.stopPropagation(); closeFile(groupId, tab.id); }}
                    className="p-0.5 rounded-sm hover:bg-muted opacity-0 group-hover:opacity-100 absolute"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); closeFile(groupId, tab.id); }}
                  className={cn(
                    "p-0.5 rounded-sm hover:bg-muted absolute",
                    !isPinned && "opacity-0 group-hover:opacity-100"
                  )}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={handleClose}>Close <span className="ml-auto text-xs text-muted-foreground">Ctrl+W</span></ContextMenuItem>
        <ContextMenuItem onClick={handleCloseOthers}>Close Others</ContextMenuItem>
        <ContextMenuItem onClick={handleCloseToRight}>Close to Right</ContextMenuItem>
        <ContextMenuItem onClick={handleCloseSaved}>Close Saved</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleTogglePin}>
          {isPinned ? "Unpin Tab" : "Pin Tab"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleCopyPath}>Copy Path</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
