import { Normalizer } from './Normalizer';
import { Scorer } from './Scorer';

export interface MatchResult {
  matched: boolean;
  score: number;
  indices: number[]; // Character indices that matched
}

export class Matcher {
  static fuzzyMatch(query: string, target: string): MatchResult {
    if (!query) return { matched: true, score: 0, indices: [] };

    const normQuery = Normalizer.normalize(query);
    const normTarget = Normalizer.normalize(target);

    // 1. Exact match
    if (normTarget === normQuery) {
      return { matched: true, score: Scorer.EXACT_MATCH, indices: this.getRange(0, query.length) };
    }

    // 2. Prefix match
    if (normTarget.startsWith(normQuery)) {
      return { matched: true, score: Scorer.PREFIX_MATCH, indices: this.getRange(0, query.length) };
    }

    // 3. Substring match
    const subIdx = normTarget.indexOf(normQuery);
    if (subIdx !== -1) {
      return { matched: true, score: Scorer.SUBSTRING_MATCH, indices: this.getRange(subIdx, subIdx + query.length) };
    }

    // 4. Sequence/Fuzzy match
    let qIdx = 0;
    let tIdx = 0;
    const indices: number[] = [];
    let gaps = 0;
    let lastMatchIdx = -1;

    while (qIdx < normQuery.length && tIdx < normTarget.length) {
      if (normQuery[qIdx] === normTarget[tIdx]) {
        indices.push(tIdx);
        if (lastMatchIdx !== -1 && tIdx > lastMatchIdx + 1) {
          gaps += (tIdx - lastMatchIdx - 1);
        }
        lastMatchIdx = tIdx;
        qIdx++;
      }
      tIdx++;
    }

    if (qIdx === normQuery.length) {
      const score = Scorer.FUZZY_MATCH_BASE + Scorer.calculateGapPenalty(gaps);
      return { matched: true, score, indices };
    }

    // 5. Acronym match (fallback)
    const acronym = Normalizer.getAcronym(target);
    if (acronym.startsWith(normQuery)) {
      return { matched: true, score: Scorer.CAMEL_CASE_MATCH, indices: [] }; // difficult to map exact indices for acronyms simply
    }

    return { matched: false, score: 0, indices: [] };
  }

  private static getRange(start: number, end: number): number[] {
    const range = [];
    for (let i = start; i < end; i++) range.push(i);
    return range;
  }
}
