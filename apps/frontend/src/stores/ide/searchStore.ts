import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorageAdapter } from '../../services/storage.service';

interface SearchState {
  query: string;
  replace: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  includePattern: string;
  excludePattern: string;
  results: any[];
  loading: boolean;
  selectedResult: string | null;
  searchHistory: string[];
  replaceHistory: string[];
  recentQueries: string[];
  isSearching: boolean;
}

interface SearchActions {
  setQuery: (query: string) => void;
  setReplace: (replace: string) => void;
  toggleCaseSensitive: () => void;
  toggleWholeWord: () => void;
  toggleRegex: () => void;
  setIncludePattern: (pattern: string) => void;
  setExcludePattern: (pattern: string) => void;
  setResults: (results: any[]) => void;
  setLoading: (loading: boolean) => void;
  setSelectedResult: (id: string | null) => void;
  addRecentQuery: (query: string) => void;
}

export const useSearchStore = create<SearchState & SearchActions>()(
  persist(
    (set) => ({
      query: '',
      replace: '',
      caseSensitive: false,
      wholeWord: false,
      regex: false,
      includePattern: '',
      excludePattern: '',
      results: [],
      loading: false,
      selectedResult: null,
      searchHistory: [],
      replaceHistory: [],
      recentQueries: [],
      isSearching: false,

      setQuery: (query) => set({ query }),
      setReplace: (replace) => set({ replace }),
      toggleCaseSensitive: () => set((state) => ({ caseSensitive: !state.caseSensitive })),
      toggleWholeWord: () => set((state) => ({ wholeWord: !state.wholeWord })),
      toggleRegex: () => set((state) => ({ regex: !state.regex })),
      setIncludePattern: (pattern) => set({ includePattern: pattern }),
      setExcludePattern: (pattern) => set({ excludePattern: pattern }),
      setResults: (results) => set({ results }),
      setLoading: (loading) => set({ loading, isSearching: loading }),
      setSelectedResult: (id) => set({ selectedResult: id }),
      addRecentQuery: (query) => set((state) => ({
        recentQueries: [query, ...state.recentQueries.filter(q => q !== query)].slice(0, 50)
      })),
    }),
    {
      name: 'ide-search-storage',
      storage: createJSONStorage ? createJSONStorage(() => zustandStorageAdapter) : (zustandStorageAdapter as any),
      partialize: (state) => ({
        caseSensitive: state.caseSensitive,
        wholeWord: state.wholeWord,
        regex: state.regex,
        includePattern: state.includePattern,
        excludePattern: state.excludePattern,
        recentQueries: state.recentQueries,
      }),
    }
  )
);
