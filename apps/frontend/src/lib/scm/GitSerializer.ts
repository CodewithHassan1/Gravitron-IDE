import { GitCommit, GitBranch, GitStatusEntry } from './GitModels';

export class GitSerializer {
  static serializeCommits(commits: GitCommit[]): string {
    return JSON.stringify(commits);
  }

  static deserializeCommits(data: string): GitCommit[] {
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  static serializeStatus(status: GitStatusEntry[]): string {
    return JSON.stringify(status);
  }

  static deserializeStatus(data: string): GitStatusEntry[] {
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  static serializeBranches(branches: GitBranch[]): string {
    return JSON.stringify(branches);
  }

  static deserializeBranches(data: string): GitBranch[] {
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  }
}
