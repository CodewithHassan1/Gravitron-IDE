import { create } from 'zustand';

interface ProviderState {
  activeProviderId: string | null;
  availableModels: string[];
  setActiveProviderId: (id: string | null) => void;
  setAvailableModels: (models: string[]) => void;
}

export const useProviderStore = create<ProviderState>((set) => ({
  activeProviderId: null,
  availableModels: [],
  setActiveProviderId: (id) => set({ activeProviderId: id }),
  setAvailableModels: (models) => set({ availableModels: models }),
}));
