import { create } from 'zustand';
import { GitBranch, GitTag } from '../../lib/scm/GitModels';

interface BranchState {
  currentBranch: string | null;
  branches: GitBranch[];
  tags: GitTag[];
  setCurrentBranch: (branch: string | null) => void;
  setBranches: (branches: GitBranch[]) => void;
  setTags: (tags: GitTag[]) => void;
}

export const useBranchStore = create<BranchState>((set) => ({
  currentBranch: null,
  branches: [],
  tags: [],
  setCurrentBranch: (branch) => set({ currentBranch: branch }),
  setBranches: (branches) => set({ branches }),
  setTags: (tags) => set({ tags })
}));
