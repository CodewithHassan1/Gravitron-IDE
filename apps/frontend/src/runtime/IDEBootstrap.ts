import { registerPrimaryViews } from '../components/ide/views/PrimaryViews';
import { registerSecondaryViews } from '../components/ide/views/SecondaryViews';
import { registerDefaultSettingRenderers } from '../components/ide/settings/SettingsSetup';
import { registerRepositorySettings } from '../components/ide/settings/RepositorySettingsSetup';
import { registerGitSettings } from '../components/ide/settings/GitSettingsSetup';
import { registerAISettings } from '../components/ide/settings/AISettingsSetup';
import { registerGitCommands } from '../components/ide/scm/SCMCommandsSetup';
import { registerAICommands } from '../components/ide/ai/AICommandsSetup';
import { GitDecorator } from '../services/scm/MonacoGitDecorator';
import { GitManager } from '../services/scm/GitManager';
import { OutlineService } from '../services/outline/OutlineService';
import { TimelineService } from '../services/timeline/TimelineService';
import { OutlineProviderRegistry } from '../services/outline/OutlineProviderRegistry';
import { TimelineProviderRegistry } from '../services/timeline/TimelineProviderRegistry';
import { ContextEngine } from '../services/quickInput/ContextEngine';
import { EditorDocumentSymbolProvider } from '../services/outline/providers/EditorDocumentSymbolProvider';
import { GitTimelineProvider } from '../services/timeline/providers/GitTimelineProvider';
import { LocalHistoryProvider } from '../services/timeline/providers/LocalHistoryProvider';

import { VirtualDocumentProvider } from '../services/editor/VirtualDocumentProvider';
import { SettingsWindow } from '../components/ide/settings/SettingsWindow';
import { CommandRegistry } from '../lib/registries/CommandRegistry';
import { EditorCommandService } from '../services/editor/EditorCommandService';
import { unwrapIpcResponse } from '@ag/protocol';
import { WorkspaceManager } from '../services/workspace/WorkspaceManager';
import { NamingUtility } from '../services/workspace/NamingUtility';
import { useWorkspaceTreeStore } from '../stores/ide/workspaceTreeStore';
import { WorkspaceIndexer } from '../services/search/WorkspaceIndexer';
import { useLayoutStore } from '../stores/ide/layoutStore';
import { useEditorLayoutStore } from '../stores/ide/editorLayoutStore';
import { useTerminalStore } from '../stores/ide/terminalStore';
import { WorkspaceSession } from '../services/workspace/WorkspaceSession';
import { WorkspaceEvents } from '../services/workspace/WorkspaceEvents';
import { WorkspaceEventType } from '../services/workspace/types';
import { TerminalUIHelper } from '../components/ide/terminal/TerminalUIHelper';

import { ModelManager } from '../services/editor/ModelManager';
import { EditorManager } from '../services/editor/EditorManager';
import { TerminalManager } from '../services/terminal';
import { NavigationEngine } from '../services/navigation/NavigationEngine';
import { DiagnosticsManager } from '../services/diagnostics/DiagnosticsManager';


import { FileProvider } from '../services/quickInput/providers/FileProvider';
import { RecentWorkspacesProvider } from '../services/quickInput/providers/RecentWorkspacesProvider';
import { CommandProvider } from '../services/quickInput/providers/CommandProvider';
import { GoToLineProvider } from '../services/quickInput/providers/GoToLineProvider';
import { SymbolProvider } from '../services/quickInput/providers/SymbolProvider';
import { HelpProvider } from '../services/quickInput/providers/HelpProvider';
import { QuickInputRegistry } from '../services/quickInput/QuickInputRegistry';
import { QuickInputTelemetry } from '../services/quickInput/QuickInputTelemetry';
import { QuickInputSession } from '../services/quickInput/QuickInputSession';
import { ShortcutFormatter } from '@ag/core';
import { MenuSyncService } from '../services/quickInput/ApplicationMenuSyncService';

// --- TEMPORARY RUNTIME AUDIT DIAGNOSTICS ---
// -------------------------------------------

import { ContributionRegistry, MenuRegistry } from '@ag/core';
import { systemEventBus, SystemEvents } from '../lib/events/SystemEvents';

let isCoreBootstrapped = false;
export async function bootstrapCore(onStage?: (stage: string) => void) {
  if (isCoreBootstrapped) return;
  isCoreBootstrapped = true;

  const delay = () => new Promise(r => setTimeout(r, 0));

  onStage?.('Initializing Settings Registry...');
  await delay();
  registerDefaultSettingRenderers();
  registerRepositorySettings();
  registerGitSettings();
  registerAISettings();

  onStage?.('Initializing Quick Input...');
  await delay();
  QuickInputTelemetry.initialize();
  QuickInputRegistry.registerProvider(new FileProvider());
  QuickInputRegistry.registerProvider(new RecentWorkspacesProvider());
  QuickInputRegistry.registerProvider(new CommandProvider());
  QuickInputRegistry.registerProvider(new GoToLineProvider());
  QuickInputRegistry.registerProvider(new SymbolProvider());
  QuickInputRegistry.registerProvider(new HelpProvider());

  onStage?.('Initializing Command Registry...');
  await delay();

  ContributionRegistry.setCommandRegistrar((cmd, shortcut) => {
    return CommandRegistry.registerCommand(cmd, shortcut);
  });

  registerGitCommands();
  registerAICommands();
  registerCoreCommands();

  onStage?.('Initializing Services...');
  await delay();
  VirtualDocumentProvider.register({
    uri: 'settings://user',
    title: 'Settings',
    component: SettingsWindow,
  });
}

let isWorkbenchBootstrapped = false;
export async function bootstrapWorkbench(onStage?: (stage: string) => void) {
  if (isWorkbenchBootstrapped) return;
  isWorkbenchBootstrapped = true;

  const { WorkbenchContribution } = await import('./WorkbenchContributions');
  ContributionRegistry.registerExtension(WorkbenchContribution);
  systemEventBus.emit(SystemEvents.MenuRegistered as any);

  MenuSyncService.init();
}

let activeWorkspaceCleanups: (() => void)[] = [];

export async function bootstrapWorkspace(onStage?: (stage: string) => void) {
  // If already bootstrapped, clean up first or ignore? 
  // Let's assume we run this when opening a workspace.

  // Clean up any old workspace managers
  activeWorkspaceCleanups.forEach(fn => fn());
  activeWorkspaceCleanups = [];

  // Memory hook
  const unsub = useEditorLayoutStore.subscribe((state, prevState) => {
    const totalOldTabs = prevState.groups.reduce((acc, g) => acc + g.tabs.length, 0);
    const totalNewTabs = state.groups.reduce((acc, g) => acc + g.tabs.length, 0);
    if (totalNewTabs < totalOldTabs) {
      const activeUris = new Set<string>();
      state.groups.forEach(g => g.tabs.forEach(t => activeUris.add(t.path)));
      ModelManager.garbageCollect(activeUris);
    }
  });
  activeWorkspaceCleanups.push(unsub);

  // Auto-close tabs when files are deleted
  const onFileDeleted = (event: any) => {
    if (event.payload?.path) {
      useEditorLayoutStore.getState().closeFilesByPath(event.payload.path);
    }
  };
  const unsubFileDel = WorkspaceEvents.on(WorkspaceEventType.FileDeleted, onFileDeleted);
  const unsubFolderDel = WorkspaceEvents.on(WorkspaceEventType.FolderDeleted, onFileDeleted);
  activeWorkspaceCleanups.push(unsubFileDel);
  activeWorkspaceCleanups.push(unsubFolderDel);

  const delay = () => new Promise(r => setTimeout(r, 0));

  const unsubTerminal = TerminalUIHelper.initialize(WorkspaceManager.getWorkspaceId() || 'unknown');
  activeWorkspaceCleanups.push(unsubTerminal);

  onStage?.('Initializing View Registry...');
  await delay();
  registerPrimaryViews();
  registerSecondaryViews();

  onStage?.('Initializing Managers...');
  await delay();
  GitDecorator.initialize();
  await GitManager.initialize();
  await WorkspaceIndexer.buildMockIndex();
  OutlineService.initialize();
  TimelineService.initialize();
  DiagnosticsManager.initialize();

  OutlineProviderRegistry.register(new EditorDocumentSymbolProvider());
  TimelineProviderRegistry.register(new GitTimelineProvider());
  TimelineProviderRegistry.register(LocalHistoryProvider);
}
function registerCoreCommands() {
  CommandRegistry.registerCommand({
    id: 'workbench.action.openRecent',
    title: 'Open Recent Workspace',
    handler: () => {
      import('../services/quickInput/QuickInputSession').then(m => m.QuickInputSession.setOpen(true, '~'));
    },
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.compareEditor', requiresWorkspace: true,
    title: 'Compare with Timeline Item',
    handler: (item: any) => {
      console.log('Comparing editor with:', item);
      // We would open a diff editor comparing the active file with the version from this timeline item
      // This will likely require EditorManager.openDiffEditor() once implemented.
    }
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.files.openFolder',
    title: 'Open Folder',
    category: 'File',
    handler: async () => {
      try {
        if (typeof window !== 'undefined' && (window as any).agApi) {
          const rawResult = await (window as any).agApi.workspace.selectAndOpen();
          const result = unwrapIpcResponse<{ path: string, name: string, type: string }>(rawResult);
          try {
            if (result && result.path) {
              const metadata: any = {
                id: result.path,
                name: result.name,
                uri: 'file:///' + result.path.split('\\').join('/'),
                provider: 'electron',
                lastOpened: Date.now(),
                type: result.type || 'directory',
                capabilities: {
                  explorer: true,
                  recursiveSearch: true,
                  git: true,
                  terminal: true,
                  multipleRoots: false,
                  writable: true,
                }
              };
              await WorkspaceManager.openWorkspace(metadata, { nativeHandle: null });
            }
          } catch (e: any) {
            if (e.message.includes('CANCELED')) {
              console.log('User cancelled folder open');
            } else {
              throw e;
            }
          }
        } else {
          const handle = await (window as any).showDirectoryPicker();
          const metadata: any = {
            id: handle.name,
            name: handle.name,
            uri: 'file:///' + handle.name.split('\\').join('/'),
            provider: 'browser',
            lastOpened: Date.now(),
            type: 'directory',
            capabilities: {
              explorer: true,
              recursiveSearch: true,
              git: true,
              terminal: true,
              multipleRoots: false,
              writable: true,
            }
          };
          await WorkspaceManager.openWorkspace(metadata, { nativeHandle: handle });
        }
      } catch (e) {
        console.warn('User cancelled folder open', e);
      }
    },
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.files.reloadWorkspace', requiresWorkspace: true,
    title: 'Reload Workspace',
    category: 'File',
    handler: async () => {
      await WorkspaceManager.reloadWorkspace();
    },
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.files.openRecent',
    title: 'Open Recent Workspace',
    category: 'File',
    handler: async () => {
      // Stub for opening recent workspace
      console.log('Open Recent Workspace command invoked');
    },
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.git.clone',
    title: 'Clone Repository',
    category: 'Git',
    handler: async () => {
      // Stub for cloning repository
      console.log('Clone Repository command invoked');
    },
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.files.refreshExplorer', requiresWorkspace: true,
    title: 'Refresh Explorer',
    category: 'File',
    handler: async () => {
      await WorkspaceManager.reloadWorkspace();
    },
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.toggleSidebarVisibility', requiresWorkspace: true,
    title: 'Toggle Sidebar Visibility',
    category: 'View',
    handler: () => useLayoutStore.getState().toggleSidebar(),
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.togglePanel', requiresWorkspace: true,
    title: 'Toggle Bottom Panel',
    category: 'View',
    handler: () => useLayoutStore.getState().toggleBottomPanel(),
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.toggleSecondarySidebarVisibility', requiresWorkspace: true,
    title: 'Toggle Secondary Sidebar',
    category: 'View',
    handler: () => useLayoutStore.getState().toggleSecondarySidebar(),
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.openSettings',
    title: 'Open Settings',
    handler: () => {
      const store = useEditorLayoutStore.getState();
      const activeGroup = store.groups.find(g => g.id === store.activeGroupId) || store.groups[0];
      if (activeGroup) {
        store.openFile({
          path: 'settings://user',
          title: 'Settings',
          language: 'json',
          dirty: false,
          pinned: false,
          isPreview: false,
        }, activeGroup.id);
      }
    },
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.showCommands', requiresWorkspace: true,
    title: 'Show Command Palette',
    handler: () => QuickInputSession.setOpen(true, '>'),
  }, 'Ctrl+Shift+P');

  CommandRegistry.registerCommand({
    id: 'workbench.action.quickOpen', requiresWorkspace: true,
    title: 'Go to File',
    handler: () => QuickInputSession.setOpen(true, ''),
  }, 'Ctrl+P');

  CommandRegistry.registerCommand({
    id: 'workbench.action.findInFiles', requiresWorkspace: true,
    title: 'Find in Files',
    handler: () => {
      useLayoutStore.getState().setSidebarOpen(true);
      useLayoutStore.getState().setActiveActivity('search');
    },
  }, 'Ctrl+Shift+F');

  CommandRegistry.registerCommand({
    id: 'workbench.action.showSearch', requiresWorkspace: true,
    title: 'Show Search',
    handler: () => {
      useLayoutStore.getState().setSidebarOpen(true);
      useLayoutStore.getState().setActiveActivity('search');
    },
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.showExplorer', requiresWorkspace: true,
    title: 'Show Explorer',
    handler: () => {
      useLayoutStore.getState().setSidebarOpen(true);
      useLayoutStore.getState().setActiveActivity('explorer');
    },
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.gotoSymbol', requiresWorkspace: true,
    title: 'Go to Symbol',
    handler: () => QuickInputSession.setOpen(true, '@'),
  }, 'Ctrl+Shift+O');

  CommandRegistry.registerCommand({
    id: 'workbench.action.gotoLine', requiresWorkspace: true,
    title: 'Go to Line',
    handler: () => QuickInputSession.setOpen(true, ':'),
  }, 'Ctrl+G');

  CommandRegistry.registerCommand({
    id: 'workbench.action.terminal.toggleTerminal', requiresWorkspace: true,
    title: 'Toggle Terminal',
    handler: () => {
      const isOpen = useLayoutStore.getState().isBottomPanelOpen;
      const activeTab = useLayoutStore.getState().bottomPanelActiveTab;
      if (isOpen && activeTab === 'terminal') {
        useLayoutStore.getState().setBottomPanelOpen(false);
      } else {
        useLayoutStore.getState().setBottomPanelOpen(true);
        useLayoutStore.getState().setBottomPanelActiveTab('terminal');
      }
    },
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.terminal.new', requiresWorkspace: true,
    title: 'New Terminal',
    handler: () => {
      useLayoutStore.getState().setBottomPanelOpen(true);
      useLayoutStore.getState().setBottomPanelActiveTab('terminal');
      const groupId = useTerminalStore.getState().activeGroupId || `group_${Date.now()}`;
      if (!useTerminalStore.getState().activeGroupId) {
        useTerminalStore.getState().addGroup({ id: groupId, tabs: [], activeTabId: null });
      }

      TerminalUIHelper.createTerminal(groupId);
    },
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.terminal.split', requiresWorkspace: true,
    title: 'Split Terminal',
    handler: () => {
      useLayoutStore.getState().setBottomPanelOpen(true);
      useLayoutStore.getState().setBottomPanelActiveTab('terminal');
      const groupId = useTerminalStore.getState().activeGroupId;
      if (groupId) {
        TerminalUIHelper.splitTerminal(groupId);
      }
    },
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.terminal.clear', requiresWorkspace: true,
    title: 'Clear Terminal',
    handler: () => {
      // Implementation pending
    },
  });

  // Editor Tabs Commands
  CommandRegistry.registerCommand({
    id: 'workbench.action.closeActiveEditor', requiresWorkspace: true,
    title: 'Close Active Editor',
    category: 'View',
    handler: () => {
      const store = useEditorLayoutStore.getState();
      if (store.activeGroupId) {
        const group = store.groups.find(g => g.id === store.activeGroupId);
        if (group && group.activeTabId) {
          store.closeFile(group.id, group.activeTabId);
        }
      }
    },
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.reopenClosedEditor', requiresWorkspace: true,
    title: 'Reopen Closed Editor',
    category: 'View',
    handler: () => {
      useEditorLayoutStore.getState().restoreClosedTab();
    },
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.nextEditor', requiresWorkspace: true,
    title: 'Open Next Editor',
    category: 'View',
    handler: () => {
      const store = useEditorLayoutStore.getState();
      if (store.activeGroupId) {
        store.navigateMru(store.activeGroupId, 'next');
      }
    },
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.previousEditor', requiresWorkspace: true,
    title: 'Open Previous Editor',
    category: 'View',
    handler: () => {
      const store = useEditorLayoutStore.getState();
      if (store.activeGroupId) {
        store.navigateMru(store.activeGroupId, 'prev');
      }
    },
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.nextEditorInGroup', requiresWorkspace: true,
    title: 'Open Next Editor in Group',
    category: 'View',
    handler: () => {
      const store = useEditorLayoutStore.getState();
      if (store.activeGroupId) {
        store.navigateTabs(store.activeGroupId, 'next');
      }
    },
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.previousEditorInGroup', requiresWorkspace: true,
    title: 'Open Previous Editor in Group',
    category: 'View',
    handler: () => {
      const store = useEditorLayoutStore.getState();
      if (store.activeGroupId) {
        store.navigateTabs(store.activeGroupId, 'prev');
      }
    },
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.newWindow',
    title: 'New Window',
    category: 'File',
    handler: () => {
      if ((window as any).agApi) {
        (window as any).agApi.window.create();
      }
    }
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.files.openFile',
    title: 'Open File...',
    category: 'File',
    handler: async () => {
      if ((window as any).agApi) {
        const rawResult = await (window as any).agApi.workspace.openFile();
        const result = unwrapIpcResponse<{ path: string, name: string, type: string }>(rawResult);
        if (result && result.path) {
          const metadata: any = {
            id: result.path,
            name: result.name,
            uri: 'file:///' + result.path.split('\\').join('/'),
            provider: 'electron',
            lastOpened: Date.now(),
            type: result.type || 'file',
            capabilities: {
              explorer: true, // File workspace has explorer for the single file
              recursiveSearch: false,
              git: true, // File git capability
              terminal: true,
              multipleRoots: false,
              writable: true,
            }
          };
          await WorkspaceManager.openWorkspace(metadata, { nativeHandle: null });

          // Ensure the editor opens it immediately
          useEditorLayoutStore.getState().openFile({
            path: result.path,
            title: result.name,
            language: 'plaintext', // Later inferred
            dirty: false,
            pinned: false,
            isPreview: false
          });
        }
      }
    }
  });


  // --- REAL IMPLEMENTATIONS OF WORKBENCH COMMANDS ---

  const registerAction = (id: string, title: string, handler: (...args: any[]) => void, passedEnablement?: string) => {
    let enablement = passedEnablement;
    const workspaceCommands = ["workbench.action.compareEditor", "workbench.action.files.reloadWorkspace", "workbench.action.files.refreshExplorer", "workbench.action.toggleSidebarVisibility", "workbench.action.togglePanel", "workbench.action.toggleSecondarySidebarVisibility", "workbench.action.showCommands", "workbench.action.quickOpen", "workbench.action.findInFiles", "workbench.action.showSearch", "workbench.action.showExplorer", "workbench.action.gotoSymbol", "workbench.action.gotoLine", "workbench.action.terminal.toggleTerminal", "workbench.action.terminal.new", "workbench.action.terminal.split", "workbench.action.terminal.clear", "workbench.action.closeActiveEditor", "workbench.action.reopenClosedEditor", "workbench.action.nextEditor", "workbench.action.previousEditor", "workbench.action.nextEditorInGroup", "workbench.action.previousEditorInGroup", "workbench.action.files.newTextFile", "workbench.action.files.newFile", "workbench.action.files.save", "workbench.action.files.saveAll", "workbench.action.closeEditor", "workbench.action.closeFolder", "workbench.action.edit.undo", "workbench.action.edit.redo", "workbench.action.edit.cut", "workbench.action.edit.copy", "workbench.action.edit.paste", "workbench.action.edit.find", "workbench.action.edit.replace", "workbench.action.edit.toggleLineComment", "workbench.action.edit.formatDocument", "workbench.action.selection.selectAll", "workbench.action.selection.expandSelection", "workbench.action.selection.shrinkSelection", "workbench.action.selection.copyLineUp", "workbench.action.selection.copyLineDown", "workbench.action.selection.moveLineUp", "workbench.action.selection.moveLineDown", "workbench.action.selection.duplicateSelection", "workbench.action.go.definition", "workbench.action.go.references", "workbench.action.go.back", "workbench.action.go.forward"];
    if (workspaceCommands.includes(id)) {
      enablement = 'workspaceIsOpen';
    }
    if (!CommandRegistry.getCommand(id)) {
      CommandRegistry.registerCommand({ id, title, handler, enablement });
    }
  };

  // --- FILE MENU ---
  registerAction('workbench.action.files.newTextFile', 'New Text File', async () => {
    const root = WorkspaceManager.getRoot();
    if (root) {
      const name = NamingUtility.generateUntitledName();
      const path = root.path + '/' + name;
      await WorkspaceManager.createFile(path);
      // Let the explorer tree handle creation and renaming
      const nodeId = WorkspaceManager.resolvePath(path);
      if (nodeId) {
        useWorkspaceTreeStore.getState().setCreateState(null);
        useWorkspaceTreeStore.getState().setFocusedNode(nodeId);
      }

      useEditorLayoutStore.getState().openFile({
        path,
        title: name,
        language: 'plaintext',
        dirty: false,
        pinned: false,
        isPreview: false
      });
    } else {
      const name = NamingUtility.generateUntitledName();
      useEditorLayoutStore.getState().openFile({
        path: name,
        title: name,
        language: 'plaintext',
        dirty: true,
        pinned: false,
        isPreview: false
      });
    }
  });

  registerAction('workbench.action.files.newFile', 'New File...', async () => {
    const root = WorkspaceManager.getRoot();
    const treeState = useWorkspaceTreeStore.getState();
    const focusedId = treeState.focusedNode;

    let parentPath = root ? root.path : '/';
    let parentNodeId = root ? root.id : null;

    if (focusedId) {
      const node = WorkspaceManager.getNode(focusedId);
      if (node) {
        if (node.type === 'directory') {
          parentPath = node.path;
          parentNodeId = node.id;
        } else {
          parentPath = WorkspaceManager.getNode(node.parentId!)?.path || parentPath;
          parentNodeId = node.parentId || parentNodeId;
        }
      }
    }

    treeState.setCreateState({ parentId: parentNodeId, type: 'file' });
  });



  // openWorkspace is disabled via when: false in WorkbenchContributions

  CommandRegistry.registerCommand({
    id: 'workbench.action.files.save',
    title: 'Save',
    requiresEditor: true,
    handler: () => {
      const state = useEditorLayoutStore.getState();
      if (state.activeGroupId) {
        const group = state.groups.find(g => g.id === state.activeGroupId);
        if (group && group.activeTabId) {
          const tab = group.tabs.find(t => t.id === group.activeTabId);
          if (tab) {
            const nodeId = WorkspaceManager.resolvePath(tab.path);
            if (nodeId) WorkspaceManager.contentManager.saveFile(nodeId);
          }
        }
      }
    }
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.files.saveAll',
    title: 'Save All',
    requiresWorkspace: true,
    handler: () => {
      WorkspaceManager.contentManager.saveAll();
    }
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.closeEditor',
    title: 'Close Editor',
    requiresEditor: true,
    handler: () => {
      const state = useEditorLayoutStore.getState();
      if (state.activeGroupId) {
        const group = state.groups.find(g => g.id === state.activeGroupId);
        if (group && group.activeTabId) {
          state.closeFile(group.id, group.activeTabId);
        }
      }
    }
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.closeFolder',
    title: 'Close Folder',
    requiresWorkspace: true,
    handler: () => {
      WorkspaceManager.closeWorkspace();
      useWorkspaceTreeStore.getState().setTree([]);
      useWorkspaceTreeStore.getState().setFocusedNode(null);
    }
  });

  CommandRegistry.registerCommand({
    id: 'workbench.action.closeWindow',
    title: 'Close Window',
    handler: () => {
      if ((window as any).agApi && (window as any).agApi.window && (window as any).agApi.window.close) {
        (window as any).agApi.window.close();
      } else {
        window.close();
      }
    }
  });

  registerAction('workbench.action.quit', 'Exit', () => {
    if ((window as any).agApi) {
      (window as any).agApi.app.quit();
    }
  });

  // --- EDIT MENU ---
  registerAction('workbench.action.files.save', 'Save', async () => {
    const editorStore = useEditorLayoutStore.getState();
    const activeGroup = editorStore.groups.find(g => g.id === editorStore.activeGroupId);
    if (!activeGroup || !activeGroup.activeTabId) return;

    const activeTab = activeGroup.tabs.find(t => t.id === activeGroup.activeTabId);
    if (!activeTab) return;

    const nodeId = WorkspaceManager.resolvePath(activeTab.path);
    if (nodeId) {
      await WorkspaceManager.contentManager.saveFile(nodeId);
      editorStore.updateTabDirtyState(activeGroup.id, activeTab.id, false);
    }
  });

  registerAction('workbench.action.files.saveAll', 'Save All', async () => {
    await WorkspaceManager.contentManager.saveAll();
    const editorStore = useEditorLayoutStore.getState();
    editorStore.groups.forEach(g => {
      g.tabs.forEach(t => {
        if (t.dirty) {
          editorStore.updateTabDirtyState(g.id, t.id, false);
        }
      });
    });
  });



  CommandRegistry.registerCommand({
    id: 'workbench.action.edit.undo',
    title: 'Undo',
    enablement: 'canUndo',
    handler: async (ctx) => EditorCommandService.undo(ctx)
  });
  CommandRegistry.registerCommand({
    id: 'workbench.action.edit.redo',
    title: 'Redo',
    enablement: 'canRedo',
    handler: async (ctx) => EditorCommandService.redo(ctx)
  });
  CommandRegistry.registerCommand({
    id: 'workbench.action.edit.cut',
    title: 'Cut',
    enablement: 'editorHasSelection && editorWritable',
    handler: async (ctx) => EditorCommandService.cut(ctx)
  });
  CommandRegistry.registerCommand({
    id: 'workbench.action.edit.copy',
    title: 'Copy',
    enablement: 'editorHasSelection',
    handler: async (ctx) => EditorCommandService.copy(ctx)
  });
  CommandRegistry.registerCommand({
    id: 'workbench.action.edit.paste',
    title: 'Paste',
    enablement: 'editorWritable',
    handler: async (ctx) => EditorCommandService.paste(ctx)
  });
  CommandRegistry.registerCommand({
    id: 'workbench.action.edit.delete',
    title: 'Delete',
    enablement: 'editorWritable',
    handler: async (ctx) => EditorCommandService.delete(ctx)
  });
  CommandRegistry.registerCommand({
    id: 'workbench.action.edit.find',
    title: 'Find',
    enablement: 'activeEditorExists',
    handler: async (ctx) => EditorCommandService.find(ctx)
  });
  CommandRegistry.registerCommand({
    id: 'workbench.action.edit.replace',
    title: 'Replace',
    enablement: 'editorWritable',
    handler: async (ctx) => EditorCommandService.replace(ctx)
  });
  CommandRegistry.registerCommand({
    id: 'workbench.action.edit.toggleLineComment',
    title: 'Toggle Line Comment',
    enablement: 'editorWritable',
    handler: async (ctx) => EditorCommandService.toggleLineComment(ctx)
  });
  CommandRegistry.registerCommand({
    id: 'workbench.action.edit.toggleBlockComment',
    title: 'Toggle Block Comment',
    enablement: 'editorWritable && languageSupportsBlockComments',
    handler: async (ctx) => EditorCommandService.toggleBlockComment(ctx)
  });
  CommandRegistry.registerCommand({
    id: 'workbench.action.edit.formatDocument',
    title: 'Format Document',
    enablement: 'editorWritable && formatterAvailable',
    handler: async (ctx) => EditorCommandService.formatDocument(ctx)
  });
  CommandRegistry.registerCommand({
    id: 'workbench.action.edit.formatSelection',
    title: 'Format Selection',
    enablement: 'editorWritable && formatterAvailable && editorHasSelection',
    handler: async (ctx) => EditorCommandService.formatSelection(ctx)
  });

  // --- SELECTION MENU ---
  CommandRegistry.registerCommand({
    id: 'workbench.action.selection.selectAll',
    title: 'Select All',
    enablement: 'activeEditorExists || explorerFocused',
    handler: async (ctx) => {
      // Keep explorer integration if needed, but route editor logic properly
      const explorerFocused = ContextEngine.getContext('explorerFocused');
      if (explorerFocused) {
        import('../stores/ide/workspaceTreeStore').then(({ useWorkspaceTreeStore }) => {
          const store = useWorkspaceTreeStore.getState();
          const flatten = (nodes: any[]): string[] => {
            let ids: string[] = [];
            for (const node of nodes) {
              ids.push(node.id);
              if (node.children) ids = ids.concat(flatten(node.children));
            }
            return ids;
          };
          store.setSelection(flatten(store.tree));
        });
      } else {
        await EditorCommandService.selectAll(ctx);
      }
    }
  });

  // selection commands omitted for brevity - they belong in Selection menu, but we can register them quickly
  const selectionCommands = [
    { id: 'workbench.action.selection.expandSelection', action: 'editor.action.smartSelect.expand' },
    { id: 'workbench.action.selection.shrinkSelection', action: 'editor.action.smartSelect.shrink' },
    { id: 'workbench.action.selection.copyLineUp', action: 'editor.action.copyLinesUpAction' },
    { id: 'workbench.action.selection.copyLineDown', action: 'editor.action.copyLinesDownAction' },
    { id: 'workbench.action.selection.moveLineUp', action: 'editor.action.moveLinesUpAction' },
    { id: 'workbench.action.selection.moveLineDown', action: 'editor.action.moveLinesDownAction' },
    { id: 'workbench.action.selection.duplicateSelection', action: 'editor.action.duplicateSelection' }
  ];

  for (const cmd of selectionCommands) {
    CommandRegistry.registerCommand({
      id: cmd.id,
      title: cmd.id,
      enablement: 'activeEditorExists',
      handler: async () => {
        const { EditorManager } = await import('../services/editor/EditorManager');
        EditorManager.getActiveEditor()?.trigger('keyboard', cmd.action, null);
      }
    });
  }

  registerAction('workbench.action.go.definition', 'Go to Definition', () => {
    EditorManager.getActiveEditor()?.trigger('menu', 'editor.action.revealDefinition', null);
  });
  registerAction('workbench.action.go.references', 'Go to References', () => {
    EditorManager.getActiveEditor()?.trigger('menu', 'editor.action.referenceSearch.trigger', null);
  });

  // --- TERMINAL MENU ---
  registerAction('workbench.action.terminal.new', 'New Terminal', async () => {
    const { TerminalUIHelper } = await import('../components/ide/terminal/TerminalUIHelper');
    const state = useTerminalStore.getState();
    const groupId = state.activeGroupId;
    if (groupId) {
      await TerminalUIHelper.createTerminal(groupId);
    } else {
      const defaultGroup = {
        id: `group_${Date.now()}`,
        tabs: [],
        activeTabId: null
      };
      state.addGroup(defaultGroup);
      await TerminalUIHelper.createTerminal(defaultGroup.id);
    }
  });

  registerAction('workbench.action.terminal.split', 'Split Terminal', async () => {
    const { TerminalUIHelper } = await import('../components/ide/terminal/TerminalUIHelper');
    const state = useTerminalStore.getState();
    if (state.activeGroupId) {
      await TerminalUIHelper.splitTerminal(state.activeGroupId);
    }
  });

  registerAction('workbench.action.terminal.kill', 'Kill Terminal', () => {
    const state = useTerminalStore.getState();
    if (state.activeGroupId) {
      const group = state.groups.find(g => g.id === state.activeGroupId);
      if (group && group.activeTabId) {
        TerminalManager.destroyTerminal(group.activeTabId);
        state.removeTab(group.id, group.activeTabId);
      }
    }
  });

  registerAction('workbench.action.terminal.clear', 'Clear Terminal', () => {
    const state = useTerminalStore.getState();
    if (state.activeGroupId) {
      const group = state.groups.find(g => g.id === state.activeGroupId);
      if (group && group.activeTabId) {
        const session = TerminalManager.getRegistry().getSession(group.activeTabId);
        if (session) {
          session.write('\x1b[2J\x1b[3J\x1b[H');
        }
      }
    }
  });

  registerAction('workbench.action.terminal.focus', 'Focus Terminal', () => {
    const state = useTerminalStore.getState();
    if (state.activeGroupId) {
      const group = state.groups.find(g => g.id === state.activeGroupId);
      if (group && group.activeTabId) {
        TerminalManager.getRegistry().getSession(group.activeTabId)?.focus();
      }
    }
  });

}
