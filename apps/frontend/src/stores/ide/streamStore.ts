import { create } from 'zustand';

interface StreamState {
  activeStreamId: string | null;
  streamContent: string;
  setActiveStreamId: (id: string | null) => void;
  setStreamContent: (content: string) => void;
}

export const useStreamStore = create<StreamState>((set) => ({
  activeStreamId: null,
  streamContent: '',
  setActiveStreamId: (id) => set({ activeStreamId: id }),
  setStreamContent: (content) => set({ streamContent: content }),
}));
