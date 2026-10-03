import { create } from 'zustand';
import { TimelineItem } from '../../services/timeline/types';

interface TimelineState {
  items: TimelineItem[];
  isLoading: boolean;
  activeFilters: Set<string>; // Empty means 'All', otherwise contains types to show (e.g. 'commit', 'save', 'ai')
  error: string | null;
  
  // Actions
  setItems: (items: TimelineItem[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  toggleFilter: (type: string) => void;
  clearFilters: () => void;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  items: [],
  isLoading: false,
  error: null,
  activeFilters: new Set(),
  
  setItems: (items) => set({ items, error: null }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  
  toggleFilter: (type) => set((state) => {
    const newFilters = new Set(state.activeFilters);
    if (newFilters.has(type)) {
      newFilters.delete(type);
    } else {
      newFilters.add(type);
    }
    return { activeFilters: newFilters };
  }),
  
  clearFilters: () => set({ activeFilters: new Set() })
}));
