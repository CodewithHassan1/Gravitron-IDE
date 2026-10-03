import { create } from 'zustand';
import { CachedOutline } from '../../services/outline/types';

interface OutlineState {
  cache: Map<string, CachedOutline>;
  searchQuery: string;
  sortBy: 'position' | 'name';
  followCursor: boolean;
  
  // Actions
  setCache: (uri: string, outline: CachedOutline) => void;
  updateExpandedState: (uri: string, symbolId: string, expanded: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSortBy: (sort: 'position' | 'name') => void;
  setFollowCursor: (follow: boolean) => void;
  setSelectedSymbol: (uri: string, symbolId: string | null) => void;
}

export const useOutlineStore = create<OutlineState>((set, get) => ({
  cache: new Map(),
  searchQuery: '',
  sortBy: 'position',
  followCursor: true,

  setCache: (uri, outline) => set((state) => {
    const newCache = new Map(state.cache);
    newCache.set(uri, outline);
    return { cache: newCache };
  }),

  updateExpandedState: (uri, symbolId, expanded) => set((state) => {
    const cached = state.cache.get(uri);
    if (!cached) return state;

    const newExpandedState = new Set(cached.expandedState);
    if (expanded) {
      newExpandedState.add(symbolId);
    } else {
      newExpandedState.delete(symbolId);
    }

    const newCache = new Map(state.cache);
    newCache.set(uri, { ...cached, expandedState: newExpandedState });
    return { cache: newCache };
  }),

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSortBy: (sortBy) => set({ sortBy }),
  setFollowCursor: (followCursor) => set({ followCursor }),

  setSelectedSymbol: (uri, symbolId) => set((state) => {
    const cached = state.cache.get(uri);
    if (!cached) return state;

    const newCache = new Map(state.cache);
    newCache.set(uri, { ...cached, selectedSymbol: symbolId });
    return { cache: newCache };
  }),
}));
