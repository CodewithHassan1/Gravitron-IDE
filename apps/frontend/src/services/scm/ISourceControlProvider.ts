export interface IGitChange {
  id: string;
  uri: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked';
  staged: boolean;
}

export interface IGitStatus {
  branch: string;
  changes: IGitChange[];
}

export interface IGitRepository {
  root: string;
  getStatus(): Promise<IGitStatus>;
  commit(message: string): Promise<void>;
  stage(changeId: string): Promise<void>;
  unstage(changeId: string): Promise<void>;
}

export interface ISourceControlProvider {
  id: string;
  name: string;
  getRepository(path: string): Promise<IGitRepository | null>;
}
