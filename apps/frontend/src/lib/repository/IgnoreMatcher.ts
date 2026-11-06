export class IgnoreMatcher {
  private patterns: { regex: RegExp; isNegative: boolean }[] = [];

  constructor() {
    // Default internal exclusions
    this.addPattern('.git');
    this.addPattern('.next');
    this.addPattern('node_modules');
    // Hide standard IDE internals if needed
    // this.addPattern('.gravitron');
  }

  addPattern(pattern: string) {
    pattern = pattern.trim();
    if (!pattern || pattern.startsWith('#')) return;

    let isNegative = false;
    if (pattern.startsWith('!')) {
      isNegative = true;
      pattern = pattern.slice(1);
    }

    // Convert gitignore style to regex
    // 1. Escape special characters except * and ?
    let regexStr = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');

    // 2. Handle **
    regexStr = regexStr.replace(/\*\*/g, '.*');

    // 3. Handle *
    regexStr = regexStr.replace(/\*/g, '[^/]*');

    // 4. Handle ?
    regexStr = regexStr.replace(/\?/g, '[^/]');

    // 5. Match directory trailing slash
    if (regexStr.endsWith('/')) {
      regexStr = regexStr.slice(0, -1) + '(/.*)?$';
    } else {
      // If there's no slash in the pattern (except maybe at start), it can match anywhere
      if (
        !regexStr.includes('/') ||
        (regexStr.startsWith('/') && regexStr.lastIndexOf('/') === 0)
      ) {
        regexStr = '(^|/)' + regexStr + '(/.*)?$';
      } else {
        regexStr = '^' + regexStr + '(/.*)?$';
      }
    }

    if (regexStr.startsWith('^/')) {
      regexStr = '^' + regexStr.slice(2);
    }

    try {
      this.patterns.push({
        regex: new RegExp(regexStr),
        isNegative,
      });
    } catch (e) {
      console.warn('Invalid ignore pattern:', pattern);
    }
  }

  addPatterns(patterns: string[]) {
    for (const p of patterns) {
      this.addPattern(p);
    }
  }

  parseGitignore(content: string) {
    const lines = content.split('\n');
    this.addPatterns(lines);
  }

  /**
   * Evaluates if a given relative path is ignored.
   * Path should be relative to the workspace root, e.g., 'src/index.ts'.
   * When checking directories, you can pass isDirectory = true to short-circuit scanner traversal.
   */
  isIgnored(relativePath: string, isDirectory: boolean = false): boolean {
    if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
    if (isDirectory && !relativePath.endsWith('/')) relativePath += '/';

    let ignored = false;

    for (const { regex, isNegative } of this.patterns) {
      if (regex.test(relativePath)) {
        ignored = !isNegative;
      }
    }

    return ignored;
  }
}
