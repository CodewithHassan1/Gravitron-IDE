import React, { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSearchStore } from '../../../stores/ide/searchStore';
import { NavigationEngine } from '../../../services/navigation/NavigationEngine';
import { FileText } from 'lucide-react';

export function SearchResults() {
  const { results } = useSearchStore();
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40, // 40px height per item to fit 2 lines
    overscan: 10,
  });

  return (
    <div ref={parentRef} className="flex-1 overflow-auto custom-scrollbar">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const result = results[virtualItem.index];
          // Determine if it is a TextSearchResult or legacy RankedResult
          const path = result.path || (result.item && result.item.path) || '';
          const line = result.line || 1;
          const column = result.column || 1;
          const preview = result.preview || (result.item && result.item.title) || '';
          const filename = path.split('/').pop() || path;

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full flex flex-col justify-center px-4 hover:bg-muted/50 cursor-pointer"
              style={{
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
              onClick={() => {
                if (path) {
                  NavigationEngine.revealLine(path, line, column);
                }
              }}
            >
              <div className="flex items-center text-xs text-foreground">
                <FileText className="w-3 h-3 mr-2 opacity-70 flex-shrink-0" />
                <span className="font-semibold truncate">{filename}</span>
                <span className="ml-2 truncate text-muted-foreground opacity-60">
                  {path}:{line}
                </span>
              </div>
              <div className="pl-5 text-xs text-muted-foreground truncate opacity-80">
                {preview}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
