import { create } from 'zustand';

interface BootstrapState {
  isBootstrapped: boolean;
  bootstrapStage: string;
  setBootstrapped: (isBootstrapped: boolean) => void;
  setBootstrapStage: (stage: string) => void;
}

export const useBootstrapStore = create<BootstrapState>((set) => ({
  isBootstrapped: false,
  bootstrapStage: 'Initializing IDE...',
  setBootstrapped: (isBootstrapped) => set({ isBootstrapped }),
  setBootstrapStage: (bootstrapStage) => set({ bootstrapStage }),
}));
