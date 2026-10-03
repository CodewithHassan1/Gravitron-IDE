import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorageAdapter } from '../../services/storage.service';

export enum LayoutMode {
  Default = 'Default',
  Zen = 'Zen',
  Centered = 'Centered',
  Presentation = 'Presentation',
  Debug = 'Debug',
}

export interface WorkspaceLayout {
  // Sidebar (Primary)
  isSidebarOpen: boolean;
  sidebarSize: number;
  lastSidebarSize: number;
  activeActivity: string; // ID from ViewRegistry

  // Secondary Sidebar
  isSecondarySidebarOpen: boolean;
  secondarySidebarSize: number;
  lastSecondarySidebarSize: number;
  activeSecondaryActivity: string; // ID from ViewRegistry

  // Bottom Panel
  isBottomPanelOpen: boolean;
  bottomPanelSize: number;
  lastBottomPanelSize: number;
  bottomPanelActiveTab: string; // ID from ViewRegistry

  // Editor Area
  editorGroupSize: number;

  // Global Layout Modes
  layoutMode: LayoutMode;
  isZenMode: boolean;
  isMaximizedEditor: boolean;
  isCenteredLayout: boolean;
}

export const defaultWorkspaceLayout: WorkspaceLayout = {
  isSidebarOpen: true,
  sidebarSize: 20,
  lastSidebarSize: 20,
  activeActivity: 'explorer',

  isSecondarySidebarOpen: false,
  secondarySidebarSize: 20,
  lastSecondarySidebarSize: 20,
  activeSecondaryActivity: 'outline',

  isBottomPanelOpen: false,
  bottomPanelSize: 25,
  lastBottomPanelSize: 25,
  bottomPanelActiveTab: 'terminal',

  editorGroupSize: 80,

  layoutMode: LayoutMode.Default,
  isZenMode: false,
  isMaximizedEditor: false,
  isCenteredLayout: false,
};

interface LayoutState extends WorkspaceLayout {
  currentWorkspaceId: string;
  layouts: Record<string, WorkspaceLayout>;
}


interface LayoutActions {
  setCurrentWorkspace: (workspaceId: string) => void;

  // Primary Sidebar
  setSidebarOpen: (isOpen: boolean) => void;
  toggleSidebar: () => void;
  setSidebarSize: (size: number) => void;
  setLastSidebarSize: (size: number) => void;
  setActiveActivity: (activityId: string) => void;

  // Secondary Sidebar
  setSecondarySidebarOpen: (isOpen: boolean) => void;
  toggleSecondarySidebar: () => void;
  setSecondarySidebarSize: (size: number) => void;
  setLastSecondarySidebarSize: (size: number) => void;
  setActiveSecondaryActivity: (activityId: string) => void;

  // Bottom Panel
  setBottomPanelOpen: (isOpen: boolean) => void;
  toggleBottomPanel: () => void;
  setBottomPanelSize: (size: number) => void;
  setLastBottomPanelSize: (size: number) => void;
  setBottomPanelActiveTab: (tabId: string) => void;

  // Editor Area
  setEditorGroupSize: (size: number) => void;

  // Layout Modes
  setLayoutMode: (mode: LayoutMode) => void;
  setZenMode: (enabled: boolean) => void;
  setMaximizedEditor: (enabled: boolean) => void;
  setCenteredLayout: (enabled: boolean) => void;
}

export const useLayoutStore = create<LayoutState & LayoutActions>()(
  persist(
    (set) => ({
      currentWorkspaceId: 'default',
      layouts: {},
      ...defaultWorkspaceLayout,

      // Actions
      setCurrentWorkspace: (workspaceId) => set((state) => {
        if (state.currentWorkspaceId === workspaceId) return {};
        const layoutToLoad = state.layouts[workspaceId] || defaultWorkspaceLayout;
        return {
          currentWorkspaceId: workspaceId,
          ...layoutToLoad
        };
      }),

      setSidebarOpen: (isOpen) => set((state) => {
        const nextLayout = { ...(state.layouts[state.currentWorkspaceId] || defaultWorkspaceLayout), isSidebarOpen: isOpen };
        return { isSidebarOpen: isOpen, layouts: { ...state.layouts, [state.currentWorkspaceId]: nextLayout } };
      }),
      toggleSidebar: () => set((state) => {
        const isOpen = !state.isSidebarOpen;
        const nextLayout = { ...(state.layouts[state.currentWorkspaceId] || defaultWorkspaceLayout), isSidebarOpen: isOpen };
        return { isSidebarOpen: isOpen, layouts: { ...state.layouts, [state.currentWorkspaceId]: nextLayout } };
      }),
      setSidebarSize: (size) => set((state) => {
        const nextLayout = { ...(state.layouts[state.currentWorkspaceId] || defaultWorkspaceLayout), sidebarSize: size };
        return { sidebarSize: size, layouts: { ...state.layouts, [state.currentWorkspaceId]: nextLayout } };
      }),
      setLastSidebarSize: (size) => set((state) => {
        const nextLayout = { ...(state.layouts[state.currentWorkspaceId] || defaultWorkspaceLayout), lastSidebarSize: size };
        return { lastSidebarSize: size, layouts: { ...state.layouts, [state.currentWorkspaceId]: nextLayout } };
      }),
      setActiveActivity: (activityId) => set((state) => {
        const nextLayout = { ...(state.layouts[state.currentWorkspaceId] || defaultWorkspaceLayout), activeActivity: activityId, isSidebarOpen: true };
        return { activeActivity: activityId, isSidebarOpen: true, layouts: { ...state.layouts, [state.currentWorkspaceId]: nextLayout } };
      }),

      setSecondarySidebarOpen: (isOpen) => set((state) => {
        const nextLayout = { ...(state.layouts[state.currentWorkspaceId] || defaultWorkspaceLayout), isSecondarySidebarOpen: isOpen };
        return { isSecondarySidebarOpen: isOpen, layouts: { ...state.layouts, [state.currentWorkspaceId]: nextLayout } };
      }),
      toggleSecondarySidebar: () => set((state) => {
        const isOpen = !state.isSecondarySidebarOpen;
        const nextLayout = { ...(state.layouts[state.currentWorkspaceId] || defaultWorkspaceLayout), isSecondarySidebarOpen: isOpen };
        return { isSecondarySidebarOpen: isOpen, layouts: { ...state.layouts, [state.currentWorkspaceId]: nextLayout } };
      }),
      setSecondarySidebarSize: (size) => set((state) => {
        const nextLayout = { ...(state.layouts[state.currentWorkspaceId] || defaultWorkspaceLayout), secondarySidebarSize: size };
        return { secondarySidebarSize: size, layouts: { ...state.layouts, [state.currentWorkspaceId]: nextLayout } };
      }),
      setLastSecondarySidebarSize: (size) => set((state) => {
        const nextLayout = { ...(state.layouts[state.currentWorkspaceId] || defaultWorkspaceLayout), lastSecondarySidebarSize: size };
        return { lastSecondarySidebarSize: size, layouts: { ...state.layouts, [state.currentWorkspaceId]: nextLayout } };
      }),
      setActiveSecondaryActivity: (activityId) => set((state) => {
        const nextLayout = { ...(state.layouts[state.currentWorkspaceId] || defaultWorkspaceLayout), activeSecondaryActivity: activityId, isSecondarySidebarOpen: true };
        return { activeSecondaryActivity: activityId, isSecondarySidebarOpen: true, layouts: { ...state.layouts, [state.currentWorkspaceId]: nextLayout } };
      }),

      setBottomPanelOpen: (isOpen) => set((state) => {
        const nextLayout = { ...(state.layouts[state.currentWorkspaceId] || defaultWorkspaceLayout), isBottomPanelOpen: isOpen };
        return { isBottomPanelOpen: isOpen, layouts: { ...state.layouts, [state.currentWorkspaceId]: nextLayout } };
      }),
      toggleBottomPanel: () => set((state) => {
        const isOpen = !state.isBottomPanelOpen;
        const nextLayout = { ...(state.layouts[state.currentWorkspaceId] || defaultWorkspaceLayout), isBottomPanelOpen: isOpen };
        return { isBottomPanelOpen: isOpen, layouts: { ...state.layouts, [state.currentWorkspaceId]: nextLayout } };
      }),
      setBottomPanelSize: (size) => set((state) => {
        const nextLayout = { ...(state.layouts[state.currentWorkspaceId] || defaultWorkspaceLayout), bottomPanelSize: size };
        return { bottomPanelSize: size, layouts: { ...state.layouts, [state.currentWorkspaceId]: nextLayout } };
      }),
      setLastBottomPanelSize: (size) => set((state) => {
        const nextLayout = { ...(state.layouts[state.currentWorkspaceId] || defaultWorkspaceLayout), lastBottomPanelSize: size };
        return { lastBottomPanelSize: size, layouts: { ...state.layouts, [state.currentWorkspaceId]: nextLayout } };
      }),
      setBottomPanelActiveTab: (tabId) => set((state) => {
        const nextLayout = { ...(state.layouts[state.currentWorkspaceId] || defaultWorkspaceLayout), bottomPanelActiveTab: tabId, isBottomPanelOpen: true };
        return { bottomPanelActiveTab: tabId, isBottomPanelOpen: true, layouts: { ...state.layouts, [state.currentWorkspaceId]: nextLayout } };
      }),

      setEditorGroupSize: (size) => set((state) => {
        const nextLayout = { ...(state.layouts[state.currentWorkspaceId] || defaultWorkspaceLayout), editorGroupSize: size };
        return { editorGroupSize: size, layouts: { ...state.layouts, [state.currentWorkspaceId]: nextLayout } };
      }),

      setLayoutMode: (mode) => set((state) => {
        const nextLayout = { ...(state.layouts[state.currentWorkspaceId] || defaultWorkspaceLayout), layoutMode: mode };
        return { layoutMode: mode, layouts: { ...state.layouts, [state.currentWorkspaceId]: nextLayout } };
      }),
      setZenMode: (enabled) => set((state) => {
        const nextLayout = { ...(state.layouts[state.currentWorkspaceId] || defaultWorkspaceLayout), isZenMode: enabled };
        return { isZenMode: enabled, layouts: { ...state.layouts, [state.currentWorkspaceId]: nextLayout } };
      }),
      setMaximizedEditor: (enabled) => set((state) => {
        const nextLayout = { ...(state.layouts[state.currentWorkspaceId] || defaultWorkspaceLayout), isMaximizedEditor: enabled };
        return { isMaximizedEditor: enabled, layouts: { ...state.layouts, [state.currentWorkspaceId]: nextLayout } };
      }),
      setCenteredLayout: (enabled) => set((state) => {
        const nextLayout = { ...(state.layouts[state.currentWorkspaceId] || defaultWorkspaceLayout), isCenteredLayout: enabled };
        return { isCenteredLayout: enabled, layouts: { ...state.layouts, [state.currentWorkspaceId]: nextLayout } };
      }),
    }),
    {
      name: 'ide-layout-storage',
      version: 1,
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          const oldState = { ...persistedState };
          const { currentWorkspaceId, layouts, ...legacyProps } = oldState;

          const migratedLayout = {
            ...defaultWorkspaceLayout,
            ...legacyProps
          };

          return {
            currentWorkspaceId: 'default',
            layouts: {
              'default': migratedLayout
            },
            ...migratedLayout
          };
        }
        return persistedState;
      },
      storage: createJSONStorage(() => zustandStorageAdapter),
    }
  )
);
