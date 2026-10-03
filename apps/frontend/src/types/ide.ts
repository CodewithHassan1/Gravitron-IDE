export interface EditorTab {
  id: string;
  path: string;
  title: string;
  language: string;
  dirty: boolean;
  icon?: string;
  pinned: boolean;
  isPreview: boolean;
}

export type WorkspaceNodeType = 'file' | 'directory';

export interface WorkspaceNode {
  id: string;
  parentId?: string;
  workspaceId: string;
  name: string;
  path: string;
  type: WorkspaceNodeType;
  createdAt?: string;
  updatedAt?: string;
  gitStatus?: 'clean' | 'modified' | 'added' | 'deleted' | 'untracked' | 'ignored';
  diagnosticCount?: number;
  symbolCount?: number;
  metadata?: Record<string, any>;
  children?: WorkspaceNode[];
  expanded?: boolean;
}

export interface StatusBarData {
  git: {
    branch: string;
    status: 'clean' | 'dirty' | 'syncing';
    changes: number;
  };
  workspace: {
    name: string;
    status: 'ready' | 'loading' | 'error';
  };
  connection: {
    status: 'connected' | 'disconnected' | 'reconnecting';
    latency?: number;
  };
  ai: {
    status: 'ready' | 'generating' | 'error';
    provider: string;
  };
  editor: {
    language: string;
    encoding: string;
    line: number;
    column: number;
  };
  notifications: {
    count: number;
    hasUnread: boolean;
  };
}

export interface Command {
  id: string;
  title: string;
  category?: string;
  shortcut?: string;
  execute: () => void | Promise<void>;
}

export interface FileEditOperation {
  fileId: string;
  before: string;
  after: string;
  timestamp: number;
}
