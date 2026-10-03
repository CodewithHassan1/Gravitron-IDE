import { create } from 'zustand';

interface AIState {
  isChatOpen: boolean;
  setChatOpen: (isOpen: boolean) => void;
}

export const useAIStore = create<AIState>((set) => ({
  isChatOpen: false,
  setChatOpen: (isOpen) => set({ isChatOpen: isOpen }),
}));
