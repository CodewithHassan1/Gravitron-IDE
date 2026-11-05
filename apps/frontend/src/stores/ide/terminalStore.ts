import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorageAdapter } from '../../services/storage.service';

export interface TerminalTabState {
  id: string;
  title: string;
  cwd: string;
  shellId: string;
}

export interface TerminalSplitGroup {
  id: string;
  activeTabId: string | null;
  tabs: TerminalTabState[];
}

export interface TerminalStoreState {
  workspaceId: string | null;
  groups: TerminalSplitGroup[];
  activeGroupId: string | null;
  zoomLevel: number;
  fontSize: number;
  rendererType: 'webgl' | 'canvas' | 'dom';
  cursorStyle: 'block' | 'underline' | 'bar';
}

export interface TerminalStoreActions {
  clearAll: (workspaceId: string) => void;
  addGroup: (group: TerminalSplitGroup) => void;
  addTab: (groupId: string, tab: TerminalTabState) => void;
  removeTab: (groupId: string, tabId: string) => void;
  setActiveTab: (groupId: string, tabId: string) => void;
  setActiveGroup: (groupId: string) => void;
  setZoomLevel: (zoom: number) => void;
  updateTabTitle: (groupId: string, tabId: string, title: string) => void;
  updateTabCwd: (groupId: string, tabId: string, cwd: string) => void;
}

export const useTerminalStore = create<TerminalStoreState & TerminalStoreActions>()(
  persist(
    (set) => ({
      workspaceId: null,
      groups: [],
      activeGroupId: null,
      zoomLevel: 1,
      fontSize: 14,
      rendererType: 'webgl',
      cursorStyle: 'block',

      clearAll: (workspaceId) => set({ groups: [], activeGroupId: null, workspaceId }),

      addGroup: (group) =>
        set((state) => ({
          groups: [...state.groups, group],
          activeGroupId: state.activeGroupId || group.id,
        })),

      addTab: (groupId, tab) =>
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === groupId ? { ...g, tabs: [...g.tabs, tab], activeTabId: tab.id } : g
          ),
        })),

      removeTab: (groupId, tabId) =>
        set((state) => {
          const groups = state.groups
            .map((g) => {
              if (g.id !== groupId) return g;
              const newTabs = g.tabs.filter((t) => t.id !== tabId);
              return {
                ...g,
                tabs: newTabs,
                activeTabId:
                  g.activeTabId === tabId ? newTabs[newTabs.length - 1]?.id || null : g.activeTabId,
              };
            })
            .filter((g) => g.tabs.length > 0);
          return {
            groups,
            activeGroupId:
              groups.length > 0
                ? state.activeGroupId === groupId && groups.every((g) => g.id !== groupId)
                  ? groups[0].id
                  : state.activeGroupId
                : null,
          };
        }),

      setActiveTab: (groupId, tabId) =>
        set((state) => ({
          groups: state.groups.map((g) => (g.id === groupId ? { ...g, activeTabId: tabId } : g)),
        })),

      updateTabTitle: (groupId, tabId, title) =>
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  tabs: g.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)),
                }
              : g
          ),
        })),

      updateTabCwd: (groupId, tabId, cwd) =>
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  tabs: g.tabs.map((t) => (t.id === tabId ? { ...t, cwd } : t)),
                }
              : g
          ),
        })),

      setActiveGroup: (groupId) => set({ activeGroupId: groupId }),

      setZoomLevel: (zoom) => set({ zoomLevel: zoom }),
    }),
    {
      name: 'ide-terminal-storage',
      storage: createJSONStorage
        ? createJSONStorage(() => zustandStorageAdapter)
        : (zustandStorageAdapter as any),
      partialize: (state) => ({
        workspaceId: state.workspaceId,
        groups: state.groups, // Serializing tabs handles persistent sessions
        activeGroupId: state.activeGroupId,
        zoomLevel: state.zoomLevel,
        fontSize: state.fontSize,
        rendererType: state.rendererType,
        cursorStyle: state.cursorStyle,
      }),
    }
  )
);
