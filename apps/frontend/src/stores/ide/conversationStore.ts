import { create } from 'zustand';
import { AIMessagePayload } from '../../platform/ai/AIProvider';

interface ConversationState {
  activeConversationId: string | null;
  activePath: AIMessagePayload[];
  setActiveConversationId: (id: string | null) => void;
  setActivePath: (path: AIMessagePayload[]) => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  activeConversationId: null,
  activePath: [],
  setActiveConversationId: (id) => set({ activeConversationId: id }),
  setActivePath: (path) => set({ activePath: path }),
}));
