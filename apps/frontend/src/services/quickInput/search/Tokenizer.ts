// src/services/quickInput/search/Tokenizer.ts
export class Tokenizer {
  static tokenize(query: string): string[] {
    if (!query) return [];
    
    // Normalize string: lowercase, replace punctuation with spaces
    const normalized = query.toLowerCase().replace(/[-_.,/\\]/g, ' ');
    
    // Split by whitespace and remove empty tokens
    const tokens = normalized.split(/\s+/).filter(t => t.length > 0);
    
    // Attempt camelCase splitting for symbols or paths
    const camelSplitTokens: string[] = [];
    for (const token of tokens) {
      camelSplitTokens.push(token);
      // We already lowercased, so camelCase splitting on the original is needed if we want to retain it.
      // For now, simple tokenization is sufficient since scoring will handle substring matching.
    }
    
    return tokens;
  }

  static getAcronym(query: string): string {
    const tokens = this.tokenize(query);
    return tokens.map(t => t[0]).join('');
  }
}
