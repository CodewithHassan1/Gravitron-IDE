import { IgnoreMatcher } from '../repository/IgnoreMatcher';

export class GitIgnoreEngine {
  private matcher: IgnoreMatcher;

  constructor() {
    this.matcher = new IgnoreMatcher();
  }

  public parseGitignore(content: string) {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    // We would parse and add these patterns to IgnoreMatcher.
    // For now, this serves as the bridge between SCM and Phase 4 Ignore Engine.
  }

  public isIgnored(path: string): boolean {
    return this.matcher.isIgnored(path, false);
  }
}
