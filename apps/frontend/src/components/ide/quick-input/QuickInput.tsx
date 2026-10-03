// src/components/ide/quick-input/QuickInput.tsx
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { QuickInputSession } from '../../../services/quickInput/QuickInputSession';
import { QuickInputEventBus, QuickInputEventType } from '../../../services/quickInput/QuickInputEventBus';
import { QuickInputItem } from '../../../types/quickInput';
import { Highlighter } from '../../../services/quickInput/search/Highlighter';

export function QuickInput() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<QuickInputItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  
  const parentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubOpened = QuickInputEventBus.subscribe(QuickInputEventType.QuickInputOpened, () => {
      setIsOpen(true);
      const state = QuickInputSession.getState();
      setQuery(state.query);
      setItems(state.items);
      setSelectedIndex(state.selectedIndex);
      setTimeout(() => inputRef.current?.focus(), 10);
    });

    const unsubClosed = QuickInputEventBus.subscribe(QuickInputEventType.QuickInputClosed, () => {
      setIsOpen(false);
    });

    const unsubItems = QuickInputEventBus.subscribe(QuickInputEventType.ItemsUpdated, () => {
      setItems([...QuickInputSession.getState().items]);
    });

    const unsubSelection = QuickInputEventBus.subscribe(QuickInputEventType.SelectionChanged, (payload) => {
      setSelectedIndex(payload.index);
      virtualizer.scrollToIndex(payload.index, { align: 'auto' });
    });

    const unsubLoadingStarted = QuickInputEventBus.subscribe(QuickInputEventType.LoadingStarted, () => {
      setIsLoading(true);
    });

    const unsubLoadingFinished = QuickInputEventBus.subscribe(QuickInputEventType.LoadingFinished, () => {
      setIsLoading(false);
    });

    return () => {
      unsubOpened();
      unsubClosed();
      unsubItems();
      unsubSelection();
      unsubLoadingStarted();
      unsubLoadingFinished();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        QuickInputSession.setOpen(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 10,
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        QuickInputSession.setSelectedIndex(selectedIndex + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        QuickInputSession.setSelectedIndex(selectedIndex - 1);
        break;
      case 'Home':
        e.preventDefault();
        QuickInputSession.setSelectedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        QuickInputSession.setSelectedIndex(items.length - 1);
        break;
      case 'PageDown':
        e.preventDefault();
        QuickInputSession.setSelectedIndex(selectedIndex + 10);
        break;
      case 'PageUp':
        e.preventDefault();
        QuickInputSession.setSelectedIndex(selectedIndex - 10);
        break;
      case 'Enter':
        e.preventDefault();
        QuickInputSession.executeSelected();
        break;
      case 'Escape':
        e.preventDefault();
        QuickInputSession.setOpen(false);
        break;
      case 'Tab':
        // Optional Tab completion could be hooked here
        e.preventDefault();
        break;
    }
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    QuickInputSession.setQuery(e.target.value);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      QuickInputSession.setOpen(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Quick Input"
      onClick={handleBackdropClick}
    >
      <div 
        className="w-[600px] max-w-[90vw] bg-card border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col"
        role="document"
      >
        <div className="relative flex items-center px-4 border-b border-border">
          <input
            ref={inputRef}
            className="w-full h-12 bg-transparent text-foreground outline-none placeholder:text-muted-foreground pr-24"
            placeholder="Type a command or search..."
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            aria-activedescendant={items.length > 0 ? `quick-input-item-${selectedIndex}` : undefined}
            aria-controls="quick-input-listbox"
            aria-autocomplete="list"
            role="combobox"
            aria-expanded="true"
          />
          <div className="absolute right-4 flex items-center gap-3">
            {isLoading && (
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-primary"></div>
            )}
            <button 
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => QuickInputSession.setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
        
        <div 
          ref={parentRef}
          className="max-h-[300px] overflow-y-auto custom-scrollbar"
          role="listbox"
          id="quick-input-listbox"
        >
          {items.length === 0 && !isLoading && query && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </div>
          )}
          
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const item = items[virtualItem.index];
              const isSelected = virtualItem.index === selectedIndex;
              const strippedQuery = QuickInputSession.getState().query.replace(/^[@>#:?]/, '').trim();
              const highlights = Highlighter.highlight(strippedQuery, item.label);
              
              // Helper to render highlights
              let lastEnd = 0;
              const labelNodes: React.ReactNode[] = [];
              highlights.forEach((h, i) => {
                if (h.start > lastEnd) labelNodes.push(<span key={`t-${i}`}>{item.label.substring(lastEnd, h.start)}</span>);
                labelNodes.push(<span key={`h-${i}`} className="text-primary font-bold">{item.label.substring(h.start, h.end)}</span>);
                lastEnd = h.end;
              });
              if (lastEnd < item.label.length) labelNodes.push(<span key={`t-end`}>{item.label.substring(lastEnd)}</span>);

              return (
                <div
                  key={item.id}
                  id={`quick-input-item-${virtualItem.index}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    QuickInputSession.setSelectedIndex(virtualItem.index);
                    QuickInputSession.executeSelected();
                  }}
                  className={`
                    absolute top-0 left-0 w-full flex items-center px-4 py-2 cursor-pointer
                    ${isSelected ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'}
                  `}
                  style={{
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <div className="flex-1 flex items-center overflow-hidden">
                    {item.icon && <span className="mr-2 flex-shrink-0 opacity-70">{item.icon}</span>}
                    <span className="truncate">{highlights.length > 0 ? labelNodes : item.label}</span>
                    {item.description && (
                      <span className="ml-2 text-xs opacity-60 truncate">{item.description}</span>
                    )}
                  </div>
                  {item.shortcut && (
                    <div className="ml-4 flex-shrink-0 text-xs opacity-50 font-mono tracking-wider">
                      {item.shortcut}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
