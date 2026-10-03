import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProfileState {
  activeProfileId: string;
  setActiveProfileId: (id: string) => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      activeProfileId: 'default',
      setActiveProfileId: (id) => set({ activeProfileId: id }),
    }),
    {
      name: 'ide-profile-storage',
    }
  )
);
