import { IGitProvider } from './GitProvider';
import { GitStatusEntry, GitCommit, GitBranch } from '../../lib/scm/GitModels';

export class MockGitProvider implements IGitProvider {
  async init(workspaceId: string): Promise<void> {}
  
  async discoverRepository(workspaceId: string): Promise<boolean> {
    return true; // Pretend it's a repo
  }

  async status(workspaceId: string): Promise<GitStatusEntry[]> {
    return [
      { path: 'src/index.ts', status: 'modified' },
      { path: 'package.json', status: 'modified' },
      { path: 'newFile.txt', status: 'untracked' }
    ];
  }

  async stage(workspaceId: string, paths: string[]): Promise<void> {}
  async unstage(workspaceId: string, paths: string[]): Promise<void> {}
  async commit(workspaceId: string, message: string): Promise<string> {
    return 'mock-commit-hash';
  }
  
  async checkout(workspaceId: string, ref: string): Promise<void> {}
  
  async branch(workspaceId: string, action: 'list' | 'create' | 'delete', name?: string): Promise<GitBranch[] | void> {
    if (action === 'list') {
      return [{ name: 'main', isRemote: false }, { name: 'feature/test', isRemote: false }];
    }
  }

  async fetch(workspaceId: string, remote?: string): Promise<void> {}
  async pull(workspaceId: string, remote?: string, branch?: string): Promise<void> {}
  async push(workspaceId: string, remote?: string, branch?: string): Promise<void> {}
  async stash(workspaceId: string, action: 'save' | 'pop' | 'list', message?: string): Promise<any> {}
  async merge(workspaceId: string, ref: string): Promise<void> {}
  async rebase(workspaceId: string, ref: string): Promise<void> {}
  
  async diff(workspaceId: string, path?: string): Promise<string> {
    return `--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
+console.log('mock diff');`;
  }
  
  async history(workspaceId: string, limit?: number, filepath?: string): Promise<GitCommit[]> {
    return [
      {
        oid: 'mock-commit-hash',
        message: 'Initial commit',
        parent: [],
        author: { name: 'Mock User', email: 'mock@example.com', timestamp: Date.now(), timezoneOffset: 0 }
      }
    ];
  }

  async blame(workspaceId: string, path: string): Promise<any> {}
}
