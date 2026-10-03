// src/services/workspace/search/SearchIndex.ts

import { SearchQuery } from './SearchQuery';
import { SearchResult, IndexNodePayload } from './SearchTypes';

interface MatchResult {
  isMatch: boolean;
  matches: [number, number][];
}

export class SearchIndex {
  // O(1) Lookup structures
  private filenameIndex = new Map<string, Set<string>>();
  private extensionIndex = new Map<string, Set<string>>();
  private pathIndex = new Map<string, string>();
  private nodeIndex = new Map<string, SearchResult>();
  
  public addNode(payload: IndexNodePayload): void {
    const { nodeId, path, name, type, extension } = payload;
    
    // Store full node representation for results
    this.nodeIndex.set(nodeId, {
      nodeId,
      path,
      name,
      type: type === 'directory' ? 'folder' : type,
      score: 0 // Default, will be calculated on search
    });

    this.pathIndex.set(nodeId, path);

    // Filename index (lowercase)
    const lowerName = name.toLowerCase();
    if (!this.filenameIndex.has(lowerName)) {
      this.filenameIndex.set(lowerName, new Set());
    }
    this.filenameIndex.get(lowerName)!.add(nodeId);

    // Extension index
    if (extension) {
      const lowerExt = extension.toLowerCase();
      if (!this.extensionIndex.has(lowerExt)) {
        this.extensionIndex.set(lowerExt, new Set());
      }
      this.extensionIndex.get(lowerExt)!.add(nodeId);
    }
  }

  public removeNode(nodeId: string): void {
    const node = this.nodeIndex.get(nodeId);
    if (!node) return;

    this.nodeIndex.delete(nodeId);
    this.pathIndex.delete(nodeId);

    const lowerName = node.name.toLowerCase();
    if (this.filenameIndex.has(lowerName)) {
      const set = this.filenameIndex.get(lowerName)!;
      set.delete(nodeId);
      if (set.size === 0) this.filenameIndex.delete(lowerName);
    }

    // Extensions aren't stored strictly in nodeIndex in my format but we can derive from name
    const parts = node.name.split('.');
    if (parts.length > 1 && node.type === 'file') {
      const extension = parts.pop()!.toLowerCase();
      if (this.extensionIndex.has(extension)) {
        const set = this.extensionIndex.get(extension)!;
        set.delete(nodeId);
        if (set.size === 0) this.extensionIndex.delete(extension);
      }
    }
  }

  public clear(): void {
    this.filenameIndex.clear();
    this.extensionIndex.clear();
    this.pathIndex.clear();
    this.nodeIndex.clear();
  }

  public search(query: SearchQuery): SearchResult[] {
    const results: SearchResult[] = [];
    const lowerQuery = this.normalizeQuery(query.query);

    const nodeArray = Array.from(this.nodeIndex.values());
    for (const node of nodeArray) {
      // 1. Filtering (Extensions)
      if (query.fileTypes && query.fileTypes.length > 0 && node.type === 'file') {
        const parts = node.name.split('.');
        const ext = parts.length > 1 ? parts.pop()!.toLowerCase() : '';
        if (!query.fileTypes.map(e => e.toLowerCase()).includes(ext)) {
          continue;
        }
      }

      // 2. Ignore hidden if needed
      if (!query.includeHidden && node.name.startsWith('.')) {
        continue;
      }

      // 3. Matching
      const matchResult = this.matchFuzzy(lowerQuery, node.path);
      if (!matchResult.isMatch) continue;

      // 4. Ranking
      const score = this.rank(query.query, matchResult, {
        filename: node.name,
        path: node.path
      });

      results.push({
        ...node,
        score
      });
    }

    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);

    // Limit results
    return results.slice(0, query.maxResults || 100);
  }

  private normalizeQuery(query: string): string {
    return query.replace(/\s+/g, '').toLowerCase();
  }

  private matchFuzzy(lowerQuery: string, text: string): MatchResult {
    if (!lowerQuery) return { isMatch: true, matches: [] };
    
    const lowerText = text.toLowerCase();
    let queryIndex = 0;
    const matches: [number, number][] = [];
    let currentMatchStart = -1;

    for (let textIndex = 0; textIndex < lowerText.length; textIndex++) {
      if (lowerText[textIndex] === lowerQuery[queryIndex]) {
        if (currentMatchStart === -1) {
          currentMatchStart = textIndex;
        }
        queryIndex++;
        if (queryIndex === lowerQuery.length) {
          matches.push([currentMatchStart, textIndex + 1]);
          return { isMatch: true, matches };
        }
      } else {
        if (currentMatchStart !== -1) {
          matches.push([currentMatchStart, textIndex]);
          currentMatchStart = -1;
        }
      }
    }

    return { isMatch: false, matches: [] };
  }

  private rank(queryText: string, matchResult: MatchResult, context: { filename: string, path: string }): number {
    if (!matchResult.isMatch) return 0;
    if (!queryText) return 1;

    let score = 0;
    const lowerQuery = queryText.toLowerCase();
    const lowerFilename = context.filename.toLowerCase();
    const lowerPath = context.path.toLowerCase();

    // Exact matches
    if (lowerFilename === lowerQuery) score += 1000;
    else if (lowerFilename.startsWith(lowerQuery)) score += 500;
    else if (lowerFilename.includes(lowerQuery)) score += 200;
    else if (lowerPath.includes(lowerQuery)) score += 50;

    let contiguousChars = 0;
    for (const [start, end] of matchResult.matches) {
      const length = end - start;
      contiguousChars += length;
      score += (length * length) * 5; 
    }

    const filenameStartIndex = context.path.length - context.filename.length;
    const matchInFilename = matchResult.matches.some(([start, end]) => end > filenameStartIndex);
    if (matchInFilename) {
      score += 100;
    }

    const spread = matchResult.matches.length;
    if (spread > 1 && queryText.length <= 5) {
      score += 50; 
    }

    return score;
  }
}
