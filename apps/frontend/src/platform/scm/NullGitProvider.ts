import { IGitProvider } from './GitProvider';
import { GitStatusEntry, GitCommit, GitBranch } from '../../lib/scm/GitModels';

export class NullGitProvider implements IGitProvider {
  async init(workspaceId: string): Promise<void> {}
  async discoverRepository(workspaceId: string): Promise<boolean> { return false; }
  async status(workspaceId: string): Promise<GitStatusEntry[]> { return []; }
  async stage(workspaceId: string, paths: string[]): Promise<void> {}
  async unstage(workspaceId: string, paths: string[]): Promise<void> {}
  async commit(workspaceId: string, message: string): Promise<string> { return ''; }
  async checkout(workspaceId: string, ref: string): Promise<void> {}
  async branch(workspaceId: string, action: 'list' | 'create' | 'delete', name?: string): Promise<GitBranch[] | void> {
    if (action === 'list') return [];
  }
  async fetch(workspaceId: string, remote?: string): Promise<void> {}
  async pull(workspaceId: string, remote?: string, branch?: string): Promise<void> {}
  async push(workspaceId: string, remote?: string, branch?: string): Promise<void> {}
  async stash(workspaceId: string, action: 'save' | 'pop' | 'list', message?: string): Promise<any> {
    if (action === 'list') return [];
  }
  async merge(workspaceId: string, ref: string): Promise<void> {}
  async rebase(workspaceId: string, ref: string): Promise<void> {}
  async diff(workspaceId: string, path?: string): Promise<string> { return ''; }
  async history(workspaceId: string, limit?: number, filepath?: string): Promise<GitCommit[]> { return []; }
  async blame(workspaceId: string, path: string): Promise<any> { return []; }
}
