import { create } from 'zustand';
import { GitCommit } from '../../lib/scm/GitModels';

interface CommitState {
  history: GitCommit[];
  selection: string | null;
  page: number;
  setHistory: (commits: GitCommit[]) => void;
  setSelection: (oid: string | null) => void;
  setPage: (page: number) => void;
}

export const useCommitStore = create<CommitState>((set) => ({
  history: [],
  selection: null,
  page: 1,
  setHistory: (commits) => set({ history: commits }),
  setSelection: (oid) => set({ selection: oid }),
  setPage: (page) => set({ page })
}));
