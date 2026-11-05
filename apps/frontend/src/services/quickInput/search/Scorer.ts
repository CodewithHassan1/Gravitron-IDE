// src/services/quickInput/search/Scorer.ts
import { Tokenizer } from './Tokenizer';

export class Scorer {
  static scoreExactMatch(query: string, target: string): number {
    return query.toLowerCase() === target.toLowerCase() ? 100 : 0;
  }

  static scorePrefixMatch(query: string, target: string): number {
    return target.toLowerCase().startsWith(query.toLowerCase()) ? 80 : 0;
  }

  static scoreAcronymMatch(query: string, target: string): number {
    const acronym = Tokenizer.getAcronym(target);
    if (query.length > 1 && acronym.startsWith(query.toLowerCase())) {
      return 70;
    }
    return 0;
  }

  static scoreSubstringMatch(query: string, target: string): number {
    const queryLower = query.toLowerCase();
    const targetLower = target.toLowerCase();

    if (targetLower.includes(queryLower)) {
      // Shorter targets score higher for the same substring match
      const lengthPenalty = Math.max(0, target.length - query.length) * 0.5;
      return Math.max(10, 60 - lengthPenalty);
    }
    return 0;
  }

  static scoreFuzzy(query: string, target: string): number {
    const queryLower = query.toLowerCase();
    const targetLower = target.toLowerCase();

    let queryIdx = 0;
    let targetIdx = 0;
    let matches = 0;

    while (queryIdx < queryLower.length && targetIdx < targetLower.length) {
      if (queryLower[queryIdx] === targetLower[targetIdx]) {
        matches++;
        queryIdx++;
      }
      targetIdx++;
    }

    if (matches === queryLower.length) {
      // All characters found in order, but with gaps
      const spread = targetIdx - queryLower.length;
      return Math.max(5, 50 - spread);
    }

    return 0;
  }
}
