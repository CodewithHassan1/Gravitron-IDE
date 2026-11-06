import { create } from 'zustand';
import { GitStatusEntry } from '../../lib/scm/GitModels';

interface GitState {
  currentRepository: string | null;
  dirtyFiles: GitStatusEntry[];
  mergeState: 'none' | 'merging' | 'rebasing';
  setCurrentRepository: (id: string | null) => void;
  setDirtyFiles: (files: GitStatusEntry[]) => void;
  setMergeState: (state: 'none' | 'merging' | 'rebasing') => void;
}

export const useGitStore = create<GitState>((set) => ({
  currentRepository: null,
  dirtyFiles: [],
  mergeState: 'none',
  setCurrentRepository: (id) => set({ currentRepository: id }),
  setDirtyFiles: (files) => set({ dirtyFiles: files }),
  setMergeState: (state) => set({ mergeState: state }),
}));
