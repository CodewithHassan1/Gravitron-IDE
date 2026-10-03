import { create } from 'zustand';

interface DiffState {
  openDiffs: string[];
  addDiff: (path: string) => void;
  removeDiff: (path: string) => void;
}

export const useDiffStore = create<DiffState>((set) => ({
  openDiffs: [],
  addDiff: (path) => set((state) => ({ openDiffs: Array.from(new Set([...state.openDiffs, path])) })),
  removeDiff: (path) => set((state) => ({ openDiffs: state.openDiffs.filter(p => p !== path) }))
}));
