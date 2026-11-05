import { create } from 'zustand';
import { StatusBarData } from '../../types/ide';

interface StatusBarState {
  data: StatusBarData;
}

interface StatusBarActions {
  updateGit: (git: Partial<StatusBarData['git']>) => void;
  updateWorkspace: (workspace: Partial<StatusBarData['workspace']>) => void;
  updateConnection: (connection: Partial<StatusBarData['connection']>) => void;
  updateAI: (ai: Partial<StatusBarData['ai']>) => void;
  updateEditor: (editor: Partial<StatusBarData['editor']>) => void;
  updateNotifications: (notifications: Partial<StatusBarData['notifications']>) => void;
}

const defaultData: StatusBarData = {
  git: { branch: 'main', status: 'clean', changes: 0 },
  workspace: { name: 'Workspace', status: 'ready' },
  connection: { status: 'connected' },
  ai: { status: 'ready', provider: 'Gemini 3.1 Pro' },
  editor: { language: 'plaintext', encoding: 'UTF-8', line: 1, column: 1 },
  notifications: { count: 0, hasUnread: false },
};

export const useStatusBarStore = create<StatusBarState & StatusBarActions>((set) => ({
  data: defaultData,

  updateGit: (git) =>
    set((state) => ({ data: { ...state.data, git: { ...state.data.git, ...git } } })),
  updateWorkspace: (workspace) =>
    set((state) => ({
      data: { ...state.data, workspace: { ...state.data.workspace, ...workspace } },
    })),
  updateConnection: (connection) =>
    set((state) => ({
      data: { ...state.data, connection: { ...state.data.connection, ...connection } },
    })),
  updateAI: (ai) => set((state) => ({ data: { ...state.data, ai: { ...state.data.ai, ...ai } } })),
  updateEditor: (editor) =>
    set((state) => ({ data: { ...state.data, editor: { ...state.data.editor, ...editor } } })),
  updateNotifications: (notifications) =>
    set((state) => ({
      data: { ...state.data, notifications: { ...state.data.notifications, ...notifications } },
    })),
}));
