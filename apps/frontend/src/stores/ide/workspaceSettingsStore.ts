import { create } from 'zustand';

interface WorkspaceSettingsState {
  settings: Record<string, any>;
  isLoading: boolean;
  setSettings: (settings: Record<string, any>) => void;
  updateSetting: (key: string, value: any) => void;
  setLoading: (isLoading: boolean) => void;
  clearSettings: () => void;
}

export const useWorkspaceSettingsStore = create<WorkspaceSettingsState>((set) => ({
  settings: {},
  isLoading: false,

  setSettings: (settings) => set({ settings }),

  updateSetting: (key, value) =>
    set((state) => ({
      settings: {
        ...state.settings,
        [key]: value,
      },
    })),

  setLoading: (isLoading) => set({ isLoading }),

  clearSettings: () => set({ settings: {} }),
}));
