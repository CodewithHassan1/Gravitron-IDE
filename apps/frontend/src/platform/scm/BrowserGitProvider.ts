import * as git from 'isomorphic-git';
import { IGitProvider } from './GitProvider';
import { GitStatusEntry, GitCommit, GitBranch } from '../../lib/scm/GitModels';
import { BrowserFSAdapter } from './BrowserFSAdapter';
import { RepositoryRegistry } from '../../lib/registries/RepositoryRegistry';

export class BrowserGitProvider implements IGitProvider {
  private getFS(workspaceId: string) {
    const root = RepositoryRegistry.get(workspaceId);
    if (!root || !root.handle) throw new Error('Workspace handle not available');
    return new BrowserFSAdapter(root.handle).promises;
  }

  async init(workspaceId: string): Promise<void> {
    await git.init({ fs: this.getFS(workspaceId), dir: '/' });
  }

  async discoverRepository(workspaceId: string): Promise<boolean> {
    try {
      const fs = this.getFS(workspaceId);
      await fs.stat('/.git');
      return true;
    } catch {
      return false;
    }
  }

  async status(workspaceId: string): Promise<GitStatusEntry[]> {
    const fs = this.getFS(workspaceId);
    // Note: This is an expensive operation if done entirely recursively in browser FS.
    // isomorphic-git provides `statusMatrix` for detailed status.
    const matrix = await git.statusMatrix({ fs, dir: '/' });
    
    return matrix.map(row => {
      const [filepath, head, workdir, stage] = row;
      let status: GitStatusEntry['status'] = 'clean';
      if (head === 1 && workdir === 2 && stage === 1) status = 'modified';
      if (head === 0 && workdir === 2 && stage === 0) status = 'untracked';
      if (head === 1 && workdir === 0 && stage === 1) status = 'deleted';
      if (head === 0 && workdir === 2 && stage === 2) status = 'added'; // staged added
      if (head === 1 && workdir === 2 && stage === 2) status = 'modified'; // staged modified
      
      return { path: filepath, status };
    }).filter(e => e.status !== 'clean');
  }

  async stage(workspaceId: string, paths: string[]): Promise<void> {
    const fs = this.getFS(workspaceId);
    for (const path of paths) {
      await git.add({ fs, dir: '/', filepath: path });
    }
  }

  async unstage(workspaceId: string, paths: string[]): Promise<void> {
    const fs = this.getFS(workspaceId);
    for (const path of paths) {
      await git.resetIndex({ fs, dir: '/', filepath: path });
    }
  }

  async commit(workspaceId: string, message: string): Promise<string> {
    const fs = this.getFS(workspaceId);
    return await git.commit({
      fs,
      dir: '/',
      message,
      author: { name: 'Browser User', email: 'browser@example.com' }
    });
  }

  async checkout(workspaceId: string, ref: string): Promise<void> {
    const fs = this.getFS(workspaceId);
    await git.checkout({ fs, dir: '/', ref });
  }

  async branch(workspaceId: string, action: 'list' | 'create' | 'delete', name?: string): Promise<GitBranch[] | void> {
    const fs = this.getFS(workspaceId);
    if (action === 'list') {
      const branches = await git.listBranches({ fs, dir: '/' });
      return branches.map(b => ({ name: b, isRemote: false }));
    } else if (action === 'create' && name) {
      await git.branch({ fs, dir: '/', ref: name });
    } else if (action === 'delete' && name) {
      await git.deleteBranch({ fs, dir: '/', ref: name });
    }
  }

  async history(workspaceId: string, limit?: number, filepath?: string): Promise<GitCommit[]> {
    const fs = this.getFS(workspaceId);
    try {
      const commits = await git.log({ fs, dir: '/', depth: limit || 50, filepath });
      return commits.map(c => ({
        oid: c.oid,
        message: c.commit.message,
        parent: c.commit.parent,
        author: {
          name: c.commit.author.name,
          email: c.commit.author.email,
          timestamp: c.commit.author.timestamp,
          timezoneOffset: c.commit.author.timezoneOffset
        }
      }));
    } catch {
      return [];
    }
  }

  // Mocked out methods that are less crucial for local browser tests or require complex setups
  async fetch(workspaceId: string, remote?: string): Promise<void> { throw new Error('Not Supported Yet'); }
  async pull(workspaceId: string, remote?: string, branch?: string): Promise<void> { throw new Error('Not Supported Yet'); }
  async push(workspaceId: string, remote?: string, branch?: string): Promise<void> { throw new Error('Not Supported Yet'); }
  async stash(workspaceId: string, action: 'save' | 'pop' | 'list', message?: string): Promise<any> { throw new Error('Not Supported Yet'); }
  async merge(workspaceId: string, ref: string): Promise<void> { throw new Error('Not Supported Yet'); }
  async rebase(workspaceId: string, ref: string): Promise<void> { throw new Error('Not Supported Yet'); }
  async diff(workspaceId: string, path?: string): Promise<string> { throw new Error('Not Supported Yet'); }
  async blame(workspaceId: string, path: string): Promise<any> { throw new Error('Not Supported Yet'); }
}
