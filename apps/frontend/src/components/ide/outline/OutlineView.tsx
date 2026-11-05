import React, { useMemo, useEffect } from 'react';
import { useOutlineStore } from '../../../stores/ide/outlineStore';
import { EditorManager } from '../../../services/editor/EditorManager';
import { SymbolNavigator } from '../../../services/outline/SymbolNavigator';
import { DocumentSymbol } from '../../../services/editor/adapter/EditorAdapter';
import { ChevronRight, ChevronDown, Type, Box, FunctionSquare, LayoutTemplate } from 'lucide-react';
import Fuse from 'fuse.js';

export function OutlineView() {
  const { cache, searchQuery, sortBy, followCursor, setSearchQuery, updateExpandedState } =
    useOutlineStore();
  const uri = EditorManager.adapter.getActiveEditorUri();
  const selectedRef = React.useRef<HTMLDivElement>(null);

  const cached = uri ? cache.get(uri) : null;
  const symbols = useMemo(() => cached?.symbols || [], [cached]);
  const expandedState = cached?.expandedState || new Set<string>();
  const selectedSymbol = cached?.selectedSymbol || null;

  useEffect(() => {
    if (followCursor && selectedSymbol && selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedSymbol, followCursor]);

  const getSymbolIcon = (kind: number) => {
    // Basic mapping based on Monaco symbol kinds
    switch (kind) {
      case 1:
        return <Box size={14} className="text-blue-500 mr-1" />; // File
      case 2:
        return <LayoutTemplate size={14} className="text-purple-500 mr-1" />; // Module
      case 3:
        return <LayoutTemplate size={14} className="text-purple-500 mr-1" />; // Namespace
      case 4:
        return <Type size={14} className="text-green-500 mr-1" />; // Package
      case 5:
        return <Type size={14} className="text-yellow-500 mr-1" />; // Class
      case 6:
        return <FunctionSquare size={14} className="text-purple-400 mr-1" />; // Method
      case 7:
        return <Type size={14} className="text-red-400 mr-1" />; // Property
      case 11:
        return <FunctionSquare size={14} className="text-purple-400 mr-1" />; // Function
      case 12:
        return <Type size={14} className="text-blue-400 mr-1" />; // Variable
      default:
        return <Box size={14} className="text-muted-foreground mr-1" />;
    }
  };

  const getSymbolId = (symbol: DocumentSymbol): string => {
    return `${symbol.name}:${symbol.range.startLineNumber}:${symbol.range.startColumn}`;
  };

  const renderSymbol = (symbol: DocumentSymbol, depth: number = 0) => {
    const id = getSymbolId(symbol);
    const isExpanded = expandedState.has(id);
    const isSelected = selectedSymbol === id;
    const hasChildren = symbol.children && symbol.children.length > 0;

    return (
      <div key={id}>
        <div
          ref={isSelected ? selectedRef : null}
          className={`flex items-center py-1 cursor-pointer hover:bg-accent ${isSelected ? 'bg-accent text-accent-foreground' : ''}`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => {
            if (uri) {
              SymbolNavigator.jumpToSymbol(uri, symbol);
            }
          }}
        >
          <div
            className="w-4 flex items-center justify-center mr-1"
            onClick={(e) => {
              if (hasChildren) {
                e.stopPropagation();
                if (uri) {
                  updateExpandedState(uri, id, !isExpanded);
                }
              }
            }}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )
            ) : null}
          </div>
          {getSymbolIcon(symbol.kind)}
          <span className="text-sm truncate">{symbol.name}</span>
        </div>
        {(isExpanded || searchQuery) && hasChildren && (
          <div>{symbol.children!.map((child) => renderSymbol(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  // Flatten for search or just recursive search
  const filteredSymbols = useMemo(() => {
    if (!searchQuery) return symbols;

    // A flat list of all symbols
    const flatten = (syms: DocumentSymbol[]): DocumentSymbol[] => {
      let result: DocumentSymbol[] = [];
      for (const s of syms) {
        result.push(s);
        if (s.children) {
          result = result.concat(flatten(s.children));
        }
      }
      return result;
    };

    const flat = flatten(symbols);
    const fuse = new Fuse(flat, { keys: ['name'], threshold: 0.4 });
    const results = fuse.search(searchQuery);
    return results.map((r) => r.item);
  }, [symbols, searchQuery]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-2 border-b border-border/50">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search symbols..."
          className="w-full bg-background border border-border/50 text-foreground text-sm rounded px-2 py-1 outline-none focus:border-ring"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filteredSymbols.length > 0 ? (
          filteredSymbols.map((sym) => renderSymbol(sym, 0))
        ) : (
          <div className="p-4 text-center text-sm text-muted-foreground">No symbols found</div>
        )}
      </div>
    </div>
  );
}
