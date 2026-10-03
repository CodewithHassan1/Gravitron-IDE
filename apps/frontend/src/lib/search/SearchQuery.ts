export interface SearchQueryOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
}

export class SearchQuery {
  public pattern: RegExp | null = null;
  public raw: string;
  public options: SearchQueryOptions;

  constructor(raw: string, options: SearchQueryOptions = {}) {
    this.raw = raw;
    this.options = options;
    this.compile();
  }

  private compile() {
    if (!this.raw) {
      this.pattern = null;
      return;
    }

    try {
      let patternStr = this.raw;

      if (!this.options.useRegex) {
        // escape regex
        patternStr = patternStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }

      if (this.options.wholeWord) {
        patternStr = `\\b${patternStr}\\b`;
      }

      const flags = this.options.caseSensitive ? 'g' : 'gi';
      this.pattern = new RegExp(patternStr, flags);
    } catch (e) {
      this.pattern = null; // invalid regex
    }
  }

  test(text: string): boolean {
    if (!this.pattern) return false;
    this.pattern.lastIndex = 0;
    return this.pattern.test(text);
  }
}
