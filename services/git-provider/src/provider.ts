export interface RepositoryMetadata {
  id: string;
  name: string;
  fullName: string;
  private: boolean;
  cloneUrl: string;
  defaultBranch: string;
}

export interface GitProvider {
  /** Retrieves all repositories accessible by the user */
  listRepositories(userId: string): Promise<RepositoryMetadata[]>;
  
  /** Retrieves metadata for a single repository */
  getRepositoryMetadata(repoId: string): Promise<RepositoryMetadata>;
  
  /** Creates a deploy key for a repository to allow sandboxes to pull code */
  createDeployKey(repoId: string, publicKey: string, title?: string): Promise<void>;
  
  /** Registers a webhook for synchronization events */
  registerWebhook(repoId: string, events: string[], callbackUrl: string): Promise<void>;

  /** Repository Operations Proxy */
  clone(repoId: string, branch: string, targetDir: string): Promise<void>;
  pull(repoId: string, branch: string): Promise<void>;
  push(repoId: string, branch: string): Promise<void>;
  getBranches(repoId: string): Promise<string[]>;
  getTags(repoId: string): Promise<string[]>;
}

export abstract class BaseGitProvider implements GitProvider {
  abstract listRepositories(userId: string): Promise<RepositoryMetadata[]>;
  abstract getRepositoryMetadata(repoId: string): Promise<RepositoryMetadata>;
  abstract createDeployKey(repoId: string, publicKey: string, title?: string): Promise<void>;
  abstract registerWebhook(repoId: string, events: string[], callbackUrl: string): Promise<void>;
  abstract clone(repoId: string, branch: string, targetDir: string): Promise<void>;
  abstract pull(repoId: string, branch: string): Promise<void>;
  abstract push(repoId: string, branch: string): Promise<void>;
  abstract getBranches(repoId: string): Promise<string[]>;
  abstract getTags(repoId: string): Promise<string[]>;
}
