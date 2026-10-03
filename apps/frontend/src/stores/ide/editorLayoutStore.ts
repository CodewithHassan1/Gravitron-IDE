import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { EditorTab } from '../../types/ide';
import { zustandStorageAdapter } from '../../services/storage.service';

export interface EditorGroup {
  id: string;
  tabs: EditorTab[];
  activeTabId: string | null;
  mruTabIds: string[];
}

export interface ClosedTabRecord {
  groupId: string;
  tab: EditorTab;
  originalIndex: number;
}

interface EditorLayoutState {
  groups: EditorGroup[];
  activeGroupId: string | null;
  closedTabsHistory: ClosedTabRecord[];
}

interface EditorLayoutActions {
  // Tabs
  openFile: (tab: Omit<EditorTab, 'id'>, groupId?: string) => void;
  closeFile: (groupId: string, tabId: string) => void;
  closeFilesByPath: (path: string) => void;
  setActiveTab: (groupId: string, tabId: string) => void;
  updateTabDirtyState: (groupId: string, tabId: string, isDirty: boolean) => void;
  pinTab: (groupId: string, tabId: string) => void;
  unpinTab: (groupId: string, tabId: string) => void;
  closeGroup: (groupId: string) => void;
  
  // New features
  restoreClosedTab: () => void;
  navigateMru: (groupId: string, direction: 'next' | 'prev') => void;
  navigateTabs: (groupId: string, direction: 'next' | 'prev') => void;
  
  // Groups
  setActiveGroup: (groupId: string) => void;
  splitGroup: (sourceGroupId: string, direction: 'horizontal' | 'vertical') => string;
  
  // Drag and Drop (moves tab from source to target group)
  moveTab: (sourceGroupId: string, targetGroupId: string, tabId: string, targetIndex: number) => void;
}

function updateMru(mruTabIds: string[], tabId: string | null): string[] {
  if (!tabId) return mruTabIds || [];
  const filtered = (mruTabIds || []).filter(id => id !== tabId);
  return [tabId, ...filtered];
}

function insertTabMaintainedOrder(tabs: EditorTab[], newTab: EditorTab, targetIndex?: number): EditorTab[] {
  const result = [...tabs];
  const lastPinnedIndex = result.reduce((last, t, i) => t.pinned ? i : last, -1);
  
  if (newTab.pinned) {
    const insertIdx = targetIndex !== undefined && targetIndex <= lastPinnedIndex + 1
      ? targetIndex 
      : lastPinnedIndex + 1;
    result.splice(insertIdx, 0, newTab);
  } else {
    const minIndex = lastPinnedIndex + 1;
    let insertIdx = targetIndex !== undefined ? targetIndex : result.length;
    if (insertIdx < minIndex) insertIdx = minIndex;
    result.splice(insertIdx, 0, newTab);
  }
  return result;
}

export const useEditorLayoutStore = create<EditorLayoutState & EditorLayoutActions>()(
  persist(
    (set, get) => ({
      groups: [{ id: 'main', tabs: [], activeTabId: null, mruTabIds: [] }],
      activeGroupId: 'main',
      closedTabsHistory: [],

      openFile: (tabData, targetGroupId) => {
        set((state) => {
          const groupId = targetGroupId || state.activeGroupId || state.groups[0]?.id || 'main';
          const groupIndex = state.groups.findIndex((g) => g.id === groupId);
          if (groupIndex === -1) return state;

          const group = state.groups[groupIndex];
          const existingTabIndex = group.tabs.findIndex((t) => t.path === tabData.path);
          
          let newTabs = [...group.tabs];
          let newActiveTabId: string;

          if (existingTabIndex >= 0) {
            newActiveTabId = group.tabs[existingTabIndex].id;
            
            // If the tab is already open but we requested it to be pinned or non-preview, update it
            if (tabData.pinned && !group.tabs[existingTabIndex].pinned) {
              const updatedTab = { ...group.tabs[existingTabIndex], isPreview: false, pinned: true };
              newTabs = newTabs.filter(t => t.id !== newActiveTabId);
              newTabs = insertTabMaintainedOrder(newTabs, updatedTab);
            } else if (tabData.isPreview === false && group.tabs[existingTabIndex].isPreview) {
              const updatedTab = { ...group.tabs[existingTabIndex], isPreview: false };
              newTabs = newTabs.filter(t => t.id !== newActiveTabId);
              newTabs = insertTabMaintainedOrder(newTabs, updatedTab);
            }
          } else {
            const newTab = { ...tabData, id: `tab-${Date.now()}` };
            
            if (newTab.isPreview) {
              const previewIndex = newTabs.findIndex((t) => t.isPreview && !t.dirty && !t.pinned);
              if (previewIndex >= 0) {
                newTabs[previewIndex] = newTab;
                // Move the new preview tab to end of normal tabs
                newTabs.splice(previewIndex, 1);
                newTabs = insertTabMaintainedOrder(newTabs, newTab);
              } else {
                newTabs = insertTabMaintainedOrder(newTabs, newTab);
              }
            } else {
              newTabs = insertTabMaintainedOrder(newTabs, newTab);
            }
            newActiveTabId = newTab.id;
          }

          const newGroups = [...state.groups];
          newGroups[groupIndex] = { 
            ...group, 
            tabs: newTabs, 
            activeTabId: newActiveTabId,
            mruTabIds: updateMru(group.mruTabIds, newActiveTabId)
          };

          return { groups: newGroups, activeGroupId: groupId };
        });
      },

      closeFile: (groupId, tabId) => {
        set((state) => {
          const groupIndex = state.groups.findIndex((g) => g.id === groupId);
          if (groupIndex === -1) return state;

          const group = state.groups[groupIndex];
          const tabIndex = group.tabs.findIndex(t => t.id === tabId);
          if (tabIndex === -1) return state;
          
          const tabToClose = group.tabs[tabIndex];
          const newTabs = group.tabs.filter((t) => t.id !== tabId);
          const newMru = (group.mruTabIds || []).filter(id => id !== tabId);
          
          let newActiveTabId = group.activeTabId;
          if (group.activeTabId === tabId) {
            // Find next active tab using MRU order that is still in the newTabs
            const fallbackId = newMru.find(id => newTabs.some(t => t.id === id));
            newActiveTabId = fallbackId || (newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null);
          }

          const newGroups = [...state.groups];
          newGroups[groupIndex] = { 
            ...group, 
            tabs: newTabs, 
            activeTabId: newActiveTabId,
            mruTabIds: newMru
          };
          
          const history = state.closedTabsHistory || [];
          const newHistory = [...history, { groupId, tab: tabToClose, originalIndex: tabIndex }];
          if (newHistory.length > 50) newHistory.shift();

          return { groups: newGroups, closedTabsHistory: newHistory };
        });
      },

      closeFilesByPath: (path) => {
        set((state) => {
          let newGroups = [...state.groups];
          let history = state.closedTabsHistory || [];
          let changed = false;

          // Normalize the path for directory prefix matching
          const isDir = !path.includes('.') && !path.endsWith('/') ? `${path}/` : path;

          for (let i = 0; i < newGroups.length; i++) {
            const group = newGroups[i];
            
            // Find all tabs that exactly match the path, or start with the directory prefix
            const tabsToClose = group.tabs.filter(t => t.path === path || t.path.startsWith(isDir));
            
            if (tabsToClose.length > 0) {
              changed = true;
              
              const newTabs = group.tabs.filter(t => !tabsToClose.includes(t));
              const tabsToCloseIds = new Set(tabsToClose.map(t => t.id));
              const newMru = (group.mruTabIds || []).filter(id => !tabsToCloseIds.has(id));
              
              let newActiveTabId = group.activeTabId;
              if (group.activeTabId && tabsToCloseIds.has(group.activeTabId)) {
                const fallbackId = newMru.find(id => newTabs.some(t => t.id === id));
                newActiveTabId = fallbackId || (newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null);
              }

              newGroups[i] = { 
                ...group, 
                tabs: newTabs, 
                activeTabId: newActiveTabId,
                mruTabIds: newMru
              };
              
              tabsToClose.forEach((t, idx) => {
                const originalIndex = group.tabs.indexOf(t);
                history = [...history, { groupId: group.id, tab: t, originalIndex }];
              });
              
              if (history.length > 50) history = history.slice(-50);
            }
          }

          if (!changed) return state;
          return { groups: newGroups, closedTabsHistory: history };
        });
      },

      setActiveTab: (groupId, tabId) => {
        set((state) => {
          const groupIndex = state.groups.findIndex((g) => g.id === groupId);
          if (groupIndex === -1) return state;

          const group = state.groups[groupIndex];
          const newGroups = [...state.groups];
          newGroups[groupIndex] = { 
            ...group, 
            activeTabId: tabId,
            mruTabIds: updateMru(group.mruTabIds, tabId)
          };

          return { groups: newGroups, activeGroupId: groupId };
        });
      },

      setActiveGroup: (groupId) => set({ activeGroupId: groupId }),

      updateTabDirtyState: (groupId, tabId, isDirty) => {
        set((state) => {
          const groupIndex = state.groups.findIndex((g) => g.id === groupId);
          if (groupIndex === -1) return state;

          const group = state.groups[groupIndex];
          const tabIndex = group.tabs.findIndex(t => t.id === tabId);
          if (tabIndex === -1) return state;

          const newTabs = [...group.tabs];
          newTabs[tabIndex] = { 
            ...newTabs[tabIndex], 
            dirty: isDirty,
            isPreview: isDirty ? false : newTabs[tabIndex].isPreview
          };

          const newGroups = [...state.groups];
          newGroups[groupIndex] = { ...group, tabs: newTabs };

          return { groups: newGroups };
        });
      },

      pinTab: (groupId, tabId) => {
        set((state) => {
          const groupIndex = state.groups.findIndex((g) => g.id === groupId);
          if (groupIndex === -1) return state;

          const group = state.groups[groupIndex];
          const tabIndex = group.tabs.findIndex(t => t.id === tabId);
          if (tabIndex === -1 || group.tabs[tabIndex].pinned) return state;

          const tab = { ...group.tabs[tabIndex], isPreview: false, pinned: true };
          let newTabs = group.tabs.filter(t => t.id !== tabId);
          newTabs = insertTabMaintainedOrder(newTabs, tab);

          const newGroups = [...state.groups];
          newGroups[groupIndex] = { ...group, tabs: newTabs };

          return { groups: newGroups };
        });
      },

      unpinTab: (groupId, tabId) => {
        set((state) => {
          const groupIndex = state.groups.findIndex((g) => g.id === groupId);
          if (groupIndex === -1) return state;

          const group = state.groups[groupIndex];
          const tabIndex = group.tabs.findIndex(t => t.id === tabId);
          if (tabIndex === -1 || !group.tabs[tabIndex].pinned) return state;

          const tab = { ...group.tabs[tabIndex], pinned: false };
          let newTabs = group.tabs.filter(t => t.id !== tabId);
          newTabs = insertTabMaintainedOrder(newTabs, tab);

          const newGroups = [...state.groups];
          newGroups[groupIndex] = { ...group, tabs: newTabs };

          return { groups: newGroups };
        });
      },

      closeGroup: (groupId) => {
        set((state) => {
          if (state.groups.length <= 1) {
            return {
              groups: [{ ...state.groups[0], tabs: [], activeTabId: null, mruTabIds: [] }],
              activeGroupId: state.groups[0].id
            };
          }
          const newGroups = state.groups.filter(g => g.id !== groupId);
          return {
            groups: newGroups,
            activeGroupId: newGroups[0].id
          };
        });
      },

      splitGroup: (sourceGroupId, direction) => {
        const newGroupId = `group-${Date.now()}`;
        set((state) => {
          const newGroups = [...state.groups];
          const sourceIndex = newGroups.findIndex(g => g.id === sourceGroupId);
          if (sourceIndex === -1) return state;

          newGroups.splice(sourceIndex + 1, 0, { id: newGroupId, tabs: [], activeTabId: null, mruTabIds: [] });

          return { groups: newGroups, activeGroupId: newGroupId };
        });
        return newGroupId;
      },

      moveTab: (sourceGroupId, targetGroupId, tabId, targetIndex) => {
        set((state) => {
          const sourceGroupIdx = state.groups.findIndex(g => g.id === sourceGroupId);
          const targetGroupIdx = state.groups.findIndex(g => g.id === targetGroupId);
          if (sourceGroupIdx === -1 || targetGroupIdx === -1) return state;

          const sourceGroup = state.groups[sourceGroupIdx];
          const tabToMove = sourceGroup.tabs.find(t => t.id === tabId);
          if (!tabToMove) return state;

          const newGroups = [...state.groups];

          if (sourceGroupId === targetGroupId) {
            // Same group drag
            let newTabs = sourceGroup.tabs.filter(t => t.id !== tabId);
            newTabs = insertTabMaintainedOrder(newTabs, tabToMove, targetIndex);
            
            newGroups[sourceGroupIdx] = { 
              ...sourceGroup, 
              tabs: newTabs 
            };
          } else {
            // Cross group drag
            const newSourceTabs = sourceGroup.tabs.filter(t => t.id !== tabId);
            const newSourceMru = (sourceGroup.mruTabIds || []).filter(id => id !== tabId);
            let newSourceActiveId = sourceGroup.activeTabId;
            if (sourceGroup.activeTabId === tabId) {
              const fallbackId = newSourceMru.find(id => newSourceTabs.some(t => t.id === id));
              newSourceActiveId = fallbackId || (newSourceTabs.length > 0 ? newSourceTabs[newSourceTabs.length - 1].id : null);
            }

            const targetGroup = state.groups[targetGroupIdx];
            let newTargetTabs = [...targetGroup.tabs];
            newTargetTabs = insertTabMaintainedOrder(newTargetTabs, tabToMove, targetIndex);

            newGroups[sourceGroupIdx] = { 
              ...sourceGroup, 
              tabs: newSourceTabs, 
              activeTabId: newSourceActiveId,
              mruTabIds: newSourceMru
            };
            
            newGroups[targetGroupIdx] = { 
              ...targetGroup, 
              tabs: newTargetTabs, 
              activeTabId: tabToMove.id,
              mruTabIds: updateMru(targetGroup.mruTabIds, tabToMove.id)
            };
          }

          return { groups: newGroups, activeGroupId: targetGroupId };
        });
      },

      restoreClosedTab: () => {
        set((state) => {
          const history = state.closedTabsHistory || [];
          if (history.length === 0) return state;
          
          const newHistory = [...history];
          const record = newHistory.pop()!;
          
          let groupId = record.groupId;
          let groupIndex = state.groups.findIndex(g => g.id === groupId);
          
          if (groupIndex === -1) {
            groupId = state.activeGroupId || state.groups[0].id;
            groupIndex = state.groups.findIndex(g => g.id === groupId);
          }
          if (groupIndex === -1) return state;
          
          const group = state.groups[groupIndex];
          let newTabs = [...group.tabs];
          
          const existingPathIdx = newTabs.findIndex(t => t.path === record.tab.path);
          if (existingPathIdx >= 0) {
            return {
              groups: state.groups.map(g => g.id === groupId ? {
                ...g,
                activeTabId: newTabs[existingPathIdx].id,
                mruTabIds: updateMru(g.mruTabIds, newTabs[existingPathIdx].id)
              } : g),
              closedTabsHistory: newHistory,
              activeGroupId: groupId
            };
          }
          
          newTabs = insertTabMaintainedOrder(newTabs, record.tab, record.originalIndex);
          
          const newGroups = [...state.groups];
          newGroups[groupIndex] = {
            ...group,
            tabs: newTabs,
            activeTabId: record.tab.id,
            mruTabIds: updateMru(group.mruTabIds, record.tab.id)
          };
          
          return { groups: newGroups, closedTabsHistory: newHistory, activeGroupId: groupId };
        });
      },

      navigateMru: (groupId, direction) => {
        set((state) => {
          const groupIndex = state.groups.findIndex(g => g.id === groupId);
          if (groupIndex === -1) return state;
          
          const group = state.groups[groupIndex];
          const mru = group.mruTabIds || [];
          if (mru.length <= 1) return state;
          
          const currentIndex = mru.findIndex(id => id === group.activeTabId);
          if (currentIndex === -1) return state;
          
          let nextIndex = currentIndex;
          if (direction === 'next') {
            nextIndex = currentIndex + 1 < mru.length ? currentIndex + 1 : 0;
          } else {
            nextIndex = currentIndex - 1 >= 0 ? currentIndex - 1 : mru.length - 1;
          }
          
          const nextTabId = mru[nextIndex];
          const newGroups = [...state.groups];
          newGroups[groupIndex] = { ...group, activeTabId: nextTabId };
          
          return { groups: newGroups };
        });
      },

      navigateTabs: (groupId, direction) => {
        set((state) => {
          const groupIndex = state.groups.findIndex(g => g.id === groupId);
          if (groupIndex === -1) return state;
          
          const group = state.groups[groupIndex];
          if (group.tabs.length <= 1) return state;
          
          const currentIndex = group.tabs.findIndex(t => t.id === group.activeTabId);
          if (currentIndex === -1) return state;
          
          let nextIndex = currentIndex;
          if (direction === 'next') {
            nextIndex = currentIndex + 1 < group.tabs.length ? currentIndex + 1 : 0;
          } else {
            nextIndex = currentIndex - 1 >= 0 ? currentIndex - 1 : group.tabs.length - 1;
          }
          
          const nextTabId = group.tabs[nextIndex].id;
          const newGroups = [...state.groups];
          newGroups[groupIndex] = { 
            ...group, 
            activeTabId: nextTabId,
            mruTabIds: updateMru(group.mruTabIds, nextTabId)
          };
          
          return { groups: newGroups };
        });
      }
    }),
    {
      name: 'ide-editor-layout-storage',
      storage: createJSONStorage(() => zustandStorageAdapter),
    }
  )
);
