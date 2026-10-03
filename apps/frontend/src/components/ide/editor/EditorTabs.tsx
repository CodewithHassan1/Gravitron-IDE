import React, { useRef, useState, useEffect } from 'react';
import { EditorTab as EditorTabComponent } from './EditorTab';
import { EditorGroup, useEditorLayoutStore } from '../../../stores/ide/editorLayoutStore';

interface EditorTabsProps {
  group: EditorGroup;
}

export function EditorTabs({ group }: EditorTabsProps) {
  const moveTab = useEditorLayoutStore((state) => state.moveTab);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Scroll active tab into view
  useEffect(() => {
    if (!scrollContainerRef.current || !group.activeTabId) return;
    const activeTab = scrollContainerRef.current.querySelector(`[data-tab-id="${group.activeTabId}"]`);
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [group.activeTabId]);

  // Horizontal scroll on mouse wheel
  const handleWheel = (e: React.WheelEvent) => {
    if (scrollContainerRef.current && e.deltaY !== 0) {
      // Convert vertical scroll to horizontal scroll
      scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!scrollContainerRef.current) return;
    
    // Auto scroll when dragging near edges
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < 50) {
      scrollContainerRef.current.scrollLeft -= 10;
    } else if (x > rect.width - 50) {
      scrollContainerRef.current.scrollLeft += 10;
    }

    // Calculate insertion index
    const children = Array.from(scrollContainerRef.current.children) as HTMLElement[];
    let targetIndex = group.tabs.length;
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childRect = child.getBoundingClientRect();
      const childCenter = childRect.left + childRect.width / 2;
      
      if (e.clientX < childCenter) {
        targetIndex = i;
        break;
      }
    }
    
    setDragOverIndex(targetIndex);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const index = dragOverIndex !== null ? dragOverIndex : group.tabs.length;
    setDragOverIndex(null);
    
    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (dataStr) {
        const data = JSON.parse(dataStr);
        if (data.tabId && data.groupId) {
          moveTab(data.groupId, group.id, data.tabId, index);
        }
      }
    } catch (err) {
      // ignore
    }
  };

  return (
    <div 
      ref={scrollContainerRef}
      role="tablist"
      aria-label="Editor tabs"
      className="flex h-9 bg-card border-b border-border overflow-x-auto overflow-y-hidden custom-scrollbar relative"
      onWheel={handleWheel}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {group.tabs.map((tab, idx) => (
        <React.Fragment key={tab.id}>
          {/* Drop Indicator before tab */}
          {dragOverIndex === idx && (
            <div className="w-0.5 bg-primary h-full shrink-0 relative z-10" />
          )}
          
          <div data-tab-id={tab.id} className="h-full flex shrink-0">
            <EditorTabComponent tab={tab} groupId={group.id} isActive={group.activeTabId === tab.id} />
          </div>
        </React.Fragment>
      ))}
      
      {/* Drop Indicator at the end */}
      {dragOverIndex === group.tabs.length && (
        <div className="w-0.5 bg-primary h-full shrink-0 relative z-10" />
      )}
    </div>
  );
}
