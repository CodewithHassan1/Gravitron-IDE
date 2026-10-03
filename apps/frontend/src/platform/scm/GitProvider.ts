import { GitStatusEntry, GitCommit, GitBranch } from '../../lib/scm/GitModels';

export interface IGitProvider {
  /**
   * Initializes a repository at the given workspace root.
   */
  init(workspaceId: string): Promise<void>;

  /**
   * Discovers if the given workspace root is a git repository.
   */
  discoverRepository(workspaceId: string): Promise<boolean>;

  /**
   * Retrieves the git status of the workspace.
   */
  status(workspaceId: string): Promise<GitStatusEntry[]>;

  /**
   * Stages files for commit. If paths is empty, stages all.
   */
  stage(workspaceId: string, paths: string[]): Promise<void>;

  /**
   * Unstages files. If paths is empty, unstages all.
   */
  unstage(workspaceId: string, paths: string[]): Promise<void>;

  /**
   * Commits staged changes.
   */
  commit(workspaceId: string, message: string): Promise<string>;

  /**
   * Checks out a branch or commit.
   */
  checkout(workspaceId: string, ref: string): Promise<void>;

  /**
   * Creates, lists, or deletes branches.
   */
  branch(workspaceId: string, action: 'list' | 'create' | 'delete', name?: string): Promise<GitBranch[] | void>;

  /**
   * Fetches from remote.
   */
  fetch(workspaceId: string, remote?: string): Promise<void>;

  /**
   * Pulls from remote.
   */
  pull(workspaceId: string, remote?: string, branch?: string): Promise<void>;

  /**
   * Pushes to remote.
   */
  push(workspaceId: string, remote?: string, branch?: string): Promise<void>;

  /**
   * Stashes changes.
   */
  stash(workspaceId: string, action: 'save' | 'pop' | 'list', message?: string): Promise<any>;

  /**
   * Merges a branch.
   */
  merge(workspaceId: string, ref: string): Promise<void>;

  /**
   * Rebases onto a branch.
   */
  rebase(workspaceId: string, ref: string): Promise<void>;

  /**
   * Retrieves diff for a specific file or the entire working tree.
   */
  diff(workspaceId: string, path?: string): Promise<string>;

  /**
   * Retrieves commit history.
   */
  history(workspaceId: string, limit?: number, filepath?: string): Promise<GitCommit[]>;

  /**
   * Blame a file.
   */
  blame(workspaceId: string, path: string): Promise<any>;
}
