export interface GitStatusEntry {
  path: string;
  status: 'clean' | 'modified' | 'added' | 'deleted' | 'untracked' | 'ignored' | 'conflict';
}

export interface GitCommit {
  oid: string;
  message: string;
  parent: string[];
  author: {
    name: string;
    email: string;
    timestamp: number;
    timezoneOffset: number;
  };
}

export interface GitBranch {
  name: string;
  isRemote: boolean;
}

export interface GitRemote {
  name: string;
  url: string;
}

export interface GitChange {
  path: string;
  originalPath?: string;
  status: GitStatusEntry['status'];
}

export interface GitConflict {
  path: string;
  ours: string;
  theirs: string;
  base: string;
}

export interface GitTag {
  name: string;
  oid: string;
}

export interface GitStash {
  index: number;
  message: string;
}

export interface GitRepository {
  workspaceId: string;
  rootPath: string;
  head: string | null;
  detached: boolean;
}
