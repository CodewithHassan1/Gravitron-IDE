import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  workbenchThemeId: string;
  monacoThemeId: string;
  terminalThemeId: string;
  iconThemeId: string;
  setThemes: (themes: Partial<Omit<ThemeState, 'setThemes'>>) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      workbenchThemeId: 'default-dark',
      monacoThemeId: 'vs-dark',
      terminalThemeId: 'default',
      iconThemeId: 'default-icons',
      setThemes: (themes) => set((state) => ({ ...state, ...themes })),
    }),
    {
      name: 'ide-theme-storage',
    }
  )
);
