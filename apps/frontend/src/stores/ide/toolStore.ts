import { create } from 'zustand';

interface ToolUIState {
  executingToolId: string | null;
  setExecutingToolId: (id: string | null) => void;
}

export const useToolStore = create<ToolUIState>((set) => ({
  executingToolId: null,
  setExecutingToolId: (id) => set({ executingToolId: id }),
}));
